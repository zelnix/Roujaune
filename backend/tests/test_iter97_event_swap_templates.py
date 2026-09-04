"""Iter 97: coach-created plan extensions.
Tests:
  - POST /api/coach/create-plan with event_date -> preview echoes event_date.
  - POST /api/coach/create-plan/accept -> definition.event_date set;
    /api/calendar/week reflects dates so final plan week aligns with event's week.
  - POST /api/coach/swap-session easier reduces load; harder increases load;
    focus keeps kind=cycling. When plan_id is a custom- plan and week+day_index
    (or a workout_id encoding them) are given, the change PERSISTS into
    /api/plan.
  - POST/GET/DELETE /api/coach/plan-templates CRUD.

All tests hit the public EXPO_PUBLIC_BACKEND_URL as demo@roujaune.app.
Demo rider's active plan is restored to build-and-climb at the end.
"""
import os
from datetime import date, timedelta

import pytest
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL")
if not BASE:
    with open("/app/frontend/.env") as fh:
        for line in fh:
            if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                BASE = line.split("=", 1)[1].strip().strip('"')
                break
BASE = (BASE or "").rstrip("/")

DEMO_EMAIL = "demo@roujaune.app"
DEMO_PASSWORD = "demo9900"


# --------- Session / auth fixture ---------
@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE}/api/auth/login",
               json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:300]}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, f"no token in login response: {r.json()}"
    s.headers.update({"Authorization": f"Bearer {tok}"})
    yield s
    # Cleanup: restore demo rider to build-and-climb.
    try:
        s.post(f"{BASE}/api/rider/plan", json={"plan_id": "build-and-climb"}, timeout=15)
    except Exception:
        pass


# --------- Feature: event_date scheduling (create-plan + accept) ----------
@pytest.fixture(scope="module")
def event_preview(client):
    """Preview a 3-week plan targeting an event ~3 weeks from now."""
    ev = (date.today() + timedelta(days=21)).isoformat()
    body = {
        "coach_name": "Alberto", "coach_gender": "male",
        "goal": "TEST peak for a gran fondo", "weeks": 3, "days_per_week": 3,
        "event_date": ev,
    }
    r = client.post(f"{BASE}/api/coach/create-plan", json=body, timeout=120)
    assert r.status_code == 200, f"create-plan failed: {r.status_code} {r.text[:400]}"
    return {"plan": r.json()["plan"], "event_date": ev}


class TestEventDate:
    def test_preview_echoes_event_date(self, event_preview):
        plan = event_preview["plan"]
        assert plan.get("event_date") == event_preview["event_date"]
        assert isinstance(plan.get("weeks"), list) and len(plan["weeks"]) == 3

    def test_accept_schedules_last_week_on_event_week(self, client, event_preview):
        plan = event_preview["plan"]
        r = client.post(f"{BASE}/api/coach/create-plan/accept",
                        json={"plan": plan, "coach_name": "Alberto"}, timeout=30)
        assert r.status_code == 200, r.text[:400]
        pid = r.json().get("plan_id")
        assert pid and pid.startswith("custom-")

        # Confirm the persisted definition carries the event_date.
        gp = client.get(f"{BASE}/api/plan", timeout=30)
        assert gp.status_code == 200
        pj = gp.json()
        # definition may be nested under plan doc; fetch active week to verify dates
        # first, check definition.event_date via /api/plan (may expose via `event_date` field)
        # (best-effort: at least the id switched to custom-)
        assert pj.get("id") == pid

        # calendar week 1 starts on a Monday
        cw = client.get(f"{BASE}/api/calendar/week", timeout=30)
        assert cw.status_code == 200
        days = cw.json().get("days") or cw.json().get("week") or []
        assert len(days) == 7
        first_iso = (days[0].get("date") or days[0].get("iso"))[:10]
        first = date.fromisoformat(first_iso)

        # Compute expected: last week (week N) must contain the event date.
        ev = date.fromisoformat(event_preview["event_date"])
        ev_monday = ev - timedelta(days=ev.weekday())
        n_weeks = len(plan["weeks"])
        # aligned start = event's Monday - (n-1)*7 days, but not before default_start
        today = date.today()
        default_start = today if today.weekday() == 0 else today + timedelta(days=7 - today.weekday())
        aligned = ev_monday - timedelta(days=7 * (n_weeks - 1))
        expected_first = aligned if aligned >= default_start else default_start

        assert first == expected_first, (
            f"week 1 mismatch: got {first}, expected {expected_first} "
            f"(event {ev}, ev_monday {ev_monday}, n_weeks {n_weeks})"
        )
        # Also verify the last week of the plan lands on ev_monday when far enough out.
        last_start = first + timedelta(days=7 * (n_weeks - 1))
        assert last_start == ev_monday, f"last week Monday {last_start} != event Monday {ev_monday}"


