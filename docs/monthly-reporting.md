# Monthly FinOps reporting

The monthly mode produces a local review pack for finance and engineering. It reads Azure Cost Management and writes local files. It does not change Azure resources, create schedules or send reports.

## Run a review

1. Authenticate with Azure CLI using an account that can read cost data.
2. Run `npm start -- --monthly` for the last closed UTC month, or `npm start -- --monthly YYYY-MM` for a selected closed month.
3. Select the subscription. The collector reads that month and its predecessor using the existing pagination, retry, currency and reconciliation checks.
4. Open the printed folder's `index.html`. Start with the executive readout and coverage table, then review service and resource-group changes.
5. Use the CSV evidence to investigate movements with service owners. Record explanations in your existing review process; owner assignment and review-state persistence are not implemented here.

The standalone monthly mode works on the first day of a month. Current/future months and malformed arguments are rejected before authentication. Reruns always create separate snapshots, allowing reviewers to retain earlier evidence when Azure rerates costs.

## Deliverables

| File | Purpose |
| --- | --- |
| `index.html` | Offline, responsive review with print styling; no external scripts or assets |
| `report.json` | Versioned report, full two-month evidence, dates, scope, generation time, source, currency, drivers and limitations |
| `services.csv` | Every service's previous/current returned cost, signed delta, percentage and period presence |
| `resource-groups.csv` | Alternative view of the same change by resource group |
| `resources.csv` | All returned resource charges in both months, including unallocated charges and credits |
| `daily.csv` | Every calendar date in both months; missing cost values remain blank with a `not returned` status |

Keep the folder intact for download links. Browser Print → Save as PDF produces a meeting copy. File names do not contain subscription identifiers, but the file contents do contain financial and resource evidence. Reports remain under the ignored `reports/` directory.

## Definitions

- Monthly change is selected-month returned ActualCost minus prior-month returned ActualCost. It is not normalized for different month lengths.
- A percentage is unavailable when the previous amount is zero or negative.
- Average daily cost divides returned total by the count of observed billing dates. Coverage shows observed/calendar dates and explicitly lists missing dates.
- Drivers are ranked by absolute signed change. All categories are included, so increases and offsets reconcile to the overall delta within 0.01 currency units.
- Each driver dimension is an alternative explanation of the same total; service and resource-group changes must not be added together.
- An absent category contributes zero to the collected aggregate for that period. Presence labels mean only that billing rows appeared in one or both results; they do not establish resource creation, deletion or utilization.
- Review questions are prompts to investigate usage, prices and adjustments. They do not assert root causes or claim savings.

## Boundaries

This version covers one selected subscription in one currency. A required empty month, currency mismatch, malformed result or failed reconciliation stops the report. Partial reports and tenant-wide rollups are future work. A calendar-closed month is still provisional billing evidence, not a reconciled invoice. Coverage is evidence of returned dates, not proof of billing freshness.

Budget, forecast, ownership mapping, optimization opportunities and verified savings are explicitly not assessed. The monthly product adds no pricing estimates, resource mutations, cloud storage or scheduled delivery.

Exports are written into a `.monthly-pending-...` folder and published by renaming only after all six files are written. A failed write leaves an explicitly incomplete folder and returns failure. Completed reports are never overwritten.

## Verification

Synthetic ledger tests cover calendar and leap-year boundaries, first-day execution, credits, new/absent categories, missing dates, driver reconciliation, currency/empty-period rejection, HTML escaping, spreadsheet formula protection, complete snapshots and export failure. The original financial-integrity suite also exercises the shared collector.
