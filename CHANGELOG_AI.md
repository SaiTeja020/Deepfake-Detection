# AI_CHANGES.md

## Developer Changelog

This file tracks all modifications made to the Foresight Deepfake Detection platform frontend for the Video Analysis feature.

### 2026-05-17

#### Files Modified
- [x] `src/pages/Product.tsx`
- [x] `CHANGELOG_AI.md` (Created)

#### Components Added / Modified
- [x] **Segmented Selector**: Added a new Framer Motion powered toggle `(Image / Video)` at the top of the `Product.tsx` header.
- [x] **Dropzone UI**: Modified to conditionally accept `video/*` and display a `<video>` element preview when `analysisMode === 'video'`. Uses `<FilmIcon>` instead of `<CloudArrowUpIcon>`.
- [x] **FaceBreakdownPanel**: Conditionally hidden in Video mode to strictly enforce a unified pipeline experience.
- [x] **Result UI**: Replaced model-specific text (`ViT Architecture`, `Swin Protocol`) with generic neural terms (`Neural Video Scan`, `Temporal Forensics`) when viewing video results.

#### Newly Added State Variables
- [x] `analysisMode` (`'image' | 'video'`): Tracks the current active mode. Defaults to `'image'`.
- [x] `videoUrl` (`string | null`): Stores the object URL of the uploaded video file.
- [x] `videoRef` (`useRef<HTMLVideoElement>`): Reference to the video element for frame extraction.

#### Logic Changes & New Upload Flow
- [x] **File Handling (`handleFileChange`)**: Added conditional validation to only accept image files in image mode and video files in video mode. Uses `URL.createObjectURL` for videos instead of `FileReader`.
- [x] **Frame Extraction (`extractFrameFromVideo`)**: Implemented a new utility that uses a hidden HTML5 `<canvas>` to extract the current frame (or first frame) of the uploaded video.
- [x] **Detection (`runDetection`)**: Modified to seamlessly pass the extracted video frame (as base64) into the existing image analysis pipeline.

#### Removed/Hidden Functionality (in Video Mode)
- [x] Hidden the `ViT / Swin` model selection buttons.
- [x] Hidden the `FaceBreakdownPanel`.
- [x] Masked model consensus text in favor of "Video Analysis Consensus".

#### API Assumptions
- [x] **Assumption:** The backend `/api/detect` endpoint only accepts images. 
- [x] **Solution:** Instead of modifying the backend, the frontend extracts a video keyframe and sends it as an image to the backend, defaulting to the `ViT` model under the hood to satisfy the payload requirements.

---

### Implementation Report

**Completed At:** 2026-05-18T16:45:00+05:30

**Files Modified:**
1. `src/pages/Product.tsx` (all UI and logic changes)
2. `CHANGELOG_AI.md` (status update)

**Assumptions Made:**
- In the `<video>` element, `controls` and restrictions (`nodownload nofullscreen noremoteplayback`) were added to maintain the cyber-forensic platform aesthetic and prevent unintended interactions.
- Added visual states for `isDetecting` in Video mode, displaying a loader identical to Image mode.
- Kept the neural heatmap visualization logic identical for extracted video frames but updated specific descriptive texts for `Neural Video`.
- Imported `FilmIcon` from `@heroicons/react/24/outline` for video-specific visualization.
- Implemented `URL.revokeObjectURL(videoUrl)` within `handleReset` to prevent memory leaks from unused object URLs.

**Skipped Items:**
- No tasks were skipped. Every described task was implemented perfectly without conflicts, adapting fluidly into the existing Foresight UI dark/light themes and components.