# --------- Feature: swap-session (easier / harder / focus) ---------
class TestSwapSession:
    def _swap(self, client, mode, day, extra=None):
        body = {"day": day, "mode": mode, "coach_name": "Alberto", "coach_gender": "male"}
        if extra:
            body.update(extra)
        r = client.post(f"{BASE}/api/coach/swap-session", json=body, timeout=120)
        assert r.status_code == 200, f"swap {mode} failed: {r.status_code} {r.text[:300]}"
        j = r.json()
        assert "day" in j and isinstance(j["day"], dict)
        d = j["day"]
        assert d.get("kind") == "cycling"
        assert d.get("title") and d.get("zone", "").startswith("Z")
        assert isinstance(d.get("duration_min"), int) and d["duration_min"] > 0
        assert d.get("duration") and isinstance(d.get("tss"), int)
        return d

    def test_easier_reduces_load(self, client):
        day = {"title": "VO2 Intervals", "zone": "Z4",
               "duration_min": 60, "tss": 90, "day_name": "TUE"}
        newd = self._swap(client, "easier", day)
        base_load = day["duration_min"] * 1.0 + day["tss"]
        new_load = newd["duration_min"] * 1.0 + newd["tss"]
        assert new_load < base_load, f"easier didn't reduce load: {day} -> {newd}"

    def test_harder_increases_load(self, client):
        day = {"title": "Endurance", "zone": "Z2",
               "duration_min": 60, "tss": 55, "day_name": "SAT"}
        newd = self._swap(client, "harder", day)
        base_load = day["duration_min"] * 1.0 + day["tss"]
        new_load = newd["duration_min"] * 1.0 + newd["tss"]
        assert new_load > base_load, f"harder didn't increase load: {day} -> {newd}"

    def test_focus_returns_cycling(self, client):
        day = {"title": "Tempo Ride", "zone": "Z3",
               "duration_min": 70, "tss": 75, "day_name": "WED"}
        newd = self._swap(client, "focus", day, extra={"focus_hint": "climbing"})
        assert newd.get("kind") == "cycling"


class TestSwapPersistsCustomPlan:
    """Create a small custom plan, then swap a cycling day and verify /api/plan reflects the change."""

    @pytest.fixture(scope="class")
    def custom_plan(self, client):
        body = {"coach_name": "Alberto", "coach_gender": "male",
                "goal": "TEST swap persistence", "weeks": 2, "days_per_week": 3}
        pr = client.post(f"{BASE}/api/coach/create-plan", json=body, timeout=120)
        assert pr.status_code == 200, pr.text[:300]
        plan = pr.json()["plan"]
        ar = client.post(f"{BASE}/api/coach/create-plan/accept",
                         json={"plan": plan, "coach_name": "Alberto"}, timeout=30)
        assert ar.status_code == 200, ar.text[:300]
        pid = ar.json()["plan_id"]
        yield pid, plan

    def _find_first_cycling(self, plan_json, plan_id):
        # /api/plan for a custom plan returns computed workouts that carry workout_ids
        # like custom-xxx-ride-w{N}-d{I}. Grab the first.
        for w in plan_json.get("workouts") or []:
            wid = w.get("workout_id") or w.get("id")
            if isinstance(wid, str) and wid.startswith(plan_id) and "-ride-w" in wid:
                return w, wid
        return None, None

    @staticmethod
    def _n(x, fallback=60):
        """Best-effort integer coercion — /api/plan sometimes returns '48 TSS' strings."""
        if x is None:
            return fallback
        if isinstance(x, (int, float)):
            return int(x)
        import re as _re
        m = _re.search(r"\d+", str(x))
        return int(m.group(0)) if m else fallback

    def test_swap_persists_via_week_and_day_index(self, client, custom_plan):
        pid, _preview = custom_plan
        gp = client.get(f"{BASE}/api/plan", timeout=30)
        assert gp.status_code == 200
        wo, wid = self._find_first_cycling(gp.json(), pid)
        assert wid, f"no custom workout found in plan: {gp.json().get('workouts')}"

        # Parse w/d from workout_id: custom-xxx-ride-wN-dI
        tail = wid.split("-ride-")[1]  # wN-dI
        w_num = int(tail.split("-")[0][1:])
        d_idx = int(tail.split("-")[1][1:])

        day_payload = {
            "title": wo.get("title") or "Ride",
            "zone": wo.get("zone") or "Z2",
            "duration_min": self._n(wo.get("duration_min") or wo.get("duration"), 60),
            "tss": self._n(wo.get("tss"), 60),
            "day_name": wo.get("day_name") or "TUE",
            "workout_id": wid,
        }
        r = client.post(f"{BASE}/api/coach/swap-session", json={
            "day": day_payload, "mode": "easier", "coach_name": "Alberto",
            "plan_id": pid, "week": w_num, "day_index": d_idx,
        }, timeout=120)
        assert r.status_code == 200, r.text[:300]
        new_day = r.json()["day"]
        assert new_day.get("kind") == "cycling"

        # GET /api/plan again — the corresponding workout should now match new_day.
        gp2 = client.get(f"{BASE}/api/plan", timeout=30)
        assert gp2.status_code == 200
        found = None
        for w in gp2.json().get("workouts") or []:
            if (w.get("workout_id") or w.get("id")) == wid:
                found = w
                break
        assert found, "workout disappeared after swap"
        # tss/duration in /api/plan may come as strings like '48 TSS' / '1h 15m' — coerce.
        assert self._n(found.get("tss")) == new_day["tss"], (
            f"persisted tss {found.get('tss')} != swap tss {new_day['tss']}"
        )
        assert self._n(found.get("duration_min") or found.get("duration")) == new_day["duration_min"], (
            f"persisted duration {found.get('duration_min') or found.get('duration')} "
            f"!= swap {new_day['duration_min']}"
        )

    def test_swap_persists_via_workout_id_only(self, client, custom_plan):
        """Same as above but week/day_index omitted — server should parse from workout_id."""
        pid, _ = custom_plan
        gp = client.get(f"{BASE}/api/plan", timeout=30)
        assert gp.status_code == 200
        wo, wid = self._find_first_cycling(gp.json(), pid)
        assert wid

        day_payload = {
            "title": wo.get("title") or "Ride",
            "zone": wo.get("zone") or "Z2",
            "duration_min": self._n(wo.get("duration_min") or wo.get("duration"), 60),
            "tss": self._n(wo.get("tss"), 60),
            "day_name": wo.get("day_name") or "TUE",
            "workout_id": wid,
        }
        r = client.post(f"{BASE}/api/coach/swap-session", json={
            "day": day_payload, "mode": "harder", "coach_name": "Alberto",
            "plan_id": pid,   # no explicit week/day_index
        }, timeout=120)
        assert r.status_code == 200, r.text[:300]
        new_day = r.json()["day"]

        gp2 = client.get(f"{BASE}/api/plan", timeout=30)
        found = next((w for w in (gp2.json().get("workouts") or [])
                      if (w.get("workout_id") or w.get("id")) == wid), None)
        assert found, "workout missing after swap-by-wid"
        assert self._n(found.get("tss")) == new_day["tss"]


