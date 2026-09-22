import * as fs from 'fs';
import * as path from 'path';
import { MonthlyDriver, MonthlyReport } from '../models/monthlyReport';

const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const percent = (value: number | null) => value === null ? 'Unavailable' : `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;

/** Quote every field and neutralize spreadsheet formulas in text originating from Azure. */
function csv(rows: Array<Array<string | number | null>>): string {
    return '\uFEFF' + rows.map(row => row.map(value => {
        let text = value === null ? '' : String(value);
        if (typeof value === 'string' && /^[\s]*[=+@\-]/.test(text)) text = "'" + text;
        return `"${text.replace(/"/g, '""')}"`;
    }).join(',')).join('\r\n') + '\r\n';
}

export function monthlyCsvFiles(report: MonthlyReport): Record<string, string> {
    const { evidence, drivers } = report, currency = evidence.current.currency;
    const driverCsv = (rows: MonthlyDriver[]) => csv([
        ['name', 'previous_month', 'current_month', 'currency', 'previous_cost', 'current_cost', 'change', 'change_percent', 'presence'],
        ...rows.map(r => [r.name, evidence.previous.startDate.slice(0, 7), evidence.month, currency, r.previousCost, r.currentCost, r.change, r.changePercent, r.presence])
    ]);
    return {
        'services.csv': driverCsv(drivers.services),
        'resource-groups.csv': driverCsv(drivers.resourceGroups),
        'resources.csv': csv([['month', 'resource_id', 'resource_name', 'resource_group', 'currency', 'cost'],
            ...[evidence.previous, evidence.current].flatMap(period => period.costByResource.map(r => [period.startDate.slice(0, 7), r.resourceId, r.resourceName, r.resourceGroup, r.currency, r.cost]))]),
        'daily.csv': csv([['date_utc', 'currency', 'cost', 'status'], ...[evidence.previous, evidence.current].flatMap(period => {
            const rows: Array<Array<string | number | null>> = [], costs = new Map(period.dailyCosts.map(row => [row.date.slice(0, 10), row.cost]));
            for (let t = Date.parse(period.startDate); t <= Date.parse(period.endDate); t += 86_400_000) {
                const date = new Date(t).toISOString().slice(0, 10);
                rows.push([date, period.currency, costs.get(date) ?? null, costs.has(date) ? 'observed' : 'not returned']);
            }
            return rows;
        })])
    };
}

