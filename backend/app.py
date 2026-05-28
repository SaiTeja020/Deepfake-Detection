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

# ---------------------------------------------------------------------------
# Frequency Branch — single source of truth import
# model/freq_branch.py is the canonical location; no file is copied here.
# ---------------------------------------------------------------------------
import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'model')))
try:
    from freq_branch import FrequencyBranch, FusionClassifier
    from temporal_transformer import load_temporal_transformer
    _FREQ_BRANCH_AVAILABLE = True
except ImportError as _e:
    logger_bootstrap = logging.getLogger(__name__)
    logger_bootstrap.warning("freq_branch.py or temporal_transformer.py not found — fused inference disabled: %s", _e)
    _FREQ_BRANCH_AVAILABLE = False

from pipeline import DeepfakePipeline, DeepfakeVideoPipeline

load_dotenv()

from llm_adapter import provider_router, structured_to_legacy

# Setup logging
import warnings
warnings.filterwarnings("ignore")

import transformers
transformers.logging.set_verbosity_error()

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
    "ViT": "SARVM/Frequency-Refined-ViT",
    "Swin Transformer": "SARVM/Frequency-Swin",
}
model_cache = {"models": {}, "processors": {}, "names": {}, "freq_branches": {}, "fusion_heads": {}, "video_models": {}}
deepfake_pipeline = None
deepfake_video_pipeline = None

# Lock to prevent concurrent image/spatial model downloads and initialization
_model_lock = threading.Lock()

# Lock to prevent concurrent model downloads (Flask can spawn multiple threads)
_video_model_lock = threading.Lock()
# Timestamp of last failed video-model load — used for retry backoff
_video_model_last_fail: float = 0.0
# Minimum seconds between retry attempts after a load failure
_VIDEO_MODEL_RETRY_BACKOFF = 60.0

def get_video_model():
    global model_cache, _video_model_last_fail
    # Fast path: already loaded successfully
    cached = model_cache["video_models"].get("Temporal-Swin", "__NOT_SET__")
    if cached != "__NOT_SET__" and cached is not None:
        return cached

    # Backoff: if the last attempt failed recently, don't hammer HF Hub
    if _video_model_last_fail > 0:
        elapsed = time.time() - _video_model_last_fail
        if elapsed < _VIDEO_MODEL_RETRY_BACKOFF:
            print(f"Video model load backoff: {_VIDEO_MODEL_RETRY_BACKOFF - elapsed:.0f}s remaining before retry.")
            return None

    # Serialize downloads — only one thread loads at a time
    with _video_model_lock:
        # Re-check inside lock in case another thread just finished loading
        cached = model_cache["video_models"].get("Temporal-Swin", "__NOT_SET__")
        if cached != "__NOT_SET__" and cached is not None:
            return cached

        try:
            hf_token = os.getenv("HF_TOKEN")
            model = load_temporal_transformer(DEVICE, hf_token=hf_token)
            if model is not None:
                model_cache["video_models"]["Temporal-Swin"] = model
                _video_model_last_fail = 0.0  # reset on success
                print("Video model cached successfully.")
            else:
                # Don't cache None — allow a retry after backoff
                _video_model_last_fail = time.time()
                print("CRITICAL: load_temporal_transformer returned None — will retry after backoff.")
        except Exception as e:
            _video_model_last_fail = time.time()
            print(f"CRITICAL: Failed to load SwinTemporalTransformer: {e}")
            traceback.print_exc()
            # Do NOT cache None here so the next request can retry after backoff

    return model_cache["video_models"].get("Temporal-Swin", None)

