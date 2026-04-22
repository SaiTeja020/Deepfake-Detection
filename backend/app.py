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
from pipeline import DeepfakePipeline

load_dotenv()

from llm_adapter import llm_service

app = Flask(__name__)
CORS(app)

# Supabase Configuration
url: str = os.getenv("SUPABASE_URL")
key: str = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(url, key)

# Firebase Configuration
firebase_creds_path = os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH")
if firebase_creds_path and os.path.exists(firebase_creds_path):
    cred = credentials.Certificate(firebase_creds_path)
    firebase_admin.initialize_app(cred)
    db = firestore.client()
else:
    print("Warning: Firebase service account path not found or invalid.")
    db = None

# Deepfake Model Configuration
MODEL_NAME = "SARVM/ViT_Deepfake"
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

model = None
processor = None
transform = None
deepfake_pipeline = None

def compute_attention_rollout(attentions):
    """Refined attention rollout calculation from Gradio reference"""
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

def get_model():
    global model, processor, transform, deepfake_pipeline
    if model is None:
        try:
            hf_token = os.getenv("HF_TOKEN")
            print(f"Loading model {MODEL_NAME} to {DEVICE}...")

            processor = ViTImageProcessor.from_pretrained(
                MODEL_NAME,
                token=hf_token
            )

            model = ViTForImageClassification.from_pretrained(
                MODEL_NAME,
                token=hf_token,
                output_attentions=True
            )

            # Label Correction: SARVM model uses 0:FAKE, 1:REAL
            model.config.id2label = {0: "FAKE", 1: "REAL"}
            model.config.label2id = {"FAKE": 0, "REAL": 1}

            model.to(DEVICE)
            model.eval()

            # Transform as fallback if processor is not used directly
            transform = transforms.Compose([
                transforms.Resize((224, 224)),
                transforms.ToTensor(),
                transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
            ])

            # Initialise the multi-face pipeline (MTCNN + MediaPipe loaded lazily)
            deepfake_pipeline = DeepfakePipeline(model, processor, DEVICE)
            print("Deepfake model, processor, and pipeline initialised successfully.")
        except Exception as e:
            print(f"CRITICAL: Failed to load model: {e}")
    return model, processor, transform


def is_informative_explanation(text):
    if not text or not isinstance(text, str):
        return False
    cleaned = text.strip()
    if len(cleaned.split()) < 12:
        return False
    normalized = cleaned.lower()
    if normalized.startswith('analysis using') or normalized.startswith('analysis:'):
        return False
    return True


