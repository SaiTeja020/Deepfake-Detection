import sys
import os
sys.path.append(r"c:\Users\DELL\DeepfakeRepo\Deepfake-Detection\backend")
from app import upload_to_supabase

base64_image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
url, error = upload_to_supabase(base64_image, "profile-pictures", folder="test_uid")
print("URL:", url)
print("ERROR:", error)
