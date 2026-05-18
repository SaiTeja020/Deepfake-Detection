"""
LLM Explanation Adapter — v2 (Complete Rewrite)
=================================================
Provides structured forensic explanations for deepfake detection results.

Architecture:
    EvidencePacket → ProviderRouter → [Gemini | Mistral | HF | Heuristic]
                                              ↓
                                     JSON Schema Validation
                                              ↓
                                    StructuredExplanation

Providers:
    Tier 1 (Default) — Gemini 2.0 Flash (multimodal, Google AI)
    Tier 2 (Fallback) — Mistral Pixtral-12B (vision-language, Mistral AI)
    Tier 3 (Backup)   — HF Serverless (Phi-3.5-Vision / LLaVA-v1.6)
    Tier 4 (Disaster) — Heuristic fallback (no API calls)

Features:
    - Structured prompt templates
    - JSON schema validation of LLM output
    - SHA-256 explanation caching
    - Tiered provider routing based on case complexity
"""

from __future__ import annotations

import base64
import hashlib
import io
import json
import logging
import os
import re
import time
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Output schema — what the LLM must return
# ---------------------------------------------------------------------------

EXPLANATION_SCHEMA_KEYS = {
    "required": ["summary", "primary_findings", "regions_examined"],
    "optional": ["secondary_signals", "confidence_explanation", "model_consensus"],
}


def validate_explanation(data: Any) -> Optional[Dict[str, Any]]:
    """
    Validate that data matches the expected explanation schema.
    Returns the validated dict, or None if invalid.
    """
    if not isinstance(data, dict):
        return None

    summary = data.get("summary", "")
    primary = data.get("primary_findings", [])
    regions = data.get("regions_examined", [])

    # Summary must be a string
    if not isinstance(summary, str):
        return None
    if len(summary.strip()) < 5: # Loosen length constraint
        return None

    # Ensure findings are lists
    if not isinstance(primary, list):
        data["primary_findings"] = [str(primary)] if primary else ["Manipulation detected"]
    if not isinstance(regions, list):
        data["regions_examined"] = []

    # Ensure optional fields have defaults
    if not isinstance(data.get("secondary_signals"), list):
        data["secondary_signals"] = []
    if not isinstance(data.get("confidence_explanation"), str):
        data["confidence_explanation"] = ""
    if not isinstance(data.get("model_consensus"), str):
        data["model_consensus"] = ""

    return data


def parse_llm_output(raw: Any) -> Optional[Dict[str, Any]]:
    """Parse raw LLM text output into a validated dict."""
    if raw is None:
        return None
    if isinstance(raw, dict):
        return validate_explanation(raw)

    text = str(raw).strip()
    try:
        # Try finding anything that looks like JSON (brackets)
        json_match = re.search(r'(\{.*\}|\[.*\])', text, re.DOTALL)
        if json_match:
            text = json_match.group(0)
        
        parsed = json.loads(text)
        if isinstance(parsed, list) and len(parsed) > 0:
            parsed = parsed[0] # Handle list-wrapped responses
            
        if isinstance(parsed, dict):
            return validate_explanation(parsed)
    except Exception:
        pass

    return None


# ---------------------------------------------------------------------------
# SHA-256 Explanation Cache
# ---------------------------------------------------------------------------

class ExplanationCache:
    """In-memory LRU-style cache for explanation results, keyed by SHA-256."""

    def __init__(self, max_size: int = 100):
        self._cache: Dict[str, Tuple[float, Dict]] = {}  # hash → (timestamp, result)
        self._max_size = max_size

    @staticmethod
    def compute_key(image_bytes: bytes, evidence_json: str) -> str:
        """SHA-256 hash of image bytes + evidence JSON string."""
        h = hashlib.sha256()
        h.update(image_bytes)
        h.update(evidence_json.encode("utf-8"))
        return h.hexdigest()

    def get(self, key: str) -> Optional[Dict[str, Any]]:
        entry = self._cache.get(key)
        if entry is None:
            return None
        ts, result = entry
        # Expire after 1 hour
        if time.time() - ts > 3600:
            del self._cache[key]
            return None
        return result

    def put(self, key: str, result: Dict[str, Any]):
        # Evict oldest if at capacity
        if len(self._cache) >= self._max_size:
            oldest_key = min(self._cache, key=lambda k: self._cache[k][0])
            del self._cache[oldest_key]
        self._cache[key] = (time.time(), result)


