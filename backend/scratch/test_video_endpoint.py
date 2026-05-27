import requests

url = "http://localhost:5000/api/detect-video"
video_path = r"c:\Users\DELL\Deepfake-Detection\Deepfake-Detection\celebdf_id0_id1_0000.mp4"

with open(video_path, "rb") as f:
    files = {"video": ( "celebdf_id0_id1_0000.mp4", f, "video/mp4" )}
    data = {"firebase_uid": "test_uid"}
    print("Sending request...")
    response = requests.post(url, files=files, data=data)

print("Status:", response.status_code)
try:
    print("Response JSON:", response.json())
except Exception as e:
    print("Response Text:", response.text[:500])
