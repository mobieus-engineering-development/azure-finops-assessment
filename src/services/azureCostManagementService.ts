import { QueryDefinition } from '@azure/arm-costmanagement';
import { ComprehensiveCostAnalysis, HistoricalCostData, CurrentCostData, ForecastedCostData,
    CostDataPoint, DailyServiceCostPoint, CostByResource } from '../models/costAnalysis';
import { configService } from '../utils/config';
import { azureCostTransport, CostTransport, sumCosts, usageDate, percentChange, retryAfterMs } from './costQuery';

const DAY = 86_400_000;
const monthStart = (date: Date, offset = 0) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1));
const midnight = (date: Date) => Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
const monthName = (date: Date) => date.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
type Period = Omit<HistoricalCostData, 'startDate' | 'endDate'>;
type Row = Record<string, unknown>;

function group(rows: Row[], name: string): Array<{ name: string; cost: number }> {
    const map = new Map<string, number[]>();
    for (const row of rows) {
        const key = String(row[name] || 'Unallocated');
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(Number(row.Cost));
    }
    return [...map].map(([name, costs]) => ({ name, cost: sumCosts(costs) }));
}

/** Single-subscription, read-only ActualCost collection. Never substitutes mock billing data. */
export class AzureCostManagementService {
    private readonly subscriptionId: string;
    private readonly scope: string;
    private readonly transport: CostTransport;
    private readonly policy: { apiDelayMs: number; maxRetries: number; retryBaseDelayMs: number; retryMaxDelayMs: number };
    private readonly queryCache = new Map<string, { value: Period; timestamp: number }>();
    private lastRequestAt: number | undefined;
    private collectedPages = 0;
    private reportDate: Date | undefined;
    private now(): Date { return this.reportDate || this.clock(); }

    constructor(transport?: CostTransport, private readonly clock: () => Date = () => new Date()) {
        const config = configService.getAzureConfig();
        this.subscriptionId = config.subscriptionId;
        this.scope = config.scope.replace(/\/$/, '');
        if (!this.subscriptionId || this.scope.toLowerCase() !== `/subscriptions/${this.subscriptionId}`.toLowerCase()) {
            throw new Error('Selected subscription and cost scope must agree. Only subscription scope is supported.');
        }
        if (!config.costManagement.liveDataOnly) throw new Error('Synthetic billing fallback is no longer supported. Enable liveDataOnly.');
        const { apiDelayMs, maxRetries, retryBaseDelayMs, retryMaxDelayMs } = config.costManagement;
        this.policy = { apiDelayMs, maxRetries, retryBaseDelayMs, retryMaxDelayMs };
        for (const [name, value] of Object.entries(this.policy)) {
            if (!Number.isInteger(value) || value < (name === 'maxRetries' ? 1 : 0)) throw new Error(`Invalid Cost Management setting: ${name}.`);
        }
        this.transport = transport || azureCostTransport(config.tenantId, this.scope);
    }

    private async delay(ms: number): Promise<void> { if (ms > 0) await new Promise(resolve => setTimeout(resolve, ms)); }

    private async request(query: QueryDefinition, nextLink?: string) {
        for (let attempt = 0; attempt < this.policy.maxRetries; attempt++) {
            if (this.lastRequestAt !== undefined) await this.delay(Math.max(0, this.policy.apiDelayMs - (Date.now() - this.lastRequestAt)));
            this.lastRequestAt = Date.now();
            try { return await this.transport(query, nextLink); }
            catch (error: any) {
                const status = error?.statusCode;
                if ((status !== 429 && status !== 503) || attempt + 1 === this.policy.maxRetries) {
                    // Do not propagate SDK errors containing identifiers, request bodies or tokens into logs.
                    throw new Error(`Cost collection failed${status ? ` (HTTP ${status})` : ''}. No report was generated; check access and retry.`);
                }
                const wait = Math.max(retryAfterMs(error, Date.now()), Math.min(this.policy.retryBaseDelayMs * 2 ** attempt, this.policy.retryMaxDelayMs));
                if (wait > this.policy.retryMaxDelayMs) throw new Error('Azure requested a retry delay beyond the wait limit. Stop and retry later.');
                await this.delay(wait);
            }
        }
        throw new Error('Cost collection did not complete.');
    }