# Global cache instance
_explanation_cache = ExplanationCache()


# ---------------------------------------------------------------------------
# Prompt Templates
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """You are a technical forensic artifact analyzer. Your task is to interpret data from a deepfake detector.
 
RULES:
1. Analyze ONLY the provided technical evidence and visual artifacts (heatmaps).
2. Do not attempt to identify or comment on the personal identity of individuals.
3. Focus on technical anomalies: texture inconsistencies, geometric asymmetries, and attention concentration.
4. Use the provided semantic labels to describe findings.
5. Acknowledge any conflicting signals or data ambiguity.
6. Return ONLY valid JSON matching the schema below.
 
OUTPUT SCHEMA:
{
    "summary": "Forensic technical assessment (2-3 sentences)",
    "primary_findings": ["Finding 1", "Finding 2"],
    "secondary_signals": ["Signal 1"],
    "confidence_explanation": "Technical basis for the confidence score",
    "regions_examined": ["left_eye", "jawline", "mouth"],
    "model_consensus": "Technical summary of model agreement"
}"""


def build_user_prompt(evidence_text: str, has_conflicts: bool, face_count: int) -> str:
    """Build a dynamic user prompt adapted to the evidence complexity."""
    prompt = f"Analyze the following forensic evidence and provide your assessment.\n\n{evidence_text}"

    if has_conflicts:
        prompt += "\n\nIMPORTANT: The evidence contains conflicts between different forensic signals. You MUST explicitly address these conflicts in your summary and confidence_explanation."

    if face_count > 1:
        prompt += f"\n\nNOTE: {face_count} faces were detected. Address each face's findings in your assessment."

    return prompt


# ---------------------------------------------------------------------------
# Provider Implementations
# ---------------------------------------------------------------------------

class LLMProvider:
    """Base class for LLM providers."""

    name: str = "base"

    def generate(
        self,
        system_prompt: str,
        user_prompt: str,
        image=None,
        heatmap=None,
    ) -> Optional[Dict[str, Any]]:
        raise NotImplementedError


class QwenVLProvider(LLMProvider):
    """
    Qwen/Qwen2.5-VL-7B-Instruct via HuggingFace Inference API.
    Vision-language model — can process images.
    """

    name = "qwen_vl"

    def __init__(self):
        self.client = None
        try:
            import importlib
            hf_module = importlib.import_module('huggingface_hub')
            InferenceClient = getattr(hf_module, 'InferenceClient')
            hf_token = os.getenv("HF_TOKEN")
            if not hf_token:
                logger.warning("HF_TOKEN not set for QwenVLProvider")
            self.client = InferenceClient(api_key=hf_token)
            self.model_id = "Qwen/Qwen2.5-VL-7B-Instruct"
            logger.info("QwenVLProvider initialized")
        except Exception as e:
            logger.error("QwenVL init error: %s", e)

    def generate(self, system_prompt, user_prompt, image=None, heatmap=None):
        if self.client is None:
            return None

        try:
            # Build message content
            content = []

            # Add image if available (Qwen VL supports images via base64)
            if image is not None:
                try:
                    from PIL import Image
                    if isinstance(image, Image.Image):
                        buf = io.BytesIO()
                        image.save(buf, format="JPEG", quality=75)
                        b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
                        content.append({
                            "type": "image_url",
                            "image_url": {"url": f"data:image/jpeg;base64,{b64}"}
                        })
                except Exception as ie:
                    logger.warning("Could not encode image for Qwen VL: %s", ie)

            # Add heatmap if available
            if heatmap is not None:
                try:
                    from PIL import Image
                    if isinstance(heatmap, Image.Image):
                        buf = io.BytesIO()
                        heatmap.save(buf, format="JPEG", quality=75)
                        b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
                        content.append({
                            "type": "image_url",
                            "image_url": {"url": f"data:image/jpeg;base64,{b64}"}
                        })
                except Exception as ie:
                    logger.warning("Could not encode heatmap for Qwen VL: %s", ie)

            content.append({"type": "text", "text": user_prompt})

            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": content},
            ]

            response = self.client.chat_completion(
                model=self.model_id,
                messages=messages,
                max_tokens=500,
                stream=False,
            )

            raw_text = ""
            if response and response.choices:
                raw_text = response.choices[0].message.content.strip()

            logger.info("QwenVL raw response length: %d", len(raw_text))
            return parse_llm_output(raw_text)

        except Exception as e:
            logger.error("QwenVL generation error: %s", e)
            return None


