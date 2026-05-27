"""
Deepfake Detection Pipeline
============================
Implements the multi-face, geometry-aware deepfake detection pipeline from
deep-research-report.md. Designed to wrap the existing ViT model without
modifying its internals.

Components:
    1. Face Detection   — MTCNN (facenet-pytorch), keep_all=True, max 5 faces
    2. Face Cropping    — expand_box() with 20% margin
    3. Model Inference  — ViT wrapper (predict_model)
    4. Landmark Extract — MediaPipe FaceMesh (468 landmarks)
    5. Geometry Feats   — eye asymmetry, lip distance
    6. Score Fusion     — weighted sum (CNN 0.85, geom 0.15)
    7. Aggregation      — top-2 mean → final label + confidence
    8. JSON Output      — structured per-face + overall result

Usage:
    from pipeline import DeepfakePipeline

    pipeline = DeepfakePipeline(model, processor, device)
    result = pipeline.run(pil_image)   # -> dict with full structured output
"""

from __future__ import annotations

import os
import logging
import time
import math
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np
import torch
from PIL import Image

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration constants (all configurable at call time)
# ---------------------------------------------------------------------------
MAX_FACES = 5
FACE_MARGIN = 0.20       # 20% extra around detected bbox
W_CNN = 0.85             # Weight for CNN/ViT confidence
W_GEOM = 0.15            # Weight for geometry anomaly score
THRESH_DEEPFAKE = 0.70
THRESH_SUSPICIOUS = 0.50
MIN_FACE_AREA = 80 * 80  # Skip faces smaller than 80x80 px to reduce background artifacting

# MediaPipe landmark indices (Face Mesh 468-point model)
LEFT_EYE_CORNERS = (33, 133)
RIGHT_EYE_CORNERS = (362, 263)
UPPER_LIP_IDX = 13
LOWER_LIP_IDX = 14
NOSE_TIP_IDX = 4


