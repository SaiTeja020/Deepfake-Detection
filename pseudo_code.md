# Foresight Deepfake Detection: High-Level Pseudo-Code

## 1. Frontend: User Interaction Lifecycle
```python
FUNCTION MainApp():
    INITIALIZE AuthContext (Firebase + Supabase Sync)
    IF user_not_logged_in: 
        SHOW LandingPage()
    ELSE:
        RENDER Sidebar() + ContentArea()

FUNCTION HandleImageUpload(file):
    VALIDATE file (size, format)
    CONVERT file to base64
    POST base64 to Backend(/api/detect)
    SHOW LoadingSpinner("Running Forensic Protocol...")
    RECEIVE result -> REDIRECT to ReportPage(result)
```

## 2. Backend: The Forensic Pipeline (/api/detect)
```python
FUNCTION DetectDeepfake(image_base64):
    # Stage 1: Pre-processing
    image = DECODE(image_base64)    
    
    # Stage 2: Face Detection (MTCNN)
    faces = MTCNN.detect_faces(image)
    IF no_faces: RETURN error("No biological signals detected")

    all_face_results = []
    FOR face IN faces:
        # Stage 3: Feature Extraction (Refined ViT)
        aligned_face = ALIGN(face.landmarks)
        logits, attention_weights = ViT_Model.predict(aligned_face)
        
        # Stage 4: Explainable AI (Grad-CAM)
        heatmap = GENERATE_HEATMAP(attention_weights)
        
        # Stage 5: 3D Validation (MediaPipe)
        mesh = MediaPipe.extract_mesh(face)
        anomalies = VALIDATE_GEOMETRY(mesh)
        
        SAVE_RESULT(face_id, logits, heatmap, anomalies)

    # Stage 6: Aggregate Verdict
    final_verdict = MAX_SEVERITY(all_face_results)
    
    # Stage 7: LLM Interpretation (Tiered Routing)
    explanation = ProviderRouter.get_explanation(
        verdict=final_verdict,
        evidence=all_face_results,
        image=image
    )

    RETURN {verdict, confidence, heatmap_url, explanation}
```

## 3. LLM Orchestration (ProviderRouter)
```python
FUNCTION GetExplanation(evidence_packet):
    FOR provider IN [Gemini, Mistral, HF_Serverless, Heuristic]:
        TRY:
            report = provider.generate(evidence_packet)
            IF report: RETURN report + "(via provider_name)"
        EXCEPT:
            CONTINUE  # Try next provider
    
    RETURN LocalHeuristicReport(evidence_packet) + "(Local Fallback)"
```

## 4. Data Persistence & Sync
```python
FUNCTION GetUserProfile(uid):
    profile = Supabase.fetch_user(uid)
    IF NOT profile:
        profile = Firebase.fetch_user(uid) # Self-healing
        Supabase.upsert(profile)
    RETURN profile
```
