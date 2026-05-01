# Deepfake Detection: System Testing & Validation Report

This report defines the comprehensive testing strategy for the Deepfake Detection Hub, as required for full system validation.

---

## 1. System Validation Test Cases
System validation ensures the core detection engine correctly handles diverse facial data and environmental conditions.

| Test ID | Case Name | Description | Success Criteria |
| :--- | :--- | :--- | :--- |
| **TC-01** | **Single Real Face** | A standard, unmanipulated portrait with neutral lighting. | Label: `Real`; Confidence < 0.30; Low geometry asymmetry. |
| **TC-02** | **Single Deepfake Face** | A high-quality face-swapped or GAN-generated image. | Label: `Deepfake`; Confidence > 0.75; High texture anomaly. |
| **TC-03** | **Multi-Face Detection** | An image with up to 5 people in the frame. | MTCNN detects all 5 faces; system generates 5 individual reports. |
| **TC-04** | **Mixed Real/Fake** | A frame containing both a real person and a deepfake. | Global Verdict: `Deepfake` (triggered by the single fake face). |
| **TC-05** | **Low-Light Scenarios** | A face captured in dim lighting or with significant shadow. | System maintains detection; falls back to texture if mesh fails. |
| **TC-06** | **Occluded Features** | Face partially hidden by hands, hair, or sunglasses. | Mesh engine marks landmarks as 'Uncertain'; CNN handles texture. |
| **TC-07** | **Non-Human Input** | An image of a pet, a landscape, or abstract art. | System returns `NoFaces` or `Real (0.0)`; graceful error handling. |
| **TC-08** | **Edge-of-Frame Faces** | Faces that are partially cropped at the image border. | Bounding box handles border clamping correctly without crashing. |
| **TC-09** | **Rapid Batch Load** | Processing 10 consecutive images in under 30 seconds. | No memory leaks; GPU VRAM remains stable; consistent latency. |

---

## 2. UI Testing (Functional Interaction)
UI tests verify that the user experience (UX) is intuitive and that the frontend communicates perfectly with the backend.

### A. Core Navigation & Layout
*   **Case UI-01**: Verify that the "Analyze" button is disabled until a valid image file is selected.
*   **Case UI-02**: Check if the "Model Selection" dropdown correctly switches between `ViT` and `Swin Transformer` models.
*   **Case UI-03**: Verify that the "History" page correctly loads the user's previous 10 detections from Firestore.

### B. Dynamic Result Rendering
*   **Case UI-04**: **Heatmap Overlay**: Ensure the red/blue heatmap is correctly aligned with the face in the original image.
*   **Case UI-05**: **LLM Explanation**: Verify that the "AI Explanation" box shows a typing animation while streaming the response.
*   **Case UI-06**: **Download Report**: Test if the "Download PDF" button generates a valid summary of the findings.

### C. Error Handling
*   **Case UI-07**: Uploading a 50MB image (Size limit test). Expected: UI shows "File size too large" warning.
*   **Case UI-08**: Server Timeout. Expected: UI shows "Connection lost, retrying..." instead of a blank screen.

---

## 3. Regression Testing (Stability & Accuracy)
Regression testing is performed after every code change (model updates, pipeline tweaks) to ensure no functionality has regressed.

*   **R-01: Accuracy Baseline (Gold Dataset)**
    *   **Method**: A fixed set of 100 images (50 Real / 50 Fake) is re-run.
    *   **Goal**: Ensure the F1-score remains above **0.91**.
*   **R-02: API Schema Lock**
    *   **Method**: Validate the `/api/detect` response structure.
    *   **Goal**: Ensure keys like `prediction`, `confidence`, and `faces` are never renamed or missing.
*   **R-03: Dependency Verification**
    *   **Method**: Re-run MTCNN detection after any `pip install` or environment update.
    *   **Goal**: Verify no conflicts between `torch` and `mediapipe` versions.

---

## 4. Passed v/s Failed Case Analysis
All tests are categorized based on their impact on system reliability.

### ✅ PASS Criteria
1.  **Label Match**: Predicted label matches the ground truth.
2.  **Latency**: Total processing time is under **6 seconds**.
3.  **Data Integrity**: JSON output contains all forensic evidence (mesh, heatmap, LLM text).

### ❌ FAIL Criteria
1.  **False Positive**: Flagging a real person as a deepfake (Severe Fail).
2.  **False Negative**: Missing a deepfake (Critical Fail).
3.  **Crash**: The backend returns a `500 Internal Server Error`.
4.  **UI Freeze**: The frontend becomes unresponsive during the upload process.

### Sample Testing Log Template
| Case ID | Status | Latency | Remarks |
| :--- | :--- | :--- | :--- |
| TC-01 | ✅ PASS | 2.1s | Detected real face; confidence 0.04. |
| UI-04 | ✅ PASS | N/A | Heatmap aligned perfectly with landmarks. |
| TC-02 | ❌ FAIL | 8.4s | Misclassified as 'Suspicious' instead of 'Deepfake'. |
