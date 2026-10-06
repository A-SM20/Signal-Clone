# Signal Clone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a hosted, real-time Signal clone (Signal Desktop look on wide screens, Signal Android on phones) with a FastAPI + SQLite backend and a statically exported Next.js frontend on Render's free tier.

**Architecture:** Next.js static export served by a Render Static Site talks to one FastAPI web service over REST (all state changes) and one WebSocket per device (server push, typing, receipts). FastAPI layers are routers → services → repositories → SQLAlchemy async on SQLite; an in-memory `Hub` fans events out to device sockets. The DB is rebuilt and seeded on every boot; a GitHub Actions schedule keeps the free instance awake.

**Tech Stack:** Python 3.11.9, FastAPI 0.142, SQLAlchemy 2.1 (async, aiosqlite 0.22), Pydantic 2.13 + pydantic-settings 2.15, Pillow 12.3, phonenumbers 9.0, pytest 9.1 · Node 22, Next.js 16.3 (App Router, `output: 'export'`), React 19.3, TypeScript strict, Tailwind 4.3, TanStack Query 5, Zustand 5, lucide-react, qrcode.react 4, openapi-typescript 7, Vitest 5, Playwright 1.63.

**Spec:** `docs/superpowers/specs/2026-10-06-signal-clone-design.md` — read it alongside this plan; section references below are `§N`.

## Global Constraints

- Monorepo root contains `frontend/`, `backend/`, `render.yaml`, `.github/workflows/`, `README.md`, `docs/`.
- `.gitattributes`: `* text=auto eol=lf` (Render builds on Linux).
- Every commit message ends with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- No Signal source code, CSS, SVG icons, logo files, or copy taken from Signal repositories. Icons from `lucide-react`; logo mark is our own SVG.
- Backend commands run from `backend/` inside a venv (`uv venv .venv` then `uv pip install -r requirements-dev.txt`); frontend commands run from `frontend/`.
- Exact values (from spec): `MOCK_OTP=123456`; `EDIT_WINDOW = 24 h`; `DELETE_FOR_EVERYONE_WINDOW = 24 h`; attachment max **10 MB**; signed file URL TTL **1 h**; link code **8 chars**, TTL **5 min**; WS auth deadline **5 s** → close **4401**; revoked device → close **4403**; client ping **25 s**; server drops sockets silent **> 60 s**; typing `start` throttle **3 s**, idle `stop` **5 s**, client auto-clear **8 s**; outbox retries **2 s, 4 s, 8 s** then `failed`; WS reconnect backoff **1 s → 30 s cap** with jitter; disappearing options **0, 30, 300, 3600, 28800, 86400, 604800, 2419200** seconds; max **3** pins, durations `24h|7d|30d|forever`; polls **2–10** options; voice max **5 min**, **64** waveform bars; grouping window **3 min**; breakpoints mobile **< 768 px**, desktop **≥ 1024 px**; chat list width **300–440 px**; demo phones `+1 555 010 0001…0008`; error envelope `{"error":{"code","message"}}`; non-member → **404**.
- Plan decisions (not in spec, fixed here): `MAX_BODY_LENGTH = 4096` chars; username regex `^[a-z][a-z0-9_]{2,31}\.\d{2}$`; avatar uploads resized to 512×512; signed-URL `exp = (unix_now // 3600 + 2) * 3600` (valid 1–2 h, stable within an hour so browsers cache).
- All datetimes are timezone-aware UTC; services read time only from `ctx.clock.now()`.

## Shared Contracts

These names are used across tasks. Backend Pydantic schemas live in `backend/app/schemas/`; the frontend imports generated types (`npm run gen:api`) re-exported from `frontend/src/lib/api/types.ts`.

**REST DTOs** (fields marked `?` are nullable):
- `UserOut {id, phone, username?, display_name, about?, avatar_url?, avatar_color, online, last_seen_at?}` — `online=false`, `last_seen_at=null` when the subject has `share_last_seen=false`.
- `SettingsOut {theme, chat_color, read_receipts, typing_indicators, share_last_seen, notifications_enabled, notification_preview, default_disappearing_seconds}`; `MeOut = UserOut + {settings: SettingsOut}`; `AuthOut {token, user: MeOut, is_new_user}`.
- `MemberOut {user: UserOut, role, request_state, joined_at, left_at?, last_delivered_message_id?, last_read_message_id?}` — cursors are `null` when hidden from the viewer (§3.6.1, §3.6.2).
- `MyStateOut {role, request_state, muted_until?, is_archived, is_pinned, last_read_message_id, left_at?}`.
- `ConversationOut {id, kind, title, description?, avatar_url?, avatar_color, is_note_to_self, disappearing_seconds, pin_permission, members: MemberOut[], me: MyStateOut, unread_count, last_message?: MessageOut, last_activity_at}`. Direct `title` = other member's display name; Note to Self `title` = `"Note to Self"`. Later tasks add `pins: PinOut[]` (T29) and `safety_number_changed: bool` (T27).
- `MessageOut {id, conversation_id, sender_id?, client_id?, kind, body?, reply_to?: ReplyPreviewOut, system_event?: object, created_at, edited_at?, deleted_at?, expires_at?, attachments: AttachmentOut[], reactions: ReactionOut[], poll?: PollOut}`; `ReplyPreviewOut {id, sender_id?, kind, body?, deleted}`; `MessagePage {items: MessageOut[] (newest first), has_more}`.
- `AttachmentOut {id, kind, mime_type, size_bytes, original_name, url, width?, height?, duration_ms?, waveform?}` — `url` is a path (`/api/files/...`); frontend prefixes `API_URL`.
- `ReactionOut {user_id, emoji}`; `PollOut {question, allow_multiple, ended_at?, options: [{id, text, vote_count, voter_ids}]}`; `PinOut {message_id, pinned_by, pinned_at, expires_at?}`.
- System events (`messages.system_event`): `group_created{actor_id}`, `member_added{actor_id, user_ids}`, `member_removed{actor_id, user_ids}`, `member_left{user_id}`, `role_changed{actor_id, user_id, role}`, `title_changed{actor_id, title}`, `timer_changed{actor_id, seconds}`.

**WebSocket:** envelope `{type, data, ts}`; event types exactly as spec §5, plus `ready {user_id, device_id}` sent after successful auth and `pong`. Backend builders: one function per type in `backend/app/realtime/events.py` (e.g. `message_created(m: MessageOut) -> dict`). Frontend union `ServerEvent` in `frontend/src/lib/realtime/events.ts` mirrors them.

**Backend core interfaces:**
- `Ctx` dataclass (`backend/app/context.py`): `settings: Settings`, `clock: Clock`, `hub: Hub`; dependency `get_ctx(request) -> Ctx`.
- Service functions take `(session: AsyncSession, ctx: Ctx, ...)`, commit, **then** publish events via `ctx.hub` (never publish uncommitted state).
- Authorization deps (`backend/app/api/deps.py`): `current_device`, `current_user`, `member_of(conversation_id, *, active: bool)` → `ConversationMember` (404 `not_found` if no row; 403 `not_active_member` if `active` and `left_at` set), `admin_of(conversation_id)` → member with role admin (403 `not_admin`).

**Frontend core interfaces:** query keys `qk.me ['me']`, `qk.conversations ['conversations']`, `qk.messages(id) ['messages', id]`, `qk.contacts ['contacts']`, `qk.search(q)`, `qk.folders`, `qk.devices`, `qk.safety(userId)`; stores `useAuth`, `useUi`, `useSocket`, `useOutbox`, `useTyping` (defined in T14/T18).

## Review Focus

Failure modes the spec implies but does not test; each line's test is added to the owning task.

1. **Stale token after Render re-seed** — every restart wipes the DB, so a stored token becomes invalid; the app must return to onboarding cleanly (no loop, no broken shell) on REST 401 or WS close 4401/4403. → T14 Vitest `signs out on 401` / `does not reconnect after 4401`.
2. **Phone typed in any common format** — `555-010-0001`, `(555) 010-0001`, `+1 555 010 0001`, `15550100001` must reach the same account. → T6 `test_phone_variants_reach_same_account`.
3. **Own message echoed over WebSocket** (same tab or another tab of the same user) must render exactly once. → T18 Vitest `applyEvent dedupes echo by client_id and id`.
4. **Empty / whitespace-only / overlong bodies** — rejected with 422 unless the message carries attachments or a poll. → T10 `test_body_validation`, T22 `test_attachment_only_message_allowed`.
5. **Long-open tab with expired signed URLs** — images, avatars, voice notes must recover by refetching fresh URLs, not stay broken. → T22 Vitest `refreshes queries once when a signed media URL fails`.

---

# Milestone M0 — Skeleton, deployed (≈1.5 h)

### Task 1: Backend foundation

**Files:**
- Create: `.gitignore`, `.gitattributes`, `backend/requirements.txt`, `backend/requirements-dev.txt`, `backend/pytest.ini`, `backend/app/{__init__,main,config,db,clock,errors}.py`, `backend/app/api/{__init__,health}.py`, `backend/app/models/{__init__,base}.py`, `backend/tests/{__init__,conftest,helpers}.py`, `backend/tests/test_health.py`

**Interfaces:**
- Produces: `Settings` (pydantic-settings, env-driven): `database_path="./data/signal.db"`, `upload_dir="./data/uploads"`, `cors_origins: list[str]=["http://localhost:3000"]`, `signing_secret="dev-secret-change-me"`, `mock_otp="123456"`, `seed_on_empty=True`, `ws_idle_timeout_seconds=60`, `ws_auth_timeout_seconds=5`.
- Produces: `create_app(settings: Settings | None = None, clock: Clock | None = None) -> FastAPI`; `app.state.settings`, `app.state.clock`, `app.state.engine`, `app.state.session_factory` (`async_sessionmaker`, `expire_on_commit=False`). Module-level `app = create_app()` in `main.py`. Lifespan: make dirs, `create_all`, (seed hook added in T13, sweepers in T24/T29).
- Produces: `Clock` protocol `now() -> datetime`; `SystemClock`; `FrozenClock(start: datetime)` with `advance(**timedelta_kwargs) -> None`.
- Produces: `AppError(status_code: int, code: str, message: str)`; exception handlers mapping `AppError`, `HTTPException` (404 → code `not_found`), `RequestValidationError` (422 → `validation_error`) to the error envelope.
- Produces: `get_session()` dependency yielding `AsyncSession`; `Base(DeclarativeBase)` with a constraint naming convention; engine `connect` listener setting `journal_mode=WAL`, `foreign_keys=ON`, `busy_timeout=5000`.
- Produces (tests): fixtures `clock` (`FrozenClock(2026-10-06T12:00:00Z)`), `app` (tmp_path DB + uploads, `seed_on_empty=False`), `client` (`with TestClient(app) as c`); helper `db_call(client, fn)` → `client.portal.call` running `async fn(session)` inside a session and committing.

