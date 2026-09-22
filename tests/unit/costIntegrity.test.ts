import { QueryDefinition } from '@azure/arm-costmanagement';
import { AzureCostManagementService } from '../../src/services/azureCostManagementService';
import { CostPage, CostTransport, percentChange, retryAfterMs, usageDate } from '../../src/services/costQuery';
import { configService } from '../../src/utils/config';
import { HtmlReportGenerator } from '../../src/services/htmlReportGenerator';
import { DailyCostFluctuationAnalyzer } from '../../src/analyzers/dailyCostFluctuationAnalyzer';
import { AnomalyDetector } from '../../src/analyzers/anomalyDetector';
import { FinOpsAssessmentApp } from '../../src/app';
import fs = require('fs');
import * as os from 'os';
import * as path from 'path';

jest.mock('../../src/utils/logger', () => ({ logInfo: jest.fn(), logWarning: jest.fn(), logError: jest.fn() }));

const clock = () => new Date('2026-09-21T12:34:56Z');
const dayCost = (date: Date) => date.getUTCDate() * 10;

/** One independent synthetic ledger: signed service and resource allocations. */
function ledger(query: QueryDefinition, currency = 'EUR', cost = dayCost): CostPage {
    const dates: Date[] = [];
    for (let time = query.timePeriod!.from.getTime(); time <= query.timePeriod!.to.getTime(); time += 86_400_000) dates.push(new Date(time));
    const dateKey = (d: Date) => Number(d.toISOString().slice(0, 10).replace(/-/g, ''));
    const groups = query.dataset.grouping?.map(g => g.name) || [];
    if (groups.includes('ResourceId')) {
        const total = dates.reduce((sum, d) => sum + cost(d), 0);
        return { columns: ['Currency', 'ResourceId', 'Cost', 'ResourceGroupName'].map(name => ({ name })), rows: [
            [currency, '/subscriptions/test-subscription/resourceGroups/rg/providers/Microsoft.Compute/virtualMachines/test-vm', total + dates.length * 5, 'rg'],
            [currency, '', -dates.length * 5, '']
        ] };
    }
    if (groups.includes('ServiceName')) return {
        columns: ['UsageDate', 'Currency', 'ServiceName', 'Cost'].map(name => ({ name })),
        rows: dates.flatMap(d => [[dateKey(d), currency, 'Compute', cost(d) + 5], [dateKey(d), currency, 'Credits', -5]])
    };
    return { columns: ['Currency', 'Cost', 'UsageDate'].map(name => ({ name })), rows: dates.map(d => [currency, cost(d), dateKey(d)]) };
}

beforeEach(() => {
    jest.spyOn(configService, 'getAzureConfig').mockReturnValue({ subscriptionId: 'test-subscription', tenantId: 'test-tenant', scope: '/subscriptions/test-subscription',
        costManagement: { liveDataOnly: true, apiDelayMs: 0, maxRetries: 2, retryBaseDelayMs: 0, retryMaxDelayMs: 10 } });
    const original = configService.getAnalysisConfig();
    jest.spyOn(configService, 'getAnalysisConfig').mockReturnValue({ ...original, historicalDays: 3 });
});
afterEach(() => jest.restoreAllMocks());

test('collects every page, uses column names, retains credits, and fills resource/group/monthly data', async () => {
    const requests: QueryDefinition[] = [];
    const transport = jest.fn(async (q: QueryDefinition, next?: string) => {
        requests.push(q);
        const page = ledger(q), middle = Math.ceil(page.rows!.length / 2);
        return { ...page, rows: next ? page.rows!.slice(middle) : page.rows!.slice(0, middle), nextLink: next ? undefined : 'page-2' };
    });
    const history = await new AzureCostManagementService(transport, clock).getHistoricalCostData(3);
    expect(transport).toHaveBeenCalledTimes(6);
    expect(requests.every(r => r.type === 'ActualCost')).toBe(true);
    expect(history).toMatchObject({ startDate: '2026-09-18T00:00:00.000Z', endDate: '2026-09-20T23:59:59.999Z', totalCost: 570, currency: 'EUR' });
    expect(history.costByService.find(s => s.serviceName === 'Credits')!.cost).toBe(-15);
    expect(history.costByResource.find(r => !r.resourceId)!.cost).toBe(-15);
    expect(history.costByResourceGroup.reduce((n, r) => n + r.cost, 0)).toBe(570);
    expect(history.monthlyCosts).toEqual([{ date: '2026-09-01T00:00:00.000Z', cost: 570, currency: 'EUR' }]);
});

test('page columns can be reordered without corrupting totals', async () => {
    const transport: CostTransport = async (q, next) => {
        const p = ledger(q);
        if (!next) return { ...p, rows: [], nextLink: 'second' };
        return { columns: [...p.columns!].reverse(), rows: p.rows!.map(r => [...r].reverse()) };
    };
    expect((await new AzureCostManagementService(transport, clock).getHistoricalCostData(1)).totalCost).toBe(200);
});

