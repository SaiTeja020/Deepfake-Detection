
import os
import sys
import json
import gradio as gr
import torch
import numpy as np
import cv2
from PIL import Image
from transformers import ViTImageProcessor, ViTForImageClassification

# ------------------------------------------------------------------
# Import shared pipeline (from backend/)
# ------------------------------------------------------------------
_backend_dir = os.path.join(os.path.dirname(__file__), '..', 'backend')
sys.path.insert(0, os.path.abspath(_backend_dir))
from pipeline import DeepfakePipeline  # noqa: E402

# ------------------------------------------------------------------
# CONFIGURATION
# ------------------------------------------------------------------

MODEL_REPO = "SARVM/ViT_Deepfake"
HF_TOKEN   = os.getenv("HF_TOKEN")
DEVICE     = torch.device("cuda" if torch.cuda.is_available() else "cpu")

print(f"Loading model from {MODEL_REPO} to {DEVICE}...")

processor = ViTImageProcessor.from_pretrained(MODEL_REPO, token=HF_TOKEN)
model = ViTForImageClassification.from_pretrained(
    MODEL_REPO,
    token=HF_TOKEN,
    output_attentions=True,
)

model.config.id2label = {0: "FAKE", 1: "REAL"}
model.config.label2id = {"FAKE": 0, "REAL": 1}
model.to(DEVICE).eval()

# One shared pipeline instance (MTCNN + FaceMesh initialised lazily)
deepfake_pipeline = DeepfakePipeline(model, processor, DEVICE)
print("Pipeline ready.")

# ------------------------------------------------------------------
# ATTENTION ROLLOUT
# ------------------------------------------------------------------

def compute_attention_rollout(attentions):
    att_mat = torch.stack(attentions).squeeze(1)
    att_mat = att_mat.mean(dim=1)

    residual_att = torch.eye(att_mat.size(-1)).to(att_mat.device)
    aug_att_mat = att_mat + residual_att
    aug_att_mat = aug_att_mat / aug_att_mat.sum(dim=-1).unsqueeze(-1)

    joint_attentions = torch.zeros_like(aug_att_mat)
    joint_attentions[0] = aug_att_mat[0]

    for n in range(1, aug_att_mat.size(0)):
        joint_attentions[n] = aug_att_mat[n] @ joint_attentions[n - 1]

    return joint_attentions[-1]

# ------------------------------------------------------------------
# PREDICTION FUNCTION
# ------------------------------------------------------------------

def predict(image):
    """
    Run the multi-face pipeline on the uploaded image.

    Returns:
        verdict_label  — formatted verdict string shown by gr.Label
        confidence_txt — confidence string for gr.Textbox
        heatmap_img    — attention heatmap + face boxes (numpy RGB)
        face_summary   — plain-English per-face breakdown string
        details_json   — per-face JSON details for gr.JSON
    """
    if image is None:
        return None, None, None, None, None

    pil_image = image if isinstance(image, Image.Image) else Image.fromarray(image)

    # ---------------------------------------------------------------
    # Step 1 – Multi-face pipeline (MTCNN + geometry + fusion)
    # ---------------------------------------------------------------
    pipeline_result = deepfake_pipeline.run(pil_image)

    final_label  = pipeline_result["final_label"]   # Deepfake | Suspicious | Real | NoFaces
    final_score  = pipeline_result["confidence"]     # [0, 1]
    face_list    = pipeline_result["faces"]
    face_count   = len(face_list)

    # Map to display label
    if final_label == "Deepfake":
        display_label = "FAKE"
    elif final_label == "Suspicious":
        display_label = "SUSPICIOUS"
    else:
        display_label = "REAL"

    conf_pct = round(final_score * 100, 2)

    # ---------------------------------------------------------------
    # Step 2 – Attention rollout heatmap (full-image ViT pass)
    # ---------------------------------------------------------------
    inputs = processor(images=pil_image.convert("RGB"), return_tensors="pt").to(DEVICE)

    with torch.no_grad():
        outputs = model(**inputs, output_attentions=True)
        attentions = outputs.attentions

    rollout = compute_attention_rollout(attentions)
    mask = rollout[0, 1:]
    size = int(mask.shape[0] ** 0.5)
    mask = mask.reshape(size, size).cpu().numpy()

    w, h = pil_image.size
    mask = cv2.resize(mask, (w, h))
    mask = (mask - mask.min()) / (mask.max() - mask.min() + 1e-8)

    heatmap_bgr = cv2.applyColorMap(np.uint8(255 * mask), cv2.COLORMAP_JET)

    img_np  = np.array(pil_image.convert("RGB"))
    img_bgr = cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR)
    overlay = cv2.addWeighted(img_bgr, 0.6, heatmap_bgr, 0.4, 0)

    # Draw face bounding boxes on top of heatmap
    overlay = DeepfakePipeline.draw_face_boxes(pil_image, pipeline_result, heatmap_bgr=overlay)

    # Convert BGR → RGB for Gradio
    overlay_rgb = cv2.cvtColor(overlay, cv2.COLOR_BGR2RGB)

    # ---------------------------------------------------------------
    # Step 3 – Format outputs
    # ---------------------------------------------------------------
    verdict_dict   = {display_label: final_score}            # gr.Label input
    confidence_txt = f"{conf_pct}%  ({face_count} face(s) analysed)"

    # Plain-English per-face breakdown (the key user-facing improvement)
    face_lines = []
    for f in face_list:
        v      = f.get("face_verdict", "Real")
        score  = f["fused_score"]
        marker = "🔴" if v == "Deepfake" else ("🟠" if v == "Suspicious" else "🟢")
        face_lines.append(f"{marker}  Face {f['face_id']}: {v.upper()}  (score {score:.2f})")
    face_summary = "\n".join(face_lines) if face_lines else "No faces detected — full image analysed."

    # Clean per-face detail for gr.JSON (includes face_verdict)
    detail = {
        "final_label": final_label,
        "confidence": final_score,
        "face_count": face_count,
        "no_faces_detected": pipeline_result.get("no_faces_detected", False),
        "faces": [
            {
                "face_id":      f["face_id"],
                "face_verdict": f.get("face_verdict", "Real"),
                "box":          f["box"],
                "cnn_label":    f["cnn_label"],
                "cnn_conf":     f["cnn_conf"],
                "geom_score":   f["geom_score"],
                "fused_score":  f["fused_score"],
                "geometry":     f["geometry"],
            }
            for f in face_list
        ],
    }

    return verdict_dict, confidence_txt, overlay_rgb, face_summary, detail


