# MASTER BUILD PROMPT — Event Agent

> Paste this whole document as the opening brief for the build agent (Claude Code / Cowork).
> Sections marked **[DECIDE]** need an answer before that part is built.

---

## 0. What we are building

A web app that helps a user find and apply to Luma events, tracks whether they were accepted, and helps them write a LinkedIn post about what they built there.

**The architectural insight that makes this possible** (this is the whole product, do not deviate from it):

- Luma has **no attendee-side API and no attendee OAuth**. Its public API is host/calendar-scoped only.
- **Writing** (applying to an event) is done by submitting the event's public registration form with the user's own real name and email. No login, no session, no stored credentials.
- **Reading** (did I get accepted?) is done via the user's personal Luma iCal feed, which Luma itself issues for exactly this purpose — third-party calendar consumption:
  ```
  https://api.luma.com/ics/get?entity=user&id=icssk-XXXXXXXX
  ```
  The user copies this from their Luma calendar-sync settings and pastes it into our onboarding. If an event appears in that feed, they were accepted.

**We never store Luma passwords, session cookies, or browser state.** If any proposed implementation requires them, it is the wrong implementation — stop and flag it.

---

## 1. Hard constraints (do not "solve around" these)

| Constraint | Consequence for the build |
|---|---|
| LinkedIn OIDC returns only `sub`, name, email, picture | Profile data must be **user-supplied**, not scraped |
| `r_member_social` (reading member posts) is restricted | Past-post examples must be **pasted by the user** |
| Luma has no attendee API | Registration = public form submission only |
| Luma ToS: access only via "publicly supported interfaces" | Human-paced, low volume, user-initiated only. No bulk. No scraping the discover page at scale. |
| Paid / ticketed events divert into Stripe | **Detect and skip.** Never attempt payment. Surface as "manual — paid event" |
| Events with custom registration questions | Detect unknown required fields → **do not guess**, surface to user for manual completion |
| The ICS URL is an unscoped read bearer token | Encrypt at rest. Treat as a credential. |

---

## 2. Tech stack

- **Frontend:** Next.js (App Router) + TypeScript + Tailwind
- **Backend:** Next.js route handlers, or FastAPI if the agent layer is Python-heavy
- **DB:** Postgres (Supabase or Neon)
- **Secrets:** AWS Secrets Manager or KMS envelope encryption. Never plaintext in DB.
- **Calendar target:** **[DECIDE]** — which calendar system are we writing user events into? Options: (a) Google Calendar API with per-user OAuth, (b) our own DB as the calendar and just render it, (c) generate a per-user outbound `.ics` feed. Recommendation: **(b) + (c)** — store events ourselves, expose an outbound ICS feed per user so they can subscribe from any client. Avoids a second OAuth integration.
- **Agent calls:** Anthropic API for Agents 1 and 2. Agent 3 is **manual copy/paste** (see §7).

---

## 3. Data model

```
users
  id                    uuid pk
  linkedin_sub          text unique not null   -- identity anchor, never email
  display_name          text
  email                 text                    -- used for Luma registration
  created_at            timestamptz

user_profiles                                   -- output of Agent 1
  user_id               uuid fk
  skills                text[]
  tech_stack            text[]
  interests             text[]
  seniority             text
  raw_source            text                    -- pasted CV / profile text
  writing_samples       jsonb                   -- 3-5 past LinkedIn posts, user-pasted
  updated_at            timestamptz

luma_connections
  user_id               uuid fk unique
  ics_url_encrypted     bytea not null
  ics_url_last_ok_at    timestamptz
  status                enum(active, unreachable, revoked)

events
  id                    uuid pk
  luma_url              text
  luma_slug             text
  title, description    text
  starts_at, ends_at    timestamptz
  location, is_online   text/bool
  is_paid               bool
  requires_approval     bool
  discovered_at         timestamptz

applications
  id                    uuid pk
  user_id               uuid fk
  event_id              uuid fk
  status                enum(...)  -- see §6
  applied_at            timestamptz
  confirmed_at          timestamptz
  idempotency_key       text unique  -- (user_id, event_id) hash; prevents double-apply
  failure_reason        text
  unique (user_id, event_id)

posts
  id                    uuid pk
  application_id        uuid fk
  what_i_built          text        -- user's description of their project
  generated_prompt      text        -- what we told them to copy
  pasted_response       text        -- what the agent gave back
  final_text            text
  created_at            timestamptz

audit_log
  user_id, action, target, payload_hash, actor (user|agent), created_at
```

---

## 4. Authentication — Sign in with LinkedIn

Use **OIDC only**. Request scopes: `openid profile email`.

**Do NOT request `w_member_social` in v1.** We are not publishing to LinkedIn yet — the user copies the post text manually. Adding a write scope inflates the consent screen and hurts sign-up conversion. Add it later, in its own flow, only when auto-publish ships.

