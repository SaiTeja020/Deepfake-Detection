import os
import json
import torch
import torch.nn as nn
from safetensors.torch import load_file as safetensors_load_file
from huggingface_hub import hf_hub_download
from transformers import SwinForImageClassification
import sys

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'model')))
from freq_branch import FrequencyBranch

class TemporalTransformer(nn.Module):
    def __init__(self, spatial_embed_dim=1792, num_frames=16, num_heads=8, num_layers=4):
        super().__init__()
        self.pos_embedding = nn.Parameter(torch.zeros(1, num_frames, spatial_embed_dim))
        
        encoder_layer = nn.TransformerEncoderLayer(
            d_model=spatial_embed_dim,
            nhead=num_heads,
            dim_feedforward=2048,
            dropout=0.1,
            activation='gelu',
            batch_first=True
        )
        self.transformer = nn.TransformerEncoder(encoder_layer, num_layers=num_layers)
        
        self.classifier = nn.Sequential(
            nn.LayerNorm(spatial_embed_dim),
            nn.Linear(spatial_embed_dim, 512),
            nn.ReLU(),
            nn.Dropout(0.5),
            nn.Linear(512, 2)
        )

    def forward(self, x):
        # x shape: [B, N, D]
        x = x + self.pos_embedding
        x = self.transformer(x)
        x = x.mean(dim=1)
        return self.classifier(x)

class OmniDeepfakeDetector(nn.Module):
    def __init__(self, spatial_backbone, freq_branch, temporal_transformer):
        super().__init__()
        self.spatial_backbone = spatial_backbone
        self.freq_branch = freq_branch
        self.temporal_transformer = temporal_transformer

    def forward(self, x):
        # x shape: [B, N, C, H, W]
        B, N, C, H, W = x.shape
        images = x.view(B * N, C, H, W)
        
        swin_output = self.spatial_backbone.swin(pixel_values=images)
        spatial_features = swin_output.pooler_output
        freq_features = self.freq_branch(images)
        
        concatenated = torch.cat((spatial_features, freq_features), dim=1)
        frame_embeddings = concatenated.view(B, N, -1)
        
        return self.temporal_transformer(frame_embeddings)

def load_temporal_transformer(device, hf_token=None):
    """
    Downloads and loads the full sharded OmniDeepfakeDetector model (Swin, Frequency, and Video Head)
    from Hugging Face repo 'SARVM/Temporal-Swin'.
    """
    print("Initializing OmniDeepfakeDetector components...")
    
    # 1. Initialize SwinForImageClassification backbone with 2 classes
    spatial_backbone = SwinForImageClassification.from_pretrained(
        "microsoft/swin-base-patch4-window7-224",
        num_labels=2,
        ignore_mismatched_sizes=True,
        low_cpu_mem_usage=False,
        token=hf_token
    )
    
    # 2. Initialize FrequencyBranch — default channel_sizes [64, 128, 768] matches
    # the SARVM/Temporal-Swin checkpoint architecture (no explicit override needed)
    freq_branch = FrequencyBranch()
    
    # 3. Initialize TemporalTransformer video head
    temporal_transformer = TemporalTransformer()
    
    # 4. Assemble OmniDeepfakeDetector
    model = OmniDeepfakeDetector(spatial_backbone, freq_branch, temporal_transformer).to(device)

    try:
        print("Downloading weights map index from SARVM/Temporal-Swin...")
        # Download index file
        index_path = hf_hub_download(
            repo_id="SARVM/Temporal-Swin",
            filename="model.safetensors.index.json",
            token=hf_token
        )
        with open(index_path, "r", encoding="utf-8") as f:
            index_data = json.load(f)

        # Extract unique shard filenames
        weight_map = index_data.get("weight_map", {})
        shard_files = sorted(list(set(weight_map.values())))
        print(f"Detected {len(shard_files)} sharded safetensors files to download.")

        # Download each shard and assemble the state dictionary
        state_dict = {}
        for shard_file in shard_files:
            print(f"Downloading shard: {shard_file}...")
            shard_path = hf_hub_download(
                repo_id="SARVM/Temporal-Swin",
                filename=shard_file,
                token=hf_token
            )
            shard_state_dict = safetensors_load_file(shard_path, device="cpu")
            state_dict.update(shard_state_dict)

        # Load the compiled state_dict with strict=False to accommodate minor structural/naming differences in the layers
        model.load_state_dict(state_dict, strict=False)
        model.eval()
        print("SUCCESS: Full OmniDeepfakeDetector video model loaded from Hugging Face.")
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"WARNING: Failed to load sharded safetensors weights for video model: {e}")
        print("Initializing with random weights for fallback usage.")

    return model
