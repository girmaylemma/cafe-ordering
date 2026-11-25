# M1a: Temporary First PIN and Change Your Own PIN — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A PIN set by someone else (a new person, or a reset) is temporary: at the next sign-in the person must choose their own before doing anything else. Anyone can change their own PIN at any time from the app.

**Architecture:** A new `staff.pin_must_change` flag (migration 9). Staff created or reset through the dashboard or the installer get it; sign-in reports it; a session whose person must still change their PIN is refused by the WebSocket and `GET /lines` (`PIN_CHANGE_REQUIRED`). A new `POST /auth/pin/change` (device token + PIN session + current PIN + new PIN) sets the new PIN and clears the flag. The app shows a "Choose your own PIN" screen after such a sign-in, before the floor map, and offers "Change my PIN" on the floor map.

**Tech Stack:** TypeScript (Workers, Durable Objects, vitest in workerd), Flutter (Riverpod, flutter_test).

**Spec:** `docs/superpowers/specs/2026-11-25-management-in-app-design.md` (section 5.1, the PIN half; M1b covers the password half)

## Global Constraints

- Schema changes are NEW migrations appended to `server/src/cafe/migrations.ts` (D-60). Existing staff keep their PINs and are NOT marked temporary.
- PIN rules unchanged: waiters 4–6 digits, managers exactly 6 (`isValidPin`). PINs are checked only by the server; stored only as `pinHash` (keyed HMAC with a per-person salt).
- The current-PIN check in the change route uses `checkPin` so it shares the person's lockout (5 wrong = 5 minutes, D-58).
- Every PIN change is audited (`auth.pin_changed`), never with the PIN.
- App texts go into all four ARB files (`en`, `am`, `om`, `ti`); Oromo/Tigrinya are drafts and are added to `docs/translation-review-om-ti.md` (regenerate it from the ARB files).
- Speed: no change to ordering; the change-PIN call is the only new network call, and only when someone changes a PIN.
- Commit on the feature branch after tests pass; never push without the user's OK. Trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Server: `node node_modules/vitest/vitest.mjs run --maxWorkers=2` and `npm run typecheck` in `server/`. App: `flutter test`, `flutter analyze` in `apps/tablet/`. Dashboard: `npx vitest run`, `npm run typecheck` in `admin/`.

## Review Focus

- A person with a temporary PIN signs in and closes the app before choosing: next start shows the PIN screen again (the session is not saved), and the temporary PIN still works once (Task 3 test).
- A waiter types a wrong current PIN five times in "Change my PIN": they are locked out of signing in too (one shared counter), and the lock is audited (Task 1 test).
- A new PIN equal to the current one is refused (`SAME_PIN`), so "choose your own" cannot keep the one the manager knows (Task 1 test).
- A person whose PIN was reset while they are signed in elsewhere: their open session stops working at once (WebSocket and `/lines` refuse `PIN_CHANGE_REQUIRED`), they sign in again and choose (Task 1 test).
- Void approval with a typed manager PIN that is still temporary keeps working (approval is not a session); covered by the existing void tests staying green.

---

### Task 1: Server — temporary PINs, the change route, sessions refused until changed

**Files:**
- Modify: `server/src/cafe/migrations.ts` (migration 9)
- Modify: `server/src/cafe/auth.ts` (`SignInResult` gains `mustChangePin`; `findLiveSession` returns `pinMustChange`; new `changeOwnPin`)
- Modify: `server/src/cafe/CafeDO.ts` (`createStaff` gains `temporaryPin: boolean`; `adminCreateStaff`, `installerAddManager`, `bootstrapVenue` pass `true`; `adminResetPin` sets the flag; `#authenticate` and `tabletLines` refuse must-change sessions; new `changePin` RPC)
- Modify: `server/src/index.ts` (`POST /auth/pin/change`; sign-in response includes `mustChangePin`)
- Test: `server/test/temporaryPin.test.ts` (new)