    private async collect(start: Date, end: Date, grouping: string[], daily: boolean): Promise<Row[]> {
        const query: QueryDefinition = { type: 'ActualCost', timeframe: 'Custom', timePeriod: { from: start, to: end },
            dataset: { granularity: daily ? 'Daily' : 'None', aggregation: { totalCost: { name: 'Cost', function: 'Sum' } },
                ...(grouping.length ? { grouping: grouping.map(name => ({ type: 'Dimension' as const, name })) } : {}) } };
        const records: Row[] = [], seen = new Set<string>(), rowKeys = new Set<string>();
        let nextLink: string | undefined;
        for (let pageNumber = 0; pageNumber < 1000; pageNumber++) {
            const page = await this.request(query, nextLink);
            this.collectedPages++;
            const names = page.columns?.map(c => c.name || '') || [];
            if (page.rows?.length) {
                const required = ['Cost', 'Currency', ...grouping, ...(daily ? ['UsageDate'] : [])];
                if (names.length !== new Set(names).size || required.some(name => !names.includes(name))) throw new Error('Cost response schema is incomplete or ambiguous.');
                for (const row of page.rows) {
                    if (!Array.isArray(row) || row.length !== names.length) throw new Error('Malformed cost response row.');
                    const record = Object.fromEntries(names.map((name, i) => [name, row[i]]));
                    if ((typeof record.Cost !== 'number' && typeof record.Cost !== 'string') || String(record.Cost).trim() === '' || !Number.isFinite(Number(record.Cost))) throw new Error('Invalid numeric cost in response.');
                    if (typeof record.Currency !== 'string' || !/^[A-Z]{3}$/.test(record.Currency)) throw new Error('Cost currency is missing or invalid.');
                    record.Cost = Number(record.Cost);
                    if (daily) {
                        record.UsageDate = usageDate(record.UsageDate);
                        const time = Date.parse(String(record.UsageDate));
                        if (time < start.getTime() || time > end.getTime()) throw new Error('Cost response contains a date outside the requested period.');
                    }
                    const rowKey = JSON.stringify([record.Currency, ...(daily ? [record.UsageDate] : []), ...grouping.map(name => record[name])]);
                    if (rowKeys.has(rowKey)) throw new Error('Duplicate aggregate row across cost pages. Collection is ambiguous.');
                    rowKeys.add(rowKey);
                    records.push(record);
                }
            }
            nextLink = page.nextLink;
            if (!nextLink) return records;
            if (seen.has(nextLink)) throw new Error('Repeated cost continuation link. Collection is incomplete.');
            seen.add(nextLink);
        }
        throw new Error('Cost pagination limit exceeded. Collection is incomplete.');
    }

