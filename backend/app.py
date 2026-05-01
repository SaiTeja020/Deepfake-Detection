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
from transformers import AutoImageProcessor, AutoModelForImageClassification, ViTImageProcessor, SwinForImageClassification, ViTForImageClassification
from huggingface_hub import hf_hub_download
import traceback
import threading
import time
import logging
from PIL import Image
import torchvision.transforms as transforms
from pipeline import DeepfakePipeline
from forensic_interpreter import ForensicInterpreter
from evidence_builder import EvidenceBuilder

load_dotenv()

from llm_adapter import provider_router, structured_to_legacy

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

# Supabase Configuration
url: str = os.getenv("SUPABASE_URL")
key: str = os.getenv("SUPABASE_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
logger.info(f"Supabase URL: {url}")
logger.info(f"Supabase key loaded: {'YES' if key else 'NO'} (length: {len(key) if key else 0})")
supabase: Client = create_client(url, key)

# Firebase Configuration
firebase_creds_path = os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH")
db = None
if firebase_creds_path and os.path.exists(firebase_creds_path):
    try:
        cred = credentials.Certificate(firebase_creds_path)
        firebase_admin.initialize_app(cred)
        db = firestore.client()
        logger.info("Firebase initialized successfully.")
    except Exception as e:
        logger.error(f"Firebase initialization failed: {e}")
        db = None # Ensure db is None if init fails

# Device configuration
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"Using device: {DEVICE}")

# Model management
MODEL_PATHS = {
    "ViT": "SARVM/ViT_Deepfake",
    "Swin Transformer": "microsoft/swin-tiny-patch4-window7-224",
}
model_cache = {"models": {}, "processors": {}, "names": {}}
deepfake_pipeline = None

def get_model(model_type="ViT"):
    global model_cache
    
    if model_type not in MODEL_PATHS:
        model_type = "ViT"
        
    model_name = MODEL_PATHS[model_type]
    
    if model_type not in model_cache["models"]:
        try:
            hf_token = os.getenv("HF_TOKEN")
            print(f"Loading {model_type} model ({model_name})...")
            actual_model_name = model_name
            
            # Load processor
            try:
                processor = AutoImageProcessor.from_pretrained(model_name, token=hf_token)
            except Exception as pe:
                print(f"Warning: Image processor not found for {model_name} ({pe}). Falling back to standard Swin processor.")
                processor = AutoImageProcessor.from_pretrained("microsoft/swin-tiny-patch4-window7-224")
            
            # Load model with forced standard loading to avoid meta-tensor issues
            try:
                model = AutoModelForImageClassification.from_pretrained(
                    model_name, 
                    token=hf_token,
                    output_attentions=True,
                    low_cpu_mem_usage=False,
                    ignore_mismatched_sizes=True
                )
            except Exception as me:
                print(f"Warning: AutoModel failed for {model_name} ({me}). Trying specific class fallback.")
                if model_type == "Swin Transformer":
                    from transformers import SwinForImageClassification as model_class
                else:
                    from transformers import ViTForImageClassification as model_class
                
                model = model_class.from_pretrained(
                    model_name, 
                    token=hf_token, 
                    output_attentions=True,
                    low_cpu_mem_usage=False
                )
            
            # Label Correction - Set BEFORE moving to device
            if hasattr(model.config, 'num_labels') and model.config.num_labels == 2:
                model.config.id2label = {0: "FAKE", 1: "REAL"}
                model.config.label2id = {"FAKE": 0, "REAL": 1}
            
            model.to(DEVICE)
            model.eval()
            
            # Cache them
            model_cache["models"][model_type] = model
            model_cache["processors"][model_type] = processor
            model_cache["names"][model_type] = actual_model_name
            
            print(f"{model_type} initialized successfully ({actual_model_name}).")
        except Exception as e:
            print(f"CRITICAL: Failed to load {model_type} model: {e}")
            traceback.print_exc()
            return None, None, None, None
            
    return model_cache["models"][model_type], model_cache["processors"][model_type], None, model_cache["names"][model_type]

def compute_vit_rollout(attentions):
    """Attention rollout for ViT models"""
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

def compute_swin_heatmap(attentions):
    """Simplified heatmap for Swin Transformer"""
    try:
        last_stage_att = attentions[-1].detach().cpu()
        att_map = last_stage_att.mean(dim=1).squeeze(0)
        importance = att_map.sum(dim=0)
        s = int(np.sqrt(importance.size(0)))
        return importance.view(s, s).numpy()
    except Exception:
        return None

