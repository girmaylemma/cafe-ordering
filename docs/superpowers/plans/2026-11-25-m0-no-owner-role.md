# M0: No Owner Role Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the café owner role: existing owners become managers, managers manage waiters only, and only the developer (installer tools now, developer console in M4) creates managers.

**Architecture:** One additive migration converts owner rows; the TypeScript role type drops `owner` so the compiler finds every use; permission checks (`canManage`, `findAdmin`, void approval, any-table) narrow to `manager`. The installer route creates a café with its first manager, and a new installer route adds managers (the developer's interim tool until M4). The dashboard and the tablet app drop `owner` from their role lists.

**Tech Stack:** TypeScript (Cloudflare Workers, Durable Objects, vitest in workerd), React + Vite (vitest + Testing Library), Flutter (flutter_test).

**Spec:** `docs/superpowers/specs/2026-11-25-management-in-app-design.md` (sections 5.0, 6 D-97, 7 M0)

## Global Constraints

- Schema changes are NEW migrations appended to `server/src/cafe/migrations.ts`; never edit a shipped one (D-60). The `role` CHECK keeps allowing `'owner'` (cannot be narrowed in place); code never writes it.
- Never hard-delete staff: owners are converted, not removed. PINs, emails, sessions and history stay.
- Manager PINs are exactly 6 digits; waiter PINs 4–6 (`isValidPin`, unchanged).
- Every admin write is audited (`audit(...)`), as today.
- No new dependency.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Commit on the feature branch after tests pass; never push without the user's OK.
- Server tests: `node node_modules/vitest/vitest.mjs run --maxWorkers=2` in `server/` (parallel runs can flake at workerd start-up; rerun with `--maxWorkers=1`). Typecheck: `npm run typecheck`.
- Dashboard: `npx vitest run` and `npm run typecheck` in `admin/`. App: `flutter test` and `flutter analyze` in `apps/tablet/`.

## Review Focus

- An existing café upgraded to migration 8: the former owner signs in on the tablet and in the dashboard exactly as before, now as a manager (Task 1 test "migration 8 turns owners into managers, keeping PIN and email").
- A manager tries to deactivate or reset the PIN of another manager through the API: 403 FORBIDDEN, nothing changes (Task 1 test).
- A request to create staff with `role: "owner"`: 400 INVALID_INPUT, nothing created (Task 1 test).
- An installer call with the old body (`ownerName`, `ownerEmail`, `ownerPin`): 400 INVALID_REQUEST, no café created — never a café without a manager (Task 1 test).
- The former owner, now a manager, still approves voids and opens any table on the tablet (D-57, D-92): the existing void and managerTables tests, switched from owner to manager, stay green (Task 1, Task 4).

---

### Task 1: Server — roles, migration 8, installer creates the first manager

**Files:**
- Modify: `server/src/cafe/migrations.ts` (append migration 8)
- Modify: `server/src/cafe/auth.ts` (`StaffRole`, `ALL_ROLES`, `APPROVER_ROLES`, `isManagerHere`, comments)
- Modify: `server/src/cafe/admin.ts` (`AdminActor.role`, `findAdmin`, `canManage`)
- Modify: `server/src/cafe/CafeDO.ts` (`isRole`, `createStaff` role check, `bootstrapVenue`, new `installerAddManager`, comments)
- Modify: `server/src/cafe/connection.ts` (comments only)
- Modify: `server/src/admin/routes.ts` (`handleInstaller` body fields; new add-manager route)
- Modify: `server/src/index.ts` (route `POST /installer/venues/:venueId/managers` to `handleInstaller`; header comment)
- Modify: `server/test/adminHelpers.ts`, `server/test/helpers.ts`, and every server test that uses owners (admin, menu, adminVenue, options, lines, voids, managerTables, connection, tickets, language, auth, access, worker, crypto)
- Test: `server/test/admin.test.ts`, `server/test/migrations.test.ts`

**Interfaces:**
- Produces:
  - `type StaffRole = "waiter" | "manager"` (auth.ts)
  - `type AdminActor = { id; venue_id; name; role: "manager"; email }` (admin.ts)
  - `canManage(actorRole: "manager", targetRole: StaffRole): boolean` → `targetRole === "waiter"`
  - Installer: `POST /installer/venues` body `{ name, managerName, managerEmail, managerPin }` → `201 { venueId, manager: { id } }`
  - Installer: `POST /installer/venues/:venueId/managers` body `{ name, email, pin }` (Bearer `INSTALLER_SECRET`) → `201 { manager: { id } }`; unknown venue → 404 `NOT_FOUND`; bad input → 400 `INVALID_REQUEST`; email taken → 409 `EMAIL_TAKEN`
  - `CafeDO.bootstrapVenue(input: { venueId; name; manager: { id; name; email; pin } }): Promise<AdminResult>`
  - `CafeDO.installerAddManager(input: { name: unknown; email: unknown; pin: unknown }): Promise<AdminResult<{ manager: { id: string } }>>` — audited as `staff.created` with the actor `{ kind: "installer" }` (builder's call on the exact actor shape; it must not be a café person)
  - Test helpers: `newCafe(name?)` → `{ venueId, manager: { id }, managerEmail }`; `cafeWithManager()` → adds a second manager through the installer route → `{ ...newCafe, otherManagerEmail, otherManagerId }`

- [ ] **Step 1: Write the failing tests** in `server/test/admin.test.ts` (new `describe("no owner role (M0, D-97)")`) and `server/test/migrations.test.ts`:

```ts
it("the installer creates a café with its first manager, who can use the dashboard", async () => {
  const { managerEmail } = await newCafe();
  const me = await json<{ user: { role: string } }>(await admin("GET", "/admin/api/me", managerEmail));
  expect(me.user.role).toBe("manager");
});
it("the old installer body (ownerName/ownerEmail/ownerPin) is refused; no café is created", async () => {
  const response = await call("POST", "/installer/venues", { headers: INSTALLER_HEADERS, body: { name: "X", ownerName: "A", ownerEmail: "a@example.com", ownerPin: "123456" } });
  expect(response.status).toBe(400);
  expect(await json(response)).toEqual({ error: "INVALID_REQUEST" });
});
it("the installer adds a manager to an existing café; a wrong secret or unknown café is refused", async () => {
  // 201 with manager.id; the new manager's GET /admin/api/me role is "manager";
  // wrong Bearer -> 401; venue "v-doesnotexist" -> 404 NOT_FOUND
});
it("a manager creates waiters only: role manager or owner is refused", async () => {
  // POST /admin/api/staff role "manager" -> 403 FORBIDDEN; role "owner" -> 400 INVALID_INPUT; role "waiter" -> 201
});
it("a manager cannot deactivate or reset the PIN of another manager", async () => {
  const { managerEmail, otherManagerId } = await cafeWithManager();
  expect((await admin("POST", `/admin/api/staff/${otherManagerId}/deactivate`, managerEmail, {})).status).toBe(403);
  expect((await admin("POST", `/admin/api/staff/${otherManagerId}/pin`, managerEmail, { pin: "111111" })).status).toBe(403);
});
```

In `migrations.test.ts`:

```ts
it("migration 8 turns owners into managers, keeping PIN and email", async () => {
  // fresh café; INSERT a staff row with role 'owner', a pin_hash and an email;
  // run CAFE_MIGRATIONS version 8's statements; SELECT role, pin_hash, email -> role 'manager', same pin_hash and email
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node node_modules/vitest/vitest.mjs run test/admin.test.ts test/migrations.test.ts`
Expected: the new tests FAIL (installer still wants `ownerName`; managers may create managers; no migration 8).

- [ ] **Step 3: Implement**
  - Migration 8: `{ version: 8, description: "no owner role: owners become managers (M0, D-97)", statements: ["UPDATE staff SET role = 'manager' WHERE role = 'owner'"] }`.
  - Drop `"owner"` from `StaffRole`, `ALL_ROLES`, `APPROVER_ROLES`, `AdminActor.role`, `isRole`, the `createStaff` role list, and the SQL `role IN ('manager', 'owner')` in `findAdmin` and `isManagerHere` (now `role = 'manager'`). Let `npm run typecheck` find the rest.
  - `canManage` → `targetRole === "waiter"` (comment: managers manage waiters; managers are created and reset by the developer, D-97).
  - `bootstrapVenue` creates the first staff member with `role: "manager"` from `input.manager`.
  - `handleInstaller`: read `managerName`, `managerEmail`, `managerPin`; respond `{ venueId, manager: { id } }`. Add the add-manager route (same Bearer check), calling `installerAddManager` on the venue's DO; it returns NOT_FOUND when the DO has no venue row.
  - Rewrite every comment that says "manager or owner" / "owner" for these code paths.
  - "A café keeps at least one active manager" (spec 5.0) needs no new code in M0: managers cannot
    deactivate managers (`canManage`) and nobody deactivates themselves (existing check). The explicit
    last-manager check comes with M4, when the developer can deactivate managers.

- [ ] **Step 4: Update the test helpers and every server test that used owners** to the helper interface above (`ownerEmail` → `managerEmail`, `owner.id` → `manager.id`; tests of owner-only powers become manager/waiter tests; the existing "a manager can create waiters and managers, but not owners" test is replaced by the Step 1 test; "nobody can deactivate themselves" stays, as a manager).

- [ ] **Step 5: Run the full suite and typecheck**

Run: `node node_modules/vitest/vitest.mjs run --maxWorkers=2` then `npm run typecheck`
Expected: all test files pass; `tsc --noEmit` prints nothing. `grep -rn "owner" src` finds only `schema.ts` (frozen) and migration 1/8 text.

- [ ] **Step 6: Commit**

```bash
git add server/src server/test
git commit -m "feat(server): no owner role; owners become managers, managers manage waiters (M0, D-97)"
```

### Task 2: Installer scripts and the phone-test setup

**Files:**
- Modify: `server/scripts/new-cafe.mjs` (flags `--manager-name`, `--manager-email`; prompt "First manager's 6-digit PIN"; body fields from Task 1)
- Create: `server/scripts/new-manager.mjs` (flags `--api`, `--venue`, `--name`, `--email`; prompts the 6-digit PIN; `POST /installer/venues/:venueId/managers` with `INSTALLER_SECRET`)
- Modify: `server/package.json` (`"new-manager": "node scripts/new-manager.mjs"`)
- Modify: `server/scripts/dev-phone-test.mjs` (create "Dev Cafe" with first manager `Dev Manager`, email `dev-owner@example.com` kept so the dashboard dev login still works; add Meron through the new installer route, not `POST /admin/api/staff`; Hana and Abel stay waiters via the admin API)
- Modify: `server/scripts/dev-access-vars.mjs` (comment only, if it says owner)

**Interfaces:**
- Consumes: the two installer routes from Task 1.

- [ ] **Step 1: Syntax check** — Run: `node --check scripts/new-cafe.mjs; node --check scripts/new-manager.mjs; node --check scripts/dev-phone-test.mjs` → no output.
- [ ] **Step 2: Real run against a local server** — with `npx wrangler dev` running in `server/`, run `node scripts/dev-phone-test.mjs` twice. Expected both times: "✓ Staff: Hana (waiter, PIN 1234), Abel (waiter, PIN 5678), Meron (manager, PIN 246810)" and a pairing code; the second run adds nobody new.
- [ ] **Step 3: Commit**

```bash
git add server/scripts server/package.json
git commit -m "chore(server): installer scripts create managers, not owners (M0)"
```

### Task 3: Dashboard — no owner

**Files:**
- Modify: `admin/src/types.ts` (`Role = "waiter" | "manager"`; `canManage(actorRole, targetRole)` → `targetRole === "waiter"`)
- Modify: `admin/src/texts.ts` (`roleLabel` without owner)
- Modify: `admin/src/pages/StaffPage.tsx` (new staff are always waiters: no role select, the PIN rule is "4–6 digits"; Reset PIN / Deactivate only on waiters)
- Modify: `admin/src/pages/SettingsPage.tsx` (comment only)
- Modify: `admin/test/fakeServer.ts` (remove `OWNER_ME`; `MANAGER_ME` is the default signed-in user) and every dashboard test using `OWNER_ME`
- Test: `admin/test/staff.test.tsx`

- [ ] **Step 1: Write the failing tests** in `staff.test.tsx`:

```tsx
it("M0: a manager adds waiters only (no role choice) and gets actions on waiters only", async () => {
  // render as MANAGER_ME with STAFF (two managers, two waiters)
  // expect(screen.queryByLabelText("Role")).toBeNull()
  // within(row("Meseret")) and within(row("Abebe")) (managers): no "Reset PIN", no "Deactivate"
  // within(row("Hana")): "Reset PIN" and "Deactivate" present
  // submitting the form sends { name, role: "waiter", pin, email: null }
});
```

- [ ] **Step 2: Run** `npx vitest run test/staff.test.tsx` → the new test FAILS (Role select exists).
- [ ] **Step 3: Implement** the changes listed under Files; replace `OWNER_ME` uses with `MANAGER_ME`.
- [ ] **Step 4: Run** `npx vitest run` and `npm run typecheck` → all pass, no type errors.
- [ ] **Step 5: Commit**

```bash
git add admin
git commit -m "feat(admin): no owner role; managers add and manage waiters only (M0)"
```

### Task 4: Tablet app — manager is the only higher role

**Files:**
- Modify: `apps/tablet/lib/ui/floor_map_screen.dart` (`_anyTableRoles = {'manager'}`, comment)
- Modify: `apps/tablet/lib/ui/table_screen.dart` (`_approverRoles = {'manager'}`)
- Modify: `apps/tablet/lib/sync/commands.dart` (comment only)
- Modify: `apps/tablet/test/floor_map_test.dart` (the "manager or owner opens another waiter's table" case becomes manager only)

- [ ] **Step 1: Update the test** — the floor-map case that uses an `owner` user now uses `manager`; add the assertion that a user with role `'owner'` (stale data) is treated like a waiter: tapping Hana's table shows the "belongs to Hana" message.
- [ ] **Step 2: Run** `flutter test test/floor_map_test.dart` → the stale-`owner` assertion FAILS.
- [ ] **Step 3: Implement** the role sets above.
- [ ] **Step 4: Run** `flutter test` and `flutter analyze` → all pass, "No issues found!".
- [ ] **Step 5: Commit**

```bash
git add apps/tablet
git commit -m "feat(app): manager is the only higher role (M0)"
```

### Task 5: Docs

**Files:**
- Modify: `docs/decisions.md` (append D-96 and D-97 rows exactly as decided in the spec's section 6; D-12 note "amended by M1")
- Modify: `CLAUDE.md` ("The owner and manager get sales reports" → "Managers get sales reports"; `new-cafe` command flags `--manager-name`, `--manager-email`; add `npm run new-manager -- --api <url> --venue <venueId> --name "<name>" --email <email>`; admin local-dev step 2 flags)
- Modify: `docs/design.md` (one line under the roles section: "D-97: no café owner role; the developer creates managers." — the rest of design.md is historical)
- Modify: `docs/phone-test.md` (any "owner" wording in the setup output)

- [ ] **Step 1: Check** `grep -n -i "owner" CLAUDE.md docs/phone-test.md` → only historical or intended mentions remain.
- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md docs
git commit -m "docs: no owner role (D-96, D-97), installer commands for managers (M0)"
```
