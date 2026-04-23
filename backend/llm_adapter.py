import os
import json

class LLMProvider:
    def generate_explanation(self, prediction, confidence, model_used, image_reference=None, heatmap_reference=None, pipeline_context=None, suggested_llm_stance="ambiguity"):
        raise NotImplementedError


def parse_llm_structured_output(raw):
    if raw is None:
        return None
    if isinstance(raw, dict):
        return raw
    text = str(raw).strip()
    # Try to extract JSON from text if wrapped
    import re
    json_match = re.search(r'\{.*\}', text, re.DOTALL)
    if json_match:
        text = json_match.group(0)
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    # If not JSON, assume it's explanation text, and set defaults
    return {
        "explanation": text,
        "suspicious_domains": [],
        "model_consensus": ""
    }


def build_fallback_explanation(prediction, confidence, model_used, image_reference=None, heatmap_reference=None):
    region_info = (
        "The attention map suggests focus at central facial landmarks (eyes, nose, mouth) and border textures." if prediction.lower() == 'real'
        else "The attention map suggests anomalies around cheekbones, mouth edges, and periorbital zones where synthesis artifacts often appear."
    )

    return (
        f"{model_used} forensic analysis indicates '{prediction}' with {confidence}% confidence. "
        f"{region_info} "
        "Focus on the heatmap regions for validation."
    )


class GeminiProvider(LLMProvider):
    def __init__(self):
        import google.generativeai as genai
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            print("Warning: GEMINI_API_KEY not set")
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel('gemini-1.5-flash')

    def generate_explanation(self, prediction, confidence, model_used, image_reference=None, heatmap_reference=None, pipeline_context=None, suggested_llm_stance="ambiguity"):
        image_info = image_reference or "<original image data provided>"
        heatmap_info = heatmap_reference or "<attention heatmap generated>"

        face_block = (
            f"\nPer-face pipeline data:\n{pipeline_context}"
            if pipeline_context else ""
        )

        stance_text = ""
        if suggested_llm_stance == "manipulation":
            stance_text = "Emphasize detected synthetic artifacts, geometric anomalies, and unnatural textures discovered in the signal."
        elif suggested_llm_stance == "authentic":
            stance_text = "Emphasize natural geometry, consistent structural integrity, and normal skin transitions found in the signal."
        elif "ambiguity" in suggested_llm_stance:
            if "insufficient_data" in suggested_llm_stance:
                stance_text = "The model is uncertain due to poor crop quality or insufficient data. Explain that the forensic data quality prevents a robust analysis."
            else:
                stance_text = "The model is mathematically uncertain. Neutrally present conflicting evidence on both sides, explaining why the system cannot make a definitive ruling."

        prompt = (
            f"You are a deepfake detection forensic system. A face image was analyzed using the {model_used} architecture. "
            f"The model outcome is '{prediction}' with {confidence}% confidence.{face_block} "
            f"Your task is to explain WHY the model made this prediction based on the visual evidence in the provided original image and heatmap (if available). {stance_text} "
            f"Do NOT contradict the model's outcome. "
            f"Ignore providing URLs. Use only brief technical detail. "
            f"Focus on image regions (face landmarks, edges, textures) and heatmap cues. "
            f"For '{prediction}' prediction, choose suspicious_domains that indicate authenticity if Real, or artifacts if Fake. "
            "Output ONLY valid JSON with no extra text. "
            "Format: {\"explanation\":\"2-3 sentences here\", \"suspicious_domains\":[\"item1\",\"item2\"], \"model_consensus\":\"1 sentence here\"} "
            "Example for Real: {\"explanation\":\"The model detected authentic eye reflections and natural skin transitions.\", \"suspicious_domains\":[\"Natural eye geometry\",\"Consistent skin tone\"], \"model_consensus\":\"Global feature correlation analysis verified via forensic protocol.\"} "
            "Example for Fake: {\"explanation\":\"The model found synthetic blending around mouth and eyes.\", \"suspicious_domains\":[\"Periorbital margin\",\"Mandibular texture\"], \"model_consensus\":\"Global feature correlation analysis verified via forensic protocol.\"}"
        )
        contents = [prompt]
        if image_reference is not None:
            contents.append(image_reference)
        if heatmap_reference is not None:
            contents.append(heatmap_reference)
            
        try:
            response = self.model.generate_content(contents)
            generated = response.text.strip() if hasattr(response, 'text') else ''
            print(f"Gemini raw response: {generated}")  # Debug log
            parsed = parse_llm_structured_output(generated)
            if not parsed or not parsed.get('explanation'):
                print("Gemini produced non-actionable response, falling back.")
                return {
                    'explanation': build_fallback_explanation(prediction, confidence, model_used, image_reference, heatmap_reference),
                    'suspicious_domains': [],
                    'model_consensus': ''
                }
            return parsed
        except Exception as e:
            print(f"Gemini error: {e}")
            return {
                'explanation': build_fallback_explanation(prediction, confidence, model_used, image_reference, heatmap_reference),
                'suspicious_domains': [],
                'model_consensus': ''
            }

