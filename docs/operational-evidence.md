# Connecting financial and operational evidence

The monthly report can optionally connect reconciled ActualCost with current resource inventory, cached Azure Advisor Cost recommendations and historical VM CPU metrics. It performs read operations only; it does not execute recommendations, regenerate Advisor findings or configure monitoring.

## Run

```powershell
npm start -- --monthly 2026-08 --with-operations
```

Omit the month to use the last closed UTC month. Without `--with-operations`, the existing financial-only report remains unchanged. Operational collection requires resource-read, Advisor-read and metrics-read permissions on the selected subscription in addition to cost access. Reader/Monitoring Reader roles are typical sources of those permissions; the application never grants roles.

Development checkout for this increment: `C:/dev/azure-finops-assessment/tmp/operational-evidence`, branch `finops/operational-evidence`, based on `chore/repository-health`. Run the command from this checkout until the changes are integrated into the main working branch.

## Evidence contract

- Join billed resource IDs to inventory case-insensitively, retaining credits, resources absent from current inventory and unallocated charges. Joined costs reconcile separately to both months' original totals.
- A missing financial row remains null; a recorded zero remains zero. Inventory presence is one of present, not in current inventory, unknown, unallocated or out of scope. Unknown is used when collection fails, not replaced with an empty successful inventory.
- Inventory records preserve current name, type, location and tags. Tags are observed labels, not verified ownership. Resource existence does not establish its power state, attachment state or utilization.
- Follow inventory and Advisor continuation pages. A page failure, invalid schema or unsafe continuation makes that source unavailable and discards its partial rows.
- Advisor collection reads cached Cost recommendations. Preserve native problem/solution, impact, update time, target and reported properties. Repeated identical recommendation IDs are deduplicated; conflicting duplicates invalidate the source.
- A review candidate requires a current inventory match and an update within 30 days of collection. This is an explicit application review policy, not an Azure freshness guarantee. Unmatched, old or unverifiable records remain in evidence but are excluded from candidates. Subscription-level and other targets outside current inventory are not assumed to be resource-specific opportunities.
- Advisor reported savings properties remain unvalidated native strings. They may use different currencies, periods or overlapping alternatives. No conversion, aggregation or realized-savings claim is made.
- Query `Percentage CPU` at `PT1H` / `Average` for the selected financial month, with an exclusive end boundary. Mean, nearest-rank P95 and maximum are calculated over returned non-null hourly averages. These statistics are not instantaneous CPU peaks. Raw samples are retained.
- Show observed versus expected calendar hours. Missing samples are unknown; an observed CPU value of zero remains a valid observation. No automatic downsizing or idle-resource classification follows from low CPU.
- CPU collection is limited to 100 billed resources identified as current VMs, ordered by absolute selected-month cost. Requests are sequential with bounded retries. Resources beyond the cap are explicitly not collected.
- If the month starts outside the 93-day platform-metric retention window, skip CPU collection instead of quietly substituting a recent window. Resources absent from current inventory are not queried for historical telemetry.
- Source timestamps distinguish current inventory/Advisor snapshots from the historical financial and CPU window. Correlation does not establish causation; a reused resource ID cannot prove continuity of the same resource instance.

## Output and partial coverage

Enriched reports use schema `1.1` and include `operationalEvidence` in `report.json`, a new HTML section, portal resource links and three additional CSV files:

| File | Contents |
| --- | --- |
| `operational-resources.csv` | Both months' billed costs, current inventory match and metadata, CPU statistics/coverage and Advisor IDs |
| `advisor-evidence.csv` | Every returned Cost finding, target validation, review eligibility and raw reported properties |
| `cpu-samples.csv` | Returned non-null hourly CPU averages; omitted hours are not zero |

The existing six financial files remain. Financial-only reports remain schema `1.0`. CSV text uses the same formula protection as financial exports, and HTML escapes provider and tag content. Generated files remain private local artifacts under ignored `reports/` folders.

An unavailable operational source does not discard valid financial evidence. The CLI and HTML display partial coverage; null metrics and source failures remain inspectable in JSON. Financial integrity failures still stop the report. Authentication, authorization, throttling and malformed responses never create mock operational data.

## Safety and implementation

The adapter only permits GET requests to the selected subscription's ARM resource list, cached Advisor recommendation list and Azure Monitor metrics endpoints. Tokens remain in memory; redirects and cross-endpoint pagination are rejected. Errors omit response bodies. A long retry-after response prevents subsequent operational calls during the cooldown.

No VM power actions, disk deletion, IP release, commitment purchases, tagging, Advisor generation or monitoring setup is implemented. Generic inventory fields are not used to declare disks or IPs orphaned. Memory, disk, network, application demand and dependency analysis remain future work.

## Validation

Synthetic tests cover case-normalized joins, valid resource names with spaces, credits, preservation of totals, unavailable/partial inventory, pagination restrictions, stale/unmatched Advisor records, duplicate findings, missing CPU values, invalid samples, retention boundaries, safe HTML/CSV, opt-in arguments and GET-only transport restrictions. Tests also verify cooldown handling without exposing response bodies.

A live read-only check joined the user's saved August financial evidence with current Azure inventory and Advisor responses and returned historical CPU observations. Both months' billed totals reconciled after the join. A separate enriched report was saved; the original financial report was not modified. Operational HTML was visually checked in isolation. Local report contents and account identifiers are not committed.

## Microsoft references

- [Resources List API](https://learn.microsoft.com/en-us/rest/api/resources/resources/list?view=rest-resources-2021-04-01)
- [Cached Advisor recommendations](https://learn.microsoft.com/en-us/rest/api/advisor/recommendations/list?view=rest-advisor-2025-01-01)
- [Metrics List API](https://learn.microsoft.com/en-us/rest/api/monitor/metrics/list?view=rest-monitor-2023-10-01)
- [VM metric definitions](https://learn.microsoft.com/en-us/azure/azure-monitor/reference/supported-metrics/microsoft-compute-virtualmachines-metrics)
- [Platform metrics and retention](https://learn.microsoft.com/en-us/azure/azure-monitor/essentials/data-platform-metrics)