export function monthlyHtml(report: MonthlyReport): string {
    const { evidence, change, coverage, drivers } = report;
    const currency = evidence.current.currency;
    const money = (n: number) => escape(new Intl.NumberFormat('en-US', { style: 'currency', currency, currencyDisplay: 'code' }).format(n));
    const list = (items: string[]) => `<ul>${items.map(item => `<li>${escape(item)}</li>`).join('')}</ul>`;
    const driverTable = (rows: MonthlyDriver[], title: string, file: string) => `<section><h2>${title}</h2><p>Ranked by absolute cost change. All ${rows.length} categories included. <a href="${file}" download>Download CSV</a></p><div class="scroll"><table><caption>${title}: ${escape(evidence.previous.startDate.slice(0, 7))} → ${escape(evidence.month)}</caption><thead><tr><th scope="col">Category</th><th scope="col">Previous</th><th scope="col">Selected month</th><th scope="col">Change</th><th scope="col">Change %</th><th scope="col">Reported in</th></tr></thead><tbody>${rows.map(r => `<tr><th scope="row">${escape(r.name)}</th><td>${money(r.previousCost)}</td><td>${money(r.currentCost)}</td><td>${money(r.change)}</td><td>${percent(r.changePercent)}</td><td>${escape(r.presence)}</td></tr>`).join('')}</tbody></table></div></section>`;
    const periodRows = [evidence.previous, evidence.current].map((period, i) => {
        const c = i ? coverage.current : coverage.previous;
        return `<tr><th scope="row">${escape(period.startDate.slice(0, 7))}</th><td>${money(period.totalCost)}</td><td>${c.observedDays} / ${c.expectedDays}</td><td>${money(c.averagePerObservedDay)}</td><td>${c.missingDates.length ? escape(c.missingDates.join(', ')) : 'None'}</td></tr>`;
    }).join('');
    const daily = new Map(evidence.current.dailyCosts.map(row => [row.date.slice(0, 10), row.cost]));
    const max = Math.max(1, ...[...daily.values()].map(Math.abs));
    const days = [];
    for (let t = Date.parse(evidence.current.startDate); t <= Date.parse(evidence.current.endDate); t += 86_400_000) {
        const date = new Date(t).toISOString().slice(0, 10), cost = daily.get(date);
        days.push(`<tr><th scope="row">${date}</th><td>${cost === undefined ? 'Not returned' : money(cost)}</td><td aria-hidden="true"><span class="bar ${cost !== undefined && cost < 0 ? 'credit' : ''}" style="width:${cost === undefined ? 0 : Math.abs(cost) / max * 100}%"></span></td></tr>`);
    }
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Monthly FinOps review — ${escape(evidence.month)}</title><style>
*{box-sizing:border-box}body{margin:0;background:#eef2f6;color:#172c43;font:15px/1.6 system-ui,sans-serif}main{max-width:1200px;margin:auto;padding:32px}header{background:#102c46;color:white;padding:32px;border-radius:12px}h1{font-size:32px;margin:8px 0}h2{font-size:22px;margin-top:0}h3{font-size:16px}.eyebrow{letter-spacing:2px;font-size:12px;text-transform:uppercase;color:#bde6ef}.scope{overflow-wrap:anywhere;font-size:13px}section{background:white;padding:24px;border-radius:10px;margin-top:20px}.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:20px}.card{background:white;border-top:4px solid #147b8d;border-radius:8px;padding:22px}.card strong{display:block;font-size:26px}.muted{color:#52657b}.notice{border-left:5px solid #bb7b12}a{color:#075e85}table{border-collapse:collapse;width:100%;font-size:13px}caption{text-align:left;color:#52657b;margin-bottom:12px}th,td{padding:10px 12px;border-bottom:1px solid #dde5ed;text-align:right;vertical-align:top}th:first-child,td:first-child{text-align:left;overflow-wrap:anywhere;max-width:320px}thead{background:#edf3f7}tbody th{font-weight:500}li{margin:8px 0}.scroll{overflow:auto}.bar{display:block;height:12px;background:#147b8d;min-width:0}.credit{background:#8a56a0}.daily td:last-child{width:45%}footer{padding:24px 0;color:#52657b}.downloads{display:flex;flex-wrap:wrap;gap:16px}@media(max-width:760px){main{padding:12px}.cards{grid-template-columns:1fr}header,section{padding:18px}h1{font-size:26px}}@media print{body{background:white;font-size:11px}main{padding:0;max-width:none}header{background:white;color:#172c43;border-bottom:2px solid #172c43;padding:12px 0}.eyebrow{color:#172c43}.cards{grid-template-columns:repeat(3,1fr)}section{padding:12px 0;break-inside:auto}tr,.card{break-inside:avoid}.scroll{overflow:visible}thead{display:table-header-group}a{color:inherit}.bar{print-color-adjust:exact}footer{font-size:10px}}
</style></head><body><main><header><div class="eyebrow">Monthly FinOps review · read only</div><h1>${escape(evidence.month)} cost review</h1><p>Compared with ${escape(evidence.previous.startDate.slice(0, 7))} · ${currency} · ActualCost · Provisional billing</p><div class="scope">Scope: ${escape(evidence.scope)}<br>Generated: ${escape(evidence.generatedAt)} · Source: ${escape(evidence.source)}</div></header>
<div class="cards"><div class="card">Selected month<strong>${money(evidence.current.totalCost)}</strong><span class="muted">${coverage.current.observedDays} observed billing dates</span></div><div class="card">Previous month<strong>${money(evidence.previous.totalCost)}</strong><span class="muted">${coverage.previous.observedDays} observed billing dates</span></div><div class="card">Month-over-month change<strong>${money(change.amount)}</strong><span class="muted">${percent(change.percent)} · not normalized for month length</span></div></div>
<section><h2>Executive readout</h2>${list(report.observations)}</section>
<section class="notice"><h2>Coverage and confidence in the data</h2><p>All ${evidence.collectedPages} returned pages collected. Daily, service and resource totals reconciled within 0.01 ${currency} per month. This establishes internal consistency, not final billing accuracy.</p><div class="scroll"><table><caption>UTC calendar coverage and observed-day averages</caption><thead><tr><th>Month</th><th>Cost</th><th>Observed / calendar days</th><th>Average / observed day</th><th>Dates not returned</th></tr></thead><tbody>${periodRows}</tbody></table></div></section>
${driverTable(drivers.services, 'Service cost drivers', 'services.csv')}${driverTable(drivers.resourceGroups, 'Resource-group cost drivers', 'resource-groups.csv')}
<section><h2>Daily spend in the selected month</h2><p>Bar length shows absolute cost. Purple bars indicate negative adjustments. Missing dates remain unknown. <a href="daily.csv" download>Download both months</a></p><table class="daily"><caption>Signed daily cost, UTC</caption><thead><tr><th>Date</th><th>Cost</th><th>Magnitude</th></tr></thead><tbody>${days.join('')}</tbody></table></section>
<section><h2>Questions for the monthly review</h2><p>Investigation prompts, not confirmed causes or optimization recommendations.</p>${list(report.reviewQuestions)}</section>
<section><h2>Evidence and limitations</h2>${list(report.limitations)}<nav class="downloads" aria-label="Report downloads"><a href="report.json" download>Full JSON evidence</a><a href="resources.csv" download>Resource detail — both months</a><a href="services.csv" download>Services CSV</a><a href="resource-groups.csv" download>Resource groups CSV</a></nav><p>Keep this folder together when sharing. Use your browser’s Print → Save as PDF for a meeting copy.</p></section>
<footer>Schema ${report.schemaVersion} · Financial/resource data: review recipients before sharing. Reruns collect a new snapshot and may differ after billing updates.</footer></main></body></html>`;
}

/** Each run gets its own directory; a failed export is never published as a complete pack. */
export function writeMonthlyReport(report: MonthlyReport, root = path.join(process.cwd(), 'reports')): string {
    const html = monthlyHtml(report), csvFiles = monthlyCsvFiles(report);
    fs.mkdirSync(root, { recursive: true });
    const staging = fs.mkdtempSync(path.join(root, '.monthly-pending-'));
    const finalPath = path.join(root, `monthly-${report.evidence.month}-${path.basename(staging).slice('.monthly-pending-'.length)}`);
    try {
        fs.writeFileSync(path.join(staging, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
        fs.writeFileSync(path.join(staging, 'index.html'), html, 'utf8');
        for (const [name, content] of Object.entries(csvFiles)) fs.writeFileSync(path.join(staging, name), content, 'utf8');
        fs.renameSync(staging, finalPath);
        return finalPath;
    } catch {
        // Retain a clearly marked incomplete directory for local troubleshooting; do not claim success.
        throw new Error('Monthly report pack could not be saved. Check disk space and permissions; any .monthly-pending directory is incomplete.');
    }
}