- [ ] **Step 1: Pin dependencies.** `requirements.txt`: `fastapi==0.142.2`, `uvicorn[standard]==0.54.0`, `sqlalchemy==2.1.3`, `aiosqlite==0.22.1`, `pydantic-settings==2.15.0`, `python-multipart==0.0.32`, `pillow==12.3.0`, `phonenumbers==9.0.40`. `requirements-dev.txt`: `-r requirements.txt`, `pytest==9.1.1`, `httpx==0.28.1`. `pytest.ini`: `testpaths = tests`. Create venv and install.
- [ ] **Step 2: Write the failing tests** in `tests/test_health.py`:

```python
def test_health_ok(client):
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json() == {"status": "ok"}

def test_unknown_route_uses_error_envelope(client):
    r = client.get("/api/nope")
    assert r.status_code == 404 and r.json()["error"]["code"] == "not_found"

def test_sqlite_pragmas(client):
    async def q(s):
        fk = (await s.execute(text("PRAGMA foreign_keys"))).scalar()
        jm = (await s.execute(text("PRAGMA journal_mode"))).scalar()
        return fk, jm
    assert db_call(client, q) == (1, "wal")

def test_cors_allows_configured_origin(client):
    r = client.options("/api/health", headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "GET"})
    assert r.headers["access-control-allow-origin"] == "http://localhost:3000"
```

- [ ] **Step 3: Run** `python -m pytest tests/test_health.py -v` → FAIL (import errors).
- [ ] **Step 4: Implement** the files listed in Interfaces. `.gitignore` covers `.venv/`, `__pycache__/`, `backend/data/`, `node_modules/`, `.next/`, `out/`, `frontend/test-results/`, `frontend/openapi.json`, `docs/ui-reference/` (reference screenshots stay local; `docs/ui-reference.md` is committed).
- [ ] **Step 5: Run** `python -m pytest -v` → 4 passed. Also `uvicorn app.main:app --port 8000` then `curl localhost:8000/api/health` → `{"status":"ok"}`.
- [ ] **Step 6: Commit** `chore(backend): FastAPI foundation with health, errors, SQLite pragmas`.

### Task 2: Frontend foundation and API wake-up gate

**Files:**
- Create: `frontend/` via `npx create-next-app@16 frontend --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --yes`
- Create/Modify: `frontend/next.config.ts`, `frontend/vitest.config.ts`, `frontend/vitest.setup.ts`, `frontend/src/lib/config.ts`, `frontend/src/lib/health.ts`, `frontend/src/lib/health.test.ts`, `frontend/src/components/app/{ApiGate,SplashScreen,LogoMark}.tsx`, `frontend/src/app/{layout,providers,page}.tsx`

**Interfaces:**
- Produces: `API_URL` (from `NEXT_PUBLIC_API_URL`, default `http://localhost:8000`), `WS_URL` (`API_URL` with `http`→`ws`, plus `/api/ws`) in `lib/config.ts`.
- Produces: `waitForApi(opts?: {fetchFn?: typeof fetch; intervalMs?: number; onAttempt?: (n: number) => void; signal?: AbortSignal}): Promise<void>` — GET `${API_URL}/api/health`, resolves on the first 2xx, retries every `intervalMs` (default 2000) on non-2xx or network error until aborted (rejects with `AbortError`).
- Produces: `<ApiGate>{children}</ApiGate>` — shows `<SplashScreen attempts={n}/>` until `waitForApi` resolves. Splash: centred logo mark + "Connecting…"; from attempt 5 onwards: "Waking up the server — this can take up to a minute".
- Produces: `<Providers>` wrapping `QueryClientProvider` (defaults: `staleTime: 30_000`, `refetchOnWindowFocus: true`, `retry: 1`).

- [ ] **Step 1: Scaffold** with the command above; install `@tanstack/react-query zustand lucide-react qrcode.react`; dev: `vitest jsdom @testing-library/react @testing-library/jest-dom openapi-typescript @playwright/test serve`. `next.config.ts`: `output: "export"`, `trailingSlash: true`, `images: { unoptimized: true }`. Add scripts `"test": "vitest run"`, `"typecheck": "tsc --noEmit"`.
- [ ] **Step 2: Write the failing tests** `src/lib/health.test.ts` (fake timers, mocked `fetchFn`):

```ts
it("resolves after transient 502s", async () => { /* fetchFn → 502, 502, 200 */ expect(onAttempt).toHaveBeenCalledTimes(3) })
it("keeps retrying on network errors", async () => { /* fetchFn throws twice then 200 → resolves */ })
it("rejects with AbortError when aborted", async () => { /* abort after first failure */ })
```

- [ ] **Step 3: Run** `npx vitest run src/lib/health.test.ts` → FAIL.
- [ ] **Step 4: Implement** `health.ts`, `ApiGate`, `SplashScreen`, `LogoMark` (own speech-bubble SVG), `layout.tsx` (Inter via `next/font/google`, `<Providers>`), `page.tsx` rendering `<ApiGate>` around a temporary "Ready" text.
- [ ] **Step 5: Run** `npx vitest run` → PASS; `npm run build` → `out/index.html` exists; `npm run typecheck` clean.
- [ ] **Step 6: Commit** `chore(frontend): Next.js static export with API wake-up gate`.

### Task 3: Render Blueprint, CI, keep-alive, first deploy

**Files:**
- Create: `render.yaml`, `.github/workflows/ci.yml`, `.github/workflows/keep-render-alive.yml`

- [ ] **Step 1: Write `render.yaml`:**

```yaml
services:
  - type: web
    name: signal-api
    runtime: python
    plan: free
    rootDir: backend
    buildCommand: pip install -r requirements.txt
    startCommand: uvicorn app.main:app --host 0.0.0.0 --port $PORT
    healthCheckPath: /api/health
    envVars:
      - { key: PYTHON_VERSION, value: 3.11.9 }
      - { key: SIGNING_SECRET, generateValue: true }
      - { key: MOCK_OTP, value: "123456" }
      - { key: SEED_ON_EMPTY, value: "true" }
      - { key: CORS_ORIGINS, sync: false }
  - type: web
    name: signal-web
    runtime: static
    rootDir: frontend
    buildCommand: npm ci && npm run build
    staticPublishPath: ./out
    envVars:
      - { key: NEXT_PUBLIC_API_URL, sync: false }
```

- [ ] **Step 2: Write `ci.yml`** — on `push`/`pull_request`: job `backend` (setup-python 3.11.9, `pip install -r backend/requirements-dev.txt`, `cd backend && python -m pytest -q`); job `frontend` (setup-node 22, `npm ci`, `npm run typecheck`, `npx vitest run`, `NEXT_PUBLIC_API_URL=https://example.invalid npm run build`), both with `working-directory` set.
- [ ] **Step 3: Write `keep-render-alive.yml`** — `on: schedule: [{cron: "2-59/5 * * * *"}]` + `workflow_dispatch`; one job, `timeout-minutes: 5`, step: `curl -fsS --retry 3 --retry-delay 10 --retry-all-errors --max-time 120 "${{ vars.API_URL }}/api/health"`.
- [ ] **Step 4: Commit** `ci: Render blueprint, CI and keep-alive workflows`.
- [ ] **Step 5: [USER] Create a public GitHub repo** (e.g. `signal-clone`), then `git remote add origin <url>` and `git push -u origin main`. Verify: CI workflow green.
- [ ] **Step 6: [USER] Render → New → Blueprint → select the repo.** After the first deploy: set `CORS_ORIGINS` on `signal-api` to the `signal-web` URL (JSON list, e.g. `["https://signal-web-xxxx.onrender.com"]`), set `NEXT_PUBLIC_API_URL` on `signal-web` to the `signal-api` URL, redeploy both; add GitHub repo variable `API_URL` = the `signal-api` URL.
- [ ] **Step 7: Verify:** `curl -fsS <api-url>/api/health` → `{"status":"ok"}`; web URL shows the splash then "Ready"; run "keep-render-alive" via *Run workflow* → green.

---

# Milestone M1 — Backend core (≈3 h)

### Task 4: Core models

**Files:**
- Create: `backend/app/models/{user,device,social,conversation,message}.py`; Modify: `backend/app/models/__init__.py` (import all so `create_all` sees them)
- Test: `backend/tests/test_models.py`

**Interfaces:**
- Produces ORM classes exactly per spec §3.1–3.4 for: `User`, `UserSettings`, `Device`, `Contact`, `Block`, `Conversation`, `ConversationMember`, `Message` (all `messages` columns, including `reply_to_id`, `system_event` JSON, `edited_at`, `deleted_at`, `expires_at`). `conversations.last_message_id` FK uses `use_alter=True`. Every relationship declares `lazy="raise"` (forces explicit `selectinload`, avoiding async lazy-load errors).

- [ ] **Step 1: Write the failing tests:**

```python
def test_core_tables_created(client): # inspect via run_sync(inspect(...).get_table_names())
    assert {"users","user_settings","devices","contacts","blocks","conversations","conversation_members","messages"} <= names
def test_direct_key_unique(client):   # second Conversation(kind="direct", direct_key="1:2") → IntegrityError
def test_client_id_unique_per_sender(client):  # two Messages same (sender_id, client_id) → IntegrityError; different sender OK
def test_contact_cannot_reference_self(client):  # Contact(owner_id=1, contact_id=1) → IntegrityError
def test_member_cascade_on_conversation_delete(client):  # delete conversation → its members gone
```

- [ ] **Step 2: Run** `python -m pytest tests/test_models.py -v` → FAIL.
- [ ] **Step 3: Implement** the models.
- [ ] **Step 4: Run** → 5 passed.
- [ ] **Step 5: Commit** `feat(db): core schema for users, devices, contacts, conversations, messages`.

### Task 5: Realtime hub and service context

**Files:**
- Create: `backend/app/realtime/{__init__,hub,events}.py`, `backend/app/context.py`
- Test: `backend/tests/test_hub.py` (uses `@pytest.mark.anyio`; add `anyio_backend` fixture returning `"asyncio"` to conftest)

**Interfaces:**
- Produces `class Hub`:
  - `async register(user_id: int, device_id: int, ws) -> bool` (True if the user just came online)
  - `async unregister(user_id: int, device_id: int) -> bool` (True if the user just went offline)
  - `is_online(user_id: int) -> bool`
  - `async send_to_users(user_ids: Iterable[int], event: dict) -> None` — every device of every user; a socket whose send raises is unregistered
  - `async send_to_device(device_id: int, event: dict) -> None`; `async close_device(device_id: int, code: int) -> None`
- Produces `events.envelope(type_: str, data: dict) -> dict` adding ISO `ts`, and one builder per event type from spec §5 (`ready`, `pong`, `message_created`, `message_updated`, `message_removed`, `reaction_updated`, `poll_updated`, `pin_updated`, `receipt_updated`, `typing`, `presence`, `conversation_updated`, `conversation_removed`, `device_revoked`). Builders accept DTOs/primitives and call `.model_dump(mode="json")`.
- Produces `Ctx(settings, clock, hub)` and `get_ctx(request) -> Ctx`; `create_app` sets `app.state.hub = Hub()`.

- [ ] **Step 1: Write the failing tests** with a `FakeSocket` (records `send_json` payloads; optional `fail=True`):

