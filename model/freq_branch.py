"""
freq_branch.py
==============
Shared module for the Frequency Branch deepfake detection components.
Imported by both model notebooks (via local path) and the production backend
(via sys.path injection in backend/app.py). Single source of truth — do NOT copy.

Classes:
    FrequencyBranch    — FFT-based CNN feature extractor (always 768-D output)
    FusionClassifier   — Concatenates spatial + freq features → class logits

Helpers:
    load_frozen_freq_branch()  — Downloads pre-trained weights from HuggingFace
                                 and returns a frozen FrequencyBranch instance
"""

import torch
import torch.nn as nn
import torch.fft


# ---------------------------------------------------------------------------
# Core Module 1: FrequencyBranch
# ---------------------------------------------------------------------------

class FrequencyBranch(nn.Module):
    """
    Converts an input image tensor to its log-scaled 2D FFT magnitude spectrum,
    then extracts discriminative features via a lightweight CNN.

    Processing pipeline:
        1. torch.fft.fft2  — pixel grid → complex wave representation
        2. fftshift         — lowest frequencies shifted to the centre
        3. log(|FFT| + ε)  — magnitude extracted; log-scale suppresses natural
                              low-freq energy and highlights faint AI artifacts
        4. CNN              — learns to detect geometric "star" / grid patterns

    Output is always embed_dim-D (default 768) regardless of spatial backbone.
    This makes the branch fully backbone-agnostic.
    """

    def __init__(self, embed_dim: int = 768):
        super().__init__()
        self.embed_dim = embed_dim
        self.freq_extractor = nn.Sequential(
            # Block 1: 3 → 32 channels, halve spatial resolution
            nn.Conv2d(3, 32, kernel_size=3, stride=2, padding=1),
            nn.BatchNorm2d(32),
            nn.ReLU(),
            # Block 2: 32 → 64 channels
            nn.Conv2d(32, 64, kernel_size=3, stride=2, padding=1),
            nn.BatchNorm2d(64),
            nn.ReLU(),
            # Block 3: 64 → 128 channels
            nn.Conv2d(64, 128, kernel_size=3, stride=2, padding=1),
            nn.BatchNorm2d(128),
            nn.ReLU(),
            # Global average pooling → [B, 128, 1, 1]
            nn.AdaptiveAvgPool2d((1, 1)),
            nn.Flatten(),
            # Project to embedding dimension
            nn.Linear(128, embed_dim),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Args:
            x: Image tensor of shape [B, 3, H, W] in the range the processor
               normally outputs (e.g. normalised ImageNet values).

        Returns:
            Frequency feature tensor of shape [B, embed_dim].
        """
        # Step 1: 2D FFT — pixel space → complex frequency space
        fft_x = torch.fft.fft2(x)

        # Step 2: Shift DC component (lowest frequency) to the centre
        fft_x_shifted = torch.fft.fftshift(fft_x)

        # Step 3: Extract magnitude; apply log scale to highlight faint artifacts
        # Epsilon (1e-8) prevents log(0) on zero-energy pixels
        magnitude_spectrum = torch.log(torch.abs(fft_x_shifted) + 1e-8)

        # Step 4: CNN learns frequency-domain artifact patterns
        return self.freq_extractor(magnitude_spectrum)


# ---------------------------------------------------------------------------
# Core Module 2: FusionClassifier
# ---------------------------------------------------------------------------

class FusionClassifier(nn.Module):
    """
    Concatenates spatial backbone features with FrequencyBranch features and
    maps the combined representation to class logits.

    Dimension guide:
        ViT-Base  : spatial_dim=768,  freq_dim=768  → combined 1536-D
        Swin-Base : spatial_dim=1024, freq_dim=768  → combined 1792-D
    """

    def __init__(
        self,
        spatial_dim: int,
        freq_dim: int = 768,
        num_classes: int = 2,
    ):
        super().__init__()
        self.spatial_dim = spatial_dim
        self.freq_dim = freq_dim
        combined_dim = spatial_dim + freq_dim

        self.classifier = nn.Sequential(
            nn.Linear(combined_dim, 512),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(512, num_classes),
        )

    def forward(
        self,
        spatial_features: torch.Tensor,
        freq_features: torch.Tensor,
    ) -> torch.Tensor:
        """
        Args:
            spatial_features: [B, spatial_dim] tensor from ViT/Swin backbone
            freq_features:    [B, freq_dim]    tensor from FrequencyBranch

        Returns:
            logits: [B, num_classes]
        """
        fused = torch.cat((spatial_features, freq_features), dim=1)
        return self.classifier(fused)


# ---------------------------------------------------------------------------
# Helper: load_frozen_freq_branch
# ---------------------------------------------------------------------------

def load_frozen_freq_branch(
    hf_repo_id: str,
    device: torch.device,
    filename: str = "freq_branch_standalone.pth",
    embed_dim: int = 768,
) -> FrequencyBranch:
    """
    Downloads the pre-trained FrequencyBranch weights from HuggingFace,
    loads them into a FrequencyBranch instance, and freezes all parameters.

    The input file (freq_branch_standalone.pth) is a raw state_dict —
    NOT a nested checkpoint dict. torch.load() returns the state_dict directly.

    Args:
        hf_repo_id : HuggingFace repo ID, e.g. "SARVM/Frequency_Branch"
        device     : torch.device to load the model onto
        filename   : name of the .pth file in the HF repo
        embed_dim  : FrequencyBranch output dimension (default 768)

    Returns:
        A fully frozen FrequencyBranch ready for inference.
    """
    try:
        from huggingface_hub import hf_hub_download
    except ImportError as e:
        raise ImportError(
            "huggingface_hub is required. Install with: pip install huggingface-hub"
        ) from e

    weights_path = hf_hub_download(repo_id=hf_repo_id, filename=filename)

    # Raw state_dict — load directly, no nested key extraction needed
    state_dict = torch.load(weights_path, map_location=device)

    branch = FrequencyBranch(embed_dim=embed_dim).to(device)
    branch.load_state_dict(state_dict)
    branch.eval()

    # Freeze every parameter — this branch is a static feature extractor
    for param in branch.parameters():
        param.requires_grad = False

    return branch
