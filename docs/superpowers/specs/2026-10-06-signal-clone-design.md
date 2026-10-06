# Signal Clone — Design Spec

- **Date:** 2026-10-06
- **Status:** Approved in brainstorming; pending written-spec review
- **Deadline:** 2026-10-07 afternoon (~18–20 h wall clock from spec approval)
- **Source brief:** `Scaler_SDE_Fullstack_Assignment_-_Signal_Clone.docx`

---

## 1. Intent

Build a functional clone of the Signal messenger for the Scaler SDE Full Stack assignment. Evaluators score:
functionality (esp. real-time messaging), visual/UX similarity to Signal, database design, backend/API design,
code quality, modularity, and the author's ability to explain every line in an interview.

**Success means:** a hosted demo on Render that looks and behaves like current (2026) Signal Desktop on wide screens
and Signal Android on phones; all must-have features working in real time between two browsers; a clean,
explainable schema/API; a README that documents setup, architecture, schema, API, and assumptions.

### 1.1 Stated constraints (from brief + user)

- Frontend **Next.js + TypeScript**; backend **Python FastAPI**; database **SQLite**; real-time via **WebSockets**.
- UI/UX must match the original Signal app "exactly" for web and mobile layouts.
- Seeded database; README with setup, tech stack, architecture, schema, API overview, assumptions.
- Public GitHub repo with `frontend/` and `backend/`; hosted demo link.
- Deploy on **Render, free tier**, database **re-seeded on boot**.
- Keep-alive via a **GitHub Actions** scheduled workflow (not Render Cron).
- Include innovative features beyond the core (all eight standouts selected — see §6).
- Original work only — no copying from Signal's open-source repositories (code, CSS, or SVG assets).

### 1.2 Assumptions (confirmed or defaulted)

- "Web layout" = **Signal Desktop** (Signal has no browser client). "Mobile layout" = **Signal Android**. One responsive app.
- Theme follows the OS by default; light and dark both fully supported.
- Encryption is **simulated**: identity keys are generated server-side; safety numbers use Signal's published numeric-fingerprint
  algorithm over those mock keys. Documented honestly in the README.
- Signal itself has no online/last-seen indicator; the brief requires one, so it is added with a Privacy toggle to hide it.

---

## 2. Architecture

```
Browser (Next.js static export, TypeScript)
 ├─ REST over HTTPS  ── all state changes + reads
 └─ WebSocket (one per device) ── server push + ephemeral signals (typing, receipts, heartbeat)
                                  ▼
             FastAPI service (single uvicorn worker)
   api (routers) → services (business rules) → repositories → SQLAlchemy 2.0 async (aiosqlite)
   realtime/ConnectionManager: in-memory map user_id → {device_id → WebSocket}
   background tasks: disappearing-message sweeper (5 s), pin-expiry sweeper (60 s)
                                  ▼
          SQLite file (WAL, foreign_keys=ON, busy_timeout=5000) — seeded when empty
GitHub Actions (cron 2-59/5 * * * *) ──GET /api/health──▶ keeps the free API instance awake
```

### 2.1 Deployment topology (Render Blueprint `render.yaml`)

| Service | Type | Notes |
|---|---|---|
| `signal-web` | Static Site (free, CDN, never sleeps) | `rootDir: frontend`, build `npm ci && npm run build`, publish `out/`. Env `NEXT_PUBLIC_API_URL`. |
| `signal-api` | Web Service (free) | `rootDir: backend`, Python 3.11.9 (`PYTHON_VERSION`), start `uvicorn app.main:app --host 0.0.0.0 --port $PORT`, `healthCheckPath: /api/health`. Env: `DATABASE_PATH`, `UPLOAD_DIR`, `CORS_ORIGINS`, `SIGNING_SECRET` (generated), `MOCK_OTP=123456`, `SEED_ON_EMPTY=true`. |

- Free web services spin down after 15 min without inbound traffic (~1 min cold start) and lose their filesystem on
  restart/redeploy/spin-down. The DB and uploads are therefore ephemeral; the app re-seeds when the DB is empty.