```python
async def test_register_reports_first_device_online(): assert await hub.register(1, 10, a) is True; assert await hub.register(1, 11, b) is False
async def test_unregister_reports_last_device_offline(): ... second unregister returns True; hub.is_online(1) is False
async def test_send_to_users_reaches_every_device(): both sockets of user 1 receive; user 2's socket does not
async def test_failing_socket_is_dropped(): send to a fail=True socket → hub.is_online(user) becomes False
def test_envelope_shape(): e = envelope("typing", {...}); assert set(e) == {"type","data","ts"}
```

- [ ] **Step 2: Run** `python -m pytest tests/test_hub.py -v` → FAIL.
- [ ] **Step 3: Implement** `Hub` (dict `user_id → {device_id → ws}` guarded by an `asyncio.Lock`), `events.py`, `context.py`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(realtime): in-memory hub and event builders`.

### Task 6: Auth, device sessions, profile, settings

**Files:**
- Create: `backend/app/services/{__init__,phone,auth,users}.py`, `backend/app/schemas/{__init__,users,auth}.py`, `backend/app/api/{deps,auth,me}.py`
- Modify: `backend/app/main.py` (include routers)
- Test: `backend/tests/test_auth.py`, `backend/tests/test_me.py`; Modify `backend/tests/helpers.py`

**Interfaces:**
- Consumes: models (T4), `Ctx` (T5).
- Produces: `normalize_phone(raw: str) -> str` (phonenumbers, default region `"US"`, E.164; raises `AppError(400, "invalid_phone")`); `hash_token(token: str) -> str` (SHA-256 hex); `new_token() -> str` (`secrets.token_urlsafe(32)`).
- Produces: `async verify_otp(session, ctx, phone: str, code: str, device_name: str) -> tuple[str, User, bool]` — creates `User` (+ `UserSettings` defaults, random 32-byte base64 `identity_key`, `avatar_color` from a fixed 12-colour palette by `user_id % 12`) when new; always creates a `Device` (`is_primary` true for the user's first device); returns raw token once.
- Produces: `to_user_out(user: User, hub: Hub, settings: UserSettings) -> UserOut`, `to_me_out(...) -> MeOut` in `services/users.py`.
- Produces deps: `current_device` (Bearer header; 401 `unauthorized` if missing/unknown/revoked; touches `last_active_at` at most once per minute), `current_user`.
- Produces endpoints per spec §4: `POST /api/auth/request-otp`, `POST /api/auth/verify-otp`, `POST /api/auth/logout`, `GET/PATCH /api/me`, `GET/PATCH /api/me/settings`.
- Produces test helper `login(client, phone: str, name: str | None = None) -> Session` where `Session = (token, user_id, headers)`; completes profile with `name` when the user is new.

- [ ] **Step 1: Write the failing tests:**

```python
def test_new_user_flow(client):  # request-otp → is_new_user True; verify-otp → is_new_user True, token; second verify → False
def test_wrong_otp_rejected(client):  # code "000000" → 400 code "invalid_otp"
@pytest.mark.parametrize("raw", ["555-010-0001", "(555) 010-0001", "+1 555 010 0001", "15550100001"])
def test_phone_variants_reach_same_account(client, raw):  # login with raw → same user_id as "+15550100001"
def test_invalid_phone(client):  # "12" → 400 "invalid_phone"
def test_token_is_stored_hashed(client):  # no devices.token_hash equals the raw token; equals sha256(raw)
def test_logout_revokes(client):  # logout → GET /me → 401 "unauthorized"
def test_missing_token_401(client)
def test_patch_me_username(client):  # "alice.01" OK; "Al" → 422; duplicate → 409 "username_taken"
def test_settings_roundtrip(client):  # PATCH read_receipts False → GET shows False
```

- [ ] **Step 2: Run** `python -m pytest tests/test_auth.py tests/test_me.py -v` → FAIL.
- [ ] **Step 3: Implement** the services, schemas, deps and routers. OTP check compares `code == ctx.settings.mock_otp` with `hmac.compare_digest`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(auth): mocked OTP login, hashed device sessions, profile and settings`.

### Task 7: WebSocket endpoint, heartbeat, presence, device list

**Files:**
- Create: `backend/app/realtime/ws_router.py`, `backend/app/services/presence.py`, `backend/app/schemas/devices.py`, `backend/app/api/devices.py`
- Test: `backend/tests/test_ws.py`, `backend/tests/test_devices.py`; Modify `backend/tests/helpers.py`, `backend/tests/conftest.py`

**Interfaces:**
- Consumes: `Hub`, `hash_token`, models.
- Produces: `GET /api/ws`. Protocol: accept → wait up to `ws_auth_timeout_seconds` for `{"type":"auth","token"}` → unknown token close **4401**, revoked device close **4403** → `hub.register` → send `ready {user_id, device_id}` → loop: dispatch frames via `handle_frame(frame, conn)` (this task handles `ping`→`pong`; T11 adds `typing`/`receipt`); `receive` timeout `ws_idle_timeout_seconds` closes the socket → `hub.unregister`.
- Produces: `async related_user_ids(session, user_id: int) -> set[int]` (contacts-of-me ∪ my-contacts ∪ co-members of active conversations); on online/offline transitions broadcast `presence` to them (respect `share_last_seen`: if false, send `online=false, last_seen_at=null`); on going offline set `users.last_seen_at = clock.now()`.
- Produces: `DeviceOut {id, name, is_primary, is_current, created_at, last_active_at}`; `GET /api/devices` → my non-revoked devices; `DELETE /api/devices/{id}` (own devices only, else 404) → sets `revoked_at`, sends `device.revoked` to that device, then `hub.close_device(id, 4403)`; 204.
- Produces test helpers: `ws_session(client, token)` context manager (connects, sends auth, asserts `ready`, yields ws); `assert_no_event(ws)` (sends `ping`, asserts the next frame is `pong`); conftest fixture `client_fast_timeouts` (`ws_auth_timeout_seconds=0.2`, `ws_idle_timeout_seconds=0.3`).

- [ ] **Step 1: Write the failing tests:**

```python
def test_ws_auth_ready(client):  # valid token → first frame type "ready" with user_id
def test_ws_bad_token_closes_4401(client)  # expect WebSocketDisconnect with code 4401
def test_ws_revoked_device_closes_4403(client)
def test_ws_auth_timeout_4401(client_fast_timeouts)  # send nothing
def test_idle_socket_dropped(client_fast_timeouts)   # authenticate, stay silent → server closes; hub.is_online False
def test_ping_pong(client)
def test_presence_broadcast_to_contacts(client)  # Bob (contact of Alice) connected; Alice connects → Bob gets presence online=True
def test_last_seen_set_on_disconnect(client)
def test_share_last_seen_false_hides_presence(client)
# test_devices.py
def test_list_devices_marks_current(client)          # two logins → 2 devices, exactly one is_current
def test_unlink_revokes_and_closes_socket(client)    # other device's ws receives device.revoked then close 4403; its REST → 401
def test_cannot_unlink_others_device(client)         # 404
```

- [ ] **Step 2: Run** `python -m pytest tests/test_ws.py tests/test_devices.py -v` → FAIL.
- [ ] **Step 3: Implement.** (Contacts table rows for the presence test are inserted via `db_call`; the contacts API arrives in T8.)
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(realtime): authenticated WebSocket with heartbeat, presence and device management`.

### Task 8: Contacts, blocks, user lookup

**Files:**
- Create: `backend/app/services/contacts.py`, `backend/app/schemas/people.py`, `backend/app/api/people.py`
- Test: `backend/tests/test_people.py`

**Interfaces:**
- Produces endpoints per spec §4: `GET /api/users/lookup?q=` → `UserOut` (exact E.164 phone after `normalize_phone`, or exact username; else 404), `GET /api/contacts` → `UserOut[]` sorted by `display_name`, `POST /api/contacts {phone?|username?}` → `UserOut` (201), `DELETE /api/contacts/{user_id}` (204), `GET /api/blocks`, `POST /api/blocks/{user_id}`, `DELETE /api/blocks/{user_id}`.
- Produces: `async is_contact(session, owner_id: int, other_id: int) -> bool`, `async is_blocked(session, blocker_id: int, blocked_id: int) -> bool` (used by T10, T26).

- [ ] **Step 1: Write the failing tests:**

```python
def test_lookup_exact_only(client)   # "+15550100002" → Bob; username "bob.02" → Bob; "555" → 404
def test_add_contact_by_phone_and_username(client)
def test_add_duplicate_contact_409(client)   # code "already_contact"
def test_add_self_400(client)                # code "cannot_add_self"
def test_contacts_sorted_by_name(client)
def test_block_unblock_roundtrip(client)
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(api): contacts, blocks and exact user lookup`.

### Task 9: Conversations, membership and admin rules

**Files:**
- Create: `backend/app/services/conversations.py`, `backend/app/repositories/{__init__,conversations}.py`, `backend/app/schemas/conversations.py`, `backend/app/api/conversations.py`
- Modify: `backend/app/api/deps.py` (add `member_of`, `admin_of`)
- Test: `backend/tests/test_conversations.py`

**Interfaces:**
- Produces: `async get_or_create_direct(session, ctx, me: User, other_id: int) -> Conversation` (`direct_key=f"{min}:{max}"`; Note to Self when `other_id == me.id`, single member); `async create_group(session, ctx, me, title: str, member_ids: list[int], description: str | None) -> Conversation` (creator admin, `group_created` + `member_added` system messages); `async add_members`, `remove_member`, `leave`, `set_role`; `async conversation_out(session, ctx, conversation_id: int, viewer_id: int) -> ConversationOut`; `async list_conversations(session, ctx, viewer_id) -> list[ConversationOut]` (one query for unread counts; sort `is_pinned DESC, last_activity_at DESC`).
- Produces: `async post_system_message(session, conversation, event: dict) -> Message` (kind `system`, `sender_id=None`), reused by later tasks.
- Produces endpoints per spec §4 (Chats + Members rows) except `disappearing_seconds` (T24), `pin_permission` (T29), avatar (T12), request action (T26). Every mutation publishes `conversation.updated` to all active members; removal publishes `conversation.removed` to the removed user.
- Rules: removed/left members keep their row with `left_at`; they still see the conversation and history up to `left_at` but receive no events after; last admin leaving promotes the member with the earliest `joined_at`.

- [ ] **Step 1: Write the failing tests:**

```python
def test_direct_get_or_create_is_symmetric(client)  # Alice→Bob and Bob→Alice return the same id
def test_note_to_self(client)                       # other_id == me → is_note_to_self True, one member, title "Note to Self"
def test_group_create_creator_admin_and_system_messages(client)
def test_non_member_gets_404(client)                # GET /conversations/{id} as Carol → 404 "not_found"
def test_non_admin_cannot_add_403(client)           # code "not_admin"
def test_admin_add_remove_and_promote(client)
def test_removed_member_gets_no_events_and_cannot_send(client)  # removed user's ws: assert_no_event after a new message; POST message → 403 "not_active_member"
def test_last_admin_leaving_promotes_oldest_member(client)
def test_list_sorted_pinned_then_recent(client)     # PATCH /conversations/{id}/me {"is_pinned": true} moves it first
def test_mutation_publishes_conversation_updated(client)
```

(`test_removed_member_...` needs the send endpoint from T10; write it in T10's test file instead if T10 is not yet done — it must exist by the end of T10.)

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(api): direct and group conversations with admin controls`.

