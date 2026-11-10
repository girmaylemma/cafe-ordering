# CLAUDE.md: Ordering System

## What this project is
Waiters take orders on a tablet. Each order appears instantly on a fixed kitchen tablet. The kitchen
taps Accept, then Ready (per item), and only the table's current waiter is alerted to deliver it. The owner
and manager get sales reports in a Telegram bot.

Full design: `docs/design.md`. Read the relevant section before starting any feature.

## Scope: build ONLY this
The source of truth is every requirement marked **MVP** in `docs/design.md` section 4. Summary:
- Waiter app: PIN sign-in, floor map, take order (items, options, notes), send to kitchen,
  "Kitchen accepted" and "Ready" alerts, Delivered, close table, move/merge/hand over tables,
  cancel before accept, void with manager PIN, sold-out greyed out, offline queue, Amharic + English.
- Kitchen/bar app: tickets (table, waiter name, items, notes), per-item Accept and Ready,
  10 s undo, sold out, timers, kiosk mode. Kitchen and bar stations are both MVP.
- Admin dashboard (behind Cloudflare Access): menu, tables/floor map, staff + PINs,
  device pairing/revoke, live view, VAT/service charge/business day, Telegram linking.
- Telegram bot: /daily, /weekly, /monthly, /waiter, /settings. Reports show order count, items sold
  (qty x price = amount), total sales, and the same per waiter. Optional scheduled sending.
- Operations: nightly backup + monthly archive to R2, health and usage alerts in Telegram.
- NOT in MVP: discounts and free items (P2).

## Out of scope: do NOT build, suggest adding, or scaffold
- Payments of any kind, payment gateways, cash handling
- Bill or receipt printing, printers
- Cashier screen, split bills
- Customer self-ordering (customer tablets, QR menus)
- Inventory, delivery, loyalty, payroll
- A local/on-premise server (decided against; see "Locked decisions")

If a task seems to need any of these, STOP and ask me. Don't work around it.

## Locked decisions (don't change without asking me first)
- Hosting: Cloudflare free plan. Workers + one Durable Object per café (SQLite + WebSockets,
  Hibernation API). Telegram bot via webhook. Cron Triggers for scheduled reports. Backups to R2.
- Apps: Flutter (Dart), Android, one codebase with waiter and kitchen modes. State: Riverpod.
  Local storage on tablets: drift (SQLite).
- Server: TypeScript on Cloudflare Workers. Bot: grammY.
- Admin dashboard: React + Vite + TypeScript, served from Cloudflare, behind Cloudflare Access
  (we store no passwords; the API still checks the email belongs to the café and its role).
- One Directory Durable Object for the whole system: lookups only (Telegram chat_id, pairing and
  link codes, dashboard emails, device tokens -> venue_id). Never orders.
- Real-time: WebSocket push only. Never polling. Tablet commands (send round, accept, ready,
  cancel, delivered, sold out, table moves) go over the WebSocket; REST is for downloads,
  sign-in, pairing, dashboard and reports.
- Auth: PINs are checked only by the server (no offline sign-in, no PIN hashes on devices).
  5 wrong tries = 5-minute lockout + Telegram alert. Manager PINs are 6 digits.
  Device tokens are random (store only the hash), checked on every connect; revoking closes the
  socket. No JWT. Pairing/link codes: single-use, 10 min, bound to one user/device, rate-limited.
- Each café DO is created with a locationHint near Ethiopia.
- Devices: Android Management API (kiosk, remote wipe; work profile on personal phones).
  Crash reports: Sentry free tier with staff names and PINs scrubbed.
- No new dependency without asking me first: explain why it's needed and what the alternatives are.

## Speed is the #1 requirement
- Send to kitchen tablet: <= 0.5 s. Any tap in the app responds in < 100 ms, no spinners.
- Menu, tables and photos live on the tablet. Building an order makes NO network calls.
- Show "Sending" instantly, then "Sent ✓" on server confirmation. Queue orders if offline.
- Send only small change messages, never whole screens or the full menu.
- Reports read running totals; never slow the ordering path.
- Watch free-plan limits: avoid chatty messages, polling, and unnecessary writes.

