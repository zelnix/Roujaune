"""Drop-in replacement for `emergentintegrations.llm.chat` that routes every
coach/LLM call to Google Gemini 3 Flash using the user's own GEMINI_API_KEY.

It mimics the tiny slice of the emergentintegrations API the app uses:
    chat = LlmChat(api_key=..., session_id=..., system_message=SYS)
    chat = chat.with_model(provider, model)   # provider/model ignored -> Gemini
    reply: str = await chat.send_message(UserMessage(text=PROMPT))
"""
import os
import logging

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
        resp = await client.aio.models.generate_content(
            model=MODEL,
            contents=text,
            config=cfg,
        )
        return (resp.text or "").strip()
