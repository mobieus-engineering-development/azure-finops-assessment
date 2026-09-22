import { AzureCliCredential } from '@azure/identity';
import { configService } from '../../src/utils/config';
import { OperationalEvidenceService } from '../../src/services/operationalEvidenceService';
import { azureEvidenceGet, EvidenceGet, normalizeResourceId } from '../../src/services/operationalTransport';
import { buildMonthlyReport } from '../../src/services/monthlyReport';
import { monthlyCsvFiles, monthlyHtml } from '../../src/services/monthlyReportWriter';
import { MonthlyCostEvidence } from '../../src/models/monthlyReport';
import { HistoricalCostData } from '../../src/models/costAnalysis';
import { parseReportArguments } from '../../src/app';

const scope = '/subscriptions/test-subscription';
const vm = `${scope}/resourceGroups/Example/providers/Microsoft.Compute/virtualMachines/vm-one`;
const absent = `${scope}/resourceGroups/Example/providers/Microsoft.Compute/disks/old-disk`;
const clock = () => new Date('2026-09-22T12:00:00Z');
function period(month: string): HistoricalCostData {
    const costs = month === '2026-08' ? [100, 20, -5] : [50, 10, -2];
    return { startDate: `${month}-01T00:00:00.000Z`, endDate: `${month}-31T23:59:59.999Z`, totalCost: costs.reduce((a, b) => a + b), currency: 'EUR',
        dailyCosts: [{ date: `${month}-01T00:00:00.000Z`, cost: costs.reduce((a, b) => a + b), currency: 'EUR' }], dailyServiceCosts: [], monthlyCosts: [],
        costByService: [{ serviceName: 'Compute', cost: costs.reduce((a, b) => a + b), currency: 'EUR', serviceCategory: 'Not classified', percentageOfTotal: 100 }],
        costByResourceGroup: [{ resourceGroup: 'Example', cost: costs.reduce((a, b) => a + b), resourceCount: 2 }],
        costByResource: [vm, absent, ''].map((resourceId, i) => ({ resourceId: month === '2026-08' ? resourceId.toUpperCase() : resourceId, resourceName: ['VM', 'Old disk', 'Unallocated'][i], resourceGroup: 'Example', cost: costs[i], currency: 'EUR', location: 'Not collected', resourceType: 'Not collected' })) };
}
function financial(): MonthlyCostEvidence { return { month: '2026-08', generatedAt: clock().toISOString(), scope, costBasis: 'ActualCost', source: 'Synthetic cost fixture', collectedPages: 6, current: period('2026-08'), previous: period('2026-07') }; }
function rec(id: string, resourceId: string | undefined = vm, lastUpdated = '2026-09-20T00:00:00Z') {
    return { id: `${scope}/providers/Microsoft.Advisor/recommendations/${id}`, properties: { category: 'Cost', resourceMetadata: { resourceId }, lastUpdated, impact: 'High',
        shortDescription: { problem: 'Review sizing', solution: 'Validate workload requirements' }, extendedProperties: { annualSavingsAmount: '120', savingsCurrency: 'USD' } } };
}
function cpu(samples = [{ timeStamp: '2026-08-01T00:00:00Z', average: 0 }, { timeStamp: '2026-08-01T01:00:00Z', average: 10 }, { timeStamp: '2026-08-01T02:00:00Z', average: null as number | null }]) {
    return { interval: 'PT1H', value: [{ name: { value: 'Percentage CPU' }, unit: 'Percent', timeseries: [{ data: samples }] }] };
}
const get: EvidenceGet = async url => {
    if (url.includes('/resources?')) return { value: [{ id: vm, name: 'vm-one', type: 'Microsoft.Compute/virtualMachines', location: 'eastus', tags: { owner: 'Example team' } }] };
    if (url.includes('/recommendations?')) return { value: [rec('current'), rec('alternative'), rec('missing', absent), rec('old', vm, '2026-01-01T00:00:00Z')] };
    return cpu();
};
beforeEach(() => jest.spyOn(configService, 'getAzureConfig').mockReturnValue({ subscriptionId: 'test-subscription', tenantId: 'test-tenant', scope,
    costManagement: { liveDataOnly: true, apiDelayMs: 0, maxRetries: 1, retryBaseDelayMs: 0, retryMaxDelayMs: 10 } }));
afterEach(() => jest.restoreAllMocks());

test('resource ID normalization handles long slash sequences without backtracking', () => {
    expect(normalizeResourceId(`  ${vm.toUpperCase()}${'/'.repeat(100000)}  `)).toBe(vm.toLowerCase());
    const interior = `${scope}/${'/'.repeat(100000)}Resource`;
    expect(normalizeResourceId(interior)).toBe(interior.toLowerCase());
    expect(normalizeResourceId('////')).toBe('');
});