# ---------------------------------------------------------------------------
# Pipeline class
# ---------------------------------------------------------------------------
class DeepfakePipeline:
    """
    Full deepfake detection pipeline.

    Must be initialised once (at server startup) with the loaded ViT model.
    MTCNN and FaceMesh are initialised lazily on first use and reused across calls.

    Optional freq_branch + fusion_head enable the fused inference path:
        predict_model() automatically selects between:
          - _predict_fused()        (when both are provided)
          - _predict_spatial_only() (legacy fallback when either is None)
    """

    def __init__(self, model, processor, device, freq_branch=None, fusion_head=None):
        self.model = model
        self.processor = processor
        self.device = device
        self.freq_branch = freq_branch
        self.fusion_head = fusion_head

        # Pre-compute label indices once from model config
        label2id = getattr(model.config, 'label2id', {})
        self.fake_idx = label2id.get("FAKE", 0)
        self.real_idx = label2id.get("REAL", 1)

        self._mtcnn = None       # lazy: facenet_pytorch.MTCNN
        self._face_mesh = None   # lazy: mediapipe FaceMesh
        self._face_detector = None  # lazy: mediapipe FaceDetector

    # ------------------------------------------------------------------ #
    # Lazy resource initialisation                                         #
    # ------------------------------------------------------------------ #

    def _get_mtcnn(self):
        if self._mtcnn is None:
            try:
                from facenet_pytorch import MTCNN  # type: ignore
                # Fix for "Cannot copy out of meta tensor" error:
                # Force initialization on CPU using a context manager to ensure 
                # weights are loaded into memory correctly.
                with torch.device('cpu'):
                    self._mtcnn = MTCNN(
                        keep_all=True,
                        device=torch.device('cpu'),
                        min_face_size=20,
                        thresholds=[0.6, 0.7, 0.7],
                        post_process=False,
                    )
                
                # Move to target device (e.g. CUDA) only after successful weight loading
                if self.device.type != 'cpu':
                    self._mtcnn.to(self.device)
                    
                logger.info("MTCNN initialised on %s", self.device)
            except Exception as e:
                logger.warning("MTCNN initialisation failed: %s. Face detection will be unavailable.", e)
                self._mtcnn = None
        return self._mtcnn

    def _get_face_mesh(self):
        if self._face_mesh is None:
            try:
                # Try multiple import styles for different mediapipe versions/environments
                try:
                    import mediapipe.python.solutions.face_mesh as mp_fm
                except ImportError:
                    try:
                        from mediapipe.solutions import face_mesh as mp_fm
                    except ImportError:
                        import mediapipe as mp
                        mp_fm = mp.solutions.face_mesh

                self._face_mesh = mp_fm.FaceMesh(
                    static_image_mode=True,
                    max_num_faces=1,
                    refine_landmarks=True,
                    min_detection_confidence=0.5
                )
                logger.info("MediaPipe FaceMesh initialised")
            except ImportError:
                logger.warning("mediapipe not installed — FaceMesh unavailable")
                self._face_mesh = None
        return self._face_mesh

    def _get_face_detector(self):
        """Lazy initialise MediaPipe Face Detection for video frames."""
        if self._face_detector is None:
            try:
                import mediapipe as mp
                self._face_detector = mp.solutions.face_detection.FaceDetection(
                    model_selection=0, min_detection_confidence=0.5
                )
                logger.info("MediaPipe FaceDetector initialised for video")
            except Exception as e:
                logger.warning(f"MediaPipe FaceDetector initialisation failed: {e}")
                self._face_detector = None
        return self._face_detector

    # ------------------------------------------------------------------ #
    # Component 1 – Face Detection                                         #
    # ------------------------------------------------------------------ #

    def detect_faces(self, image: Image.Image) -> List[Dict[str, Any]]:
        """
        Detect all faces using MTCNN (used for static images). Returns bounding boxes, confidence, and 5‑point keypoints.
        """
        mtcnn = self._get_mtcnn()
        if mtcnn is None:
            return []
        try:
            boxes, probs, kps = mtcnn.detect(image, landmarks=True)
        except Exception as e:
            logger.warning("MTCNN detection failed: %s", e)
            return []
        if boxes is None or len(boxes) == 0:
            return []
        faces = []
        for i, (box, prob) in enumerate(zip(boxes, probs)):
            if prob is None or prob < 0.85:
                continue
            x1, y1, x2, y2 = box
            if x2 <= x1 or y2 <= y1:
                continue
            area = (x2 - x1) * (y2 - y1)
            if area < MIN_FACE_AREA:
                continue
            kp = kps[i].tolist() if kps is not None and kps[i] is not None else None
            faces.append({
                "box": [float(x1), float(y1), float(x2), float(y2)],
                "confidence": float(prob),
                "kp": kp,
            })
        faces.sort(key=lambda f: f["confidence"], reverse=True)
        return faces[:MAX_FACES]

    def video_detect_faces(self, image: Image.Image) -> List[Dict[str, Any]]:
        """
        Detect faces in video frames using MediaPipe FaceDetector.
        Returns bounding boxes (absolute pixel coords) and detection confidence.
        """
        detector = self._get_face_detector()
        if detector is None:
            return []
        # MediaPipe expects RGB image as numpy array
        img_np = np.array(image)
        results = detector.process(img_np)
        if results.detections is None:
            return []
        h, w, _ = img_np.shape
        faces = []
        for det in results.detections:
            box = det.location_data.relative_bounding_box
            x1 = int(box.xmin * w)
            y1 = int(box.ymin * h)
            x2 = int((box.xmin + box.width) * w)
            y2 = int((box.ymin + box.height) * h)
            confidence = float(det.score[0]) if hasattr(det, 'score') else 0.0
            faces.append({
                "box": [float(x1), float(y1), float(x2), float(y2)],
                "confidence": confidence,
                "kp": None,
            })
        faces.sort(key=lambda f: f["confidence"], reverse=True)
        return faces[:MAX_FACES]

    # ------------------------------------------------------------------ #
    # Component 2 – Face Cropping                                          #
    # ------------------------------------------------------------------ #

    @staticmethod
    def expand_box(
        box: List[float],
        img_width: int,
        img_height: int,
        margin: float = FACE_MARGIN,
    ) -> List[int]:
        """Expand detected face box by `margin` fraction and clamp to image bounds."""
        x1, y1, x2, y2 = box
        w, h = x2 - x1, y2 - y1
        x1 = max(0, x1 - margin * w)
        y1 = max(0, y1 - margin * h)
        x2 = min(img_width, x2 + margin * w)
        y2 = min(img_height, y2 + margin * h)
        return [int(x1), int(y1), int(x2), int(y2)]

    # ------------------------------------------------------------------ #
    # Component 3 – Model Inference                                        #
    # ------------------------------------------------------------------ #

    def predict_model(self, face_crop: Image.Image) -> Dict[str, float]:
        """
        Dispatch to fused or spatial-only inference based on whether a
        FrequencyBranch + FusionClassifier have been loaded.

        Returns explicit probabilities: {"fake_prob": float, "real_prob": float}
        """
        if self.freq_branch is not None and self.fusion_head is not None:
            return self._predict_fused(face_crop)
        return self._predict_spatial_only(face_crop)

    def _predict_spatial_only(self, face_crop: Image.Image) -> Dict[str, float]:
        """
        Legacy inference path — spatial backbone (ViT/Swin) only.
        Used when no FrequencyBranch has been loaded, preserving full
        backward compatibility with the existing pipeline.
        """
        try:
            if self.processor is None:
                raise ValueError("DeepfakePipeline: processor is None")

            proc_out = self.processor(images=face_crop, return_tensors="pt")
            if proc_out is None:
                raise ValueError("DeepfakePipeline: processor returned None")

            inputs = proc_out.to(self.device)
            with torch.no_grad():
                outputs = self.model(**inputs)
                logits = outputs.logits
                probs = torch.softmax(logits, dim=1).squeeze(0)

            num_labels = len(getattr(self.model.config, 'id2label', {}))

            # SAFEGUARD: Ensure model is fine-tuned for binary classification
            if num_labels != 2:
                logger.error(
                    f"Model has {num_labels} labels! Expected 2. Returning uncertain fallback."
                )
                return {"fake_prob": 0.5, "real_prob": 0.5}

            fake_prob = float(probs[self.fake_idx].item())
            real_prob = float(probs[self.real_idx].item())
            return {"fake_prob": fake_prob, "real_prob": real_prob}
        except Exception as e:
            logger.warning("Model inference failed on face crop: %s", e)
            return {"fake_prob": 0.0, "real_prob": 1.0}

    def _predict_fused(self, face_crop: Image.Image) -> Dict[str, float]:
        """
        Fused inference path: spatial backbone + frozen FrequencyBranch → FusionClassifier.

        Feature extraction is backbone-agnostic:
          - Swin: self.model.swin(...).pooler_output     → [1, 1024]
          - ViT:  self.model.vit(...).last_hidden_state[:, 0, :] → [1, 768]

        Falls back to _predict_spatial_only() on any exception so the
        pipeline never hard-crashes in production.
        """
        try:
            if self.processor is None:
                raise ValueError("DeepfakePipeline: processor is None")

            proc_out = self.processor(images=face_crop, return_tensors="pt")
            if proc_out is None:
                raise ValueError("DeepfakePipeline: processor returned None")

            img_tensor = proc_out["pixel_values"].to(self.device)

            with torch.no_grad():
                # 1. Spatial features — handle ViT vs Swin dynamically
                if hasattr(self.model, 'swin'):
                    spatial_out = self.model.swin(pixel_values=img_tensor)
                    spatial_features = spatial_out.pooler_output              # [1, 1024]
                elif hasattr(self.model, 'vit'):
                    spatial_out = self.model.vit(pixel_values=img_tensor)
                    # ViT: CLS token from the final hidden state
                    spatial_features = spatial_out.last_hidden_state[:, 0, :]  # [1, 768]
                else:
                    raise ValueError(
                        f"Unsupported model type for fusion: {type(self.model).__name__}"
                    )

                # 2. Frequency features from the frozen FrequencyBranch
                freq_features = self.freq_branch(img_tensor)                  # [1, 768]

                # 3. Concatenate and classify
                logits = self.fusion_head(spatial_features, freq_features)
                probs = torch.softmax(logits, dim=1).squeeze(0)

            fake_prob = float(probs[self.fake_idx].item())
            real_prob = float(probs[self.real_idx].item())
            return {"fake_prob": fake_prob, "real_prob": real_prob}
        except Exception as e:
            logger.warning(
                "Fused inference failed: %s — falling back to spatial-only.", e
            )
            return self._predict_spatial_only(face_crop)

    # ------------------------------------------------------------------ #
    # Component 4 – Landmark Extraction  (MTCNN 5-point keypoints)         #
    # ------------------------------------------------------------------ #

    def get_landmarks(self, face_crop: Image.Image):
        """
        Extract 468 landmarks using MediaPipe FaceMesh.
        """
        face_mesh = self._get_face_mesh()
        if face_mesh is None:
            return None

        img_np = np.array(face_crop)
        # FaceMesh expects RGB
        results = face_mesh.process(img_np)

        if not results.multi_face_landmarks:
            return None

        # Return first face's landmarks
        return results.multi_face_landmarks[0]

    # ------------------------------------------------------------------ #
    # Component 5 – Geometry Feature Extraction  (from MTCNN 5-pt kp)     #
    # ------------------------------------------------------------------ #

    @staticmethod
    def extract_geometry_features(
        landmarks,   # MediaPipe face_landmarks object
        width: int,
        height: int,
    ) -> Dict[str, float]:
        """
        Compute geometry features from MediaPipe 468-point landmarks.
        """
        if landmarks is None:
            return {"eye_asymmetry": 0.0, "lip_distance": 0.0}

        def get_pt(idx):
            lm = landmarks.landmark[idx]
            return np.array([lm.x * width, lm.y * height])

        # Eye asymmetry using FaceMesh indices
        l_inner = get_pt(LEFT_EYE_CORNERS[0])
        l_outer = get_pt(LEFT_EYE_CORNERS[1])
        r_inner = get_pt(RIGHT_EYE_CORNERS[0])
        r_outer = get_pt(RIGHT_EYE_CORNERS[1])

        l_eye_center = (l_inner + l_outer) / 2
        r_eye_center = (r_inner + r_outer) / 2

        inter_eye_dist = float(np.linalg.norm(r_eye_center - l_eye_center)) + 1e-6
        eye_height_diff = abs(float(l_eye_center[1]) - float(r_eye_center[1]))
        eye_asymmetry = eye_height_diff / inter_eye_dist

        # Lip distance
        upper_lip = get_pt(UPPER_LIP_IDX)
        lower_lip = get_pt(LOWER_LIP_IDX)
        lip_distance = float(np.linalg.norm(upper_lip - lower_lip))

        # Nose alignment (centrality relative to eyes)
        nose_tip = get_pt(NOSE_TIP_IDX)
        eye_midpoint = (l_eye_center + r_eye_center) / 2
        # Project nose onto eye vector to check lateral deviation
        eye_vec = r_eye_center - l_eye_center
        eye_vec_unit = eye_vec / (np.linalg.norm(eye_vec) + 1e-6)
        
        nose_vec = nose_tip - eye_midpoint
        # Cross product in 2D gives lateral offset
        lateral_offset = abs(nose_vec[0] * eye_vec_unit[1] - nose_vec[1] * eye_vec_unit[0])
        alignment_score = lateral_offset / inter_eye_dist

        return {
            "eye_asymmetry": float(round(min(eye_asymmetry, 1.0), 4)),
            "lip_distance":  float(round(lip_distance, 2)),
            "alignment_score": float(round(min(alignment_score, 1.0), 4)),
        }

    # ------------------------------------------------------------------ #
    # Component 6 – Score Fusion                                           #
    # ------------------------------------------------------------------ #

    def _logit(self, p):
        p = max(1e-6, min(1.0 - 1e-6, p))
        return math.log(p / (1.0 - p))

    def _sigmoid(self, x):
        return 1.0 / (1.0 + math.exp(-x))

    def fuse_scores(self, cnn_fake_prob: float, geom_features: Dict[str, float], crop_quality: float = 1.0, outside_fraction: float = 0.0) -> Tuple[float, float]:
        """
        Fused logit-space analysis with Dynamic Weight Gating and Attention Bias.
        """
        # Component 1 — Dynamic Weight Gate based on crop quality
        if crop_quality > 0.85:
            w_local, w_global = 0.85, 0.15
        elif crop_quality < 0.40:
            w_local, w_global = 0.30, 0.70
        else:
            w_local, w_global = 0.70, 0.30

        # Component 2 — Forensic Bias from Geometry
        eye_asym = geom_features.get("eye_asymmetry", 0.0)
        alignment = geom_features.get("alignment_score", 0.0)
        # We amplify both; if either is high, it's a red flag
        geo_score = max(min(1.0, eye_asym * 4.0), min(1.0, alignment * 2.5))
        # Calibration bias: Geometry boost + Quality suppression + Attention bias
        attention_bias = 0.0
        if outside_fraction > 0.15:
            attention_bias = (outside_fraction - 0.15) * 0.5
            
        bias = (geo_score - 0.5) * 0.4 - (1.0 - crop_quality) * 0.3 + attention_bias

        # Component 3 — Logit-space Fusion
        logit_local = self._logit(cnn_fake_prob)
        # Global signal fallback (simplified here as 0.5/neutral if no global context, 
        # but in practice we use the average face logit or similar)
        logit_global = 0.0 
        
        fused_logit = w_local * logit_local + w_global * logit_global + bias
        fused_score = self._sigmoid(fused_logit)
        
        return round(float(fused_score), 4), round(float(geo_score), 4)

    # ------------------------------------------------------------------ #
    # Component 7 – Multi-Face Aggregation                                 #
    # ------------------------------------------------------------------ #

    @staticmethod
    def face_verdict_from_score(fused_score: float) -> str:
        """
        Apply per-face deepfake thresholds to a fused score.

        Returns:
            "Deepfake"   if fused_score > 0.70
            "Suspicious" if fused_score > 0.50
            "Real"       otherwise
        """
        if fused_score > THRESH_DEEPFAKE:
            return "Deepfake"
        elif fused_score > THRESH_SUSPICIOUS:
            return "Suspicious"
        return "Real"

    @staticmethod
    def aggregate_faces(face_results: List[Dict[str, Any]]) -> Tuple[str, float]:
        """
        Compute final image-level verdict from per-face fused scores and verdicts.

        Strategy: 
        1. Score: Average the top-2 fused scores (or single if only one face).
        2. Label: Priority-based (Deepfake > Suspicious > Uncertain > Real).
           If any face is Deepfake, the entire image is Deepfake.
           If no Deepfake but any Suspicious, entire image is Suspicious.
           If no Deepfake/Suspicious but any Uncertain, entire image is Uncertain.
           Otherwise Real.

        Returns:
            (final_label, final_score)
        """
        if not face_results:
            return "NoFaces", 0.0

        scores = sorted(
            [f["fused_score"] for f in face_results], reverse=True
        )
        final_score = float(np.mean(scores[:2]))

        # Priority-based label selection
        verdicts = [f.get("face_verdict", "Real") for f in face_results]
        
        if "Deepfake" in verdicts:
            label = "Deepfake"
        elif "Suspicious" in verdicts:
            label = "Suspicious"
        elif "Uncertain" in verdicts:
            label = "Uncertain"
        else:
            label = "Real"

        return label, round(final_score, 4)

    # ------------------------------------------------------------------ #
    # Main pipeline entry point                                            #
    # ------------------------------------------------------------------ #

    def run(self, image: Image.Image, outside_fraction: float = 0.0) -> Dict[str, Any]:
        """
        Run the full pipeline on a PIL image.

        Returns a dict with the following schema (LLM-ready):
        {
            "final_label":  str,   # "Real" | "Deepfake" | "Suspicious" | "NoFaces"
            "confidence":   float, # aggregated score in [0, 1]
            "inference_ms": int,   # total wall-clock time in ms
            "faces": [
                {
                    "face_id":    int,
                    "box":        [x1, y1, x2, y2],   # expanded pixels
                    "cnn_label":  str,
                    "cnn_conf":   float,
                    "geom_score": float,
                    "fused_score": float,
                    "geometry":   {"eye_asymmetry": float, "lip_distance": float}
                },
                ...
            ]
        }
        """
        t_start = time.time()
        image = image.convert("RGB")
        img_w, img_h = image.size

        # --- detect faces ---
        detected = self.detect_faces(image)

        # --- fallback: use whole image when no face detected ---
        if not detected:
            logger.info("No faces detected — running model on full image")
            probs_dict = self.predict_model(image)
            fake_prob = probs_dict["fake_prob"]
            label = "Fake" if probs_dict["fake_prob"] > probs_dict["real_prob"] else "Real"
            conf = max(probs_dict["fake_prob"], probs_dict["real_prob"])
            
            fused, geom_s = self.fuse_scores(fake_prob, {"eye_asymmetry": 0.0, "lip_distance": 0.0}, outside_fraction=outside_fraction)
            face_verdict = self.face_verdict_from_score(fused)
            face_results = [{
                "face_id": 0,
                "box": [0, 0, img_w, img_h],
                "face_verdict": face_verdict,
                "cnn_label": label,
                "cnn_conf": round(conf, 4),
                "geom_score": geom_s,
                "fused_score": fused,
                "geometry": {"eye_asymmetry": 0.0, "lip_distance": 0.0},
                "mtcnn_conf": 1.0,  # Fallback quality for full image
            }]
            final_label, final_score = self.aggregate_faces(face_results)
            return {
                "final_label": final_label,
                "confidence": final_score,
                "inference_ms": int((time.time() - t_start) * 1000),
                "faces": face_results,
                "no_faces_detected": True,
            }

        # --- per-face processing ---
        face_results = []
        for idx, det in enumerate(detected):
            raw_box = det["box"]
            box = self.expand_box(raw_box, img_w, img_h)
            x1, y1, x2, y2 = box

            # crop face
            face_crop = image.crop((x1, y1, x2, y2))
            crop_w, crop_h = face_crop.size

            # ViT inference
            probs_dict = self.predict_model(face_crop)
            fake_prob = probs_dict["fake_prob"]
            real_prob = probs_dict["real_prob"]

            # Component 4 — MediaPipe Landmarks
            face_landmarks = self.get_landmarks(face_crop)

            # Component 5 — Geometry features from FaceMesh
            geom_feats = self.extract_geometry_features(
                face_landmarks, crop_w, crop_h
            )

            # score fusion (using pure fake probability + attention bias)
            fused, geom_s = self.fuse_scores(fake_prob, geom_feats, crop_quality=det.get("confidence", 1.0), outside_fraction=outside_fraction)

            # per-face verdict & Uncertainty checking
            # Rule 1: Probability Gap (Model is torn between classes)
            # Rule 2: Score Boundary (Model is sitting on the 0.5 fence)
            if abs(fake_prob - real_prob) < 0.10 or (0.45 <= fused <= 0.55):
                face_verdict = "Uncertain"
            else:
                face_verdict = self.face_verdict_from_score(fused)

            face_results.append({
                "face_id": idx,
                "box": box,
                "face_verdict": face_verdict,
                "cnn_label": "Fake" if fake_prob > real_prob else "Real",
                "cnn_conf": round(max(fake_prob, real_prob), 4),
                "fake_prob": round(fake_prob, 4),
                "real_prob": round(real_prob, 4),
                "geom_score": geom_s,
                "fused_score": fused,
                "mtcnn_conf": round(det.get("confidence", 1.0), 4),
                "geometry": geom_feats,
                "_landmarks": face_landmarks,  # Internal use for drawing
            })

        # --- aggregate ---
        final_label, final_score = self.aggregate_faces(face_results)

        return {
            "final_label": final_label,
            "confidence": final_score,
            "inference_ms": int((time.time() - t_start) * 1000),
            "faces": face_results,
            "no_faces_detected": False,
        }

    # ------------------------------------------------------------------ #
    # Visualisation helper                                                 #
    # ------------------------------------------------------------------ #

    @staticmethod
    def draw_face_boxes(
        image: Image.Image,
        pipeline_result: Dict[str, Any],
        heatmap_bgr: Optional[np.ndarray] = None,
    ) -> np.ndarray:
        """
        Draw bounding boxes with per-face verdicts on the image or heatmap overlay.

        Colour coding:
            Red    (#FF3333) — Deepfake
            Amber  (#FFA500) — Suspicious
            Green  (#00C850) — Real

        Each box is labelled: "F<id>: <verdict> (<score>)"
        so a multi-face image immediately shows which faces are flagged.

        Returns a BGR numpy array suitable for cv2.imencode.
        """
        COLOURS = {
            "Deepfake":   (51,  51,  255),   # red in BGR
            "Suspicious": (0,   165, 255),   # amber in BGR
            "Real":       (80,  200, 0),     # green in BGR
            "Uncertain":  (180, 180, 180),   # grey in BGR
        }

        if heatmap_bgr is not None:
            canvas = heatmap_bgr.copy()
        else:
            canvas = cv2.cvtColor(np.array(image.convert("RGB")), cv2.COLOR_RGB2BGR)

        for face in pipeline_result.get("faces", []):
            x1, y1, x2, y2 = map(int, face["box"])
            verdict = face.get("face_verdict", "Real")
            color   = COLOURS.get(verdict, (180, 180, 180))

            # Box
            cv2.rectangle(canvas, (x1, y1), (x2, y2), color, 2)

            # Label: just the verdict — no static confidence number
            # (the temporal transformer classifies the whole track once,
            # so any per-frame number would be identical across all frames)
            txt = f"F{face['face_id']}: {verdict}"
            font       = cv2.FONT_HERSHEY_SIMPLEX
            font_scale = 0.45
            thickness  = 1
            (tw, th), baseline = cv2.getTextSize(txt, font, font_scale, thickness)

            # Tag background filled with verdict colour
            tag_y1 = max(0, y1 - th - 6)
            cv2.rectangle(canvas, (x1, tag_y1), (x1 + tw + 6, y1), color, -1)
            cv2.putText(
                canvas, txt,
                (x1 + 3, max(th, y1 - 3)),
                font, font_scale, (255, 255, 255), thickness,
                cv2.LINE_AA,
            )

        return canvas

    @staticmethod
    def draw_face_mesh(
        image: Image.Image,
        face_results: List[Dict[str, Any]],
    ) -> np.ndarray:
        """
        Draw MediaPipe FaceMesh wireframes on a blank black canvas.
        """
        img_w, img_h = image.size
        canvas = np.zeros((img_h, img_w, 3), dtype=np.uint8)

        try:
            try:
                import mediapipe.python.solutions.drawing_utils as mp_drawing
                import mediapipe.python.solutions.face_mesh as mp_face_mesh
            except ImportError:
                try:
                    from mediapipe.solutions import drawing_utils as mp_drawing
                    from mediapipe.solutions import face_mesh as mp_face_mesh
                except ImportError:
                    import mediapipe as mp
                    mp_drawing = mp.solutions.drawing_utils
                    mp_face_mesh = mp.solutions.face_mesh

            drawing_spec = mp_drawing.DrawingSpec(thickness=1, circle_radius=1, color=(0, 255, 0))

            for face in face_results:
                landmarks = face.get("_landmarks")
                if landmarks is None:
                    continue
                
                # Draw the mesh connections
                mp_drawing.draw_landmarks(
                    image=canvas,
                    landmark_list=landmarks,
                    connections=mp_face_mesh.FACEMESH_TESSELATION,
                    landmark_drawing_spec=None,
                    connection_drawing_spec=drawing_spec
                )
        except:
            pass

        return canvas



