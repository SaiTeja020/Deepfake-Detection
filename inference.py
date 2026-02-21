import torch
from transformers import AutoModelForImageClassification
from PIL import Image
import torchvision.transforms as transforms

# ==========================================
# Configuration
# ==========================================

MODEL_NAME = "SARVM/ViT_Deepfake"  # CHANGE THIS
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# ==========================================
# Load Model
# ==========================================

model = AutoModelForImageClassification.from_pretrained(MODEL_NAME)
model.to(DEVICE)
model.eval()

# ==========================================
# Image Preprocessing (Resize Included)
# ==========================================

transform = transforms.Compose([
    transforms.Resize((224, 224)),  # Resize to ViT input size
    transforms.ToTensor(),
    transforms.Normalize(
        mean=[0.485, 0.456, 0.406],   # ImageNet mean
        std=[0.229, 0.224, 0.225]     # ImageNet std
    )
])

def preprocess_image(image_path):
    image = Image.open(image_path).convert("RGB")
    image = transform(image)
    image = image.unsqueeze(0)  # Add batch dimension
    return image.to(DEVICE)

# ==========================================
# Prediction Function
# ==========================================

def predict_image(image_path):
    image_tensor = preprocess_image(image_path)

    with torch.no_grad():
        outputs = model(image_tensor).logits
        probabilities = torch.softmax(outputs, dim=1)
        confidence, predicted_class = torch.max(probabilities, dim=1)

    label = model.config.id2label[predicted_class.item()]

    return {
        "label": label,
        "confidence": round(confidence.item(), 4)
    }

# ==========================================
# CLI Execution
# ==========================================

if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python inference.py <image_path>")
    else:
        image_path = sys.argv[1]
        result = predict_image(image_path)

        print("\nPrediction Result:")
        print(f"Label: {result['label']}")
        print(f"Confidence: {result['confidence']}")