### Task 10: Messages — send, list, search

**Files:**
- Create: `backend/app/services/messages.py`, `backend/app/repositories/messages.py`, `backend/app/schemas/messages.py`, `backend/app/api/messages.py`, `backend/app/api/search.py`
- Test: `backend/tests/test_messages.py`, `backend/tests/test_search.py`

**Interfaces:**
- Produces: `SendMessageIn {client_id: UUID, kind: "text"|"media"|"voice"|"poll", body?: str, reply_to_id?: int, attachment_ids: list[int] = [], poll?: PollIn}` — body is stripped; validation: `kind="text"` requires non-empty body; body length ≤ `MAX_BODY_LENGTH`; `poll`/`attachment_ids` handled by T30/T22 (until then reject non-text kinds with 422).
- Produces: `async send_message(session, ctx, sender: User, conversation_id: int, data: SendMessageIn) -> tuple[MessageOut, bool]` (bool = created; replay of an existing `(sender_id, client_id)` returns the stored message and `False`); updates `conversations.last_message_id` and `last_activity_at`; publishes `message.created` to all active members (including the sender's own devices).
- Produces: `async message_out_many(session, ctx, messages: list[Message], viewer_id: int) -> list[MessageOut]` (batched loads: reply previews, later attachments/reactions/polls — later tasks extend this single function).
- Produces: `GET /api/conversations/{id}/messages?before=&limit=50` (`limit` 1–100) → `MessagePage` (left members capped at `created_at <= left_at`); `POST /api/conversations/{id}/messages` → 201 new / 200 replay; `GET /api/search?q=` → `{chats: ConversationOut[], contacts: UserOut[], messages: MessageOut[]}` (min query length 2, max 20 per group, case-insensitive `LIKE`, only my conversations).

- [ ] **Step 1: Write the failing tests:**

```python
def test_send_and_receive_realtime(client)     # Bob's ws gets message.created with body; Alice's own ws also gets it
def test_send_is_idempotent(client)            # same client_id twice → same id; 201 then 200; one row
def test_body_validation(client)               # "   " → 422; "x"*4097 → 422; "x"*4096 → 201
def test_reply_to_must_be_same_conversation(client)  # → 400 "invalid_reply"
def test_pagination_before_cursor(client)      # 120 messages: page1 50 newest, has_more; before=page1[-1].id → next 50; no overlap
def test_last_message_and_activity_updated(client)
def test_removed_member_gets_no_events_and_cannot_send(client)   # see T9 note
def test_search_groups_results(client)         # query matches a chat title, a contact name, and a message body
def test_search_excludes_other_peoples_conversations(client)
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(api): idempotent real-time messaging, history paging and search`.

### Task 11: Receipts, typing, message details

**Files:**
- Create: `backend/app/services/receipts.py`, `backend/app/services/status.py`, `backend/app/realtime/handlers.py`
- Modify: `backend/app/realtime/ws_router.py` (dispatch `typing`, `receipt`), `backend/app/api/messages.py` (details route)
- Test: `backend/tests/test_status.py`, `backend/tests/test_receipts.py`

**Interfaces:**
- Produces pure function `derive_status(message_id: int, sender_id: int, members: Sequence[MemberCursor]) -> Literal["sent","delivered","read"]` where `MemberCursor(user_id, delivered: int | None, read: int | None, active: bool)`; rule per spec §3.6.1 (only active non-sender members; `None` counts as 0; Note to Self → `read`).
- Produces: `async advance_cursor(session, ctx, user: User, conversation_id: int, kind: Literal["delivered","read"], up_to: int) -> None` — clamps `up_to` to the conversation's latest message id; forward-only (`read` also advances `delivered`); broadcasts `receipt.updated {conversation_id, user_id, delivered_up_to, read_up_to}` to the other active members, with `read_up_to=None` for recipients who have `read_receipts=false` and to everyone when the reader has `read_receipts=false`.
- Produces: `visible_cursors(member, viewer_settings, member_settings) -> tuple[int|None, int|None]` used by `MemberOut` construction (T9's `conversation_out` must call it).
- Produces: typing relay — `typing {conversation_id, user_id, state}` to other active members; dropped when the sender has `typing_indicators=false` (recipients with `typing_indicators=false` also receive none).
- Produces: `GET /api/messages/{id}/details` (sender only, else 403 `not_sender`) → `{recipients: [{user: UserOut, status}]}`.

- [ ] **Step 1: Write the failing tests:**

```python
# test_status.py (pure)
def test_direct_statuses()        # sent → delivered → read as Bob's cursors move
def test_group_needs_everyone()   # one member read, one only delivered → "delivered"
def test_inactive_members_ignored()
def test_note_to_self_is_read()
# test_receipts.py
def test_delivered_receipt_reaches_sender(client)   # Bob ws sends receipt delivered → Alice ws gets receipt.updated delivered_up_to=id
def test_cursor_never_moves_backwards(client)
def test_read_receipts_off_hides_read(client)       # Bob read_receipts=false → Alice gets read_up_to None; Bob still has unread_count 0
def test_reciprocity(client)                        # Alice read_receipts=false → Alice receives read_up_to None for Bob's reads
def test_typing_relayed_to_others_only(client)
def test_typing_disabled_not_relayed(client)
def test_message_details_per_recipient(client)
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(realtime): delivery/read receipt cursors, typing relay, message details`.

### Task 12: File storage, signed URLs, avatars

**Files:**
- Create: `backend/app/services/files.py`, `backend/app/api/files.py`
- Modify: `backend/app/api/me.py` (`POST /api/me/avatar`), `backend/app/api/conversations.py` (`POST /api/conversations/{id}/avatar`, admin)
- Test: `backend/tests/test_files.py`

**Interfaces:**
- Produces: `ALLOWED_TYPES: dict[str, str]` (mime → extension) — `image/jpeg .jpg`, `image/png .png`, `image/webp .webp`, `image/gif .gif`, `application/pdf .pdf`, `text/plain .txt`, `application/zip .zip`, the three OOXML mimes `.docx .xlsx .pptx`, `audio/webm .webm`, `audio/ogg .ogg`, `audio/mp4 .m4a`, `audio/x-m4a .m4a`.
- Produces: `async save_upload(ctx, upload: UploadFile, *, allowed: Collection[str] = ALLOWED_TYPES) -> StoredFile(storage_key, mime_type, size_bytes, original_name, width, height)` — streams to disk, 413 `too_large` beyond 10 MB, 400 `unsupported_type`; images verified and measured with Pillow; `storage_key = uuid4().hex + ext`.
- Produces: `sign_path(ctx, storage_key: str) -> str` → `/api/files/{key}?exp=…&sig=…` (HMAC-SHA256 over `f"{key}:{exp}"` with `signing_secret`; `exp` per Global Constraints); `verify(ctx, key, exp, sig) -> bool`; `GET /api/files/{key}` → 403 `bad_signature` / `expired`, 404 for keys not matching `^[0-9a-f]{32}\.[a-z0-9]{1,5}$` or missing files.
- Avatars: images only, resized to 512×512 (cover crop), stored, `avatar_url` populated in `UserOut`/`ConversationOut`.

- [ ] **Step 1: Write the failing tests:**

```python
def test_avatar_upload_sets_avatar_url(client)
def test_oversize_rejected_413(client)          # 10 MB + 1 byte
def test_unsupported_type_400(client)           # application/x-msdownload
def test_signed_url_roundtrip(client)           # GET avatar_url → 200 image bytes
def test_tampered_signature_403(client)
def test_expired_signature_403(client)          # clock.advance(hours=3)
def test_path_traversal_key_404(client)         # "/api/files/..%2f..%2fetc%2fpasswd?exp=..&sig=.."
def test_group_avatar_admin_only(client)
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(files): validated uploads, signed file URLs, profile and group avatars`.

### Task 13: Seed data (core) and boot seeding

**Files:**
- Create: `backend/app/seed/{__init__,__main__,data,build,features}.py`
- Modify: `backend/app/main.py` (lifespan: `if settings.seed_on_empty and users table empty: await seed_database(...)`)
- Test: `backend/tests/test_seed.py`

**Interfaces:**
- Produces: `SeedContext` dataclass — `session`, `now`, `users: dict[str, User]` (keys `alice, bob, priya, daniel, emma, lucas, mei, jordan`), `convs: dict[str, Conversation]`, `add_message(conv_key, sender_key | None, body, minutes_ago: float, **fields) -> Message`, `set_cursors(conv_key, user_key, delivered_id, read_id)`.
- Produces: `async seed_database(session_factory, settings, clock) -> None`; `python -m app.seed --reset` drops and rebuilds the DB file at `settings.database_path`; conftest fixture `seeded_client` (same as `client` with `seed_on_empty=True`).
- Produces: `features.py` with `seed_core(ctx)`; later tasks append `seed_<feature>(ctx)` functions and register them in the ordered list `FEATURE_SEEDERS`.
- Data (§9): 8 users, phones `+1555010000N` (N=1..8), names Alice Chen, Bob Martinez, Priya Sharma, Daniel Kim, Emma Wilson, Lucas Silva, Mei Tanaka, Jordan Blake; usernames `alice.01`…`jordan.08`; contacts among users 1–7 (Jordan has none); DMs Alice–Bob, Alice–Priya, Alice–Daniel, Alice–Emma, Bob–Priya, Alice Note to Self; groups "Weekend Hike" (admin Alice; Bob, Priya, Lucas), "Family" (admin Emma; Alice, Mei), "Project Phoenix" (admins Daniel, Alice; Bob, Priya, Mei). ≈200 messages spread over the last 7 days with natural dialogue, all `created_at <= now`; cursors give Alice unread messages in 2 chats and her sent messages a mix of sent/delivered/read.

- [ ] **Step 1: Write the failing tests:**

```python
def test_seed_creates_demo_world(seeded_client)   # 8 users, 3 groups, ≥ 6 directs, ≥ 180 messages
def test_seed_is_idempotent(seeded_client)        # running seed_database again changes no counts
def test_demo_login_works(seeded_client)          # login("+15550100001") → is_new_user False, display_name "Alice Chen"
def test_alice_has_unread(seeded_client)          # GET /conversations → ≥ 2 rows with unread_count > 0
def test_no_future_timestamps(seeded_client)
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS; full suite `python -m pytest -q` green.
- [ ] **Step 5: Commit** `feat(seed): demo users, chats and groups seeded on empty boot`.

---

# Milestone M2 — Frontend core (≈4 h) → Cut line 1

Every frontend task starts with `npm run gen:api` (script: run `python -m app.openapi_dump > ../frontend/openapi.json` in `backend/`, then `openapi-typescript openapi.json -o src/lib/api/schema.d.ts`). Add `backend/app/openapi_dump.py` in T14.

### Task 14: API client, session store, socket client

**Files:**
- Create: `backend/app/openapi_dump.py`, `frontend/src/lib/api/{client,types,queryKeys}.ts`, `frontend/src/lib/api/schema.d.ts` (generated), `frontend/src/stores/{auth,socket}.ts`, `frontend/src/lib/realtime/{socket,events}.ts`, `frontend/src/lib/realtime/backoff.ts`
- Test: `frontend/src/lib/api/client.test.ts`, `frontend/src/lib/realtime/socket.test.ts`, `frontend/src/lib/realtime/backoff.test.ts`

**Interfaces:**
- Produces: `apiFetch<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T>` — adds `Authorization: Bearer`, JSON encodes `json`, parses error envelope into `ApiError {status, code, message}`, on **401 calls `useAuth.getState().signOut()`**.
- Produces: `useAuth` (Zustand, persisted to `localStorage` key `signal.session`): `{token: string|null, me: MeOut|null, setSession(token, me), setMe(me), signOut()}`; `signOut` clears the query cache and the outbox.
- Produces: `backoffDelay(attempt: number, rand = Math.random): number` = `min(30000, 1000 * 2**attempt) * (0.5 + rand()/2)`.
- Produces: `class SocketClient { connect(token: string): void; send(frame: ClientFrame): void; onEvent(cb: (e: ServerEvent) => void): () => void; close(): void }` — sends `auth` first, pings every 25 s, reconnects with `backoffDelay`, updates `useSocket.status` (`"connecting"|"open"|"closed"`); on close codes 4401/4403 calls `signOut()` and does **not** reconnect.
- Produces: `ServerEvent` discriminated union and `ClientFrame` union (`auth`, `typing`, `receipt`, `ping`).

- [ ] **Step 1: Write the failing tests:**

```ts
it("signs out on 401")                       // apiFetch → 401 → useAuth.getState().token === null
it("maps error envelope to ApiError")        // 409 {error:{code:"already_contact"}} → ApiError.code
it("backoff grows and caps at 30s")          // attempts 0..10 with rand=()=>1 → 1000,2000,…,30000
it("sends auth as the first frame")          // mock WebSocket
it("reconnects after an abnormal close")     // close 1006 → new WebSocket after backoff
it("does not reconnect after 4401 and signs out")
```

- [ ] **Step 2: Run** `npx vitest run src/lib` → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(web): typed API client, persisted session, resilient socket client`.

### Task 15: Design tokens, theme, UI primitives

**Files:**
- Create: `docs/ui-reference.md`, `frontend/src/styles/tokens.css`, `frontend/src/lib/theme.ts`, `frontend/src/components/ui/{Avatar,Modal,Toast,ContextMenu,Switch,IconButton,SearchInput,Tabs,Tooltip}.tsx`, `frontend/src/stores/toast.ts`
- Modify: `frontend/src/app/globals.css` (import tokens, map Tailwind theme to variables)
- Test: `frontend/src/components/ui/Avatar.test.tsx`, `frontend/src/stores/toast.test.ts`

**Interfaces:**
- Produces CSS variables (light under `:root[data-theme="light"]`, dark under `[data-theme="dark"]`): `--bg`, `--surface`, `--surface-2`, `--surface-hover`, `--text`, `--text-secondary`, `--text-tertiary`, `--primary`, `--on-primary`, `--bubble-out-bg`, `--bubble-out-text`, `--bubble-in-bg`, `--bubble-in-text`, `--divider`, `--danger`, `--online`, `--radius-bubble`, `--radius-bubble-tight`, `--avatar-sm` (28px), `--avatar-md` (36px), `--avatar-lg` (48px), `--avatar-xl` (80px), `--font-body`, `--font-caption`, `--font-title`.
- Produces: `applyTheme(pref: "system"|"light"|"dark"): void` (sets `data-theme` on `<html>`, follows `prefers-color-scheme` for `system`).
- Produces: `<Avatar user|conversation size="sm"|"md"|"lg"|"xl" />` — image when `avatar_url`, else coloured circle with `initials(name)`; `initials("Alice Chen")="AC"`, `initials("Bob")="B"`, `initials("  ")="#"`.
- Produces: `toast(message: string, opts?: {action?: {label, onClick}})` — bottom-centre stack, auto-dismiss 4 s.

- [ ] **Step 1: Build the reference board.** In the built-in browser, collect current Signal Desktop (light + dark) and Signal Android screenshots from official Signal sources (signal.org, support.signal.org, Signal blog) plus any the user provides; save images to `docs/ui-reference/` (git-ignored) and record measured values (hex colours, sizes, radii, font sizes, spacing, list row height, header height, composer height) and source URLs in `docs/ui-reference.md`. Done when every token above has a measured value.
- [ ] **Step 2: Write the failing tests** (`initials` cases above; toast auto-dismiss after 4 s with fake timers; avatar renders `<img>` when `avatar_url` present).
- [ ] **Step 3: Run** → FAIL. **Step 4: Implement** tokens and primitives (Modal: focus trap, `Esc` closes, scrim; ContextMenu: keyboard navigable; Switch: Signal-style toggle).
- [ ] **Step 5: Run** → PASS.
- [ ] **Step 6: Commit** `feat(web): Signal design tokens, theming and UI primitives`.

### Task 16: App shell, responsive layout, onboarding, placeholders

**Files:**
- Create: `frontend/src/stores/ui.ts`, `frontend/src/features/shell/{AppShell,NavRail,MobileTabBar,ResizableListPane,ConversationPaneHost}.tsx`, `frontend/src/lib/useBreakpoint.ts`, `frontend/src/lib/selection.ts`, `frontend/src/features/onboarding/{OnboardingFlow,PhoneStep,OtpStep,ProfileStep,DemoAccounts}.tsx`, `frontend/src/app/onboarding/page.tsx`, `frontend/src/features/placeholders/{CallsTab,StoriesTab,ComingSoon}.tsx`
- Modify: `frontend/src/app/page.tsx`
- Test: `frontend/src/lib/selection.test.ts`, `frontend/src/features/shell/ResizableListPane.test.ts`

**Interfaces:**
- Produces: `useUi` `{tab: "chats"|"calls"|"stories"|"settings", selectedId: number|null, panel: null|"conversation-settings"|"new-chat"|"new-group", select(id|null), setTab, openPanel, closePanel}`.
- Produces: `parseSelection(search: string): number|null`, `selectionSearch(id: number|null): string` (`?c=<id>`); on mobile `select(id)` pushes a history entry and `popstate` clears it.
- Produces: `clampListWidth(px: number): number` (300–440), persisted to `localStorage` key `signal.listWidth`.
- Produces: `useBreakpoint(): "mobile"|"tablet"|"desktop"`.
- Behaviour: no token → `/onboarding/`; onboarding steps Phone → OTP (`123456` hint) → Profile (display name required, optional avatar via `POST /api/me/avatar`) for new users; `DemoAccounts` lists the 8 seeded users for one-click fill. Calls/Stories tabs and header call buttons show `ComingSoon` / toast "Calls are coming soon".

- [ ] **Step 1: Write the failing tests** (`parseSelection("?c=12")===12`, `parseSelection("?c=abc")===null`, round trip; `clampListWidth(200)===300`, `clampListWidth(999)===440`).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Verify in the browser** (backend + `npm run dev`): at 1440 px nav rail + list + pane visible; at 1024 px same with narrower list; at 375 px list + bottom tabs only; onboarding with a fresh phone reaches the shell; demo-account login reaches the shell; reload keeps the session.
- [ ] **Step 6: Commit** `feat(web): responsive Signal shell, onboarding and placeholders`.

### Task 17: Chat list, search, new chat, add contact

**Files:**
- Create: `frontend/src/features/chat-list/{ConversationList,ConversationRow,ChatListHeader,SearchResults,ConnectingBanner,ArchivedEntry}.tsx`, `frontend/src/features/contacts/{NewChatPanel,AddContactModal}.tsx`, `frontend/src/lib/time.ts`, `frontend/src/lib/conversations.ts`, `frontend/src/stores/typing.ts`
- Test: `frontend/src/lib/time.test.ts`, `frontend/src/lib/conversations.test.ts`, `frontend/src/stores/typing.test.ts`

**Interfaces:**
- Produces: `formatListTime(ts: Date, now: Date): string` — `< 1 min` → `"Now"`, `< 60 min` → `"{n}m"`, same day → locale `h:mm`, within 6 days → weekday `"Mon"`, else `"Sep 12"` (plus year if different); `formatLastSeen(ts, now)`.
- Produces: `sortConversations(list: ConversationOut[]): ConversationOut[]` (pinned first, then `last_activity_at` desc); `previewText(c: ConversationOut, meId): string` (group → `"Bob: text"`, own → `"You: text"`, deleted → `"This message was deleted"`, system → rendered system text, media → `"📷 Photo"`, voice → `"🎤 Voice message"`, poll → `"📊 Poll: question"`); `systemText(event, users, meId): string` for all §Shared system events.
- Produces: `useTyping` `{byConversation: Record<number, Record<number, number /*expiresAt*/>>, set(convId, userId, state: "start"|"stop"), active(convId): number[]}` — entries auto-expire 8 s after the last `start`.
- Behaviour: rows show avatar, title, preview (or animated "typing" when `useTyping.active(id)` is non-empty), time, unread badge, muted icon, pinned icon; archived chats are hidden from the main list and reachable via an "Archived chats" entry at the bottom; header search (≥ 2 chars → `GET /api/search`) with Chats/Contacts/Messages sections; `ConnectingBanner` when `useSocket.status !== "open"`; new chat panel: contact list + filter, "New group", "Find by username", "Find by phone number" (lookup → open direct), add contact modal (409 → inline error).

- [ ] **Step 1: Write the failing tests** for `formatListTime` (each bucket), `sortConversations`, `previewText` (each case), `systemText("member_added")` → `"Alice added Bob"` / `"You added Bob"`, and `useTyping` (`it("expires typing after 8s")`, `it("stop removes the user immediately")`).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Verify in the browser** against `docs/ui-reference.md`: row height, avatar size, badge colour, time placement, search sections, new-chat panel, light + dark.
- [ ] **Step 6: Commit** `feat(web): Signal chat list with search and new chat flows`.

### Task 18: Conversation view, real-time cache, outbox, receipts, typing

**Files:**
- Create: `frontend/src/features/conversation/{ConversationView,ConversationHeader,Timeline,Composer,TypingBubble,DateSeparator,EncryptionNotice}.tsx`, `frontend/src/features/messages/{MessageBubble,TextBody,SystemMessage,StatusTicks}.tsx`, `frontend/src/lib/grouping.ts`, `frontend/src/lib/status.ts`, `frontend/src/lib/realtime/applyEvent.ts`, `frontend/src/lib/realtime/useRealtime.ts`, `frontend/src/stores/outbox.ts`, `frontend/src/lib/useReadReceipts.ts`
- Test: `frontend/src/lib/grouping.test.ts`, `frontend/src/lib/status.test.ts`, `frontend/src/lib/realtime/applyEvent.test.ts`, `frontend/src/stores/outbox.test.ts`

**Interfaces:**
- Produces: `groupTimeline(messages: MessageOut[] (oldest first), meId: number, now: Date): TimelineItem[]` where `TimelineItem = {type:"date", label} | {type:"message", message, position:"single"|"first"|"middle"|"last", showAvatar, showName}`; same sender within 3 min and same day clusters; labels `"Today"`, `"Yesterday"`, weekday within 6 days, else `"Sat, Sep 12"`.
- Produces: `deriveStatus(m: MessageOut, c: ConversationOut, meId: number): "sent"|"delivered"|"read"` — mirror of backend `derive_status` using `MemberOut` cursors (`null` → 0).
- Produces: `applyEvent(qc: QueryClient, e: ServerEvent, ctx: {meId: number; openConversationId: number|null; isVisible: boolean}): void` — `message.created`: insert into `qk.messages(id)` first page unless an item with the same `id` **or** same `client_id` exists (replace that one); update conversation `last_message`, `last_activity_at`, `unread_count` (+1 only when not mine and not (open && visible)), re-sort; `message.updated` replace by id; `message.removed` drop ids; `receipt.updated` update member cursors; `typing` → `useTyping`; `presence` patch users in conversations; `conversation.updated` upsert; `conversation.removed` drop and clear selection; `device.revoked` → `signOut()`.
- Produces: `useOutbox` (persisted `sessionStorage`): `enqueue(entry: {client_id, conversation_id, kind, body?, reply_to_id?, attachment_ids?, poll?}): void`, `flush(send: (e) => Promise<MessageOut>): Promise<void>`, entries `{...entry, state: "sending"|"failed", attempts, created_at}`; retry delays 2 s, 4 s, 8 s then `failed`; `retry(client_id)` resets to `sending`. Success inserts the server message into the cache and removes the entry. Timeline renders outbox entries as bubbles with 🕓 / red "!".
- Consumes: `useTyping` (T17). Composer sends `typing start` at most every 3 s and `stop` on send, blur, or 5 s idle.
- Produces: `useReadReceipts(conversationId)` — sends `receipt read` with the newest message id when tab visible, conversation open, and timeline scrolled to bottom; `useRealtime()` owns the `SocketClient`, routes events to `applyEvent`, sends `receipt delivered` for `message.created` from others and, after each conversation-list load, for every row whose `last_message` is from someone else; on every `ready` (first connect and each reconnect) it invalidates `qk.conversations` and the open `qk.messages(id)`, then calls `useOutbox.flush`.
- `StatusTicks` renders `data-status="sending"|"sent"|"delivered"|"read"|"failed"` (used by E2E).
- Behaviour: infinite scroll upward (`useInfiniteQuery`, `before` cursor); composer auto-grows, Enter sends, Shift+Enter newline; header shows avatar, title, `Online`/`Last seen …`/member count, call buttons (Coming soon); bubbles: outgoing right with `--bubble-out-bg`, incoming left, sender name + avatar in groups for `first`/`single`, time + ticks inside the footer; encryption notice at the top of the first page.

- [ ] **Step 1: Write the failing tests:**

```ts
// grouping
it("clusters same sender within 3 minutes")       // 3 msgs 1 min apart → first/middle/last
it("breaks clusters on gap > 3 min, sender change, and day change")
it("labels date separators Today/Yesterday/weekday/date")
// status
it("derives sent/delivered/read from cursors; null cursor counts as 0; group needs everyone")
// applyEvent
it("dedupes echo by client_id and id")            // optimistic+server echo → one item
it("increments unread only for others' messages in non-visible conversations")
it("re-sorts the conversation list on new message")
it("removes conversation and clears selection on conversation.removed")
// outbox
it("retries at 2s, 4s, 8s then marks failed")
it("retry() resends with the same client_id")
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Verify in the browser** with two windows (Alice + Bob, seeded): message appears live; Alice sees 🕓 → ✓ → ✓✓ → read; typing bubble appears and clears; kill backend → "Connecting…" banner, send queues, restart backend → message flushes once.
- [ ] **Step 6: Commit** `feat(web): real-time conversation view with outbox, receipts and typing`.

### Task 19: Group flows and conversation settings panel

**Files:**
- Create: `frontend/src/features/groups/{CreateGroupFlow,ConversationSettingsPanel,MemberList,AddMembersModal,MemberActionsMenu}.tsx`, `frontend/src/lib/permissions.ts`
- Test: `frontend/src/lib/permissions.test.ts`

**Interfaces:**
- Produces: `canManageMembers(c: ConversationOut): boolean`, `canEditGroupInfo(c)`, `canRemove(c, targetUserId, meId)` (admins can remove non-self members), `isActive(c)` (`me.left_at === null`).
- Behaviour: create group = pick members (search) → name + optional avatar → create → opens chat; settings panel (header click; slides over pane on desktop, full screen on mobile): avatar, title, description, member count, members with role badges, admin actions (add, remove, make/dismiss admin), mute (1 h, 8 h, 1 d, 1 w, always), archive, pin chat, leave group (confirm modal), placeholder rows (Disappearing messages → T24, Safety number → T27); direct chats show the contact's profile, `Add to contacts` when not a contact, block. Left groups: composer replaced by "You are no longer a member of this group".

- [ ] **Step 1: Write the failing tests** for each permission helper (admin vs member vs left).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Verify in the browser:** create a group, add/remove/promote with live updates in a second window; non-admin sees no admin actions; leaving shows the system message and disabled composer.
- [ ] **Step 6: Commit** `feat(web): group creation, settings panel and admin controls`.

### Task 20: Settings, notifications, theme, tab title

**Files:**
- Create: `frontend/src/features/settings/{SettingsShell,ProfileSettings,AccountSettings,AppearanceSettings,ChatsSettings,NotificationsSettings,PrivacySettings,HelpSettings,LinkedDevicesSettings}.tsx`, `frontend/src/lib/notifications.ts`
- Test: `frontend/src/lib/notifications.test.ts`

**Interfaces:**
- Produces: `notificationFor(e: MessageOut, c: ConversationOut, prefs: SettingsOut, ctx: {meId, now, isVisible}): {title: string; body: string} | null` — null for own messages, visible-and-open conversation, muted (`muted_until > now`), or `notifications_enabled=false`; `notification_preview`: `name_and_message` → title name, body text; `name_only` → body `"New message"`; `none` → title `"Signal"`, body `"New message"`.
- Produces: `unreadTitle(total: number): string` → `"Signal"` or `"(3) Signal"` (muted chats excluded from total).
- Behaviour: Settings sections as spec §6.1 item 5 — Profile (name, about, avatar, username), Account (phone, logout; "Delete account" → Coming soon), Linked devices (list + unlink; "Link new device" → T33), Appearance (theme system/light/dark applied live, chat colour sets `--bubble-out-bg`), Chats (folders → T31), Notifications (enable → `Notification.requestPermission()`, preview select), Privacy (read receipts, typing indicators, last seen, blocked users list with unblock, default disappearing timer → T24), Help (about, keyboard shortcuts → T25).

- [ ] **Step 1: Write the failing tests** for `notificationFor` (each null case, each preview mode) and `unreadTitle`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Verify in the browser:** theme switch live; read-receipts off → other side never sees "read"; notification shows when the tab is hidden; title shows unread count.
- [ ] **Step 6: Commit** `feat(web): settings, notifications, theme and unread title`.

### Task 21: Two-user E2E test and deploy — **Cut line 1**

**Files:**
- Create: `frontend/playwright.config.ts`, `frontend/e2e/realtime.spec.ts`

**Interfaces:**
- Config: `baseURL` from `E2E_BASE_URL` (default `http://localhost:3000`); when unset, `webServer` starts backend with `DATABASE_PATH=./data/e2e.db` (`cd ../backend && python -m app.seed --reset && uvicorn app.main:app --port 8000`, using the backend venv's Python) and frontend (`npm run build && npx serve out -l 3000`).

- [ ] **Step 1: Write the test** `alice and bob chat in real time`: two browser contexts; demo-login Alice (`+15550100001`) and Bob (`+15550100002`) via OTP `123456`; Alice opens the Alice–Bob chat and sends a unique text; Bob's list shows it without reload; Bob opens the chat; Alice's last bubble reaches the `read` tick state (`data-status="read"` attribute on `StatusTicks`).
- [ ] **Step 2: Run** `npx playwright test` → PASS locally.
- [ ] **Step 3: Visual QA** at 1440 / 1024 / 375 px in light and dark against `docs/ui-reference.md`; fix deviations.
- [ ] **Step 4: Push and verify deploy:** CI green; Render redeployed; `E2E_BASE_URL=<web-url> npx playwright test` → PASS.
- [ ] **Step 5: Commit** `test(e2e): two-user real-time messaging` — **all must-have features are now live.**

---

# Milestone M3 — Bonus (≈4 h) → Cut line 2

### Task 22: Attachments

**Files:**
- Create: `backend/app/models/attachment.py`, `backend/app/api/attachments.py`, `frontend/src/features/messages/{MediaGrid,Lightbox,FileCard}.tsx`, `frontend/src/features/conversation/AttachmentTray.tsx`, `frontend/src/lib/useSignedMedia.ts`
- Modify: `backend/app/services/messages.py` (`media` kind, link attachments, `message_out_many` loads attachments), `backend/app/seed/features.py` (`seed_attachments`: a 3-image album in Weekend Hike and a PDF in Project Phoenix, images generated with Pillow)
- Test: `backend/tests/test_attachments.py`, `frontend/src/lib/useSignedMedia.test.ts`

**Interfaces:**
- Produces: `attachments` table per spec §3.4; `POST /api/attachments` (multipart `file`, optional `kind`) → `AttachmentOut` with `message_id=null`.
- Send rules: `kind="media"` requires 1–10 `attachment_ids`; each must belong to the sender (400 `invalid_attachment`) and be unlinked (409 `attachment_in_use`); body optional (caption).
- Produces: `useSignedMedia(url: string): {src: string; onError: () => void}` — on first error invalidates `qk.conversations` and the open `qk.messages(id)` once per URL.
- UI: paperclip + drag-and-drop + paste into composer → tray with thumbnails and upload progress; images in a Signal-style grid (1, 2, 3, 4+ layouts) opening a lightbox; files as cards with icon, name, size, download.

- [ ] **Step 1: Write the failing tests:**

```python
def test_upload_then_send_media(client)            # message.attachments has url, width, height
def test_attachment_only_message_allowed(client)   # kind media, body None → 201
def test_foreign_attachment_rejected(client)       # 400 invalid_attachment
def test_attachment_reuse_rejected(client)         # 409 attachment_in_use
def test_album_limit(client)                       # 11 ids → 422
```
```ts
it("refreshes queries once when a signed media URL fails")  // two errors → one invalidate call
```

- [ ] **Step 2: Run** both suites → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Verify in the browser:** send an album and a PDF between two windows; lightbox; download works.
- [ ] **Step 6: Commit** `feat: image albums and file attachments`.

### Task 23: Reactions and reply/quote

**Files:**
- Create: `backend/app/models/reaction.py`, `backend/app/services/reactions.py`, `frontend/src/features/messages/{MessageActions,ReactionPicker,ReactionChips,ReactorsPopover,QuotedMessage}.tsx`, `frontend/src/features/conversation/ReplyPreview.tsx`
- Modify: `backend/app/api/messages.py`, `backend/app/services/messages.py` (load reactions), seed (`seed_reactions_replies`)
- Test: `backend/tests/test_reactions.py`

**Interfaces:**
- Produces: `PUT /api/messages/{id}/reaction {emoji}` (replaces my reaction), `DELETE /api/messages/{id}/reaction`; publishes `reaction.updated {conversation_id, message_id, reactions}`; emoji validated as 1–16 chars, no whitespace.
- UI: desktop hover bar on each bubble (react, reply, more ⋯); quick reactions ❤️ 👍 👎 😂 😮 😢 plus "+" full picker (native emoji grid); chips under the bubble with counts, mine highlighted, click shows reactors; reply sets `ReplyPreview` above the composer (`Esc` cancels); quoted block inside the bubble, click scrolls to and flashes the original (loads older pages if needed).

- [ ] **Step 1: Write the failing tests:**

```python
def test_reaction_replace_semantics(client)  # 👍 then ❤️ → one reaction ❤️
def test_reaction_remove(client)
def test_reaction_event_broadcast(client)
def test_reaction_non_member_404(client)
def test_reply_preview_in_message_out(client)
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Verify in the browser:** react and reply live across two windows.
- [ ] **Step 6: Commit** `feat: emoji reactions and quoted replies`.

### Task 24: Disappearing messages

**Files:**
- Create: `backend/app/tasks/{__init__,sweepers}.py`, `frontend/src/features/conversation/DisappearingMenu.tsx`, `frontend/src/features/messages/ExpiryTimer.tsx`
- Modify: `backend/app/api/conversations.py` (`disappearing_seconds` in PATCH), `backend/app/services/messages.py` (`expires_at`), `backend/app/main.py` (start/stop sweeper task in lifespan), seed (`seed_disappearing`: Alice–Emma at 1 week)
- Test: `backend/tests/test_disappearing.py`

**Interfaces:**
- Produces: `async sweep_expired(session_factory, ctx) -> int` — deletes messages with `expires_at <= now` (removes attachment files), publishes `message.removed {conversation_id, message_ids}` per conversation, returns count; lifespan loop runs it every 5 s.
- Rules: allowed values are exactly the Global Constraints list (else 422); any member may change it in a direct chat, admins only in groups (403 `not_admin`); a change posts a `timer_changed` system message; new conversations start with the creator's `default_disappearing_seconds`.
- UI: timer menu in the settings panel and header ⋮; timer icon in bubble footers; bubbles hide locally at `expires_at`.

- [ ] **Step 1: Write the failing tests:**

```python
def test_expires_at_set_on_send(client)          # timer 30 → expires_at = created_at + 30s
def test_sweeper_removes_and_notifies(client)    # clock.advance(seconds=31); client.portal.call(sweep_expired, ...) == 1; ws gets message.removed
def test_invalid_timer_value_422(client)         # 45
def test_group_timer_admin_only(client)
def test_timer_change_posts_system_message(client)
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: functional disappearing messages`.

### Task 25: Keyboard shortcuts, mobile gestures, responsive polish, deploy — **Cut line 2**

**Files:**
- Create: `frontend/src/lib/shortcuts.ts`, `frontend/src/features/shell/ShortcutsModal.tsx`, `frontend/src/lib/useLongPress.ts`, `frontend/src/lib/useSwipeToReply.ts`
- Test: `frontend/src/lib/shortcuts.test.ts`

**Interfaces:**
- Produces: `matchShortcut(e: Pick<KeyboardEvent,"key"|"ctrlKey"|"metaKey"|"altKey"|"shiftKey">, platform: "mac"|"other"): ShortcutId | null` with ids `newChat` (Mod+N), `search` (Mod+F), `prevChat` (Alt+ArrowUp), `nextChat` (Alt+ArrowDown), `closeOrCancel` (Escape), `showShortcuts` (Mod+/); Mod = ⌘ on mac, Ctrl elsewhere. (`↑` edit-last is added in T28.)
- Mobile: long-press (500 ms) opens the message context menu; swipe right ≥ 64 px on a bubble starts a reply.

- [ ] **Step 1: Write the failing tests** for each shortcut on both platforms and for non-matches (plain `n`).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Responsive pass** at 375 / 768 / 1024 / 1440 px, light and dark; then push, confirm CI + Render deploy, rerun E2E against the deployed URL.
- [ ] **Step 6: Commit** `feat(web): keyboard shortcuts and mobile gestures` — **all bonus features live.**

---

# Milestone M4 — Standouts A (≈4 h) → Cut line 3

### Task 26: Message requests and silent blocking

**Files:**
- Create: `backend/app/services/requests.py`, `frontend/src/features/conversation/RequestBanner.tsx`, `frontend/src/features/chat-list/MessageRequestsEntry.tsx`
- Modify: `backend/app/services/conversations.py` (initial `request_state`), `backend/app/services/receipts.py` + typing handler (suppression), `backend/app/services/messages.py` (block filtering, re-adding a deleted request recipient), `backend/app/api/conversations.py` (`POST /conversations/{id}/request`), seed (`seed_requests`: Jordan → Alice with 2 messages)
- Test: `backend/tests/test_requests.py`

**Interfaces:**
- Rules (spec §3.6.2, §3.6.5): recipient `request_state="pending"` when a direct chat is created by a non-contact of the recipient, or when added to a group by a non-contact; pending members' cursors are hidden (`null`) from others and their typing is not relayed; `accept` → `accepted`; `block` → `blocks` row + member `left_at` + `conversation.removed` to the blocker; `delete` → recipient's member row deleted + `conversation.removed` to the recipient; a later message from the same sender in that direct chat re-creates the recipient's member row as `pending`. Messages whose sender is blocked by the viewer are excluded from that viewer's pages, search, unread counts, and pushes.
- UI: "Message requests" entry above the list when any `me.request_state === "pending"` (count badge); pending chats open with `RequestBanner` (text "Let {name} message you and share your name and photo with them?" style copy written fresh, buttons Delete / Block / Accept) replacing the composer.

- [ ] **Step 1: Write the failing tests:**

```python
def test_stranger_dm_is_pending_for_recipient(client)   # Jordan → Alice: Alice me.request_state "pending"
def test_contact_dm_is_accepted(client)
def test_pending_suppresses_receipts_and_typing(client) # Alice delivered/typing → Jordan: assert_no_event
def test_accept_enables_receipts(client)
def test_block_removes_and_silences(client)             # Jordan's later messages: no push to Alice, absent from her pages; Jordan still 201
def test_delete_then_new_message_recreates_request(client)
def test_group_add_by_non_contact_is_pending(client)
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: message requests with receipt/typing suppression and silent blocking`.

### Task 27: Safety numbers and verification

**Files:**
- Create: `backend/app/models/verification.py`, `backend/app/services/safety_numbers.py`, `frontend/src/features/contacts/SafetyNumberModal.tsx`, `frontend/src/features/conversation/SafetyNumberChangedNotice.tsx`
- Modify: `backend/app/api/people.py`, `backend/app/services/conversations.py` (`safety_number_changed` on `ConversationOut`: direct only, true when my verification snapshot ≠ the other user's current key), seed (`seed_verifications`: Alice verified Bob with the current key; Alice has a stale snapshot for Daniel so his chat demonstrates the "changed" state)
- Test: `backend/tests/test_safety_numbers.py`

**Interfaces:**
- Produces: `fingerprint_half(identity_key: bytes, stable_id: bytes, iterations: int = 5200) -> str` and `compute_safety_number(key_a: bytes, id_a: int, key_b: bytes, id_b: int) -> str` (60 digits). Algorithm (spec §6.3.2):

```python
h = sha512(b"\x00\x00" + identity_key + stable_id).digest()
for _ in range(iterations - 1):
    h = sha512(h + identity_key).digest()
digits = "".join(f"{int.from_bytes(h[i:i+5], 'big') % 100000:05d}" for i in range(0, 30, 5))
# stable_id = str(user_id).encode(); halves concatenated in ascending user-id order
```

- Produces: `GET /api/users/{id}/safety-number` → `{digits, qr_payload, verified, changed}` (`qr_payload = "v0:" + digits`); `POST`/`DELETE /api/users/{id}/verification`.
- UI: safety-number modal from the contact/settings panel — 12 groups of 5 digits in a 4×3 grid, QR (`qrcode.react`), "Mark as verified"/"Clear verification"; verified badge next to the name in headers; changed notice in the timeline with a "View safety number" action.

- [ ] **Step 1: Write the failing tests:**

```python
def test_symmetric(): assert compute(ka, 1, kb, 2) == compute(kb, 2, ka, 1)
def test_sixty_digits(): s = compute(...); assert len(s) == 60 and s.isdigit()
def test_golden_vector(): assert compute(bytes(range(32)), 1, bytes(range(32, 64)), 2) == GOLDEN  # record GOLDEN at first green run
def test_verify_roundtrip(client)          # POST verification → verified True; DELETE → False
def test_changed_when_snapshot_stale(client)  # snapshot ≠ current key → changed True, verified False
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**, then copy the computed value into `GOLDEN`. **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: Signal-style safety numbers with verification`.

### Task 28: Edit, delete for everyone, delete for me — deploy — **Cut line 3**

**Files:**
- Create: `backend/app/models/{revision,hidden}.py`, `frontend/src/features/messages/EditHistoryModal.tsx`, `frontend/src/features/conversation/EditingBar.tsx`
- Modify: `backend/app/services/messages.py`, `backend/app/api/messages.py`, `frontend/src/lib/shortcuts.ts` (add `editLast`: `ArrowUp` in an empty composer), seed (`seed_edits`: one edited and one deleted message in Alice–Bob)
- Test: `backend/tests/test_edit_delete.py`, extend `frontend/src/lib/shortcuts.test.ts`

**Interfaces:**
- Produces: `PATCH /api/messages/{id} {body}` (sender only → 403 `not_sender`; after 24 h → 403 `edit_window_passed`; deleted → 400 `message_deleted`; text kinds only) writes a `message_revisions` row with the previous body, sets `edited_at`, publishes `message.updated`; `GET /api/messages/{id}/revisions`.
- Produces: `DELETE /api/messages/{id}?scope=everyone` (sender, within 24 h → else 403 `delete_window_passed`): sets `deleted_at`, nulls `body`, deletes attachments (files too), reactions, pins, poll rows; publishes `message.updated`. `scope=me`: inserts `hidden_messages`; excluded from my pages, search, unread counts, conversation preview.
- UI: "Edited" label in the footer (click → history modal); editing bar above the composer; tombstone bubble "This message was deleted"; delete confirm modal with "Delete for me" / "Delete for everyone" (latter only when allowed).

- [ ] **Step 1: Write the failing tests:**

```python
def test_edit_by_sender_creates_revision(client)
def test_edit_by_other_403(client)
def test_edit_after_window_403(client)          # clock.advance(hours=24, seconds=1)
def test_delete_for_everyone_tombstone(client)  # body None, deleted_at set, reactions gone, Bob ws gets message.updated
def test_delete_for_me_hides_only_for_me(client)
def test_hidden_excluded_from_unread(client)
def test_cannot_edit_deleted(client)
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Push, verify CI + deploy, rerun E2E against the deployed URL.**
- [ ] **Step 6: Commit** `feat: edit with history, delete for everyone, delete for me`.

---

# Milestone M5 — Standouts B (≈5 h) → Cut line 4

### Task 29: Pinned messages

**Files:**
- Create: `backend/app/models/pin.py`, `backend/app/services/pins.py`, `frontend/src/features/conversation/PinnedBar.tsx`, `frontend/src/features/messages/PinMenu.tsx`
- Modify: `backend/app/api/messages.py`, `backend/app/api/conversations.py` (`pin_permission`), `backend/app/services/conversations.py` (`pins` on `ConversationOut`), `backend/app/tasks/sweepers.py` (`sweep_expired_pins`, every 60 s), seed (`seed_pins`: one pin in Project Phoenix)
- Test: `backend/tests/test_pins.py`

**Interfaces:**
- Produces: `POST /api/messages/{id}/pin {duration: "24h"|"7d"|"30d"|"forever"}` and `DELETE /api/messages/{id}/pin`; a 4th pin removes the oldest `pinned_at`; `pin_permission="admins"` → non-admins 403 `not_admin`; deleted messages cannot be pinned (400 `message_deleted`); publishes `pin.updated {conversation_id, pins}`; `sweep_expired_pins(session_factory, ctx) -> int`.
- UI: bar under the header showing the current pin (thumbnail/excerpt, "1 of 3"), click jumps to the message and advances to the next pin; pin/unpin in the message menu with a duration picker.

- [ ] **Step 1: Write the failing tests:**

```python
def test_pin_and_event(client)
def test_fourth_pin_evicts_oldest(client)
def test_admins_only_permission(client)
def test_pin_expiry_sweeper(client)   # duration 24h; clock.advance(hours=25); sweep → pin gone, pin.updated sent
def test_cannot_pin_deleted(client)
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: pinned messages with durations and admin permission`.

### Task 30: Polls

**Files:**
- Create: `backend/app/models/poll.py`, `backend/app/services/polls.py`, `backend/app/api/polls.py`, `frontend/src/features/messages/PollBubble.tsx`, `frontend/src/features/conversation/{ComposerPlusMenu,CreatePollModal}.tsx`
- Modify: `backend/app/services/messages.py` (`kind="poll"` with `PollIn {question, options: list[str], allow_multiple}`; load polls in `message_out_many`), seed (`seed_polls`: "Saturday trail?" in Weekend Hike with votes)
- Test: `backend/tests/test_polls.py`

**Interfaces:**
- Produces: `PollIn` validation — question 1–200 chars, 2–10 options of 1–100 chars, duplicates rejected (422). `PUT /api/polls/{message_id}/votes {option_ids}` replaces my votes (empty list = retract; >1 when `allow_multiple=false` → 422; after `ended_at` → 400 `poll_ended`); `POST /api/polls/{message_id}/end` (creator only → 403 `not_creator`); both publish `poll.updated` (payload per spec §5).
- UI: "+" menu in the composer (Photo/File, Poll); create-poll modal (add/remove options, multiple-choice toggle); poll bubble with option rows, check marks, live bars and counts, "View votes" listing voters per option, "End poll" for the creator.

- [ ] **Step 1: Write the failing tests:**

```python
def test_create_poll_message(client)
def test_option_count_bounds(client)        # 1 → 422, 11 → 422
def test_single_choice_rejects_two(client)
def test_vote_replace_and_retract(client)
def test_end_poll_creator_only_then_votes_rejected(client)
def test_poll_updated_payload(client)       # options[].vote_count and voter_ids
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: polls with live, non-anonymous voting`.

### Task 31: Chat folders — deploy — **Cut line 4**

**Files:**
- Create: `backend/app/models/folder.py`, `backend/app/services/folders.py`, `backend/app/api/folders.py`, `frontend/src/features/chat-list/FolderTabs.tsx`, `frontend/src/features/settings/FolderEditor.tsx`, `frontend/src/lib/folders.ts`
- Modify: seed (`seed_folders`: Alice has "Unread" and "Work" (Project Phoenix + Daniel DM))
- Test: `backend/tests/test_folders.py`, `frontend/src/lib/folders.test.ts`

**Interfaces:**
- Produces: `FolderOut {id, name, position, include_direct, include_groups, unread_only, conversation_ids}`; `GET/POST /api/folders`, `PATCH/DELETE /api/folders/{id}` (others' folders → 404), `PUT /api/folders/order {ids}` (must be a permutation of my folder ids → else 422).
- Produces: `inFolder(c: ConversationOut, f: FolderOut | "all"): boolean` — `"all"` → true; else `(explicit id || (include_direct && kind==="direct") || (include_groups && kind==="group")) && (!unread_only || unread_count > 0)`.
- UI: tabs above the list ("All chats" first; hidden when the user has no folders); Settings → Chats → Chat folders: list with drag-to-reorder, suggested presets "Unread", "1:1 chats", "Groups" with Add buttons, editor (name, chat types, specific chats, only unread).

- [ ] **Step 1: Write the failing tests:**

```python
def test_folder_crud_owner_only(client)
def test_reorder_requires_permutation(client)
```
```ts
it("matches explicit, type-based and unread-only folders")
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Push, verify CI + deploy, rerun E2E against the deployed URL.**
- [ ] **Step 6: Commit** `feat: chat folders with presets and custom filters`.

---

# Milestone M6 — Standouts C (≈4.5 h)

### Task 32: Voice notes

**Files:**
- Create: `frontend/src/lib/voice.ts`, `frontend/src/features/conversation/VoiceRecorder.tsx`, `frontend/src/features/messages/VoiceBubble.tsx`
- Modify: `backend/app/api/attachments.py` + `services/messages.py` (`kind="voice"`: exactly one `voice` attachment with `duration_ms` 1–300000 and `waveform` of 64 ints 0–255, else 422), seed (`seed_voice`: one generated sine-tone voice note in Alice–Bob)
- Test: `backend/tests/test_voice.py`, `frontend/src/lib/voice.test.ts`

**Interfaces:**
- Produces: `pickRecordingMime(isTypeSupported: (t: string) => boolean): string | null` — first supported of `audio/webm;codecs=opus`, `audio/ogg;codecs=opus`, `audio/mp4`; `computeWaveform(samples: Float32Array, bars = 64): number[]` (RMS per bucket, normalised to 0–255); `formatDuration(ms): string` (`"0:07"`, `"1:05"`).
- Upload: `POST /api/attachments` with form fields `kind=voice`, `duration_ms`, `waveform` (JSON).
- UI: mic button replaces send when the composer is empty; click to record (timer, cancel, stop/send), auto-stop at 5 min; bubble with play/pause, waveform scrubber, elapsed/total time, speed toggle 1× → 1.5× → 2×.

- [ ] **Step 1: Write the failing tests:**

```python
def test_voice_message_requires_metadata(client)  # missing waveform → 422; 301000 ms → 422
def test_voice_message_roundtrip(client)          # attachment.duration_ms and waveform present
```
```ts
it("prefers webm/opus, falls back to mp4")
it("computeWaveform returns 64 values in 0..255 and peaks at loud regions")
it("formats durations")
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Verify in the browser** (deployed HTTPS URL for mic permission): record, send, play at 1.5×.
- [ ] **Step 6: Commit** `feat: voice notes with waveform playback`.

### Task 33: Device linking

**Files:**
- Create: `backend/app/models/link_request.py`, `backend/app/services/linking.py`, `frontend/src/app/link/page.tsx`, `frontend/src/features/onboarding/LinkDeviceScreen.tsx`, `frontend/src/features/settings/LinkNewDeviceModal.tsx`
- Modify: `backend/app/api/devices.py` (add link-request routes), `frontend/src/features/settings/LinkedDevicesSettings.tsx`
- Test: `backend/tests/test_linking.py`

**Interfaces:**
- Consumes: device list/unlink from T7.
- Produces endpoints per spec §4 (Linking rows): `POST /api/link-requests` → `{id, code, poll_secret, expires_at}` (code: 8 chars from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`); `GET /api/link-requests/{id}` with `X-Poll-Secret` (wrong → 403 `bad_secret`; past TTL → `{status:"expired"}`; first poll after approval → `{status:"approved", token, user}`, later → `{status:"approved"}`); `POST /api/link-requests/approve {code}` (unknown/expired → 404 `invalid_code`).
- UI: `/link/` shows a QR (payload = code) and the code in large type, polls every 2 s, then stores the session and enters the app; Settings → Linked devices lists devices (current marked), Unlink, and "Link new device" modal: camera scan via `BarcodeDetector` when available, else code input.

- [ ] **Step 1: Write the failing tests:**

```python
def test_link_happy_path(client)            # request → approve → first poll returns token → GET /me with it works
def test_token_returned_once(client)
def test_wrong_poll_secret_403(client)
def test_expired_request(client)            # clock.advance(minutes=6) → approve 404, poll "expired"
def test_linked_device_appears_in_list(client)     # GET /devices from the approver shows the new device
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Verify in the browser:** link a second window via code; unlink it from the first; the second returns to onboarding.
- [ ] **Step 6: Commit** `feat: link and unlink devices via QR or pairing code`.

---

# Milestone M7 — Documentation and final verification (≈1.5 h, never cut)

### Task 34: README and final verification

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write `README.md`** with: live demo + repo links; demo accounts table (8 phones, OTP `123456`) and a "try it with two browsers" walkthrough; feature list grouped must-have / bonus / standouts (only what shipped); tech stack with versions; architecture diagram (spec §2 ASCII) and request/event flow for a message; Mermaid `erDiagram` of the shipped tables with key constraints; key schema decisions (spec §3.6); API overview table and WebSocket event table; local setup (backend venv + `uvicorn`, frontend `npm run dev`, env vars, `python -m app.seed --reset`, tests); deployment (Render Blueprint, env vars, keep-alive workflow and its caveats); assumptions and simplifications (mocked OTP and encryption, timer start, presence addition, no migrations, single worker, free-tier data reset); project structure.
- [ ] **Step 2: Run everything:** `cd backend && python -m pytest -q` → all pass; `cd frontend && npm run typecheck && npx vitest run && npm run build` → clean; `E2E_BASE_URL=<web-url> npx playwright test` → pass.
- [ ] **Step 3: Final visual pass** at 1440 / 1024 / 375 px, light and dark, against `docs/ui-reference.md`.
- [ ] **Step 4: Commit and push** `docs: README with architecture, schema, API and setup`; confirm CI green and the deployed site updated.
