# Sri Bharathi Manager

A Windows desktop app for running a women's hostel: rooms, beds, residents, rent and receipts across three branches — built for two non-technical owners who were tracking it all on paper.

**[Download the installer →](../../releases/latest)** · Windows 10/11, no admin rights needed

## The problem

The hostel runs three branches with 44 beds between them. Occupancy and rent lived in a paper register and in the owners' heads. Two questions were slow and error-prone to answer: **who is in which bed**, and **who owes me money**.

> Branch names, addresses and phone numbers are typed in by the owner and stay in the data file on their own machine. This repository ships blank placeholders only — no real contact or resident details anywhere in the code or its history.

## What it does

| | |
|---|---|
| **Bed map** | Every room drawn out with its beds, colour-coded by payment status. Tap an empty bed to admit someone, tap an occupied one to open her profile. |
| **Mixed billing cycles** | Rent per resident: monthly from her own join date, a fixed date each month, or per day for short stays. Part-months are prorated on the days actually stayed. |
| **Rent ledger** | Extra charges (mess, laundry, electricity, AC, late fees) and part payments tracked as a running balance, not a paid/unpaid tick. |
| **Receipts & reminders** | Branded A4 receipts to print or save as PDF, with sequential receipt numbers per financial year, plus one-tap WhatsApp rent reminders. |
| **Excel export** | A workbook with a tab per subject and one per branch — a column per charge type, ₹ formatting, filters on every heading. Optionally rewritten automatically whenever anything changes. |
| **Reports** | Month-by-month collection against what was expected, branch by branch, plus a printable rent register. |

## How it's built

**Electron + React + TypeScript + Tailwind**, packaged as a Windows installer. Local-first: the register is a JSON file on the machine, written atomically, with a daily rolling backup.

Three decisions worth calling out:

- **The billing engine is pure.** Every rule about what someone owes lives in `src/domain/` as plain functions with no UI or storage imports, covered by 25 unit tests — month-end join dates (31 Jan → 28 Feb → 31 Mar), proration in both directions, part payments, mid-cycle vacating.
- **Bill generation is idempotent.** A bill is keyed on `(stayId, periodStart)`, so it can run on every launch and can never double-charge.
- **Storage sits behind one interface.** `StorageAdapter` has a local implementation today and a cloud one next, so no screen changes when sync arrives.

56 tests cover the engine, the store's rules, the Excel workbook, and a walk through the real screens in jsdom.

## Running it

```bash
npm install
npm run dev        # then `npm run dev:app` in a second terminal for the desktop window
npm test
npm run package    # Windows installer into release/
```

## Status

In use by the hostel's owners. Live sync between machines (Supabase) and the phone version are built but awaiting the cloud project being created; see below.

---

## For Amma & Appa — how to use it

### Opening the app
Double-click **Sri Bharathi Manager** on the desktop. Everything is saved on the computer automatically — there is no "save" button to remember.

### The six screens (left side)

| Screen | What it's for |
|---|---|
| **Dashboard** | The morning glance — beds filled, money collected, who is overdue, who pays this week |
| **Rooms & Beds** | Every room drawn out with its beds. The colour of a bed tells you her payment status |
| **Girls** | The full list — search by name, phone or room number |
| **Rent & Dues** | Who owes what, record a payment, send WhatsApp reminders |
| **Reports** | Month-by-month collection, branch by branch, and the printable rent register |
| **Settings** | Hostel details, extra charges, message wording, backups |

Tip: `Ctrl` + `1` to `6` jumps between screens.

### Setting up a branch
1. Go to **Rooms & Beds** and pick the branch at the top.
2. **Add room** → room number, floor, how many beds, rent per bed. The beds are created for you (A, B, C, D…).
3. Click any empty bed → **Add girl** → fill her details → she is placed in that bed.

### The bed colours
| Colour | Meaning |
|---|---|
| 🟢 Green | Paid up |
| 🟡 Yellow | Paid part of it |
| 🔴 Red | Overdue |
| ⚪ Plain | Due, but not late yet |
| Dashed outline | Empty bed |

### Rent — how the app counts it
Every girl can be on her own cycle, chosen when you add her:
- **From her join date** — joined on the 12th, so rent runs 12th to 11th every month.
- **A fixed date each month** — everyone pays on, say, the 5th. Her first part-month is charged only for the days she stayed.
- **Short stay** — charged per day.

Each month's bill appears **by itself** when the month starts. Nothing to remember. You can also press *Generate this month's bills* on the Rent & Dues screen.

### Taking money
**Rent & Dues** → **Record** next to her name. The full pending amount is filled in already; change it if she paid only part. Then:
- **Print** — a proper receipt on paper
- **PDF** — saves the receipt as a file
- **Send** — opens WhatsApp with the receipt message ready to send

Part payments are fine. The app tracks the balance rather than just "paid / not paid".

### Extra charges
Mess, laundry, EB, AC, late fee, damages — open her profile → **Rent ledger** → **Add charge**. The amounts you use most often are set up in **Settings → Extra charges**, and anything marked *Add to all* goes onto every new bill automatically.

### When a girl leaves
Open her profile → **Mark as vacated** → give the last date. Her final month is automatically recharged for only the days she stayed, her bed frees up, and all her records and receipts stay.

Use **Delete** only for a mistaken entry — it erases her history permanently.

