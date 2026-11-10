# Ordering System — Design Document

Oct 30, 2026 · @Girmay

## 1. Overview

Waiters take orders on a tablet at the table; each order appears instantly on a fixed tablet in the kitchen; the owner and manager get daily, weekly and monthly sales reports through a Telegram bot. No paper order slips and no walking orders to the kitchen.

Working name in this document: **Ordering System**.

### Problem

- Paper order slips get lost, are hard to read, or are forgotten.
- Waiters walk back and forth to the kitchen to hand in orders and to ask if food is ready.
- Orders are wrong: items are missed or entered twice.
- The owner has no reliable numbers per day, week, month or per waiter.

### Goals

1. A waiter enters a typical table order in under 60 seconds.
2. Every order appears on the kitchen tablet within half a second of being sent, and the app never makes a waiter wait.
3. Zero lost orders: if the internet drops, the waiter's tablet holds orders and sends them the moment it is back.
4. Every order counts: everything sent to the kitchen appears in the sales report unless a manager voided it.
5. The owner or manager gets orders, items sold and total sales per waiter in Telegram, for any day, week or month they choose.
6. Runs in the cloud on free plans (Cloudflare), with no server computer in the café and no monthly hosting cost.

### In scope

- Waiter app on each waiter's tablet (or phone)
- Kitchen display on a fixed, immovable tablet in the kitchen (optionally a second one at the bar)
- Menu, tables and floor map, staff, device management
- Telegram bot reports: number of orders, items sold and total sales per waiter, daily, weekly or monthly

### Out of scope for the first release

- Payments of any kind: customers pay the way they do today, outside the system
- Bill and receipt printing
- Cashier screen and split bills
- Customer self-ordering on tablets or by QR (the design leaves room to add it later)
- Inventory and recipe costing (phase 3)
- Delivery platforms, loyalty, payroll

## 2. Users and roles

Five roles use the system. The customer never touches a device: they talk to the waiter. Permissions are role-based (RBAC) and set per venue.

| Role | Uses | Main jobs | Sign-in |
| --- | --- | --- | --- |
| Waiter | Café tablet, or their own phone | Open tables, take and send orders, get accepted and ready alerts, deliver, close the table | Personal 4–6 digit PIN, checked by the server (no offline sign-in) |
| Kitchen / bar staff | Fixed kitchen or bar tablet | Check incoming items, accept them, mark ready, mark items sold out | No personal sign-in: the tablet is paired as a station, and its actions are recorded against the station device |
| Manager | Web dashboard + any tablet | Approve voids, edit menu and staff, get reports in Telegram | Cloudflare Access for the dashboard (one-time email code or Google login), plus a 6-digit manager PIN on tablets |
| Owner | Web dashboard, Telegram | Daily / weekly / monthly reports in Telegram, staff accounts, settings | Cloudflare Access (one-time email code or Google login) |
| Installer and support (you) | Cloudflare and GitHub accounts | Deploy updates, set up cafés, watch usage and backups | Cloudflare and GitHub with 2FA |

Two rules matter here. First, voids after the kitchen accepts an item need a manager PIN. Second, every staff action is written to an audit log with who, what and when, so reports can show it per waiter. For kitchen and bar actions, "who" is the station device.

#### Permissions

| Action | Waiter | Kitchen / bar station | Manager | Owner |
| --- | --- | --- | --- | --- |
| Open table, send rounds, mark delivered, close table | ✓ | | ✓ | |
| Cancel an item before the kitchen accepts it | ✓ (own tables) | | ✓ | |
| Move, merge or hand over a table | ✓ (own tables) | | ✓ | |
| Accept, mark ready, undo (10 s), mark sold out | | ✓ | | |
| Void an accepted item (manager PIN + reason) | | | ✓ | |
| Edit menu, tables, floor map | | | ✓ | ✓ |
| Staff accounts and PINs, deactivate staff | | | ✓ (not owner accounts) | ✓ |
| Pair and revoke devices | | | ✓ | ✓ |
| Create Telegram link codes | | | ✓ (manager accounts only) | ✓ |
| Venue settings (VAT, service charge, business day, calendar) | | | | ✓ |
| Reports (dashboard and Telegram) | | | ✓ | ✓ |

## 3. Order flow

There is one service mode: the waiter takes the order on her tablet, the kitchen checks it on the kitchen tablet and tells her when it is ready, and she delivers it.

### Main flow

1. Customers sit. The waiter taps the table on her floor map (e.g. Table 7).
2. She takes the order: taps items, options (size, spice level, no onion) and notes.
3. She reads the order back to the customer and taps **Send to kitchen**.
4. The fixed kitchen tablet beeps and shows the ticket: table number, **waiter name**, items, notes and time sent.
5. The person in charge of the kitchen checks the ticket and taps **Accept** on each item. Items are accepted one by one, so the kitchen can accept the drinks and query a dish it cannot make. The waiter's tablet shows "Kitchen accepted" for each item, so she knows nothing was missed.
6. When an item is ready, the person in charge taps **Ready**. The system notifies **only the table's current waiter** (normally the one who placed the order; after a hand-over, the new waiter): her tablet rings and vibrates with "Table 7 — ready".
7. She collects the order and delivers it, then taps **Delivered**. If she has not responded within 2 minutes, her tablet rings again and the kitchen sees "not picked up".
8. The customer orders more: the waiter adds a new round to the same table; only the new items go to the kitchen.
9. When the customers leave, the waiter taps **Close table** and the table shows as free again. Payment happens outside the system, as it does today.

### Changes and exceptions

- **Change or remove an item:** free until the kitchen accepts it; after that it is a void that needs a manager PIN and a reason, and the kitchen tablet shows it. If a cancel and an Accept arrive at the same moment, the café's server handles them in the order they arrive: if Accept came first, the cancel is refused and the waiter is told it needs a manager void.
- **Sold out:** the kitchen marks the item; it is greyed out on every waiter tablet within seconds.
- **Table moves:** move an order to another table, merge two tables, or hand a table to another waiter at shift change. After a hand-over, Ready alerts go to the new waiter; sales stay credited to the waiter who placed each order. Moves, merges and hand-overs need a connection.
- **Discount or free item:** not in the first release (P2, see A-08).

### Order lifecycle

Each item moves through fixed states. Only the transitions shown below are allowed, which keeps every screen in agreement.

```text
sent ──► accepted ──► ready ──► delivered
  │          │
  ▼          ▼
cancelled  voided
(waiter,   (manager PIN + reason;
 before     allowed from accepted
 accept)    or ready)
```

