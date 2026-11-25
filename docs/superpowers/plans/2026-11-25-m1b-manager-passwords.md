# M1b: Manager Passwords — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Managers have a password (for the app's management screens in M2): stored only as a keyed hash, with its own lockout, set and changed by the manager on the dashboard's Settings page until the developer console exists (M4).

**Architecture:** A new HMAC purpose `"password"` in `server/src/auth/crypto.ts` (same method as PINs, a separate derived key; decided: option A, keyed hash — the free plan's ~10 ms CPU cannot fit strong PBKDF2, measured ~170 ms at 100,000 iterations). Migration 10 adds the password columns. `PUT /admin/api/me/password` sets or changes the signed-in manager's own password; `GET /admin/api/me` says whether one is set. The dashboard's Settings page gets a "Your password" form.

**Tech Stack:** TypeScript (Workers, Durable Objects, vitest in workerd), React + Vite (vitest + Testing Library).

**Spec:** `docs/superpowers/specs/2026-11-25-management-in-app-design.md` (section 5.1, password half)

## Global Constraints

- Passwords are never stored, logged, audited or returned in plain text. Stored: `password_salt` (16 random bytes, like PINs) + `password_hash` = hex HMAC with the key derived for purpose `"password"`.
- Password rule: 10 to 128 characters (counted as Unicode code points); nothing else (no symbol rules). The new password must differ from the current one (`SAME_PASSWORD`).
- Lockout: 5 wrong passwords = 5 minutes (`MAX_PIN_ATTEMPTS`, `LOCKOUT_MS` values), on its OWN counter (`failed_password_attempts`, `password_locked_until`): wrong passwords never lock PIN sign-in, and wrong PINs never lock the password. A lock is audited (`auth.password_locked`).
- Managers only: waiters have no password (`findAdmin` already admits only active managers).
- Schema changes as a NEW migration (D-60). No new dependency.
- Every change is audited (`auth.password_set` the first time, `auth.password_changed` after), never with the password.
- Commit on the feature branch after tests pass; never push without the user's OK. Trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Server: `node node_modules/vitest/vitest.mjs run --maxWorkers=2`, `npm run typecheck` in `server/`. Dashboard: `npx vitest run`, `npm run typecheck` in `admin/`.

## Review Focus

- A manager with a password set types the wrong current password five times: the password locks for 5 minutes, but they can still sign in on a tablet with their PIN (separate counters) (Task 1 test).
- A password of 9 characters, 129 characters, or the same as the current one is refused, and nothing changes (Task 1 test).
- Changing a password while one exists without sending the current one is refused (`INVALID_CREDENTIALS`), so a stolen dashboard session alone cannot replace it (Task 1 test).
- A password with non-ASCII letters (e.g. Amharic "ሰላምሰላምሰላም1") is accepted and counted by characters, not bytes (Task 1 test).
- The dashboard never keeps a password on screen after a save or a refusal (Task 2 test).

---

### Task 1: Server — password hash, storage, lockout, set/change own

**Files:**
- Modify: `server/src/auth/crypto.ts` (`KeyPurpose` gains `"password"`; `passwordHash(serverSecret, salt, password)`)
- Modify: `server/src/cafe/migrations.ts` (migration 10)
- Create: `server/src/cafe/passwords.ts` (`isValidPassword`, `checkPassword`, `setOwnPassword`)
- Modify: `server/src/cafe/CafeDO.ts` (`adminMe` adds `hasPassword`; new `adminSetOwnPassword`)
- Modify: `server/src/admin/routes.ts` (`PUT /me/password`; `api()` method list in the route map unchanged otherwise)
- Modify: `server/src/admin/access.ts` or the CSRF check only if `PUT` is not yet treated as a write (it must need Origin + JSON like POST/PATCH)
- Test: `server/test/passwords.test.ts` (new), `server/test/crypto.test.ts`

**Interfaces:**
- Produces:
  - `passwordHash(serverSecret: string, salt: string, password: string): Promise<string>` — differs from `pinHash` for the same inputs.
  - Migration 10: `ALTER TABLE staff ADD COLUMN password_salt TEXT`, `password_hash TEXT`, `failed_password_attempts INTEGER NOT NULL DEFAULT 0`, `password_locked_until INTEGER`.
  - `isValidPassword(password: string): boolean` (10–128 code points)
  - `checkPassword(sql, p: { venueId; userId; computedHash: string | null; now }): { ok: true } | { ok: false; error: "INVALID" } | { ok: false; error: "LOCKED"; retryAfterMs }` — the lockout logic of `checkPin`, on the password columns.
  - `GET /admin/api/me` → `user` gains `hasPassword: boolean`.
  - `PUT /admin/api/me/password` body `{ currentPassword?: string, newPassword: string }` → `200 { ok: true }`; `400 INVALID_PASSWORD` (rule), `400 SAME_PASSWORD`, `401`-class `INVALID_CREDENTIALS` mapped to HTTP 403 in the admin status map (wrong or missing current password when one is set), `423 LOCKED` + `retryAfterMs`.
  - Audit: `auth.password_set` (first), `auth.password_changed`, `auth.password_locked`.

- [ ] **Step 1: Failing tests** in `passwords.test.ts` through the admin API (`admin`, `newCafe`) and `crypto.test.ts`:
  - `passwordHash` ≠ `pinHash` for the same salt and text; same inputs → same hash.
  - a new manager has `hasPassword: false`; setting a first password (no current needed) → 200, `hasPassword: true`, audit `auth.password_set`, and the audit JSON does not contain the password.
  - changing needs the current one: missing → `INVALID_CREDENTIALS`; wrong → `INVALID_CREDENTIALS`; right → 200 and `auth.password_changed`.
  - rule: 9 characters → `INVALID_PASSWORD`; 129 → `INVALID_PASSWORD`; "ሰላምሰላምሰላም1" (10 code points, more bytes) → 200; same as current → `SAME_PASSWORD`.
  - lockout: 5 wrong current passwords → `423 LOCKED` with `retryAfterMs`; the right one is still refused while locked; audit `auth.password_locked`; meanwhile the manager signs in on a tablet with the PIN (200).
  - a non-JSON PUT is refused like other dashboard writes (415).
- [ ] **Step 2: Run** `node node_modules/vitest/vitest.mjs run test/passwords.test.ts test/crypto.test.ts` → the new tests FAIL.
- [ ] **Step 3: Implement** the Interfaces. Hash first, then one synchronous step for check + write (D-37), as `changePin` does.
- [ ] **Step 4: Run** the full suite and typecheck → pass.
- [ ] **Step 5: Commit** `feat(server): manager passwords: keyed hash, own lockout, set/change own (M1b)`

### Task 2: Dashboard — "Your password" on the Settings page

**Files:**
- Modify: `admin/src/types.ts` (`Me.user.hasPassword?: boolean`)
- Modify: `admin/src/texts.ts` (messages for `INVALID_PASSWORD`, `SAME_PASSWORD`, `INVALID_CREDENTIALS`, `LOCKED`)
- Modify: `admin/src/pages/SettingsPage.tsx` (a second card "Your password", using `me`)
- Modify: `admin/test/fakeServer.ts` (`MANAGER_ME.user.hasPassword: false`)
- Test: `admin/test/settings.test.tsx`

**Copy (English, the dashboard stays English):** heading "Your password"; hint "At least 10 characters. You will use it to open the management screens in the app."; labels "Current password" (only when one is set), "New password", "New password again"; button "Save password"; success "Your password is saved."; mismatch "The two passwords are not the same."

- [ ] **Step 1: Failing tests:**
  - without a password: no "Current password" field; Save sends `PUT /me/password { newPassword }` only; success shows "Your password is saved." and every field is empty.
  - with a password (`hasPassword: true`): "Current password" is shown and sent as `currentPassword`.
  - the two new passwords differ → mismatch message, no request.
  - "Save password" is disabled until the new password has 10+ characters.
  - a refusal (`INVALID_CREDENTIALS`) shows the message and clears all three fields.
- [ ] **Step 2: Run** `npx vitest run test/settings.test.tsx` → FAIL. **Step 3: Implement.** **Step 4: Run** `npx vitest run`, `npm run typecheck` → pass. **Step 5: Commit** `feat(admin): set or change your own password on the Settings page (M1b)`

### Task 3: Docs

**Files:**
- Modify: `docs/decisions.md` (D-99: passwords as built — option A keyed hash and why (free-plan CPU, measured), the separate lockout, set/change own in the dashboard until M4, no temporary passwords until the developer sets them in M4; D-12's note points to D-99)
- Modify: `docs/superpowers/specs/2026-11-25-management-in-app-design.md` (5.1: "Storage" says the decision; the temporary-password column moves to M4, when the developer first sets passwords)

- [ ] **Step 1: Check** `grep -c "^| D-99 " docs/decisions.md` → 1. **Step 2: Commit** `docs: manager passwords (D-99) (M1b)`
