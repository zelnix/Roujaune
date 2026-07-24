# Plans Admin API (`plans_admin.py`)

Portable training-plan administration. Drop `backend/plans_admin.py` into the
admin project, mount the router, and call `init()` + `seed_plans()` once on
startup. It stores plan **definitions** in the MongoDB `plans` collection.

## Wiring (copy-paste)

```python
import plans_admin

# 1. Mount the router (final paths are prefixed with your app prefix, e.g. /api)
api_router.include_router(plans_admin.plans_router)   # -> /api/plans

# 2. On startup: inject the db + an optional cache-refresh callback, then seed.
plans_admin.init(db, on_change=my_on_change)          # on_change(plan_id) is optional
await plans_admin.seed_plans({                         # NON-destructive (only if missing)
    "couch-to-road": {...structured definition...},    # has weeks: [{number, days: [...]}]
    "build-and-climb": {...roadmap definition...},
})
```

`on_change(plan_id)` is awaited after every mutation so a consuming app can
refresh any in-memory cache (this app reloads its couch-to-road cache there).

Read helper for app code: `await plans_admin.get_plan_def(plan_id) -> dict | None`.

## Data model (`plans` collection)

Every doc is a free-form definition with a few conventional fields:

| field            | type      | notes                                              |
|------------------|-----------|----------------------------------------------------|
| `id`             | string    | unique key (e.g. `couch-to-road`)                  |
| `title`          | string    |                                                    |
| `description`    | string    |                                                    |
| `type`           | string    | `structured` (has `weeks`) or `roadmap`            |
| `duration_weeks` | int       | structured plans                                   |
| `weeks`          | array     | structured: `[{ number, objective, days: [...] }]` |
| `weeks[].days[]` | object    | `{ kind, title, duration, zone, tss, workout_id }` |
| `edit_history`   | array     | auto-appended audit trail (capped 30)              |
| `created_at`/`updated_at` | ISO str |                                            |

`kind` is one of `cycling` / `strength` / `mobility` / `rest` / `fb50` / `wellness`.

## Endpoints (all under `/api/plans`)

| Method & path                                  | Body                                   | Description |
|------------------------------------------------|----------------------------------------|-------------|
| `GET /plans`                                   | –                                      | List summaries `[{id,title,description,type,duration_weeks,week_count,updated_at}]` |
| `GET /plans/{id}`                              | –                                      | Full definition (404 if missing) |
| `POST /plans`                                  | `{ "id": str, "definition": {...} }`   | Create (409 if id exists) |
| `PUT /plans/{id}`                              | `{...full definition...}`              | Replace whole definition (keeps id + created_at) |
| `PATCH /plans/{id}`                            | `{ any top-level fields }`             | Shallow-merge top-level fields |
| `DELETE /plans/{id}`                           | –                                      | Delete (404 if missing) |
| `PUT /plans/{id}/weeks/{number}`               | `{...week object...}`                  | Replace/insert a week (number forced) |
| `PATCH /plans/{id}/weeks/{number}/days/{i}`    | `{ "patch": { ... } }`                 | Merge fields on one day |
| `POST /plans/{id}/adapt`                       | see below                              | Batch structured edits + audit entry |

### `POST /plans/{id}/adapt`

```jsonc
{
  "source": "coach",           // or "user" / "rider-request" / "adaptive"
  "reason": "Rider felt strong",
  "ops": [
    { "target": "day",        "week": 3, "day_index": 1, "patch": { "duration": "25 min" } },
    { "target": "week_field", "week": 3, "key": "objective", "value": "Build steady endurance." },
    { "target": "field",      "key": "description", "value": "Updated plan blurb" }
  ]
}
```
Returns `{ plan_id, applied: [...], entry: {...edit_history entry...} }`.

## Rider assignment (in this app, `server.py`)

| Method & path        | Body                                        | Description |
|----------------------|---------------------------------------------|-------------|
| `GET /rider/plan`    | –                                           | `{ active_plan_id, plans: [...summaries] }` |
| `POST /rider/plan`   | `{ "plan_id": str, "reset_progress"?: bool }` | Switch the rider's plan (404 if plan missing) |

## Companion editing (in this app)

- **Chat-driven:** `POST /api/coach/chat` detects a plan-edit request, has the LLM emit
  allowlisted ops (day `duration/zone/tss/title/rpe`, week `objective/title`, max 8,
  range-validated), applies them via `/adapt` (`source: rider-request`), and returns
  `plan_updated` + `plan_change`.
- **Adaptive:** after a low-compliance ride, any *structured* plan's next week is eased
  ~10% once (`source: adaptive`).

## Notes
- Seed is **non-destructive** — live edits survive restarts. To force a pristine
  re-seed: clear the `plans` collection, then restart.
- No auth is applied (single-user app). Add access control in the admin project.