- **sent**: the server has saved the item and pushed it to its station. "Preparing" means the same as **accepted**.
- **Undo:** the kitchen can undo its last tap (Accept, Ready or Sold out) within 10 seconds. The undo is saved as a new event, so history is never erased. If the waiter was already alerted, her tablet gets a correction ("Table 7 — not ready yet").
- **Order and table states are derived from their items.** An order is Ready when all its non-cancelled, non-voided items are Ready, so a drink can be Ready while the food is still Accepted.

Separately, each round on the waiter's tablet has a **sync status** that is not an order state: *Queued* (no connection), *Sending*, then *Sent ✓* once the server confirms it saved the round.

## 4. Functional requirements

Three apps share one backend: the waiter app, the kitchen app and the admin dashboard, plus the Telegram bot for reports. Priority: **MVP** = first release, **P2** = within 3 months after, **P3** = later.

### 4.1 Waiter app (waiter's tablet or phone)

| ID | Requirement | Priority |
| --- | --- | --- |
| W-01 | Personal PIN login; every order and void is tagged with the waiter's name | MVP |
| W-02 | Floor map or table list with live states: free, ordered, accepted, ready, delivered | MVP |
| W-03 | Open a table and enter the number of guests (optional) | MVP |
| W-04 | Fast menu: categories, search, favourites, big buttons usable with one hand | MVP |
| W-05 | Item options (size, spice), add-ons with extra price, free-text notes | MVP |
| W-06 | Send to kitchen; add more rounds to the same table | MVP |
| W-07 | "Kitchen accepted" status per item and a Ready alert (sound + vibration) sent only to the table's current waiter; Delivered button; repeat alert after 2 minutes | MVP |
| W-08 | Edit or cancel an item until the kitchen accepts it; after that, void with manager PIN and reason (needs a connection) | MVP |
| W-09 | Move order to another table, merge tables, hand a table to another waiter | MVP |
| W-10 | Sold-out items greyed out in real time | MVP |
| W-11 | Keeps working offline: opening a table and sending new rounds are queued and sent when the connection returns; items not yet sent can be edited on the tablet. Close, move, merge, hand-over and voids need a connection. Signing out is blocked while rounds are unsent | MVP |
| W-12 | Amharic and English | MVP |
| W-13 | My shift: my open tables, my orders, my sales | P2 |
| W-14 | Seat and course numbers ("starters now, mains later") | P2 |

### 4.2 Kitchen tablet (fixed in the kitchen)

| ID | Requirement | Priority |
| --- | --- | --- |
| K-01 | Show tickets for this station, oldest first, with table, waiter name, items and notes | MVP |
| K-02 | Loud sound and screen flash on a new ticket or a void | MVP |
| K-03 | Person in charge taps Accept on each item after checking it, then Ready per item; Ready notifies the table's current waiter. Items queued while offline or now sold out are flagged on the ticket | MVP |
| K-04 | Timer on each ticket; turns amber then red past the target time | MVP |
| K-05 | Mark an item sold out (and back in stock) | MVP |
| K-06 | Undo the last tap within 10 s (saved as a new event; the waiter gets a correction if already alerted) | MVP |
| K-07 | Large text readable from 2 m; screen never sleeps | MVP |
| K-08 | Starts the app by itself after a power cut or restart; cannot leave the app | MVP |
| K-09 | All-day count of each item in the queue (e.g. 7 × tibs) | P2 |
| K-10 | Separate bar tablet: drinks route there, food to the kitchen | MVP |

### 4.3 Admin dashboard (manager and owner, web)

| ID | Requirement | Priority |
| --- | --- | --- |
| A-01 | Menu builder: categories, items, photos, options, prices, Amharic and English names, kitchen or bar routing | MVP |
| A-02 | Tables and areas; floor map editor | MVP |
| A-03 | Devices: pair a waiter or kitchen tablet, see if it is online, battery level, number of unsent rounds; revoke a device (warns if it still has unsent rounds) | MVP |
| A-04 | Staff accounts, roles, PINs (manager PINs 6 digits); deactivate a staff member instantly (their open connections are closed); staff are deactivated, never deleted | MVP |
| A-05 | Live view: open tables, orders waiting in the kitchen, today's sales so far | MVP |
| A-06 | VAT rate and whether menu prices include VAT, service charge, opening hours, business-day start time | MVP |
| A-07 | Multi-venue switch for owners with several branches | P2 |
| A-08 | Discounts, free items (manager PIN + reason) and happy-hour prices | P2 |
| A-09 | Inventory: stock per ingredient, auto sold-out at zero | P3 |
| A-10 | Telegram: create a link code for a named owner or manager, see linked accounts, unlink, set automatic daily / weekly / monthly sending | MVP |

### 4.4 Reports through a Telegram bot

The owner and manager get reports in Telegram. Each report shows the number of orders, the items sold with quantity and amount, and total sales, for the whole café and for every waiter. They choose daily, weekly or monthly whenever they want to check.

#### What a report contains

| Part | Shows |
| --- | --- |
| Header | Venue name, report type (daily / weekly / monthly), the period in Gregorian and Ethiopian dates |
| Totals | Number of orders, number of items, total sales (ETB) |
| Items sold | Each item: quantity × price = amount, sorted by amount, with the total |
| Per waiter | Each waiter's number of orders, items and total sales, highest first |
| Comparison (P2) | Change vs the previous day, week or month, in % |

Total sales = every item sent to the kitchen and not cancelled or voided, at the price on the order. Voided items are left out and counted on one line, so the total always matches what the kitchen received. Service charge, when the venue uses it, is shown on its own line and is not part of total sales. Each item's sales are credited to the waiter who placed it, even after a table hand-over.

#### How the owner or manager uses the bot

| Command or button | What happens |
| --- | --- |
| /start | Bot greets the user and asks for a link code |
| /link CODE | Connects this Telegram account to the person the code was made for; the code comes from the dashboard, works once and expires after 10 minutes. Sending just the code after /start works too |
| /daily | Today's report, with buttons for Yesterday or another date |
| /weekly | This week's report, with buttons for Last week or another week |
| /monthly | This month's report, with buttons for Last month or another month |
| /waiter | Pick a waiter, then a period: that waiter's orders, items and sales |
| /settings | Turn automatic sending on or off: daily at the end of the business day, weekly on Monday morning, monthly on the 1st |