Flow:
1. `GET https://www.linkedin.com/oauth/v2/authorization` with `response_type=code`, `client_id`, `redirect_uri` (exact, no wildcards), `state` (CSRF), `scope=openid profile email`
2. `POST https://www.linkedin.com/oauth/v2/accessToken` to exchange the code
3. `GET https://api.linkedin.com/v2/userinfo` → take **`sub`** as the identity anchor
   - Do **not** call `/v2/me` — it requires the sunset `r_liteprofile` and returns 403
   - Do **not** key users on email; it's mutable

Access tokens last 60 days with **no refresh token** on the self-serve tier. Since we only use LinkedIn for sign-in, this is fine — don't build refresh machinery. Just re-auth on expiry.

Prerequisite: LinkedIn Developer app associated with a Company Page, verified by a Page admin, with **Sign In with LinkedIn using OpenID Connect** added under Products.

---

## 5. Onboarding flow

Single page, four steps, progress indicator.

**Step 1 — Sign in with LinkedIn.** Prefill name and email from OIDC. Both editable — the LinkedIn email may not be the one they use for Luma.

**Step 2 — Confirm registration identity.**
- `Full name` (as it should appear on guest lists)
- `Email` (the address Luma registrations will use)
- Copy: *"We'll use this to register you for events. It goes to event hosts exactly as typed."*

**Step 3 — Connect Luma calendar.**
- Button: **"Get my Luma sync link"** → opens `https://luma.com/settings` (calendar sync section) in a new tab
- Inline instructions with a screenshot placeholder
- Paste field, validated against: `^https://api\.luma\.com/ics/get\?entity=user&id=icssk-[A-Za-z0-9_-]+$`
- On paste: **fetch it immediately**, parse as iCal, show a live preview of the events found. Do not accept a link we couldn't parse.
- Warning copy: *"This link lets us read your Luma calendar. Keep it private — you can reset it in Luma at any time."*

**Step 4 — Build profile (Agent 1 input).**

During registration / profile setup, the user **must** select:

1. **Location(s)** for events they want — available options only:
   - London
   - Amsterdam
   - Barcelona
   - Berlin
   - Copenhagen
2. **Interest(s)** for events — available options only:
   - Tech
   - AI
   - Crypto
   - Food & Drinks
   - Arts & Culture
3. **Skill(s)** — examples (extendable list):
   - Software developer
   - AI analyst
   - Agentic software
   - Full-stack engineer
   - Product designer
   - Data scientist
   - Growth / marketing
   - Founder
   - Community builder
   - Researcher

**UI for these three categories:**
- Each category is shown on its own **floating page** (one panel at a time; advance with Continue).
- Options are **rounded buttons** (pill / rounded-full style). Selected state is visually distinct.
- Multi-select allowed within each category (at least one required per category).

Also collect:
- Textarea **or file upload**: CV / LinkedIn profile text (**optional**). Accept PDF, DOCX, DOC, ODT, TXT, MD, RTF, HTML, and other text-based files; extract text server-side into `raw_source`. When provided, Agent 1 enriches the profile; location/interest/skill chips alone are enough to finish onboarding.
- Textarea: **paste 3–5 of your recent LinkedIn posts** (used as voice reference by Agent 3). Explain plainly why: *"So generated drafts sound like you, not like an AI."*

---

## 6. Application status model

**Critical correction: we do not have a "rejected" signal.** Absence from the ICS feed means *not confirmed*, which could be pending, rejected, or a host who never actioned it. Never tell the user they were rejected.

```
DRAFT        -- queued by Agent 2, awaiting user approval
APPLIED      -- form submitted successfully
CONFIRMED    -- event now appears in the user's ICS feed
UNCONFIRMED  -- event date passed, never appeared in feed
FAILED       -- submission errored
MANUAL       -- paid / custom questions / captcha → user must do it themselves
```

### Sync job
Runs every 30 minutes per active user:
1. Fetch the user's ICS URL
2. Parse VEVENTs; match against `applications` by event UID / title+start-time fuzzy match
3. `APPLIED` → `CONFIRMED` on first appearance; set `confirmed_at`
4. `APPLIED` → `UNCONFIRMED` once `ends_at < now()` and never seen
5. On repeated fetch failure, set `luma_connections.status = 'unreachable'` and prompt re-paste. Never silently keep failing.

### ⚠️ Validate this assumption first — before writing any other code
**Does a *pending* (approval-required) registration appear in the ICS feed, or only an approved one?** The entire status model depends on the answer being "only approved."

Write a throwaway script that:
1. Registers a test email for an approval-required event
2. Polls the ICS feed before and after the host approves

If pending registrations *do* appear in the feed, the CONFIRMED signal is worthless and we need a different approach (likely parsing Luma confirmation emails instead). **Do not build the dashboard until this is answered.**

---

## 7. The three agents

