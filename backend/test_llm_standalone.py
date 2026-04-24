import os
import json
import io
import base64
import requests
from dotenv import load_dotenv
import google.generativeai as genai
from huggingface_hub import InferenceClient

load_dotenv()

def test_gemini():
    print("\n--- Testing Gemini 2.0 Flash ---")
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("ERROR: GEMINI_API_KEY not found in .env")
        return
    
    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-2.0-flash')
        response = model.generate_content("Hello! Are you working? Respond with 'YES'.")
        print(f"RESPONSE: {response.text}")
    except Exception as e:
        print(f"ERROR: Gemini failed: {e}")

def test_mistral():
    print("\n--- Testing Mistral Pixtral (via Requests) ---")
    api_key = os.getenv("MISTRAL_API_KEY")
    if not api_key:
        print("ERROR: MISTRAL_API_KEY not found in .env")
        return
    
    try:
        url = "https://api.mistral.ai/v1/chat/completions"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}"
        }
        payload = {
            "model": "pixtral-12b-2409",
            "messages": [
                {"role": "user", "content": "Hello! Respond with 'YES' if you are active."}
            ],
            "max_tokens": 10
        }
        response = requests.post(url, headers=headers, json=payload, timeout=10)
        response.raise_for_status()
        print(f"RESPONSE: {response.json()['choices'][0]['message']['content'].strip()}")
    except Exception as e:
        print(f"ERROR: Mistral failed: {e}")

if __name__ == "__main__":
    print("Starting Standalone LLM Provider Test...")
    test_gemini()
    test_mistral()
    print("\nTests complete.")