Inline buttons (Today, Yesterday, This week, Last week, This month, Last month) mean nobody has to type commands.

#### Example daily report (sample numbers)

```text
Abebe Cafe — Daily report
Fri 30 Oct 2026 (Tikimt 20, 2019 E.C.)

Orders: 86   Items: 214   Total sales: 18,450.00 ETB

ITEMS SOLD
Shiro          28 x 180 = 5,040
Macchiato      62 x  40 = 2,480
...

PER WAITER
Hana     31 orders   77 items   6,720 ETB
Meron    29 orders   70 items   6,110 ETB
Dawit    26 orders   67 items   5,620 ETB
```

#### Rules

- **Who gets reports:** only Telegram accounts linked from the dashboard. Unlinking in the dashboard stops reports at once.
- **Link codes:** each code is made for one named owner or manager, works once and expires after 10 minutes. After 5 wrong codes from one Telegram chat in an hour, the bot stops accepting codes from that chat for the hour; a code is cancelled after 5 failed tries on it.
- **Business day:** each venue sets when its day starts (e.g. 06:00), so sales after midnight count in the right day. An order counts in the business day in which the server received it, in Addis Ababa time (UTC+3).
- **Weeks and months:** Gregorian or Ethiopian calendar, chosen per venue. Weeks always run Monday to Sunday. In the Ethiopian calendar, Pagume (the short 13th month) is reported as its own month.
- **Long reports:** Telegram limits a message to 4,096 characters, so a long monthly item list is split into several messages; a PDF or Excel file can be attached (P2).
- **Reliability:** reports are built in the cloud from the café's own database, so the owner gets them even when the café's internet is down or the café is closed. The same reports are available in the admin dashboard from any browser.
- **Later (P2):** voids and kitchen response times in the bot.

### 4.5 Support and maintenance (you, as the vendor)

- Set up each café in Cloudflare and pair its tablets with the owner
- Deploy updates with one command from GitHub; no visit to the café
- Watch free-plan usage and the nightly backup; alert the owner in Telegram if something fails

## 5. Speed, UX and other non-functional requirements

Speed is the top requirement. A waiter standing at the table must never wait for the app, and an order must appear in the kitchen the moment it is sent. Every design and tool choice below serves that.

| Area | Requirement | Target |
| --- | --- | --- |
| Speed | Waiter taps Send → ticket appears on the kitchen tablet | ≤ 0.5 s on a normal connection; measured from the café's own internet before launch |
| Speed | Kitchen taps Accept or Ready → alert on the waiter's tablet | ≤ 0.5 s |
| Speed | Any tap in the app (open category, add item, change quantity) | Responds in under 100 ms; no loading spinners |
| Speed | Open the app → floor map ready | ≤ 2 s; menu and tables are already on the tablet |
| Smoothness | Scrolling menus, opening screens, animations | 60 frames per second on the chosen tablets, no stutter |
| Speed | Telegram report reply | ≤ 5 s |
| Availability | Ordering | Needs the café's internet. If it drops, waiter tablets queue orders and send them when it returns; a 4G/5G backup line keeps this rare |
| Durability | Orders | No order lost; every order kept on the tablet until it is saved in the cloud, before the waiter sees "Sent ✓" |
| Capacity | Per café | 60 tables, 15 waiter tablets, 3 kitchen/bar tablets, 300 orders/hour, with no slowdown at peak |
| Cost | Hosting | Free: stays well inside Cloudflare's free-plan limits; usage checked every month (section 6) |
| Power | Devices | Waiter tablets last a full shift (≥ 8 h); router, backup router and kitchen tablet on a UPS (≥ 30 min) |
| Usability | New waiter | Trained in 30 minutes; enters a 4-item order in under 60 s |
| Usability | Kitchen tablet | Readable from 2 m; usable with wet or gloved hands (large buttons) |
| Security | Data in transit / at rest | All traffic encrypted (HTTPS / secure WebSocket); data encrypted at rest by Cloudflare |
| Localization | Text, money, dates | Amharic and English; ETB; Ethiopian and Gregorian calendar in reports |
| Retention | Sales records | Kept as long as Ethiopian tax law requires (confirm with a tax advisor). Until then, monthly archives in R2 are never deleted automatically |
| Maintainability | Updates | Remote updates; no technician visit |
| Observability | Speed and health | Every order's send-to-kitchen time is logged; the manager gets a Telegram alert if orders take over 1 s, a kitchen tablet is offline > 2 min, or a backup fails |

### How the system stays fast

- **One short trip to the cloud.** Each café's Durable Object is created with a location hint for the Cloudflare region closest to Ethiopia (confirmed by the pre-launch speed test), so each order makes one short round trip: tablet → Cloudflare → kitchen tablet.
- **Push, never poll.** Each tablet keeps one open WebSocket connection, and sends its commands (send round, accept, ready, cancel, delivered) over it. The cloud pushes a new order to the kitchen the instant it is saved, with no waiting for the next refresh.
- **The app never waits for the network to show something.** The menu, tables and photos are stored on each tablet, so browsing and building an order make no network calls at all.
- **Instant feedback.** When the waiter taps Send, the order shows "Sending" immediately and switches to "Sent ✓" when the cloud confirms. If the connection drops, it stays queued and sends automatically.
- **Small messages.** Only the new or changed order travels, never the whole screen or menu.
- **Database next to the code.** Each café's SQLite database lives inside its Durable Object, so saving an order takes milliseconds with no extra hop to a separate database.
- **Reports never slow ordering.** Running totals are updated as each order is saved, so a report reads a few small summary rows instead of scanning every order.
- **The café's connection is part of the system.** A good main line plus a 4G/5G backup router, and a dedicated 5 GHz staff Wi-Fi. A weak line causes more lag than any software choice.
- **Measured, not assumed.** The time from Send to the kitchen screen is recorded for every order, and the manager is alerted if it goes over 1 second.

### UI/UX rules for the waiter and kitchen apps

- **Two taps to add an item:** category, then item. Common items sit on a **Favourites** tab, and search finds any item in a few letters.
- **Big touch targets** (at least 48 dp), usable with one hand while holding a notepad or tray.
- **No page loads or spinners** during ordering; every screen is already on the tablet.
- **Clear feedback on every action:** a short vibration and a visible change on tap; a distinct sound for "Kitchen accepted" and a louder one for "Ready".
- **Smooth motion:** short, simple transitions (under 200 ms) that never block the next tap.
- **Readable in Amharic and English:** an Ethiopic font built into the app, large text, high contrast for bright and dim rooms.
- **Hard to make mistakes:** the order summary is always visible; removing an item is one tap with undo; nothing is sent until the waiter taps Send.
- **Kitchen screen designed for distance:** large ticket cards, colour timers, one big button per action.
- **Test on the real tablets** with real waiters before launch; fix any screen that feels slow.

