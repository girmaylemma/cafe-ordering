# Testing the waiter app on your phone

Your **phone** and your **PC** must be on the **same Wi-Fi**.

You do **not** need to type commands. You double-click one file.

---

## Part 1: Start everything (on the PC)

1. Open **File Explorer** (the yellow folder icon at the bottom of the screen).
2. Click in the address bar at the top, paste this, press **Enter**:

   ```
   C:\Users\lenovo\Projects\cafe-ordering
   ```

3. Find the file **`phone-test`** (its icon is a small window with gears). **Double-click it.**
   If Windows says "Windows protected your PC": click **More info** → **Run anyway**.

4. Now **two black windows** are open:

   | Window title | What it is | What you do |
   |---|---|---|
   | **CAFE SERVER - keep this window open** | the server | **Nothing.** Don't close it. If Windows asks about Node.js: tick **Private networks** → **Allow access**. |
   | **CAFE KITCHEN (pretend) - phone test** | the kitchen | You type here later. |

5. Wait. In the **KITCHEN** window you see `Waiting for the server to start...`, then green ✓ lines,
   then a box:

   ```
   PHONE PAIRING CODE:     543696      (works for 10 minutes)
   KITCHEN PAIRING CODE:   817204      (a 2nd phone/tablet = kitchen screen)
   ```

   📝 Write down both codes. Then you see `Connected. Waiting for orders...` ✅
   The kitchen code is only for Part 4 (a second device). Skip it if you have one phone.

> Code too old (more than 10 minutes)? Close **only** the KITCHEN window and double-click
> `phone-test` again. You get a new code. The server window can stay open.

---

## Part 2: The app on the phone

### Only if the app is not on the phone yet, or your PC's address changed

The app must know your PC's address. In the KITCHEN window, look at the line under
"Build the app for this PC". If it says `http://192.168.1.6:8787`, the app built on 18 Nov is
correct: skip to "Open the app" below. If the address is different, ask Claude to rebuild it.

To copy the app to the phone:
1. PC: open **Telegram Desktop** → **Saved Messages** → click 📎.
2. Paste this in the file box's address bar and press Enter:
   `C:\Users\lenovo\Projects\cafe-ordering\apps\tablet\build\app\outputs\flutter-apk`
3. Choose **`app-debug.apk`** → **Send**.
4. Phone: Telegram → **Saved Messages** → tap the file → **Install** (or **Update**).
   If asked: **Allow** installing from Telegram. If warned: **Install anyway**.

### Open the app
1. Open **cafe_tablet** on the phone.
2. Type the **pairing code** from Part 1.
3. Tap **Hana**, type PIN **1234**.
4. Two questions appear: tap **Allow** both times.
5. ✅ You see the tables, and a notification **"Café: alerts are on"**.

---

## Part 3: The tests

You are the waiter (phone) **and** the kitchen (the KITCHEN window on the PC).
In the KITCHEN window you type a short command and press **Enter**:

| Type | Means |
|---|---|
| `a 1` | accept item 1 |
| `r 1` | item 1 is ready |
| `u 1` | undo the last tap on item 1 (within 10 seconds) |
| `l` | show the list again |

Tick each box when it works. If not, write down what you did and what you saw.

### Test 1: Send an order
- [ ] Phone: tap **Table 1** → **Add items** → **Food** → tap **Shiro** two times → **Send to kitchen**.
- [ ] KITCHEN window shows **`NEW: 1. 2× Shiro`**.

### Test 2: Sounds (phone unlocked)
- [ ] KITCHEN: type `a 1` → phone plays a **soft sound**.
- [ ] KITCHEN: type `r 1` → phone **rings loud, vibrates**, orange box "**Table 1 — ready**".
- [ ] Wait **2 minutes**, touch nothing → it rings **once more**.
- [ ] Phone: tap the Shiro line → **Delivered**.

### Test 3: Phone locked (the most important)
- [ ] Phone: send **Tibs** to Table 1. KITCHEN: type `a 2`.
- [ ] **Lock the phone**, put it in your pocket, wait **5 minutes**.
- [ ] KITCHEN: type `r 2` → the phone in your pocket **rings and vibrates**.
- [ ] Do it again, but wait **30 minutes**.

### Test 4: Undo
- [ ] Send **Firfir**. KITCHEN: `a 3`, then `r 3`, then quickly `u 3`.
- [ ] Phone shows "**not ready yet**".

### Test 5: Mistakes
- [ ] Send Shiro. **Before** typing `a`: phone → tap it → **Cancel item** → crossed out.
- [ ] Send Shiro, KITCHEN `a N`. Phone → tap it → **Void…** → write a reason → tap **Meron** →
      PIN `111111` → "**Wrong manager PIN**". Again with **246810** → crossed out.

### Test 6: No internet
- [ ] Phone: **Wi-Fi off**. Send an order → "**Waiting for internet**".
- [ ] **Wi-Fi on** → the order appears in the KITCHEN window by itself.

### Test 7: Close the table
- [ ] Everything Delivered. Phone: **⋮** (top right) → **Close table** → **Close**.
- [ ] Back at the tables; Table 1 is free.

