"""Drop-in replacement for `emergentintegrations.llm.chat` that routes every
coach/LLM call to Google Gemini 3 Flash using the user's own GEMINI_API_KEY.

It mimics the tiny slice of the emergentintegrations API the app uses:
    chat = LlmChat(api_key=..., session_id=..., system_message=SYS)
    chat = chat.with_model(provider, model)   # provider/model ignored -> Gemini
    reply: str = await chat.send_message(UserMessage(text=PROMPT))
"""
import os
import logging
import asyncio

MODEL = "gemini-3-flash-preview"
_client = None


def _client_or_none():
    global _client
    if _client is not None:
        return _client
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        return None
    try:
        from google import genai
        _client = genai.Client(api_key=key)
        return _client
    except Exception:
        logging.exception("gemini_shim: failed to init client")
        return None


class UserMessage:
    def __init__(self, text: str = "", **_kw):
        self.text = text


class LlmChat:
    def __init__(self, api_key=None, session_id=None, system_message=None, **_kw):
        self.system = system_message or ""

    def with_model(self, *_args, **_kw):
        return self  # always Gemini 3 Flash

    async def send_message(self, message) -> str:
        client = _client_or_none()
        if client is None:
            raise RuntimeError("GEMINI_API_KEY not configured")
        text = getattr(message, "text", str(message))
        from google.genai import types
        want_json = "json" in (self.system + " " + text).lower()
        cfg = types.GenerateContentConfig(
            system_instruction=self.system or None,
            temperature=0.4,
            max_output_tokens=8192,
            response_mime_type="application/json" if want_json else "text/plain",
            thinking_config=types.ThinkingConfig(thinking_budget=0),
        )
        # Transient hiccups (rate limits, brief network blips, upstream 5xx)
        # are common with any live LLM call — retry a couple of times with a
        # short backoff before giving up, instead of surfacing a 502 to the
        # rider on the very first blip (this call sits on the hot path for
        # live in-ride coaching cues, so a single retry meaningfully cuts
        # down on avoidable failures without adding noticeable latency).
        attempts = 3
        last_exc: Exception | None = None
        for attempt in range(attempts):
            try:
                resp = await asyncio.wait_for(
                    client.aio.models.generate_content(model=MODEL, contents=text, config=cfg),
                    timeout=12,
                )
                return (resp.text or "").strip()
            except Exception as exc:  # noqa: BLE001
                last_exc = exc
                if attempt < attempts - 1:
                    logging.getLogger("server").warning(
                        "gemini_shim: attempt %d/%d failed (%s), retrying", attempt + 1, attempts, type(exc).__name__,
                    )
                    await asyncio.sleep(0.4 * (2 ** attempt))
        raise last_exc