## 6. System architecture

Recommended design: **Cloudflare Workers and Durable Objects, on the free plan.** Nothing runs in the café except the tablets and the router. Each café gets its own Durable Object: a small, always-available piece of server code in Cloudflare's network with its own SQLite database. It holds the café's live WebSocket connections and all its orders.

```text
 Waiter tablets ─┐                       ┌──────────────────────────────┐
 Kitchen / bar  ─┼── wss:// ──► API ────►│ Café Durable Object (1/café) │
 tablets        ─┘            Worker     │ SQLite + WebSockets          │
                                 │       └──────────────────────────────┘
 Admin dashboard ── https ───────┤                 ▲        │
 (behind Cloudflare Access)      ▼                 │        ▼ nightly export
                         ┌────────────────┐        │   ┌────────────┐
 Telegram ── webhook ──► │ Directory DO   │        │   │ R2 backups │
   │                     │ (lookups only) │        │   │ + archive  │
   ▼                     └────────────────┘        │   └────────────┘
 Bot Worker ───────────────────────────────────────┘
 Cron Triggers ── scheduled reports, backups ──────┘
```

Tablets connect over the internet with a secure WebSocket. The Telegram bot, scheduled reports and backups run in the same Cloudflare account, so reports work even when the café is closed or offline.

### Why Cloudflare

