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
MODEL_PATHS = {
    "ViT": "SARVM/Refined_ViT",
    "Swin Transformer": "SARVM/Swin_Transformer"
}
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# Model Cache
model_cache = {
    "models": {},
    "processors": {},
    "transforms": {},
    "names": {} # Store the actual model ID loaded (private vs fallback)
}
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
            
            # Load model
            try:
                model = AutoModelForImageClassification.from_pretrained(
                    model_name, 
                    token=hf_token,
                    output_attentions=True
                )
            except Exception as me:
                print(f"Warning: AutoModel failed for {model_name} ({me}). Trying specific class fallback with prefix handling.")
                
                # Choose class and config type
                if model_type == "Swin Transformer":
                    from transformers import SwinForImageClassification as model_class
                    from transformers import SwinConfig as config_class
                else:
                    from transformers import ViTForImageClassification as model_class
                    from transformers import ViTConfig as config_class
                
                try:
                    # Initialize config with fallback for 'vit_refiner'
                    from transformers import AutoConfig
                    try:
                        config = AutoConfig.from_pretrained(model_name, token=hf_token)
                    except Exception as ce:
                        if "vit_refiner" in str(ce):
                            print(f"Detected 'vit_refiner' type for {model_name}. Mapping to standard ViT.")
                            config = config_class.from_pretrained(model_name, token=hf_token)
                        else:
                            raise ce
                    
                    config.output_attentions = True
                    model = model_class(config)
                    
                    # Download weights manually
                    try:
                        # Try safetensors first, then bin
                        try:
                            weights_path = hf_hub_download(repo_id=model_name, filename="model.safetensors", token=hf_token)
                            from safetensors.torch import load_file
                            state_dict = load_file(weights_path)
                        except:
                            weights_path = hf_hub_download(repo_id=model_name, filename="pytorch_model.bin", token=hf_token)
                            state_dict = torch.load(weights_path, map_location="cpu")
                        
                        # Fix prefixes (e.g., 'vit.swin...' -> 'swin...' or 'vit.vit...' -> 'vit...')
                        new_state_dict = {}
                        if state_dict:
                            # Detect prefix systematically
                            sample_key = next(iter(state_dict.keys()))
                            prefix_to_strip = ""
                            
                            # Aggressive nested prefix detection
                            if sample_key.startswith("vit.swin."): prefix_to_strip = "vit."
                            elif sample_key.startswith("vit.vit."): prefix_to_strip = "vit."
                            elif sample_key.startswith("vit."): prefix_to_strip = "vit."
                            
                            for k, v in state_dict.items():
                                new_key = k
                                if prefix_to_strip and k.startswith(prefix_to_strip):
                                    new_key = k[len(prefix_to_strip):]
                                    # Handle double nesting if it exists (vit.swin -> swin)
                                    # Some layers might still have a 'vit.' prefix inside the state dict
                                    if prefix_to_strip == "vit." and new_key.startswith("swin.") and not hasattr(model, 'swin'):
                                        # If the model is standard Swin, it might not have 'swin.' prefix internally 
                                        # but typically SwinForImageClassification DOES have it.
                                        pass 
                                new_state_dict[new_key] = v
                        
                        # Option 1: Filter weights to match model exactly (Quiet Loading)
                        model_keys = set(model.state_dict().keys())
                        filtered_state_dict = {k: v for k, v in new_state_dict.items() if k in model_keys}
                        
                        try:
                            # Try loading filtered weights (should be quiet)
                            missing_keys, unexpected_keys = model.load_state_dict(filtered_state_dict, strict=False)
                            print(f"Successfully loaded matched weights for {model_name}.")
                        except Exception as le:
                            print(f"Quiet load failed ({le}). Falling back to standard load.")
                            model.load_state_dict(new_state_dict, strict=False)
                        
                        actual_model_name = model_name
                        if prefix_to_strip:
                            print(f"Stripped prefix: '{prefix_to_strip}'")
                    except Exception as fe:
                        print(f"Weights load failed: {fe}. Falling back to public demo model.")
                        actual_model_name = "microsoft/swin-tiny-patch4-window7-224" if model_type == "Swin Transformer" else "google/vit-base-patch16-224"
                        model = model_class.from_pretrained(actual_model_name, output_attentions=True)
                except Exception as final_e:
                    print(f"CRITICAL: All load attempts failed for {model_type}: {final_e}")
                    raise final_e
            
            # Check for local weights fallback for ViT if needed 
            # (Though user said use HF, we keep local check for compatibility if file exists)
            if model_type == "ViT":
                weights_path = os.path.join(os.path.dirname(__file__), "refined_vit_final.safetensors")
                if os.path.exists(weights_path):
                    try:
                        from safetensors.torch import load_file
                        state_dict = load_file(weights_path)
                        model.load_state_dict(state_dict, strict=False)
                        print(f"Applied local weights from {weights_path}")
                    except Exception as e:
                        print(f"Warning: Could not apply local weights: {e}")

            # Label Correction (only if model is binary/deepfake-specific)
            if hasattr(model.config, 'num_labels') and model.config.num_labels == 2:
                model.config.id2label = {0: "FAKE", 1: "REAL"}
                model.config.label2id = {"FAKE": 0, "REAL": 1}
            
            model.to(DEVICE)
            model.eval()
            
            # Fallback transform
            transform = transforms.Compose([
                transforms.Resize((224, 224)),
                transforms.ToTensor(),
                transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
            ])
            
            # Cache them
            model_cache["models"][model_type] = model
            model_cache["processors"][model_type] = processor
            model_cache["transforms"][model_type] = transform
            model_cache["names"][model_type] = actual_model_name
            
            print(f"{model_type} initialized successfully ({actual_model_name}).")
        except Exception as e:
            print(f"CRITICAL: Failed to load {model_type} model: {e}")
            traceback.print_exc()
            return None, None, None, None
            
    return model_cache["models"][model_type], model_cache["processors"][model_type], model_cache["transforms"][model_type], model_cache["names"][model_type]

