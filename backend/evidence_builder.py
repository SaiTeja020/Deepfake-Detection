"""
Structured Evidence Builder
=============================
Assembles forensic interpreter outputs into a clean, hierarchical
evidence packet that serves as the LLM's sole structured input.

Also provides image-level cross-face analysis and model agreement assessment.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


def _assess_model_agreement(
    face_interpretations: List[Dict[str, Any]],
) -> str:
    """
    Assess how much the per-face verdicts agree with each other.
    Returns: "high", "moderate", or "low".
    """
    if len(face_interpretations) <= 1:
        return "high"

    verdicts = [f["verdict"] for f in face_interpretations]
    unique = set(verdicts)

    if len(unique) == 1:
        return "high"
    elif len(unique) == 2 and "Suspicious" in unique:
        return "moderate"
    else:
        return "low"


def _cross_face_analysis(
    face_interpretations: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Compute cross-face consistency metrics."""
    if len(face_interpretations) <= 1:
        return {
            "verdict_agreement": True,
            "max_score_delta": 0.0,
        }

    verdicts = [f["verdict"] for f in face_interpretations]
    agreement = len(set(verdicts)) == 1

    # Get fused scores from metric findings
    scores = []
    for fi in face_interpretations:
        for mf in fi.get("metric_findings", []):
            if mf["metric"] == "fused_score":
                scores.append(mf["raw_value"])
                break

    max_delta = 0.0
    if len(scores) >= 2:
        max_delta = round(max(scores) - min(scores), 4)

    return {
        "verdict_agreement": agreement,
        "max_score_delta": max_delta,
    }