    private async queryActualCosts(start: Date, end: Date): Promise<Period> {
        const key = `${this.scope}|ActualCost|${start.toISOString()}|${end.toISOString()}`;
        const cached = this.queryCache.get(key);
        if (cached && Date.now() - cached.timestamp < 300_000) return cached.value;
        const dailyRows: Row[] = [], serviceRows: Row[] = [];
        // Split long daily lookbacks into calendar months.
        for (let from = start; from <= end;) {
            const to = new Date(Math.min(end.getTime(), monthStart(from, 1).getTime() - 1));
            dailyRows.push(...await this.collect(from, to, [], true));
            serviceRows.push(...await this.collect(from, to, ['ServiceName'], true));
            from = new Date(to.getTime() + 1);
        }
        const resources = await this.collect(start, end, ['ResourceId', 'ResourceGroupName'], false);
        const currencies = new Set([...dailyRows, ...serviceRows, ...resources].map(row => String(row.Currency)));
        if (!currencies.size) throw new Error('No cost rows returned for a required period. Spend and currency are unknown, not zero.');
        if (currencies.size !== 1) throw new Error('Multiple currencies returned. Separate currency reports are required; currencies were not added together.');
        const currency = [...currencies][0], totalCost = sumCosts(dailyRows.map(r => Number(r.Cost)));
        if (!dailyRows.length || !serviceRows.length || !resources.length ||
            Math.abs(totalCost - sumCosts(serviceRows.map(r => Number(r.Cost)))) > 0.01 || Math.abs(totalCost - sumCosts(resources.map(r => Number(r.Cost)))) > 0.01) {
            throw new Error('Daily, service and resource costs do not reconcile. Data may have changed; retry collection.');
        }
        const dailyCosts = group(dailyRows, 'UsageDate').map(r => ({ date: r.name, cost: r.cost, currency })).sort((a, b) => a.date.localeCompare(b.date));
        const dailyServiceCosts: DailyServiceCostPoint[] = [], byServiceDate = new Map<string, Row[]>();
        for (const row of serviceRows) {
            const key = JSON.stringify([row.UsageDate, row.ServiceName || 'Unallocated']);
            if (!byServiceDate.has(key)) byServiceDate.set(key, []);
            byServiceDate.get(key)!.push(row);
        }
        for (const rows of byServiceDate.values()) dailyServiceCosts.push({ date: String(rows[0].UsageDate), serviceName: String(rows[0].ServiceName || 'Unallocated'),
            serviceCategory: 'Not classified', currency, cost: sumCosts(rows.map(r => Number(r.Cost))) });
        for (const day of dailyCosts) {
            if (Math.abs(day.cost - sumCosts(dailyServiceCosts.filter(r => r.date === day.date).map(r => r.cost))) > 0.01) throw new Error('Daily service costs do not reconcile. Attribution is unavailable.');
        }
        if (dailyServiceCosts.some(r => !dailyCosts.some(d => d.date === r.date))) throw new Error('Service costs contain unmatched dates.');
        const costByResource: CostByResource[] = resources.map(row => {
            const id = String(row.ResourceId || '');
            return { resourceId: id, resourceName: id.split('/').pop() || 'Unallocated', resourceType: 'Not collected',
                resourceGroup: String(row.ResourceGroupName || 'Unallocated'), location: 'Not collected', cost: Number(row.Cost), currency };
        }).sort((a, b) => b.cost - a.cost);
        const result: Period = { totalCost, currency, dailyCosts, dailyServiceCosts,
            monthlyCosts: group(dailyRows.map(r => ({ ...r, month: String(r.UsageDate).slice(0, 7) + '-01T00:00:00.000Z' })), 'month')
                .map(r => ({ date: r.name, cost: r.cost, currency })).sort((a, b) => a.date.localeCompare(b.date)),
            costByService: group(serviceRows, 'ServiceName').map(r => ({ serviceName: r.name, serviceCategory: 'Not classified', cost: r.cost, currency,
                percentageOfTotal: totalCost > 0 ? r.cost / totalCost * 100 : null })).sort((a, b) => b.cost - a.cost), costByResource,
            costByResourceGroup: group(resources, 'ResourceGroupName').map(r => ({ resourceGroup: r.name, cost: r.cost,
                resourceCount: new Set(costByResource.filter(x => x.resourceGroup === r.name && x.resourceId).map(x => x.resourceId.toLowerCase())).size })) };
        this.queryCache.set(key, { value: result, timestamp: Date.now() });
        return result;
    }

    public async getHistoricalCostData(days = 30): Promise<HistoricalCostData> {
        if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error('Historical days must be an integer from 1 to 365.');
        const day = midnight(this.now()), start = new Date(day - days * DAY), end = new Date(day - 1);
        return { startDate: start.toISOString(), endDate: end.toISOString(), ...await this.queryActualCosts(start, end) };
    }

    public async getCurrentCostData(): Promise<CurrentCostData> {
        const now = this.now(), start = monthStart(now), previous = monthStart(now, -1), older = monthStart(now, -2), cutoff = new Date(midnight(now) - 1);
        if (cutoff < start) throw new Error('No completed UTC day in this month yet. Run after the first day closes.');
        const current = await this.queryActualCosts(start, cutoff);
        const last = await this.queryActualCosts(previous, new Date(start.getTime() - 1));
        const twoAgo = await this.queryActualCosts(older, new Date(previous.getTime() - 1));
        if (new Set([current.currency, last.currency, twoAgo.currency]).size !== 1) throw new Error('Currency changed across periods; comparison is unavailable.');
        const comparableDays = Math.min(now.getUTCDate() - 1, new Date(start.getTime() - 1).getUTCDate());
        const priorComparable = sumCosts(last.dailyCosts.filter(d => new Date(d.date).getUTCDate() <= comparableDays).map(d => d.cost));
        const currentComparable = sumCosts(current.dailyCosts.filter(d => new Date(d.date).getUTCDate() <= comparableDays).map(d => d.cost));
        return { billingPeriodStart: start.toISOString(), billingPeriodEnd: new Date(monthStart(now, 1).getTime() - 1).toISOString(), currentDate: now.toISOString(),
            monthToDateCost: current.totalCost, estimatedMonthEndCost: null, currency: current.currency, dailyCosts: current.dailyCosts,
            topCostResources: current.costByResource.slice(0, 10), topCostServices: current.costByService.slice(0, 10),
            comparisonToPreviousMonth: { previousMonthTotal: last.totalCost, changeAmount: currentComparable - priorComparable,
                changePercent: percentChange(priorComparable, currentComparable), comparableDays, previousComparableCost: priorComparable, currentComparableCost: currentComparable },
            monthlyComparison: { twoMonthsAgo: { name: monthName(older), total: twoAgo.totalCost }, lastMonth: { name: monthName(previous), total: last.totalCost },
                currentMonth: { name: monthName(start), monthToDate: current.totalCost, projected: null },
                lastTwoMonthsChange: { amount: last.totalCost - twoAgo.totalCost, percent: percentChange(twoAgo.totalCost, last.totalCost) }, projectedChange: { amount: null, percent: null } } };
    }

