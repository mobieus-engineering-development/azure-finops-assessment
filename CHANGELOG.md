# Changelog

All notable changes to the AZ Cost Assessment will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added — financial and operational evidence

- Opt-in monthly inventory, cached Advisor Cost and historical VM CPU evidence via `--with-operations`.
- Cost-preserving resource joins, explicit source failures, sample coverage and exclusion of unvalidated/old Advisor candidates.
- Enriched HTML, schema 1.1 JSON and three additional CSV exports; no execution or aggregate savings estimates.

### Maintenance — repository health

- Patched compatible dependencies to resolve current npm audit findings; Node 22 minimum reflects the updated Azure Identity requirement.
- Made moderate-or-higher dependency audit failures blocking, added Node 22/24 CI coverage and enabled checks for stacked PRs.
- Verify signatures through GitHub's verification result; group dependency updates and correct repository links.
- Documented commit-signing repair, required-check migration and PR backlog disposition.

### Added — monthly reporting

- Closed-calendar-month review packs via `npm start -- --monthly [YYYY-MM]`, defaulting to the previous month.
- Executive observations, reconciled service/resource-group changes, daily spend and explicit observed-date coverage.
- Offline HTML with print styling, complete JSON evidence and signed daily/service/resource-group/resource CSV exports.
- Separate snapshot folders, spreadsheet formula protection for text fields and incomplete-export detection.

### Changed — trustworthy numbers

- Read-only ActualCost reporting with complete pagination, signed costs, currency validation, resource/group breakdowns and reconciled totals.
- UTC completed-day periods, comparable elapsed-day changes, distinct-day averages and explicit coverage/freshness limitations.
- Removed synthetic fallback, random forecasts and heuristic savings collectors from the active application. Unavailable values are nullable rather than invented.
- Runtime subscription selection takes precedence over `.env`; required output failures now fail the run.
- Added deterministic financial-integrity regression tests. Tenant aggregation, partial reporting and evidence-backed opportunities remain future work.

## [1.0.0] - 2025-11-12

### Added

- **Initial Public Release** 🎉
- Azure Cost Management API integration with comprehensive cost analysis
- 90-day historical cost tracking and analysis
- 3-month cost comparison (apples-to-apples full months + current month projected)
- Daily spend visualization for past 14 days
- Cost trend analysis with 7-day and 30-day moving averages
- Anomaly detection using statistical analysis (z-score based)
- Smart recommendations for cost optimization (anomaly detection, resource utilization, reserved capacity)
- JSON report export for programmatic access
- HTML report generation for shareable dashboards
- Month-over-month comparison with percentage changes
- Cost forecasting for next 30 days
- Date-fns for reliable date manipulation
- Configuration management via environment variables and config files

---

[1.0.0]: https://github.com/mobieus10036/az-cost-assessment/releases/tag/v1.0.0