- Keep-alive workflow `.github/workflows/keep-render-alive.yml`: `schedule: cron "2-59/5 * * * *"` (avoids the
  top-of-hour GitHub load spike) + `workflow_dispatch`; `curl -fsS --retry 3 --retry-delay 10 --max-time 120 "$API_URL/api/health"`
  with `API_URL` from a repository variable. One always-on free service ≈ 744 h/month, within the 750 free hours,
  provided no other free web service runs in the same Render workspace.
- Known caveats (README): GitHub may delay/drop scheduled runs under load; scheduled workflows auto-disable after
  60 days of repo inactivity; any redeploy wipes data (do not deploy during evaluation).
- The static frontend renders a Signal-style loading screen ("Connecting…") while it polls `/api/health`, so a cold
  backend never shows a blank page.

### 2.2 Cross-origin auth

Frontend and API live on different `onrender.com` subdomains (`onrender.com` is a public suffix → different sites),
so cookies are unreliable. Each login creates a **device session**; its opaque random token (32 bytes, URL-safe) is sent as
`Authorization: Bearer <token>` and stored in `localStorage` for session persistence. Only `sha256(token)` is stored
server-side. CORS allow-list comes from `CORS_ORIGINS`.

### 2.3 Routing without SSR

Static export cannot pre-render per-conversation pages. Routes: `/` (app shell), `/onboarding/`, `/link/`.
The selected conversation lives in app state mirrored to `?c=<id>`; on mobile, opening a chat pushes a history entry
so the Android back button returns to the list. `trailingSlash: true` so Render serves `/link/index.html`.

### 2.4 Scaling limit (documented)

One uvicorn worker by design: the connection registry is in-memory. Horizontal scale would need a Redis pub/sub
fan-out and a shared DB (Postgres). Stated in README as the upgrade path.

---

## 3. Database schema (20 tables)

Conventions: integer autoincrement PKs; timestamps are UTC `DATETIME`; booleans are `INTEGER 0/1`;
all FKs `ON DELETE CASCADE` unless noted. Tables are created by SQLAlchemy `metadata.create_all()` at startup
(the DB is rebuilt on every boot, so a migration tool adds no value here — noted in README).
**Each feature's tables ship with that feature**; the README ERD reflects what shipped.

### 3.1 Identity & devices

| Table | Columns | Constraints / indexes |
|---|---|---|
| `users` | id, phone, username NULL, display_name, about NULL, avatar_path NULL, avatar_color, identity_key (base64, 32 B), last_seen_at NULL, created_at | UNIQUE(phone), UNIQUE(username) |
| `user_settings` | user_id PK→users, theme (`system`/`light`/`dark`), chat_color, read_receipts, typing_indicators, share_last_seen, notifications_enabled, notification_preview (`name_and_message`/`name_only`/`none`), default_disappearing_seconds | 1:1 with users |
| `devices` | id, user_id→users, name, token_hash, is_primary, created_at, last_active_at, revoked_at NULL | UNIQUE(token_hash), INDEX(user_id) |
| `link_requests` | id, code, poll_secret_hash, requested_device_name, status (`pending`/`approved`/`expired`), approved_by_device_id→devices NULL (SET NULL), issued_device_id→devices NULL (SET NULL), expires_at, created_at | UNIQUE(code) |

### 3.2 Social graph & privacy

| Table | Columns | Constraints |
|---|---|---|
| `contacts` | owner_id→users, contact_id→users, created_at | PK(owner_id, contact_id), CHECK(owner_id ≠ contact_id) |
| `blocks` | blocker_id→users, blocked_id→users, created_at | PK(blocker_id, blocked_id) |
| `identity_verifications` | verifier_id→users, subject_id→users, verified_key, verified_at | PK(verifier_id, subject_id) |

### 3.3 Conversations

| Table | Columns | Constraints / indexes |
|---|---|---|
| `conversations` | id, kind (`direct`/`group`), direct_key NULL, title NULL, description NULL, avatar_path NULL, created_by→users (SET NULL), disappearing_seconds (0 = off), pin_permission (`all`/`admins`), last_message_id→messages NULL (SET NULL), last_activity_at, created_at | UNIQUE(direct_key); INDEX(last_activity_at) |
| `conversation_members` | conversation_id, user_id, role (`admin`/`member`), request_state (`accepted`/`pending`), joined_at, left_at NULL, last_delivered_message_id (default 0), last_read_message_id (default 0), muted_until NULL, is_archived, is_pinned | PK(conversation_id, user_id); INDEX(user_id) |