def get_model(model_type="Swin Transformer"):
    global model_cache
    
    if model_type not in MODEL_PATHS:
        model_type = "Swin Transformer"
        
    model_name = MODEL_PATHS[model_type]
    
    # Fast path check outside lock
    if model_type in model_cache["models"]:
        return (
            model_cache["models"][model_type],
            model_cache["processors"][model_type],
            None,
            model_cache["names"][model_type],
            model_cache["freq_branches"].get(model_type),
            model_cache["fusion_heads"].get(model_type),
        )

    _model_lock.acquire()
    try:
        if model_type in model_cache["models"]:
            return (
                model_cache["models"][model_type],
                model_cache["processors"][model_type],
                None,
                model_cache["names"][model_type],
                model_cache["freq_branches"].get(model_type),
                model_cache["fusion_heads"].get(model_type),
            )
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
            
            # Load model — avoid meta-tensor crash by using device_map instead of .to()
            # device_map loads weights directly to the target device; no .to() needed.
            try:
                model = AutoModelForImageClassification.from_pretrained(
                    model_name,
                    token=hf_token,
                    ignore_mismatched_sizes=True,
                    device_map=str(DEVICE),   # loads directly to CPU or CUDA
                    attn_implementation="eager",  # required for output_attentions=True (heatmaps)
                )
            except Exception as me:
                print(f"Warning: AutoModel+device_map failed ({me}). Trying specific class with CPU load.")
                # Fallback: load to CPU explicitly then stay on CPU
                if model_type == "Swin Transformer":
                    from transformers import SwinForImageClassification as model_class
                else:
                    from transformers import ViTForImageClassification as model_class

                model = model_class.from_pretrained(
                    model_name,
                    token=hf_token,
                    low_cpu_mem_usage=False,   # keep weights materialised
                    ignore_mismatched_sizes=True,
                    attn_implementation="eager",  # required for output_attentions=True (heatmaps)
                )
                # Only call .to() if the model is NOT on a meta device
                if not any(p.is_meta for p in model.parameters()):
                    model.to(DEVICE)

            # Label Correction
            if hasattr(model.config, 'num_labels') and model.config.num_labels == 2:
                model.config.id2label = {0: "FAKE", 1: "REAL"}
                model.config.label2id = {"FAKE": 0, "REAL": 1}

            # Ensure attention weights are returned at inference time
            model.config.output_attentions = True
            model.eval()
            
            # Cache spatial model
            model_cache["models"][model_type] = model
            model_cache["processors"][model_type] = processor
            model_cache["names"][model_type] = actual_model_name

            # ------------------------------------------------------------------
            # Load standalone FrequencyBranch from SARVM/Frequency_Branch
            #
            # The new SARVM/Frequency-Swin and SARVM/Frequency-Refined-ViT models
            # are complete, self-contained safetensors checkpoints — they already
            # have frequency-domain knowledge baked in from training.  There are
            # NO separate .pth fusion-classifier weights to download.
            #
            # We still load the raw FrequencyBranch CNN from the standalone repo
            # (SARVM/Frequency_Branch) so the pipeline can extract supplemental
            # frequency features for logging / future ensemble use.  The
            # FusionClassifier (fusion_head) is intentionally left as None;
            # the pipeline will therefore call _predict_spatial_only(), which
            # runs the already-frequency-aware backbone directly.
            # ------------------------------------------------------------------
            if _FREQ_BRANCH_AVAILABLE:
                try:
                    from safetensors.torch import load_file as safetensors_load_file
                    standalone_path = hf_hub_download(
                        repo_id="SARVM/Frequency_Branch",
                        filename="freq_branch.safetensors",
                        token=hf_token,
                    )
                    # safetensors stores a flat state_dict — load directly
                    state_dict = safetensors_load_file(standalone_path, device=str(DEVICE))
                    freq_branch = FrequencyBranch(embed_dim=768).to(DEVICE)
                    # Use strict=False to accommodate any minor key differences
                    missing, unexpected = freq_branch.load_state_dict(state_dict, strict=False)
                    if missing:
                        print(f"  FrequencyBranch missing keys: {missing}")
                    if unexpected:
                        print(f"  FrequencyBranch unexpected keys: {unexpected}")
                    freq_branch.eval()
                    for param in freq_branch.parameters():
                        param.requires_grad = False

                    # No separate FusionClassifier — new backbone handles fusion
                    model_cache["freq_branches"][model_type] = freq_branch
                    model_cache["fusion_heads"][model_type] = None
                    print(f"Standalone FrequencyBranch loaded for {model_type} from SARVM/Frequency_Branch (safetensors).")
                except Exception as fe:
                    print(f"Warning: Standalone FrequencyBranch unavailable for {model_type}: {fe}")
                    model_cache["freq_branches"][model_type] = None
                    model_cache["fusion_heads"][model_type] = None
            else:
                model_cache["freq_branches"][model_type] = None
                model_cache["fusion_heads"][model_type] = None


            print(f"{model_type} initialized successfully ({actual_model_name}).")
        except Exception as e:
            print(f"CRITICAL: Failed to load {model_type} model: {e}")
            traceback.print_exc()
            return None, None, None, None, None, None
    finally:
        _model_lock.release()

    return (
        model_cache["models"][model_type],
        model_cache["processors"][model_type],
        None,
        model_cache["names"][model_type],
        model_cache["freq_branches"].get(model_type),
        model_cache["fusion_heads"].get(model_type),
    )

