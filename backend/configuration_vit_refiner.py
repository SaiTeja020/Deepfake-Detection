from transformers import PretrainedConfig

class ViTRefinerConfig(PretrainedConfig):
    model_type = "vit_refiner"

    def __init__(
        self,
        vit_model_name="google/vit-base-patch16-224",
        embed_dim=768,
        num_labels=2,
        **kwargs
    ):
        super().__init__(**kwargs)

        self.vit_model_name = vit_model_name
        self.embed_dim = embed_dim
        self.num_labels = num_labels