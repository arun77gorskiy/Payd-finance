# Equity Intelligence — MVP integration

This module is isolated from the existing crypto PAYD Intelligence runtime.

## Routes
- `/equities.html` — stock financial analysis interface.
- `/api/equities?ticker=MSFT` — read-only SEC EDGAR server function.
- `/intelligence-v2.html` — cross-link to the equity section.

## Required server environment
Set `SEC_USER_AGENT` to an **honest** identifying application name and a monitored contact email, e.g. `PaydFinanceResearch admin@YOUR-ACTUAL-DOMAIN`. Do not use this example as-is. Requests will return HTTP 503 until configured.

## Source and integrity
- SEC company_tickers.json resolves a ticker to CIK.
- SEC XBRL Company Facts provides annual US-GAAP figures from 10-K filings.
- No provider-supplied market quote is available in this phase.
- Missing values remain null; FCF is only calculated when cashflow and capex have identical ending periods.
- Scores, price targets and buy/sell recommendations are deliberately disabled.
- This is an MVP, not a validated equity valuation model.

## Deployment checklist
1. Confirm which Vercel project and production branch serve Payd Finance. The repository default `main` does **not** contain the complete website in the inspected revision.
2. Merge into the actual production branch only after testing; do not overwrite `main` or the live build without a backup.
3. Add `SEC_USER_AGENT` as a server-only environment variable.
4. Verify `/api/equities?ticker=MSFT` returns a successful SEC response, and missing-data behavior for a company with sparse XBRL facts.
5. Check `/equities.html` on mobile and desktop.
6. Confirm data licensing, caching/rate limits and SEC fair-access rules before scaling.

## Next phases
Licensed/delayed price feed → share count normalization → sector-specific fundamental ratios → DCF with assumptions → point-in-time backtesting and risk controls → audited PAYD Score.
