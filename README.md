# Deepfake Detection using Vision Transformer (ViT)

## Overview

This project implements a **Deepfake Image Detection System** using a fine-tuned **Vision Transformer (ViT-Base-Patch16-224)** model.  
The objective is to classify facial images as **Real** or **Fake** using deep learning techniques and transformer-based architectures.

This repository contains the training pipeline, evaluation scripts, and inference code.  
The trained model weights are hosted separately on Hugging Face.

---

## Model Architecture

- Backbone: ViT-Base-Patch16-224
- Framework: PyTorch + Hugging Face Transformers
- Task: Binary Image Classification (Real vs Fake)

---

## Dataset

The model was trained on a deepfake image dataset sourced from Kaggle.

🔗 **Kaggle Dataset Link:**  
> _(https://www.kaggle.com/datasets/manjilkarki/deepfake-and-real-images/suggestions)_
> _(https://kaggle.com/datasets/39a1b2d75d3b5a9510caf29a9be7e94552288f6f45e8092bcf004111979a3870)_

### Expected Dataset Structure

Dataset/<br>
│<br>
├── train/<br>
│ ├── real/<br>
│ └── fake/<br>
│<br>
├── val/<br>
│ ├── real/<br>
│ └── fake/<br>
│<br>
└── test/<br>
| ├── real/<br>
| └── fake/<br>


---

## Pretrained Model

The fine-tuned model is available on Hugging Face:

🔗 **Hugging Face Model Link:**  
> _[https://huggingface.co/SARVM/ViT_Deepfake]_

You can load the model directly using:

```python
from transformers import ViTForImageClassification, ViTImageProcessor

model = ViTForImageClassification.from_pretrained("YOUR_HF_MODEL_LINK")
processor = ViTImageProcessor.from_pretrained("YOUR_HF_MODEL_LINK")
```

## Installation

### Clone the repository:

git clone https://github.com/your-username/Deepfake-Detection-ViT.git
cd Deepfake-Detection-ViT

## Install dependencies:

pip install -r requirements.txt