    public async getForecastedCostData(days = 30, existing?: HistoricalCostData): Promise<ForecastedCostData> {
        if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error('Forecast days must be an integer from 1 to 365.');
        const history = existing || await this.getHistoricalCostData(30), start = midnight(this.now());
        return { forecastStartDate: new Date(start).toISOString(), forecastEndDate: new Date(start + days * DAY - 1).toISOString(),
            totalForecastedCost: null, currency: history.currency, dailyForecasts: [], monthlyForecasts: [], forecastMethod: 'unavailable', confidenceLevel: null,
            assumptions: ['No validated forecast is collected. No random projection or confidence interval is generated.'] };
    }

    public async getComprehensiveCostAnalysis(): Promise<ComprehensiveCostAnalysis> {
        if (this.reportDate) throw new Error('A report is already being collected by this service.');
        this.reportDate = this.clock();
        try { return await this.collectAnalysis(); }
        finally { this.reportDate = undefined; this.queryCache.clear(); }
    }

    private async collectAnalysis(): Promise<ComprehensiveCostAnalysis> {
        this.queryCache.clear(); this.collectedPages = 0;
        const now = this.now(), settings = configService.getAnalysisConfig();
        const historical = await this.getHistoricalCostData(settings.historicalDays), current = await this.getCurrentCostData();
        if (historical.currency !== current.currency) throw new Error('Currency differs between report periods.');
        const forecasted = await this.getForecastedCostData(settings.forecastDays, historical), distinctDays = new Map<string, CostDataPoint>();
        for (const day of [...historical.dailyCosts, ...current.dailyCosts]) {
            const existing = distinctDays.get(day.date);
            if (existing && Math.abs(existing.cost - day.cost) > 0.01) throw new Error('Overlapping period costs changed during collection. Retry.');
            distinctDays.set(day.date, day);
        }
        const costs = [...distinctDays.values()].map(d => d.cost);
        return { id: `analysis-${now.getTime()}`, subscriptionId: this.subscriptionId, scope: this.scope, analysisDate: now.toISOString(), historical, current, forecasted,
            trends: [], anomalies: [], fluctuations: [], dataProvenance: { mode: 'live', source: 'Azure Cost Management Query API', generatedFromFallback: false,
                queryPolicy: this.policy, costBasis: 'ActualCost', coverage: 'Single selected subscription; tenant-wide coverage not assessed',
                queriedThrough: new Date(midnight(now) - 1).toISOString(), collectedPages: this.collectedPages, notices: [
                    'All requested pages collected; daily, service and resource totals reconciled within 0.01 currency units.',
                    'Today is excluded (UTC). Costs remain provisional: billing ingestion lag and rerating are not measured.',
                    'Missing daily rows are not imputed as zero. Averages use observed days; calendar completeness is not guaranteed.',
                    'Forecasts, utilization-based recommendations and savings estimates are unavailable in this report.',
                    'ActualCost is not a reconciled invoice and includes signed adjustments returned by Azure.'
                ] }, summary: { totalHistoricalCost: historical.totalCost, currentMonthToDate: current.monthToDateCost, forecastedMonthEnd: null, forecastedNextMonth: null,
                    currency: historical.currency, avgDailySpend: sumCosts(costs) / costs.length, peakDailySpend: Math.max(...costs), lowestDailySpend: Math.min(...costs) } };
    }
}
