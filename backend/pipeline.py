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

import logging
import time
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
    """

    def __init__(self, model, processor, device):
        self.model = model
        self.processor = processor
        self.device = device

        self._mtcnn = None       # lazy: facenet_pytorch.MTCNN
        self._face_mesh = None   # lazy: mediapipe FaceMesh

    # ------------------------------------------------------------------ #
    # Lazy resource initialisation                                         #
    # ------------------------------------------------------------------ #

    def _get_mtcnn(self):
        if self._mtcnn is None:
            try:
                from facenet_pytorch import MTCNN  # type: ignore
                self._mtcnn = MTCNN(
                    keep_all=True,
                    device=self.device,
                    min_face_size=20,
                    thresholds=[0.6, 0.7, 0.7],
                    post_process=False,
                )
                logger.info("MTCNN initialised on %s", self.device)
            except ImportError:
                logger.warning("facenet-pytorch not installed — face detection unavailable")
                self._mtcnn = None
        return self._mtcnn

    def _get_face_mesh(self):
        if self._face_mesh is None:
            try:
                import mediapipe.python.solutions.face_mesh as mp_fm
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

    # ------------------------------------------------------------------ #
    # Component 1 – Face Detection                                         #
    # ------------------------------------------------------------------ #

    def detect_faces(self, image: Image.Image) -> List[Dict[str, Any]]:
        """
        Detect all faces using MTCNN, also returning 5-point keypoints.

        Keypoints per face (all in image pixel coordinates):
            kp[0] = left_eye,   kp[1] = right_eye,
            kp[2] = nose,       kp[3] = mouth_left,
            kp[4] = mouth_right

        Returns:
            List of dicts: [{"box": [x1,y1,x2,y2], "confidence": float, "kp": list}, ...]
            Empty list if no faces found or MTCNN not available.
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
            if prob is None or prob < 0.85:  # Increased threshold to filter out background false positives
                continue
            x1, y1, x2, y2 = box
            if x2 <= x1 or y2 <= y1:
                continue
            area = (x2 - x1) * (y2 - y1)
            if area < MIN_FACE_AREA:
                continue
            # 5-point landmarks: [[le], [re], [nose], [ml], [mr]]
            kp = kps[i].tolist() if kps is not None and kps[i] is not None else None
            faces.append({
                "box": [float(x1), float(y1), float(x2), float(y2)],
                "confidence": float(prob),
                "kp": kp,
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
        Run the ViT model on a single face crop.
        Returns explicit probabilities for REAL and FAKE instead of argmax confidence.
        """
        try:
            inputs = self.processor(images=face_crop, return_tensors="pt").to(self.device)
            with torch.no_grad():
                outputs = self.model(**inputs)
                logits = outputs.logits
                probs = torch.softmax(logits, dim=1).squeeze(0)
                
            label2id = getattr(self.model.config, 'label2id', {})
            fake_idx = label2id.get("FAKE", 0)
            real_idx = label2id.get("REAL", 1)
            
            fake_prob = float(probs[fake_idx].item())
            real_prob = float(probs[real_idx].item())
            
            return {"fake_prob": fake_prob, "real_prob": real_prob}
        except Exception as e:
            logger.warning("Model inference failed on face crop: %s", e)
            return {"fake_prob": 0.0, "real_prob": 1.0}

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

    @staticmethod
    def fuse_scores(
        fake_prob: float,
        geom_feats: Dict[str, float],
        w_cnn: float = W_CNN,
        w_geom: float = W_GEOM,
    ) -> Tuple[float, float]:
        """
        Combine CNN deepfake-probability with a geometry anomaly score.
        Returns:
            (fused_score, geom_score) — both in [0, 1].
        """
        # Geometry anomaly: combined eye asymmetry and nose alignment
        eye_asym = geom_feats.get("eye_asymmetry", 0.0)
        alignment = geom_feats.get("alignment_score", 0.0)
        
        # We amplify both; if either is high, it's a red flag
        geom_score = max(min(1.0, eye_asym * 4.0), min(1.0, alignment * 2.5))
        
        fused = w_cnn * fake_prob + w_geom * geom_score
        return round(fused, 4), round(geom_score, 4)

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

    def run(self, image: Image.Image) -> Dict[str, Any]:
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
            
            fused, geom_s = self.fuse_scores(fake_prob, {"eye_asymmetry": 0.0, "lip_distance": 0.0})
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

            # score fusion (using pure fake probability)
            fused, geom_s = self.fuse_scores(fake_prob, geom_feats)

            # per-face verdict & Uncertainty checking
            if abs(fake_prob - real_prob) < 0.10:
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
        }

        if heatmap_bgr is not None:
            canvas = heatmap_bgr.copy()
        else:
            canvas = cv2.cvtColor(np.array(image.convert("RGB")), cv2.COLOR_RGB2BGR)

        for face in pipeline_result.get("faces", []):
            x1, y1, x2, y2 = face["box"]
            fused   = face["fused_score"]
            verdict = face.get("face_verdict", "Real")   # per-face label
            color   = COLOURS.get(verdict, (80, 200, 0))

            # Box
            cv2.rectangle(canvas, (x1, y1), (x2, y2), color, 2)

            # Label: "F0: Deepfake (0.83)"
            txt = f"F{face['face_id']}: {verdict} ({fused:.2f})"
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
            import mediapipe.python.solutions.drawing_utils as mp_drawing
            import mediapipe.python.solutions.face_mesh as mp_face_mesh
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

    # Load the ViT model (same as application)
    import os
    from transformers import ViTImageProcessor, ViTForImageClassification

    MODEL_NAME = "SARVM/ViT_Deepfake"
    HF_TOKEN = os.getenv("HF_TOKEN")
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    processor = ViTImageProcessor.from_pretrained(MODEL_NAME, token=HF_TOKEN)
    model = ViTForImageClassification.from_pretrained(MODEL_NAME, token=HF_TOKEN)
    model.config.id2label = {0: "FAKE", 1: "REAL"}
    model.config.label2id = {"FAKE": 0, "REAL": 1}
    model.to(device).eval()

    pipe = DeepfakePipeline(model, processor, device)
    result = pipe.run(img)
    print(json.dumps(result, indent=2))
