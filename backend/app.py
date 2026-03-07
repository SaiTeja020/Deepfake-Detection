import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from supabase import create_client, Client
import firebase_admin
from firebase_admin import credentials, firestore
from dotenv import load_dotenv

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
            "save_history": save_history
        }
        
        # Check if user exists in Supabase
        existing_user = supabase.table("users").select("*").eq("firebase_uid", firebase_uid).execute()
        
        if existing_user.data:
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
