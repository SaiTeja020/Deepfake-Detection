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

load_dotenv()

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

@app.route('/api/users/sync', methods=['POST'])
def sync_user():
    data = request.json
    firebase_uid = data.get('firebase_uid')
    email = data.get('email')
    name = data.get('name')
    profile_pic_url = data.get('profile_pic_url')
    bio = data.get('bio')
    save_history = data.get('save_history', True)

    if not firebase_uid or not email:
        return jsonify({"error": "Missing required fields"}), 400

    try:
        # Sync to Supabase
        user_data = {
            "firebase_uid": firebase_uid,
            "email": email,
            "name": name,
            "profile_pic_url": profile_pic_url,
            "bio": bio,
            "save_history": save_history
        }
        
        # Check if user exists in Supabase
        existing_user = supabase.table("users").select("*").eq("firebase_uid", firebase_uid).execute()
        
        if existing_user.data:
            # If incoming values are null, preserve the existing ones
            if not profile_pic_url:
                user_data["profile_pic_url"] = existing_user.data[0].get("profile_pic_url")
            if not bio:
                user_data["bio"] = existing_user.data[0].get("bio")
            
            supabase.table("users").update(user_data).eq("firebase_uid", firebase_uid).execute()
        else:
            supabase.table("users").insert(user_data).execute()

        # Sync to Firestore
        if db:
            user_ref = db.collection('users').document(firebase_uid)
            user_ref.set(user_data, merge=True)

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

if __name__ == '__main__':
    app.run(debug=True, port=5000)
