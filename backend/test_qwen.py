import os
import sys
from huggingface_hub import InferenceClient

hf_token = os.environ.get("HF_TOKEN", "")
client = InferenceClient(api_key=hf_token)

models = [
    "Qwen/Qwen2.5-VL-7B-Instruct",
    "Qwen/Qwen2.5-VL-3B-Instruct",
    "Qwen/Qwen2-VL-7B-Instruct",
    "meta-llama/Llama-3.2-11B-Vision-Instruct",
    "mistralai/Pixtral-12B-2409"
]

for m in models:
    try:
        res = client.chat_completion(
            model=m,
            messages=[{"role": "user", "content": "hello"}],
            max_tokens=10
        )
        print(f"SUCCESS: {m}")
    except Exception as e:
        print(f"FAILED: {m} - {str(e)[:150]}")