---

## Part 4: The real kitchen screen (needs TWO devices)

In this part you use **two devices** and **one PC**:

| Name in this guide | Which device | What it is |
|---|---|---|
| **PHONE** | your phone (the Oppo) | the waiter |
| **KITCHEN** | a second phone or tablet (any Android) | the kitchen screen |
| **PC** | your computer | the server. You only start it. |

> 🚫 **Don't type in the black KITCHEN window on the PC during Part 4.** It is a pretend kitchen,
> and it would accept orders before your real KITCHEN device can.

Every step below starts with **where** you do it. Tick each box. If something is different from
"✅ You should see", **stop, write down the step number and what you saw**, and go on to the next test.

### Step A: Get ready (once, about 10 minutes)

- [ ] **A1. Both devices:** connect to the **same Wi-Fi as the PC**. Not mobile data.
- [ ] **A2. KITCHEN device:** if `cafe_tablet` is already on it, **uninstall it first**
      (hold the icon → **Uninstall**). A device paired as a waiter stays a waiter.
- [ ] **A3. Both devices:** install the **new** `app-debug.apk` (built 17 Nov), the same way as in Part 2.
      On the PHONE choose **Update**. Your old pairing stays.
- [ ] **A4. PC:** double-click `phone-test` (as in Part 1). Write down the **KITCHEN PAIRING CODE**.
      You have **10 minutes** to use it.
- [ ] **A5. KITCHEN device:** open **cafe_tablet**. You see "**Pair this tablet**".
      Type the KITCHEN code → tap **Pair**.
      ✅ You should see a top bar that says **Kitchen**, and the text
      "No orders. New orders appear here by themselves."
- [ ] **A6. KITCHEN device:** turn the **media volume** up to the top (play a video, press volume up).
- [ ] **A7. PHONE:** open **cafe_tablet**. If it asks for a code, use the **PHONE PAIRING CODE**.
      Tap **Hana**, PIN **1234**. ✅ You see the tables.
- [ ] **A8.** Put both devices **next to each other** on the table, screens up.

### Test 8: A new order arrives

| # | Where | Do | ✅ You should see |
|---|---|---|---|
| 8.1 | PHONE | Tap **Table 2** → **Add items** → **Food** → tap **Shiro** two times → **Send to kitchen** | the phone says Sent |
| 8.2 | KITCHEN | Just watch, touch nothing | within 1 second: a **sound**, the screen **flashes**, and a card: **Table 2**, **Hana**, **2× Shiro** with an **Accept** button |

- [ ] Test 8 works

### Test 9: Accept, Ready, Undo

| # | Where | Do | ✅ You should see |
|---|---|---|---|
| 9.1 | KITCHEN | Tap **Accept** on Shiro | the button changes to **Ready**, and an **Undo** button appears |
| 9.2 | PHONE | Just listen | a **soft sound** |
| 9.3 | KITCHEN | Tap **Ready** | the line says **Waiting for pickup** |
| 9.4 | PHONE | Just watch | it **rings loud**, orange box "**Table 2 — ready**" |
| 9.5 | PHONE | Tap the Shiro line → **Delivered** | on the KITCHEN, the Table 2 card **disappears** |
| 9.6 | PHONE | Send **Tibs** to Table 2 | KITCHEN shows the new card |
| 9.7 | KITCHEN | Tap **Accept**, then **within 10 seconds** tap **Undo** | the **Accept** button is back |
| 9.8 | KITCHEN | Tap **Accept** again and **wait 15 seconds**, touch nothing | the **Undo** button is **gone** |

- [ ] Test 9 works

### Test 10: Timers (takes 15 minutes, so do it while you do Test 11 and 12)

| # | Where | Do | ✅ You should see |
|---|---|---|---|
| 10.1 | PHONE | Send **Firfir** to **Table 3**. **Don't** accept it on the KITCHEN | a new card, normal border |
| 10.2 | KITCHEN | Wait **10 minutes** | the Table 3 card's border is **amber (orange-yellow)** |
| 10.3 | KITCHEN | Wait **5 more minutes** (15 in total) | the border is **red** |

- [ ] Test 10 works

### Test 11: Sold out

| # | Where | Do | ✅ You should see |
|---|---|---|---|
| 11.1 | KITCHEN | Tap **Sold out** (top right) → switch **Tibs** on | under Tibs it says **SOLD OUT** in red |
| 11.2 | PHONE | Tap a table → **Add items** → **Food** | **Tibs is grey**, tapping it does nothing |
| 11.3 | KITCHEN | Switch **Tibs** off → tap the back arrow ← | back at the orders |
| 11.4 | PHONE | Look at the menu again | Tibs is **normal** again, you can tap it |

- [ ] Test 11 works

### Test 12: Screen stays on, and the kitchen catches up after no internet

