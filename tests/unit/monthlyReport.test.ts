import { QueryDefinition } from '@azure/arm-costmanagement';
import { AzureCostManagementService } from '../../src/services/azureCostManagementService';
import { configService } from '../../src/utils/config';
import { buildMonthlyReport, closedMonthWindow } from '../../src/services/monthlyReport';
import { monthlyCsvFiles, monthlyHtml, writeMonthlyReport } from '../../src/services/monthlyReportWriter';
import { parseReportArguments } from '../../src/app';
import fs = require('fs');
import * as os from 'os';
import * as path from 'path';

const clock = () => new Date('2026-09-01T00:00:00Z');

// Independent fixture: August 31 * (12 - 2) = 310; July 30 observed days * 5 = 150.
// New compute charges, removed storage charges, and credits must net to a 160 increase.
function transport(query: QueryDefinition) {
    const august = query.timePeriod!.from.getUTCMonth() === 7;
    const dates: number[] = [];
    for (let t = query.timePeriod!.from.getTime(); t <= query.timePeriod!.to.getTime(); t += 86400000) {
        const date = new Date(t);
        if (!august && date.getUTCDate() === 4) continue;
        dates.push(Number(date.toISOString().slice(0, 10).replace(/-/g, '')));
    }
    const groups = query.dataset.grouping?.map(row => row.name) || [];
    if (groups.includes('ResourceId')) return Promise.resolve({ columns: ['Cost', 'ResourceId', 'ResourceGroupName', 'Currency'].map(name => ({ name })),
        rows: august ? [[372, '/fake/vm', 'Apps', 'EUR'], [-62, '', '', 'EUR']] : [[150, '/fake/storage', 'Legacy', 'EUR']] });
    if (groups.includes('ServiceName')) return Promise.resolve({ columns: ['Cost', 'ServiceName', 'UsageDate', 'Currency'].map(name => ({ name })),
        rows: dates.flatMap(date => august ? [[12, 'Compute', date, 'EUR'], [-2, 'Credits', date, 'EUR']] : [[5, 'Storage', date, 'EUR']]) });
    return Promise.resolve({ columns: ['Cost', 'UsageDate', 'Currency'].map(name => ({ name })), rows: dates.map(date => [august ? 10 : 5, date, 'EUR']) });
}

beforeEach(() => {
    jest.spyOn(configService, 'getAzureConfig').mockReturnValue({ subscriptionId: 'test-subscription', tenantId: 'test-tenant', scope: '/subscriptions/test-subscription',
        costManagement: { liveDataOnly: true, apiDelayMs: 0, maxRetries: 1, retryBaseDelayMs: 0, retryMaxDelayMs: 10 } });
});
afterEach(() => jest.restoreAllMocks());
const collect = async () => buildMonthlyReport(await new AzureCostManagementService(transport, clock).getMonthlyCostEvidence());

test('selects full UTC calendar months across year and leap boundaries', () => {
    expect(closedMonthWindow(undefined, new Date('2026-01-01Z')).month).toBe('2025-12');
    const leap = closedMonthWindow('2024-02', clock());
    expect(leap.start.toISOString()).toBe('2024-02-01T00:00:00.000Z');
    expect(leap.end.toISOString()).toBe('2024-02-29T23:59:59.999Z');
    expect(leap.previousStart.toISOString()).toBe('2024-01-01T00:00:00.000Z');
    for (const value of ['2026-09', '2027-01', '2026-13', '26-08', '../08', '1999-12']) expect(() => closedMonthWindow(value, clock())).toThrow();
});

test('monthly CLI preserves the existing default and rejects invalid options before authentication', () => {
    expect(parseReportArguments([])).toEqual({ monthly: false });
    expect(parseReportArguments(['--monthly', '2024-02'])).toEqual({ monthly: true, month: '2024-02' });
    expect(() => parseReportArguments(['--monthly', '2024-02', 'extra'])).toThrow('Usage');
    expect(() => parseReportArguments(['--unknown'])).toThrow('Usage');
});