class GeminiProvider(LLMProvider):
    """Google Gemini 1.5 Flash — full multimodal with native image support."""

    name = "gemini"

    def __init__(self):
        self.model = None
        try:
            import google.generativeai as genai
            api_key = os.getenv("GEMINI_API_KEY")
            if not api_key:
                logger.warning("GEMINI_API_KEY not set")
            else:
                import google.generativeai as genai
                genai.configure(api_key=api_key)
                # Using the latest stable 2.0 Flash model
                self.model = genai.GenerativeModel('gemini-2.0-flash') 
                print(f"DEBUG: GeminiProvider initialized (Key: {api_key[:5]}...{api_key[-4:]})")
        except Exception as e:
            print(f"DEBUG: Gemini init error: {e}")

    def generate(self, system_prompt, user_prompt, image=None, heatmap=None):
        if self.model is None:
            print("DEBUG: Gemini skipped (No model instance)")
            return None

        try:
            print(f"DEBUG: Sending request to Gemini (multimodal={image is not None})...")
            combined_prompt = f"{system_prompt}\n\n{user_prompt}"
            contents = [combined_prompt]
            if image is not None: contents.append(image)
            if heatmap is not None: contents.append(heatmap)

            try:
                response = self.model.generate_content(contents)
                if not response or not hasattr(response, 'text'):
                    raise ValueError("Empty or blocked response")
            except Exception as e:
                if image is not None:
                    print(f"DEBUG: Gemini multimodal failed ({e}). Retrying with TEXT ONLY...")
                    # Fallback to text-only if multimodal fails (common for safety filters)
                    response = self.model.generate_content([combined_prompt])
                    if not response or not hasattr(response, 'text'):
                        return None
                else:
                    raise e
                
            raw_text = response.text.strip()
            print(f"DEBUG: Gemini response received ({len(raw_text)} chars)")
            
            parsed = parse_llm_output(raw_text)
            if parsed and "summary" in parsed:
                parsed["summary"] = f"{parsed['summary']} (via Gemini)"
            return parsed

        except Exception as e:
            print(f"DEBUG: Gemini generation error: {e}")
            import traceback
            traceback.print_exc()
            return None


class MistralProvider(LLMProvider):
    """Mistral Pixtral via Mistral AI API — using requests to avoid package dependency."""

    name = "mistral"

    def __init__(self):
        self.api_key = os.getenv("MISTRAL_API_KEY")
        self.model = "pixtral-12b-2409"
        if not self.api_key:
            print("DEBUG: Mistral skipped (MISTRAL_API_KEY not set)")
        else:
            print(f"DEBUG: MistralProvider initialized (Model: {self.model})")

    def generate(self, system_prompt, user_prompt, image=None, heatmap=None):
        if not self.api_key:
            return None

        import requests
        try:
            print("DEBUG: Sending request to Mistral (Pixtral)...")
            
            # Build messages
            content = [{"type": "text", "text": user_prompt}]
            
            # Add image if available (Pixtral supports base64)
            if image is not None:
                buf = io.BytesIO()
                image.save(buf, format="JPEG")
                b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
                content.append({
                    "type": "image_url",
                    "image_url": f"data:image/jpeg;base64,{b64}"
                })

            url = "https://api.mistral.ai/v1/chat/completions"
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.api_key}"
            }
            payload = {
                "model": self.model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": content}
                ],
                "response_format": {"type": "json_object"}
            }

            response = requests.post(url, headers=headers, json=payload, timeout=30)
            print(f"DEBUG: Mistral HTTP Status: {response.status_code}")
            response.raise_for_status()
            data = response.json()
            
            raw_text = data["choices"][0]["message"]["content"].strip()
            print(f"DEBUG: Mistral response received ({len(raw_text)} chars)")
            
            parsed = parse_llm_output(raw_text)
            if parsed and "summary" in parsed:
                parsed["summary"] = f"{parsed['summary']} (via Mistral Pixtral)"
            return parsed

        except Exception as e:
            print(f"DEBUG: Mistral generation error: {e}")
            return None


