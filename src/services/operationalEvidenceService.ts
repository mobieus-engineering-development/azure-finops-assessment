import { MonthlyCostEvidence } from '../models/monthlyReport';
import { AdvisorEvidence, CpuEvidence, EvidenceSource, InventoryResource, OperationalEvidence, ResourceEvidence } from '../models/operationalEvidence';
import { configService } from '../utils/config';
import { sumCosts } from './costQuery';
import { azureEvidenceGet, EvidenceGet, normalizeResourceId, resourceInScope } from './operationalTransport';

const HOUR = 3_600_000, DAY = 24 * HOUR;
type ObjectValue = Record<string, any>;
function object(value: unknown): ObjectValue {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid evidence object.');
    return value as ObjectValue;
}
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function strings(value: unknown): Record<string, string> {
    if (value == null) return {};
    const entries = Object.entries(object(value));
    if (entries.some(([, item]) => typeof item !== 'string')) throw new Error('Invalid evidence text fields.');
    return Object.fromEntries(entries) as Record<string, string>;
}
function failure(error: unknown): string {
    const status = (error as { statusCode?: number })?.statusCode;
    return status === 403 || status === 401 ? `Access denied (HTTP ${status}).` : status === 429 ? 'Throttled; retry later.' :
        status === 404 ? 'Endpoint or resource not found (HTTP 404).' : 'Collection failed or response was invalid; no complete evidence available.';
}

export function summarizeCpu(raw: unknown, base: CpuEvidence): CpuEvidence {
    const body = object(raw);
    if (body.interval !== 'PT1H' || !Array.isArray(body.value)) throw new Error('Unexpected metrics interval or schema.');
    const metrics = body.value.filter((item: any) => item?.name?.value === 'Percentage CPU');
    if (metrics.length !== 1 || metrics[0].unit !== 'Percent' || (metrics[0].errorCode && metrics[0].errorCode !== 'Success')) throw new Error('Expected CPU metric unavailable.');
    const series = metrics[0].timeseries;
    if (!Array.isArray(series) || series.length > 1) throw new Error('Ambiguous CPU series.');
    const data = series.length ? series[0].data : [];
    if (!Array.isArray(data)) throw new Error('Invalid CPU samples.');
    const seen = new Set<number>(), samples: CpuEvidence['samples'] = [];
    for (const row of data) {
        const time = Date.parse(text(row?.timeStamp));
        if (!Number.isFinite(time) || time < Date.parse(base.start) || time >= Date.parse(base.endExclusive) || time % HOUR !== 0 || seen.has(time)) throw new Error('Invalid or duplicate metric timestamp.');
        seen.add(time);
        if (row.average == null) continue;
        if (typeof row.average !== 'number' || !Number.isFinite(row.average) || row.average < 0 || row.average > 100) throw new Error('Invalid CPU percentage.');
        samples.push({ timestamp: new Date(time).toISOString(), average: row.average });
    }
    samples.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const values = samples.map(row => row.average).sort((a, b) => a - b);
    return { ...base, status: values.length ? 'observed' : 'no_data', reason: values.length ? undefined : 'No non-null CPU samples returned; utilization is unknown.', samples,
        observedHours: values.length, coveragePercent: values.length / base.expectedHours * 100,
        meanHourlyAverage: values.length ? sumCosts(values) / values.length : null,
        p95HourlyAverage: values.length ? values[Math.ceil(values.length * .95) - 1] : null, maxHourlyAverage: values.length ? values[values.length - 1] : null };
}

/** Independent operational sources may fail without invalidating reconciled financial evidence. */
export class OperationalEvidenceService {
    private readonly scope: string;
    private readonly get: EvidenceGet;
    constructor(get?: EvidenceGet, private readonly clock = () => new Date()) {
        const config = configService.getAzureConfig();
        this.scope = `/subscriptions/${config.subscriptionId}`;
        if (!config.subscriptionId || normalizeResourceId(config.scope) !== normalizeResourceId(this.scope)) throw new Error('Operational scope must match the selected subscription.');
        this.get = get || azureEvidenceGet(config.tenantId, this.scope);
    }

    private async list(endpoint: string, source: string): Promise<EvidenceSource & { rows: ObjectValue[] }> {
        const rows: ObjectValue[] = [], seen = new Set<string>();
        let url = endpoint, pages = 0;
        try {
            const first = new URL(endpoint);
            while (url) {
                const next = new URL(url);
                if (next.origin !== first.origin || next.pathname.toLowerCase() !== first.pathname.toLowerCase() || next.username || next.password || next.hash || seen.has(url) || pages >= 1000) throw new Error('Unsafe or repeated continuation.');
                seen.add(url);
                const body = object(await this.get(url)); pages++;
                if (!Array.isArray(body.value) || (body.nextLink != null && typeof body.nextLink !== 'string')) throw new Error('Incomplete evidence page.');
                rows.push(...body.value.map(object));
                url = body.nextLink || '';
            }
            return { status: 'complete', source, collectedAt: this.clock().toISOString(), pages, rows };
        } catch (error) { return { status: 'unavailable', source, collectedAt: this.clock().toISOString(), pages, reason: failure(error), rows: [] }; }
    }

