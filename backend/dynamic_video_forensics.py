import cv2
import numpy as np
import torch
import matplotlib.pyplot as plt
from PIL import Image
from torchvision import transforms

# Choose device automatically
DEVICE = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

def generate_dynamic_video_forensics(video_path, ground_truth_label, model, save_path="dynamic_forensic_report.png"):
    """
    Natively decodes video tracks frame‑by‑frame, runs sliding‑window evaluation passes,
    and extracts a clean spatial rollout from Swin without cyclic shift distortion.
    """
    cap = cv2.VideoCapture(video_path)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    
    if total_frames <= 0 or not cap.isOpened() or fps <= 0:
        raise ValueError(f"Target video structure could not be parsed safely at: {video_path}")
    
    duration = total_frames / fps
    print(f"[METADATA] Frames: {total_frames} | Frame Rate: {fps:.2f} FPS | Duration: {duration:.2f}s")
    
    val_transform = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
    ])
    
    all_processed_frames = []
    all_original_rgb = []
    last_valid_rgb = None
    
    # 1. READ ALL FRAMES WITH HARD BOUNDARY GUARDS
    for frame_idx in range(total_frames):
        grabbed = cap.grab()
        if not grabbed:
            break
        success, frame_bgr = cap.retrieve()
        if success and frame_bgr is not None and frame_bgr.size > 0:
            frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
            last_valid_rgb = cv2.resize(frame_rgb, (224, 224))
            all_original_rgb.append(last_valid_rgb)  # uint8
            all_processed_frames.append(val_transform(Image.fromarray(last_valid_rgb)))
        else:
            # repeat last good frame if read fails
            if last_valid_rgb is not None:
                all_original_rgb.append(last_valid_rgb)
                all_processed_frames.append(val_transform(Image.fromarray(last_valid_rgb)))
    cap.release()
    actual_read_count = len(all_processed_frames)
    
    if actual_read_count < 16:
        raise ValueError("Video sequence is too short to fulfill base 16 temporal checks.")
    
    # 2. SLIDING WINDOW EVALUATION
    window_size = 16
    stride = 8
    window_predictions = []
    for start_idx in range(0, actual_read_count - window_size + 1, stride):
        end_idx = start_idx + window_size
        window_slice = all_processed_frames[start_idx:end_idx]
        video_tensor = torch.stack(window_slice).unsqueeze(0).to(DEVICE)
        with torch.no_grad():
            logits = model(video_tensor)
            probs = torch.softmax(logits, dim=1).cpu().numpy()[0]
            window_predictions.append(probs[0])
    overall_fake_severity = np.mean(window_predictions) * 100
    
    # 3. SPATIAL ROLLOUT FROM SWIN ATTENTION MAP
    time_axis = np.arange(1, actual_read_count + 1)
    raw_frame_probabilities = np.interp(
        time_axis,
        np.linspace(1, actual_read_count, len(window_predictions)),
        window_predictions
    )
    kernel_size = 8
    smoothed_probabilities = np.convolve(raw_frame_probabilities, np.ones(kernel_size) / kernel_size, mode='same')
    guilty_frame_idx = int(np.argmax(smoothed_probabilities))
    
    # Pass the guilty frame through the Swin backbone to obtain attention maps
    target_frame_tensor = all_processed_frames[guilty_frame_idx].unsqueeze(0).to(DEVICE)
    with torch.no_grad():
        swin_outputs = model.swin(pixel_values=target_frame_tensor, output_attentions=True)
    # Use the standard window attention (second‑last layer)
    last_stage_attn = swin_outputs.attentions[-2][0].cpu().numpy()
    mean_spatial_attn = np.mean(last_stage_attn, axis=0)
    # Residual connection to soften focal collapse
    mean_spatial_attn = mean_spatial_attn + np.eye(mean_spatial_attn.shape[0])
    mean_spatial_attn = mean_spatial_attn / mean_spatial_attn.sum(axis=1, keepdims=True)
    spatial_rollout = mean_spatial_attn.sum(axis=0)
    grid_size = int(np.sqrt(spatial_rollout.shape[0]))
    raw_spatial_heatmap = spatial_rollout.reshape(grid_size, grid_size)
    spatial_heatmap_resized = cv2.resize(raw_spatial_heatmap, (224, 224))
    if spatial_heatmap_resized.max() != spatial_heatmap_resized.min():
        spatial_heatmap_resized = (spatial_heatmap_resized - spatial_heatmap_resized.min()) / (
            spatial_heatmap_resized.max() - spatial_heatmap_resized.min() + 1e-8)
    else:
        spatial_heatmap_resized = np.zeros_like(spatial_heatmap_resized)
    
    # 4. PRESENTATION DASHBOARD
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(16, 6), gridspec_kw={'width_ratios': [1.4, 1]})
    ax1.plot(time_axis, raw_frame_probabilities, color="#00E5FF", alpha=0.25, linestyle=":", label="Raw Window Signal")
    ax1.plot(time_axis, smoothed_probabilities, color="#00E5FF", linewidth=3, label="Smoothed Forensic Trend")
    ax1.fill_between(time_axis, smoothed_probabilities, color="#00E5FF", alpha=0.12)
    ax1.axhline(y=0.5, color="#FFFFFF", linestyle=":", alpha=0.4, label="Decision Threshold (50%)")
    ax1.axvline(x=guilty_frame_idx + 1, color="#FF3366", linestyle="--", linewidth=2.5,
                label=f"Global Anomaly Peak (Frame {guilty_frame_idx + 1})")
    ax1.scatter([guilty_frame_idx + 1], [smoothed_probabilities[guilty_frame_idx]],
                color="#FF3366", s=120, zorder=5)
    ax1.set_title(f"Dynamic Forensic Probability Track ({actual_read_count} Frames audited)",
                  fontsize=11, fontweight='bold')
    ax1.set_xlabel(f"True Frame Sequence Timeline (Total Duration: {duration:.2f}s at {fps:.1f} FPS)", fontsize=10)
    ax1.set_ylabel("Deepfake Probability Vector Intensity (0.0 -> 1.0)", fontsize=10)
    ax1.set_xlim(1, actual_read_count)
    ax1.set_ylim(-0.02, 1.02)
    ax1.grid(True, linestyle=":", alpha=0.25, color="#FFFFFF")
    ax1.legend(loc="upper left", facecolor="#222222", labelcolor="white")
    ax1.patch.set_facecolor('#1A1A2E')
    
    # Heatmap overlay (uint8 blending)
    clean_display_img_uint8 = all_original_rgb[guilty_frame_idx]
    heatmap_uint8 = np.uint8(255 * spatial_heatmap_resized)
    color_mapped_heat = cv2.applyColorMap(heatmap_uint8, cv2.COLORMAP_JET)
    color_mapped_heat = cv2.cvtColor(color_mapped_heat, cv2.COLOR_BGR2RGB)
    fused_forensic_overlay = cv2.addWeighted(clean_display_img_uint8, 0.55, color_mapped_heat, 0.45, 0)
    ax2.imshow(fused_forensic_overlay)
    ax2.axis('off')
    ax2.set_title(f"2D Hierarchical Localization at Anomaly Frame {guilty_frame_idx + 1}",
                  fontsize=11, fontweight='bold')
    
    verdict = "Fake / Manipulated Sequence" if overall_fake_severity > 50 else "Real / Authentic Footage"
    fig.suptitle(
        f"Omni Dynamic Forensic Video Diagnostic System Report\nGlobal Sequence Integrity Score Match: {verdict} ({overall_fake_severity:.2f}% Artifact Probability)",
        fontsize=13, fontweight='bold', y=1.02)
    
    plt.tight_layout()
    plt.savefig(save_path, bbox_inches='tight', dpi=300)
    plt.show()
    print(f"[COMPLETE] Dynamic visual tracking exported cleanly to path: {save_path}")
