# Comprehensive System Validation & Testing Documentation

This document provides a detailed explanation of the testing strategy for the Deepfake Detection System, covering System Validation, UI Testing, and Regression Testing.

---

## 1. System Validation Test Cases
System validation ensures that the end-to-end detection pipeline works correctly under various conditions.

### TC-01: Single Real Face (Baseline)
*   **Description**: Testing with a high-quality, unmanipulated image.
*   **Flow**: `Input -> MTCNN (Detection) -> Face Mesh (Geometry) -> ViT (Inference) -> Result`.
*   **Success Criteria**: Label must be `Real`. Confidence score < 0.30.

### TC-02: Single Deepfake Face (Primary Task)
*   **Description**: Testing with a known manipulated image (e.g., face-swapped).
*   **Flow**: Identifies unnatural textures and geometric inconsistencies (eye asymmetry).
*   **Success Criteria**: Label must be `Deepfake`. Confidence score > 0.75.

### TC-03: Multi-Face Support
*   **Description**: Image containing 3-5 people.
*   **Flow**: Pipeline loops through each detected bounding box, calculating per-face scores.
*   **Success Criteria**: All faces detected; individual verdicts generated.

### TC-04: Mixed Reality (Real + Fake)
*   **Description**: One person is real, another is deepfaked in the same frame.
*   **Flow**: Aggregator checks if *any* face is flagged as deepfake.
*   **Success Criteria**: System flags the image as `Deepfake` because of the single manipulated face.

---

## 2. UI Testing (User Experience)
UI testing ensures that the frontend React application interacts correctly with the backend and provides a smooth user journey.

| Test Case | Interaction | Expected UI Behavior |
| :--- | :--- | :--- |
| **UI-01: Image Upload** | Drag & drop a `.jpg` file. | File preview appears immediately; "Analyze" button becomes active. |
| **UI-02: Model Selection** | Toggle between "ViT" and "Swin". | UI updates model name; subsequent analysis uses the selected engine. |
| **UI-03: Result Rendering** | Post-analysis state. | Heatmap overlay displays; LLM explanation streams into the text box. |
| **UI-04: Navigation** | Click "Product" -> "History". | Page transitions smoothly without losing session authentication. |

---

## 3. Regression Testing
Regression testing ensures that new features (like adding the forensic interpreter) do not break existing core functionality.

*   **API Schema Consistency**: Verify that the `/api/detect` endpoint always returns the required keys (`prediction`, `confidence`, `explanation`) even if the underlying model changes.
*   **Model Accuracy Baseline**: Re-running the test dataset after pipeline optimization to ensure the F1-score does not drop below 0.85.
*   **Dependency Audit**: Checking that updating libraries (like `torch` or `transformers`) doesn't cause segmentation faults in MTCNN.

---

## 4. Pass v/s Failed Logic
The system uses a weighted threshold logic to determine the final status of a test.

*   **✅ PASS**: The predicted label matches the ground truth, AND the confidence is within the expected range, AND the response time is < 5000ms.
*   **❌ FAIL**:
    *   **Misclassification**: Real image marked as Deepfake (False Positive) or vice versa (False Negative).
    *   **Timeout**: Analysis takes > 15 seconds.
    *   **Crash**: Backend returns 500 error due to memory/GPU issues.
    *   **Incomplete Data**: Result missing the heatmap or the LLM explanation.
