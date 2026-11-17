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
"Build the app for this PC". If it says `http://192.168.1.3:8787`, the app built on 17 Nov is
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

## Part 4: The real kitchen screen (needs a second phone or tablet)

The **same app** becomes the kitchen screen when you pair it with the **KITCHEN** code.
Install `app-debug.apk` on the second device the same way as in Part 2.

1. Second device: open **cafe_tablet** → type the **KITCHEN PAIRING CODE** from Part 1.
   (Expired? Close the KITCHEN window, double-click `phone-test` again, use the new code.)
2. ✅ The top bar says **Kitchen**, and the screen says
   "No orders. New orders appear here by themselves."

The pretend kitchen (black window) keeps working too: both see the same orders. Use the real
screen for these tests.

### Test 8: A new order
- [ ] Phone: send **2× Shiro** to Table 2.
- [ ] Kitchen screen: a **sound** plays, the screen **flashes**, a card shows **Table 2**,
      **Hana**, **2× Shiro**.

### Test 9: Accept, Ready and Undo
- [ ] Kitchen screen: tap **Accept** → the phone plays a soft sound.
- [ ] Tap **Ready** → the phone **rings**. The kitchen line says **Waiting for pickup**.
- [ ] Send another dish, tap **Accept**, then **Undo** within 10 seconds → back to **Accept**.
- [ ] After 10 seconds the **Undo** button is gone.

### Test 10: Timers (needs 15 minutes)
- [ ] Send a dish, don't accept it. After **10 minutes** the card's border turns **amber**.
- [ ] After **15 minutes** it turns **red**.

### Test 11: Sold out
- [ ] Kitchen screen: tap **Sold out** (top right) → switch **Tibs** on → it says **SOLD OUT**.
- [ ] Phone: Tibs is **greyed out** in the menu. Switch it off again → Tibs is back.

### Test 12: Stays on, and reconnects
- [ ] Leave the kitchen screen alone for 5 minutes: the screen **does not turn off**.
- [ ] Kitchen device: **Wi-Fi off** → red bar "**No connection**". Phone: send a dish.
- [ ] Kitchen device: **Wi-Fi on** → the dish appears by itself, with **one** sound.

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

To copy text from a black window: select it with the mouse, press **Enter**, then paste with **Ctrl+V**.

When you finish, tell Claude: **phone brand and model**, **what happened in Test 3**, and (if you
did Part 4) the **kitchen device's brand and model** and which of Tests 8–12 failed.