@app.route('/api/users/sync', methods=['POST'])
def sync_user():
    data = request.json

    user_data = {
        "firebase_uid": data.get("firebase_uid"),
        "email": data.get("email"),
        "name": data.get("name"),
        "profile_pic_url": data.get("profile_pic_url"),
        "bio": data.get("bio"),
        "save_history": data.get("save_history", True)
    }

    if not user_data["firebase_uid"] or not user_data["email"]:
        return jsonify({"error": "Missing required fields"}), 400

    try:
        # remove None values
        user_data = {k: v for k, v in user_data.items() if v is not None}

        supabase.table("users").upsert(
            user_data,
            on_conflict="firebase_uid"
        ).execute()

        if db:
            db.collection("users").document(user_data["firebase_uid"]).set(user_data, merge=True)

        return jsonify({"message": "User synced successfully"}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/users/<firebase_uid>', methods=['GET'])
def get_user(firebase_uid):
    try:
        res = supabase.table("users").select("*").eq("firebase_uid", firebase_uid).execute()
        if res.data:
            return jsonify(res.data[0]), 200
        return jsonify({"error": "User not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500

def upload_to_supabase(base64_str, bucket, folder=""):
    """Helper to upload base64 image to Supabase Storage"""
    try:
        if not base64_str or not base64_str.startswith("data:image"):
            return None, "Invalid image data"
            
        # Extract format and data
        match = re.search(r'data:image/(\w+);base64,(.*)', base64_str)
        if not match:
            return None, "Malformed base64 string"
        
        ext = match.group(1)
        try:
            img_data = base64.b64decode(match.group(2))
        except Exception as e:
            return None, f"Base64 decode error: {str(e)}"
        
        file_name = f"{folder}/{uuid.uuid4()}.{ext}" if folder else f"{uuid.uuid4()}.{ext}"
        
        # Upload to Supabase Storage
        try:
            res = supabase.storage.from_(bucket).upload(file_name, img_data, {"content-type": f"image/{ext}"})
        except Exception as e:
            return None, f"Supabase Storage Upload Error: {str(e)}"
        
        # Get Public URL
        try:
            public_url = supabase.storage.from_(bucket).get_public_url(file_name)
            return public_url, None
        except Exception as e:
            return None, f"Supabase Public URL Error: {str(e)}"
    except Exception as e:
        return None, f"Unexpected error: {str(e)}"

@app.route('/api/upload/profile-pic', methods=['POST'])
def upload_profile_pic():
    data = request.json
    base64_image = data.get('image')
    firebase_uid = data.get('firebase_uid')
    
    if not base64_image or not firebase_uid:
        return jsonify({"error": "Missing image or uid"}), 400
        
    url, error = upload_to_supabase(base64_image, "profile-pictures", folder=firebase_uid)
    if url:
        try:
            # Also update the user's profile_pic_url in the database directly
            supabase.table("users").update({"profile_pic_url": url}).eq("firebase_uid", firebase_uid).execute()
        except Exception as e:
            print(f"Failed to update user profile_pic_url in db: {e}")
            pass
            
        return jsonify({"url": url}), 200
    return jsonify({"error": error or "Upload failed"}), 500

@app.route('/api/upload/scan', methods=['POST'])
def upload_scan_media():
    data = request.json
    original_image = data.get('original_image')
    heatmap_image = data.get('heatmap_image')
    firebase_uid = data.get('firebase_uid')
    
    if not firebase_uid:
        return jsonify({"error": "Missing uid"}), 400
        
    res = {}
    errors = []
    if original_image:
        url, error = upload_to_supabase(original_image, "user-uploads", folder=firebase_uid)
        if url: res['original_url'] = url
        else: errors.append(f"Original upload failed: {error}")
        
    if heatmap_image:
        url, error = upload_to_supabase(heatmap_image, "heatmaps", folder=firebase_uid)
        if url: res['heatmap_url'] = url
        else: errors.append(f"Heatmap upload failed: {error}")
        
    if errors and not res:
        return jsonify({"error": "; ".join(errors)}), 500
        
    return jsonify(res), 200

@app.route('/api/scans/save', methods=['POST'])
def save_scan():
    data = request.json
    user_id = data.get('user_id') # Supabase UUID or Firebase UID? Assuming Supabase UUID linked by firebase_uid
    firebase_uid = data.get('firebase_uid')
    file_name = data.get('file_name')
    original_media_url = data.get('original_media_url')
    heatmap_url = data.get('heatmap_url')
    result = data.get('result')
    confidence = data.get('confidence')
    model_used = data.get('model_used')
    explanation = data.get('explanation')

    try:
        # Get internal Supabase ID if firebase_uid is provided
        if firebase_uid and not user_id:
            user_query = supabase.table("users").select("id").eq("firebase_uid", firebase_uid).execute()
            if user_query.data:
                user_id = user_query.data[0]['id']

        scan_data = {
            "user_id": user_id,
            "file_name": file_name,
            "original_media_url": original_media_url,
            "heatmap_url": heatmap_url,
            "result": result,
            "confidence": confidence,
            "model_used": model_used,
            "explanation": explanation
        }

        supabase.table("scan_history").insert(scan_data).execute()
        return jsonify({"message": "Scan history saved successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/scans/history/<firebase_uid>', methods=['GET', 'DELETE'])
def handle_scan_history(firebase_uid):
    try:
        if request.method == 'GET':
            # First get internal user id
            user_query = supabase.table("users").select("id").eq("firebase_uid", firebase_uid).execute()
            if not user_query.data:
                return jsonify([]), 200
            
            user_id = user_query.data[0]['id']
            # Fallback to order by id desc if available
            history_query = supabase.table("scan_history").select("*").eq("user_id", user_id).execute()
            
            return jsonify(history_query.data), 200
            
        elif request.method == 'DELETE':
            user_query = supabase.table("users").select("id").eq("firebase_uid", firebase_uid).execute()
            if not user_query.data:
                return jsonify({"error": "User not found"}), 404
            
            user_id = user_query.data[0]['id']
            supabase.table("scan_history").delete().eq("user_id", user_id).execute()
            
            return jsonify({"message": "History cleared successfully"}), 200
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/detect', methods=['POST'])
def detect_deepfake():
    data = request.json
    base64_image = data.get('image')
    firebase_uid = data.get('firebase_uid', 'guest')

    if not base64_image:
        return jsonify({"error": "Missing image data"}), 400

    try:
        # Load model lazily (also initialises deepfake_pipeline)
        m, p, t = get_model()
        if m is None or deepfake_pipeline is None:
            return jsonify({"error": "Deepfake model is not loaded on server."}), 503

        # Decode base64 image
        if ',' in base64_image:
            image_content = base64_image.split(',')[1]
        else:
            image_content = base64_image

        img_data = base64.b64decode(image_content)
        image = Image.open(io.BytesIO(img_data)).convert("RGB")

        import time
        start_time = time.time()

        # ================================================================
        # Step 1 — Multi-face pipeline (MTCNN + geometry + score fusion)
        # ================================================================
        pipeline_result = deepfake_pipeline.run(image)

        # ================================================================
        # Step 2 — Attention rollout heatmap (full-image ViT pass)
        # ================================================================
        inputs_full = p(images=image, return_tensors="pt").to(DEVICE)
        with torch.no_grad():
            outputs_full = m(**inputs_full, output_attentions=True)
            attentions = outputs_full.attentions

        end_time = time.time()
        inference_time = int((end_time - start_time) * 1000)

        rollout = compute_attention_rollout(attentions)
        mask = rollout[0, 1:]
        size = int(mask.shape[0] ** 0.5)
        mask = mask.reshape(size, size).cpu().numpy()

        orig_width, orig_height = image.size
        mask = cv2.resize(mask, (orig_width, orig_height))
        mask = (mask - mask.min()) / (mask.max() - mask.min() + 1e-8)

        heatmap_bgr = cv2.applyColorMap(np.uint8(255 * mask), cv2.COLORMAP_JET)
        img_np = np.array(image)
        img_bgr = cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR)
        overlay = cv2.addWeighted(img_bgr, 0.6, heatmap_bgr, 0.4, 0)

        # Draw face bounding boxes from pipeline on top of heatmap
        overlay = DeepfakePipeline.draw_face_boxes(image, pipeline_result, heatmap_bgr=overlay)

        _, buffer = cv2.imencode('.jpg', overlay)
        overlay_base64 = base64.b64encode(buffer).decode('utf-8')
        overlay_data_uri = f"data:image/jpeg;base64,{overlay_base64}"

        heatmap_url, _ = upload_to_supabase(overlay_data_uri, "heatmaps", folder=firebase_uid)

        # ================================================================
        # Step 3 — Map pipeline verdict to frontend labels
        # ================================================================
        final_label = pipeline_result["final_label"]   # Deepfake | Suspicious | Real | NoFaces
        final_score = pipeline_result["confidence"]     # [0, 1]
        face_list   = pipeline_result["faces"]

        # Legacy 'prediction' field the frontend expects (Fake / Suspicious / Real)
        if final_label == "Deepfake":
            final_prediction = "Fake"
        elif final_label == "Suspicious":
            final_prediction = "Suspicious"
        else:
            final_prediction = "Real"

        conf_pct = round(final_score * 100, 2)
        print(f"[Pipeline] verdict={final_label} ({conf_pct}%), faces={len(face_list)}")

        # ================================================================
        # Step 4 — Build per-face context for LLM and fallback text
        # ================================================================
        face_lines = []
        for f in face_list:
            geom = f["geometry"]
            face_lines.append(
                f"Face {f['face_id']}: verdict={f['cnn_label']} "
                f"(cnn={f['cnn_conf']:.2f}, fused={f['fused_score']:.2f}), "
                f"eye_asymmetry={geom['eye_asymmetry']:.3f}, "
                f"lip_distance={geom['lip_distance']:.1f}px"
            )
        face_context = "\n".join(face_lines) or "No individual face data."

        fallback_explanation = (
            f"Analysis of {len(face_list)} face(s): "
            + ("Anomalous facial geometry and texture artifacts were detected, consistent with synthetic generation."
               if final_prediction in ("Fake", "Suspicious")
               else "Statistically consistent biological patterns and lighting transitions were observed.")
        )
        fallback_suspicious_domains = (
            ["Periorbital margin", "Mandibular texture", "Eye asymmetry"]
            if final_prediction in ("Fake", "Suspicious")
            else ["Natural eye geometry", "Consistent skin tone", "Symmetric facial structure"]
        )
        fallback_model_consensus = (
            f"Multi-face analysis across {len(face_list)} face(s) via geometry-augmented ViT forensic protocol."
        )

        # ================================================================
        # Step 5 — LLM explanation (geometry-aware)
        # ================================================================
        try:
            llm_response = llm_service.get_explanation(
                final_prediction,
                conf_pct,
                data.get('model_type', 'ViT'),
                image_reference=None,
                heatmap_reference=None,
                pipeline_context=face_context,
            )

            if isinstance(llm_response, dict):
                explanation = llm_response.get('explanation', '').strip() or fallback_explanation
                suspicious_domains = llm_response.get('suspicious_domains', []) or list(fallback_suspicious_domains)
                model_consensus = llm_response.get('model_consensus', '').strip() or fallback_model_consensus
            else:
                expl_candidate = str(llm_response).strip() if llm_response else ''
                explanation = expl_candidate if is_informative_explanation(expl_candidate) else fallback_explanation
                suspicious_domains = list(fallback_suspicious_domains)
                model_consensus = fallback_model_consensus
        except Exception as e:
            print(f"LLM adapter error: {e}")
            explanation = fallback_explanation
            suspicious_domains = list(fallback_suspicious_domains)
            model_consensus = fallback_model_consensus

        return jsonify({
            # --- legacy fields (frontend compatible) ---
            "prediction": final_prediction,
            "confidence": conf_pct,
            "inferenceTime": inference_time,
            "attentionMapUrl": heatmap_url or "https://picsum.photos/seed/heatmap/400/400",
            "explanation": explanation,
            "suspicious_domains": suspicious_domains,
            "model_consensus": model_consensus,
            # --- extended pipeline fields ---
            "final_label": final_label,
            "faces": face_list,
            "face_count": len(face_list),
            "no_faces_detected": pipeline_result.get("no_faces_detected", False),
        }), 200

    except Exception as e:
        print(f"Inference error: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