def compute_vit_rollout(attentions):
    """Attention rollout for ViT models.

    Each element of `attentions` has shape [B, heads, tokens, tokens].
    We stack → [L, B, heads, T, T], then squeeze the batch dim (index 1,
    only valid when B=1) and average over heads → [L, T, T].
    """
    # Stack: [L, B, heads, T, T]
    att_mat = torch.stack(attentions)  
    # Remove batch dim (B=1): [L, heads, T, T]
    att_mat = att_mat.squeeze(1)       
    # Average over heads: [L, T, T]
    att_mat = att_mat.mean(dim=1)      

    # Add residual identity and re-normalise (standard rollout)
    residual_att = torch.eye(att_mat.size(-1), device=att_mat.device)
    aug_att_mat = att_mat + residual_att
    aug_att_mat = aug_att_mat / aug_att_mat.sum(dim=-1, keepdim=True)

    # Propagate attention through layers
    joint_attentions = torch.zeros_like(aug_att_mat)
    joint_attentions[0] = aug_att_mat[0]
    for n in range(1, aug_att_mat.size(0)):
        joint_attentions[n] = aug_att_mat[n] @ joint_attentions[n - 1]
    return joint_attentions[-1]

def compute_gradcam(
    model,
    pixel_values: torch.Tensor,
    fake_idx: int,
) -> "np.ndarray | None":
    """
    GradCAM on a spatial feature map.

    For Swin we hook into an intermediate encoder stage (14×14 = 196 tokens)
    rather than the final layernorm (7×7 = 49 tokens) for better spatial
    resolution.  For ViT we hook into the final layernorm (196+1 tokens).

    Uses absolute-value instead of ReLU so that all discriminative regions
    are visible — ReLU on a 7×7 grid zeros most cells leaving a single blob.

    Returns:
        numpy array of shape (s, s) ready for upsampling, or None on failure.
    """
    try:
        activations: dict = {}
        gradients: dict  = {}

        # ── Find the best hook target ──────────────────────────────────
        hook_target = None
        skip_cls = False

        if hasattr(model, 'swin') and hasattr(model.swin, 'encoder'):
            # Swin: prefer second-to-last stage for 14×14 resolution
            # Structure: model.swin.encoder.layers[i].blocks[j].layernorm_after
            stages = model.swin.encoder.layers
            found = False
            if len(stages) >= 2:
                try:
                    hook_target = stages[-2].blocks[-1].layernorm_after
                    found = True
                    logger.info("compute_gradcam: hooking Swin stage %d (14×14)",
                                len(stages) - 2)
                except (AttributeError, IndexError):
                    pass
            if not found:
                # Fallback to final layernorm (7×7)
                hook_target = getattr(model.swin, 'layernorm', None)
                logger.info("compute_gradcam: hooking Swin final layernorm (7×7)")
            skip_cls = False

        elif hasattr(model, 'vit') and hasattr(model.vit, 'layernorm'):
            hook_target = model.vit.layernorm
            skip_cls = True   # ViT has a CLS token prepended

        else:
            # Generic fallback: find the last LayerNorm in the model
            for name, module in model.named_modules():
                if isinstance(module, torch.nn.LayerNorm):
                    hook_target = module
                    skip_cls = False

        if hook_target is None:
            logger.warning("compute_gradcam: no suitable hook target found")
            return None

        def _fwd(module, inp, out):
            activations['feat'] = out

        def _bwd(module, grad_in, grad_out):
            gradients['feat'] = grad_out[0]

        h_f = hook_target.register_forward_hook(_fwd)
        h_b = hook_target.register_full_backward_hook(_bwd)

        try:
            pv = pixel_values.detach().clone().requires_grad_(True)
            model.zero_grad()
            out = model(pixel_values=pv)
            score = torch.softmax(out.logits, dim=-1)[0, fake_idx]
            score.backward()
        finally:
            h_f.remove()
            h_b.remove()

        feat = activations.get('feat')
        grad = gradients.get('feat')
        if feat is None or grad is None:
            logger.warning("compute_gradcam: hooks captured nothing")
            return None

        feat = feat.detach().squeeze(0).float()  # (seq, channels)
        grad = grad.detach().squeeze(0).float()  # (seq, channels)

        # Skip CLS token for ViT
        if skip_cls:
            feat = feat[1:]
            grad = grad[1:]

        # Channel importance: global-average the gradient over the sequence
        # then weight feature channels — standard GradCAM formulation
        weights = grad.mean(dim=0)            # (channels,)
        cam = (feat * weights).sum(dim=-1)    # (seq,)
        # abs() instead of relu(): preserves ALL discriminative regions.
        # relu() on coarse grids zeros most cells → single blob artifact.
        cam = cam.abs()

        # Reshape sequence → square spatial grid
        seq_len = cam.size(0)
        s = int(np.sqrt(seq_len))
        if s * s != seq_len:
            cam = cam[:s * s]  # truncate if non-square
        cam_2d = cam.reshape(s, s).cpu().numpy().astype(np.float32)

        logger.info("compute_gradcam: %dx%d map, fake_idx=%d, "
                    "min=%.4f, max=%.4f, nonzero=%d/%d",
                    s, s, fake_idx,
                    cam_2d.min(), cam_2d.max(),
                    int((cam_2d > 0).sum()), s * s)
        return cam_2d
    except Exception as exc:
        logger.warning("compute_gradcam failed: %s", exc, exc_info=True)
        return None