- `direct_key = f"{min(a,b)}:{max(a,b)}"` → at most one direct chat per pair, enforced by the DB. Note to Self = `"7:7"` with one member.
- Removed/left members keep their row with `left_at` set; they retain history up to `left_at` and receive nothing after.

### 3.4 Messages & extras

| Table | Columns | Constraints / indexes |
|---|---|---|
| `messages` | id, conversation_id, sender_id→users NULL (SET NULL; NULL for system), client_id NULL, kind (`text`/`media`/`voice`/`poll`/`system`), body NULL, reply_to_id→messages NULL (SET NULL), system_event JSON NULL, created_at, edited_at NULL, deleted_at NULL, expires_at NULL | UNIQUE(sender_id, client_id); INDEX(conversation_id, id); INDEX(expires_at) |
| `message_revisions` | id, message_id, body, created_at | INDEX(message_id) |
| `hidden_messages` | user_id, message_id, hidden_at | PK(user_id, message_id) — "Delete for me" |
| `attachments` | id, message_id NULL, uploader_id→users, kind (`image`/`file`/`voice`), mime_type, size_bytes, original_name, storage_key, width NULL, height NULL, duration_ms NULL, waveform JSON NULL, position, created_at | UNIQUE(storage_key); INDEX(message_id) |
| `reactions` | message_id, user_id, emoji, created_at | PK(message_id, user_id) — one reaction per person per message |
| `pinned_messages` | conversation_id, message_id, pinned_by→users, pinned_at, expires_at NULL | PK(conversation_id, message_id) |
| `polls` | message_id PK→messages, question, allow_multiple, ended_at NULL | |
| `poll_options` | id, poll_message_id→polls, position, text | UNIQUE(poll_message_id, position) |
| `poll_votes` | option_id→poll_options, user_id→users, voted_at | PK(option_id, user_id) |

### 3.5 Organisation

| Table | Columns | Constraints |
|---|---|---|
| `chat_folders` | id, owner_id→users, name, position, include_direct, include_groups, unread_only, created_at | INDEX(owner_id) |
| `chat_folder_conversations` | folder_id, conversation_id | PK(folder_id, conversation_id) |

### 3.6 Key design decisions

1. **Receipt cursors, not per-message receipt rows.** Message IDs are globally monotonic, so each member's progress is
   `last_delivered_message_id` / `last_read_message_id`.
   - Marking read = one UPDATE (cursor only moves forward: `max(old, new)`).
   - Unread count = messages with `id > last_read_message_id AND sender_id ≠ me AND deleted_at IS NULL`, excluding hidden ones.
   - Sender's status for message *m* (over active members other than the sender, excluding members whose `request_state = pending`):
     `read` if every cursor_read ≥ m.id, else `delivered` if every cursor_delivered ≥ m.id, else `sent`.
     Groups therefore show ✓✓ only once *everyone* has it, as Signal does.
   - Message details view derives per-member Delivered/Read from the same cursors.
   - If a user disables read receipts, their read cursor is still stored (for their own unread counts) but never
     broadcast, and they stop receiving others' read receipts (Signal's reciprocity rule).
2. **Message requests.** When a direct chat is created by someone not in the recipient's `contacts`, or a user is added to a
   group by a non-contact, the recipient's `request_state = 'pending'`. While pending the server suppresses delivered/read
   receipts and typing from that recipient; the sender sees only ✓.