test('collects only two closed months on the first day and reconciles all driver movements', async () => {
    const query = jest.fn(transport);
    const report = buildMonthlyReport(await new AzureCostManagementService(query, clock).getMonthlyCostEvidence());
    expect(query).toHaveBeenCalledTimes(6);
    expect(report.evidence).toMatchObject({ month: '2026-08', collectedPages: 6, costBasis: 'ActualCost', current: { totalCost: 310 }, previous: { totalCost: 150 } });
    expect(report.change.amount).toBe(160);
    expect(report.change.percent).toBeCloseTo(106.6666667);
    expect(report.drivers.services).toEqual([
        { name: 'Compute', currentCost: 372, previousCost: 0, change: 372, changePercent: null, presence: 'current only' },
        { name: 'Storage', currentCost: 0, previousCost: 150, change: -150, changePercent: -100, presence: 'previous only' },
        { name: 'Credits', currentCost: -62, previousCost: 0, change: -62, changePercent: null, presence: 'current only' }
    ]);
    expect(report.drivers.resourceGroups.reduce((n, row) => n + row.change, 0)).toBe(160);
    expect(report.coverage.previous).toEqual({ observedDays: 30, expectedDays: 31, missingDates: ['2026-07-04'], averagePerObservedDay: 5 });
    expect(report.reviewQuestions[0]).toContain('missing billing dates');
    expect(report.limitations.join(' ')).toContain('not normalized for month length');
});

test('missing daily CSV values stay blank, credits stay numeric and text cannot become a spreadsheet formula', async () => {
    const report = await collect();
    report.drivers.services[0].name = '=HYPERLINK("https://example.test")';
    const files = monthlyCsvFiles(report);
    expect(files['daily.csv']).toContain('"2026-07-04","EUR","","not returned"');
    expect(files['services.csv']).toContain('"\'=HYPERLINK(""https://example.test"")"');
    expect(files['resources.csv']).toContain('"-62"');
    expect(files['resources.csv']).toContain('"2026-07"');
    expect(files['resources.csv']).toContain('"2026-08"');
});

test('HTML escapes evidence and exposes comparisons, gaps, limitations and portable download links', async () => {
    const report = await collect();
    report.drivers.services[0].name = '<script>alert(1)</script>';
    const html = monthlyHtml(report);
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('2026-07-04');
    expect(html).toContain('Dates not returned');
    expect(html).toContain('not final billing accuracy');
    for (const file of ['report.json', ...Object.keys(monthlyCsvFiles(report))]) expect(html).toContain(`href="${file}"`);
});

test('publishes complete unique packs without overwriting a previous snapshot', async () => {
    const report = await collect(), root = fs.mkdtempSync(path.join(os.tmpdir(), 'finops-monthly-test-'));
    const folders: string[] = [];
    try {
        folders.push(writeMonthlyReport(report, root), writeMonthlyReport(report, root));
        expect(folders[0]).not.toBe(folders[1]);
        for (const folder of folders) {
            expect(fs.readdirSync(folder).sort()).toEqual(['daily.csv', 'index.html', 'report.json', 'resource-groups.csv', 'resources.csv', 'services.csv']);
            expect(JSON.parse(fs.readFileSync(path.join(folder, 'report.json'), 'utf8')).change.amount).toBe(160);
        }
    } finally {
        for (const folder of folders) { for (const file of fs.readdirSync(folder)) fs.unlinkSync(path.join(folder, file)); fs.rmdirSync(folder); }
        fs.rmdirSync(root);
    }
});

test('failed exports never publish a completed pack', async () => {
    const report = await collect(), root = fs.mkdtempSync(path.join(os.tmpdir(), 'finops-monthly-failure-'));
    const write = jest.spyOn(fs, 'writeFileSync').mockImplementation(() => { throw new Error('disk full'); });
    try {
        expect(() => writeMonthlyReport(report, root)).toThrow('could not be saved');
        expect(fs.readdirSync(root).every(name => name.startsWith('.monthly-pending-'))).toBe(true);
    } finally {
        write.mockRestore();
        for (const folder of fs.readdirSync(root)) fs.rmdirSync(path.join(root, folder));
        fs.rmdirSync(root);
    }
});

test('currency mismatches and empty comparison evidence stop a monthly report', async () => {
    const empty = jest.fn(async (q: QueryDefinition) => q.timePeriod!.from.getUTCMonth() === 6 ? { rows: [] } : transport(q));
    await expect(new AzureCostManagementService(empty, clock).getMonthlyCostEvidence()).rejects.toThrow('No cost rows');
    const report = await collect();
    report.evidence.previous.currency = 'USD';
    expect(() => buildMonthlyReport(report.evidence)).toThrow('currencies differ');
    report.evidence.previous.currency = 'EUR';
    report.evidence.current.costByService[0].cost += 1;
    expect(() => buildMonthlyReport(report.evidence)).toThrow('do not reconcile');
});
