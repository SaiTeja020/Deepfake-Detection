import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from supabase import create_client, Client
import firebase_admin
from firebase_admin import credentials, firestore
from dotenv import load_dotenv
import base64
import uuid
import re
import io
import torch
import numpy as np
import cv2
from transformers import ViTImageProcessor, ViTForImageClassification
from PIL import Image
import torchvision.transforms as transforms

load_dotenv()

from llm_adapter import llm_service

app = Flask(__name__)
CORS(app)

# =========================
# ✅ ROOT ROUTE (FIXED)
# =========================
@app.route("/")
def home():
    return jsonify({
        "status": "Backend is running 🚀",
        "available_routes": [
            "/api/detect",
            "/api/users/sync",
            "/api/users/<id>",
            "/api/scans/history/<id>"
        ]
    })

# =========================
# Supabase (SAFE INIT)
# =========================
url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_KEY")

if url and key:
    supabase: Client = create_client(url, key)
    print("✅ Supabase connected")
else:
    print("⚠️ Supabase not configured")
    supabase = None

# =========================
# Firebase (SAFE INIT)
# =========================
firebase_creds_path = os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH")

if firebase_creds_path and os.path.exists(firebase_creds_path):
    cred = credentials.Certificate(firebase_creds_path)
    firebase_admin.initialize_app(cred)
    db = firestore.client()
    print("✅ Firebase connected")
else:
    print("⚠️ Firebase not configured")
    db = None

# =========================
# MODEL CONFIG
# =========================
MODEL_NAME = "SARVM/ViT_Deepfake"
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

model = None
processor = None

def get_model():
    global model, processor
    if model is None:
        print("Loading model...")
        processor = ViTImageProcessor.from_pretrained(MODEL_NAME)
        model = ViTForImageClassification.from_pretrained(
            MODEL_NAME,
            output_attentions=True
        )
        model.to(DEVICE)
        model.eval()
    return model, processor

# =========================
# DETECT ROUTE
# =========================
@app.route('/api/detect', methods=['POST'])
def detect():
    data = request.json
    base64_image = data.get("image")

    if not base64_image:
        return jsonify({"error": "No image provided"}), 400

    try:
        model, processor = get_model()

        image_content = base64_image.split(',')[1]
        img_data = base64.b64decode(image_content)
        image = Image.open(io.BytesIO(img_data)).convert("RGB")

        inputs = processor(images=image, return_tensors="pt").to(DEVICE)

        with torch.no_grad():
            outputs = model(**inputs)
            logits = outputs.logits

        probs = torch.softmax(logits, dim=1)
        confidence, pred = torch.max(probs, dim=1)

        result = "Fake" if pred.item() == 0 else "Real"

        return jsonify({
            "prediction": result,
            "confidence": round(confidence.item() * 100, 2)
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500

# =========================
# MAIN
# =========================
if __name__ == "__main__":
    app.run(debug=True, port=5000)