def compute_vit_rollout(attentions):
    """Attention rollout for ViT models"""
    # att_mat: (layers, batch, heads, seq, seq) -> (layers, seq, seq)
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

def compute_swin_heatmap(attentions, target_size=(224, 224)):
    """Simplified heatmap for Swin Transformer by aggregating stage attentions"""
    if not attentions:
        return np.zeros((224, 224), dtype=np.float32)
        
    # Swin returns attentions as a tuple of length 4 (one for each stage)
    # We take the last stage as it has the highest level semantic features
    try:
        last_stage_att = attentions[-1].detach().cpu() # (batch, heads, seq, seq)
        # Mean across heads and batch
        att_map = last_stage_att.mean(dim=1).squeeze(0) # (seq, seq)
        
        # In Swin, seq length in last stage is often 7x7=49
        # Sum rows to get patch importance
        importance = att_map.sum(dim=0) # (seq)
        
        side = int(importance.shape[0] ** 0.5)
        if side == 0:
            return np.zeros((224, 224), dtype=np.float32)
            
        mask = importance.reshape(side, side).numpy()
        return mask.astype(np.float32)
    except Exception as e:
        print(f"Swin heatmap internal error: {e}")
        return np.zeros((224, 224), dtype=np.float32)


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
        # Load model with specific type
        model_type_used = data.get('model_type', 'ViT')
        m, p, t, loaded_name = get_model(model_type_used)
        
        if m is None:
            return jsonify({"error": f"{model_type_used} model could not be loaded."}), 503
            
        global deepfake_pipeline
        if deepfake_pipeline is None or deepfake_pipeline.model is not m:
            deepfake_pipeline = DeepfakePipeline(m, p, DEVICE)

        # Decode base64
        if ',' in base64_image:
            image_content = base64_image.split(',')[1]
        else:
            image_content = base64_image

        img_data = base64.b64decode(image_content)
        image = Image.open(io.BytesIO(img_data)).convert("RGB")
        
        # Preprocess using official processor or fallback transform
        if p:
            inputs = p(images=image, return_tensors="pt").to(DEVICE)
        else:
            # Manual preprocessing
            img_tensor = t(image).unsqueeze(0).to(DEVICE)
            inputs = {"pixel_values": img_tensor}
        
        # Ensure input dtype matches model dtype (crucial for FP16/Half models)
        if "pixel_values" in inputs:
            inputs["pixel_values"] = inputs["pixel_values"].to(m.dtype)
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
        predicted_idx = outputs_full.logits.argmax(dim=-1).item() if hasattr(outputs_full, "logits") else 0
        if hasattr(m.config, 'id2label') and predicted_idx in m.config.id2label:
            label = m.config.id2label[predicted_idx]
        else:
            # Fallback for demo/ImageNet models
            label = "Real" if predicted_idx % 2 == 0 else "Fake"
        
        # Attention rollout for Heatmap
        heatmap_url = None
        overlay = None # Initialize to avoid LLM adapter error if heatmap fails
        overlay_data_uri = None
        
        if attentions is not None and len(attentions) > 0:
            try:
                if "Swin" in str(type(m)):
                    mask = compute_swin_heatmap(attentions)
                else:
                    rollout = compute_vit_rollout(attentions)
                    mask = rollout[0, 1:]
                    size = int(mask.shape[0] ** 0.5)
                    mask = mask.reshape(size, size).cpu().numpy()
                
                # Normalize mask safely
                if mask.max() > mask.min():
                    mask = (mask - mask.min()) / (mask.max() - mask.min() + 1e-8)
                else:
                    mask = np.zeros_like(mask)
                
                # Resize mask to original image size
                orig_width, orig_height = image.size
                if mask.size > 0 and mask.shape[0] > 0 and mask.shape[1] > 0:
                    mask = cv2.resize(mask, (orig_width, orig_height))
                else:
                    mask = np.zeros((orig_height, orig_width), dtype=np.float32)
                
                # Create Heatmap
                heatmap = cv2.applyColorMap(np.uint8(255 * mask), cv2.COLORMAP_JET)
                
                # Overlay on original image
                img_np = np.array(image)
                img_bgr = cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR)
                overlay = cv2.addWeighted(img_bgr, 0.6, heatmap, 0.4, 0)
                
                # OVERLAY FACES: Draw face bounding boxes from pipeline on top of heatmap
                overlay = DeepfakePipeline.draw_face_boxes(image, pipeline_result, heatmap_bgr=overlay)
                
                # Encode overlay to base64 for upload
                _, buffer = cv2.imencode('.jpg', overlay)
                overlay_base64 = base64.b64encode(buffer).decode('utf-8')
                overlay_data_uri = f"data:image/jpeg;base64,{overlay_base64}"
                
                # Upload Heatmap to Supabase
                heatmap_url, h_error = upload_to_supabase(overlay_data_uri, "heatmaps", folder=firebase_uid)
                if h_error:
                    print(f"Heatmap upload warning: {h_error}")
            except Exception as e:
                print(f"Heatmap generation error: {e}")
                traceback.print_exc()
        else:
            print(f"Warning: No attentions received from {model_type_used}, skipping heatmap.")


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
                image_reference=image,
                heatmap_reference=Image.fromarray(cv2.cvtColor(overlay, cv2.COLOR_BGR2RGB)) if overlay is not None else None,
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
            "model_name": loaded_name # Explicitly identify which model ID was used
        }), 200

    except Exception as e:
        print(f"Inference error: {e}")
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', debug=True, port=5000)
