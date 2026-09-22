# Azure FinOps Cost Reporting

A local, read-only Azure cost investigation tool. It collects billed costs, explains service-level changes and produces console, JSON and HTML reports. It does not execute recommendations or change Azure resources.

## Trustworthy numbers

The first modernization increment establishes a stricter financial contract:

- Explicit `ActualCost` basis and **one selected subscription** per report.
- Completed UTC-day windows, with today excluded and billing latency disclosed.
- All cost-query pages collected; malformed data and currency mismatches stop reporting.
- Credits, negative adjustments and unallocated charges retained.
- Daily, service and resource totals reconciled before reporting.
- Billed resource and resource-group breakdowns included in JSON.
- Matching elapsed-day comparisons and separate closed-month changes.
- Missing evidence is never silently replaced with a fabricated zero or synthetic costs.
- Forecasts and savings estimates are explicitly unavailable. The earlier heuristic recommendation collectors are not used by the application.

See [the financial contract and implementation scope](docs/trustworthy-numbers.md) for details and limitations. This is not yet a tenant-wide reporting application or a final-invoice reconciliation system.

## Run locally

Use a supported Node.js release (Node 24 LTS is the locally validated environment), npm and an authenticated Azure CLI session. The selected subscription requires cost-data read access; no resource-write permissions are needed for the active reporting path.

```powershell
npm ci
npm start
```

Select the subscription and historical window at the prompts. `.env` is optional. If present, it provides defaults; it cannot override the context selected at runtime.

Reports are saved under `reports/`, which is excluded from Git. They contain private financial/resource data and should be reviewed before sharing. Tokens are not stored in reports. Do not commit `.env` or generated reports.

## Monthly reporting product

Generate a review pack for the last closed UTC calendar month, or select a month explicitly:

```powershell
npm start -- --monthly
npm start -- --monthly 2026-08
```

Select the subscription at startup. The monthly mode queries the selected month and the prior full month; it does not ask for a rolling lookback. Open `index.html` in the newly printed `reports/monthly-.../` folder. Each run creates a separate snapshot.

The pack includes an executive readout, month-over-month cost changes, service and resource-group drivers, daily spend, missing billing dates and investigation questions. JSON evidence and four CSV files accompany the offline HTML. Keep the folder together when sharing; browser Print → Save as PDF creates a meeting copy.

See [monthly reporting](docs/monthly-reporting.md) for definitions, evidence boundaries and workflow. This mode works on the first UTC day of a month because it only uses closed months.

## Configuration

Defaults are in `config/default.json`; examples are in `.env.example`.

```text
HISTORICAL_DAYS=30
AZURE_COST_LIVE_DATA_ONLY=true
AZURE_COST_API_DELAY_MS=16000
AZURE_COST_MAX_RETRIES=5
AZURE_COST_RETRY_BASE_DELAY_MS=15000
AZURE_COST_RETRY_MAX_DELAY_MS=120000
```

`liveDataOnly=false` is rejected. `maxRetries` is the maximum total request attempts. Server retry-after headers are respected; a delay beyond the configured maximum stops collection instead of retrying early.

## Deliberate limitations

- Results spanning multiple currencies are rejected rather than summed. Currency-separated tenant aggregation is future work.
- A required period with no billing rows is unknown, not verified zero; it stops this version of the report. Explicit zero-valued rows are supported.
- The rolling assessment cannot run on the first UTC day of a month because no completed MTD day exists. Monthly mode supports that date; partial-result reporting remains a follow-up.
- Inventory enrichment, Advisor opportunities, utilization and savings verification are not included in the active report.
- API data can arrive late or be rerated. Successful pagination and reconciliation do not establish billing freshness.

## Validate

```powershell
npm run typecheck
npm run build
npm test -- --runInBand
```

Tests use synthetic billing fixtures and make no Azure changes. Legacy Azure integration tests are skipped unless explicitly enabled.

## Project guidance

- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)
- [Changelog](CHANGELOG.md)
- [License](LICENSE)
