# Stock monitor — Debenhams Royce Cantilever

A standalone GitHub Actions cron job that watches one product and emails
`duncan.ramsay@gmail.com` when it comes **back in stock**.

- **Product:** Norfolk Leisure _Royce Executive 3m Cantilever with Taupe Canopy,
  Cover & Base_ — £539.00, SKU `M5060694431646`.
- **Page:** <https://www.debenhams.com/product/norfolk-leisure-royce-executive-3m-cantilever-with-taupe-canopy-cover-base_p-55c70e19-7f48-4b73-a2e7-6622028fb3c2>

This has nothing to do with the MyGarden app itself — it just lives in the same
repo so the schedule and secrets are in one place.

## How it works

- [`.github/workflows/stock-check.yml`](../.github/workflows/stock-check.yml)
  runs every 30 minutes (`*/30 * * * *`) and on manual **workflow_dispatch**.
- [`check_stock.py`](./check_stock.py) does a plain HTTP GET (standard-library
  only — no `pip install`, no headless browser) with a realistic desktop-Chrome
  `User-Agent`, because the stock status is server-rendered into the HTML.
- Detection:
  - **OUT OF STOCK** while the page still contains the text `Out of Stock`.
  - **IN STOCK** (alert) once that text is gone. An `Add to Basket`/`Add to Bag`
    control is logged as corroboration.
  - This is deliberately conservative so it can **never fire a false alert**.
- **Fail-safe:** any non-200 response, timeout, or a page missing the expected
  product markup (SKU / product name) is logged and the run exits cleanly with
  **no email** — bot-challenge and error pages never trigger an alert.
- **State guard:** [`state.json`](./state.json) records the last known status.
  The email is only sent on an **out → in** transition, and the workflow commits
  the updated `state.json` back to the branch when the status changes — so you
  get one alert, not one every 30 minutes while it stays in stock.

## Required repository secrets

Set these under **Settings → Secrets and variables → Actions → New repository
secret**. SMTP delivery uses the [`dawidd6/action-send-mail`](https://github.com/dawidd6/action-send-mail)
action, so any SMTP provider works.

| Secret          | Example                | Notes                                             |
| --------------- | ---------------------- | ------------------------------------------------- |
| `SMTP_SERVER`   | `smtp.gmail.com`       | Your provider's SMTP host                          |
| `SMTP_PORT`     | `465`                  | `465` for implicit TLS (the workflow sets `secure: true`) |
| `SMTP_USERNAME` | `you@gmail.com`        | Login user; also used as the `From:` address       |
| `SMTP_PASSWORD` | _app password_         | **Not** your normal password — see below           |

### Gmail app password

1. Enable 2-Step Verification on the Google account.
2. Go to <https://myaccount.google.com/apppasswords>, create an app password
   ("Mail" / "Other"), and copy the 16-character value.
3. Use that value for `SMTP_PASSWORD` and the Gmail address for both
   `SMTP_USERNAME` and (implicitly) `From:`.

Using a different provider (SendGrid, Mailgun, Fastmail, etc.)? Just point the
four secrets at that provider's SMTP host/port/credentials.

## The alert email

- **To:** `duncan.ramsay@gmail.com`
- **Subject:** `IN STOCK: Royce Executive 3m Cantilever (£539) — Debenhams`
- **Body:** the current price and the direct product URL.

## Running / testing it

1. Add the four secrets above.
2. **Actions → "Stock check — Debenhams Royce Cantilever" → Run workflow** to
   trigger a manual `workflow_dispatch`. It should finish green; while the item
   is out of stock the "Send email" step is skipped (no email — that's correct).
3. To prove SMTP delivery end-to-end before real stock arrives, run it once from
   a throwaway branch where you've temporarily forced `should_email=true` (e.g.
   hard-code the output in `check_stock.py`). Confirm the email lands, then
   discard that branch — never merge the forced value.

The workflow needs `contents: write` permission (already set) so it can commit
`state.json` when the status changes.