test.each(['missing-column', 'invalid-cost', 'missing-currency', 'invalid-date', 'mixed-currency', 'mismatch', 'empty', 'repeated-page', 'duplicate-row'])(
    'fails closed for %s rather than returning plausible totals', async mode => {
        const transport: CostTransport = async q => {
            const p = ledger(q);
            if (mode === 'empty') return {};
            if (mode === 'repeated-page') return { ...p, nextLink: 'same-page' };
            if (mode === 'duplicate-row') p.rows!.push(p.rows![0]);
            if (mode === 'missing-column') p.columns = p.columns!.filter(c => c.name !== 'Cost');
            const ci = p.columns!.findIndex(c => c.name === 'Cost'), ui = p.columns!.findIndex(c => c.name === 'Currency'), di = p.columns!.findIndex(c => c.name === 'UsageDate');
            if (mode === 'invalid-cost') p.rows![0][ci] = 'not-a-number';
            if (mode === 'missing-currency') p.rows![0][ui] = null;
            if (mode === 'invalid-date' && di >= 0) p.rows![0][di] = 20260230;
            if (mode === 'mixed-currency') p.rows![0][ui] = 'USD';
            if (mode === 'mismatch' && q.dataset.grouping?.length) p.rows![0][ci] += 1;
            return p;
        };
        await expect(new AzureCostManagementService(transport, clock).getHistoricalCostData(3)).rejects.toThrow();
    }
);

test('does not cache failed or partial collection; a later clean run succeeds', async () => {
    let fail = true;
    const transport: CostTransport = async q => { if (fail) throw { statusCode: 403, message: 'sensitive-value' }; return ledger(q); };
    const service = new AzureCostManagementService(transport, clock);
    await expect(service.getHistoricalCostData(3)).rejects.toThrow('HTTP 403');
    fail = false;
    expect((await service.getHistoricalCostData(3)).totalCost).toBe(570);
});

test('valid zero and negative billed totals are retained, with no fictitious percentage share', async () => {
    for (const amount of [0, -10]) {
        const history = await new AzureCostManagementService(async q => ledger(q, 'GBP', () => amount), clock).getHistoricalCostData(1);
        expect(history.totalCost).toBe(amount);
        expect(history.costByService.every(s => s.percentageOfTotal === null)).toBe(true);
    }
});

test('UTC periods span leap day and split long lookbacks into calendar-month daily queries', async () => {
    const transport = jest.fn(async q => ledger(q));
    const result = await new AzureCostManagementService(transport, () => new Date('2024-03-01T00:30:00Z')).getHistoricalCostData(60);
    expect(result.startDate).toBe('2024-01-01T00:00:00.000Z');
    expect(result.endDate).toBe('2024-02-29T23:59:59.999Z');
    expect(result.dailyCosts).toHaveLength(60);
    expect(transport.mock.calls.filter(([q]) => q.dataset.granularity === 'Daily')).toHaveLength(4);
});

test('rejects missing current-month completed days and invalid lookbacks without querying', async () => {
    const transport = jest.fn(async q => ledger(q));
    const service = new AzureCostManagementService(transport, () => new Date('2026-10-01T23:59:59Z'));
    await expect(service.getCurrentCostData()).rejects.toThrow('No completed UTC day');
    await expect(service.getHistoricalCostData(0)).rejects.toThrow();
    await expect(service.getHistoricalCostData(1.5)).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
});

test('MTD comparison uses matching elapsed days, not last full month', async () => {
    const current = await new AzureCostManagementService(async q => ledger(q), clock).getCurrentCostData();
    expect(current.comparisonToPreviousMonth).toMatchObject({ comparableDays: 20, previousComparableCost: 2100, currentComparableCost: 2100, changeAmount: 0, changePercent: 0 });
    expect(current.comparisonToPreviousMonth.previousMonthTotal).toBe(4960);
});

test('overlapping dates count once, forecasts/savings remain unavailable and provenance is explicit', async () => {
    const analysis = await new AzureCostManagementService(async q => ledger(q), clock).getComprehensiveCostAnalysis();
    expect(analysis.summary.avgDailySpend).toBe(105); // September 1..20, not 1..20 plus 18..20.
    expect(analysis.forecasted).toMatchObject({ totalForecastedCost: null, forecastMethod: 'unavailable', confidenceLevel: null, dailyForecasts: [] });
    expect(analysis.dataProvenance).toMatchObject({ costBasis: 'ActualCost', generatedFromFallback: false, queriedThrough: '2026-09-20T23:59:59.999Z' });
    expect(analysis.dataProvenance.coverage).toContain('Single selected subscription');
    const html = new HtmlReportGenerator().generate(analysis);
    expect(html).toContain('EUR');
    expect(html).not.toContain('well-optimized');
    expect(html).not.toContain('LIVE VERIFIED');
    expect(html).not.toMatch(/NaN|Infinity|\$\d/);
    expect(html).toContain('Not assessed');
});