class EvidenceBuilder:
    """
    Assembles the forensic interpreter's per-face outputs into a
    structured evidence packet for LLM consumption.
    """

    @staticmethod
    def build(
        verdict: str,
        confidence: float,
        faces: List[Dict[str, Any]],
        attention_outside_faces: float = 0.0,
        model_type: str = "ViT",
        global_fake_prob: float = 0.5,
    ) -> Dict[str, Any]:
        """
        Build the complete image-level evidence packet.

        Args:
            verdict: Final prediction string ("Real", "Fake", "Suspicious", "Uncertain")
            confidence: Confidence percentage (0-100)
            faces: List of forensic interpreter outputs (one per face)
            attention_outside_faces: Fraction of attention on non-face areas
            model_type: Architecture used ("ViT" or "Swin Transformer")
            global_fake_prob: Raw global fake probability from full-image pass

        Returns:
            Complete structured evidence dict ready for LLM prompt injection.
        """
        # Build per-face evidence summaries
        face_evidence = []
        for fi in faces:
            # Determine confidence level from metric findings
            confidence_level = "normal"
            crop_quality_label = "good"
            for mf in fi.get("metric_findings", []):
                if mf["metric"] == "confidence_gap":
                    confidence_level = mf["severity"]
                if mf["metric"] == "crop_quality":
                    crop_quality_label = mf["label"].replace(" face crop quality", "")

            # Determine geometric status
            geo_status = "consistent"
            for mf in fi.get("metric_findings", []):
                if mf["metric"] == "eye_asymmetry" and mf["severity"] in ("medium", "high"):
                    geo_status = "anomalous"
                    break
                if mf["metric"] == "lip_distance" and mf["severity"] in ("medium", "high"):
                    geo_status = "anomalous"
                    break

            # Assemble spatial info
            spatial = fi.get("spatial_analysis", {})
            regions = spatial.get("regions_of_interest", [])

            face_evidence.append({
                "face_id": fi["face_id"],
                "verdict": fi["verdict"],
                "confidence_level": confidence_level,
                "crop_quality": crop_quality_label,
                "geometric_status": geo_status,
                "primary_findings": fi.get("primary_findings", []),
                "secondary_findings": fi.get("secondary_findings", []),
                "regions_of_interest": regions,
                "conflicts": fi.get("conflicts", []),
            })

        # Image-level assessment
        model_agreement = _assess_model_agreement(faces)
        cross_face = _cross_face_analysis(faces)

        return {
            "overall_verdict": verdict,
            "overall_confidence": confidence,
            "face_count": len(faces),
            "model_type": model_type,
            "model_agreement": model_agreement,
            "attention_outside_faces": round(attention_outside_faces, 3),
            "faces": face_evidence,
            "cross_face_analysis": cross_face,
        }

    @staticmethod
    def generate_spatial_report(evidence: Dict[str, Any]) -> str:
        """
        Synthesizes biometric mesh anomalies and heatmap distributions 
        into a narrative 'Visual-to-Textual' bridge for the LLM.
        """
        report_lines = ["--- SPATIAL EVIDENCE REPORT ---"]
        
        for face in evidence.get("faces", []):
            face_id = face["face_id"]
            geom_status = face["geometric_status"]
            regions = face.get("regions_of_interest", [])
            
            report_lines.append(f"Face {face_id} Spatial Analysis:")
            
            # 1. Mesh interpretation
            if geom_status == "anomalous":
                report_lines.append(f"  - Biometric Mesh: Anomalous geometry detected.")
                for pf in face.get("primary_findings", []):
                    if "asymmetry" in pf.lower() or "spacing" in pf.lower():
                        report_lines.append(f"    - Structural Detail: {pf}")
            else:
                report_lines.append(f"  - Biometric Mesh: Consistent biological geometry.")

            # 2. Heatmap/Attention interpretation
            if regions:
                report_lines.append(f"  - Heatmap Focus: Primary attention localized on {', '.join(r.replace('_', ' ') for r in regions)}.")
                
                # Check for asymmetry in attention
                for pf in face.get("primary_findings", []):
                    if "asymmetry detected" in pf.lower():
                        report_lines.append(f"    - Attention Detail: Significant lateralization in model activation.")

            # 3. Conflict synthesis
            for conflict in face.get("conflicts", []):
                report_lines.append(f"  - Spatial Conflict: {conflict.replace('_', ' ').capitalize()}")

        if not evidence.get("faces"):
            report_lines.append("No faces detected for spatial analysis.")

        return "\n".join(report_lines)

    @staticmethod
    def to_prompt_text(evidence: Dict[str, Any]) -> str:
        """
        Render the evidence packet as a clean, readable text block
        suitable for injection into an LLM prompt.
        """
        lines = []
        lines.append(f"OVERALL VERDICT: {evidence['overall_verdict']}")
        lines.append(f"CONFIDENCE: {evidence['overall_confidence']}%")
        lines.append(f"MODEL: {evidence['model_type']}")
        lines.append(f"FACES DETECTED: {evidence['face_count']}")
        lines.append(f"MODEL AGREEMENT: {evidence['model_agreement']}")

        if evidence['attention_outside_faces'] > 0.15:
            lines.append(
                f"NOTE: {int(evidence['attention_outside_faces']*100)}% of model attention "
                f"was outside detected face regions."
            )

        lines.append("")

        for face in evidence.get("faces", []):
            lines.append(f"--- Face {face['face_id']} ---")
            lines.append(f"  Verdict: {face['verdict']}")
            lines.append(f"  Confidence level: {face['confidence_level']}")
            lines.append(f"  Crop quality: {face['crop_quality']}")
            lines.append(f"  Geometric status: {face['geometric_status']}")

            if face.get("primary_findings"):
                lines.append("  Primary findings:")
                for pf in face["primary_findings"]:
                    lines.append(f"    • {pf}")

            if face.get("secondary_findings"):
                lines.append("  Secondary signals:")
                for sf in face["secondary_findings"]:
                    lines.append(f"    • {sf}")

            if face.get("regions_of_interest"):
                lines.append(
                    f"  Attention focus regions: {', '.join(r.replace('_', ' ') for r in face['regions_of_interest'])}"
                )

            if face.get("conflicts"):
                lines.append("  ⚠ Evidence conflicts:")
                for c in face["conflicts"]:
                    lines.append(f"    • {c.replace('_', ' ')}")

            lines.append("")

        # Cross-face analysis
        cfa = evidence.get("cross_face_analysis", {})
        if evidence['face_count'] > 1:
            lines.append("--- Cross-Face Analysis ---")
            lines.append(
                f"  Verdict agreement: {'Yes' if cfa.get('verdict_agreement') else 'No'}"
            )
            lines.append(f"  Max score delta: {cfa.get('max_score_delta', 0):.2f}")

        lines.append("")
        lines.append(EvidenceBuilder.generate_spatial_report(evidence))

        return "\n".join(lines)
