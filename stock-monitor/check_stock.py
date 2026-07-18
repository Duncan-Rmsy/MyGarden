#!/usr/bin/env python3
"""Debenhams stock checker.

Fetches the Norfolk Leisure "Royce Executive 3m Cantilever" product page and
decides whether it is back in stock. Uses only the Python standard library so
the workflow needs no `pip install` step.

Design goals (from the task spec):
  * The stock status is server-rendered, so a plain GET is enough — no browser.
  * NEVER send a false in-stock alert. If anything is uncertain (bad HTTP
    status, timeout, or the product markup we expect is missing), we log it and
    exit 0 WITHOUT signalling an email.
  * OUT OF STOCK  -> the page still contains the text "Out of Stock".
  * IN STOCK      -> that text is gone (optionally corroborated by an
    "Add to Basket"/"Add to Bag" control appearing).

Outputs (written to $GITHUB_OUTPUT for the workflow to consume):
  status        : "in_stock" | "out_of_stock"
  price         : e.g. "£539.00"
  url           : the product URL
  should_email  : "true" only on an out->in transition
  state_changed : "true" when state.json was updated (commit it back)
"""

from __future__ import annotations

import datetime as _dt
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

PRODUCT_URL = (
    "https://www.debenhams.com/product/"
    "norfolk-leisure-royce-executive-3m-cantilever-with-taupe-canopy-cover-base"
    "_p-55c70e19-7f48-4b73-a2e7-6622028fb3c2"
)

# Identifiers used to confirm we actually fetched the right product page and not
# a bot-challenge / error page. If none are present we treat the fetch as failed.
SKU = "M5060694431646"
PRODUCT_MARKERS = ("royce executive", "norfolk leisure", SKU.lower())

DEFAULT_PRICE = "£539.00"

# A realistic desktop-Chrome User-Agent to avoid being blocked.
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)

TIMEOUT_SECONDS = 30
STATE_PATH = Path(__file__).with_name("state.json")


def log(message: str) -> None:
    print(f"[stock-check] {message}", flush=True)


def set_output(**pairs: str) -> None:
    """Write key=value pairs to the GitHub Actions step output file."""
    out_file = os.environ.get("GITHUB_OUTPUT")
    if not out_file:
        return
    with open(out_file, "a", encoding="utf-8") as handle:
        for key, value in pairs.items():
            handle.write(f"{key}={value}\n")


def fetch_html() -> str:
    """GET the product page. Raises on any non-200 / network error."""
    request = urllib.request.Request(
        PRODUCT_URL,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": (
                "text/html,application/xhtml+xml,application/xml;q=0.9,"
                "image/avif,image/webp,*/*;q=0.8"
            ),
            "Accept-Language": "en-GB,en;q=0.9",
        },
    )
    with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
        status = getattr(response, "status", response.getcode())
        if status != 200:
            raise RuntimeError(f"unexpected HTTP status {status}")
        return response.read().decode("utf-8", errors="replace")


def extract_price(html: str) -> str:
    """Best-effort price extraction, falling back to the known list price."""
    patterns = (
        r'"price"\s*:\s*"?(\d+(?:\.\d{2})?)',            # JSON-LD / schema
        r'"(?:sellingPrice|currentPrice|nowPrice)"\s*:\s*"?(\d+(?:\.\d{2})?)',
        r'itemprop=["\']price["\'][^>]*content=["\'](\d+(?:\.\d{2})?)',
        r'£\s?(\d{1,4}(?:\.\d{2}))',                     # visible "£539.00"
    )
    for pattern in patterns:
        match = re.search(pattern, html, re.IGNORECASE)
        if match:
            value = float(match.group(1))
            return f"£{value:.2f}"
    return DEFAULT_PRICE


def analyse(html: str):
    """Return (status, price) or None if the product markup is missing."""
    lowered = html.lower()

    if not any(marker in lowered for marker in PRODUCT_MARKERS):
        return None  # not the page we expect — treat as a failed fetch

    out_of_stock = "out of stock" in lowered
    add_to_basket = ("add to basket" in lowered) or ("add to bag" in lowered)

    # Conservative rule: while ANY "Out of Stock" text remains we stay OUT, so we
    # can never fire a false alert. The add-to-basket signal is logged as
    # corroboration only.
    status = "out_of_stock" if out_of_stock else "in_stock"
    log(f"signals: out_of_stock={out_of_stock} add_to_basket={add_to_basket}")

    return status, extract_price(html)


def read_previous_status() -> str | None:
    if not STATE_PATH.exists():
        return None
    try:
        return json.loads(STATE_PATH.read_text(encoding="utf-8")).get("status")
    except (json.JSONDecodeError, OSError) as exc:
        log(f"could not read state.json ({exc}); treating as no prior state")
        return None


def write_state(status: str, price: str) -> None:
    payload = {
        "status": status,
        "price": price,
        "url": PRODUCT_URL,
        "checked_at": _dt.datetime.now(_dt.timezone.utc)
        .replace(microsecond=0)
        .isoformat(),
    }
    STATE_PATH.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    try:
        html = fetch_html()
    except (urllib.error.URLError, RuntimeError, TimeoutError, OSError) as exc:
        log(f"fetch failed ({exc}); exiting cleanly, no alert")
        set_output(should_email="false", state_changed="false")
        return 0

    result = analyse(html)
    if result is None:
        log("expected product markup missing; exiting cleanly, no alert")
        set_output(should_email="false", state_changed="false")
        return 0

    status, price = result
    previous = read_previous_status()
    should_email = status == "in_stock" and previous != "in_stock"
    state_changed = status != previous

    if state_changed:
        write_state(status, price)

    log(
        f"status={status} price={price} previous={previous} "
        f"should_email={should_email} state_changed={state_changed}"
    )
    set_output(
        status=status,
        price=price,
        url=PRODUCT_URL,
        should_email=str(should_email).lower(),
        state_changed=str(state_changed).lower(),
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
