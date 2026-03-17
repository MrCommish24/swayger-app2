# Swayger — March Madness Email Schedule 2026

All times CDT (UTC−5). Reminder emails go to users with **no submitted picks**. Score update emails go to users **with at least one point**.

---

## Pre-Lock Reminders (Automated)

These fire automatically from the deployed backend — no action needed.

| # | Send Date | Time (CDT) | Subject | Audience | Status |
|---|-----------|------------|---------|----------|--------|
| 1 | Mon Mar 17 | 9:00 AM | "2 days left to lock your picks" | No picks yet | ✅ Sent |
| 2 | Tue Mar 18 | 9:00 AM | "24 hours left to lock your picks" | No picks yet | ⏳ Scheduled |
| 3 | Wed Mar 19 | 8:00 AM | "Final warning — picks lock at noon today" | No picks yet | ⏳ Scheduled |

> **Lock deadline:** Wed Mar 19 at 12:00 PM CDT

---

## Round Score Updates (Manual — You Trigger These)

After each round finishes, enter game results in the admin panel, then fire the score update blast.

**How to trigger:**
```
POST /admin/mm/api/score-update
Header: x-admin-token: <your token>
```
Or ask me to fire it for you.

| # | Round | Games Play | Suggested Send | Audience | Status |
|---|-------|------------|----------------|----------|--------|
| 4 | Round of 64 | Mar 19–20 | Fri Mar 21 ~noon CDT | Has score | 🔲 Future |
| 5 | Round of 32 | Mar 21–22 | Sun Mar 23 ~noon CDT | Has score | 🔲 Future |
| 6 | Sweet 16 | Mar 26–27 | Sat Mar 29 ~noon CDT | Has score | 🔲 Future |
| 7 | Elite 8 | Mar 28–29 | Mon Mar 30 ~noon CDT | Has score | 🔲 Future |
| 8 | Final Four | Apr 4–5 | Sun Apr 6 ~noon CDT | Has score | 🔲 Future |
| 9 | Championship 🏆 | Mon Apr 6 | Tue Apr 7 ~10 PM CDT | Has score | 🔲 Future |

---

## Reminder Logic

- **"No picks yet"** — users who have submitted zero locked takes (Sweet 16, Elite 8, Final Four, Champion)
- **"Has score"** — users who appear in `mm_pick_scores` with at least one point
- Users who have submitted **any** locked take are excluded from pre-lock reminders
- The `notification_email` field on each profile is the address used — backfilled from signup email on Mar 17 2026

---

## State Tracking

The scheduler tracks which pre-lock blasts have fired in `mm-email-state.json` at the project root. If the file is missing on restart, past windows (>30 min ago) are skipped automatically.

```json
{
  "pre_lock": {
    "mar17": true,
    "mar18": false,
    "mar19": false
  }
}
```