test('joins case-insensitively without losing credits or historical charges; excludes unmatched/old Advisor candidates', async () => {
    const ops = await new OperationalEvidenceService(get, clock).collect(financial());
    expect(ops.resources).toHaveLength(3);
    expect(ops.resources.reduce((n, r) => n + (r.currentCost ?? 0), 0)).toBe(115);
    expect(ops.resources.reduce((n, r) => n + (r.previousCost ?? 0), 0)).toBe(58);
    expect(ops.resources.find(r => r.name === 'VM')).toMatchObject({ inventoryMatch: 'present', currentCost: 100, previousCost: 50,
        cpu: { status: 'observed', expectedHours: 744, observedHours: 2, meanHourlyAverage: 5, p95HourlyAverage: 10, maxHourlyAverage: 10 } });
    expect(ops.resources.find(r => r.name === 'Old disk')!.inventoryMatch).toBe('not_in_current_inventory');
    expect(ops.resources.find(r => !r.resourceId)!.currentCost).toBe(-5);
    expect(ops.advisor.recommendations.map(r => r.reviewEligible)).toEqual([true, true, false, false]);
    expect(ops.advisor.recommendations[2].reviewReason).toContain('deletion is not proven');
    expect(ops.advisor.recommendations[0].reportedProperties.savingsCurrency).toBe('USD');
    expect(JSON.stringify(ops)).not.toContain('totalSavings');
});

test('inventory failure leaves presence unknown and partial operational failures preserve financial reporting', async () => {
    const ops = await new OperationalEvidenceService(async url => {
        if (url.includes('/resources?')) throw Object.assign(new Error('private body'), { statusCode: 403 });
        return get(url);
    }, clock).collect(financial());
    expect(ops.inventory).toMatchObject({ status: 'unavailable', reason: 'Access denied (HTTP 403).', resources: [] });
    expect(ops.resources.find(r => r.name === 'VM')!.inventoryMatch).toBe('unknown');
    expect(ops.advisor.recommendations.every(r => !r.reviewEligible && r.inventoryMatch === 'unknown')).toBe(true);
    expect(ops.metricsPolicy.requestedResources).toBe(0);
    expect(JSON.stringify(ops)).not.toContain('private body');
});

test('valid inventory names containing spaces do not invalidate the subscription snapshot', async () => {
    const ops = await new OperationalEvidenceService(async url => {
        const body = await get(url) as any;
        if (url.includes('/resources?')) body.value.push({ id: `${scope}/resourceGroups/Example/providers/Microsoft.Insights/metricAlerts/CPU Alert`, name: 'CPU Alert', type: 'Microsoft.Insights/metricAlerts' });
        return body;
    }, clock).collect(financial());
    expect(ops.inventory.status).toBe('complete');
    expect(ops.inventory.resources).toHaveLength(2);
    expect(ops.resources[0].inventoryMatch).toBe('present');
});

test('pagination is complete, and unsafe continuations discard partial inventory evidence', async () => {
    const query = jest.fn(async (url: string) => {
        if (url.includes('/resources?') && !url.includes('page=2')) return { value: [], nextLink: `https://management.azure.com${scope}/resources?api-version=2021-04-01&page=2` };
        return get(url);
    });
    expect((await new OperationalEvidenceService(query, clock).collect(financial())).inventory.pages).toBe(2);
    const unsafe = jest.fn(async (url: string) => url.includes('/resources?') ? { value: [(await get(url) as any).value[0]], nextLink: 'https://example.test/steal' } : get(url));
    const result = await new OperationalEvidenceService(unsafe, clock).collect(financial());
    expect(result.inventory.status).toBe('unavailable');
    expect(result.inventory.resources).toHaveLength(0);
    expect(unsafe.mock.calls.some(([url]) => url.includes('example.test'))).toBe(false);
});

test.each(['empty', 'null', 'invalid', 'duplicate', 'wrong-interval', 'denied'])('CPU %s does not become zero utilization', async mode => {
    const ops = await new OperationalEvidenceService(async url => {
        if (!url.includes('/metrics?')) return get(url);
        if (mode === 'denied') throw Object.assign(new Error('private'), { statusCode: 403 });
        if (mode === 'empty') return cpu([]);
        if (mode === 'null') return cpu([{ timeStamp: '2026-08-01T00:00:00Z', average: null }]);
        if (mode === 'invalid') return cpu([{ timeStamp: '2026-08-01T00:00:00Z', average: 101 }]);
        if (mode === 'duplicate') return cpu([{ timeStamp: '2026-08-01T00:00:00Z', average: 2 }, { timeStamp: '2026-08-01T00:00:00Z', average: 2 }]);
        return { ...cpu(), interval: 'PT6H' };
    }, clock).collect(financial());
    expect(ops.resources[0].cpu.status).toBe(['empty', 'null'].includes(mode) ? 'no_data' : 'unavailable');
    expect(ops.resources[0].cpu.meanHourlyAverage).toBeNull();
});

test('uses the financial month only and skips queries beyond metric retention', async () => {
    const query = jest.fn(get);
    await new OperationalEvidenceService(query, clock).collect(financial());
    const metrics = new URL(query.mock.calls.find(([url]) => url.includes('/metrics?'))![0]);
    expect(metrics.searchParams.get('timespan')).toBe('2026-08-01T00:00:00.000Z/2026-09-01T00:00:00.000Z');
    const old = financial(); old.current.startDate = '2026-01-01T00:00:00Z'; old.current.endDate = '2026-01-31T23:59:59.999Z';
    query.mockClear();
    const result = await new OperationalEvidenceService(query, clock).collect(old);
    expect(result.resources[0].cpu.reason).toContain('93-day');
    expect(query.mock.calls.some(([url]) => url.includes('/metrics?'))).toBe(false);
});

