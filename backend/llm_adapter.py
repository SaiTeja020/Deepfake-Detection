"""
LLM Explanation Adapter — v2 (Complete Rewrite)
=================================================
Provides structured forensic explanations for deepfake detection results.

Architecture:
    EvidencePacket → ProviderRouter → [QwenVL | Gemini | Grok | Heuristic]
                                              ↓
                                     JSON Schema Validation
                                              ↓
                                    StructuredExplanation

Providers:
    Tier 1 (Default) — Qwen/Qwen2.5-VL-7B-Instruct (vision-language, HF Inference)
    Tier 2 (Complex) — Gemini 1.5 Flash (multimodal, Google AI)
    Tier 3 (Backup)  — Grok (xAI, OpenAI-compatible)
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

    # Summary must be a non-empty string
    if not isinstance(summary, str) or len(summary.strip()) < 20:
        return None

    # Primary findings must be a non-empty list of strings
    if not isinstance(primary, list) or len(primary) == 0:
        return None
    if not all(isinstance(f, str) for f in primary):
        return None

    # Regions must be a list
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
    # Extract JSON from possible markdown wrapping
    json_match = re.search(r'\{.*\}', text, re.DOTALL)
    if json_match:
        text = json_match.group(0)
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return validate_explanation(parsed)
    except json.JSONDecodeError:
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

SYSTEM_PROMPT = """You are a forensic deepfake analyst. You analyze ONLY the provided evidence.

RULES:
1. Do not speculate beyond provided evidence
2. Do not mention raw numerical values — use the semantic labels provided
3. Reference specific facial regions when explaining findings
4. Explain WHY each finding matters for authenticity assessment
5. If conflicts exist in the evidence, explicitly acknowledge the uncertainty
6. For multi-face images, address each face separately
7. Return ONLY valid JSON matching the schema below — no extra text

OUTPUT SCHEMA:
{
    "summary": "2-3 sentence high-level forensic assessment",
    "primary_findings": ["Most significant observation 1", "Most significant observation 2"],
    "secondary_signals": ["Supporting observation 1"],
    "confidence_explanation": "Why the system is certain/uncertain about this verdict",
    "regions_examined": ["left_eye", "jawline", "mouth"],
    "model_consensus": "1 sentence on overall model agreement and methodology"
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
                genai.configure(api_key=api_key)
                self.model = genai.GenerativeModel('gemini-1.5-flash-latest')
                logger.info("GeminiProvider initialized")
        except Exception as e:
            logger.error("Gemini init error: %s", e)

    def generate(self, system_prompt, user_prompt, image=None, heatmap=None):
        if self.model is None:
            return None

        try:
            combined_prompt = f"{system_prompt}\n\n{user_prompt}"
            contents = [combined_prompt]

            # Gemini natively accepts PIL images
            if image is not None:
                contents.append(image)
            if heatmap is not None:
                contents.append(heatmap)

            response = self.model.generate_content(contents)
            raw_text = response.text.strip() if hasattr(response, 'text') else ''

            logger.info("Gemini raw response length: %d", len(raw_text))
            return parse_llm_output(raw_text)

        except Exception as e:
            logger.error("Gemini generation error: %s", e)
            return None


class GrokProvider(LLMProvider):
    """xAI Grok via OpenAI-compatible API."""

    name = "grok"

    def __init__(self):
        self.client = None
        try:
            from openai import OpenAI
            api_key = os.getenv("XAI_API_KEY")
            if not api_key:
                logger.warning("XAI_API_KEY not set for GrokProvider")
            else:
                self.client = OpenAI(
                    api_key=api_key,
                    base_url="https://api.x.ai/v1",
                )
                logger.info("GrokProvider initialized")
        except ImportError:
            logger.warning("openai package not installed — GrokProvider unavailable")
        except Exception as e:
            logger.error("Grok init error: %s", e)

    def generate(self, system_prompt, user_prompt, image=None, heatmap=None):
        if self.client is None:
            return None

        try:
            # Grok is text-only via the standard chat completions endpoint
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ]

            response = self.client.chat.completions.create(
                model="grok-3-mini",
                messages=messages,
                max_tokens=500,
            )

            raw_text = ""
            if response and response.choices:
                raw_text = response.choices[0].message.content.strip()

            logger.info("Grok raw response length: %d", len(raw_text))
            return parse_llm_output(raw_text)

        except Exception as e:
            logger.error("Grok generation error: %s", e)
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
            "summary": summary,
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
        self.qwen = QwenVLProvider()
        self.gemini = GeminiProvider()
        self.grok = GrokProvider()
        self.cache = _explanation_cache
        logger.info("ProviderRouter initialized with %d active providers",
                     sum(1 for p in [self.qwen, self.gemini, self.grok]
                         if getattr(p, 'client', None) or getattr(p, 'model', None)))

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
        """Determine provider cascade based on complexity."""
        if complexity == "complex":
            # Complex cases benefit from Gemini's multimodal inspection
            return [self.gemini, self.qwen, self.grok]
        elif complexity == "moderate":
            # Moderate: try Qwen VL first (it's also multimodal), fall back to Gemini
            return [self.qwen, self.gemini, self.grok]
        else:
            # Simple: Qwen VL is fastest
            return [self.qwen, self.gemini, self.grok]

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

        # Check cache first
        if image_bytes is not None:
            evidence_json = json.dumps(evidence_packet, sort_keys=True, default=str)
            cache_key = self.cache.compute_key(image_bytes, evidence_json)
            cached = self.cache.get(cache_key)
            if cached is not None:
                logger.info("Cache hit for explanation")
                return cached
        else:
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

            logger.info("Trying provider: %s", provider.name)
            result = provider.generate(
                system_prompt=SYSTEM_PROMPT,
                user_prompt=user_prompt,
                image=image,
                heatmap=heatmap,
            )

            if result is not None:
                logger.info("Provider %s succeeded", provider.name)
                # Cache the result
                if cache_key is not None:
                    self.cache.put(cache_key, result)
                return result

            logger.warning("Provider %s failed or returned invalid output", provider.name)

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
