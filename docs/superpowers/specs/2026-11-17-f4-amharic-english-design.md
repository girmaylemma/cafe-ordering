# F4: Amharic and English in the waiter and kitchen apps — design

Date: 2026-11-17 · Status: approved 2026-11-17 · Requirement: W-12 (MVP), design.md §5 "Readable in Amharic and English", §11 "Language: Amharic first-class".

## 1. Intent

Staff at the same café differ: one waiter reads English comfortably, another prefers Amharic. The app must
let **each person** use the language they like, while the **manager** sets what the café starts with.
Amharic is first-class: correct Ethiopic font, no broken or cut-off words, not a half-translated app.

Success: a waiter who prefers Amharic signs in on any phone and sees every button, message and alert in
Amharic, while the next waiter on the same phone sees English; the kitchen screen reads well in either; and
dish names always appear in both languages, so a waiter and a cook never use different names for one dish.

## 2. Goals, non-goals, anti-goals

**Goals**
- Every text the waiter and kitchen apps show exists in Amharic and English (about 140 today).
- Café default language, set by a manager or owner in the dashboard.
- A personal language per staff member, chosen in the app, following the person to any phone.
- A language for each kitchen/bar tablet, chosen on the tablet.
- Dish names (and option names) always shown in both languages.
- The Noto Sans Ethiopic font bundled in the app.