class HuggingFaceProvider(LLMProvider):
    """
    HF Serverless Inference for Phi-3.5-Vision or LLaVA-v1.6.
    Free, slow, but a solid zero-budget backup.
    """

    name = "hf_serverless"

    def __init__(self, model_id: str = "meta-llama/Llama-3.2-11B-Vision-Instruct"):
        self.client = None
        self.model_id = model_id
        try:
            from huggingface_hub import InferenceClient
            hf_token = os.getenv("HF_TOKEN")
            if not hf_token:
                print("DEBUG: HF_TOKEN not set")
            self.client = InferenceClient(api_key=hf_token)
            print(f"DEBUG: HuggingFaceProvider initialized for {model_id}")
        except Exception as e:
            print(f"DEBUG: HF init error: {e}")

    def generate(self, system_prompt, user_prompt, image=None, heatmap=None):
        if self.client is None:
            return None

        try:
            # We use the text-based bridge since serverless vision can be flaky with multi-image
            # The user_prompt already contains the Spatial Evidence Report
            combined = f"{system_prompt}\n\n{user_prompt}"
            
            response = self.client.text_generation(
                combined,
                model=self.model_id,
                max_new_tokens=500,
            )
            
            return parse_llm_output(response)
        except Exception as e:
            logger.error("HF Serverless (%s) error: %s", self.model_id, e)
            return None


# ---------------------------------------------------------------------------
# Heuristic Fallback — uses ForensicInterpreter output, NOT raw metrics
# ---------------------------------------------------------------------------

class HeuristicFallback:
    """
    Generates a structured explanation without any LLM API call.
    Uses the forensic interpreter's semantic labels so even the fallback
    produces region-aware, specific explanations.
    """

    name = "heuristic"

    @staticmethod
    def generate_from_evidence(evidence: Dict[str, Any]) -> Dict[str, Any]:
        """Build a structured explanation from evidence packet alone."""
        verdict = evidence.get("overall_verdict", "Unknown")
        confidence = evidence.get("overall_confidence", 0)
        faces = evidence.get("faces", [])
        face_count = evidence.get("face_count", 0)
        model_type = evidence.get("model_type", "ViT")

        # Collect all findings across faces
        all_primary = []
        all_secondary = []
        all_regions = set()
        all_conflicts = []

        for face in faces:
            all_primary.extend(face.get("primary_findings", []))
            all_secondary.extend(face.get("secondary_findings", []))
            all_regions.update(face.get("regions_of_interest", []))
            all_conflicts.extend(face.get("conflicts", []))

        # Build summary based on verdict
        if verdict in ("Fake", "Deepfake", "Suspicious"):
            if all_primary:
                summary = (
                    f"Analysis of {face_count} face(s) detected signs of synthetic manipulation. "
                    f"Key indicators include {all_primary[0].lower()}. "
                    f"The {model_type} architecture identified these anomalies with {confidence}% confidence."
                )
            else:
                summary = (
                    f"Analysis of {face_count} face(s) detected elevated manipulation probability. "
                    f"The {model_type} architecture flagged potential synthetic artifacts with {confidence}% confidence."
                )
        elif verdict == "Uncertain":
            summary = (
                f"Analysis of {face_count} face(s) produced inconclusive results. "
                f"Conflicting forensic signals prevented a definitive authenticity assessment. "
                f"Manual review is recommended."
            )
        else:  # Real
            summary = (
                f"Analysis of {face_count} face(s) found consistent biological patterns. "
                f"The {model_type} architecture confirmed facial structure authenticity with {confidence}% confidence."
            )

        # Enhance with biometric signals if available
        biometric_notes = []
        for face in faces:
            if face.get("geometric_status") == "anomalous":
                biometric_notes.append(f"Face {face['face_id']} showed structural anomalies.")
            if face.get("conflicts"):
                biometric_notes.append("Conflicting forensic signals were detected.")
        
        if biometric_notes:
            summary += " " + " ".join(biometric_notes)

        # Build confidence explanation
        if all_conflicts:
            conf_expl = (
                f"Certainty is reduced due to {len(all_conflicts)} conflicting signal(s) "
                f"between different forensic measurements."
            )
        elif confidence > 85:
            conf_expl = "Strong agreement across texture analysis, geometric validation, and attention mapping."
        elif confidence > 60:
            conf_expl = "Moderate agreement across forensic signals with some ambiguity in secondary metrics."
        else:
            conf_expl = "Low confidence due to weak or conflicting signals across forensic channels."

        # Deduplicate
        primary = list(dict.fromkeys(all_primary))[:5]
        secondary = list(dict.fromkeys(all_secondary))[:3]

        if not primary:
            if verdict in ("Fake", "Deepfake", "Suspicious"):
                primary = ["Texture analysis indicates synthetic generation artifacts"]
            elif verdict == "Real":
                primary = ["Consistent biological patterns across facial geometry"]
            else:
                primary = ["Insufficient forensic data for definitive assessment"]

        return {
            "summary": f"{summary} (Local Heuristic Fallback)",
            "primary_findings": primary,
            "secondary_signals": secondary,
            "confidence_explanation": conf_expl,
            "regions_examined": list(all_regions) or ["full_face"],
            "model_consensus": (
                f"Multi-face analysis across {face_count} face(s) via "
                f"geometry-augmented {model_type} forensic protocol."
            ),
        }