test('Advisor duplicates are not counted twice and conflicts fail closed', async () => {
    const result = await new OperationalEvidenceService(async url => url.includes('/recommendations?') ? { value: [rec('same'), rec('same')] } : get(url), clock).collect(financial());
    expect(result.advisor.recommendations).toHaveLength(1);
    const conflict = await new OperationalEvidenceService(async url => url.includes('/recommendations?') ? { value: [rec('same'), rec('same', absent)] } : get(url), clock).collect(financial());
    expect(conflict.advisor.status).toBe('unavailable');
});

test('caps metrics at 100 VMs while preserving every billed row and refuses scope mismatch', async () => {
    const costs = financial();
    const rows = Array.from({ length: 101 }, (_, i) => ({ ...costs.current.costByResource[0], resourceId: `${vm}-${i}`, cost: i + 1 }));
    costs.current.costByResource = rows;
    costs.current.totalCost = rows.reduce((n, r) => n + r.cost, 0);
    const query = jest.fn(async (url: string) => {
        if (url.includes('/resources?')) return { value: rows.map(r => ({ id: r.resourceId, name: r.resourceName, type: 'Microsoft.Compute/virtualMachines' })) };
        if (url.includes('/recommendations?')) return { value: [] };
        return cpu();
    });
    const ops = await new OperationalEvidenceService(query, clock).collect(costs);
    expect(ops.metricsPolicy.requestedResources).toBe(100);
    expect(query.mock.calls.filter(([url]) => url.includes('/metrics?'))).toHaveLength(100);
    expect(ops.resources.find(r => r.resourceId === `${vm}-0`)!.cpu.reason).toContain('100-VM');
    expect(ops.resources.reduce((n, r) => n + (r.currentCost ?? 0), 0)).toBe(costs.current.totalCost);
    costs.scope = '/subscriptions/another';
    await expect(new OperationalEvidenceService(query, clock).collect(costs)).rejects.toThrow('scopes differ');
});

test('report exports all operational evidence and escapes user/provider text', async () => {
    const report = buildMonthlyReport(financial());
    report.operationalEvidence = await new OperationalEvidenceService(get, clock).collect(report.evidence);
    report.operationalEvidence.resources[0].name = '=HYPERLINK("x")';
    report.operationalEvidence.advisor.recommendations[0].problem = '<script>alert(1)</script>';
    const files = monthlyCsvFiles(report), html = monthlyHtml(report);
    expect(files['operational-resources.csv']).toContain('"\'=HYPERLINK(""x"")"');
    expect(files['cpu-samples.csv']).toContain('"0"');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('No savings total is calculated');
    expect(html).toContain('href="advisor-evidence.csv"');
});

test('operational collection is opt-in and requires monthly mode', () => {
    expect(parseReportArguments(['--monthly', '2026-08', '--with-operations'])).toEqual({ monthly: true, month: '2026-08', withOperations: true });
    expect(parseReportArguments(['--monthly', '2026-08']).withOperations).toBeUndefined();
    expect(() => parseReportArguments(['--with-operations'])).toThrow('Usage');
    expect(() => parseReportArguments(['--monthly', '--with-operations', '--with-operations'])).toThrow('Usage');
});

test('transport rejects unsafe destinations before credential acquisition and permits GET only', async () => {
    const token = jest.spyOn(AzureCliCredential.prototype, 'getToken').mockResolvedValue({ token: 'synthetic-token', expiresOnTimestamp: Date.now() + 10000 });
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ value: [] }), { status: 200 }));
    const transport = azureEvidenceGet('test-tenant', scope);
    for (const url of ['https://example.test/metrics', `http://management.azure.com${scope}/resources`, `https://management.azure.com/subscriptions/other/resources`, `https://management.azure.com${scope}/providers/Microsoft.Advisor/generateRecommendations`, `https://user:password@management.azure.com${scope}/resources`]) await expect(transport(url)).rejects.toThrow('allowlist');
    expect(token).not.toHaveBeenCalled();
    await transport(`https://management.azure.com${scope}/resources?api-version=2021-04-01`);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'GET', redirect: 'error' });
});

test('large throttle delays halt further operational requests without retrying early or leaking response bodies', async () => {
    jest.spyOn(AzureCliCredential.prototype, 'getToken').mockResolvedValue({ token: 'synthetic-token', expiresOnTimestamp: Date.now() + 10000 });
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('private payload', { status: 429, headers: { 'Retry-After': '120' } }));
    const transport = azureEvidenceGet('test-tenant', scope);
    await expect(transport(`https://management.azure.com${scope}/resources`)).rejects.toMatchObject({ statusCode: 429, message: 'Operational evidence request failed.' });
    await expect(transport(`https://management.azure.com${scope}/providers/Microsoft.Advisor/recommendations`)).rejects.toMatchObject({ statusCode: 429 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
});