**Non-goals (later)**
- Translating the admin dashboard (stays English).
- Afaan Oromo and Tigrinya (design.md says "configurable"; the structure must allow adding them, but no texts now).
- Ethiopian calendar dates (only reports need them; that is the Telegram bot's work).
- "Polish": deferred to its own step after real-device tests.
- Ethiopic (Ge'ez) numerals: numbers, prices and times stay in Western digits, as menus and receipts in Ethiopia use.

**Anti-goals (a failure even if it "works")**
- A screen mixing languages because a text was missed.
- Amharic words cut off, overlapping, or shown as □□□ boxes.
- A waiter and a cook seeing different names for the same dish.
- Switching language that needs a restart, a sign-out, or loses the order being built.
- The language feature slowing down taking an order (no network call when switching).

## 3. Decisions made in conversation

| # | Decision | Decided by |
|---|---|---|
| 1 | Both: café default (manager) AND a personal choice per waiter | user |
| 2 | Dish names always in both languages: the chosen language big, the other small under it | user |
| 3 | Approach A: Flutter's official `gen-l10n` (ARB files) | user |
| 4 | New dependencies approved: `flutter_localizations` (Flutter SDK), `intl` (Dart team), Noto Sans Ethiopic font file (OFL) | user |
| 5 | A waiter's choice is stored on the server with the staff member, so it follows them to any phone | proposed, not objected to |
| 6 | Kitchen/bar tablets: own choice stored on the tablet; default = café default | proposed, not objected to |
| 7 | PIN screen uses the café default (nobody signed in yet) | proposed, not objected to |
| 8 | Dashboard stays English | proposed, not objected to |
| 9 | F4 = languages only; polish later | proposed, not objected to |

## 4. Approaches considered

- **A. Flutter `gen-l10n` + ARB files (chosen).** Official; Flutter's own widgets (dialog buttons, back
  tooltips, time picker) get Amharic for free (`am` is supported by `flutter_localizations`); every key is a
  generated getter, and the Amharic class must implement every key, so a missing translation fails the build.
- **B. Our own two Dart maps in `texts.dart`.** No dependencies, but Flutter's widgets stay English and
  missing keys are only caught by a hand-written test. Rebuilds what A gives for free.
- **C. `easy_localization` (community).** Third-party code with nothing A lacks. Dropped.

## 5. The design

### 5.1 Which language is used (resolution order)

```
Waiter tablet, signed in:   staff.language  ?? café language ?? 'en'
Waiter tablet, PIN screen:  café language   ?? 'en'      (last downloaded; nobody signed in)
Kitchen/bar tablet:         tablet setting  ?? café language ?? 'en'
Unpaired tablet (pairing):  'en'            (the café is not known yet)
```
Supported values: `'am'`, `'en'`. Stored as text so more languages can be added without a migration.

### 5.2 Server (Cloudflare Worker + café Durable Object)

- **Migration 6** (append-only, D-60):
  - `ALTER TABLE venue ADD COLUMN language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('am','en'))`
  - `ALTER TABLE staff ADD COLUMN language TEXT CHECK (language IN ('am','en'))` — NULL means "use the café's".
  - (SQLite note for the builder: `ALTER TABLE ... ADD COLUMN` with a CHECK is allowed; a NOT NULL column
    needs the DEFAULT.)
- **`GET /staff`** (tablets) also returns the café language: `{ staff, language }`. Every tablet already
  downloads `/staff` on start and on every reconnect, so no new route is needed for the default.
- **`POST /auth/pin`** returns `user.language` (null or 'am'/'en').
- **Waiter changes their language**: a new WebSocket message, like other tablet writes (locked decision:
  tablet commands go over the WebSocket):
  `{ type: "staff.language", idempotencyKey, language: 'am' | 'en' | null }` → ack `{ ok: true }`.
  Only for a signed-in staff connection; it sets the language of the connection's own user (never another
  user's: the user comes from the connection, as for every command). Runs through the existing
  idempotency machinery (processed commands), like every WebSocket write. Not written to the audit log and
  no OrderEvent: it is a personal display preference, not an action on orders, staff or money
  (Claude's call). The café language change in the dashboard IS an admin action and goes to the audit log
  like other dashboard writes.
- **Dashboard API**: `GET /admin/api/venue` → `{ id, name, language }`; `PATCH /admin/api/venue`
  `{ language }` (manager or owner, same checks and CSRF rules as other admin writes). A café language
  change is pushed nowhere: tablets pick it up at their next `/staff` download (start or reconnect). Live
  push is unnecessary for a setting changed a few times a year.
- Dashboard staff list shows each person's language (read-only; staff choose it themselves).

### 5.3 Dashboard (React)

- A new **Settings** page with one field now: **Café language** (Amharic / English), Save button.
  (VAT, service charge and business day will join this page later; not built now.)
- Staff page: a "Language" column (Amharic / English / "Café default").

### 5.4 App (Flutter)

**Texts**
- `apps/tablet/l10n.yaml` + `lib/l10n/app_en.arb` (template) + `lib/l10n/app_am.arb`.
- Every English literal in `lib/ui`, `lib/alerts`, `lib/app.dart` and `lib/texts.dart` (errorText,
  stationNames) moves to the ARB files. Each ARB entry gets an `@description` saying where it appears, so
  the Amharic reviewer knows the context.
- Placeholders for values (`{minutes}`, `{table}`); plurals with ICU syntax where English needs them
  (Amharic mostly does not, but the ICU form keeps both correct).
- `errorText(code)` keeps its shape but takes the localizations object.

**Switching**
- One `localeProvider` (Riverpod) decides the locale by the order in 5.1; `MaterialApp` uses it, with
  `AppLocalizations.localizationsDelegates` / `supportedLocales`.
- Waiter: a language button on the floor map app bar (`አማ` / `EN`). A tap switches the screen **at once**
  (no restart, the order being built stays), saves the choice locally, and sends `staff.language` live.
  Offline: the choice still applies at once, is kept as "to send", and is sent after the next reconnect
  (`synced`). The server's value wins at the next sign-in only if nothing is waiting to be sent.
- Kitchen/bar: the same button on the kitchen app bar; saved on the tablet only.
- PIN screen: uses the café language from the last `/staff` download (stored locally).

**Dish names in both languages**
- Menu tiles, order lines, table lines, kitchen tickets, sold-out list: big = name in the current language,
  small = the other. If an item has no Amharic name (it is optional, D-67), show only English, never an empty
  line. Same for option names.
- Kitchen ticket lines already carry `nameAm` in the ticket snapshot; the kitchen screen starts showing it.

**Font**
- `assets/fonts/NotoSansEthiopic-Regular.ttf` and `-Bold.ttf` (OFL; licence file next to them).
- Theme: Latin stays the default font; Noto Sans Ethiopic is set as `fontFamilyFallback`, so Ethiopic
  characters always use the bundled font. Kitchen line height checked at 1.3x text.

### 5.5 Translations

- Claude drafts all Amharic texts. **The user (a native speaker) reviews them before the pilot** (the user does
  this). To make review easy, the build produces `docs/translations-review.md`: a table of key, English,
  Amharic, where it appears — with a column for corrections.
- Tone: short, plain, polite; the words waiters actually say (e.g. the kitchen's "ready" as used in cafés).

## 6. Tests

- **Build-level**: a missing Amharic key fails compilation (gen-l10n abstract class).
- **No literals left**: a test scans `lib/ui`, `lib/alerts`, `lib/app.dart` for user-visible English
  literals in `Text(...)`, `label:`, `tooltip:`, `hintText:`, `labelText:` and fails, with a short allow-list
  (e.g. `'EN'`, `'አማ'`, symbols).
- **Every screen in Amharic**: widget tests render each main screen (pair, PIN, floor map, table, order,
  void dialog, kitchen, sold out) in `am` at text scale 1.0 and 1.3 on a phone-size and a tablet-size
  window: no overflow errors, and a sample of Amharic text is found.
- **Resolution order** (5.1): unit tests for every row, including "staff null → café", "nothing → en".
- **Switching**: tapping the language button changes the visible texts without losing a draft order;
  offline switch is sent after reconnect; kitchen switch is stored on the tablet only.
- **Dish names**: both names shown; an item without Amharic shows English only, no empty line.
- **Server**: migration 6 adds the columns with defaults (existing cafés get 'en' / NULL); `/staff` returns
  the language; sign-in returns `user.language`; `staff.language` sets only the caller's own language,
  refuses a station or live connection, refuses an unknown value; `PATCH /admin/api/venue` needs manager or
  owner, refuses unknown values, and passes the CSRF checks.
- **Dashboard**: Settings page loads and saves the café language; staff list shows the language column.
- **CI**: all of the above run in the existing CI on every PR.

## 7. Delivery in steps (each its own PR, CI green)

1. **F4a — foundation**: packages, font, `l10n.yaml`, locale provider, all ~140 texts moved to ARB with
   Amharic drafts, both-names display, the "no literals" test, every-screen tests. The language is
   **café default 'en' only** at this step (no switching yet) — the app looks the same in English.
2. **F4b — choosing the language**: migration 6, `/staff` + sign-in fields, `staff.language` message,
   app language button for waiters and kitchens, offline "to send", resolution order tests.
3. **F4c — dashboard**: Settings page (café language), staff language column, admin API.
4. **F4d — review sheet**: `docs/translations-review.md` generated, handed to the native speaker;
   corrections come back as one small PR.

## 8. Left to the builder

Claude's calls, made while writing this (check them):
- New cafés start with café language `'en'` (existing cafés get it from the migration default; a manager
  changes it in one click).
- The tablet keeps its local choices (kitchen language, waiter's "to send" choice, last café language) in
  the existing drift key-value table, no new table.
- A personal language change is not audited (see 5.2); the café language change is.

- Exact ARB key names and file layout inside `lib/l10n/`.
- The exact Amharic wording (draft), within the tone above; flagged for native review.
- Where exactly the language button sits on each app bar, as long as it is one tap and ≥ 48 dp.
- Whether `errorText` becomes an extension on `AppLocalizations` or a function taking it.

## 9. Risks

- **Translation quality**: drafts may be correct but unnatural. Mitigation: native review before the pilot (5.5).
- **Longer Amharic texts on small phones**: covered by the every-screen overflow tests at 1.3x.
- **Font size**: two font files add about 0.5–1 MB to the app. Acceptable (the design asks for it).
- **A waiter changes language offline on one phone and signs in on another before reconnecting**: the
  second phone shows the old server value until the first phone reconnects. Rare and harmless.
