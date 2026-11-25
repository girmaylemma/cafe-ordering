# Management in the app, and a developer console (M0–M5)

Status: design for approval (2026-11-25). Changes a locked decision (see "Decisions").

## 1. Intent

The developer of this project wants **one app for everyone, with roles**, like a core banking system:
everyone uses the same system and sees what their role allows. Going back and forth between the
tablet app and a browser dashboard is tiring for a café manager.

Three roles, no café owner (decided: "the owner role has too much bureaucracy"):

```
Developer      creates cafés and their managers; can do everything in every café (browser console)
  └─ Manager   creates waiters; manages menu, tables, settings, tablets (in the app)
       └─ Waiter  takes orders (in the app)
```

Accounts come from the level above: the developer creates a café and its managers; managers create
waiters. Nobody can give more power than they have. Every person gets a temporary first PIN (and,
for managers, a temporary first password), changes it at first sign-in, and can change it later.
A forgotten one is reset by the level above (a manager's by the developer).

## 2. Goals, non-goals, anti-goals

**Goals**
- Managers do all café management in the app, in the four app languages.
- Waiters' sign-in stays as fast as today (tap name + PIN).
- The developer can do everything in every café from one browser console, and every such action
  is visible to the café as "Developer (support)".
- No new security weakness: the powerful screens get a stronger lock than ordering.

**Non-goals**
- Per-person permissions (tick boxes). All managers have the same powers (decided).
- Managers using the browser (decided: browser is for the developer only, after M5).
- A café owner role (decided: removed; existing owners become managers, M0).
- Email or SMS password reset (staff often have no email; the level above resets).
- Translating the developer console (stays English).

**Anti-goals (a failure even if it works)**
- Ordering gets slower, or a waiter's sign-in gets more steps.
- A waiter who has seen a manager's PIN can change prices or staff.
- The developer's login is as weak as a café login (one stolen developer login would expose every café).
- Managers are ever left without a way to do something (the browser is closed to them last, M5).

## 3. Constraints

- Locked decisions in `CLAUDE.md` still hold, except the one changed here (D-96).
- Speed is the #1 requirement: nothing in this design touches the ordering path or the WebSocket.
- Cloudflare free plan. **Verify:** the CPU time a Worker/Durable Object request may use on the free
  plan. A deliberately slow password hash (e.g. high-iteration PBKDF2) may not fit; see 5.1.
- No new dependency without asking (WebCrypto is built into Workers; nothing to add).
- Schema changes are new migrations only (D-60). Never hard-delete (deactivate).
- Every write is audited; staff actions go to the audit log with who did them.
- App texts in all four ARB files (`am`, `en`, `om`, `ti`); Oromo and Tigrinya are drafts for review (D-94).

## 4. Approaches (decided: 1)

1. **Native Flutter management screens + a new app admin API** (chosen). New screens behind a
   "Management" entry; new `/app/admin/*` routes that call the **same café methods** the dashboard
   uses (`adminCreateStaff`, `adminSetVenueLanguage`, ...), so permissions, input checks and audit
   are reused. Same look as the app, four languages, fast. Costs the most building (screens + ~100
   texts × 4 languages).
2. Open the React dashboard inside the app (web view). Quickest, but English only, looks different,
   slower on mid-range tablets (the design rejected web views for this), and bridging the Cloudflare
   Access sign-in into the app is risky.
3. Management as WebSocket messages. Fits "tablet commands go over the WebSocket", but that rule is
   for fast order traffic; management needs list downloads (REST's job) and would load the ordering
   channel. REST is already allowed for dashboard work.

## 5. The design

### 5.0 No owner role (M0)

- **Migration 8**: every `owner` becomes a `manager` (`UPDATE staff SET role = 'manager' WHERE role = 'owner'`).
  Nothing is deleted; PINs, emails, sessions and history stay. The column's CHECK still allows
  'owner' (it cannot be narrowed in place, D-60); the code never creates one again.
- **Who manages whom** (`canManage`): a manager manages **waiters only** (create, deactivate, reset
  PIN). Managers are created, deactivated and reset **only by the developer**. Today a manager can
  also create managers; that changes (and its test).
- **A café keeps at least one active manager**, and nobody deactivates themselves (today's "last
  owner" protection, moved to managers).
- The installer (`npm run new-cafe`, later the developer console) creates a café with its **first
  manager** (today: its owner).
- Everything that said "manager or owner" means "manager" (the app's any-table rule D-92, void
  approval, dashboard access until M5). Sales reports in Telegram go to managers.
- **Consequence (accepted):** adding or resetting a manager needs the developer.

### 5.1 Credentials (M1)

- **PIN** (everyone, unchanged rules: waiters 4–6 digits, managers exactly 6). Signs in to the
  app and approves voids, as today.
- **Password** (managers only): unlocks the management screens. At least 10 characters
  (builder's call on the exact rule; no "must contain a symbol" rules, length matters most).
- **Temporary first credentials.** When someone creates or resets a person, the PIN (and password)
  they type is temporary: the server marks it "must change". At the next sign-in the app shows a
  "choose your own PIN" screen before anything else; the session can do nothing but that until it
  is done. The same for the password, the first time management is unlocked.
- **Change your own** PIN or password at any time (in the app: type the current one, then the new one twice).
- **Reset by the level above:** manager → waiters; developer → anyone. A reset is always temporary again.
- **Storage (decided, D-99):** a keyed hash with the server secret (`SERVER_SECRET`, its own derived
  key "password") and a per-person salt, so a stolen database alone is not enough to guess passwords.
  No slow hash: measured ~170 ms for PBKDF2 at 100,000 iterations, far over the free plan's ~10 ms CPU.
  Never stored or logged in plain text; never sent back by the API.
- **Lockout:** 5 wrong passwords = 5 minutes, like PINs, but a **separate counter**: wrong passwords
  lock management only, never the person's ordering. Audited (`auth.password_locked`); the Telegram
  alert comes with the bot, like PIN lockouts.
- New columns (as built): migration 9 `pin_must_change` (M1a); migration 10 `password_salt`,
  `password_hash`, `failed_password_attempts`, `password_locked_until` (M1b). Existing staff keep their
  PINs (not "must change"); existing managers have no password until they set one. A temporary
  password (`password_must_change`) comes with M4, when the developer first sets passwords for others.
- **Until the developer console exists (M4)** (Claude's call): the current browser dashboard gets a
  "set your password" action, so a manager (already verified by Cloudflare Access there) can set
  their own first password. After M4 the developer sets temporary ones; after M5 only the app and
  the developer console remain.
- Void approval with a manager's PIN is unchanged.

### 5.2 Management unlock (M2)

- On a **waiter-type device** (the ones staff sign in on), a signed-in manager sees a
  **Management** entry. Waiters never see it, and the server refuses them anyway.
- Opening it asks for the **password**. The server answers with a **management token**: random,
  only its hash stored, bound to that PIN session and device, valid **15 minutes**, ended by
  sign-out, by deactivating the person, or by revoking the device.
- Every `/app/admin/*` request carries three things: the **device token**, the **PIN session**, and
  the **management token**. All three must be valid and belong together, and the person must still be
  an active manager. Then the request calls the same café admin methods as the dashboard.
- **Online only:** management needs a connection (it reads and writes the server directly). Offline,
  the screens say so; nothing is queued.
- **Speed:** the management screens are separate routes loaded on demand; nothing is added to the
  ordering screens, the local database, or the WebSocket.

### 5.3 Management screens (M2: Staff; M3: the rest)

The same features as today's dashboard pages, in the app and in four languages:
Staff (add, deactivate, reset PIN/password, see language), Tablets (add, pairing code, revoke),
Menu and prices (categories, items, sold-out is still the kitchen's), Options, Tables, Settings
(café language). All managers have the same powers; on the Staff screen they manage waiters only. Each write shows the server's answer; a refused write says why.

### 5.4 Developer console (M4)

- The existing browser dashboard becomes the **developer console**. Sign-in stays Cloudflare Access
  (email + one-time code), and the server allows only the developer's email (a setting, e.g.
  `DEVELOPER_EMAILS` in `wrangler.jsonc` vars; not a secret).
- **All cafés:** a list of cafés (the Directory gains a list: id, name, created; cafés created before
  this are added by a one-off step), **create a café and its first manager** (what `npm run new-cafe`
  does today; the manager's PIN and password are temporary), and **open any café** to use every page there.
- **Super power:** the developer may do everything a manager may, plus create, deactivate and reset managers.
- **Audit:** every developer action is logged in that café as **"Developer (support)"** with the
  developer's email, never as a café person.
- The café's client contract should say the developer has this access (already an open question in `decisions.md`).

### 5.5 Close the browser to managers (M5)

Once M2–M3 are in use, the dashboard admits only the developer's email. Managers' emails
stop working there (they keep everything in the app). Their emails stay stored (they may be useful
for the Telegram bot), but no longer grant dashboard access.

## 6. Decisions

- **D-96 (changes a locked decision):** "Admin dashboard: React + Vite, behind Cloudflare Access"
  becomes: managers manage the café **in the app** (password-unlocked management screens);
  the browser dashboard, still React behind Cloudflare Access, is the **developer console** only.
  `CLAUDE.md` is updated in M5 when it becomes true.
- **D-97:** no café owner role. Existing owners become managers (M0); only the developer creates,
  deactivates and resets managers; managers manage waiters only. `CLAUDE.md` ("the owner and manager
  get sales reports") is updated in M0.
- **D-12 (amended):** "we store no passwords" was about the dashboard. Managers now have a
  password, stored only as a keyed (and if possible slow) hash.
- All managers have the same powers (no per-person permissions).
- Waiters sign in as today; "username" = the name they tap, "password" = their PIN.

## 7. Delivery (each its own PR, tests first, CI green)

0. **M0** No owner role: migration 8, `canManage` (managers manage waiters only), last-manager
   protection, installer creates a first manager, app and dashboard role lists, `CLAUDE.md`.
1. **M1** Credentials: temporary first PIN/password, change your own, reset by the level above,
   password storage and lockout. App: the "choose your own PIN" screen.
2. **M2** Management unlock + the Staff screen in the app (proves the whole path).
3. **M3** Tablets, Menu, Options, Tables, Settings screens in the app.
4. **M4** Developer console: developer-only login, café list, create café + first manager, open any café,
   developer audit. (Independent of M2–M3; can move earlier.)
5. **M5** Close the dashboard to managers; update `CLAUDE.md` and D-96.

## 8. Left to the builder

- The exact password rule (minimum length is decided: 10), whether PBKDF2 fits the CPU limit and
  with how many iterations, and the response codes for "must change" (`PIN_CHANGE_REQUIRED`,
  `PASSWORD_CHANGE_REQUIRED`).
- The route list under `/app/admin/*` (mirror the dashboard's `/admin/api/*` routes).
- How the Directory's café list is filled for cafés created before M4.
- Screen layout of the management screens (follow the app's existing look; 48 dp touch targets).
- The audit actor shape for the developer (e.g. `{ kind: "developer", email }`).

## 9. Risks

- **Translation volume:** ~100 new texts × 4 languages; Oromo and Tigrinya stay drafts until reviewed.
- **Developer login is the most valuable target:** keep it on Access with one-time codes, never shared.
- **Free-plan CPU:** a slow password hash may not fit; the keyed hash with `SERVER_SECRET` is the
  fallback, so a database leak alone is not enough (the secret must also leak).
- **The developer is the only way to add or reset a manager:** fine for a few cafés; more work as
  they grow, and a café cannot change managers while the developer is unreachable (accepted).
- **Managers on personal phones:** a lost phone is handled by revoking the device (ends every session
  and management token on it), as today.