## Data rules
- Order and item IDs: UUID v7, generated on the device. Every write needs an idempotency key.
- The server copies item name and price from the current menu when it receives the order;
  never trust prices from the device. The server recalculates all totals.
- Money is integer santim (1 ETB = 100). Never floats.
- Time is stored in UTC. Store `created_at` (device) and `received_at` (server); `received_at`
  decides sorting, timers, business day and reports. Business day is computed in Addis time (UTC+3).
- Every table carries `venue_id`. Every staff action goes to the audit log (OrderEvent);
  kitchen/bar actions are recorded against the station device. OrderEvents are never edited or deleted.
- Never hard-delete staff, menu items, tables or devices: deactivate them.
- Schema changes are NEW migrations appended to `server/src/cafe/migrations.ts` (or the Directory's
  list): never edit a shipped migration or `schema.ts`; additive changes only (D-60).
- Item states: sent -> accepted -> ready -> delivered, plus terminal cancelled and voided.
  Accept and Ready are per item. Order/table states are derived from items.
  Cancel is allowed only before accept (first command to arrive wins); after that it's a void
  with manager PIN. Kitchen undo within 10 s is a new event, never an edit of history.
- "Queued / Sending / Sent ✓" is device sync status, not an order state. Offline, only
  `session.open` and `order.send` may be queued; the app blocks sign-out while rounds are unsent.
- Ready alerts go to the table's current waiter; sales are credited to the waiter who placed the item.

Decisions and their reasons: `docs/decisions.md`.

## How to work with me (I'm a junior developer; act as my mentor)
1. Before coding: restate the task, list assumptions, ask if anything is unclear.
2. Propose a short plan (files to touch, trade-offs) and test cases. Wait for my OK on big changes.
3. Work in small steps, one feature at a time. Don't build ahead of what we agreed.
4. Explain WHY for non-obvious choices.
5. Bugs: write a failing test first, then fix, then show it passing. Explain the root cause.
   If two attempts fail, stop and rethink with me. No guess-and-check loops.
6. Never delete or rewrite code you don't understand. Ask first.
7. Never run destructive commands (deleting files, force-push, reset, dropping data) without asking.
8. Tell me directly if my idea is wrong or risky (security, performance, maintainability).
9. After each change, give me:
   - a summary
   - a manual QA checklist
   - risks
   - optional improvements
   - one thing to learn

## Environment
- Windows 10, VS Code, PowerShell. Give commands that work in PowerShell.
- Git + GitHub. Small commits with clear messages; never commit secrets
  (the bot token and Cloudflare keys are Cloudflare/GitHub secrets).

## Repo layout (planned)
- `apps/tablet/`: Flutter app (waiter + kitchen modes)
- `server/`: Cloudflare Worker + Durable Object + Telegram bot (TypeScript)
- `admin/`: React + Vite admin dashboard
- `docs/`: design document and decisions

## Commands
(Fill in as the project is set up: install, run, test, deploy for each folder.)

### server/ (run inside `server/`)
- Install: `npm ci`
- Test: `npm test` (watch mode: `npm run test:watch`)
- Type check: `npm run typecheck`
- Regenerate `worker-configuration.d.ts` after changing `wrangler.jsonc`: `npm run types`
- Tests run inside Cloudflare's runtime (workerd) via `@cloudflare/vitest-plugin`; no Cloudflare account needed.
- Secrets: `SERVER_SECRET` (PIN hashing key + token signing key) and `INSTALLER_SECRET` (creating cafés). Local dev: copy `.dev.vars.example`
  to `.dev.vars` (gitignored). Production: `npx wrangler secret put SERVER_SECRET` with a long random
  value. Changing it later invalidates every PIN and device token, so set it once and back it up safely.
- Cloudflare Access config: `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` in `wrangler.jsonc` vars (placeholders
  until the domain exists; the admin API refuses everything until they are real).
- Create a café (installer): set `$env:INSTALLER_SECRET`, then
  `npm run new-cafe -- --api <url> --name "<café>" --owner-name "<name>" --owner-email <email>`.
- Run locally: `npx wrangler dev` (uses `.dev.vars`).