- **Built for real-time apps.** A Durable Object holds WebSocket connections and a SQLite database together. Durable Objects have been available on the Workers Free plan since April 2025 ([Cloudflare](https://developers.cloudflare.com/changelog/post/2025-04-07-durable-objects-free-tier/)).
- **Free, with room to spare.** The free plan includes 100,000 Durable Object requests per day ([Cloudflare](https://developers.cloudflare.com/durable-objects/platform/pricing)). Incoming WebSocket messages count 20 to one request, and outgoing messages and pings are free ([FlareCalc](https://flarecalc.com/)).
- **Nothing to run in the café.** No server computer to keep on, update or back up locally.
- **Connections survive quiet times.** With the WebSocket Hibernation API, an idle Durable Object can sleep without dropping the tablets' connections and wakes on the next message.
- **Simple Telegram bot.** Telegram sends bot messages straight to a Worker (webhook), so nothing has to poll.

### Trade-offs the client accepts

- **Orders need the internet.** If the café's connection drops, orders wait on the waiter tablets until it returns.
- **Speed depends on the connection.** On a good line the 0.5-second target is realistic; on a weak line orders lag.
- **Free plans can change.** On the free plan, going over a limit makes further requests of that type fail until the daily reset at 00:00 UTC, which is 03:00 in Addis Ababa ([Cloudflare](https://developers.cloudflare.com/durable-objects/platform/pricing)). Waiter tablets keep queuing orders meanwhile. The installer gets a Telegram alert at 50% and 80% of each daily limit, and the $5/month Workers Paid plan is ready to switch on the same day ([FlareCalc](https://flarecalc.com/)).
- **Data is stored outside Ethiopia** in Cloudflare's data centres (section 11).

### Components

| Component | Runs on | Responsibility |
| --- | --- | --- |
| Waiter app | Waiters' tablets or phones (Android app) | Floor map, take orders, accepted and ready alerts, close table |
| Kitchen app | Fixed kitchen tablet, locked in kiosk mode | Show tickets, accept, mark ready, mark sold out |
| Admin dashboard | Static web pages on Cloudflare behind Cloudflare Access, any browser | Menu, staff, devices, Telegram linking, today's sales |
| API Worker | Cloudflare | Checks the device token and connects each tablet to its café's Durable Object |
| Directory Durable Object | Cloudflare, one for the whole system | Answers "which café is this?" for requests that don't say: Telegram chat IDs, pairing and link codes, dashboard login emails, device tokens. Holds lookup rows only, never orders |
| Café Durable Object | Cloudflare, one per café | Holds all WebSocket connections, saves orders in SQLite, pushes orders to the kitchen and alerts to the right waiter, keeps running totals for reports |
| Telegram bot Worker | Cloudflare | Receives bot messages by webhook, gets report numbers from the café's Durable Object, replies |
| Scheduled jobs | Cloudflare Cron Triggers | Sends automatic daily, weekly and monthly reports; runs the nightly backup |
| Backup storage | Cloudflare R2 (free tier) | Nightly export of each café's database, 30 days kept; monthly archives in a separate folder, never deleted automatically |

### How data flows

1. Each tablet opens one secure WebSocket (`wss://`) to the API Worker, which looks up its device token and connects it to the café's Durable Object. Requests that don't name a café (Telegram webhook, pairing, dashboard login) first ask the Directory Durable Object which café they belong to.
2. A waiter taps Send: the round goes over the WebSocket with its idempotency key, the Durable Object saves it in SQLite, confirms to the waiter ("Sent ✓") and pushes it to the right station. When the kitchen taps Accept or Ready, it pushes the alert to the table's current waiter.
3. If the internet drops, the waiter's tablet keeps orders in a queue and shows "Waiting for internet"; they send automatically when it returns. The kitchen tablet shows a red "No connection" banner, so staff know to talk directly.
4. The owner taps **Today** in Telegram: Telegram calls the bot Worker, which asks the café's Durable Object for today's totals and replies within seconds.
5. Cron Triggers send automatic reports at the scheduled times and export the nightly backup to R2.

### When the café's internet is slow or down

| Situation | What happens | What staff do |
| --- | --- | --- |
| Slow internet | Orders arrive late; "Sending" shows longer on the waiter's tablet | If an order hasn't reached the kitchen in a few seconds, tell the kitchen in person |
| Internet down | Waiter tablets queue orders; kitchen tablet shows "No connection" | Keep entering orders (so sales are counted) and tell the kitchen in person. Queued orders arrive marked "sent while offline" so the kitchen knows they may already be made |
| Power cut | Router, backup router and kitchen tablet run on the UPS; waiter tablets on battery | Nothing |
| Telegram reports | Built in the cloud, so they keep working | Nothing |

### What the café needs on its side

- The best internet line available (fibre if possible) plus a 4G/5G backup router that switches over automatically.
- A strong, dedicated 5 GHz Wi-Fi network for staff tablets.
- A UPS for the router, backup router and kitchen tablet.
- A speed test before launch: send test orders at a busy hour and check the Send-to-kitchen time in the dashboard.

### Free-plan budget

Estimates for a busy café of about 1,000 orders a day; real usage is checked every month.

| Resource | Free-plan limit | Busy café (estimate) |
| --- | --- | --- |
| Durable Object requests | 100,000 per day | A few thousand per day |
| Storage | 1 GB per Durable Object, 5 GB per account ([Cloudflare](https://developers.cloudflare.com/durable-objects/platform/limits)) | A few hundred MB per year; order details older than 12 months move to the permanent R2 archive, summaries stay |
| Rows written | About 3 million per month ([FlareCalc](https://flarecalc.com/)) | About 20 rows per order, so well under the limit |

### Growing to many cafés later

Each new café is just another Durable Object with its own database, so the design already supports many cafés. When combined usage gets close to the free limits, move to the $5/month Workers Paid plan.

## 7. Data model

Each café's data lives in the SQLite database of its own Durable Object in Cloudflare. Every table also carries a `venue_id`, so a central system for many cafés can be added later without changing the data. Prices on an order are copied when the server receives the order, from the current menu (prices sent by a device are ignored), so later menu changes never alter old reports.

Rules for every table:

- **Money** is stored as whole santim (1 ETB = 100 santim), e.g. 18,450.00 ETB is `1845000`. Rounding happens only for display.
- **Time** is stored in UTC. Business days and report periods are computed in Addis Ababa time.
- **Nothing is hard-deleted.** Staff, menu items, tables and devices are deactivated, so old reports keep working.

| Entity | Key fields | Relations |
| --- | --- | --- |
| Venue | id, name, address, currency, VAT rate, prices include VAT (yes / no), service charge %, business-day start time, calendar (Ethiopian / Gregorian), languages | has Areas, Tables, Stations, Devices, Menus |
| Area / Table | id, venue\_id, name/number, seats, position on floor map, state | Table has many TableSessions |
| Station | id, venue\_id, name (Kitchen, Bar) | receives OrderItems routed by MenuItem |
| Device | id, venue\_id, type (waiter, station), station\_id, token hash, revoked\_at, last seen, battery, unsent rounds, app version | belongs to Venue |
| User | id, venue\_id, name, role (waiter, manager, owner), PIN hash, failed PIN attempts, locked until, email (for Cloudflare Access), active | belongs to Venue |
| Menu / Category | id, venue\_id, name (translations), sort order | Category has MenuItems |
| MenuItem | id, name + description (translations), price (santim), photo, station\_id, sold\_out, active | has ModifierGroups |
| ModifierGroup / Modifier | min/max choices, required; modifier name, extra price | belongs to MenuItem |
| TableSession (a table visit) | id, table\_id, waiter\_id (current waiter; changes on hand-over), guests, opened\_at, closed\_at, business\_day\_id, status (open, closed) | has Orders |
| Order (a round) | id (UUID v7, made on the device), idempotency key, session\_id, waiter\_id (who placed it; never changes), round number, created\_at (device clock), received\_at (server clock, used for sorting, timers and reports), sent while offline (yes / no) | has OrderItems; its status is derived from its items |
| OrderItem | id, order\_id, menu\_item\_id, name + price snapshot (santim), qty, modifiers snapshot, note, station\_id, status (sent, accepted, ready, delivered, cancelled, voided), sold-out flag, accepted\_at, ready\_at, void reason, voided\_by, approved\_by | belongs to Order |
| BusinessDay | id, venue\_id, date, opened\_at, closed\_at | has TableSessions |
| DailySummary | venue\_id, business\_day\_id, totals by category, item, hour, waiter | rolled up into weekly and monthly reports |
| Adjustment | id, business\_day\_id, reason, amount, made\_by, at | corrections after day close |
| OrderEvent | id, order\_id, type (including undo), payload, actor (user, or the station device for kitchen and bar), device\_id, seq, at | audit + sync log; never edited or deleted |
| TelegramLink | id, user\_id, telegram chat\_id, auto daily / weekly / monthly on or off, linked\_at | belongs to User (owner or manager) |

The **Directory Durable Object** (one for the whole system) holds only lookups, never orders:

| Entity | Key fields | Purpose |
| --- | --- | --- |
| ChatLink | telegram chat\_id, venue\_id, user\_id | Telegram webhook → café |
| Code | code hash, kind (pairing, telegram link), venue\_id, target user or device slot, expires\_at, failed attempts, used\_at | Pairing and link codes |
| DashboardUser | email, venue\_id, user\_id | Cloudflare Access login → café and role |
| DeviceToken | token hash, venue\_id, device\_id, revoked\_at | Tablet connection → café |

## 8. API and real-time events

Tablets keep one secure WebSocket open and send their **commands** over it (send a round, accept, ready, cancel, delivered, sold out). That is faster than a new HTTPS request, and on the free plan incoming WebSocket messages count 20 to one request, while every REST call counts as one. **REST** (JSON over HTTPS) is used for downloads, sign-in, pairing, the admin dashboard and reports. The API runs on Cloudflare Workers at the system's web address (e.g. api.yourcafeapp.com). The Telegram bot uses a webhook.

### WebSocket commands (tablet → server)

Every command carries an idempotency key, so a command sent twice (for example after a reconnect) is applied only once. The server answers each command with an acknowledgement or an error.

| Command | Sent by | Purpose |
| --- | --- | --- |
| `order.send` | Waiter | Send a round to the kitchen (order and item IDs are UUID v7 made on the tablet). The server prices it from the current menu |
| `item.cancel` / `item.change` | Waiter | Cancel or change an item before the kitchen accepts it; refused if Accept arrived first |
| `item.void` | Waiter + manager PIN | Void an accepted item, with a reason |
| `item.delivered` | Waiter | Mark delivered |
| `item.accept` / `item.ready` | Kitchen / bar station | Accept or mark ready, one item at a time |
| `undo` | Kitchen / bar station | Undo the station's last tap within 10 s |
| `menu_item.sold_out` | Kitchen / bar station, manager | Sold out / back in stock |
| `session.open` / `session.close` | Waiter | Open or close a table |
| `session.move` / `session.merge` / `session.transfer` | Waiter | Move, merge or hand over a table |

Only `order.send` and `session.open` may be queued on the tablet while offline. All the others need a live connection.

### Main REST endpoints

| Method | Path | Used by | Purpose |
| --- | --- | --- | --- |
| POST | /auth/pin | Waiter, manager | PIN sign-in on a paired device (checked by the server; 5 wrong tries lock the user for 5 minutes) |
| POST | /devices/pair | New tablet | Pair a device using a one-time code from the dashboard; returns the device token |
| GET | /menu?lang= | Waiter app | Full menu with sold-out flags |
| GET | /tables | Waiter app | Floor map with live table states |
| GET | /reports/{name}?period=day\|week\|month&date= | Manager, owner | Any report in section 4.4 (used by the bot and the dashboard) |
| GET, POST, PATCH | /admin/menu, /admin/categories, /admin/menu-items | Dashboard | Menu builder (no DELETE: items are deactivated) |
| POST | /admin/menu-items/{id}/photo | Dashboard | Upload a photo (type and size limited; stored in R2) |
| GET, POST, PATCH | /admin/areas, /admin/tables | Dashboard | Tables and floor map |
| GET, POST, PATCH | /admin/staff | Dashboard | Staff accounts, roles, PINs, deactivate |
| GET, POST | /admin/devices, /admin/devices/{id}/revoke | Dashboard | Pairing codes, device list, revoke (closes the device's connection) |
| GET, PATCH | /admin/venue | Dashboard (owner) | VAT, service charge, business day, calendar |
| POST | /telegram/link-codes | Owner, manager | Create a 10-minute code for a named owner or manager |
| POST | /telegram/webhook | Telegram | Receives bot commands and button taps (Telegram's secret token checked) |

All `/admin/*` routes sit behind Cloudflare Access; the API also checks that the signed-in email belongs to the café and has the right role.

### WebSocket channels (server → tablet)

Devices subscribe to the channels for their role; the server pushes events, never full screens.

| Channel | Subscribers | Events |
| --- | --- | --- |
| station:{id} | Kitchen / bar tablet | order.items\_added, item.changed, item.cancelled, item.voided |
| venue:{id}:waiters | All waiter tablets | table.state\_changed, menu.sold\_out |
| waiter:{id} | One waiter's tablet | item.accepted, item.ready and item.undone for tables she currently holds, table.transferred |
| venue:{id}:live | Manager dashboard | order.sent, order.ready, today's totals |

If a WebSocket drops, the device reconnects and asks for everything since its last sequence number, so nothing is missed.

## 9. Tech stack and tools

Recommendation: **Flutter for the waiter and kitchen apps; TypeScript on Cloudflare Workers and Durable Objects for the server.** Flutter keeps the apps smooth on mid-range tablets. Cloudflare runs the server code for free, with each café's SQLite database right next to the code, and needs no server in the café.

| Layer | Recommended | Alternative | Why it is fast |
| --- | --- | --- | --- |
| Waiter and kitchen apps | Flutter (Dart), built as a native Android app | Kotlin + Jetpack Compose (Android only) | Compiled to native code, no browser inside; smooth scrolling and animations on mid-range tablets; one codebase for both apps |
| State management in the apps | Riverpod | Bloc | Only the part of the screen that changed redraws |
| Storage on the tablets | SQLite on the device (drift) | Isar | Menu, tables and unsent orders load instantly with no network call |
| Fonts | Noto Sans Ethiopic bundled in the app | — | Amharic text renders correctly with no download delay |
| Server | TypeScript on Cloudflare Workers + Durable Objects | Go on an Oracle Cloud Always Free VM | Free plan, no server to manage, code and database in the same place, built-in WebSocket support |
| Real-time | WebSocket with the Durable Objects Hibernation API, one connection per tablet | Server-Sent Events | The server pushes each order the instant it is saved; reconnects automatically |
| Database | SQLite inside each café's Durable Object | PostgreSQL | The database lives with the code, so saving an order takes milliseconds with no extra hop |
| Admin dashboard | Small React + Vite site served from Cloudflare | React + Vite | Loads fast from Cloudflare's network; works from any browser, in or out of the café |
| Telegram bot | grammY (TypeScript) in a Worker, webhook mode | Telegraf | Telegram calls the Worker directly; reports read running totals, so they never slow the kitchen |
| Scheduler | Cloudflare Cron Triggers | — | Scheduled reports and the nightly backup |
| Auth | PIN sign-in checked by the server + random device token (only its hash stored, checked on every connect, revocable at once); dashboard behind Cloudflare Access (free up to 50 users) | — | Signing in is one quick PIN entry; no passwords for us to store |
| Installation | Wrangler (Cloudflare's command-line tool), run from GitHub Actions | Docker | One command deploys an update for every café; no café visit |
| Backup | Durable Objects point-in-time recovery (restore to any point in the last 30 days; confirm it's available on the Free plan) plus a nightly export to Cloudflare R2 (30 days kept) and monthly archives (kept) | Export to Google Drive | A second copy outside the live database, to recover from mistakes or bugs |
| Remote support | Cloudflare dashboard and Workers logs | — | See errors and usage for every café in one place |
| Device lockdown | Android Management API (free): kiosk mode and remote wipe on café-owned devices; a work profile on waiters' personal phones, so only the work profile can be wiped | Paid MDM (Esper, Scalefusion) | The kitchen tablet never leaves the app; staff cannot install other apps |
| Monitoring | Send-to-kitchen timing logged in the cloud; Telegram alerts (including free-plan usage at 50% and 80%); crash reports from the apps (Sentry free tier, with staff names and PINs removed) | Firebase Crashlytics | Slowdowns and crashes are seen before staff complain |
| CI/CD | GitHub + GitHub Actions | GitLab CI | Automated tests and builds |
| Design | Figma | Penpot | Clickable prototypes to test with real waiters before coding |
| Project tracking | Jira, Linear or GitHub Projects | Trello | Track the requirement IDs in this document |
| Docs | This document + an API spec in OpenAPI | — | Clear contract between the apps and the server |

**Why not a web app (PWA) on the tablets.** A browser-based app runs inside a WebView, which on mid-range Android tablets is slower to start and can stutter on long menus. A compiled Flutter app avoids that, and is the safer choice when speed is the top requirement.

**If the free plan is ever not enough**, Cloudflare's Workers Paid plan costs $5/month and raises the limits. **If the client later wants orders to keep flowing without internet**, the same Flutter apps can point to a local server instead; the app code barely changes.

## 10. Setup and day-to-day use

This section walks through how a café is set up and exactly what the owner or manager does to get reports.

### Hardware

A typical 20-table café needs a good internet line with a 4G/5G backup, a router, one tablet per waiter on shift plus a spare, one fixed kitchen tablet and a UPS. No server computer is needed. Prices change quickly, so get local quotes before you budget.

| Device | Minimum spec | Qty (20-table example) | Notes |
| --- | --- | --- | --- |
| Waiter tablet | Android 12+, 8 inch, 4 GB RAM, recent mid-range chip, battery for a full shift; test the app on one before buying several | 3–6 (one per waiter + 1 spare) | Case with hand strap; charging station at the counter |
| Kitchen tablet | Android 12+, 10–13 inch, 4 GB RAM, loud speaker | 1 (+1 for the bar, optional) | Wall or stand mounted, always on charger, away from heat and grease; screen never sleeps |
| Router + access points | Dual-band Wi-Fi with a dedicated 5 GHz network for staff tablets | 1–2 | Strong signal everywhere waiters stand and in the kitchen; add an access point near the kitchen if needed. Weak Wi-Fi causes more lag than anything else |
| Internet | Best line available (fibre if possible) plus a 4G/5G backup router with automatic switch-over | 1 | Required: every order goes through it. The backup line keeps orders flowing if the main line drops |
| UPS | Covers router, backup router and kitchen tablet for ≥ 30 min | 1 | Power cuts are the most common failure |

### One-time setup

1. **Create the accounts (once, by you).** A Cloudflare account on the free plan and a GitHub account for the code. Create the Telegram bot: in Telegram, open **@BotFather**, send `/newbot` and pick a name such as *Abebe Cafe Reports*. Store the bot token as a secret in Cloudflare, never in the code.
2. **Deploy the system.** One Wrangler command publishes the API, the café Durable Object, the bot and the admin dashboard. Point the bot's webhook to its Cloudflare address.
3. **Set up the café in the admin dashboard** (any browser, e.g. `https://admin.yourcafeapp.com`): add the café, build the menu, draw the floor map, add staff with their PINs, set the business-day start time.
4. **Prepare the café's network:** main internet line, 4G/5G backup router, strong 5 GHz staff Wi-Fi, and a UPS for the router and kitchen tablet.
5. **Set up the tablets.** Install the app, connect each waiter tablet and the kitchen tablet to the staff Wi-Fi and pair it with a code from the dashboard. Mount the kitchen tablet.
6. **Measure the speed.** Send test orders at a busy hour and check the Send-to-kitchen time in the dashboard. If it is over 0.5 s, fix the network before going live.
7. **Check the backup.** Confirm point-in-time recovery is on and the first nightly export appears in R2, and follow the restore runbook once on a test café.
8. **Test and train.** Train waiters (30 minutes) and kitchen staff (10 minutes), including what to do when the "No connection" banner appears.

### Linking the owner and manager (once per person)

1. The owner or manager opens the admin dashboard, goes to **Telegram**, picks the person to link and clicks **Create link code**. The dashboard shows a 6-digit code that works once, for 10 minutes, e.g. `482913`. (Managers can create codes only for manager accounts; the owner links themselves.)
2. The owner opens Telegram on their phone, searches for the bot by name and taps **Start**.
3. The bot asks for the code. The owner sends `482913`.
4. The bot replies: "Linked. You will receive reports for Abebe Cafe."

Only linked accounts get reports. If a stranger finds the bot, it ignores them.

### Getting a report

The owner doesn't need to be in the café; any place with internet works. They open the bot chat and tap a button:

```text
[ Today ]       [ Yesterday ]
[ This week ]   [ Last week ]
[ This month ]  [ Last month ]
[ By waiter ]
```

Within a few seconds the bot replies with the report (example in section 4.4): number of orders, each item sold with quantity and amount, total sales, and orders and sales for each waiter. **By waiter** asks which waiter, then which period.

For automatic reports, the owner sends `/settings` and switches on any of: daily at the end of the business day, weekly on Monday morning, monthly on the 1st. Those reports then arrive without the owner doing anything.

### What happens behind the scenes

When the owner taps **Today**, Telegram sends the tap to the bot's web address on Cloudflare (a webhook). The bot asks the café's Durable Object for today's totals, builds the message and replies through Telegram. Because reports are built in the cloud, they work even when the café's internet is down or the café is closed.

### Things to know

- **Reports work anytime, from anywhere**, even when the café is closed or offline.
- **Orders need the café's internet.** If it drops, waiter tablets queue orders and send them when it returns; the kitchen tablet shows "No connection" so staff talk directly in the meantime.
- **A power cut** is covered by the UPS for the router, backup router and kitchen tablet; waiter tablets run on battery.
- **Broken hardware is easy to replace.** All data is in the cloud, so a new tablet or router is set up and paired in minutes.

## 11. Local considerations (Ethiopia)

### Payments and tax receipts

The system does not take payments or print bills or receipts. Customers pay the way they do today, and the venue keeps using its existing cash register or receipt system for tax receipts.

This matters because Ethiopia's new e-invoicing directive (No. 1142/2026) requires approved sales software that issues invoices and receipts to connect to the Ministry of Revenue's registration system, renew its licence every two years and post a financial guarantee ([Regfollower](https://regfollower.com/ethiopia-introduces-electronic-invoicing-directive/)). Because this system only routes orders to the kitchen and reports sales internally, it most likely falls outside those rules; confirm this with a tax advisor before launch. If bills or payments are added later, the software would need to meet them, for example by working through an approved provider.

### Other local needs

- **Language:** Amharic first-class (Ethiopic font, correct line height, no truncated words); English second; Afaan Oromo and Tigrinya configurable.
- **Currency:** ETB, prices shown with 2 decimals or rounded per venue setting.
- **Calendar:** show both Ethiopian and Gregorian dates in reports; store everything in UTC internally.
- **Menu tags:** fasting (ጾም) and non-fasting labels, since many customers filter by this.
- **Power and internet:** orders need the internet; see the backup line, UPS and offline queue in sections 6 and 10.
- **Data residency:** orders, staff names and backups are stored in Cloudflare data centres outside Ethiopia. There is no customer data, but check current Ethiopian data-protection rules with the client.

## 12. Security and privacy

With waiters entering every order, the main risks are misuse of voids, shared logins and lost devices, so controls focus there.

| Threat | Control |
| --- | --- |
| Waiter removes an item after the kitchen accepted it | Removing an item after the kitchen accepts is a void that needs a manager PIN and a reason; void report per waiter |
| Orders entered under someone else's name | Personal PINs checked by the server, auto sign-out after inactivity, no shared accounts |
| Guessing a PIN (e.g. a manager PIN to approve voids) | After 5 wrong tries the user is locked for 5 minutes on the server, and the manager gets a Telegram alert; manager PINs are 6 digits; PIN hashes never leave the server |
| Tampered prices from the device | Server recalculates every total from the menu; device prices are ignored |
| Food leaves the kitchen without an order | Kitchen cooks only from tickets; nothing appears without a waiter and table attached |
| Stolen or lost tablet | Device token checked on every connect and revocable at once (its open connection is closed); remote wipe through Android Management API on café-owned devices; the dashboard warns if the device still has unsent rounds |
| Waiters using personal phones | Work profile through Android Management API (only the work profile can be wiped); device token revoked when the waiter leaves; personal phones cannot be locked in kiosk mode |
| Network attacks in the venue | Staff devices on their own Wi-Fi; all traffic encrypted (HTTPS / secure WebSocket); Cloudflare filters attacks |
| Owner account takeover | Dashboard behind Cloudflare Access (one-time email codes or Google login, so we store no passwords); the app still checks which café each signed-in email belongs to |
| Attacks on the admin dashboard | Strict CORS between the dashboard and API addresses, CSRF protection on every change, all menu and staff text escaped on display, photo uploads limited by type and size and stored in R2 |
| Data loss | Point-in-time recovery plus a nightly export to Cloudflare R2 (30 days kept) and monthly archives (kept); restore tested every 3 months; nothing is hard-deleted; tablets block sign-out while rounds are unsent |
| A stranger messages the Telegram bot | The bot answers only linked accounts; link codes are made for one named person, work once, expire after 10 minutes and are rate-limited per chat; the bot token is a Cloudflare secret, and the webhook checks Telegram's secret token |
| Cloudflare or GitHub account taken over | 2FA on both accounts; only you hold admin access; deploy keys kept as GitHub secrets |
| Someone calls the API without a paired tablet | Every request needs a paired device token; tokens can be revoked from the dashboard at once; pairing codes work once, expire after 10 minutes and are rate-limited |

Privacy: the system stores no customer data. It keeps only orders, staff names and the Telegram chat IDs of the owner and manager. The installer (you) can technically access every café's data through Cloudflare; the client contract and privacy policy must say so.

## 13. Roadmap

Build the smallest version that covers the core loop (waiter tablet → kitchen tablet → Ready alert → Telegram reports), prove it in 2–3 real cafés, then add features. Durations assume a team of 3–4 developers and a designer; adjust to your team.

> **TODO:** the roadmap diagram (4 phases, 3 gates) did not survive the export of this document. Re-create it from the original.

Each diamond is a gate: do not start the next phase until its condition is met. The MVP is every requirement marked MVP in section 4; P2 items come in "Launch and grow", P3 items after.

## 14. Risks, open questions and decisions

### Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Waiters find the tablet slower than paper at first | Resistance, slow service | Favourites and search, big buttons, 30-minute training, start with one shift |
| Waiter tablet battery dies mid-shift | Orders cannot be entered | Spare tablet, charging station, low-battery alert, sign in on any tablet |
| Kitchen ignores or misses the tablet | Late food | Loud alerts, colour timers, "not accepted" warning to the waiter, manager live view |
| Staff abuse voids | Lost revenue, distrust | Manager PIN for voids; voids per waiter in the reports (P2) |
| Tax rules treat the system as sales software | Cafés cannot legally use the system | Keep bills and payments out of the system; confirm with a tax advisor early |
| Internet or power cut at the café | Orders reach the kitchen late | 4G/5G backup router, UPS, order queue on tablets, "No connection" banner so staff talk directly |
| Building too much before selling | Wasted months | Ship the MVP to 2–3 pilot cafés first |
| Telegram unreachable for a while | Owner gets no reports | Messages queue and retry; same reports in the dashboard; email as a later backup |
| Waiter misses the Ready alert | Food gets cold | Repeat alert after 2 minutes; kitchen sees "not picked up" and can call her |
| Cloudflare changes or limits the free plan | Requests fail until the daily reset, or features stop | Usage alert at 50% of each limit; budget $5/month for Workers Paid as a fallback |
| Slow internet at the café | Orders lag; bad customer experience | Measure before launch; fibre plus 4G/5G backup; Send-to-kitchen time alerts; consider a local server if the target can't be met |

### Decisions to make before design starts

- [ ] Target venue first: small cafés, full restaurants, or hotel restaurants?
- [x] Waiter device: café tablets, or waiters' own phones with a work profile (see section 12 and `docs/decisions.md`)
- [ ] Business-day start time, and Ethiopian or Gregorian months for monthly reports?
- [ ] Who gets Telegram reports, and which automatic reports (daily, weekly, monthly) are switched on?
- [ ] Business model: one-time installation fee, monthly support fee, or both? Do you also sell or rent hardware?
- [ ] Internet: main line and 4G/5G backup provider, and the client's written acceptance that orders need the internet
- [ ] Team: how many developers, and which stack do they already know?
- [ ] Are menu prices VAT-inclusive? (ask the pilot café; the system supports both)
- [ ] How many years must sales records be kept? (ask a tax advisor)
- [ ] Client contract: terms covering the installer's access to café data

Decisions already made are recorded, with reasons, in `docs/decisions.md`.

### Other documents to prepare

This document is the product and architecture overview. The full documentation set usually also includes:

1. **UI/UX design**: wireframes and clickable Figma prototype for each app
2. **API specification**: OpenAPI file for every endpoint and event
3. **Database schema**: tables, columns, indexes, migrations
4. **Test plan**: unit, integration, offline and load tests; pilot acceptance criteria
5. **Deployment and operations runbook**: Cloudflare setup, backups and restore, incident response
6. **Venue onboarding guide** and **staff training guide** (Amharic and English)
7. **Privacy policy and terms of service**

## Sources

- [Regfollower — Ethiopia introduces electronic invoicing directive](https://regfollower.com/ethiopia-introduces-electronic-invoicing-directive/)
- [Cloudflare — Durable Objects on Workers Free plan](https://developers.cloudflare.com/changelog/post/2025-04-07-durable-objects-free-tier/)
- [Cloudflare — Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing)
- [Cloudflare — Durable Objects limits](https://developers.cloudflare.com/durable-objects/platform/limits)
- [FlareCalc — Cloudflare free tier overview](https://flarecalc.com/)
