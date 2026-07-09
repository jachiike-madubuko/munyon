# Build Plan: Paycheck Planner (Jah OS)

## Context
This is a mobile-first paycheck allocation tool, part of a personal finance system called "Jah OS." A working prototype already exists as a single React artifact (`paycheck-planner.jsx`), built and tested in Claude. It is fully functional but uses a placeholder persistence layer (`window.storage`) that only exists in that sandbox. Your job is to take this prototype and turn it into a real, deployed, installable app.

## What the app does
The user gets paid biweekly. Each paycheck has fixed deductions (mortgage, loans, etc.) subtracted first, leaving a "free" amount. The user plans discretionary purchases against specific upcoming paychecks, can move a purchase from one paycheck to another, mark purchases paid, and see a running balance per paycheck so they never overallocate a check. Core object model:

- **payAmount**: number, the biweekly gross/net pay figure
- **fixed**: array of `{id, name, cost}` — recurring deductions applied to every paycheck
- **paychecks**: array of `{id, label}` — upcoming pay dates
- **items**: array of `{id, name, cost, pc, paid}` — planned purchases, each tied to one paycheck via `pc`

Derived values: `free = payAmount - sum(fixed)`, and per-paycheck `remaining = free - sum(items assigned to that paycheck)`.

## High-level goals, in priority order
1. **Get it running locally and deployed.** Take the uploaded JSX, scaffold it into a real project (Vite + React recommended, matches the existing code with zero rewrite), replace `window.storage` calls with real persistence (see below), and ship it somewhere accessible from a phone browser — Vercel or Netlify is fine.
2. **Real persistence.** The current `window.storage.get/set` calls need a real backend. Recommend Supabase (Postgres + instant REST/JS client, generous free tier, handles auth later if needed) or a simple localStorage-first approach with a sync layer if the user wants zero backend to start. Ask the user which they prefer before committing — do not silently pick one.
3. **Auth, eventually.** Single-user for now. Do not build multi-user auth unless asked. A simple passcode gate or magic link is enough if the app will sit on a public URL.
4. **PWA install-ability.** Add a manifest and service worker so this can be "added to home screen" on iOS/Android and feel like a native app, since it is used daily.
5. **Preserve the design system exactly.** Dark fintech palette (bg `#0E1220`, card `#171C2E`, amber `#F5B841`, mint `#5BD9A4`, red `#F0616B`), Outfit typeface, bottom-sheet interaction pattern. Do not restyle. The visual design was already reviewed and approved.

## Explicitly out of scope for this pass
- Do not connect this to the Jah OS Airtable base yet. That integration is a separate, later task once the Airtable money tables (Accounts, Transactions, Net Worth Snapshots) exist.
- Do not add a priority/deferral field to items yet — that is a planned enhancement, not part of this deployment.
- Do not add multi-user support, social features, or notifications unless asked.

## Suggested build sequence
1. Scaffold Vite + React project. Drop in the JSX as `App.jsx`, install the Outfit font locally instead of the Google Fonts `<link>` tag (avoid runtime font-loading flash).
2. Ask the user: localStorage-only for now, or wire up Supabase today? Do not assume.
3. Replace the three `window.storage` calls (`get`, `set` in the load/save effects) with the chosen persistence method. Keep the debounced save pattern (400ms) — it is intentional, avoids write-spam.
4. Add a `manifest.json`, app icons, and a minimal service worker for installability.
5. Deploy to Vercel. Confirm mobile rendering on an actual phone, not just devtools responsive mode — check tap target sizes and bottom-sheet scroll behavior on iOS Safari specifically, which handles fixed-position sheets differently than Chrome.
6. Report back: live URL, persistence choice made and why, and any deviations from the original prototype.

## Constraints
- Keep it a single-page app. No routing library needed for this scope.
- No new dependencies beyond what persistence requires. Resist the urge to add a component library — the existing inline-style system is deliberate and consistent.
- If Supabase is chosen, put credentials in environment variables, never hardcoded, and confirm `.env` is gitignored before the first commit.