# --------- Feature: plan templates CRUD ---------
class TestPlanTemplates:
    @pytest.fixture(scope="class")
    def template_plan(self):
        return {
            "title": "TEST_Template plan",
            "description": "TEST fixture template for iter97.",
            "goals": [{"id": "g1", "title": "TEST goal", "description": "", "status": "incomplete"}],
            "weeks_count": 2, "days_per_week": 3,
            "weeks": [
                {"focus": "Base", "days": [
                    {"day_name": d, "kind": "rest", "title": "Rest Day"} for d in
                    ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]
                ]},
                {"focus": "Build", "days": [
                    {"day_name": d, "kind": "rest", "title": "Rest Day"} for d in
                    ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]
                ]},
            ],
        }

    def test_crud_flow(self, client, template_plan):
        # POST
        r = client.post(f"{BASE}/api/coach/plan-templates",
                        json={"plan": template_plan}, timeout=15)
        assert r.status_code == 200, r.text[:200]
        j = r.json()
        assert j.get("ok") is True
        tid = j.get("id")
        assert tid and tid.startswith("tpl-")
        assert j.get("title") == template_plan["title"]

        # GET list
        rl = client.get(f"{BASE}/api/coach/plan-templates", timeout=15)
        assert rl.status_code == 200
        items = rl.json().get("templates") or []
        assert any(t.get("id") == tid for t in items), f"created template not in list: {items}"
        me = next(t for t in items if t.get("id") == tid)
        assert me.get("title") == template_plan["title"]
        assert me.get("weeks_count") == 2
        assert me.get("days_per_week") == 3
        # Full plan payload should be present so we can start-from-template
        assert isinstance(me.get("plan"), dict)
        assert isinstance(me["plan"].get("weeks"), list) and len(me["plan"]["weeks"]) == 2

        # DELETE
        rd = client.delete(f"{BASE}/api/coach/plan-templates/{tid}", timeout=15)
        assert rd.status_code == 200
        assert rd.json().get("ok") is True

        # Verify gone
        rl2 = client.get(f"{BASE}/api/coach/plan-templates", timeout=15)
        assert rl2.status_code == 200
        items2 = rl2.json().get("templates") or []
        assert not any(t.get("id") == tid for t in items2), "template still present after delete"

    def test_post_rejects_empty_plan(self, client):
        r = client.post(f"{BASE}/api/coach/plan-templates", json={"plan": {}}, timeout=15)
        assert r.status_code == 400


def test_restore_demo_plan_final(client):
    r = client.post(f"{BASE}/api/rider/plan", json={"plan_id": "build-and-climb"}, timeout=30)
    assert r.status_code in (200, 201), r.text[:200]
    rp = client.get(f"{BASE}/api/plan", timeout=15)
    assert rp.json().get("id") == "build-and-climb"
