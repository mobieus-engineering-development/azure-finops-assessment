import { HistoricalCostData } from '../models/costAnalysis';
import { MonthCoverage, MonthlyCostEvidence, MonthlyDriver, MonthlyReport } from '../models/monthlyReport';
import { percentChange, sumCosts } from './costQuery';

/** Only complete calendar months may be selected. Calendar closure does not imply final billing. */
export function closedMonthWindow(month: string | undefined, now: Date): { month: string; start: Date; end: Date; previousStart: Date } {
    const thisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const selected = month ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(selected)) throw new Error('Monthly report expects YYYY-MM, for example --monthly 2026-08.');
    const start = new Date(`${selected}-01T00:00:00.000Z`);
    if (start.getUTCFullYear() < 2000 || start >= thisMonth) throw new Error('Select a closed calendar month from 2000 onward, before the current UTC month.');
    return { month: selected, start,
        end: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1) - 1),
        previousStart: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1)) };
}

function coverage(period: HistoricalCostData): MonthCoverage {
    const dates = new Set(period.dailyCosts.map(row => row.date.slice(0, 10)));
    const expected: string[] = [];
    for (let t = Date.parse(period.startDate); t <= Date.parse(period.endDate); t += 86_400_000) expected.push(new Date(t).toISOString().slice(0, 10));
    return { expectedDays: expected.length, observedDays: dates.size, missingDates: expected.filter(date => !dates.has(date)),
        averagePerObservedDay: period.totalCost / dates.size };
}

function drivers(previous: Array<{ name: string; cost: number }>, current: Array<{ name: string; cost: number }>, delta: number): MonthlyDriver[] {
    const aggregate = (rows: Array<{ name: string; cost: number }>) => {
        const buckets = new Map<string, number[]>();
        for (const row of rows) buckets.set(row.name, [...(buckets.get(row.name) || []), row.cost]);
        return new Map([...buckets].map(([name, costs]) => [name, sumCosts(costs)]));
    };
    const before = aggregate(previous), after = aggregate(current);
    const result = [...new Set([...before.keys(), ...after.keys()])].map(name => {
        const previousCost = before.get(name) ?? 0, currentCost = after.get(name) ?? 0;
        return { name, previousCost, currentCost, change: currentCost - previousCost, changePercent: percentChange(previousCost, currentCost),
            presence: (before.has(name) ? after.has(name) ? 'both' : 'previous only' : 'current only') as MonthlyDriver['presence'] };
    }).sort((a, b) => Math.abs(b.change) - Math.abs(a.change) || a.name.localeCompare(b.name));
    if (Math.abs(sumCosts(result.map(row => row.change)) - delta) > 0.01) throw new Error('Monthly drivers do not reconcile to the total change.');
    return result;
}

export function buildMonthlyReport(evidence: MonthlyCostEvidence): MonthlyReport {
    const { current, previous } = evidence;
    if (current.currency !== previous.currency) throw new Error('Monthly comparison currencies differ.');
    const amount = current.totalCost - previous.totalCost;
    const services = drivers(previous.costByService.map(r => ({ name: r.serviceName, cost: r.cost })), current.costByService.map(r => ({ name: r.serviceName, cost: r.cost })), amount);
    const resourceGroups = drivers(previous.costByResourceGroup.map(r => ({ name: r.resourceGroup, cost: r.cost })), current.costByResourceGroup.map(r => ({ name: r.resourceGroup, cost: r.cost })), amount);
    const observed = { current: coverage(current), previous: coverage(previous) };
    const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: current.currency, currencyDisplay: 'code' }).format(value);
    const biggestIncrease = services.find(r => r.change > 0), biggestDecrease = services.find(r => r.change < 0);
    const observations = [`Observed monthly cost ${amount >= 0 ? 'increased' : 'decreased'} by ${money(Math.abs(amount))} versus ${previous.startDate.slice(0, 7)}.`,
        `Billing rows cover ${observed.current.observedDays}/${observed.current.expectedDays} dates this month and ${observed.previous.observedDays}/${observed.previous.expectedDays} dates in the comparison month.`];
    if (biggestIncrease) observations.push(`${biggestIncrease.name} has the largest service increase: ${money(biggestIncrease.change)}.`);
    if (biggestDecrease) observations.push(`${biggestDecrease.name} has the largest service decrease: ${money(Math.abs(biggestDecrease.change))}.`);
    const reviewQuestions = [];
    if (observed.current.missingDates.length || observed.previous.missingDates.length) reviewQuestions.push('Confirm whether missing billing dates reflect ingestion delays or no reported charges before interpreting the month-over-month change.');
    for (const driver of services.filter(r => Math.abs(r.change) >= 0.01).slice(0, 3)) reviewQuestions.push(`Ask the service owner to explain the ${money(driver.change)} change in ${driver.name}; compare usage, rates and signed adjustments. Cost data alone does not establish the cause.`);
    if (!reviewQuestions.length) reviewQuestions.push('No service movement of at least 0.01 currency units was observed. Confirm billing freshness before closing the review.');
    return { schemaVersion: '1.0', evidence, change: { amount, percent: percentChange(previous.totalCost, current.totalCost) },
        coverage: observed, drivers: { services, resourceGroups }, observations, reviewQuestions,
        limitations: [
            'One selected subscription only; tenant-wide coverage is not assessed.',
            'Closed calendar months remain provisional billing data. Ingestion lag and rerating are not measured; this is not invoice reconciliation.',
            'Missing dates are not filled with zero. Comparisons describe returned costs, even when observed-date coverage differs.',
            'Month-over-month totals are not normalized for month length. Daily averages use observed dates only.',
            'A category absent from one fully collected result contributes zero to that result, but does not prove resource creation, deletion or zero usage.',
            'Service and resource-group drivers are alternative views of the same change; do not add the views together.',
            'Budget, forecast, accountable owners, utilization, optimization opportunities and verified savings are not assessed.'
        ] };
}