# ---------------------------------------------------------------------------
# Spatio-Temporal Video Pipeline
# ---------------------------------------------------------------------------
class DeepfakeVideoPipeline(DeepfakePipeline):
    """
    Spatio-Temporal deepfake detection pipeline for videos.
    Extends DeepfakePipeline to handle multi-frame video sequences,
    face tracking, and temporal transformer inference.
    """
    def __init__(self, model, processor, device, freq_branch=None, video_model=None):
        super().__init__(model, processor, device, freq_branch=freq_branch, fusion_head=None)
        self.video_model = video_model

    def draw_meshes_on_bgr(self, canvas: np.ndarray, faces_in_frame: List[Dict[str, Any]]) -> np.ndarray:
        """Draw MediaPipe FaceMesh wireframes on a BGR numpy canvas."""
        try:
            import mediapipe.python.solutions.drawing_utils as mp_drawing
            import mediapipe.python.solutions.face_mesh as mp_face_mesh
        except ImportError:
            try:
                from mediapipe.solutions import drawing_utils as mp_drawing
                from mediapipe.solutions import face_mesh as mp_face_mesh
            except ImportError:
                return canvas

        drawing_spec = mp_drawing.DrawingSpec(thickness=1, circle_radius=1, color=(0, 255, 0))
        for face in faces_in_frame:
            landmarks = face.get("landmarks")
            if landmarks is not None:
                mp_drawing.draw_landmarks(
                    image=canvas,
                    landmark_list=landmarks,
                    connections=mp_face_mesh.FACEMESH_TESSELATION,
                    landmark_drawing_spec=None,
                    connection_drawing_spec=drawing_spec
                )
        return canvas

    def run_video(self, video_path: str, outside_fraction: float = 0.0) -> Tuple[Dict[str, Any], str, str]:
        """
        Run the spatio-temporal video deepfake detection on the uploaded video path.
        """
        t_start = time.time()
        
        # 1. Open the video to read basic properties
        cap = cv2.VideoCapture(video_path)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fps = cap.get(cv2.CAP_PROP_FPS)
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        
        if total_frames <= 0 or not cap.isOpened():
            cap.release()
            raise ValueError(f"Cannot read video file: {video_path}")
            
        if fps <= 0:
            fps = 30.0
            
        logger.info(f"Loaded video for deepfake analysis: {total_frames} frames, {fps:.2f} FPS, {width}x{height}")
        
        # 2. Process every frame of the video sequentially to extract and track faces
        tracks = []  # List of face tracks. Each track is a list of frame detections.
        frame_idx = 0
        
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
                
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            pil_frame = Image.fromarray(frame_rgb)
            
            # Detect faces on this video frame using MediaPipe (MTCNN is reserved for static images)
            detections = self.video_detect_faces(pil_frame)
            
            # Run FaceMesh on every detected face to obtain geometry landmarks
            # Also compute per-frame spatial confidence from the Swin backbone
            detections_with_mesh = []
            for det in detections:
                box = det["box"]
                x1, y1, x2, y2 = self.expand_box(box, width, height)
                face_crop = pil_frame.crop((x1, y1, x2, y2))
                
                # Extract landmarks via MediaPipe FaceMesh
                landmarks = self.get_landmarks(face_crop)
                
                # Per-frame spatial confidence from Swin backbone
                try:
                    probs_dict = self.predict_model(face_crop)
                    frame_fake_prob = probs_dict["fake_prob"]
                    frame_real_prob = probs_dict["real_prob"]
                except Exception:
                    frame_fake_prob = 0.0
                    frame_real_prob = 1.0
                
                detections_with_mesh.append({
                    "box": [float(x1), float(y1), float(x2), float(y2)],
                    "kp": None,  # keypoints not needed for video
                    "confidence": det["confidence"],
                    "landmarks": landmarks,
                    "crop": face_crop,
                    "frame_fake_prob": frame_fake_prob,
                    "frame_real_prob": frame_real_prob,
                })
                
            # Track association (simple center-distance tracking)
            dist_threshold = max(width, height) * 0.15
            if frame_idx == 0:
                for idx, det in enumerate(detections_with_mesh):
                    tracks.append([{
                        "frame_idx": frame_idx,
                        "box": det["box"],
                        "kp": det["kp"],
                        "confidence": det["confidence"],
                        "landmarks": det["landmarks"],
                        "crop": det["crop"],
                        "face_id": idx,
                        "frame_fake_prob": det["frame_fake_prob"],
                        "frame_real_prob": det["frame_real_prob"],
                    }])
            else:
                matched_detections = set()
                for track in tracks:
                    last_det = track[-1]
                    last_box = last_det["box"]
                    last_center = ((last_box[0] + last_box[2]) / 2, (last_box[1] + last_box[3]) / 2)
                    
                    best_det_idx = -1
                    best_dist = float('inf')
                    for idx, det in enumerate(detections_with_mesh):
                        if idx in matched_detections:
                            continue
                        box = det["box"]
                        center = ((box[0] + box[2]) / 2, (box[1] + box[3]) / 2)
                        dist = math.sqrt((last_center[0] - center[0])**2 + (last_center[1] - center[1])**2)
                        if dist < best_dist and dist < dist_threshold:
                            best_dist = dist
                            best_det_idx = idx
                            
                    if best_det_idx != -1:
                        matched_detections.add(best_det_idx)
                        det = detections_with_mesh[best_det_idx]
                        track.append({
                            "frame_idx": frame_idx,
                            "box": det["box"],
                            "kp": det["kp"],
                            "confidence": det["confidence"],
                            "landmarks": det["landmarks"],
                            "crop": det["crop"],
                            "face_id": last_det["face_id"],
                            "frame_fake_prob": det["frame_fake_prob"],
                            "frame_real_prob": det["frame_real_prob"],
                        })
                        
                # Start new tracks for unmatched detections
                for idx, det in enumerate(detections_with_mesh):
                    if idx not in matched_detections:
                        new_id = len(tracks)
                        tracks.append([{
                            "frame_idx": frame_idx,
                            "box": det["box"],
                            "kp": det["kp"],
                            "confidence": det["confidence"],
                            "landmarks": det["landmarks"],
                            "crop": det["crop"],
                            "face_id": new_id,
                            "frame_fake_prob": det["frame_fake_prob"],
                            "frame_real_prob": det["frame_real_prob"],
                        }])
                        
            frame_idx += 1
            
        cap.release()
        
        face_results = []
        
        # 3. For each track, prepare 16 frames and run temporal classifier
        if tracks:
            for track in tracks:
                L = len(track)
                if L == 0:
                    continue
                    
                # Subsample or pad to exactly 16 frames
                sampled_track_indices = np.linspace(0, L - 1, 16, dtype=int)
                sampled_detections = [track[i] for i in sampled_track_indices]
                
                # Prepare tensor: [16, 3, 224, 224]
                frames_tensors = []
                for det in sampled_detections:
                    proc_out = self.processor(images=det["crop"], return_tensors="pt")
                    frames_tensors.append(proc_out["pixel_values"].squeeze(0))
                    
                video_sequence = torch.stack(frames_tensors).to(self.device)
                
                # Spatial and frequency feature extraction
                # Unified Spatio-Temporal Inference in one pass
                with torch.no_grad():
                    if self.video_model is not None:
                        logits = self.video_model(video_sequence.unsqueeze(0))  # [1, 2]
                        probs = torch.softmax(logits, dim=1).squeeze(0)
                        fake_prob = float(probs[self.fake_idx].item())
                        real_prob = float(probs[self.real_idx].item())
                    else:
                        fake_prob = 0.5
                        real_prob = 0.5
                        
                # Extract and aggregate geometry features across frames
                geom_metrics_list = []
                for det in track:
                    w_crop, h_crop = det["crop"].size
                    if det["landmarks"] is not None:
                        geom_feats = self.extract_geometry_features(det["landmarks"], w_crop, h_crop)
                        geom_metrics_list.append(geom_feats)
                        
                if geom_metrics_list:
                    avg_eye_asymmetry = float(np.mean([g["eye_asymmetry"] for g in geom_metrics_list]))
                    avg_lip_distance = float(np.mean([g["lip_distance"] for g in geom_metrics_list]))
                    avg_alignment = float(np.mean([g.get("alignment_score", 0.0) for g in geom_metrics_list]))
                else:
                    avg_eye_asymmetry = 0.0
                    avg_lip_distance = 0.0
                    avg_alignment = 0.0
                    
                aggregated_geom = {
                    "eye_asymmetry": avg_eye_asymmetry,
                    "lip_distance": avg_lip_distance,
                    "alignment_score": avg_alignment
                }
                
                # Dynamic logit fusion
                avg_crop_quality = float(np.mean([d["confidence"] for d in track]))
                fused_score, geom_s = self.fuse_scores(
                    fake_prob,
                    aggregated_geom,
                    crop_quality=avg_crop_quality,
                    outside_fraction=outside_fraction
                )
                
                # Verdict
                if abs(fake_prob - real_prob) < 0.10 or (0.45 <= fused_score <= 0.55):
                    face_verdict = "Uncertain"
                else:
                    face_verdict = self.face_verdict_from_score(fused_score)
                    
                face_results.append({
                    "face_id": track[0]["face_id"],
                    "box": track[0]["box"],
                    "face_verdict": face_verdict,
                    "cnn_label": "Fake" if fake_prob > real_prob else "Real",
                    "cnn_conf": round(max(fake_prob, real_prob), 4),
                    "fake_prob": round(fake_prob, 4),
                    "real_prob": round(real_prob, 4),
                    "geom_score": geom_s,
                    "fused_score": fused_score,
                    "mtcnn_conf": round(avg_crop_quality, 4),
                    "geometry": aggregated_geom,
                    "_track_detections": track
                })
        else:
            # Fallback: full frame uniform sampling (16 frames)
            logger.info("No face tracks identified. Running on full frames fallback.")
            cap = cv2.VideoCapture(video_path)
            temp_frames = []
            while cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    break
                temp_frames.append(frame)
            cap.release()
            
            L = len(temp_frames)
            if L == 0:
                raise ValueError("Video file contains no readable frames.")
                
            sampled_indices = np.linspace(0, L - 1, 16, dtype=int)
            frames_tensors = []
            for idx in sampled_indices:
                frame_rgb = cv2.cvtColor(temp_frames[idx], cv2.COLOR_BGR2RGB)
                pil_frame = Image.fromarray(frame_rgb)
                proc_out = self.processor(images=pil_frame, return_tensors="pt")
                frames_tensors.append(proc_out["pixel_values"].squeeze(0))
                
            video_sequence = torch.stack(frames_tensors).to(self.device)
            with torch.no_grad():
                if self.video_model is not None:
                    logits = self.video_model(video_sequence.unsqueeze(0))
                    probs = torch.softmax(logits, dim=1).squeeze(0)
                    fake_prob = float(probs[self.fake_idx].item())
                    real_prob = float(probs[self.real_idx].item())
                else:
                    fake_prob = 0.5
                    real_prob = 0.5
                    
            fused_score, geom_s = self.fuse_scores(
                fake_prob,
                {"eye_asymmetry": 0.0, "lip_distance": 0.0},
                outside_fraction=outside_fraction
            )
            face_verdict = self.face_verdict_from_score(fused_score)
            
            face_results.append({
                "face_id": 0,
                "box": [0, 0, width, height],
                "face_verdict": face_verdict,
                "cnn_label": "Fake" if fake_prob > real_prob else "Real",
                "cnn_conf": round(max(fake_prob, real_prob), 4),
                "fake_prob": round(fake_prob, 4),
                "real_prob": round(real_prob, 4),
                "geom_score": geom_s,
                "fused_score": fused_score,
                "geometry": {"eye_asymmetry": 0.0, "lip_distance": 0.0},
                "mtcnn_conf": 1.0,
            })
            
        # 4. Image-level aggregation
        final_label, final_score = self.aggregate_faces(face_results)
        
        # 5. Build detections map by frame
        # Include per-frame spatial fake_prob so we can compute a meaningful
        # rolling average per second instead of repeating the static track score
        detections_by_frame = {}
        for track in face_results:
            track_dets = track.get("_track_detections", [])
            for det in track_dets:
                f_idx = det["frame_idx"]
                if f_idx not in detections_by_frame:
                    detections_by_frame[f_idx] = []
                detections_by_frame[f_idx].append({
                    "face_id": det["face_id"],
                    "box": det["box"],
                    "fused_score": track["fused_score"],
                    "face_verdict": track["face_verdict"],
                    "det_confidence": det["confidence"],  # per-frame MTCNN confidence
                    "landmarks": det["landmarks"],
                    "frame_fake_prob": det.get("frame_fake_prob", track["fake_prob"]),
                    "frame_real_prob": det.get("frame_real_prob", track["real_prob"]),
                })
                
        # 6. Render processed video with face box and mesh overlays
        import uuid
        temp_id = uuid.uuid4().hex
        output_video_filename = f"processed_{temp_id}.mp4"
        output_video_path = os.path.join(os.path.dirname(video_path), output_video_filename)
        
        cap = cv2.VideoCapture(video_path)
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(output_video_path, fourcc, fps, (width, height))
        
        frame_idx = 0
        key_frame_canvas = None
        max_fused_score = -1.0
        # Mapping (face_id, second) -> list of per-frame spatial fake_probs
        # Used to compute a rolling average confidence per second per face
        sec_fake_probs: dict[tuple[int, int], list[float]] = {}
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
                
            faces_in_frame = detections_by_frame.get(frame_idx, [])
            sec = int(frame_idx / fps) if fps else 0

            # ------- Per-second confidence aggregation (per face) --------
            # Accumulate per-frame spatial fake_prob by (face_id, second)
            for f in faces_in_frame:
                fid = f["face_id"]
                fp = f.get("frame_fake_prob", f.get("fused_score", 0.5))
                sec_fake_probs.setdefault((fid, sec), []).append(fp)

            # Compute per-face rolling average fake_prob for the current second
            # and derive a live verdict + display score
            per_face_overlay: list[dict] = []
            for f in faces_in_frame:
                fid = f["face_id"]
                bucket = sec_fake_probs.get((fid, sec), [])
                avg_fake = sum(bucket) / len(bucket) if bucket else 0.5

                # Apply image-pipeline verdict thresholds on the rolling avg
                if avg_fake > THRESH_DEEPFAKE:
                    live_verdict = "Deepfake"
                elif avg_fake > THRESH_SUSPICIOUS:
                    live_verdict = "Suspicious"
                elif avg_fake > 0.45:          # narrow band around 0.5
                    live_verdict = "Uncertain"
                else:
                    live_verdict = "Real"

                # Display score: show confidence of the identified class
                # (real confidence when Real/Uncertain, fake confidence when Fake/Suspicious)
                if live_verdict in ("Real", "Uncertain"):
                    display_score = 1.0 - avg_fake
                else:
                    display_score = avg_fake

                per_face_overlay.append({
                    "face_id": fid,
                    "box": f["box"],
                    "live_verdict": live_verdict,
                    "display_score": display_score,
                    "fused_score": f["fused_score"],
                    "face_verdict": live_verdict,  # use live verdict for box colour
                    "landmarks": f.get("landmarks"),
                })

            if per_face_overlay:
                frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                pil_frame = Image.fromarray(frame_rgb)
                
                dummy_result = {
                    "faces": [
                        {
                            "face_id": fo["face_id"],
                            "box": fo["box"],
                            "fused_score": fo["fused_score"],
                            "face_verdict": fo["live_verdict"],
                        }
                        for fo in per_face_overlay
                    ]
                }
                canvas = DeepfakePipeline.draw_face_boxes(pil_frame, dummy_result)
            else:
                if not tracks and face_results:
                    frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                    pil_frame = Image.fromarray(frame_rgb)
                    dummy_result = {
                        "faces": [
                            {
                                "face_id": 0,
                                "box": [0, 0, width, height],
                                "fused_score": face_results[0]["fused_score"],
                                "face_verdict": face_results[0]["face_verdict"]
                            }
                        ]
                    }
                    canvas = DeepfakePipeline.draw_face_boxes(pil_frame, dummy_result)
                else:
                    # No detections – use raw frame as canvas
                    canvas = frame.copy()
            
            # Ensure canvas is a BGR numpy array for OpenCV functions and writing to out
            if isinstance(canvas, Image.Image):
                canvas = cv2.cvtColor(np.array(canvas), cv2.COLOR_RGB2BGR)
            
            # ------- Overlay per-second rolling avg confidence on each box --------
            for fo in per_face_overlay:
                box = fo["box"]
                x1, y1, x2, y2 = box
                txt_x = int(x2 - 50)
                txt_y = int(y1 + 15)
                txt = f"{fo['display_score']:.2f}"
                cv2.putText(canvas, txt, (txt_x, txt_y), cv2.FONT_HERSHEY_SIMPLEX,
                            0.50, (255, 255, 255), 1, cv2.LINE_AA)

            # Capture frame with highest deepfake score for keyframe
            current_max_fused = max([f["fused_score"] for f in faces_in_frame]) if faces_in_frame else 0.0
            if current_max_fused > max_fused_score:
                max_fused_score = current_max_fused
                key_frame_canvas = canvas.copy()
                
            out.write(canvas)
            frame_idx += 1
            
        cap.release()
        out.release()
        
        # Transcode the mp4v video to browser-compatible H.264 video using ffmpeg
        compat_video_path = output_video_path.replace(".mp4", "_compat.mp4")
        try:
            import subprocess
            subprocess.run([
                "ffmpeg", "-y", "-i", output_video_path,
                "-vcodec", "libx264", "-pix_fmt", "yuv420p",
                compat_video_path
            ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            
            # Replace the original with the compatible one
            if os.path.exists(compat_video_path):
                os.remove(output_video_path)
                os.rename(compat_video_path, output_video_path)
                logger.info("Successfully transcoded video to H.264 via ffmpeg.")
        except Exception as trans_err:
            logger.warning(f"Failed to transcode output video to H.264: {trans_err}")
        
        # Save keyframe
        keyframe_filename = f"keyframe_{temp_id}.jpg"
        keyframe_path = os.path.join(os.path.dirname(video_path), keyframe_filename)
        if key_frame_canvas is not None:
            cv2.imwrite(keyframe_path, key_frame_canvas)
        else:
            # Grab first frame as fallback
            cap = cv2.VideoCapture(video_path)
            ret, first_frame = cap.read()
            cap.release()
            if ret:
                cv2.imwrite(keyframe_path, first_frame)
                
        # Clean up track internal detections (which contain complex non-serializable PIL images and landmarks)
        for r in face_results:
            r.pop("_track_detections", None)
            
        pipeline_result = {
            "final_label": final_label,
            "confidence": final_score,
            "inference_ms": int((time.time() - t_start) * 1000),
            "faces": face_results,
            "no_faces_detected": not bool(tracks),
        }
        
        return pipeline_result, output_video_path, keyframe_path


# ---------------------------------------------------------------------------
# Self-test block
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import sys
    import json

    logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")

    if len(sys.argv) < 2:
        print("Usage: python pipeline.py <image_path>")
        sys.exit(1)

    image_path = sys.argv[1]
    img = Image.open(image_path).convert("RGB")

    # Load the frequency-refined ViT model (same as production)
    import os
    from transformers import AutoImageProcessor, AutoModelForImageClassification

    MODEL_NAME = "SARVM/Frequency-Refined-ViT"
    HF_TOKEN = os.getenv("HF_TOKEN")
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    processor = AutoImageProcessor.from_pretrained(MODEL_NAME, token=HF_TOKEN)
    model = AutoModelForImageClassification.from_pretrained(
        MODEL_NAME, token=HF_TOKEN, ignore_mismatched_sizes=True,
        attn_implementation="eager",
    )
    model.config.id2label = {0: "FAKE", 1: "REAL"}
    model.config.label2id = {"FAKE": 0, "REAL": 1}
    model.to(device).eval()

    pipe = DeepfakePipeline(model, processor, device)
    result = pipe.run(img)
    print(json.dumps(result, indent=2))