3. **Idempotent send.** `UNIQUE(sender_id, client_id)`: a retried POST with the same UUID returns the existing message (200) instead of inserting a duplicate.
4. **Disappearing messages.** `expires_at = created_at + conversation.disappearing_seconds` at send time.
   (Simplification: real Signal starts each recipient's timer on read — documented.) A 5 s sweeper hard-deletes expired
   messages (cascades remove reactions/attachments rows; files are unlinked) and emits `message.removed`.
5. **Blocking is silent.** Messages from blocked users are excluded from the blocker's fetches and never pushed to them; the sender sees ✓ only.
6. **Seed data is relative to boot time** so the demo always looks fresh.

---

## 4. API (REST, prefix `/api`)

Error envelope for all non-2xx: `{"error": {"code": "not_member", "message": "..."}}`.
Status codes: 400 bad input, 401 missing/invalid token, 403 forbidden (not admin, edit window passed), 404 not found
**or not a member** (avoid leaking existence), 409 conflict, 413 too large, 422 validation.
Authorization is centralised in FastAPI dependencies: `current_device`, `current_user`, `require_member(conversation_id)`, `require_admin(conversation_id)`.

| Area | Method & path | Notes |
|---|---|---|
| Health | `GET /health` | `{status:"ok"}`; used by keep-alive and loading screen |
| Auth | `POST /auth/request-otp {phone}` | Normalises to E.164; returns `{is_new_user}`. OTP is always `MOCK_OTP`. |
| | `POST /auth/verify-otp {phone, code, device_name}` | Creates user if new + device session → `{token, user, is_new_user}` |
| | `POST /auth/logout` | Revokes current device |
| Devices | `GET /devices`, `DELETE /devices/{id}` | Unlink pushes `device.revoked` to that device |
| Linking | `POST /link-requests {device_name}` (no auth) | → `{id, code, poll_secret, expires_at}`; code = 8 chars, TTL 5 min |
| | `GET /link-requests/{id}` + header `X-Poll-Secret` | → `{status}`. On the first poll after approval the server creates the device session, sets `issued_device_id`, and returns `{token, user}` — exactly once (tokens are never stored in plaintext, so they are minted at hand-over). Later polls return `{status: "approved"}` only. |
| | `POST /link-requests/approve {code}` (auth) | Marks the pending, unexpired request `approved` and records `approved_by_device_id` |
| Me | `GET /me`, `PATCH /me {display_name, about, username}`, `POST /me/avatar` (multipart), `GET/PATCH /me/settings` | Username format `name.NN` (3–32 chars + 2-digit discriminator), unique |
| People | `GET /users/lookup?q=` | **Exact** phone or username match only (no directory browsing) |
| | `GET /contacts`, `POST /contacts {phone \| username}`, `DELETE /contacts/{user_id}` | 409 if already a contact |
| | `POST /blocks/{user_id}`, `DELETE /blocks/{user_id}`, `GET /blocks` | |
| | `GET /users/{id}/safety-number` | `{digits (60), qr_payload, verified}` |
| | `POST /users/{id}/verification`, `DELETE /users/{id}/verification` | Snapshot of subject's identity key |
| Chats | `GET /conversations` | Includes my member state, unread count, last-message preview, member summary; sorted `is_pinned DESC, last_activity_at DESC` |
| | `POST /conversations/direct {user_id}` | Get-or-create via `direct_key` |
| | `POST /conversations/groups {title, member_ids, description?}` | Creator = admin; emits system message |
| | `GET /conversations/{id}`, `PATCH /conversations/{id} {title, description, disappearing_seconds, pin_permission}` | Group metadata edits are admin-only; disappearing timer editable by any member in direct chats |
| | `POST /conversations/{id}/avatar` | Group avatar (admin) |
| | `PATCH /conversations/{id}/me {muted_until, is_archived, is_pinned}` | Per-user chat state |
| | `POST /conversations/{id}/request {action: accept\|block\|delete}` | Message-request resolution |
| Members | `POST /conversations/{id}/members {user_ids}` (admin), `DELETE /conversations/{id}/members/{uid}` (admin, or self = leave), `PATCH /conversations/{id}/members/{uid} {role}` (admin) | Last admin leaving promotes the longest-standing member |
| Messages | `GET /conversations/{id}/messages?before=<id>&limit=50` | Cursor pagination, newest first; includes reactions, attachments (signed URLs), poll tallies, reply preview, my receipt-derived status |
| | `POST /conversations/{id}/messages {client_id, kind, body?, reply_to_id?, attachment_ids?, poll?}` | 201 new / 200 idempotent replay |
| | `PATCH /messages/{id} {body}` | Sender only, within `EDIT_WINDOW = 24 h`; writes `message_revisions` |
| | `DELETE /messages/{id}?scope=me\|everyone` | `everyone`: sender only, within `DELETE_FOR_EVERYONE_WINDOW = 24 h`; body/attachments cleared, tombstone kept |
| | `GET /messages/{id}/details` | Per-member sent/delivered/read (sender only) |
| | `PUT /messages/{id}/reaction {emoji}`, `DELETE /messages/{id}/reaction` | Replace semantics |
| | `POST /messages/{id}/pin {duration: 24h\|7d\|30d\|forever}`, `DELETE /messages/{id}/pin` | Max 3 per chat (oldest auto-unpinned); respects `pin_permission` |
| Polls | `PUT /polls/{message_id}/votes {option_ids}` | Replaces my votes; 1 option unless `allow_multiple`; rejected after `ended_at` |
| | `POST /polls/{message_id}/end` | Poll creator only |
| Files | `POST /attachments` (multipart) | Allow-list: jpeg/png/webp/gif, pdf, txt, zip, docx/xlsx/pptx, webm/ogg/mp4/m4a audio. Max 10 MB. Server-generated `storage_key`. |
| | `GET /files/{storage_key}?exp=&sig=` | HMAC-SHA256 signed, 1 h TTL; works in `<img>`/`<audio>` without headers |
| Search | `GET /search?q=` | `{chats, contacts, messages}`; messages via `LIKE` limited to my conversations, excluding deleted/hidden; max 20 each |
| Folders | `GET/POST /folders`, `PATCH/DELETE /folders/{id}`, `PUT /folders/order {ids}` | |

---

## 5. Real-time protocol (WebSocket `GET /api/ws`)

- First client frame must be `{"type":"auth","token":"..."}` within 5 s, else close `4401`. Revoked device → close `4403`.
- Heartbeat: client `ping` every 25 s → server `pong`. Server drops sockets silent > 60 s.
- Envelope: `{"type": string, "data": object, "ts": ISO-8601}`.

**Client → server**

| Type | Data | Behaviour |
|---|---|---|
| `typing` | `{conversation_id, state: "start"\|"stop"}` | Client throttles `start` to once / 3 s; sends `stop` on send, blur, or 5 s idle. Relayed to other members unless suppressed by settings or pending request. |
| `receipt` | `{conversation_id, kind: "delivered"\|"read", up_to_message_id}` | Advances cursor (forward only); broadcasts `receipt.updated` unless suppressed. |
| `ping` | `{}` | → `pong` |

**Server → client**

| Type | Data |
|---|---|
| `message.created` | full message DTO (also sent to the sender's other devices) |
| `message.updated` | full message DTO (edit, delete-for-everyone) |
| `message.removed` | `{conversation_id, message_ids}` (disappeared) |
| `reaction.updated` | `{conversation_id, message_id, reactions}` |
| `poll.updated` | `{conversation_id, message_id, options: [{option_id, vote_count, voter_ids}], ended_at}` |
| `pin.updated` | `{conversation_id, pins}` |
| `receipt.updated` | `{conversation_id, user_id, delivered_up_to, read_up_to}` |
| `typing` | `{conversation_id, user_id, state}` (client auto-clears after 8 s) |
| `presence` | `{user_id, online, last_seen_at}` (only to users sharing a conversation or contact, honouring `share_last_seen`) |
| `conversation.updated` | conversation DTO (title, members, timer, request state, my state) |
| `conversation.removed` | `{conversation_id}` (removed from group / request deleted) |
| `device.revoked` | `{}` → client clears token and returns to onboarding |

**Message lifecycle:** optimistic bubble with 🕓 (`sending`) → POST 201 → ✓ `sent` → recipient device receives
`message.created`, sends `receipt delivered` → ✓✓ `delivered` → recipient has chat open, tab visible, scrolled to
bottom → `receipt read` → filled ✓✓ `read`. Offline recipients send delivered receipts after reconnect when the
conversation list loads (each row carries `last_message_id`).

**Reconnect/resync:** WS reconnect with exponential backoff + jitter (1 s → 30 s cap); "Connecting…" banner while
disconnected. On reconnect: invalidate the conversation list and the open conversation's first page; flush the outbox.

**Outbox:** unsent messages persist in the Zustand store (sessionStorage-backed); retried with backoff (2 s, 4 s, 8 s, then
marked `failed`). Failed bubbles show Signal's red "!" with click-to-retry. Retries reuse the same `client_id`.

---

## 6. Feature scope

### 6.1 Must-have (brief)

1. **Onboarding:** phone entry → OTP (`123456`) → profile (display name, optional avatar, colour-initials fallback) → app. Logout; session persists via stored token. Login screen lists demo accounts with one-click fill.
2. **Chat list:** sorted by recent activity (pinned chats first), search (chats/contacts/messages), add contact by exact phone/username, unread badges, last-message preview with sender name in groups, typing shown in row, online dot / last-seen in header.
3. **1:1 messaging:** real-time send/receive, timestamps, sending/sent/delivered/read ticks, typing indicator bubble, persistence.
4. **Groups:** create (name + members), send/receive, member list with roles, add/remove members and promote/demote (admin), leave group, system messages ("Alice added Bob").
5. **Signal experience:** nav rail + list + chat pane; Signal bubbles/grouping/date separators; modals, search, filters; bottom toasts; Settings (Profile, Account, Linked devices, Appearance, Chats, Notifications, Privacy, Help) with privacy toggles that actually work.
6. **Placeholders:** Calls tab and call buttons ("Coming soon" toast), Stories tab ("Coming soon").

### 6.2 Bonus (brief) — all included

Attachments (images inline with lightbox, albums up to 10, files with icon/size); reactions (6 quick + full picker);
reply/quote (click quote scrolls to original); functional disappearing messages (Off, 30 s, 5 m, 1 h, 8 h, 1 d, 1 w, 4 w);
dark mode; responsive (desktop / tablet / mobile); keyboard shortcuts.

**Keyboard shortcuts:** `Ctrl/⌘+N` new chat · `Ctrl/⌘+F` search · `Alt+↑/↓` previous/next chat · `Esc` close modal / cancel reply ·
`↑` in empty composer edits last own message · `Ctrl/⌘+/` shortcuts guide.

### 6.3 Standouts (user-selected), in build priority order

1. **Message requests** — Accept / Block / Delete banner replaces the composer; receipts/typing suppressed until accepted; "Message requests" entry in the list.
2. **Safety numbers** — 60-digit number in 12 groups of 5 + QR code; "Mark as verified" → verified badge; "Safety number changed" system message if a key snapshot no longer matches.
   Algorithm (Signal's published numeric fingerprint, reimplemented): per party, `h = SHA512(0x0000 || key || id)`, then 5199 × `h = SHA512(h || key)`;
   take first 30 bytes → six 5-byte chunks → each `uint40 % 100000` zero-padded to 5 digits → 30 digits; concatenate the two
   halves ordered by user id → 60 digits (identical for both parties). QR payload = version + both halves.
3. **Edit & delete for everyone** — "Edited" label with revision history modal; "This message was deleted" tombstone; "Delete for me".
4. **Pinned messages** — up to 3 per chat; durations 24 h / 7 d / 30 d / forever; pinned bar at top of chat cycles through pins; admins can restrict pinning in groups.
5. **Polls** — from composer "+" menu; question + up to 10 options; single or multiple choice; live tallies; non-anonymous voter list; creator can end poll.
6. **Chat folders** — tabs above the chat list: All chats + presets (Unread, 1:1 chats, Groups) + custom folders (chat types, specific chats, unread-only); reorder and edit in Settings → Chats.
7. **Voice notes** — hold/click mic to record (MediaRecorder; `audio/webm;codecs=opus`, Safari `audio/mp4`), max 5 min, 64-bar waveform computed via Web Audio at record end; playback with scrubbing and 1×/1.5×/2×.
8. **Device linking** — new browser at `/link/` shows QR + 8-char code; signed-in device: Settings → Linked devices → "Link new device" → scan (BarcodeDetector where supported) or type code → approve; new browser polls and receives its session. Linked devices list with unlink.

### 6.4 Cross-cutting UX

Browser notifications when tab hidden (respects mute + preview setting); unread count in tab title `(3) Signal`;
encryption notice at the top of new chats; Note to Self conversation; per-chat mute/archive/pin; chat colour (Appearance).

### 6.5 Out of scope

Real end-to-end encryption, voice/video calls, stories, link previews, stickers/GIFs, message forwarding, full-text
search engine (FTS5), multi-worker scaling, real SMS, account deletion (placeholder only).

---

## 7. Frontend

- **Stack:** Next.js App Router with `output: 'export'`, TypeScript strict, Tailwind v4 over CSS custom-property tokens,
  Inter font, TanStack Query (server state) + Zustand (UI state, socket status, outbox), `qrcode.react` for QR rendering,
  an open-source icon set (Lucide) tuned to Signal's stroke weight. API types generated from FastAPI OpenAPI via `openapi-typescript`.
- **WS events update the Query cache** with `setQueryData` — one source of truth; no parallel entity store.
- **Structure:**
  ```
  frontend/src/
    app/            layout.tsx, page.tsx (app shell), onboarding/, link/
    features/
      chat-list/    ConversationList, ConversationRow, FolderTabs, MessageRequestsEntry, SearchResults
      conversation/ ConversationHeader, Timeline, Composer, ReplyPreview, PinnedBar, TypingBubble, RequestBanner
      messages/     MessageBubble, TextBody, MediaGrid, FileCard, VoiceBubble, PollBubble, SystemMessage,
                    ReactionBar, MessageActions, MessageDetailsModal, EditHistoryModal
      groups/       CreateGroupFlow, ConversationSettingsPanel, MemberList, AddMembersModal
      contacts/     NewChatPanel, AddContactModal, SafetyNumberModal
      settings/     SettingsShell + one component per section
      placeholders/ CallsTab, StoriesTab
      onboarding/   PhoneStep, OtpStep, ProfileStep, LinkDeviceScreen
    components/ui/  Avatar, Modal, Toast, ContextMenu, Switch, IconButton, SearchInput, Tabs, Tooltip
    lib/            api.ts (typed fetch), ws.ts (reconnect/heartbeat), outbox.ts, time.ts, grouping.ts, status.ts, queryKeys.ts
    styles/         tokens.css
  ```
- **Layouts:**
  - Desktop ≥ 1024 px: nav rail (Chats, Calls, Stories; Settings/avatar at bottom) | resizable chat list (300–440 px, persisted) | conversation pane. Conversation header click slides the settings panel over the conversation pane.
  - Tablet 768–1023 px: same three regions with a narrower fixed list.
  - Mobile < 768 px (Signal Android): top app bar (avatar, "Signal", search, ⋮), chat list, pencil FAB, bottom tabs (Chats, Calls, Stories); conversation full-screen with back arrow; long-press message menu; swipe-to-reply.
- **Fidelity process:**
  1. Reference board first: current Signal Desktop (light + dark) and Signal Android screenshots from official Signal sources, plus any screenshots the user provides of their own app.
  2. Extract tokens into `tokens.css` (palette, bubble colours per theme, radii, avatar sizes, type scale, spacing).
  3. Replicate behaviours: message grouping (same sender within 3 min → shared avatar/name, tightened inner corners), date separators (Today / Yesterday / weekday / date), timestamp + ticks inside bubble footer, desktop hover action bar (react, reply, more), 6-emoji quick reactions, bottom toasts, colour-initials avatars, encryption notice.
  4. After each milestone, side-by-side comparison at 1440 / 1024 / 375 px in light and dark using the built-in browser.
- **No Signal source assets** — icons, CSS, and copy are authored independently.

---

## 8. Backend structure

```
backend/app/
  main.py            app factory, CORS, lifespan (create tables, seed if empty, start sweepers)
  config.py          pydantic-settings (env vars)
  db.py              async engine, session dependency, SQLite pragmas
  models/            SQLAlchemy models, one module per aggregate (user, device, contact, conversation, message, poll, folder)
  schemas/           Pydantic request/response DTOs
  repositories/      query functions (no business rules)
  services/          business rules: auth, contacts, conversations, messages, receipts, requests, pins, polls, folders, safety_numbers, linking, files
  api/               routers per area + deps.py (current_device, require_member, require_admin)
  realtime/          connection_manager.py, ws_router.py, events.py (event builders)
  tasks/             sweepers (disappearing messages, pin expiry)
  seed/              seed.py + assets/ (avatars, sample images)
backend/tests/       pytest (httpx AsyncClient + WebSocket test client), temp SQLite per test session
```

Rule: routers stay thin (parse → call service → map DTO); services own authorization-sensitive business rules and emit
realtime events through `realtime.events`; repositories only query.

---

## 9. Seed data

8 users with phone numbers `+1 555 010 0001` … `0008` (OTP `123456`), avatars for some, colour initials for others;
contacts among them; 6 direct chats (mixed read/delivered/unread states), 3 groups ("Weekend Hike", "Family", "Project Phoenix")
with varied admins; ~200 messages with timestamps relative to boot; reactions, replies, an image album, a file,
an edited message, a deleted message, a poll, a pinned message, a chat with a disappearing timer, a pending message
request from a stranger (user 8 → user 1), Note to Self, and two custom chat folders. Seeding is idempotent:
runs only when `users` is empty; CLI `python -m app.seed --reset` rebuilds locally.

---

## 10. Testing

- **Backend (pytest, TDD for services):** auth + device token hashing; `direct_key` get-or-create; idempotent send;
  non-member → 404, non-admin → 403; receipt cursor monotonicity and status derivation; read-receipt reciprocity;
  message-request suppression of receipts/typing; disappearing sweeper; edit/delete windows; pin limit 3 and expiry;
  poll vote rules; safety-number symmetry and known-vector stability; signed URL expiry; WS auth timeout and
  multi-device fan-out.
- **Frontend (Vitest):** message grouping, date separators, tick status mapping, outbox retry/backoff, folder filtering.
- **E2E (Playwright):** two browser contexts — Alice sends, Bob receives live, Alice's ticks progress ✓ → ✓✓ → read;
  runnable against local and the deployed URL.
- **CI (`.github/workflows/ci.yml`):** pytest, Vitest, `tsc --noEmit`, `next build` on push/PR.
- **Visual QA:** per milestone at 1440 / 1024 / 375 px, light and dark.

---

## 11. Delivery plan & cut lines

| Milestone | Scope | Est. h |
|---|---|---|
| M0 | Repo, scaffolds, `render.yaml`, keep-alive + CI workflows, `/api/health`, loading screen — **deployed** | 1.5 |
| M1 | Backend core: models for core tables, auth/devices, contacts, conversations, messages, WS hub, receipts/typing/presence, seed | 3 |
| M2 | Frontend core: tokens + layouts, onboarding, chat list, conversation, groups/admin, settings + toasts, dark mode | 4 |
| **Cut line 1** | All must-haves complete and deployed | |
| M3 | Bonus: attachments, reactions, reply/quote, disappearing, shortcuts, responsive polish | 4 |
| **Cut line 2** | All bonus complete | |
| M4 | Message requests, safety numbers, edit/delete for everyone | 4 |
| **Cut line 3** | | |
| M5 | Pinned messages, polls, chat folders | 5 |
| **Cut line 4** | | |
| M6 | Voice notes, device linking | 4.5 |
| M7 (protected) | README (setup, stack, architecture, mermaid ERD, API overview, assumptions), final visual pass | 1.5 |

Total ≈ 27.5 h of nominal effort against ~18–20 h of wall clock; parallel subagent execution closes part of the gap.
Features beyond the reached cut line are dropped cleanly (their tables never land). M7 is never cut.

---

## 12. Risks

| Risk | Mitigation |
|---|---|
| Free-tier spin-down / data loss | GitHub Actions keep-alive; re-seed on boot; loading screen; README caveat; no deploys during evaluation |
| GitHub schedule drift | 5-min cadence gives ≥2 chances per 15-min window; manual `workflow_dispatch` |
| SQLite write contention | WAL + `busy_timeout`; single worker; short transactions |
| Cross-origin issues | Bearer tokens (no cookies), explicit CORS allow-list, WS auth in first frame |
| Voice/camera browser support | HTTPS on Render; codec detection; QR fallback to typed code |
| Time overrun | Strict priority order with cut lines; deploy at every milestone |
| Plagiarism rule | No Signal source/assets; safety numbers reimplemented from the public algorithm description |
| Repo creation | `gh` CLI is not installed — user creates the public GitHub repo (or installs `gh`) before first push |