| # | Where | Do | ✅ You should see |
|---|---|---|---|
| 12.1 | KITCHEN | Touch nothing for **5 minutes** | the screen **stays on** (doesn't go dark) |
| 12.2 | KITCHEN | Turn **Wi-Fi off** | a **red bar** at the top: "No connection: new orders cannot arrive…" |
| 12.3 | PHONE | Send **Shiro** to **Table 1** | KITCHEN shows **nothing new** (it has no internet) |
| 12.4 | KITCHEN | Turn **Wi-Fi on**, wait up to 30 seconds | the red bar goes away, the Table 1 card appears, **one** sound (not many) |

- [ ] Test 12 works

### Finished Part 4

Write down for Claude:
1. The **KITCHEN device's brand and model** (Settings → About phone).
2. Which steps did **not** match "✅ You should see" (for example "9.4: no ring"), and what you saw instead.

---

## Part 5: Try the languages (one phone is enough)

The language button (top right) shows the language you see now (**EN**, **አማ**, **OM**, **ትግ**).
Tap it to get the list of all four: English, አማርኛ, Afaan Oromoo, ትግርኛ.

| # | Where | Do | ✅ You should see |
|---|---|---|---|
| 5.1 | PHONE | Signed in as Hana, on the tables screen: tap **EN** (top right) → **አማርኛ** | at once, every text is Amharic; the button now says **አማ** |
| 5.2 | PHONE | Tap a table → **Add items** (ትዕዛዝ ጨምር) → the **ምግብ** tab | dishes show **ሽሮ** big with **Shiro** small under it |
| 5.3 | PHONE | Send a dish. KITCHEN window: `a N`, then `r N` | the alert is in Amharic, e.g. "Table 1 — ዝግጁ ነው፦ 1× ሽሮ (Shiro)" |
| 5.4 | PHONE | Sign out (top right), sign in again as Hana | still Amharic (your choice was saved on the server) |
| 5.5 | PHONE | Wi-Fi **off**, tap **አማ** → **English**, Wi-Fi **on** | switches to English at once, even offline |
| 5.6 | PHONE | Sign out | the PIN screen is in the café's language (English, until Part 6 changes it) |
| 5.7 | KITCHEN device (if you have one) | Tap **EN** → **አማርኛ** on the kitchen screen | the kitchen screen is Amharic; the waiter's phone is not affected |
| 5.8 | PHONE | Tap the button → **Afaan Oromoo**, then → **ትግርኛ** | Oromo texts with **Shiro** first; Tigrinya texts with **ሽሮ** first (Oromo and Tigrinya texts are drafts) |

📝 While you look: write down any Amharic that sounds wrong or unnatural. You will review all
texts in F4d, but notes from real use are the most useful.

## Part 6: The café language in the dashboard (F4c)

Needs Part 1 running (the server window). The dashboard logs you in as the Dev Cafe's first manager ("Dev Manager").

1. Open a **new** PowerShell window: `cd admin` then `npm.cmd run dev` (the first time: `npm.cmd ci` before it).
   Use `npm.cmd`, not `npm`: Windows PowerShell blocks `npm` ("running scripts is disabled on this system").
2. On the PC, open http://localhost:5173/admin/#settings

| # | Where | Do | ✅ You should see |
|---|---|---|---|
| 6.1 | PC | Settings page | **Café language: English**; the **Save** button is grey until you change it |
| 6.2 | PC | Choose **አማርኛ (Amharic)** → **Save** | "Saved. Tablets switch the next time they start or reconnect." |
| 6.3 | PHONE | Sign out | the PIN screen is in **Amharic** (the PIN screen downloads the café language each time it opens) |
| 6.4 | PC | **Staff** tab | a **Language** column: Hana shows what she chose in Part 5; someone who never chose shows **Café default** |
| 6.5 | PHONE | Sign in as someone who never chose a language (e.g. Abel) | the app is in Amharic (they follow the café) |
| 6.6 | PC, then PHONE | Settings → back to **English** → Save; on the phone sign out | the PIN screen is English again |

---

## When you are finished
Close both black windows (the X at the top right). That stops everything.

## Something wrong?

| What you see | What to do |
|---|---|
| KITCHEN window: "The server is not running" | Did the SERVER window close or show red text? Copy its text and send it to Claude. |
| Phone: "No connection to the server" | Is the SERVER window open? Phone on the same Wi-Fi (not mobile data)? |
| Phone: the code doesn't work | Too old: close the KITCHEN window, double-click `phone-test` again. |
| No sound | Turn up the phone's **media** volume (play a video, press volume up). |
| No ring when locked | Phone Settings → Apps → **cafe_tablet** → Battery → **Unrestricted**. |
| KITCHEN device shows **staff names or tables**, not "Kitchen" | It was paired with the PHONE code. Uninstall the app on it, install again, use the **KITCHEN** code (step A2–A5). |
| KITCHEN device: no new orders, no red bar | Did someone type `a` in the black window? Don't use it in Part 4. |

To copy text from a black window: select it with the mouse, press **Enter**, then paste with **Ctrl+V**.

When you finish, tell Claude: **phone brand and model**, **what happened in Test 3**, and (if you
did Part 4) the **kitchen device's brand and model** and which of Tests 8–12 failed.