def compute_gradient_saliency(
    model,
    pixel_values: torch.Tensor,
    fake_idx: int,
) -> "np.ndarray | None":
    """
    Gradient-based saliency map: |d(fake_score)/d(pixel_values)|.

    Works for ANY model architecture (ViT, Swin, custom) regardless of
    whether the model returns attention weights.  Used as a guaranteed
    fallback when attention-based heatmaps return None.

    Args:
        model        : the loaded classification model (in eval mode)
        pixel_values : preprocessed image tensor (1, C, H, W) already on device
        fake_idx     : class index for the "FAKE" label

    Returns:
        numpy array of shape (H, W) with raw (un-normalised) saliency, or None.
    """
    try:
        # Fresh copy with grad tracking — must NOT be inside torch.no_grad()
        pv = pixel_values.detach().clone().requires_grad_(True)
        model.zero_grad()
        out = model(pixel_values=pv)
        fake_score = torch.softmax(out.logits, dim=-1)[0, fake_idx]
        fake_score.backward()

        if pv.grad is None:
            logger.warning("compute_gradient_saliency: grad is None after backward")
            return None

        # |grad| max-pooled over colour channels → (H, W)
        saliency = pv.grad.abs().squeeze(0).max(dim=0)[0]
        result = saliency.detach().cpu().numpy()
        logger.info("compute_gradient_saliency: map shape %s, min=%.4f, max=%.4f",
                    result.shape, result.min(), result.max())
        return result
    except Exception as exc:
        logger.warning("compute_gradient_saliency failed: %s", exc, exc_info=True)
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


def upload_file_to_supabase(file_path: str, bucket: str, folder: str = "", mime_type: str = "video/mp4") -> tuple[str | None, str | None]:
    """Helper to upload a local disk file to Supabase Storage."""
    try:
        if not os.path.exists(file_path):
            return None, f"File {file_path} does not exist"
            
        file_ext = os.path.splitext(file_path)[1].replace(".", "")
        dest_filename = f"{uuid.uuid4()}.{file_ext}"
        dest_path = f"{folder}/{dest_filename}" if folder else dest_filename
        
        with open(file_path, "rb") as f:
            content = f.read()
            
        supabase.storage.from_(bucket).upload(dest_path, content, {"content-type": mime_type})
        public_url = supabase.storage.from_(bucket).get_public_url(dest_path)
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
        err_str = str(e)
        # DNS / network failure: Supabase project is likely paused or offline.
        # Return 200 with a warning so the frontend save never surfaces as a fatal error.
        if "Name or service not known" in err_str or "gaierror" in err_str or "ConnectionError" in err_str:
            logger.warning("save_scan: Supabase unreachable — scan not persisted. %s", err_str)
            return jsonify({"warning": "History save skipped — storage offline"}), 200
        logger.error("save_scan failed: %s", err_str)
        return jsonify({"error": err_str}), 500

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
            elif err:
                logger.error(f"Original upload failed: {err}")
                if "Name or service not known" in str(err):
                    return jsonify({"warning": "Storage offline"}), 200
            
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
        err_str = str(e)
        if "Name or service not known" in err_str:
            logger.warning("upload_scan_media: Supabase unreachable — upload skipped.")
            return jsonify({"warning": "Storage offline"}), 200
        return jsonify({"error": err_str}), 500

