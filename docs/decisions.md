# Decisions log

Decisions made during the spec review of 2026-11-10. Each one says what was decided and why.
To change one, add a new entry that replaces it. Don't edit the old entry.

| # | Decision | Why | Rejected alternatives |
| --- | --- | --- | --- |
| D-01 | `CLAUDE.md` lives at the repo root; design docs live in `docs/`. | Files inside `.git/` are never tracked or pushed, and Claude Code loads `CLAUDE.md` only from the root. | Leaving them in `.git/docs/`. |
| D-02 | The MVP is every item marked MVP in `design.md` section 4. `CLAUDE.md` is a summary of it. | Two scope lists drifted apart. One source of truth avoids building the wrong thing. | Smaller MVP from the old `CLAUDE.md` list. |
| D-03 | Item states: sent → accepted → ready → delivered, plus cancelled and voided. Sync status (Queued / Sending / Sent ✓) is separate. | "queued" mixed up network status with kitchen status. Splitting them keeps both simple. | `placed → queued → …`; an extra "preparing" step. |
| D-04 | Accept and Ready are **per item**. | Lets the kitchen accept some items and query others; voids then apply per item. Cost: more taps at peak. An "Accept all" button is suggested but not decided. | Accept the whole round. |
| D-05 | Kitchen undo within 10 s, saved as a new event. | Mistaken taps happen. A new event keeps the audit log honest instead of rewriting history. | Delaying alerts; no undo. |
| D-06 | Ready alerts go to the table's current waiter; sales stay with the waiter who placed the item. | After a shift hand-over, the first waiter may have left. Credit for the sale doesn't move. | Original waiter only; both. |
| D-07 | Cancel vs Accept: the first to reach the café's Durable Object wins. | A Durable Object handles one message at a time, so the order is clear and needs no locks. | Cancel always wins. |
| D-08 | Discounts and free items are P2. | Not needed for the core loop; there's no Discount entity yet. | MVP free items; MVP full discounts. |
| D-09 | One Directory Durable Object for the system-wide lookups. | Telegram, pairing and login requests don't know their café. A Durable Object is strongly consistent and uses tech we already have. | D1 (new component); KV (changes take ~60 s, so revoking isn't instant). |
| D-10 | PINs are checked only by the server. No offline sign-in. | A 4–6 digit PIN hash stored on a tablet is cracked in milliseconds if the tablet is stolen. Cost: new sign-ins and voids need internet. | Caching waiter PIN hashes on the device. |
| D-11 | 5 wrong PINs = 5-minute lockout + Telegram alert; manager PINs are 6 digits. | Stops guessing a manager PIN to approve voids. Known side effect: someone can lock a user out on purpose, but the alert makes it visible. | Lockout only. |
| D-12 | Dashboard login through Cloudflare Access. | We store no passwords. 2FA-grade login for free (≤50 users). Strong password hashing may not fit in the Workers Free CPU limit. | Building our own email + password + TOTP. |
| D-13 | Device tokens are random and server-checked (only the hash is stored). No JWT. | "Revoke at once" and "deactivate instantly" need a server check. A JWT stays valid until it expires. | Short JWT + denylist. |
| D-14 | Pairing and link codes are single-use, last 10 minutes, are bound to one user or device, and are rate-limited. | 6-digit codes can be guessed without limits, and an unbound code lets anyone link any account. | Longer codes only. |
| D-15 | Money is stored as integer santim. Total sales = non-voided items; service charge is a separate line. | Floats drift by a santim in sums. A separate line keeps total sales equal to what the kitchen received. | Decimal/REAL storage. |
| D-16 | `received_at` (server time) is authoritative; `created_at` (device time) is kept for information. | Tablet clocks can be wrong and would put orders in the wrong business day. | Device time. |
| D-17 | A queued order gets the current server price; sold-out items still reach the kitchen, flagged. | Device prices are never trusted. Silently dropping food the customer ordered is worse than asking. | Rejecting sold-out items. |
| D-18 | Offline, only opening a table and sending new rounds can be queued. | Each other offline action adds a sync conflict case (e.g. a table closed offline while the kitchen marks items ready). | Queue everything. |
| D-19 | Monthly R2 archives are never auto-deleted; nightly backups are kept 30 days; point-in-time recovery is used too. | The tax retention period is unknown and may be years. Keeping too much is reversible; deleting too early is not. | Keep everything in the Durable Object; wait for the tax advisor. |
| D-20 | Sign-out is blocked while rounds are unsent; the dashboard warns before revoking or wiping such a device. | Unsent rounds exist only on that tablet. | Nothing extra. |
| D-21 | Soft delete only. | Old reports must keep working. | Hard delete. |
| D-22 | Weeks run Mon–Sun; Pagume is its own month; times are stored in UTC and computed in Addis time; the daily auto report is sent at the end of the business day. | One clear rule each; sending at the end of the business day includes late orders. | Merging Pagume into Nehase; a fixed send time. |
| D-23 | Link codes are created for a named owner or manager; managers can't create codes for owners. | Stops a manager linking extra accounts to the owner's reports. | Owner-only. |
| D-24 | Tablet commands go over the WebSocket. | No new HTTPS handshake per command, and about 20× cheaper on the free plan (incoming WebSocket messages count 20:1). | REST for commands. |
| D-25 | The kitchen's audit "who" is the station device; there's no kitchen user role. | Fast with wet or gloved hands. | A kitchen PIN at shift start. |
| D-26 | The bar station is MVP. | Routing is cheap once `station_id` exists. | Kitchen only. |
| D-27 | Each café's Durable Object is created with a `locationHint`. | A Durable Object is placed near its first request and stays there. | Creating it from the café. |
| D-28 | Android Management API for kiosk mode and wipe. | Free; paid MDM conflicts with "no monthly cost". | Screen pinning; paid MDM. |
| D-29 | Personal phones are allowed (work profile recommended). | Cheaper for cafés. **Risk accepted:** no kiosk mode, no full wipe, and the app works off-site. Mitigation: revoke the token; work profile. | Café-owned devices only. |
| D-30 | Sentry free tier, with staff names and PINs scrubbed. | Crashes on café tablets are otherwise invisible. | Crashlytics; none. |
| D-31 | Usage alerts at 50% and 80% of free limits; Workers Paid ready to switch on. | Hitting a limit stops ordering until 03:00 Addis time. | Paid plan from day 1. |

## Open questions

- Are menu prices VAT-inclusive? Ask the pilot café. A per-venue flag supports both.
- How long must sales records be kept? Ask a tax advisor.
- Client contract: terms covering the installer's access to café data.
- Is Durable Objects point-in-time recovery available on the Workers Free plan? Verify before the pilot.
- The roadmap diagram was lost in the export; re-create it from the original.
