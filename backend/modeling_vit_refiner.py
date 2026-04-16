import torch
import torch.nn as nn
from transformers import PreTrainedModel, ViTForImageClassification
from configuration_vit_refiner import ViTRefinerConfig

class ViTRefinerModel(PreTrainedModel):
    config_class = ViTRefinerConfig

    def __init__(self, config):
        super().__init__(config)

        # Ensure base model is initialized with the ability to output attentions
        self.vit = ViTForImageClassification.from_pretrained(
            config.vit_model_name,
            num_labels=config.num_labels,
            ignore_mismatched_sizes=True,
            output_attentions=True
        )

        self.refiner = nn.Sequential(
            nn.Conv2d(config.embed_dim, config.embed_dim, 3, padding=1, groups=config.embed_dim),
            nn.GELU(),
            nn.Conv2d(config.embed_dim, config.embed_dim, 1),
            nn.BatchNorm2d(config.embed_dim)
        )

        self.post_init()  # HF requirement

    def forward(self, pixel_values, output_attentions=None):
        # Delegate output_attentions to the inner ViT
        outputs = self.vit.vit(
            pixel_values=pixel_values, 
            output_attentions=output_attentions
        )
        tokens = outputs.last_hidden_state

        cls_token = tokens[:, :1, :]
        patches = tokens[:, 1:, :]

        B, N, C = patches.shape
        grid = int(N ** 0.5)

        patches = patches.transpose(1, 2).reshape(B, C, grid, grid)

        refined = self.refiner(patches)
        refined = refined.flatten(2).transpose(1, 2)

        tokens = torch.cat([cls_token, refined], dim=1)

        logits = self.vit.classifier(tokens[:, 0, :])

        return {
            "logits": logits,
            "attentions": outputs.attentions if output_attentions else None
        }