test('refuses synthetic fallback and scope mismatch', () => {
    const cfg = configService.getAzureConfig();
    jest.mocked(configService.getAzureConfig).mockReturnValue({ ...cfg, scope: '/subscriptions/different' });
    expect(() => new AzureCostManagementService(async q => ledger(q))).toThrow('scope must agree');
    jest.mocked(configService.getAzureConfig).mockReturnValue({ ...cfg, costManagement: { ...cfg.costManagement, liveDataOnly: false } });
    expect(() => new AzureCostManagementService(async q => ledger(q))).toThrow('fallback');
});

test('honors retry headers by refusing an excessive server wait rather than retrying early', async () => {
    const transport = jest.fn(async () => { throw { statusCode: 429, response: { headers: { get: (name: string) => name === 'retry-after' ? '120' : null } } }; });
    await expect(new AzureCostManagementService(transport, clock).getHistoricalCostData(1)).rejects.toThrow('beyond the wait limit');
    expect(transport).toHaveBeenCalledTimes(1);
    expect(retryAfterMs({ response: { headers: { 'retry-after': '1', 'x-ms-ratelimit-microsoft.costmanagement-qpu-retry-after': '10' } } }, 0)).toBe(10_000);
    expect(retryAfterMs({ response: { headers: { 'retry-after': 'Thu, 01 Jan 1970 00:00:02 GMT' } } }, 1000)).toBe(1000);
});

test('flags zero-to-positive spend without inventing a percentage, and skips missing-day comparisons', async () => {
    const analysis = await new AzureCostManagementService(async q => ledger(q), clock).getComprehensiveCostAnalysis();
    analysis.historical.dailyCosts = [{ date: '2026-09-19', cost: 0, currency: 'EUR' }, { date: '2026-09-20', cost: 50, currency: 'EUR' }];
    const analyzer = new DailyCostFluctuationAnalyzer();
    expect(analyzer.analyzeFluctuations(analysis)[0]).toMatchObject({ totalChangeAmount: 50, totalChangePercent: null, direction: 'increasing' });
    analysis.historical.dailyCosts[0].date = '2026-09-18';
    expect(analyzer.analyzeFluctuations(analysis)).toEqual([]);
    expect(percentChange(0, 5)).toBeNull();
    expect(percentChange(-5, 10)).toBeNull();
    expect(() => usageDate(20260230)).toThrow();
});

test('anomalies are reproducible for the report date and have no fabricated confidence', async () => {
    const analysis = await new AzureCostManagementService(async q => ledger(q), clock).getComprehensiveCostAnalysis();
    analysis.historical.dailyCosts = Array.from({ length: 10 }, (_, i) => ({ date: `2026-09-${11 + i}`, cost: i === 9 ? 1000 : 10, currency: 'EUR' }));
    const detector = new AnomalyDetector();
    expect(detector.detectAnomalies(analysis).some(a => a.category === 'spike')).toBe(true);
    expect(detector.detectAnomalies(analysis).every(a => a.confidence === undefined)).toBe(true);
    expect(detector.detectAnomalies(analysis)).toEqual(detector.detectAnomalies(analysis));
});

test('a required report write failure rejects the run instead of reporting success', async () => {
    const service = new AzureCostManagementService(async q => ledger(q), clock);
    jest.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);
    jest.spyOn(fs, 'writeFileSync').mockImplementation(() => { throw new Error('disk full'); });
    await expect(new FinOpsAssessmentApp(service).run()).rejects.toThrow('could not be saved');
});

test('dotenv reload cannot replace the selected runtime subscription or scope', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finops-config-test-'));
    const envFile = path.join(directory, '.env');
    fs.writeFileSync(envFile, 'AZURE_SUBSCRIPTION_ID=old-sub\nAZURE_TENANT_ID=old-tenant\nAZURE_SCOPE=/subscriptions/old-sub\n');
    const saved = Object.fromEntries(['AZURE_SUBSCRIPTION_ID', 'AZURE_TENANT_ID', 'AZURE_SCOPE'].map(key => [key, process.env[key]]));
    const cwd = jest.spyOn(process, 'cwd').mockReturnValue(directory);
    try {
        process.env.AZURE_SUBSCRIPTION_ID = 'selected-sub';
        process.env.AZURE_TENANT_ID = 'selected-tenant';
        process.env.AZURE_SCOPE = '/subscriptions/selected-sub';
        configService.reload();
        expect(configService.get().azure.subscriptionId).toBe('selected-sub');
        expect(configService.get().azure.tenantId).toBe('selected-tenant');
        expect(configService.get().azure.scope).toBe('/subscriptions/selected-sub');
    } finally {
        cwd.mockRestore();
        for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
        configService.reload();
        fs.unlinkSync(envFile); fs.rmdirSync(directory);
    }
});