**Interfaces:**
- Produces:
  - Migration 9: `ALTER TABLE staff ADD COLUMN pin_must_change INTEGER NOT NULL DEFAULT 0 CHECK (pin_must_change IN (0, 1))`
  - `POST /auth/pin` 200 body gains `mustChangePin: boolean`
  - `POST /auth/pin/change`: headers `Authorization: Bearer <device token>`, `X-Staff-Session: <session>`; body `{ currentPin: string, newPin: string }` → `200 { ok: true }`; errors: `401 INVALID_CREDENTIALS` (wrong current PIN), `423 LOCKED` + `retryAfterMs`, `400 INVALID_PIN` (rule), `400 SAME_PIN`, `401 SESSION_ENDED` (no live session), `401 UNAUTHORIZED_DEVICE`
  - WebSocket upgrade and `GET /lines` with a must-change session → `401 { error: "PIN_CHANGE_REQUIRED" }`
  - `CafeDO.changePin(input: { deviceToken: string; sessionToken: string; currentPin: string; newPin: string })`
  - Audit event `auth.pin_changed` (actor: the person; details `{ deviceId, wasTemporary }`)

- [ ] **Step 1: Write the failing tests** in `server/test/temporaryPin.test.ts`, through the public routes (`call` from `adminHelpers`), with a waiter created by a manager in the dashboard and a paired waiter tablet (as `language.test.ts` pairs one):
  - "a waiter created in the dashboard must choose their own PIN at first sign-in" → sign-in 200 with `mustChangePin: true`
  - "until then the session is refused: GET /lines and the WebSocket answer PIN_CHANGE_REQUIRED"
  - "the change route sets the new PIN: the old one stops working, the new one signs in without mustChangePin, and the session works"
  - "a wrong current PIN is refused and counts toward the shared lockout: 5 wrong → LOCKED, and sign-in is locked too; an auth.locked event exists"
  - "the new PIN must follow the rules and differ from the current one" → `INVALID_PIN` for "12", `SAME_PIN` for the same
  - "a PIN reset in the dashboard is temporary again, and ends the person's open session's access until they choose"
  - "existing staff (before migration 9) are not temporary" → a staff row inserted without the column value signs in with `mustChangePin: false`
  - "every change is audited without the PIN" → `auth.pin_changed` with `wasTemporary`, and no event JSON contains the new PIN
- [ ] **Step 2: Run** `node node_modules/vitest/vitest.mjs run test/temporaryPin.test.ts` → all FAIL (no flag, no route).
- [ ] **Step 3: Implement** the Interfaces above. `changeOwnPin` checks the current PIN with `checkPin` (same lockout), refuses a same PIN by comparing the new PIN's hash with the stored salt, then stores a fresh salt + hash and clears `pin_must_change`. DO test helpers (`ensureStaff`) keep `temporaryPin: false`, so existing tests do not change.
- [ ] **Step 4: Run** the full suite and typecheck → all pass.
- [ ] **Step 5: Commit** `feat(server): temporary first PIN; change your own PIN (M1a)`

### Task 2: App — the API and auth state

**Files:**
- Modify: `apps/tablet/lib/api/api_client.dart` (`SessionResult.mustChangePin`; `changePin(deviceToken, sessionToken, currentPin, newPin)`)
- Modify: `apps/tablet/lib/auth/auth_controller.dart` (new state `MustChangePin(device, user, sessionToken, temporaryPin)`; `signIn` goes there when `mustChangePin`, WITHOUT saving the session; `choosePin(newPin)` calls the API, then saves the session and becomes `SignedIn`; `changeMyPin(currentPin, newPin)` for a signed-in person)
- Test: `apps/tablet/test/auth_controller_test.dart`, `apps/tablet/test/api_client_test.dart`

**Interfaces:**
- Consumes: Task 1's routes and errors.
- Produces: `class MustChangePin extends AuthState { final DeviceInfo device; final StaffMember user; }` (the session token and the typed temporary PIN stay private in the controller); `Future<void> choosePin(String newPin)`; `Future<String?> changeMyPin(String currentPin, String newPin)` (null = done, else the error code).

