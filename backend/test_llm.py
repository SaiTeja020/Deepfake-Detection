import os
from dotenv import load_dotenv
load_dotenv()
from llm_adapter import llm_service, parse_llm_structured_output

print("API Key loaded?", bool(os.getenv("GEMINI_API_KEY")))
explanation = llm_service.get_explanation("Fake", 98.5, "ViT")
print(explanation)
