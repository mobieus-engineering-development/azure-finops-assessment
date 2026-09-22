# Trustworthy numbers: first implementation

Branch: `finops/trustworthy-numbers`.

The application is a read-only FinOps reporting tool. This change does not execute resource recommendations, delete resources, purchase commitments, change policies or create Azure reporting infrastructure.

## Financial contract

- Cost basis is explicitly `ActualCost`, using the selected subscription only. Tenant-wide completeness is not claimed.
- Historical windows contain exactly the requested number of completed UTC days. Today is excluded. A report freezes its as-of date for the entire collection.
- Collection follows every continuation page, checks columns by name on every page, rejects repeated links/duplicate aggregate rows and validates dates, numeric values and currencies.
- Credits and negative adjustments are retained, including charges without a resource ID or resource group. No resource inventory join drops historical or unallocated charges.
- Daily, service and resource totals must reconcile within 0.01 currency units; daily service attribution must reconcile too. Rerating during collection can require a rerun.
- Different currencies are never added together. This first version rejects multi-currency results and currency changes between compared periods; currency-separated tenant aggregation is subsequent work.
- A successful empty response means no cost evidence, not a proven zero bill. A required empty period stops the report. An explicit zero-valued billing row remains a valid zero.
- Missing days are not inserted as zero. Summary averages use distinct observed dates; gaps suppress continuous-day trends and day-over-day comparisons across the gap.
- Current-period comparison uses matching elapsed calendar days, capped to the previous month's length. Closed-month change compares the two prior full calendar months.
- Percentages with zero or negative baselines are unavailable rather than fabricated as zero or 100%.
- Forecast amounts and forecast confidence are `null`; the reports display unavailable. Legacy VM/disk heuristic collectors and their savings totals are not used by the application.
- Threshold-based cost flags remain descriptive; they do not carry statistical confidence or imply causation. A large service share alone is no longer an anomaly.
- JSON and HTML show cost basis, source, selected-scope coverage, query cutoff and data limitations. Successful collection does not prove billing freshness or final-invoice reconciliation.
- Failed collection or required report output produces a nonzero CLI exit status. No synthetic fallback is supported, even if legacy configuration requests it.

## Behavior and compatibility

Run `npm start` as before. An existing `.env` can provide defaults but cannot override the runtime subscription selected by the user. Token tenant verification must succeed. Reports remain local under the ignored `reports/` directory.

The collector supports injection of a query transport and clock for deterministic contract tests. The Azure adapter exposes only Cost Management queries, restricts continuation requests to the selected ARM query endpoint, disables SDK retry layering and respects server retry delays. If the required delay exceeds the configured wait limit, collection stops instead of retrying early.

JSON consumers must handle nullable forecast values, comparison percentages and service percentage shares. The main report no longer includes the old `smartRecommendations` or `vmCostAnalysis` output; those collectors use unsupported financial assumptions. Resource and resource-group breakdowns now contain billed costs. Resource location, type and tags are not enriched and are explicitly uncollected.

On the first UTC day of a month the current report stops because no completed MTD day exists. Newly created subscriptions with empty required prior months also stop rather than show an invented zero. A future partial-report contract can expose these sections as unavailable without discarding valid sections.

## Verification

`npm run typecheck`, `npm run build`, and `npm test -- --runInBand` exercise the change. Cost fixtures are entirely synthetic. Contract coverage includes pagination and reordered columns, credits, unallocated costs, zero/negative totals, malformed values, mixed currencies, reconciliation failures, UTC/leap-day boundaries, comparable dates, overlapping periods, retry headers, missing data, unavailable forecasts, scope validation and report-write failure.

## Next increments

1. Structured partial-result statuses and independently reported currencies instead of fail-closed whole-report behavior.
2. Accessible-subscription enumeration with an explicit coverage manifest and permission failures.
3. Separate actual/amortized views and billing/invoice reconciliation.
4. Persistent normalized history, late-arrival refresh and a validated forecast source.
5. Native Advisor evidence joined with current inventory, with stale findings excluded and overlapping savings kept separate.

The uncommitted lockfile changes that predated this task are not part of this implementation.