class LlamaProvider(LLMProvider):
    def __init__(self):
        try:
            import importlib
            hf_module = importlib.import_module('huggingface_hub')
            InferenceClient = getattr(hf_module, 'InferenceClient')
            hf_token = os.getenv("HF_TOKEN")
            if not hf_token:
                print("Warning: HF_TOKEN not set for LlamaProvider")
            # Ensure your HF_TOKEN has permissions to use the meta-llama model
            self.client = InferenceClient(model="meta-llama/Meta-Llama-3-8B-Instruct", token=hf_token)
        except Exception as e:
            print(f"Llama init error: {e}")
            self.client = None

    def generate_explanation(self, prediction, confidence, model_used, image_reference=None, heatmap_reference=None, pipeline_context=None, suggested_llm_stance="ambiguity"):
        if self.client is None:
            print("Llama client unavailable, using fallback")
            return build_fallback_explanation(prediction, confidence, model_used, image_reference, heatmap_reference)

        face_block = (
            f"\nPer-face pipeline data:\n{pipeline_context}"
            if pipeline_context else ""
        )

        stance_text = ""
        if suggested_llm_stance == "manipulation":
            stance_text = "Emphasize detected synthetic artifacts, geometric anomalies, and unnatural textures discovered in the signal."
        elif suggested_llm_stance == "authentic":
            stance_text = "Emphasize natural geometry, consistent structural integrity, and normal skin transitions found in the signal."
        elif "ambiguity" in suggested_llm_stance:
            if "insufficient_data" in suggested_llm_stance:
                stance_text = "The model is uncertain due to poor crop quality or insufficient data. Explain that the forensic data quality prevents a robust analysis."
            else:
                stance_text = "The model is mathematically uncertain. Neutrally present conflicting evidence on both sides, explaining why the system cannot make a definitive ruling."

        prompt = (
            f"You are a deepfake detection forensic system. A face image was analyzed using the {model_used} architecture. "
            f"The model outcome is '{prediction}' with {confidence}% confidence.{face_block} "
            f"{stance_text} "
            f"Ignore providing URLs. Use only brief technical detail. "
            f"Focus on image regions (face landmarks, edges, textures) and heatmap cues. "
            f"For '{prediction}' prediction, choose suspicious_domains that indicate authenticity if Real, or artifacts if Fake. "
            "Output ONLY valid JSON with no extra text. "
            "Format: {\"explanation\":\"2-3 sentences here\", \"suspicious_domains\":[\"item1\",\"item2\"], \"model_consensus\":\"1 sentence here\"} "
            "Example for Real: {\"explanation\":\"The model detected authentic eye reflections and natural skin transitions.\", \"suspicious_domains\":[\"Natural eye geometry\",\"Consistent skin tone\"], \"model_consensus\":\"Global feature correlation analysis verified via forensic protocol.\"} "
            "Example for Fake: {\"explanation\":\"The model found synthetic blending around mouth and eyes.\", \"suspicious_domains\":[\"Periorbital margin\",\"Mandibular texture\"], \"model_consensus\":\"Global feature correlation analysis verified via forensic protocol.\"}"
        )
        try:
            messages = [{"role": "user", "content": prompt}]
            response = self.client.chat_completion(messages, max_tokens=150)
            generated = response.choices[0].message.content.strip() if response and response.choices else ''
            parsed = parse_llm_structured_output(generated)
            if not parsed or not parsed.get('explanation'):
                print("Llama produced non-actionable response, falling back.")
                return {
                    'explanation': build_fallback_explanation(prediction, confidence, model_used, image_reference, heatmap_reference),
                    'suspicious_domains': [],
                    'model_consensus': ''
                }
            return parsed
        except Exception as e:
            print(f"Llama error: {e}")
            return {
                'explanation': build_fallback_explanation(prediction, confidence, model_used, image_reference, heatmap_reference),
                'suspicious_domains': [],
                'model_consensus': ''
            }

class LLMAdapter:
    def __init__(self, provider_name="gemini"):
        self.provider_name = provider_name.lower()
        if self.provider_name == "gemini":
            self.provider = GeminiProvider()
        elif self.provider_name == "llama":
            self.provider = LlamaProvider()
        else:
            raise ValueError(f"Unknown provider: {provider_name}")

    def get_explanation(self, prediction, confidence, model_used, image_reference=None, heatmap_reference=None, pipeline_context=None, suggested_llm_stance="ambiguity"):
        return self.provider.generate_explanation(prediction, confidence, model_used, image_reference, heatmap_reference, pipeline_context, suggested_llm_stance)

# ==========================================
# CONFIGURATION
# 1-Line switch: Change "gemini" to "llama" to switch standard LLM provider.
# ==========================================
ACTIVE_PROVIDER = "llama"

# Singleton instance for easy import across backend files
llm_service = LLMAdapter(ACTIVE_PROVIDER)
