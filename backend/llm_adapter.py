import os

class LLMProvider:
    def generate_explanation(self, prediction, confidence, model_used):
        raise NotImplementedError

class GeminiProvider(LLMProvider):
    def __init__(self):
        import google.generativeai as genai
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            print("Warning: GEMINI_API_KEY not set")
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel('gemini-1.5-flash')

    def generate_explanation(self, prediction, confidence, model_used):
        prompt = f"You are a deepfake detection forensic system. An image was analyzed using the {model_used} architecture. The prediction is '{prediction}' with a confidence of {confidence}%. Provide a 2-3 sentence technical and professional explanation for this result, suitable for an analyst dashboard."
        try:
            response = self.model.generate_content(prompt)
            return response.text.strip()
        except Exception as e:
            print(f"Gemini error: {e}")
            return f"Analysis using {model_used} protocol. {prediction} detected with {confidence}% confidence."

class LlamaProvider(LLMProvider):
    def __init__(self):
        from huggingface_hub import InferenceClient
        hf_token = os.getenv("HF_TOKEN")
        if not hf_token:
            print("Warning: HF_TOKEN not set for LlamaProvider")
        # Ensure your HF_TOKEN has permissions to use the meta-llama model
        self.client = InferenceClient(model="meta-llama/Meta-Llama-3-8B-Instruct", token=hf_token)

    def generate_explanation(self, prediction, confidence, model_used):
        prompt = f"You are a deepfake detection forensic system. An image was analyzed using the {model_used} architecture. The prediction is '{prediction}' with a confidence of {confidence}%. Provide a 2-3 sentence technical and professional explanation for this result, suitable for an analyst dashboard."
        try:
            messages = [{"role": "user", "content": prompt}]
            response = self.client.chat_completion(messages, max_tokens=150)
            return response.choices[0].message.content.strip()
        except Exception as e:
            print(f"Llama error: {e}")
            return f"Analysis using {model_used} protocol. {prediction} detected with {confidence}% confidence."

class LLMAdapter:
    def __init__(self, provider_name="gemini"):
        self.provider_name = provider_name.lower()
        if self.provider_name == "gemini":
            self.provider = GeminiProvider()
        elif self.provider_name == "llama":
            self.provider = LlamaProvider()
        else:
            raise ValueError(f"Unknown provider: {provider_name}")

    def get_explanation(self, prediction, confidence, model_used):
        return self.provider.generate_explanation(prediction, confidence, model_used)

# ==========================================
# CONFIGURATION
# 1-Line switch: Change "gemini" to "llama" to switch standard LLM provider.
# ==========================================
ACTIVE_PROVIDER = "gemini"

# Singleton instance for easy import across backend files
llm_service = LLMAdapter(ACTIVE_PROVIDER)