### The Excel sheet
Everything in the app can come out as one Excel workbook, with a separate tab for each thing:

| Tab | What's on it |
|---|---|
| **Summary** | Each branch — beds, filled, vacant, occupancy %, expected, collected, outstanding |
| **Girls** | Every girl: room, bed, both phone numbers, guardian and their number, company or college, join date, rent, status, pending amount, notes |
| **Rooms & Beds** | Every bed in every branch, who is in it, since when, and what she owes |
| **Rent bills** | Every month's bill with **a separate column for each charge** — rent, mess, laundry, electricity, AC, late fee, damage, other — then total, paid, balance, status and days late |
| **Payments** | Every receipt: number, date, name, room, amount, cash/UPI/bank, reference |
| **One tab per branch** | Each branch listed room by room |

Money shows as ₹, dates as proper dates, and every heading has a filter arrow so you can narrow down to one branch, one room or one month. Each tab totals its money columns at the bottom.

Two ways to get it, both in **Settings → Excel sheet** (and on the Reports screen):
- **Export to Excel now** — asks where to save it and opens it straight away.
- **Keep a copy updated automatically** — choose a folder once, and `Sri Bharathi register.xlsx` there rewrites itself a few seconds after anything changes. Keep the file closed while you work; Excel locks it while it's open, and the app will tell you if it couldn't write.

### Backups
A copy is saved automatically once a day and the last 30 days are kept. **Settings → Save a backup** makes a file you can put on a pendrive or send over WhatsApp; **Restore from a backup** reads it back on the other computer.

### On a phone
Every screen works on a phone. The sidebar becomes a row of buttons along the bottom, the wide tables turn into a card for each girl, and dialogs slide up from the bottom of the screen.

Once the cloud database is connected, open the link on the phone and use **Add to Home Screen** (Chrome: ⋮ menu · Safari: the share button). It then gets its own icon and opens full-screen like any other app, on Android and iPhone alike.

**Until the cloud is connected, the phone version has nothing to show** — a phone cannot read a file sitting on a laptop.

---

## Connecting the cloud (one-time, ~10 minutes)

This is what makes the two laptops and the phone show the same data. It is free at this size.

1. Go to **supabase.com** → *Start your project* → sign in with Google.
2. **New project.** Name it `sri-bharathi`, choose a strong database password (write it down), and pick the region closest to you — **Mumbai / ap-south-1** for India, so it feels quick.
3. Wait ~2 minutes while it sets up.
4. Open **SQL Editor** in the left menu → *New query* → paste the whole of `supabase/schema.sql` from this project → **Run**. This creates the tables and locks them so only signed-in users can read anything.
5. Open **Project Settings → API** and copy two values: the **Project URL** and the **anon public** key.
6. In the app: **Settings → Sharing between two computers** → paste both → *Connect*. It offers to push what is already on the laptop up to the cloud.
7. Do step 6 on the other laptop too — pasting the same two values — and both are in step.

Only the *anon public* key ever goes into the app. The `service_role` key must never be pasted anywhere.

---

## For whoever maintains it

### Running it
```bash
npm install
```
```bash
npm run dev
```
Then, in a second terminal, open the desktop window against that dev server:
```bash
npm run dev:app
```

### Checks
```bash
npm test
```
```bash
npm run typecheck
```

### Building the installer
```bash
npm run package
```
The Windows installer lands in `release/`. Copy it to both laptops and run it.

Note: `signAndEditExecutable` is off, because electron-builder's signing bundle cannot unpack on this machine (it contains macOS symlinks, and Windows refuses to create those without elevated rights). The consequence is that the icon and version details are not stamped automatically — after `electron-builder --win --dir`, run `rcedit-x64.exe` on `release/win-unpacked/Sri Bharathi Manager.exe` with `--set-icon release/.icon-ico/icon.ico`, then build the installer with `--prepackaged release/win-unpacked`. Turning on Windows Developer Mode removes the need for all of this.

### Building the phone version
```bash
npm run build:web
```
Output goes to `dist-web/` — a static site with a service worker and web manifest, ready to drop on Netlify, Vercel or Cloudflare Pages. It must be served over HTTPS for "Add to Home Screen" to be offered.

### How it's put together
```
electron/main.cjs        window, file storage, printing, backups — the only code with disk access
electron/preload.cjs     the narrow bridge exposed to the UI as window.sbh
src/domain/billing.ts    every rent rule, as pure functions — unit tested, no UI imports
src/domain/dates.ts      date maths on 'YYYY-MM-DD' strings, anchored to UTC noon
src/data/types.ts        the shape of everything stored
src/data/store.tsx       app state, all mutations, and the derived views screens read
src/data/adapter.ts      StorageAdapter — LocalAdapter today, SupabaseAdapter next
src/features/*           one folder per screen
src/ui/*                 the design system: buttons, fields, modals, chips, toasts
```

Two rules worth keeping:
- **Money and dates never live in a component.** Anything that decides what someone owes belongs in `src/domain/`, where it is tested.
- **A bill is identified by `(stayId, periodStart)`.** That is what makes bill generation safe to run on every launch without ever double-charging.

### Still to come
Live sync between the two laptops through a free Supabase project, so Amma's and Appa's copies stay in step. The `StorageAdapter` interface is the seam it plugs into — no screen has to change.
