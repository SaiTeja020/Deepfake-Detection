"""
Forensic Interpretation Layer
==============================
Converts raw numerical detector outputs into semantic forensic signals
that an LLM can reason about effectively.

Three sub-components:
    1. MetricInterpreter  — raw float → semantic label + severity
    2. SpatialAttentionAnalyzer — attention mask + keypoints → region attribution
    3. ConflictDetector — cross-signal disagreement detection
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# 1. Metric Interpreter — calibrated thresholds
# ---------------------------------------------------------------------------

# Each entry: { (low, high): ("semantic_label", "severity") }
# Severity levels: "normal", "low", "medium", "high"
METRIC_THRESHOLDS = {
    "eye_asymmetry": [
        (0.0,  0.05,  "symmetric eye alignment",            "normal"),
        (0.05, 0.12,  "slight bilateral eye asymmetry",     "low"),
        (0.12, 0.25,  "moderate bilateral eye asymmetry",   "medium"),
        (0.25, 1.0,   "severe bilateral eye asymmetry",     "high"),
    ],
    "lip_distance": [
        (0.0,  8.0,   "compressed lip spacing",             "low"),
        (8.0,  20.0,  "normal lip spacing",                 "normal"),
        (20.0, 50.0,  "wide lip spacing",                   "medium"),
        (50.0, 9999,  "abnormally wide lip spacing",        "high"),
    ],
    "crop_quality": [     # mtcnn_conf
        (0.0,  0.45,  "poor face crop quality",             "high"),
        (0.45, 0.75,  "moderate face crop quality",         "medium"),
        (0.75, 1.0,   "good face crop quality",             "normal"),
    ],
    "confidence_gap": [   # abs(fake_prob - real_prob)
        (0.0,  0.10,  "near-equal probability split",       "high"),
        (0.10, 0.30,  "weak model preference",              "medium"),
        (0.30, 1.0,   "strong model conviction",            "normal"),
    ],
    "fused_score": [
        (0.0,  0.30,  "low manipulation probability",       "normal"),
        (0.30, 0.50,  "borderline manipulation signal",     "medium"),
        (0.50, 0.70,  "elevated manipulation signal",       "medium"),
        (0.70, 1.0,   "high manipulation probability",      "high"),
    ],
}


class MetricInterpreter:
    """Converts raw numeric metrics into semantic labels with severity."""

    @staticmethod
    def interpret(metric_name: str, value: float) -> Tuple[str, str]:
        """
        Returns (semantic_label, severity) for a given metric value.
        Falls back to a generic description if metric_name is unknown.
        """
        thresholds = METRIC_THRESHOLDS.get(metric_name)
        if thresholds is None:
            return (f"{metric_name}: {value:.3f}", "normal")

        for low, high, label, severity in thresholds:
            if low <= value < high:
                return (label, severity)

        # Value out of expected range — use last threshold
        _, _, label, severity = thresholds[-1]
        return (label, severity)

    @staticmethod
    def interpret_face_metrics(face: Dict[str, Any]) -> List[Dict[str, str]]:
        """
        Interpret all available metrics for a single face.
        Returns list of {"metric", "label", "severity", "raw_value"}.
        """
        findings = []
        geom = face.get("geometry", {})

        # Eye asymmetry
        eye_asym = geom.get("eye_asymmetry", 0.0)
        label, sev = MetricInterpreter.interpret("eye_asymmetry", eye_asym)
        findings.append({
            "metric": "eye_asymmetry",
            "label": label,
            "severity": sev,
            "raw_value": round(eye_asym, 4),
        })

        # Lip distance
        lip_dist = geom.get("lip_distance", 0.0)
        label, sev = MetricInterpreter.interpret("lip_distance", lip_dist)
        findings.append({
            "metric": "lip_distance",
            "label": label,
            "severity": sev,
            "raw_value": round(lip_dist, 2),
        })

        # Crop quality
        crop_q = face.get("mtcnn_conf", 1.0)
        label, sev = MetricInterpreter.interpret("crop_quality", crop_q)
        findings.append({
            "metric": "crop_quality",
            "label": label,
            "severity": sev,
            "raw_value": round(crop_q, 4),
        })

        # Confidence gap
        fp = face.get("fake_prob", 0.5)
        rp = face.get("real_prob", 0.5)
        gap = abs(fp - rp)
        label, sev = MetricInterpreter.interpret("confidence_gap", gap)
        findings.append({
            "metric": "confidence_gap",
            "label": label,
            "severity": sev,
            "raw_value": round(gap, 4),
        })

        # Fused score
        fused = face.get("fused_score", 0.5)
        label, sev = MetricInterpreter.interpret("fused_score", fused)
        findings.append({
            "metric": "fused_score",
            "label": label,
            "severity": sev,
            "raw_value": round(fused, 4),
        })

        return findings


# ---------------------------------------------------------------------------
# 2. Spatial Attention Analyzer
# ---------------------------------------------------------------------------

# Facial region definitions based on MTCNN 5-point keypoints
# kp[0]=left_eye, kp[1]=right_eye, kp[2]=nose, kp[3]=mouth_left, kp[4]=mouth_right
REGION_RADIUS = 30  # pixels — radius around each keypoint for region sampling


class SpatialAttentionAnalyzer:
    """
    Maps the ViT/Swin attention rollout mask onto facial regions defined
    by MTCNN 5-point keypoints. Produces region-level attention attribution.
    """

    @staticmethod
    def _region_attention(
        mask: np.ndarray,
        center_x: int,
        center_y: int,
        radius: int = REGION_RADIUS,
    ) -> float:
        """Sum attention values in a square region around (center_x, center_y)."""
        h, w = mask.shape[:2]
        y1 = max(0, center_y - radius)
        y2 = min(h, center_y + radius)
        x1 = max(0, center_x - radius)
        x2 = min(w, center_x + radius)
        if y2 <= y1 or x2 <= x1:
            return 0.0
        return float(mask[y1:y2, x1:x2].sum())

    @staticmethod
    def _box_region_attention(
        mask: np.ndarray,
        x1: int, y1: int, x2: int, y2: int,
    ) -> float:
        """Sum attention in a rectangular region."""
        h, w = mask.shape[:2]
        x1 = max(0, x1); y1 = max(0, y1)
        x2 = min(w, x2); y2 = min(h, y2)
        if y2 <= y1 or x2 <= x1:
            return 0.0
        return float(mask[y1:y2, x1:x2].sum())

    @staticmethod
    def analyze(
        mask: Optional[np.ndarray],
        face_box: List[float],
        keypoints: Optional[List[List[float]]],
    ) -> Dict[str, Any]:
        """
        Analyze attention distribution across facial regions for one face.

        Args:
            mask: Full-image attention mask (H×W), normalized [0,1].
            face_box: [x1, y1, x2, y2] of the face bounding box.
            keypoints: 5-point MTCNN keypoints [[x,y], ...] or None.

        Returns:
            Dict with regions_of_interest, attention_distribution,
            attention_asymmetry, and dominant_region.
        """
        empty_result = {
            "regions_of_interest": [],
            "attention_distribution": {},
            "attention_asymmetry": 0.0,
            "dominant_region": "unknown",
        }

        if mask is None or mask.size == 0:
            return empty_result

        bx1, by1, bx2, by2 = [int(v) for v in face_box]
        face_w = bx2 - bx1
        face_h = by2 - by1

        if face_w <= 0 or face_h <= 0:
            return empty_result

        # If no keypoints, use geometric estimation from box center
        if keypoints is None or len(keypoints) < 5:
            cx = (bx1 + bx2) // 2
            cy = (by1 + by2) // 2
            # Estimate keypoints from box geometry
            keypoints = [
                [bx1 + face_w * 0.3, by1 + face_h * 0.35],  # left eye
                [bx1 + face_w * 0.7, by1 + face_h * 0.35],  # right eye
                [cx, by1 + face_h * 0.55],                    # nose
                [bx1 + face_w * 0.35, by1 + face_h * 0.75],  # mouth left
                [bx1 + face_w * 0.65, by1 + face_h * 0.75],  # mouth right
            ]

        # Scale radius based on face size
        radius = max(15, min(50, int(face_w * 0.12)))

        # Define regions from keypoints
        regions = {}
        kp = keypoints

        # Left eye region
        regions["left_eye"] = SpatialAttentionAnalyzer._region_attention(
            mask, int(kp[0][0]), int(kp[0][1]), radius
        )

        # Right eye region
        regions["right_eye"] = SpatialAttentionAnalyzer._region_attention(
            mask, int(kp[1][0]), int(kp[1][1]), radius
        )

        # Nose region
        regions["nose"] = SpatialAttentionAnalyzer._region_attention(
            mask, int(kp[2][0]), int(kp[2][1]), radius
        )

        # Mouth region — bounding box between mouth corners
        mouth_x1 = int(min(kp[3][0], kp[4][0])) - radius // 2
        mouth_x2 = int(max(kp[3][0], kp[4][0])) + radius // 2
        mouth_y1 = int(min(kp[3][1], kp[4][1])) - radius // 2
        mouth_y2 = int(max(kp[3][1], kp[4][1])) + radius // 2
        regions["mouth"] = SpatialAttentionAnalyzer._box_region_attention(
            mask, mouth_x1, mouth_y1, mouth_x2, mouth_y2
        )

        # Forehead — top 20% of face box
        regions["forehead"] = SpatialAttentionAnalyzer._box_region_attention(
            mask, bx1, by1, bx2, by1 + int(face_h * 0.20)
        )

        # Jawline — bottom 25% of face box
        regions["jawline"] = SpatialAttentionAnalyzer._box_region_attention(
            mask, bx1, by2 - int(face_h * 0.25), bx2, by2
        )

        # Normalize to fractions
        total = sum(regions.values()) + 1e-8
        distribution = {k: round(v / total, 3) for k, v in regions.items()}

        # Sort by attention
        sorted_regions = sorted(distribution.items(), key=lambda x: x[1], reverse=True)
        top_regions = [r[0] for r in sorted_regions[:3]]

        # Left-right asymmetry
        left_attn = regions.get("left_eye", 0)
        right_attn = regions.get("right_eye", 0)
        max_eye = max(left_attn, right_attn, 1e-8)
        asymmetry = round(abs(left_attn - right_attn) / max_eye, 3)

        return {
            "regions_of_interest": top_regions,
            "attention_distribution": distribution,
            "attention_asymmetry": asymmetry,
            "dominant_region": sorted_regions[0][0] if sorted_regions else "unknown",
        }


# ---------------------------------------------------------------------------
# 3. Conflict Detector
# ---------------------------------------------------------------------------

class ConflictDetector:
    """Detects disagreements between different forensic signals."""

    @staticmethod
    def detect(
        face: Dict[str, Any],
        spatial_analysis: Dict[str, Any],
        global_fake_prob: float,
    ) -> List[str]:
        """
        Returns a list of conflict identifiers found in the evidence.
        Empty list = no contradictions detected.
        """
        conflicts = []

        fp = face.get("fake_prob", 0.5)
        rp = face.get("real_prob", 0.5)
        geom_score = face.get("geom_score", 0.0)
        fused = face.get("fused_score", 0.5)
        crop_q = face.get("mtcnn_conf", 1.0)

        # Texture-geometry conflict: CNN says fake but geometry is clean
        cnn_says_fake = fp > 0.6
        geom_clean = geom_score < 0.15
        if cnn_says_fake and geom_clean:
            conflicts.append("texture_geometry_conflict")

        # Reverse: geometry anomalous but CNN says real
        cnn_says_real = rp > 0.6
        geom_anomalous = geom_score > 0.4
        if cnn_says_real and geom_anomalous:
            conflicts.append("geometry_without_texture_confirmation")

        # High confidence but poor crop quality
        high_conf = abs(fp - rp) > 0.5
        poor_quality = crop_q < 0.45
        if high_conf and poor_quality:
            conflicts.append("confidence_quality_conflict")

        # Attention lateralization (left vs right eye imbalance)
        asym = spatial_analysis.get("attention_asymmetry", 0.0)
        if asym > 0.5:
            conflicts.append("attention_lateralization")

        # Global-local disagreement
        # Global model says fake (>0.6) but per-face fused score says real (<0.4), or vice versa
        if global_fake_prob > 0.6 and fused < 0.4:
            conflicts.append("global_local_conflict")
        elif global_fake_prob < 0.4 and fused > 0.6:
            conflicts.append("global_local_conflict")

        return conflicts


# ---------------------------------------------------------------------------
# Unified interpretation entry point
# ---------------------------------------------------------------------------

class ForensicInterpreter:
    """
    Full forensic interpretation for a single face.
    Combines metric interpretation, spatial analysis, and conflict detection.
    """

    @staticmethod
    def interpret_face(
        face: Dict[str, Any],
        attention_mask: Optional[np.ndarray] = None,
        global_fake_prob: float = 0.5,
    ) -> Dict[str, Any]:
        """
        Produce a complete forensic interpretation for one face.

        Returns:
            {
                "face_id": int,
                "verdict": str,
                "metric_findings": [...],
                "spatial_analysis": {...},
                "conflicts": [...],
                "primary_findings": [...],   # severity == high
                "secondary_findings": [...], # severity == medium
            }
        """
        face_id = face.get("face_id", 0)
        verdict = face.get("face_verdict", "Real")
        box = face.get("box", [0, 0, 100, 100])
        kp = face.get("kp")   # MTCNN 5-point keypoints, may be None

        # 1. Metric interpretation
        metric_findings = MetricInterpreter.interpret_face_metrics(face)

        # 2. Spatial attention analysis
        spatial_analysis = SpatialAttentionAnalyzer.analyze(
            attention_mask, box, kp
        )

        # 3. Conflict detection
        conflicts = ConflictDetector.detect(face, spatial_analysis, global_fake_prob)

        # 4. Separate into primary (high severity) and secondary (medium)
        primary = []
        secondary = []
        for finding in metric_findings:
            if finding["severity"] == "high":
                primary.append(finding["label"])
            elif finding["severity"] == "medium":
                secondary.append(finding["label"])

        # Add spatial insight to primary/secondary
        dominant = spatial_analysis.get("dominant_region", "unknown")
        top_regions = spatial_analysis.get("regions_of_interest", [])
        dist = spatial_analysis.get("attention_distribution", {})

        if dominant != "unknown" and dist.get(dominant, 0) > 0.30:
            pct = int(dist[dominant] * 100)
            note = f"Primary attention concentrated on {dominant.replace('_', ' ')} region ({pct}%)"
            if verdict in ("Deepfake", "Suspicious"):
                primary.append(note)
            else:
                secondary.append(note)

        if spatial_analysis.get("attention_asymmetry", 0) > 0.5:
            primary.append("Significant left-right attention asymmetry detected")

        # Add conflict narratives
        conflict_narratives = {
            "texture_geometry_conflict":
                "Texture analysis disagrees with geometric measurements",
            "geometry_without_texture_confirmation":
                "Geometric anomalies found without texture confirmation",
            "confidence_quality_conflict":
                "High model confidence despite poor image crop quality",
            "attention_lateralization":
                "Attention asymmetrically concentrated on one side of face",
            "global_local_conflict":
                "Full-image analysis disagrees with per-face analysis",
        }
        for c in conflicts:
            narrative = conflict_narratives.get(c, c)
            if narrative not in primary:
                primary.append(narrative)

        return {
            "face_id": face_id,
            "verdict": verdict,
            "metric_findings": metric_findings,
            "spatial_analysis": spatial_analysis,
            "conflicts": conflicts,
            "primary_findings": primary,
            "secondary_findings": secondary,
        }