# ---------------------------------------------------------------------------
# Provider Router — intelligent tiered routing
# ---------------------------------------------------------------------------

class ProviderRouter:
    """
    Routes explanation requests to the best available provider based on
    case complexity. Implements cascading fallback.

    Tier 1: Qwen VL (fast, vision-language)
    Tier 2: Gemini (multimodal, complex cases)
    Tier 3: Grok (text backup)
    Tier 4: Heuristic (no API)
    """

    def __init__(self):
        self.gemini = GeminiProvider()
        self.mistral = MistralProvider()
        self.hf_phi = HuggingFaceProvider("microsoft/Phi-3.5-vision-instruct")
        self.hf_llava = HuggingFaceProvider("llava-hf/llava-v1.6-mistral-7b-hf")
        self.qwen = QwenVLProvider()
        self.cache = _explanation_cache
        
        print("DEBUG: ProviderRouter initializing...")
        print(f"DEBUG: - Gemini instance: {'OK' if self.gemini.model else 'MISSING'}")
        print(f"DEBUG: - Mistral instance: {'OK' if self.mistral.api_key else 'MISSING'}")
        print(f"DEBUG: - Qwen instance: {'OK' if self.qwen.client else 'MISSING'}")
        
        active_providers = [p for p in [self.gemini, self.mistral, self.hf_phi, self.hf_llava, self.qwen]
                          if getattr(p, 'client', None) or getattr(p, 'model', None) or getattr(p, 'api_key', None)]
        print(f"DEBUG: ProviderRouter active providers: {[p.name for p in active_providers]}")

    def _assess_complexity(self, evidence: Dict[str, Any]) -> str:
        """
        Determine case complexity from evidence.
        Returns: "simple", "moderate", or "complex"
        """
        face_count = evidence.get("face_count", 0)
        confidence = evidence.get("overall_confidence", 50)
        agreement = evidence.get("model_agreement", "high")

        # Collect all conflicts
        has_conflicts = any(
            len(f.get("conflicts", [])) > 0
            for f in evidence.get("faces", [])
        )

        if face_count > 2 or has_conflicts or agreement == "low":
            return "complex"
        elif face_count > 1 or confidence < 70 or agreement == "moderate":
            return "moderate"
        else:
            return "simple"

    def _get_provider_order(self, complexity: str) -> List[LLMProvider]:
        """
        Determine provider cascade based on zero-budget priorities:
        Gemini (Free) -> Mistral (Free) -> HF Phi (Free) -> HF LLaVA (Free)
        """
        # Primary is always Gemini Flash (highest free quota/quality)
        order = [self.gemini, self.mistral, self.hf_phi, self.hf_llava, self.qwen]
        
        if complexity == "complex":
            # For complex cases, we might prefer Mistral Pixtral over Phi
            return [self.gemini, self.mistral, self.hf_llava, self.hf_phi, self.qwen]
        else:
            return order

    def get_explanation(
        self,
        evidence_packet: Dict[str, Any],
        image=None,
        heatmap=None,
        image_bytes: Optional[bytes] = None,
    ) -> Dict[str, Any]:
        """
        Get a structured explanation for the detection results.

        Args:
            evidence_packet: Output from EvidenceBuilder.build()
            image: PIL Image of the original face (for multimodal providers)
            heatmap: PIL Image of the attention heatmap (for multimodal providers)
            image_bytes: Raw image bytes for cache key computation

        Returns:
            Validated structured explanation dict.
        """
        from evidence_builder import EvidenceBuilder

        # Check cache first (DISABLED FOR DEBUGGING)
        # if image_bytes is not None:
        #     evidence_json = json.dumps(evidence_packet, sort_keys=True, default=str)
        #     cache_key = self.cache.compute_key(image_bytes, evidence_json)
        #     cached = self.cache.get(cache_key)
        #     if cached is not None:
        #         print("DEBUG: Cache hit for explanation (BYPASSED)")
        #         # return cached
        # else:
        #     cache_key = None
        cache_key = None

        # Build prompts
        evidence_text = EvidenceBuilder.to_prompt_text(evidence_packet)
        has_conflicts = any(
            len(f.get("conflicts", [])) > 0
            for f in evidence_packet.get("faces", [])
        )
        face_count = evidence_packet.get("face_count", 0)
        user_prompt = build_user_prompt(evidence_text, has_conflicts, face_count)

        # Determine complexity and provider order
        complexity = self._assess_complexity(evidence_packet)
        providers = self._get_provider_order(complexity)
        logger.info("Case complexity: %s, trying %d providers",
                     complexity, len(providers))

        # Try each provider in order
        for provider in providers:
            provider_available = (
                getattr(provider, 'client', None) is not None or
                getattr(provider, 'model', None) is not None
            )
            if not provider_available:
                continue

            print(f"DEBUG: Trying provider: {provider.name}")
            result = provider.generate(
                system_prompt=SYSTEM_PROMPT,
                user_prompt=user_prompt,
                image=image,
                heatmap=heatmap,
            )

            if result is not None:
                print(f"DEBUG: Provider {provider.name} succeeded")
                # Cache the result
                if cache_key is not None:
                    self.cache.put(cache_key, result)
                return result

            print(f"DEBUG: Provider {provider.name} failed")

        # All providers failed — use heuristic
        logger.warning("All LLM providers failed. Using heuristic fallback.")
        fallback = HeuristicFallback.generate_from_evidence(evidence_packet)

        if cache_key is not None:
            self.cache.put(cache_key, fallback)

        return fallback


# ---------------------------------------------------------------------------
# Legacy compatibility adapter
# ---------------------------------------------------------------------------

def structured_to_legacy(structured: Dict[str, Any]) -> Dict[str, Any]:
    """
    Convert new structured explanation format to legacy format
    for backward compatibility with existing frontend fields.
    """
    # Build flat explanation from summary
    explanation = structured.get("summary", "")

    # Build suspicious_domains from primary_findings + regions
    suspicious_domains = structured.get("primary_findings", [])[:4]

    # Model consensus
    model_consensus = structured.get("model_consensus", "")

    return {
        "explanation": explanation,
        "suspicious_domains": suspicious_domains,
        "model_consensus": model_consensus,
    }


# ---------------------------------------------------------------------------
# Singleton for easy import
# ---------------------------------------------------------------------------

provider_router = ProviderRouter()
