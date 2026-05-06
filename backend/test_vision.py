import os
from huggingface_hub import InferenceClient
client = InferenceClient(api_key=os.environ.get("HF_TOKEN", ""))
models = ["llava-hf/llava-1.5-7b-hf", "google/paligemma-3b-mix-224", "HuggingFaceM4/idefics2-8b"]
for m in models:
    try:
        client.chat_completion(model=m, messages=[{"role": "user", "content": "hello"}], max_tokens=10)
        print("SUCCESS:", m)
    except Exception as e:
        print("FAILED:", m, str(e)[:100])
