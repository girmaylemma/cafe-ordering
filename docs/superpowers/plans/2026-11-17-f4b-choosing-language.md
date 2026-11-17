# F4b: Choosing the language (waiter's own, kitchen tablet's, café default) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A waiter taps **አማ / EN** and the whole app (screens, dish names, alerts, notification) switches at once; the choice follows the waiter to any phone; a kitchen tablet has its own choice; everyone else gets the café's language.

**Architecture:** Server: migration 6 adds `venue.language` ('en' default) and `staff.language` (NULL = café's); `/staff` and sign-in return them; a new live WebSocket message `staff.language` sets the caller's own choice. App: three values in the local key-value table (café language, kitchen choice, per-waiter choice with a "to send" flag), one pure `resolveLanguage(...)` function, and `appLocaleProvider` (already used by `CafeApp`) now computed from them. Alerts and the notification read the same locale.

**Tech Stack:** Cloudflare Worker + Durable Object (TypeScript, vitest in workerd), Flutter, Riverpod, drift. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-17-f4-amharic-english-design.md` (sections 5.1, 5.2, 5.4, 6; step 2 of section 7). F4a: `docs/superpowers/plans/2026-11-17-f4a-language-foundation.md`, D-90.

## Global Constraints

- Supported languages: `'am'`, `'en'`. Anything else is refused by the server and never stored.
- Resolution order (spec 5.1, verbatim):
  - Waiter tablet, signed in: `staff.language ?? café language ?? 'en'`
  - Waiter tablet, PIN screen: `café language ?? 'en'` (last downloaded; nobody signed in)
  - Kitchen/bar tablet: `tablet setting ?? café language ?? 'en'`
  - Unpaired tablet (pairing): `'en'`
- Switching is instant and local; **no network call blocks it** (speed rule). The server is told live; offline, the choice is kept "to send" and sent after the next reconnect (`synced`).
- `staff.language` is a WebSocket write with an idempotency key (locked decision: tablet writes go over the WebSocket), only from a signed-in staff connection, only for the connection's own user. Not audited (D-90 spec 5.2).
- Schema changes only as a NEW migration 6 appended to `server/src/cafe/migrations.ts` (D-60).
- The dashboard (café language setting) is F4c, not here. Until then every café is 'en' unless set in the database.
- Commit on the feature branch after tests pass; CI must be green before merge.

## Review Focus

1. **Two waiters, one phone:** Hana (Amharic) signs out, Abel (no choice) signs in → Abel sees the café language, not Hana's — Task 3.
2. **Offline switch, then sign-out before reconnecting:** the choice is still "to send"; when Hana signs in again on this phone, her local choice wins over the server's older value, and it is sent after connecting — Task 4.
3. **A kitchen tablet sends `staff.language`** → refused (NOT_ALLOWED_FOR_CONNECTION), nothing stored — Task 1.
4. **An unknown language** (`'fr'`, `''`, a number) → INVALID_MESSAGE, nothing stored — Task 1.
5. **Café language changes while a tablet runs:** picked up at the next `/staff` download (start or reconnect), and the PIN screen follows — Task 2/3.

---

## File Structure

| File | Responsibility |
|---|---|
| `server/src/cafe/migrations.ts` | migration 6: `venue.language`, `staff.language` |
| `server/src/cafe/language.ts` (new) | `setStaffLanguage(sql, venueId, userId, language)`, `isLanguage(value)` |
| `server/src/cafe/protocol.ts` | parse `staff.language` |
| `server/src/cafe/CafeDO.ts` | route the message; `/staff` + sign-in return languages |
| `server/src/cafe/auth.ts` | sign-in `user.language` |
| `server/src/index.ts` | `GET /staff` → `{ staff, language }` |
| `server/test/language.test.ts` (new) | server tests |
| `apps/tablet/lib/api/api_client.dart` | `StaffMember.language`, `staff()` returns `StaffDownload` |
| `apps/tablet/lib/data/database.dart` | key-value helpers for the three languages |
| `apps/tablet/lib/l10n/language.dart` (new) | `resolveLanguage(...)` (pure), `appLocaleProvider` (moved here from l10n.dart), `languageTexts(lang)` |
| `apps/tablet/lib/ui/language_button.dart` (new) | the አማ / EN button |
| `apps/tablet/lib/session/work_session.dart` | `setMyLanguage`, resend on `synced`, store café language on refresh |
| `apps/tablet/lib/auth/auth_controller.dart` | store café language from the PIN screen's `/staff`; keep the waiter's choice at sign-in |
| `apps/tablet/lib/ui/floor_map_screen.dart`, `kitchen_screen.dart` | the button |
| `apps/tablet/lib/ui/order_screen.dart`, `sold_out_screen.dart`, `table_screen.dart` | category / option-group / "Not added" names via `primaryName` (F4a review) |
| `docs/decisions.md`, `docs/phone-test.md` | D-91; how to try Amharic on the phone |

---

### Task 1: Server — languages stored, returned, and set by the waiter

**Files:** Create `server/src/cafe/language.ts`, `server/test/language.test.ts`. Modify `migrations.ts`, `protocol.ts`, `CafeDO.ts`, `auth.ts`, `index.ts`.

**Interfaces:**
- Produces:
  - Migration 6: `ALTER TABLE venue ADD COLUMN language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('am','en'))`; `ALTER TABLE staff ADD COLUMN language TEXT CHECK (language IN ('am','en'))`.
  - `type Language = 'am' | 'en'`; `isLanguage(v: unknown): v is Language`.
  - Client message `{ type: "staff.language"; idempotencyKey: string; language: Language | null }` (null = follow the café).
  - Result `{ ok: true; language: Language | null }` (ack), stored under the key (idempotent).
  - `CafeDO.listStaff` → `{ ok: true; staff: Array<{id, name, role, language: Language | null}>; language: Language }`; `GET /staff` → `{ staff, language }`.
  - Sign-in `user` gains `language: Language | null` (`POST /auth/pin` passes it through).

- [ ] **Step 1: Write the failing tests** in `server/test/language.test.ts`:
  - `'a new café speaks English and nobody has chosen'`: after setup, `listStaff` → `language: 'en'` and every staff `language: null`.
  - `'a waiter sets their own language over the WebSocket'`: signed-in hana sends `{type: 'staff.language', idempotencyKey: k, language: 'am'}` → ack `{ok: true, language: 'am'}`; `listStaff` shows hana `'am'`; signing in again returns `user.language: 'am'`.
  - `'null goes back to the café language'`: set `'am'` then `null` → stored NULL.
  - `'the same key twice: one change, two identical acks'`.
  - `'only the sender's own language changes'`: abel's row stays null after hana's message.
  - `'a kitchen tablet cannot set a language'`: station connection → `{type: 'error', error: 'NOT_ALLOWED_FOR_CONNECTION'}`, nothing stored.
  - `'an unknown language is refused'`: `'fr'`, `''`, `5`, missing field → `INVALID_MESSAGE`.
  - `'migration 6 keeps existing cafés English'`: a database at version 5 with a staff row migrates to `venue.language = 'en'`, `staff.language = NULL` (use the existing migration test helpers).
  - `'GET /staff returns the café language'` (public route, as in `tickets.test.ts`'s route tests).
- [ ] **Step 2: Run** `cd server; npx vitest run test/language.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement**: migration 6; `language.ts`; parse in `protocol.ts` (`case "staff.language"`, `isLanguage(language) || language === null`); route in `toRunnable` for `actor.kind === "staff"` with key `idempotencyKey`, fingerprint `{message, actor}`; `listStaff` and sign-in select the columns; route passes `language`.
- [ ] **Step 4: Run** `npm test` and `npm run typecheck` — Expected: PASS (all files ran), no type errors.
- [ ] **Step 5: Commit** `feat(server): café and personal languages (F4b)`.

---

### Task 2: App — languages downloaded and kept on the tablet

**Files:** Modify `lib/api/api_client.dart`, `lib/data/database.dart`, `lib/session/work_session.dart`, `lib/auth/auth_controller.dart`, `lib/auth/credentials.dart` (SignedInUser JSON already carries StaffMember). Test: `test/api_client_test.dart`, `test/database_test.dart`, `test/work_session_test.dart`, `test/auth_controller_test.dart`.

**Interfaces:**
- Produces:
  - `StaffMember({..., String? language})`, JSON key `language` (missing → null; old saved sessions still load).
  - `class StaffDownload { final List<StaffMember> staff; final String? language; }`; `ApiClient.staff(token) → Future<StaffDownload>` (server without `language` → null).
  - Database: `Stream<String?> watchCafeLanguage()`, `Future<void> setCafeLanguage(String)`; `Stream<String?> watchKitchenLanguage()`, `Future<void> setKitchenLanguage(String)`; `Stream<({String? language, bool pending})> watchMyLanguage(String userId)`, `Future<void> setMyLanguage(String userId, String? language, {required bool pending})`, `Future<List<(String userId, String? language)>> pendingLanguages()`. Keys in `key_values`: `cafe_language`, `kitchen_language`, `my_language:<userId>`, `my_language_pending:<userId>`.
- Consumes: Task 1's JSON shapes.

- [ ] **Step 1: Write the failing tests**:
  - api: `'staff() returns the café language and each person's'`; `'an older server without languages gives null'`.
  - db: round trips for the three values; `setMyLanguage(.., pending: true)` then `pendingLanguages()` lists it; `pending: false` clears it.
  - work session: `'refresh stores the café language'` (fake `/staff` with `language: 'am'` → `watchCafeLanguage().first == 'am'`).
  - auth: `'the PIN screen's staff download stores the café language'`; `'sign-in keeps the server's language for this waiter'` (`user.language 'am'` → `watchMyLanguage('hana')` = `('am', false)`); `'sign-in does not overwrite a choice still to send'` (local `('en', pending: true)`, server says `'am'` → stays `('en', true)`) — Review Focus 2.
- [ ] **Step 2: Run** the four test files — Expected: FAIL (missing members).
- [ ] **Step 3: Implement** the members above; `WorkSession.refresh` and `AuthController.staff()` call `setCafeLanguage` when the download has one; `AuthController.signIn` calls `setMyLanguage(user.id, user.language, pending: false)` unless that user has a pending choice. Callers of `staff()` use `.staff`.
- [ ] **Step 4: Run** `flutter test` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(app): keep the café's and each person's language on the tablet (F4b)`.

---

### Task 3: App — which language the screen uses

**Files:** Create `lib/l10n/language.dart`; modify `lib/l10n/l10n.dart` (move `appLocaleProvider` out), `lib/app.dart` (import). Test: `test/language_test.dart` (new).

**Interfaces:**
- Produces:
  - `String resolveLanguage({required bool paired, required bool isKitchen, required String? signedInUserId, required String? myLanguage, required String? kitchenLanguage, required String? cafeLanguage})` — implements the Global Constraints table exactly; unknown values count as absent.
  - `final appLocaleProvider = Provider<Locale>(...)` — watches `authControllerProvider` and the three database streams (`StreamProvider`s inside `language.dart`), returns `Locale(resolveLanguage(...))`. While anything is still loading: the last value, else `'en'`.
  - `AppLocalizations languageTexts(String lang)` = `lookupAppLocalizations(Locale(lang))`.
- Consumes: Task 2's database streams.

- [ ] **Step 1: Write the failing tests** in `test/language_test.dart`:
  - One `test` per table row and fallback: unpaired → `'en'` even with café `'am'`; PIN screen → café; PIN screen, no café → `'en'`; signed in with choice → choice; signed in without → café; kitchen with choice → choice; kitchen without → café; unknown value `'fr'` → treated as absent.
  - Widget: `'the app follows the café language on the PIN screen'` (café `'am'` in the db → PIN screen title is the Amharic `pinTitle`).
  - Widget: `'two waiters on one phone: the next one gets the café language'` (Hana `'am'` signs out, Abel signs in with no choice, café `'en'` → English floor map) — Review Focus 1.
  - Widget: `'a café language downloaded later changes the PIN screen'` (café changes from `'en'` to `'am'` in the db → PIN title becomes Amharic) — Review Focus 5.
- [ ] **Step 2: Run** `flutter test test/language_test.dart` — Expected: FAIL.
- [ ] **Step 3: Implement** `language.dart`; existing overrides of `appLocaleProvider` in tests keep working (same provider name and type).
- [ ] **Step 4: Run** `flutter test` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(app): the screen follows the café's, the waiter's or the kitchen's language (F4b)`.

---

### Task 4: App — the language button (waiter and kitchen), offline-safe

**Files:** Create `lib/ui/language_button.dart`; modify `lib/session/work_session.dart`, `lib/sync/commands.dart`, `lib/ui/floor_map_screen.dart`, `lib/ui/kitchen_screen.dart`, both ARB files. Test: `test/language_button_test.dart` (new), `test/work_session_test.dart`.

**Interfaces:**
- Produces:
  - `LanguageButton({required String current, required ValueChanged<String> onChanged})` — a ≥ 48 dp `TextButton` labelled with the OTHER language's short name (`'EN'` when Amharic is on, `'አማ'` when English is on), `Key('language-button')`, tooltip `context.l10n.languageSwitch`.
  - `WorkSession.setMyLanguage(String lang) → Future<void>`: writes `setMyLanguage(userId, lang, pending: true)` (the screen switches from this alone), then sends `{type: 'staff.language', idempotencyKey: newId(), language: lang}` live; on `{ok: true}` clears pending. Offline / NEEDS_CONNECTION / NO_ANSWER: stays pending.
  - On every `synced` push: for each `pendingLanguages()` entry of the signed-in user, send again.
  - Kitchen: `onChanged` → `db.setKitchenLanguage(lang)` only (no message).
  - ARB keys: `languageSwitch` ("Switch language" / Amharic draft).
- Consumes: Task 2 database helpers, Task 3 `appLocaleProvider`.

- [ ] **Step 1: Write the failing tests**:
  - `'a waiter's tap switches the screen at once and tells the server'`: floor map in English, tap `language-button` → floor map texts in Amharic in the same frame after `pump()`; the socket received `staff.language` with `'am'`; after the ack, pending is cleared.
  - `'offline: the switch still happens, and is sent after reconnecting'`: offline tap → Amharic shown, nothing sent, pending; connection comes back (`synced`) → `staff.language` sent; ack clears pending — Review Focus 2.
  - `'the button names the other language'`: English → label `'አማ'`; Amharic → label `'EN'`.
  - `'a kitchen tap is stored on the tablet only'`: kitchen screen, tap → Amharic kitchen texts; no `staff.language` sent; `watchKitchenLanguage().first == 'am'`.
  - `'the button is at least 48 dp'` (`tester.getSize(find.byKey(...))`).
- [ ] **Step 2: Run** `flutter test test/language_button_test.dart test/work_session_test.dart` — Expected: FAIL.
- [ ] **Step 3: Implement** as in Interfaces; add the button to the floor map app bar (before sign-out) and the kitchen app bar (before "Sold out").
- [ ] **Step 4: Run** `flutter test` — Expected: PASS (guard and parity tests included).
- [ ] **Step 5: Commit** `feat(app): one-tap language button for waiters and kitchens (F4b)`.

---

### Task 5: App — alerts, notification and leftover names follow the language

**Files:** Modify `lib/session/providers.dart`, `lib/ui/order_screen.dart` (category tabs, option group titles, "Choose: …"), `lib/ui/sold_out_screen.dart` (category headings), `lib/ui/table_screen.dart` ("Order again" names). Test: `test/alerts_test.dart`, `test/amharic_screens_test.dart`.

**Interfaces:**
- Consumes: `languageTexts`, `appLocaleProvider` (Task 3); `primaryName` (F4a).
- Produces: `workSessionProvider` and `keepAliveProvider` pass `texts: () => languageTexts(ref.read(appLocaleProvider).languageCode)`.

- [ ] **Step 1: Write the failing tests**:
  - `'alerts use the waiter's language at the moment they ring'`: a WorkSession whose texts function returns Amharic → ready alert text contains Ethiopic; switch to English → the next alert is English.
  - Amharic screens: the order screen with a category `nameAm: 'ምግብ'` shows the tab `'ምግብ'`; an option group `nameAm: 'መጠን'` shows `'መጠን'` in the option dialog; the sold-out list shows the Amharic category heading.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement**: providers wiring; replace `c.nameEn` / `g.nameEn` / `category.nameEn` / `l.nameEn` in those places with `primaryName(en, am, Localizations.localeOf(context).languageCode)`. (Option-group data in the draft needs `nameAm`: add `DraftGroup.nameAm`, optional.)
- [ ] **Step 4: Run** `flutter test`, `flutter analyze` — Expected: PASS, no issues.
- [ ] **Step 5: Commit** `feat(app): alerts, notification and menu headings follow the language (F4b)`.

---

### Task 6: Docs and the phone test

**Files:** Modify `docs/decisions.md` (D-91), `docs/phone-test.md` (a short "Try Amharic" part: tap አማ on the floor map; sign out and in again — still Amharic; kitchen button), `server/scripts/dev-phone-test.mjs` (give one dish, one category and one option an Amharic name, so both names are visible in the test; only when missing). Rebuild the debug APK for the PC's address.

- [ ] **Step 1:** Run `node scripts/dev-phone-test.mjs` against a local server — Expected: Amharic names present in `GET /menu`; existing café untouched otherwise.
- [ ] **Step 2:** Update both docs.
- [ ] **Step 3: Run the full checks** — server `npm test` + `npm run typecheck`; app `flutter test`, `flutter analyze`, `flutter build apk --debug --dart-define=API_URL=http://<PC-IP>:8787` — Expected: all pass / build succeeds.
- [ ] **Step 4: Commit** `docs: F4b decisions and how to try Amharic on the phone`.

## Done when

- A waiter taps አማ and every screen, dish name, alert and the notification are Amharic, instantly, also offline; it survives sign-out/sign-in and follows them to another phone.
- A kitchen tablet switches on its own; the PIN screen follows the café language.
- Server and app suites green, CI green on the PR.
