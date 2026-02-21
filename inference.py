from transformers import AutoModelForImageClassification, AutoImageProcessor
from PIL import Image
import torch

MODEL_NAME = "SARVM/ViT_Deepfake"

processor = AutoImageProcessor.from_pretrained(MODEL_NAME)
model = AutoModelForImageClassification.from_pretrained(MODEL_NAME)
model.eval()

def predict_image(image_path):
    image = Image.open(image_path).convert("RGB")
    inputs = processor(images=image, return_tensors="pt")

    with torch.no_grad():
        outputs = model(**inputs)
        probs = torch.softmax(outputs.logits, dim=-1)
        confidence, predicted_class = torch.max(probs, dim=-1)

    return {
        "class": predicted_class.item(),
        "confidence": confidence.item()
    }

if __name__ == "__main__":
    result = predict_image("test.jpg")
    print(result)