# ------------------------------------------------------------------
# UI DESIGN
# ------------------------------------------------------------------

custom_css = """
/* Professional Adaptive Theme */
:root {
    --primary-blue: #2563eb;
    --hero-text: #0f172a;
}

.dark {
    --hero-text: #f8fafc;
}

body {
    background-color: var(--background-fill-primary);
}

.hero {
    text-align: center;
    font-family: 'Inter', sans-serif;
    font-size: 48px;
    font-weight: 800;
    letter-spacing: -0.04em;
    margin-top: 50px;
    color: var(--hero-text) !important;
}

.sub {
    text-align: center;
    opacity: 0.7;
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    margin-bottom: 40px;
    color: var(--body-text-color);
}

.glass {
    background: var(--block-background-fill) !important;
    border: 1px solid var(--border-color-primary) !important;
    border-radius: 12px !important;
    padding: 24px !important;
    box-shadow: var(--block-shadow);
    transition: all 0.2s ease;
}

.glass:hover {
    border-color: var(--primary-blue) !important;
    box-shadow: 0 4px 20px rgba(37, 99, 235, 0.1);
}

button.primary {
    background: var(--primary-blue) !important;
    color: white !important;
    border: none !important;
    font-weight: 600 !important;
    padding: 12px 24px !important;
    border-radius: 8px !important;
    box-shadow: 0 4px 12px rgba(37, 99, 235, 0.2) !important;
}

button.primary:hover {
    background: #1d4ed8 !important;
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(37, 99, 235, 0.3) !important;
}

.gr-label {
    font-weight: 600 !important;
    font-size: 12px !important;
    text-transform: uppercase;
    color: var(--primary-blue) !important;
}
"""

with gr.Blocks(
    css=custom_css,
    theme=gr.themes.Soft(
        primary_hue="blue",
        font=[gr.themes.GoogleFont("Inter"), "ui-sans-serif", "system-ui"]
    )
) as demo:

    gr.Markdown("<div class='hero'>FORESIGHT<span style='color:#3b82f6'>.</span></div>")
    gr.Markdown("<div class='sub'>Multi-Face Deep Intelligence Neural Analysis</div>")

    with gr.Row():
        with gr.Column():
            with gr.Group(elem_classes="glass"):
                input_image = gr.Image(type="pil", label="Source Input")
                run_btn = gr.Button("RUN DIAGNOSTIC", variant="primary")

        with gr.Column():
            with gr.Group(elem_classes="glass"):
                output_label = gr.Label(label="Classification Verdict")
                output_conf  = gr.Textbox(label="Confidence Rating", interactive=False)
                face_summary_output = gr.Textbox(
                    label="Per-Face Breakdown",
                    interactive=False,
                    lines=5,
                    placeholder="Results will show which individual faces are Deepfake / Suspicious / Real"
                )
                heatmap_output = gr.Image(label="Vulnerability Visualisation (Attention + Face Boxes)")

    with gr.Row():
        with gr.Column():
            with gr.Group(elem_classes="glass"):
                gr.Markdown("### Per-Face Analysis Details")
                gr.Markdown(
                    "Structured JSON output per the research report schema. "
                    "Each face entry shows MTCNN box, ViT CNN confidence, "
                    "MediaPipe geometry features, and the fused deepfake score."
                )
                json_output = gr.JSON(label="Pipeline Result")

    run_btn.click(
        fn=predict,
        inputs=input_image,
        outputs=[output_label, output_conf, heatmap_output, face_summary_output, json_output]
    )

if __name__ == "__main__":
    demo.launch()