- [ ] **Step 1: Failing tests:** sign-in with `mustChangePin: true` → state `MustChangePin` and `store.loadSession()` is null; `choosePin` sends `{currentPin: <temporary>, newPin}` with the session header, then state `SignedIn` and the session is saved; `choosePin` refused (`SAME_PIN`) → stays `MustChangePin` with the error; a rebuilt controller (app restart) in that case is `NeedsSignIn`; `changeMyPin` passes errors through (`INVALID_CREDENTIALS`, `LOCKED`).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `flutter test` → pass. **Step 5: Commit** `feat(app): auth state for a temporary PIN; change my PIN (M1a)`

### Task 3: App — the "Choose your own PIN" screen and "Change my PIN"

**Files:**
- Create: `apps/tablet/lib/ui/choose_pin_screen.dart` (two PIN fields: new, new again; rule hint by role; Save)
- Modify: `apps/tablet/lib/app.dart` (`MustChangePin` → `ChoosePinScreen`)
- Modify: `apps/tablet/lib/ui/floor_map_screen.dart` (app bar menu entry "Change my PIN" → a dialog: current PIN, new PIN, new again)
- Modify: `apps/tablet/lib/l10n/app_en.arb`, `app_am.arb`, `app_om.arb`, `app_ti.arb`; `docs/translation-review-om-ti.md` (regenerate)
- Test: `apps/tablet/test/choose_pin_test.dart` (new), `apps/tablet/test/floor_map_test.dart`

**Texts (keys; English given, the other three drafted):** `pinChooseTitle` "Choose your own PIN", `pinChooseHelp` "Your PIN was set by someone else. Choose one only you know.", `pinNew` "New PIN", `pinNewAgain` "New PIN again", `pinRuleWaiter` "4 to 6 digits", `pinRuleManager` "Exactly 6 digits", `pinMismatch` "The two PINs are not the same.", `pinSave` "Save", `pinCurrent` "Current PIN", `floorChangePin` "Change my PIN", `pinChanged` "Your PIN was changed.", `errorSamePin` "Choose a PIN different from the one you were given.", `errorPinChangeRequired` "Choose your own PIN first."

- [ ] **Step 1: Failing tests:**
  - `MustChangePin` state → the screen shows; Save is disabled until both fields follow the role rule and match; a mismatch shows `pinMismatch` without calling the server; Save calls `choosePin`; a `SAME_PIN` answer shows `errorSamePin` and clears both fields.
  - Floor map: the menu has "Change my PIN"; the dialog sends current + new; success shows `pinChanged`; a wrong current PIN shows `errorInvalidCredentials`.
  - Every screen in four languages: `no_literals_test` and `arb_parity_test` stay green.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `flutter test` and `flutter analyze` → pass, "No issues found!". **Step 5: Commit** `feat(app): choose your own PIN screen; change my PIN (M1a)`

### Task 4: Dashboard wording and docs

**Files:**
- Modify: `admin/src/pages/StaffPage.tsx` (the new-staff hint and the Reset PIN prompt say the PIN is temporary: "They choose their own at their next sign-in.")
- Modify: `docs/decisions.md` (D-98: temporary PINs as built: who gets them, refused sessions, the session not saved before choosing, `SAME_PIN`)
- Modify: `docs/phone-test.md` (a short "first sign-in" check: add a waiter in the dashboard, sign in with that PIN, choose your own)
- Test: `admin/test/staff.test.tsx`

- [ ] **Step 1: Failing test:** after "Add staff member", the success notice says the PIN is temporary. **Step 2: Run** → FAIL. **Step 3: Implement** wording and docs. **Step 4: Run** `npx vitest run`, `npm run typecheck` → pass. **Step 5: Commit** `docs: temporary PINs (D-98); dashboard says the PIN is temporary (M1a)`
