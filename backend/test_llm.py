import os
import json
from dotenv import load_dotenv
load_dotenv()

from llm_adapter import provider_router
from evidence_builder import EvidenceBuilder

# Mock evidence packet
mock_faces = [
    {
        "face_id": 0,
        "verdict": "Deepfake",
        "fake_prob": 0.95,
        "real_prob": 0.05,
        "geom_score": 0.45,
        "mtcnn_conf": 0.98,
        "fused_score": 0.92,
        "geometry": {
            "eye_asymmetry": 0.18,
            "lip_distance": 25.0
        },
        "primary_findings": ["Severe bilateral eye asymmetry", "Texture analysis indicates manipulation"],
        "secondary_findings": ["Wide lip spacing"],
        "regions_of_interest": ["left_eye", "mouth"],
        "conflicts": [],
        "box": [100, 100, 300, 300],
        "kp": [[150, 150], [250, 150], [200, 200], [180, 250], [220, 250]],
        "spatial_analysis": {
            "dominant_region": "left_eye",
            "regions_of_interest": ["left_eye", "mouth"],
            "attention_distribution": {"left_eye": 0.45, "mouth": 0.35, "nose": 0.1, "forehead": 0.05, "jawline": 0.05}
        }
    }
]

packet = EvidenceBuilder.build(
    verdict="Deepfake",
    confidence=92.0,
    faces=mock_faces,
    attention_outside_faces=0.05,
    model_type="ViT",
    global_fake_prob=0.88
)

print("--- Generated Prompt Text ---")
prompt_text = EvidenceBuilder.to_prompt_text(packet)
print(prompt_text)

print("\n--- Testing Provider Router ---")
# This will try Gemini first, then fall back
result = provider_router.get_explanation(packet)

print("\n--- Final Explanation ---")
print(json.dumps(result, indent=2))