def upload_to_supabase(image_data: str, bucket: str, folder: str = "") -> tuple[str | None, str | None]:
    """Helper to upload base64 image data to Supabase Storage."""
    try:
        if "," in image_data:
            header, encoded = image_data.split(",", 1)
            file_ext = header.split("/")[1].split(";")[0]
            content = base64.b64decode(encoded)
        else:
            content = base64.b64decode(image_data)
            file_ext = "jpg"

        file_path = f"{folder}/{uuid.uuid4()}.{file_ext}" if folder else f"{uuid.uuid4()}.{file_ext}"
        
        supabase.storage.from_(bucket).upload(file_path, content, {"content-type": f"image/{file_ext}"})
        public_url = supabase.storage.from_(bucket).get_public_url(file_path)
        return public_url, None
    except Exception as e:
        return None, str(e)

@app.route('/api/users/sync', methods=['POST'])
def sync_user():
    user_data = request.json
    if not user_data or "firebase_uid" not in user_data:
        return jsonify({"error": "Missing user data"}), 400
    
    firebase_uid = user_data["firebase_uid"]
    logger.info(f"Syncing user: {firebase_uid}")
    logger.info(f"Received payload keys: {list(user_data.keys())}")
    
    errors = []
    supabase_ok = False
    
    # 1. Sync to Supabase — filter to only known columns
    VALID_COLUMNS = ["firebase_uid", "email", "name", "profile_pic_url", "bio", "save_history"]
    filtered_data = {k: v for k, v in user_data.items() if k in VALID_COLUMNS}
    # Replace None with defaults for NOT NULL columns
    filtered_data.setdefault("bio", "")
    filtered_data.setdefault("profile_pic_url", "")
    if filtered_data.get("bio") is None:
        filtered_data["bio"] = ""
    if filtered_data.get("profile_pic_url") is None:
        filtered_data["profile_pic_url"] = ""
    logger.info(f"Filtered Supabase payload: {filtered_data}")
    
    try:
        logger.info(f"Attempting Supabase upsert for {firebase_uid}")
        res = supabase.table("users").upsert(filtered_data, on_conflict="firebase_uid").execute()
        logger.info(f"Supabase response data: {res.data}")
        if res.data:
            supabase_ok = True
            logger.info(f"Supabase sync successful for {firebase_uid}, rows: {len(res.data)}")
        else:
            err_msg = f"Supabase upsert returned empty data for {firebase_uid}"
            logger.error(err_msg)
            errors.append(err_msg)
    except Exception as e:
        err_msg = f"Supabase sync failed: {str(e)}"
        logger.error(err_msg)
        import traceback
        logger.error(traceback.format_exc())
        errors.append(err_msg)
    
    # 2. Sync to Firebase Firestore if available (non-blocking)
    if db:
        try:
            logger.info(f"Attempting Firestore sync for {firebase_uid}")
            db.collection("users").document(firebase_uid).set(user_data, merge=True)
            logger.info(f"Firestore sync successful for {firebase_uid}")
        except Exception as e:
            err_msg = f"Firestore sync failed: {str(e)}"
            logger.error(err_msg)
            if "invalid_grant" in str(e).lower() or "signature" in str(e).lower():
                err_msg = "Firebase Auth Error: Invalid Service Account Credentials (JWT Signature)."
            errors.append(err_msg)
    else:
        logger.warning("Firestore sync skipped: DB client not initialized")

    # If Supabase succeeded, return 200 even if Firestore failed
    if supabase_ok:
        return jsonify({
            "message": "User synced successfully",
            "warnings": errors if errors else None
        }), 200

    return jsonify({
        "message": "User sync failed",
        "errors": errors
    }), 500

