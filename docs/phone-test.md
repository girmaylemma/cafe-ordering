# Testing the waiter app on your phone

Your **phone** and your **PC** must use the **same Wi-Fi**.
You will open **3 blue PowerShell windows** on the PC. Keep them all open until you finish.

---

## Step 1: Window 1, the server

1. Press the **Windows key**, type `powershell`, press **Enter**. A blue window opens.
2. Copy this line, right-click inside the window to paste, press **Enter**:

   ```powershell
   cd C:\Users\lenovo\Projects\cafe-ordering\server; node scripts/dev-access-vars.mjs; npx.cmd wrangler dev --ip 0.0.0.0
   ```

3. Wait until you see **`Ready on`**.
4. If a Windows box asks about **Node.js**: tick **Private networks**, click **Allow access**.

✋ **Leave this window open. Don't type in it again.**

> Why `npx.cmd` and not `npx`? Windows PowerShell blocks script files by default, and `npx` is one
> (`npx.ps1`: "running scripts is disabled on this system"). `npx.cmd` does the same job and is not blocked.

---

## Step 2: Window 2, the setup

1. Open a **new** PowerShell window (Windows key → `powershell` → Enter).
2. Paste this and press **Enter**:

   ```powershell
   cd C:\Users\lenovo\Projects\cafe-ordering\server; node scripts/dev-phone-test.mjs
   ```

3. You see green ✓ lines, then a box like this:

   ```
   PHONE PAIRING CODE:   225358
   ```

   📝 **Write down the code.** It works for 10 minutes.
   (Too late? Paste the same line again: you get a new code.)

4. Below the box there is a line starting with **`flutter build apk`**. Leave it there; you need it in Step 3.

---

## Step 3: Build the app (same Window 2)

1. Paste this and press **Enter**:

   ```powershell
   cd C:\Users\lenovo\Projects\cafe-ordering\apps\tablet
   ```

2. Copy the **`flutter build apk ...`** line that Step 2 printed (it has your PC's address in it),
   paste it, press **Enter**.
3. Wait (a few minutes) until you see **`Built build\app\outputs\flutter-apk\app-debug.apk`**.

---

## Step 4: Put the app on the phone

1. On the PC, open **Telegram Desktop** → **Saved Messages**.
2. Click the 📎 paperclip → go to
   `C:\Users\lenovo\Projects\cafe-ordering\apps\tablet\build\app\outputs\flutter-apk`
   → choose **`app-debug.apk`** → **Send**.
3. On the **phone**, open Telegram → **Saved Messages** → tap the file.
4. If the phone asks "allow installing apps from Telegram?" → **Allow**. Then **Install**.
   If it warns "unknown app" → **Install anyway** (it's your own app).

---

## Step 5: Window 3, the pretend kitchen

1. Open a **new** PowerShell window.
2. Paste this and press **Enter**:

   ```powershell
   cd C:\Users\lenovo\Projects\cafe-ordering\server; node scripts/dev-kitchen.mjs
   ```

3. You see **`Connected. Waiting for orders...`**

This window is the kitchen. You talk to it by typing:

| Type this | It means |
|---|---|
| `a 1` then Enter | kitchen **accepts** item 1 |
| `r 1` then Enter | item 1 is **ready** |
| `u 1` then Enter | **undo** the last tap on item 1 (within 10 seconds) |

---

## Step 6: Open the app on the phone

1. Open **cafe_tablet**.
2. Type the **pairing code** from Step 2.
3. Tap **Hana**, type PIN **1234**.
4. The phone asks two questions: tap **Allow** both times.
5. ✅ You see the tables, and a notification **"Café: alerts are on"**.

---

## The tests

Tick each box when it works. If something doesn't, write down **what you did** and **what you saw**.

### Test 1: Send an order
- [ ] Tap **Table 1** → **Add items** → **Food** → tap **Shiro** twice → **Send to kitchen**.
- [ ] Window 3 shows **`NEW: 1. 2× Shiro`**.

### Test 2: Sounds (phone unlocked)
- [ ] Window 3: type `a 1` → phone plays a **soft sound**.
- [ ] Type `r 1` → phone plays a **loud sound, vibrates**, orange box "**Table 1 — ready**".
- [ ] Wait **2 minutes**, touch nothing → it rings **once more**.
- [ ] On the phone tap the Shiro line → **Delivered** → it says "Delivered".

### Test 3: Phone locked (the most important one)
- [ ] Phone: send **Tibs** to Table 1. Window 3: type `a 2`.
- [ ] **Lock the phone**, put it in your pocket, wait **5 minutes**.
- [ ] Window 3: type `r 2` → the phone in your pocket **rings and vibrates**.
- [ ] Do it again, but wait **30 minutes** before typing `r`.

### Test 4: Undo
- [ ] Send **Firfir**. Type `a 3`, then `r 3`, then quickly `u 3`.
- [ ] Phone shows "**not ready yet**".

### Test 5: Mistakes
- [ ] Send Shiro, and **before** typing `a`: tap it on the phone → **Cancel item** → it is crossed out.
- [ ] Send Shiro, type `a N`. Tap it → **Void…** → write a reason → tap **Meron** → PIN `111111`
      → "**Wrong manager PIN**". Try again with **246810** → it is crossed out.

### Test 6: No internet
- [ ] Turn the phone's **Wi-Fi off**. Send an order → it says "**Waiting for internet**".
- [ ] Turn **Wi-Fi on** → it goes to Window 3 by itself.

### Test 7: Close the table
- [ ] Mark everything Delivered. On Table 1 tap **⋮** (top right) → **Close table** → **Close**.
- [ ] You are back at the tables and Table 1 is free.

---

## Something wrong?

| What you see | What to do |
|---|---|
| Phone: "No connection to the server" | Is Window 1 still open? Same Wi-Fi? Did you click **Allow access** in Step 1? |
| Phone: the code doesn't work | Too old. Paste the Step 2 line again for a new code. |
| No sound | Turn up the phone's **media** volume (play a video and press volume up). |
| No ring when locked | Phone Settings → Apps → **cafe_tablet** → Battery → **Unrestricted**. |
| Red text "running scripts is disabled on this system" | Write `npx.cmd` (or `npm.cmd`) instead of `npx` (or `npm`). |
| Window 3: "Not paired yet" | Paste the Step 2 line again, then Step 5 again. |

When you finish, tell Claude: **your phone brand and model**, and **what happened in Test 3**.
