# How To Be A Millionaire 💰

A personal money tracker that runs on your phone, built as a web app you can add to your home screen.

## What it does (v1)
- **Starting point:** your cash, savings and investments when you begin.
- **Quick entry:** Spent / Got / Save-Invest, then tap a category. Takes under 5 seconds.
- **Categories:** F&B, Groceries, Entertainment, Transport, Shopping, Education, Commitments, Betting, Others. Income types: Allowance, Investment returns, Betting win, Other.
- **Savings and investment count as transfers, not spending,** so putting money away never turns a day red.
- **Calendar:** days are green or red against your daily budget. Months and years are green or red by net flow, with ✅ when you hit the target.
- **Targets:** daily budget, monthly target and yearly target. You can use the recommended values (50/30/20 rule) or set your own.
- **Safe to spend today:** the strictest of your daily budget, your cash left until the next allowance, and what still lets you hit your monthly target.
- **Calculator:** end-of-day, month and year projections, shown as 📈⬆️💰 for a gain or ⚠️📉⬇️💸 for a loss, plus a what-if ("if I spend RM X/day…").
- **Fixed commitments:** logged automatically every month.
- **Backup:** export and import a JSON file.

## Privacy
All data is stored **only on your phone**, in the browser's local storage. Nothing is uploaded, and this repo contains only the app code.
Clearing your browser data deletes your entries, so use **Settings → Export backup** now and then.

## Install on your phone
1. Open the app link in Chrome (Android) or Safari (iPhone).
2. Android: menu ⋮ → **Add to Home screen**. iPhone: Share → **Add to Home Screen**.

## Files
`index.html`, `styles.css`, `app.js` (all the logic), `manifest.webmanifest` + `sw.js` (offline and home-screen install), `icons/`.