@app.route('/api/users/<uid>', methods=['GET'])
def get_user_profile(uid):
    try:
        # Try fetching from Supabase
        res = supabase.table("users").select("*").eq("firebase_uid", uid).execute()
        
        if res.data and len(res.data) > 0:
            return jsonify(res.data[0]), 200
            
        # Self-healing: If not in Supabase, try to get basic info from Firebase
        if db:
            print(f"DEBUG: Profile {uid} missing in Supabase. Attempting self-healing from Firebase...")
            user_ref = db.collection("users").document(uid).get()
            if user_ref.exists:
                user_data = user_ref.to_dict()
                # Ensure NOT NULL columns have defaults
                user_data.setdefault("bio", "")
                user_data.setdefault("profile_pic_url", "")
                if user_data.get("bio") is None:
                    user_data["bio"] = ""
                if user_data.get("profile_pic_url") is None:
                    user_data["profile_pic_url"] = ""
                # Auto-sync back to Supabase
                supabase.table("users").upsert(user_data, on_conflict="firebase_uid").execute()
                return jsonify(user_data), 200
                
        return jsonify({"error": "Profile not found"}), 404
    except Exception as e:
        print(f"DEBUG: Profile fetch error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/scans/history/<uid>', methods=['GET'])
def get_history(uid):
    try:
        # First lookup internal user_id
        user_res = supabase.table("users").select("id").eq("firebase_uid", uid).execute()
        if not user_res.data:
            return jsonify([]), 200
            
        user_uuid = user_res.data[0]["id"]
        history = supabase.table("scan_history").select("*").eq("user_id", user_uuid).order("created_at", desc=True).execute()
        return jsonify(history.data), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/scans/save', methods=['POST'])
def save_scan():
    data = request.json
    try:
        # Translate firebase_uid to user_id for the database
        fb_uid = data.pop("firebase_uid", None)
        if fb_uid:
            user_res = supabase.table("users").select("id").eq("firebase_uid", fb_uid).execute()
            if user_res.data:
                data["user_id"] = user_res.data[0]["id"]
        
        res = supabase.table("scan_history").insert(data).execute()
        return jsonify(res.data), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/upload/scan', methods=['POST'])
def upload_scan_media():
    data = request.json
    if not data or "firebase_uid" not in data:
        return jsonify({"error": "Missing data"}), 400
    
    uid = data["firebase_uid"]
    original_base64 = data.get("original_image")
    heatmap_base64 = data.get("heatmap_image")
    
    res = {}
    try:
        if original_base64:
            url, err = upload_to_supabase(original_base64, "user-uploads", folder=uid)
            if url: res["original_url"] = url
            elif err: logger.error(f"Original upload failed: {err}")
            
        if heatmap_base64:
            # If it's already a URL (from detection result), just pass it back
            if heatmap_base64.startswith("http"):
                res["heatmap_url"] = heatmap_base64
            else:
                url, err = upload_to_supabase(heatmap_base64, "heatmaps", folder=uid)
                if url: res["heatmap_url"] = url
                elif err: logger.error(f"Heatmap upload failed: {err}")
                
        return jsonify(res), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/detect', methods=['POST'])
def detect_deepfake():
    global deepfake_pipeline
    data = request.json
    if not data or 'image' not in data:
        return jsonify({"error": "No image provided"}), 400

    base64_image = data.get('image')
    firebase_uid = data.get('firebase_uid', 'guest')
    model_type_used = data.get('model_type', 'ViT')
    
    try:
        m, p, t, loaded_name = get_model(model_type_used)
        if m is None: return jsonify({"error": "Model load failed"}), 503
        
        # Initialize pipeline singleton or update if model changed
        if deepfake_pipeline is None or deepfake_pipeline.model is not m:
            deepfake_pipeline = DeepfakePipeline(m, p, DEVICE)

        # Process image
        if base64_image.startswith('data:image'):
            image_content = base64_image.split(',')[1]
        else:
            image_content = base64_image
        
        img_data = base64.b64decode(image_content)
        image = Image.open(io.BytesIO(img_data)).convert("RGB")
        
        start_time = time.time()
        
        # heatmap first (to get outside_fraction)
        if p is None:
            logger.error("Image processor is None - cannot process image")
            return jsonify({"error": "System configuration error: Image processor missing"}), 500

        try:
            processed_inputs = p(images=image, return_tensors="pt")
            if processed_inputs is None:
                raise ValueError("Image processor returned None")
            inputs_full = processed_inputs.to(DEVICE)
        except Exception as e:
            logger.error(f"Failed to process image: {e}")
            traceback.print_exc()
            return jsonify({"error": f"Image processing failed: {str(e)}"}), 500

        with torch.no_grad():
            outputs_full = m(**inputs_full, output_attentions=True)
            attentions = outputs_full.attentions
            probs_full = torch.softmax(outputs_full.logits, dim=-1).squeeze()
            label2id = getattr(m.config, 'label2id', {})
            # Ensure index exists
            fake_idx = label2id.get("FAKE", 0)
            if isinstance(probs_full, torch.Tensor) and probs_full.dim() > 0:
                global_fake_prob = float(probs_full[fake_idx].item())
            else:
                global_fake_prob = float(probs_full.item())

        mask = None
        outside_fraction = 0.0
        if attentions:
            try:
                if "Swin" in str(type(m)):
                    mask = compute_swin_heatmap(attentions)
                else:
                    rollout = compute_vit_rollout(attentions)
                    mask_raw = rollout[0, 1:]
                    s = int(np.sqrt(mask_raw.size(0)))
                    mask = mask_raw.reshape(s, s).cpu().numpy()
                
                if mask is not None:
                    mask = (mask - mask.min()) / (mask.max() - mask.min() + 1e-8)
                    mask = cv2.resize(mask, image.size)
            except Exception as e: print(f"Heatmap error: {e}")

        # Run pipeline with attention awareness
        try:
            mask_val = float(mask.mean()) if mask is not None else 0.0
            pipeline_result = deepfake_pipeline.run(image, outside_fraction=mask_val)
        except Exception as e:
            logger.error(f"Pipeline run failed: {e}")
            traceback.print_exc()
            return jsonify({"error": f"Pipeline analysis failed: {str(e)}"}), 500

        face_list = pipeline_result["faces"]
        
        # Calculate outside_fraction properly using face boxes
        if mask is not None and face_list:
            face_mask = np.zeros(mask.shape, dtype=bool)
            for f in face_list:
                x1, y1, x2, y2 = f["box"]
                face_mask[y1:y2, x1:x2] = True
            
            total_att = mask.sum()
            if total_att > 1e-8:
                outside_fraction = float(mask[~face_mask].sum() / total_att)

        overlay = None
        heatmap_url = None
        facemesh_url = None
        
        if mask is not None:
            try:
                heatmap = (mask * 255).astype(np.uint8)
                heatmap = cv2.applyColorMap(heatmap, cv2.COLORMAP_JET)
                img_bgr = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
                overlay = cv2.addWeighted(img_bgr, 0.6, heatmap, 0.4, 0)
                overlay = DeepfakePipeline.draw_face_boxes(image, pipeline_result, heatmap_bgr=overlay)
                
                _, buf = cv2.imencode(".jpg", overlay)
                heatmap_url, _ = upload_to_supabase(f"data:image/jpeg;base64,{base64.b64encode(buf).decode()}", "heatmaps", folder=firebase_uid)
                
                facemesh_img = DeepfakePipeline.draw_face_mesh(image, face_list)
                if facemesh_img is not None:
                    _, fmb = cv2.imencode(".jpg", cv2.cvtColor(np.array(facemesh_img), cv2.COLOR_RGB2BGR))
                    facemesh_url, _ = upload_to_supabase(f"data:image/jpeg;base64,{base64.b64encode(fmb).decode()}", "heatmaps", folder=f"{firebase_uid}/facemesh")
            except Exception as e: print(f"Visualization error: {e}")

        inference_time = round((time.time() - start_time) * 1000)
        conf_pct = pipeline_result["confidence"]
        final_label = pipeline_result["final_label"]

        # Build Forensic Evidence Packet
        interpreter = ForensicInterpreter()
        face_interpretations = [interpreter.interpret_face(f, mask, global_fake_prob) for f in face_list]
        evidence_packet = EvidenceBuilder.build(
            verdict=final_label, # Preserve nuance (Deepfake/Suspicious/Uncertain)
            confidence=conf_pct,
            faces=face_interpretations,
            attention_outside_faces=outside_fraction,
            model_type=model_type_used,
            global_fake_prob=global_fake_prob
        )

        # Generate LLM Explanation
        img_data = base64.b64decode(image_content)
        structured_explanation = provider_router.get_explanation(
            evidence_packet=evidence_packet,
            image=image,
            heatmap=Image.fromarray(cv2.cvtColor(overlay, cv2.COLOR_BGR2RGB)) if overlay is not None else None,
            image_bytes=img_data
        )
        legacy = structured_to_legacy(structured_explanation)

        serializable_faces = []
        for f in face_list:
            clean_face = {}
            for k, v in f.items():
                if k.startswith('_'): continue
                if isinstance(v, (np.float32, np.float64)): clean_face[k] = float(v)
                elif isinstance(v, (np.int32, np.int64)): clean_face[k] = int(v)
                elif isinstance(v, dict): clean_face[k] = {sk: (float(sv) if isinstance(sv, (np.float32, np.float64)) else sv) for sk, sv in v.items()}
                else: clean_face[k] = v
            serializable_faces.append(clean_face)

        return jsonify({
            "prediction": str(final_label),
            "confidence": float(conf_pct),
            "inferenceTime": int(inference_time),
            "attentionMapUrl": heatmap_url or "https://picsum.photos/seed/heatmap/400/400",
            "facemeshUrl": facemesh_url,
            "explanation": str(legacy["explanation"]),
            "suspicious_domains": legacy["suspicious_domains"],
            "model_consensus": str(legacy["model_consensus"]),
            "structured_explanation": structured_explanation,
            "final_label": str(final_label),
            "faces": serializable_faces,
            "face_count": int(len(face_list)),
            "no_faces_detected": bool(pipeline_result.get("no_faces_detected", False)),
            "model_name": str(loaded_name)
        }), 200

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

def background_preload():
    time.sleep(2)
    with app.app_context(): get_model("ViT")

if __name__ == '__main__':
    if os.environ.get('WERKZEUG_RUN_MAIN') == 'true' or not app.debug:
        threading.Thread(target=background_preload, daemon=True).start()
    app.run(host='0.0.0.0', debug=True, port=5000)
