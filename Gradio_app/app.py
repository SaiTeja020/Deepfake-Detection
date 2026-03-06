
import os
import gradio as gr
import torch
import numpy as np
import cv2
from PIL import Image
from transformers import ViTImageProcessor, ViTForImageClassification
# from transformers import AutoModelForImageClassification, AutoImageProcessor

# -----------------------------
# CONFIGURATION
# -----------------------------

MODEL_REPO = "SARVM/ViT_Deepfake"
HF_TOKEN = os.getenv("HF_TOKEN")  # Set in Space secrets or local env
# HF_TOKEN = "hf_xxxxxxxxxxxxxxxxxxxx"  # Replace with your actual Hugging Face token for ocal testing

print(f"Loading model from {MODEL_REPO}...")

processor = ViTImageProcessor.from_pretrained(
    MODEL_REPO,
    token=HF_TOKEN
)

model = ViTForImageClassification.from_pretrained(
    MODEL_REPO,
    token=HF_TOKEN,
    output_attentions=True
)

# processor = AutoImageProcessor.from_pretrained(
#     MODEL_REPO,
#     token=HF_TOKEN
# )

# model = AutoModelForImageClassification.from_pretrained(
#     MODEL_REPO,
#     token=HF_TOKEN
# )

model.eval()

# Override labels to REAL / FAKE
model.config.id2label = {
    1: "REAL",
    0: "FAKE"
}

model.config.label2id = {
    "REAL": 1,
    "FAKE": 0
}

# -----------------------------
# ATTENTION ROLLOUT
# -----------------------------

def compute_attention_rollout(attentions):
    att_mat = torch.stack(attentions).squeeze(1)
    att_mat = att_mat.mean(dim=1)

    residual_att = torch.eye(att_mat.size(-1))
    aug_att_mat = att_mat + residual_att
    aug_att_mat = aug_att_mat / aug_att_mat.sum(dim=-1).unsqueeze(-1)

    joint_attentions = torch.zeros_like(aug_att_mat)
    joint_attentions[0] = aug_att_mat[0]

    for n in range(1, aug_att_mat.size(0)):
        joint_attentions[n] = aug_att_mat[n] @ joint_attentions[n - 1]

    return joint_attentions[-1]


# -----------------------------
# PREDICTION FUNCTION
# -----------------------------

def predict(image):
    if image is None:
        return None, None, None

    inputs = processor(images=image, return_tensors="pt")

    with torch.no_grad():
        outputs = model(**inputs, output_attentions=True)
        logits = outputs.logits
        attentions = outputs.attentions

    probs = torch.nn.functional.softmax(logits, dim=-1)
    confidence, predicted_class_idx = torch.max(probs, dim=-1)

    prediction = model.config.id2label[predicted_class_idx.item()]
    confidence_pct = round(confidence.item() * 100, 2)

    # Attention rollout
    rollout = compute_attention_rollout(attentions)

    mask = rollout[0, 1:]
    size = int(mask.shape[0] ** 0.5)
    mask = mask.reshape(size, size).cpu().numpy()

    mask = cv2.resize(mask, image.size)
    mask = (mask - mask.min()) / (mask.max() - mask.min() + 1e-8)

    heatmap = cv2.applyColorMap(
        np.uint8(255 * mask),
        cv2.COLORMAP_JET
    )

    overlay = cv2.addWeighted(
        np.array(image),
        0.6,
        heatmap,
        0.4,
        0
    )

    return prediction, f"{confidence_pct}%", overlay


# -----------------------------
# UI DESIGN
# -----------------------------

custom_css = """
/* Professional Adaptive Theme */
:root {
    --primary-blue: #2563eb;
    --hero-text: #0f172a; /* Dark slate for light mode */
}

.dark {
    --hero-text: #f8fafc; /* White for dark mode */
}

/* Background refinement */
body {
    background-color: var(--background-fill-primary);
}

/* Adaptive Typography */
.hero {
    text-align: center;
    font-family: 'Inter', sans-serif;
    font-size: 48px;
    font-weight: 800;
    letter-spacing: -0.04em;
    margin-top: 50px;
    /* This variable handles the visibility toggle */
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

/* Professional Container Styling */
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

/* Enterprise Button */
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

/* Label & Input tweaks for clarity */
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

    gr.Markdown(f"<div class='hero'>FORESIGHT<span style='color:#3b82f6'>.</span></div>")
    gr.Markdown("<div class='sub'>Deep Intelligence Neural Analysis</div>")

    with gr.Row():
        with gr.Column():
            with gr.Group(elem_classes="glass"):
                input_image = gr.Image(type="pil", label="Source Input")
                run_btn = gr.Button("RUN DIAGNOSTIC", variant="primary")

        with gr.Column():
            with gr.Group(elem_classes="glass"):
                output_label = gr.Label(label="Classification Verdict")
                output_conf = gr.Textbox(label="Confidence Rating", interactive=False)
                heatmap_output = gr.Image(label="Vulnerability Visualization")

    run_btn.click(
        fn=predict,
        inputs=input_image,
        outputs=[output_label, output_conf, heatmap_output]
    )

if __name__ == "__main__":
    demo.launch()