    public async collect(financial: MonthlyCostEvidence): Promise<OperationalEvidence> {
        if (normalizeResourceId(financial.scope) !== normalizeResourceId(this.scope)) throw new Error('Financial and operational scopes differ.');
        const now = this.clock(), start = financial.current.startDate, endExclusive = new Date(Date.parse(financial.current.endDate) + 1).toISOString();
        const inventoryRaw = await this.list(`https://management.azure.com${this.scope}/resources?api-version=2021-04-01`, 'Azure Resource Manager / Resources List');
        const inventory: OperationalEvidence['inventory'] = { ...inventoryRaw, resources: [] };
        delete (inventory as any).rows;
        try {
            const ids = new Set<string>();
            inventory.resources = inventoryRaw.rows.map(row => {
                const id = text(row.id), normalized = normalizeResourceId(id);
                if (!resourceInScope(id, this.scope) || !text(row.type) || !text(row.name) || ids.has(normalized)) throw new Error('Invalid inventory resource.');
                ids.add(normalized);
                return { id, name: row.name, type: row.type, location: text(row.location) || null, tags: strings(row.tags) };
            });
        } catch { inventory.status = 'unavailable'; inventory.reason = 'Invalid inventory response; resource presence is unknown.'; inventory.resources = []; }
        const byId = new Map(inventory.resources.map(row => [normalizeResourceId(row.id), row]));
        const advisorRaw = await this.list(`https://management.azure.com${this.scope}/providers/Microsoft.Advisor/recommendations?api-version=2025-01-01&$filter=Category%20eq%20%27Cost%27`, 'Azure Advisor / cached Cost recommendations');
        const advisor: OperationalEvidence['advisor'] = { ...advisorRaw, recommendations: [] };
        delete (advisor as any).rows;
        try {
            const ids = new Map<string, string>();
            for (const row of advisorRaw.rows) {
                const p = object(row.properties);
                if (p.category !== 'Cost') continue;
                const id = text(row.id);
                if (!resourceInScope(id, this.scope)) throw new Error('Invalid Advisor identifier.');
                const key = normalizeResourceId(id), payload = JSON.stringify(row);
                if (ids.has(key)) {
                    if (ids.get(key) !== payload) throw new Error('Conflicting Advisor records.');
                    continue;
                }
                ids.set(key, payload);
                const target = text(p.resourceMetadata?.resourceId) || null;
                const match: AdvisorEvidence['inventoryMatch'] = !target ? 'no_resource_target' : !resourceInScope(target, this.scope) || inventory.status !== 'complete' ? 'unknown' : byId.has(normalizeResourceId(target)) ? 'present' : 'not_in_current_inventory';
                const updated = Date.parse(text(p.lastUpdated)), age = Number.isFinite(updated) && updated <= now.getTime() ? (now.getTime() - updated) / DAY : null;
                const eligible = match === 'present' && age !== null && age <= 30;
                advisor.recommendations.push({ id, resourceId: target, problem: text(p.shortDescription?.problem), solution: text(p.shortDescription?.solution), impact: text(p.impact),
                    lastUpdated: age === null ? null : new Date(updated).toISOString(), ageDays: age, inventoryMatch: match, reviewEligible: eligible,
                    reviewReason: eligible ? 'Current inventory match; Advisor updated within 30 days. Validate workload requirements before acting.' :
                        match === 'not_in_current_inventory' ? 'Potentially stale: target absent from current inventory. Excluded from review candidates; deletion is not proven.' :
                        match !== 'present' ? 'Resource target cannot be validated against current inventory.' : 'Advisor update time is missing, invalid or older than the 30-day review policy.',
                    reportedProperties: strings(p.extendedProperties) });
            }
        } catch { advisor.status = 'unavailable'; advisor.reason = 'Invalid Advisor response; recommendations are unavailable.'; advisor.recommendations = []; }
        const buckets = new Map<string, { id: string; name: string; current: number[]; previous: number[] }>();
        for (const [period, rows] of [['current', financial.current.costByResource], ['previous', financial.previous.costByResource]] as const) {
            for (const row of rows) {
                const key = normalizeResourceId(row.resourceId);
                if (!buckets.has(key)) buckets.set(key, { id: row.resourceId, name: row.resourceName, current: [], previous: [] });
                buckets.get(key)![period].push(row.cost);
            }
        }
        const resources: ResourceEvidence[] = [];
        let requestedResources = 0;
        // Highest absolute selected-month cost first. Explicit cap bounds optional monitor requests.
        const sorted = [...buckets.values()].sort((a, b) => Math.abs(sumCosts(b.current)) - Math.abs(sumCosts(a.current)) || a.id.localeCompare(b.id));
        for (const bucket of sorted) {
            const id = bucket.id, metadata = byId.get(normalizeResourceId(id)) || null;
            const match: ResourceEvidence['inventoryMatch'] = !id ? 'unallocated' : !resourceInScope(id, this.scope) ? 'out_of_scope' : inventory.status !== 'complete' ? 'unknown' : metadata ? 'present' : 'not_in_current_inventory';
            let cpu: CpuEvidence = { status: 'not_collected', source: 'Azure Monitor / Percentage CPU', start, endExclusive, collectedAt: null, interval: 'PT1H',
                expectedHours: (Date.parse(endExclusive) - Date.parse(start)) / HOUR, observedHours: 0, coveragePercent: 0,
                meanHourlyAverage: null, p95HourlyAverage: null, maxHourlyAverage: null, samples: [] };
            if (metadata?.type.toLowerCase() !== 'microsoft.compute/virtualmachines') cpu.reason = 'CPU collection requires a current inventory match to a virtual machine.';
            else if (Date.parse(start) < now.getTime() - 93 * DAY) cpu.reason = 'Selected month starts outside the 93-day platform-metric retention window; no substitute window used.';
            else if (requestedResources >= 100) cpu.reason = 'Reached the 100-VM collection limit.';
            else {
                requestedResources++;
                const url = new URL(`https://management.azure.com${metadata.id}/providers/Microsoft.Insights/metrics`);
                url.search = new URLSearchParams({ 'api-version': '2023-10-01', metricnames: 'Percentage CPU', metricnamespace: 'Microsoft.Compute/virtualMachines',
                    timespan: `${start}/${endExclusive}`, interval: 'PT1H', aggregation: 'Average', AutoAdjustTimegrain: 'false' }).toString();
                try { cpu = summarizeCpu(await this.get(url.toString()), { ...cpu, collectedAt: this.clock().toISOString() }); }
                catch (error) { cpu.status = 'unavailable'; cpu.reason = failure(error); cpu.collectedAt = this.clock().toISOString(); }
            }
            resources.push({ resourceId: id, name: bucket.name, portalUrl: resourceInScope(id, this.scope) ? `https://portal.azure.com/#resource${id.split('/').map(encodeURIComponent).join('/')}` : null,
                currentCost: bucket.current.length ? sumCosts(bucket.current) : null, previousCost: bucket.previous.length ? sumCosts(bucket.previous) : null,
                currency: financial.current.currency, inventoryMatch: match, inventory: metadata, cpu,
                advisorIds: advisor.recommendations.filter(row => row.resourceId && normalizeResourceId(row.resourceId) === normalizeResourceId(id)).map(row => row.id) });
        }
        if (Math.abs(sumCosts(resources.map(row => row.currentCost ?? 0)) - financial.current.totalCost) > .01 ||
            Math.abs(sumCosts(resources.map(row => row.previousCost ?? 0)) - financial.previous.totalCost) > .01) throw new Error('Operational resource join did not preserve billed totals.');
        return { startedAt: now.toISOString(), completedAt: this.clock().toISOString(), financialMonth: financial.month, inventory, advisor, resources,
            metricsPolicy: { maxResources: 100, requestedResources, retentionDays: 93, advisorReviewAgeDays: 30 }, limitations: [
                'Inventory and cached Advisor findings are current snapshots, not historical configuration or proof of what caused monthly costs.',
                'All billed rows are retained, including resources absent from inventory and unallocated charges. Absence from inventory does not prove deletion or waste.',
                'CPU is sampled as hourly averages over the selected financial month only. P95 and maximum describe hourly averages, not instantaneous peaks; missing hours remain unknown.',
                'Only up to 100 billed VMs present in current inventory are queried, ordered by absolute selected-month cost. Memory, disk, network, availability and application demand are not assessed.',
                'Low CPU alone does not prove idleness or safe downsizing. No resource is classified as orphaned from generic inventory fields.',
                'Advisor findings are native observations, not validated actions. Unmatched and old findings are excluded from review candidates but retained as evidence.',
                'Advisor reported properties may include savings estimates; they are unvalidated, may overlap and are never summed or treated as realized savings.'
            ] };
    }
}