### Agent 1 — Profile Builder
- **Input:** onboarding selections + pasted CV/profile text
- **Output:** structured JSON — `skills[]`, `tech_stack[]`, `interests[]`, `seniority`, `event_preferences[]`
- **Runs:** once at onboarding, re-runnable from settings
- **Note:** this is a pure LLM extraction task over user-supplied text. It has no LinkedIn API dependency.

### Agent 2 — Event Applier
- **Input:** user profile + a candidate event
- **Responsibilities:**
  1. Score event relevance against the profile; only surface matches above threshold
  2. **Present matches to the user for approval.** Applications are user-approved, never autonomous. One-click "Apply" per event, or "Apply to selected."
  3. On approval, submit the public registration form with name + email
  4. Detect and route to `MANUAL`: paid events, unknown required fields, captcha, login walls
  5. Enforce idempotency on `(user_id, event_id)` before every submission
- **Rate discipline:** human-paced. Max ~1 application per minute per user, hard cap per day. Randomised delay. This is both courtesy and self-preservation.
- **Never:** attempt payment, invent answers to registration questions, or apply without an approval record in `audit_log`.

### Agent 3 — Post Writer (manual relay, no API cost)
Runs as a copy/paste loop, deliberately:

1. User opens a `CONFIRMED` event on the dashboard
2. Textarea: **"What did you build / do at this event?"**
3. Button: **"Copy prompt for your agent"** — assembles and copies:
   - event title, description, date, host
   - the user's `what_i_built` text
   - their `skills` / `tech_stack` from the profile
   - their `writing_samples` as voice reference
   - explicit instruction: *match the voice of the samples; first person; no hashtag spam; no em-dashes; return post text only*
4. User pastes into their own agent, gets a response
5. Second textarea: **"Paste your agent's response"** → saved as `pasted_response`
6. Editable preview → **Copy to clipboard** → user posts to LinkedIn themselves

**Design note:** keep the human in the loop here permanently. The user's professional reputation is on the line; an unreviewed AI post under their real name is a liability we don't need.

---

## 8. Dashboard

- **Cards or table**, filterable by status, sorted by event date
- Status pill colours: CONFIRMED green, APPLIED amber, UNCONFIRMED grey, MANUAL blue, FAILED red
- Empty state that actually explains the next action
- Per-event detail view: event metadata, application timeline, post-generation panel (§7)
- Settings: re-paste ICS link, re-run Agent 1, **export my data**, **delete my account**

---

## 9. Security & compliance requirements

These are requirements, not suggestions.

- **Encrypt the ICS URL at rest** with a per-user KMS data key. Never a shared key.
- **Never log the ICS URL** — not in application logs, not in error traces, not in Sentry breadcrumbs. Add a redaction filter.
- **Tenant isolation at the data layer.** Every query scoped by `user_id` at the repository level, not per-handler. A missing `WHERE user_id = ?` here registers the wrong person for an event.
- **Audit log every agent action** — user-visible, exportable.
- **Disconnect flow:** deleting our stored ICS URL is enough (it's read-only and user-resettable), but tell the user to reset the link in Luma too for a clean break.
- **UK GDPR:** we are a data controller. Ship a privacy notice at signup covering: what we store, why, retention period, sub-processors (hosting, LLM provider). Build export + delete before launch, not after.
- **Consent copy must be plain.** "We'll register you for events using your name and email" — not buried in terms.
- **Never store other people's data.** We handle only the signed-in user's information.
- **Do not send user data to an LLM provider without disclosing it** in the privacy notice.

---

## 10. Build sequence

1. **Validate the ICS assumption** (§6). Nothing else starts until this is answered.
2. LinkedIn OIDC sign-in + session + users table
3. Onboarding steps 2–4, ICS paste + live parse preview
4. ICS sync job + status state machine
5. Dashboard read-only (manually seeded applications)
6. Agent 1 (profile extraction)
7. Agent 2 — **approval UI first, submission second**
8. Agent 3 copy/paste relay
9. Audit log, export, delete
10. Privacy notice, consent copy, security review

---

## 11. Open decisions

- **[DECIDE]** Calendar target (§2) — recommend own-DB + outbound ICS feed
- Event discovery: scrape Luma public city + topic feeds for the user's selected locations/interests (`luma.com/london`, `…/ai`, etc.) and show the closest 10 matching upcoming events. No search bar on `/events`.
- **[DECIDE]** Hosting region — UK/EU preferred given GDPR posture
- Deferred: `w_member_social` auto-publishing, once the manual loop is proven

---

## 12. Instructions to the build agent

- Ask before inventing anything marked **[DECIDE]**.
- If a requirement seems to need a stored Luma session, cookie, or password — **stop and flag it**. That is out of scope by design.
- Prefer boring, readable code over clever abstractions. This is a portfolio project as well as a product.
- Write the `WHERE user_id` isolation and the audit log from the first commit, not as a later pass.
- Every external call gets a timeout, a retry with backoff, and a redacted error path.
