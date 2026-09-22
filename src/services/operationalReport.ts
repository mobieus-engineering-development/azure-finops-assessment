import { OperationalEvidence } from '../models/operationalEvidence';

const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const metric = (value: number | null) => value === null ? 'Unavailable' : `${value.toFixed(2)}%`;

export function operationalCsvRows(evidence: OperationalEvidence): Record<string, Array<Array<string | number | null>>> {
    return {
        'operational-resources.csv': [['resource_id', 'name', 'currency', 'selected_month_cost', 'previous_month_cost', 'inventory_match', 'type_now', 'location_now', 'tags_now',
            'cpu_status', 'cpu_reason', 'cpu_start_utc', 'cpu_end_exclusive_utc', 'cpu_observed_hours', 'cpu_expected_hours', 'cpu_coverage_percent', 'cpu_mean_hourly_average', 'cpu_p95_hourly_average', 'cpu_max_hourly_average', 'advisor_ids'],
        ...evidence.resources.map(r => [r.resourceId, r.name, r.currency, r.currentCost, r.previousCost, r.inventoryMatch, r.inventory?.type ?? null, r.inventory?.location ?? null,
            r.inventory ? JSON.stringify(r.inventory.tags) : null, r.cpu.status, r.cpu.reason ?? null, r.cpu.start, r.cpu.endExclusive, r.cpu.observedHours, r.cpu.expectedHours,
            r.cpu.coveragePercent, r.cpu.meanHourlyAverage, r.cpu.p95HourlyAverage, r.cpu.maxHourlyAverage, r.advisorIds.join('; ')])],
        'advisor-evidence.csv': [['recommendation_id', 'resource_id', 'problem', 'solution', 'impact', 'last_updated_utc', 'age_days', 'inventory_match', 'review_eligible', 'review_reason', 'reported_properties_unvalidated'],
            ...evidence.advisor.recommendations.map(r => [r.id, r.resourceId, r.problem, r.solution, r.impact, r.lastUpdated, r.ageDays, r.inventoryMatch,
                r.reviewEligible ? 'yes' : 'no', r.reviewReason, JSON.stringify(r.reportedProperties)])],
        'cpu-samples.csv': [['resource_id', 'timestamp_utc', 'hourly_average_cpu_percent'], ...evidence.resources.flatMap(r => r.cpu.samples.map(s => [r.resourceId, s.timestamp, s.average]))]
    };
}

export function operationalHtml(evidence: OperationalEvidence): string {
    const money = (value: number | null, currency: string) => value === null ? 'No billing row' : escape(new Intl.NumberFormat('en-US', { style: 'currency', currency, currencyDisplay: 'code' }).format(value));
    const eligible = evidence.advisor.recommendations.filter(r => r.reviewEligible).length;
    const observed = evidence.resources.filter(r => r.cpu.status === 'observed').length;
    return `<section class="notice" id="operational-evidence"><h2>Financial and operational evidence</h2>
<p>Financial month: ${escape(evidence.financialMonth)}. Current snapshots collected ${escape(evidence.startedAt)} through ${escape(evidence.completedAt)}.</p>
<ul><li>Inventory: ${escape(evidence.inventory.status)} · ${evidence.inventory.resources.length} returned resources · ${evidence.inventory.pages} pages. ${escape(evidence.inventory.reason || '')}</li>
<li>Cached Advisor Cost findings: ${escape(evidence.advisor.status)} · ${evidence.advisor.recommendations.length} records · ${eligible} review candidates. ${escape(evidence.advisor.reason || '')}</li>
<li>VM CPU: ${observed} resources with observations / ${evidence.metricsPolicy.requestedResources} requested; ${evidence.metricsPolicy.maxResources}-VM cap.</li></ul>
<p>A review candidate means a current resource match and an Advisor update within ${evidence.metricsPolicy.advisorReviewAgeDays} days. It is not a validated optimization or approved action. No savings total is calculated.</p>
<nav class="downloads" aria-label="Operational evidence downloads"><a href="operational-resources.csv" download>Joined resource evidence</a><a href="advisor-evidence.csv" download>Advisor evidence</a><a href="cpu-samples.csv" download>Hourly CPU samples</a></nav>
<h3>Billed resources and observed CPU</h3><p>Resource presence and metadata are current. CPU is historical for the selected month. Mean, P95 and maximum describe hourly averages, not instantaneous peaks. Missing CPU values remain unavailable.</p>
<div class="scroll"><table><caption>Both months' billed resources, including unallocated charges</caption><thead><tr><th>Resource</th><th>Selected-month cost</th><th>Prior cost</th><th>Inventory match</th><th>Current type / location</th><th>CPU evidence</th><th>Mean / P95 / max</th><th>Advisor findings</th></tr></thead><tbody>
${evidence.resources.map(r => `<tr><th scope="row">${r.portalUrl ? `<a href="${escape(r.portalUrl)}" target="_blank" rel="noopener noreferrer">${escape(r.name)}</a>` : escape(r.name)}<details><summary>Resource ID and current tags</summary><p>${escape(r.resourceId || 'Unallocated')}</p><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${escape(r.inventory ? JSON.stringify(r.inventory.tags, null, 2) : 'Metadata unavailable')}</pre></details></th>
<td>${money(r.currentCost, r.currency)}</td><td>${money(r.previousCost, r.currency)}</td><td>${escape(r.inventoryMatch.replace(/_/g, ' '))}</td><td>${escape(r.inventory?.type || 'Unknown')}<br>${escape(r.inventory?.location || 'Unknown')}</td><td>${escape(r.cpu.status.replace(/_/g, ' '))}<br>${r.cpu.observedHours}/${r.cpu.expectedHours} hours (${r.cpu.coveragePercent.toFixed(1)}%)<br>${escape(r.cpu.reason || '')}</td><td>${metric(r.cpu.meanHourlyAverage)} / ${metric(r.cpu.p95HourlyAverage)} / ${metric(r.cpu.maxHourlyAverage)}</td><td>${r.advisorIds.length}</td></tr>`).join('')}
</tbody></table></div><h3>Advisor findings and validation status</h3>
${evidence.advisor.status !== 'complete' ? '<p>Advisor findings unavailable; this does not mean there are no recommendations.</p>' : evidence.advisor.recommendations.length === 0 ? '<p>No cached Cost recommendations returned. This does not prove the workload is optimized.</p>' : evidence.advisor.recommendations.map(r => `<details><summary>${r.reviewEligible ? 'Review candidate' : 'Excluded from candidates'}: ${escape(r.problem || r.id)}</summary><p>Resource: ${escape(r.resourceId || 'No target')}<br>Advisor updated: ${escape(r.lastUpdated || 'Unknown')}<br>${escape(r.reviewReason)}</p><p>Advisor suggestion: ${escape(r.solution || 'Not supplied')}</p><p>Provider-reported properties below are unvalidated. Any monetary values are native estimates and may overlap; do not add them together.</p><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${escape(JSON.stringify(r.reportedProperties, null, 2))}</pre></details>`).join('')}
<h3>Evidence boundaries</h3><ul>${evidence.limitations.map(value => `<li>${escape(value)}</li>`).join('')}</ul></section>`;
}
