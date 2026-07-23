"""Coach Chat API tests (Alberto/Adriana AI chat, per-coach persistence, cleanup).

LIMIT: at most 2 LLM POST /api/coach/chat calls across the whole test run.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://roujaune-train.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module", autouse=True)
def _cleanup_both_coaches(api_client):
    """Ensure both threads are empty before we start and cleaned after."""
    for c in ("Alberto", "Adriana"):
        api_client.delete(f"{API}/coach/chat/history", params={"coach_name": c}, timeout=15)
    yield
    for c in ("Alberto", "Adriana"):
        api_client.delete(f"{API}/coach/chat/history", params={"coach_name": c}, timeout=15)


# Cached response so history & shape tests reuse the single LLM call.
_ALBERTO_REPLY = {"data": None}


class TestCoachChatAlberto:
    def test_chat_alberto_returns_persona_reply(self, api_client):
        """LLM CALL #1 — Alberto balanced style."""
        payload = {
            "coach_name": "Alberto",
            "coach_gender": "male",
            "coaching_style": "balanced",
            "message": "How is my training going?",
        }
        r = api_client.post(f"{API}/coach/chat", json=payload, timeout=60)
        assert r.status_code == 200, f"status={r.status_code} body={r.text[:400]}"
        data = r.json()
        _ALBERTO_REPLY["data"] = data

        # shape
        assert "reply" in data and isinstance(data["reply"], str)
        assert "user_message" in data and "coach_message" in data
        reply = data["reply"].strip()
        assert len(reply) > 0, "reply must be non-empty"

        # plain text — no markdown or JSON leaks
        for token in ("**", "* ", "```", "###", "- ", "\n- "):
            assert token not in reply, f"reply contains disallowed markdown token {token!r}: {reply!r}"

        # user_message / coach_message structure
        um = data["user_message"]
        cm = data["coach_message"]
        assert um["role"] == "user" and um["text"] == payload["message"]
        assert cm["role"] == "coach" and cm["text"] == reply
        assert um.get("id") and cm.get("id") and um.get("at") and cm.get("at")

    def test_history_alberto_persisted(self, api_client):
        """Sent message + reply should be in the persisted thread."""
        assert _ALBERTO_REPLY["data"], "prior chat did not run"
        r = api_client.get(f"{API}/coach/chat/history", params={"coach_name": "Alberto"}, timeout=15)
        assert r.status_code == 200
        msgs = r.json().get("messages", [])
        assert len(msgs) >= 2, f"expected persisted pair, got {len(msgs)}"
        # last two should be user then coach with matching text
        u, c = msgs[-2], msgs[-1]
        assert u["role"] == "user"
        assert u["text"] == "How is my training going?"
        assert c["role"] == "coach"
        assert c["text"] == _ALBERTO_REPLY["data"]["reply"]

    def test_history_adriana_isolated(self, api_client):
        """Adriana's thread must be independent (empty since we haven't chatted)."""
        r = api_client.get(f"{API}/coach/chat/history", params={"coach_name": "Adriana"}, timeout=15)
        assert r.status_code == 200
        assert r.json().get("messages", []) == []

    def test_delete_alberto_history(self, api_client):
        r = api_client.delete(f"{API}/coach/chat/history", params={"coach_name": "Alberto"}, timeout=15)
        assert r.status_code == 200
        assert r.json().get("ok") is True

        # verify empty
        r2 = api_client.get(f"{API}/coach/chat/history", params={"coach_name": "Alberto"}, timeout=15)
        assert r2.status_code == 200
        assert r2.json().get("messages", []) == []


class TestCoachChatStyle:
    def test_chat_essential_style_shape(self, api_client):
        """LLM CALL #2 — Adriana essential style, verify shape only (not length)."""
        payload = {
            "coach_name": "Adriana",
            "coach_gender": "female",
            "coaching_style": "essential",
            "message": "Give me one cue for tomorrow's climb.",
        }
        r = api_client.post(f"{API}/coach/chat", json=payload, timeout=60)
        assert r.status_code == 200, f"status={r.status_code} body={r.text[:400]}"
        data = r.json()
        assert isinstance(data.get("reply"), str) and data["reply"].strip()
        assert data["coach_message"]["role"] == "coach"
        assert data["user_message"]["role"] == "user"


class TestCoachChatValidation:
    def test_empty_message_rejected(self, api_client):
        """Empty message must be a client error, NOT hit the LLM."""
        r = api_client.post(
            f"{API}/coach/chat",
            json={"coach_name": "Alberto", "coach_gender": "male", "coaching_style": "balanced", "message": "   "},
            timeout=15,
        )
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text[:200]}"