@app.route('/api/upload/profile-pic', methods=['POST'])
def upload_profile_pic():
    """Upload a profile picture to Supabase Storage and return the public URL."""
    data = request.json
    if not data or "firebase_uid" not in data or "image" not in data:
        return jsonify({"error": "Missing firebase_uid or image"}), 400

    uid = data["firebase_uid"]
    image_b64 = data["image"]

    try:
        url, err = upload_to_supabase(image_b64, "profile-pictures", folder=uid)
        if url:
            return jsonify({"url": url}), 200
        elif err:
            logger.error(f"Profile pic upload failed: {err}")
            if "Name or service not known" in str(err) or "gaierror" in str(err):
                return jsonify({"error": "Storage offline — cannot upload profile picture"}), 503
            return jsonify({"error": str(err)}), 500
        else:
            return jsonify({"error": "Upload returned no URL"}), 500
    except Exception as e:
        logger.error(f"Profile pic upload exception: {e}")
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
        m, p, t, loaded_name, freq_branch, fusion_head = get_model(model_type_used)
        if m is None: return jsonify({"error": "Model load failed"}), 503

        # Initialize pipeline singleton or update if model changed
        if deepfake_pipeline is None or deepfake_pipeline.model is not m:
            deepfake_pipeline = DeepfakePipeline(
                m, p, DEVICE,
                freq_branch=freq_branch,
                fusion_head=fusion_head,
            )

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
            num_labels = len(getattr(m.config, 'id2label', {}))
            
            if num_labels != 2:
                logger.error(f"Global Inference: Model has {num_labels} labels instead of 2. Returning 0.5 for global_fake_prob.")
                global_fake_prob = 0.5
            else:
                # Ensure index exists
                fake_idx = label2id.get("FAKE", 0)
                if isinstance(probs_full, torch.Tensor) and probs_full.dim() > 0:
                    global_fake_prob = float(probs_full[fake_idx].item())
                else:
                    global_fake_prob = float(probs_full.item())

        mask = None
        outside_fraction = 0.0

        # ------------------------------------------------------------------ #
        # Heatmap strategy                                                     #
        #                                                                      #
        # ViT  : Attention rollout from CLS token — semantic, face-focused    #
        # Swin : GradCAM on final LayerNorm feature map — spatially accurate  #
        # Both : Gaussian-smoothed and re-normalised before rendering          #
        # Fallback: gradient saliency when both primary methods fail           #
        # ------------------------------------------------------------------ #
        _fake_idx = label2id.get("FAKE", 0)
        is_swin = (
            "Swin" in type(m).__name__
            or "swin" in getattr(m.config, "model_type", "").lower()
        )
        logger.info("Heatmap: model_class=%s, config.model_type=%s, is_swin=%s",
                    type(m).__name__,
                    getattr(m.config, "model_type", "unknown"),
                    is_swin)

        raw_mask = None

        if is_swin:
            # GradCAM: gradient w.r.t. final Swin feature map
            raw_mask = compute_gradcam(m, inputs_full["pixel_values"], _fake_idx)
        else:
            # ViT attention rollout: CLS-token attention through all layers
            if attentions is not None:
                try:
                    rollout  = compute_vit_rollout(attentions)
                    mask_raw = rollout[0, 1:]       # CLS → patch tokens
                    s        = int(np.sqrt(mask_raw.size(0)))
                    raw_mask = mask_raw.reshape(s, s).cpu().numpy().astype(np.float32)
                    logger.info("ViT attention rollout: %dx%d grid", s, s)
                except Exception as e:
                    logger.warning("ViT rollout failed: %s", e, exc_info=True)

            # ViT fallback: GradCAM
            if raw_mask is None:
                logger.info("ViT rollout unavailable — trying GradCAM")
                raw_mask = compute_gradcam(m, inputs_full["pixel_values"], _fake_idx)

        # Last-resort: gradient saliency (works but tends to highlight background)
        if raw_mask is None:
            logger.info("GradCAM unavailable — falling back to gradient saliency")
            raw_mask = compute_gradient_saliency(m, inputs_full["pixel_values"], _fake_idx)

        # Post-process: normalise → resize → smooth → re-normalise
        if raw_mask is not None:
            img_w, img_h = image.size
            nm = (raw_mask - raw_mask.min()) / (raw_mask.max() - raw_mask.min() + 1e-8)
            # INTER_CUBIC produces smoother contours from coarse grids (e.g. 7×7 Swin)
            nm = cv2.resize(nm.astype(np.float32), (img_w, img_h),
                            interpolation=cv2.INTER_CUBIC)
            # Adaptive Gaussian kernel: ~8% of the shorter dimension, always odd
            blur_k = max(31, int(min(img_w, img_h) * 0.08) | 1)
            nm = cv2.GaussianBlur(nm, (blur_k, blur_k), 0)
            mask = (nm - nm.min()) / (nm.max() - nm.min() + 1e-8)
            logger.info("Final heatmap mask: shape=%s, method=%s, blur_kernel=%d",
                        mask.shape,
                        "gradcam" if is_swin else "vit_rollout",
                        blur_k)
        else:
            logger.warning("All heatmap methods failed — no overlay will be produced")


        # ── Run pipeline FIRST to get face bounding boxes ──────────────
        try:
            pipeline_result = deepfake_pipeline.run(image, outside_fraction=0.0)
        except Exception as e:
            logger.error(f"Pipeline run failed: {e}")
            traceback.print_exc()
            return jsonify({"error": f"Pipeline analysis failed: {str(e)}"}), 500

        face_list = pipeline_result["faces"]

        # ── Calculate outside_fraction from the RAW heatmap ────────────
        if mask is not None and face_list:
            img_w, img_h = image.size
            face_box_mask = np.zeros((img_h, img_w), dtype=bool)
            for f in face_list:
                x1, y1, x2, y2 = f["box"]
                face_box_mask[y1:y2, x1:x2] = True
            total_att = mask.sum()
            if total_att > 1e-8:
                outside_fraction = float(mask[~face_box_mask].sum() / total_att)
            logger.info("outside_fraction = %.3f", outside_fraction)

        # ── Apply soft face-region bias to heatmap for VISUALIZATION ───
        # This multiplies the raw heatmap by a Gaussian-blurred face-region
        # mask so the overlay naturally emphasizes face regions.  The floor
        # of 0.15 keeps background signals faintly visible so the user can
        # still see where the model looked outside the face.
        if mask is not None and face_list:
            img_w, img_h = image.size
            face_bias = np.full((img_h, img_w), 0.15, dtype=np.float32)
            for f in face_list:
                x1, y1, x2, y2 = f["box"]
                # Expand face box by 20% on each side for a generous region
                bw, bh = x2 - x1, y2 - y1
                pad_x, pad_y = int(bw * 0.20), int(bh * 0.20)
                ex1 = max(0, x1 - pad_x)
                ey1 = max(0, y1 - pad_y)
                ex2 = min(img_w, x2 + pad_x)
                ey2 = min(img_h, y2 + pad_y)
                face_bias[ey1:ey2, ex1:ex2] = 1.0
            # Gaussian blur for smooth falloff from face → background
            ksize = max(31, int(min(img_w, img_h) * 0.15) | 1)  # odd kernel
            face_bias = cv2.GaussianBlur(face_bias, (ksize, ksize), 0)
            # Apply bias and re-normalise
            mask = mask * face_bias
            mask = (mask - mask.min()) / (mask.max() - mask.min() + 1e-8)
            logger.info("Face-biased heatmap: face_bias range [%.2f, %.2f]",
                        face_bias.min(), face_bias.max())

        overlay = None
        heatmap_url = None
        heatmap_b64 = None   # kept as fallback if Supabase upload fails
        facemesh_url = None
        facemesh_b64 = None

        if mask is not None:
            try:
                heatmap = (mask * 255).astype(np.uint8)
                heatmap = cv2.applyColorMap(heatmap, cv2.COLORMAP_JET)
                img_bgr = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
                overlay = cv2.addWeighted(img_bgr, 0.6, heatmap, 0.4, 0)
                overlay = DeepfakePipeline.draw_face_boxes(image, pipeline_result, heatmap_bgr=overlay)

                _, buf = cv2.imencode(".jpg", overlay)
                heatmap_b64 = f"data:image/jpeg;base64,{base64.b64encode(buf).decode()}"
                uploaded_url, upload_err = upload_to_supabase(heatmap_b64, "heatmaps", folder=firebase_uid)
                # Use Supabase URL when available, otherwise fall back to inline base64
                # so the frontend always receives a usable URL and the heatmap button shows.
                heatmap_url = uploaded_url if uploaded_url else heatmap_b64
                if upload_err:
                    logger.warning("Heatmap Supabase upload failed (using inline b64 fallback): %s", upload_err)

                facemesh_img = DeepfakePipeline.draw_face_mesh(image, face_list)
                if facemesh_img is not None:
                    _, fmb = cv2.imencode(".jpg", cv2.cvtColor(np.array(facemesh_img), cv2.COLOR_RGB2BGR))
                    facemesh_b64 = f"data:image/jpeg;base64,{base64.b64encode(fmb).decode()}"
                    fm_url, fm_err = upload_to_supabase(facemesh_b64, "heatmaps", folder=f"{firebase_uid}/facemesh")
                    facemesh_url = fm_url if fm_url else facemesh_b64
                    if fm_err:
                        logger.warning("Facemesh Supabase upload failed (using inline b64 fallback): %s", fm_err)
            except Exception as e:
                print(f"Visualization error: {e}")

        inference_time = round((time.time() - start_time) * 1000)
        conf_raw = pipeline_result["confidence"]          # [0, 1] fraction from pipeline (fake probability)
        final_label = pipeline_result["final_label"]

        # Display confidence for the identified class:
        # Real/Uncertain -> show real confidence (1 - fake_prob)
        # Deepfake/Suspicious -> show fake confidence (fake_prob)
        if final_label in ("Real", "Uncertain"):
            conf_pct = round((1.0 - float(conf_raw)) * 100, 2)
        else:
            conf_pct = round(float(conf_raw) * 100, 2)

        # Build Forensic Evidence Packet
        interpreter = ForensicInterpreter()
        face_interpretations = [interpreter.interpret_face(f, mask, global_fake_prob) for f in face_list]
        evidence_packet = EvidenceBuilder.build(
            verdict=final_label,               # Preserve nuance (Deepfake/Suspicious/Uncertain)
            confidence=conf_pct,               # Pass display percentage — EvidenceBuilder renders with "%" suffix
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
            "attentionMapUrl": heatmap_url,  # None when heatmap generation failed
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


@app.route('/api/detect-video', methods=['POST'])
def detect_deepfake_video():
    global deepfake_video_pipeline
    
    if 'video' not in request.files:
        return jsonify({"error": "No video file provided"}), 400
        
    video_file = request.files['video']
    firebase_uid = request.form.get('firebase_uid', 'guest')
    
    # Save the file to a temporary location
    temp_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), 'scratch'))
    os.makedirs(temp_dir, exist_ok=True)
    temp_video_path = os.path.join(temp_dir, f"temp_{uuid.uuid4().hex}_{video_file.filename}")
    video_file.save(temp_video_path)
    
    output_video_path = None
    keyframe_path = None
    
    try:
        # Load Swin backbone (spatial features) and frequency branch
        m, p, t, loaded_name, freq_branch, fusion_head = get_model("Swin Transformer")
        if m is None:
            return jsonify({"error": "Swin backbone load failed"}), 503
            
        # Load SwinTemporalTransformer video model
        video_model = get_video_model()
        if video_model is None:
            return jsonify({"error": "Temporal Transformer load failed"}), 503
            
        # Initialize video pipeline
        if deepfake_video_pipeline is None or deepfake_video_pipeline.model is not m or deepfake_video_pipeline.video_model is not video_model:
            deepfake_video_pipeline = DeepfakeVideoPipeline(
                m, p, DEVICE,
                freq_branch=freq_branch,
                video_model=video_model
            )
            
        # Run video pipeline (which does face tracking, MTCNN & FaceMesh on every frame, Swin+Freq, and temporal prediction)
        pipeline_result, output_video_path, keyframe_path = deepfake_video_pipeline.run_video(temp_video_path, outside_fraction=0.0)
        
        # Calculate overall verdict metrics
        final_label = pipeline_result["final_label"]
        raw_confidence = pipeline_result["confidence"]  # fused fake probability

        # Display confidence for the identified class:
        # Real/Uncertain -> show real confidence (1 - fake_prob)
        # Deepfake/Suspicious -> show fake confidence (fake_prob)
        if final_label in ("Real", "Uncertain"):
            display_confidence = 1.0 - raw_confidence
        else:
            display_confidence = raw_confidence

        conf_pct = round(display_confidence * 100, 2)
        inference_time = pipeline_result["inference_ms"]
        face_list = pipeline_result["faces"]
        
        # Upload processed video and keyframe to Supabase
        video_url, upload_err1 = upload_file_to_supabase(output_video_path, "heatmaps", folder=firebase_uid, mime_type="video/mp4")
        keyframe_url, upload_err2 = upload_file_to_supabase(keyframe_path, "heatmaps", folder=firebase_uid, mime_type="image/jpeg")
        
        if upload_err1:
            logger.warning(f"Video upload failed: {upload_err1}")
        if upload_err2:
            logger.warning(f"Keyframe upload failed: {upload_err2}")
            
        # Use Supabase URLs if uploaded successfully, fallback to None
        final_video_url = video_url if video_url else None
        final_keyframe_url = keyframe_url if keyframe_url else None
        
        # Build Forensic Evidence Packet
        interpreter = ForensicInterpreter()
        global_fake_prob = float(pipeline_result["confidence"])
        face_interpretations = [interpreter.interpret_face(f, None, global_fake_prob) for f in face_list]
        evidence_packet = EvidenceBuilder.build(
            verdict=final_label,
            confidence=global_fake_prob,
            faces=face_interpretations,
            attention_outside_faces=0.0,
            model_type="Temporal-Swin",
            global_fake_prob=global_fake_prob
        )

        # NOTE: LLM analysis is intentionally skipped for video detections.
        # LLM explanations are only used for image-based detection (ViT / Swin).
        # For video, we surface the structured evidence packet directly.
        conf_label = (
            "High" if global_fake_prob >= 0.75
            else "Moderate" if global_fake_prob >= 0.50
            else "Low"
        )
        video_explanation = (
            f"Video analysis completed using the Swin + Frequency Temporal Transformer model. "
            f"Verdict: {final_label} (confidence: {round(global_fake_prob * 100, 1)}%). "
            f"Confidence level: {conf_label}. "
            f"{len(face_list)} face region(s) were tracked across frames."
        )
        structured_explanation = {
            "verdict": final_label,
            "confidence": round(global_fake_prob * 100, 1),
            "summary": video_explanation,
            "suspicious_domains": evidence_packet.get("suspicious_regions", []),
            "model_consensus": f"Temporal-Swin ({conf_label} confidence)",
            "evidence": evidence_packet,
        }
        legacy = {
            "explanation": video_explanation,
            "suspicious_domains": evidence_packet.get("suspicious_regions", []),
            "model_consensus": structured_explanation["model_consensus"],
        }
        
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
            "attentionMapUrl": final_video_url,       # Processed video URL for frontend visualization
            "keyframeUrl": final_keyframe_url,         # Static keyframe image URL
            "facemeshUrl": final_keyframe_url,         # Fallback for meshes
            "explanation": str(legacy["explanation"]),
            "suspicious_domains": legacy["suspicious_domains"],
            "model_consensus": str(legacy["model_consensus"]),
            "structured_explanation": structured_explanation,
            "final_label": str(final_label),
            "faces": serializable_faces,
            "face_count": int(len(face_list)),
            "no_faces_detected": bool(pipeline_result.get("no_faces_detected", False)),
            "model_name": "Swin+Frequency Temporal Transformer"
        }), 200
        
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
        
    finally:
        # Clean up temporary disk files
        try:
            if os.path.exists(temp_video_path):
                os.remove(temp_video_path)
            if output_video_path and os.path.exists(output_video_path):
                os.remove(output_video_path)
            if keyframe_path and os.path.exists(keyframe_path):
                os.remove(keyframe_path)
        except Exception as cleanup_err:
            logger.warning(f"Error cleaning up temporary video files: {cleanup_err}")


def background_preload():
    """Eagerly load both the image Swin model and the video temporal model
    at container startup so the first user request is never a cold-load."""
    time.sleep(2)
    with app.app_context():
        try:
            get_model("Swin Transformer")
            print("[preload] Swin Transformer image model ready.")
        except Exception as e:
            print(f"[preload] Swin Transformer image model failed: {e}")
        try:
            get_video_model()
            print("[preload] Temporal-Swin video model ready.")
        except Exception as e:
            print(f"[preload] Temporal-Swin video model failed: {e}")

if __name__ == '__main__':
    if os.environ.get('WERKZEUG_RUN_MAIN') == 'true' or not app.debug:
        threading.Thread(target=background_preload, daemon=True).start()
    app.run(host='0.0.0.0', debug=True, port=5000)
