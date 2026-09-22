import { AzureCostManagementService } from './services/azureCostManagementService';
import { CostTrendAnalyzer } from './analyzers/costTrendAnalyzer';
import { AnomalyDetector } from './analyzers/anomalyDetector';
import { DailyCostFluctuationAnalyzer } from './analyzers/dailyCostFluctuationAnalyzer';
import { HtmlReportGenerator } from './services/htmlReportGenerator';
import { ComprehensiveCostAnalysis } from './models/costAnalysis';
import { configService } from './utils/config';
import { InteractiveSetup } from './utils/interactiveSetup';
import { formatCurrency, formatPercentChange } from './utils/colors';
import * as fs from 'fs';
import * as path from 'path';
import { buildMonthlyReport, closedMonthWindow } from './services/monthlyReport';
import { writeMonthlyReport } from './services/monthlyReportWriter';
import { OperationalEvidenceService } from './services/operationalEvidenceService';

/** Financial reporting only. No recommendation execution or cloud storage writes. */
export class FinOpsAssessmentApp {
    constructor(private readonly costService = new AzureCostManagementService(), private readonly operationalService = () => new OperationalEvidenceService()) {}

    public async runMonthly(month?: string, withOperations = false): Promise<void> {
        const report = buildMonthlyReport(await this.costService.getMonthlyCostEvidence(month));
        if (withOperations) {
            console.log('Collecting current inventory, cached Advisor findings and selected-month VM CPU evidence (read only)...');
            report.operationalEvidence = await this.operationalService().collect(report.evidence);
            report.schemaVersion = '1.1';
            report.limitations = report.limitations.map(value => value.startsWith('Budget, forecast, accountable owners') ?
                'Budget, forecast, verified ownership, validated optimization opportunities and realized savings are not assessed. Optional operational evidence has its own coverage and limitations.' : value);
        }
        const directory = writeMonthlyReport(report);
        console.log(`\nMONTHLY FINOPS REVIEW — ${report.evidence.month} — READ ONLY`);
        for (const observation of report.observations) console.log(observation);
        if (report.operationalEvidence) {
            const { inventory, advisor, resources } = report.operationalEvidence;
            console.log(`Operational coverage: inventory ${inventory.status}; Advisor ${advisor.status}; ${resources.filter(r => r.cpu.status === 'observed').length} resources with CPU observations.`);
            console.log(`Advisor review candidates: ${advisor.recommendations.filter(r => r.reviewEligible).length}; no combined savings estimate.`);
        }
        console.log('Single subscription; provisional ActualCost. Budget, forecast and savings are not assessed.');
        console.log(`Report pack saved: ${directory}`);
    }

    public async run(): Promise<void> {
        const analysis = await this.costService.getComprehensiveCostAnalysis();
        analysis.trends = new CostTrendAnalyzer().analyzeTrends(analysis);
        analysis.anomalies = new AnomalyDetector().detectAnomalies(analysis);
        analysis.fluctuations = new DailyCostFluctuationAnalyzer().analyzeFluctuations(analysis);
        // Legacy VM/disk heuristics are intentionally not run: they fabricate prices,
        // equate charge-bearing days with utilization, and double-count alternatives.
        this.saveResults(analysis);
        this.displayReport(analysis);
    }

    private displayReport(analysis: ComprehensiveCostAnalysis): void {
        const { summary, historical, current, dataProvenance } = analysis;
        console.log('\nAZURE FINOPS COST REPORT — READ ONLY');
        console.log(dataProvenance.coverage);
        console.log(`Basis: ${dataProvenance.costBasis}; through ${dataProvenance.queriedThrough} (UTC)`);
        console.log(`Historical period: ${historical.startDate} — ${historical.endDate}`);
        console.log(`Historical total: ${formatCurrency(summary.totalHistoricalCost, summary.currency)}`);
        console.log(`MTD (excluding today): ${formatCurrency(summary.currentMonthToDate, summary.currency)}`);
        console.log(`Average per observed day: ${formatCurrency(summary.avgDailySpend, summary.currency)}`);
        console.log(`Closed-month change: ${formatPercentChange(current.monthlyComparison.lastTwoMonthsChange.percent)}`);
        const comparison = current.comparisonToPreviousMonth;
        console.log(`First ${comparison.comparableDays} days versus previous month: ${formatPercentChange(comparison.changePercent)}`);
        console.log('Forecast and potential savings: unavailable (not calculated).');
        console.log('\nCost by service:');
        for (const service of historical.costByService) console.log(`  ${service.serviceName}: ${formatCurrency(service.cost, service.currency)}`);
        for (const notice of dataProvenance.notices || []) console.log(`Note: ${notice}`);
        console.log('JSON and HTML reports saved locally in reports/.');
    }

    private saveResults(analysis: ComprehensiveCostAnalysis): void {
        const directory = path.join(process.cwd(), 'reports');
        fs.mkdirSync(directory, { recursive: true });
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const base = path.join(directory, `finops-assessment-${stamp}`);
        const html = new HtmlReportGenerator().generate(analysis);
        try {
            fs.writeFileSync(`${base}.json`, JSON.stringify({ generatedAt: new Date().toISOString(), costAnalysis: analysis }, null, 2));
            fs.writeFileSync(`${base}.html`, html, 'utf8');
        } catch {
            throw new Error('Required report output could not be saved. Check local file permissions and disk space.');
        }
    }
}

export function parseReportArguments(args: string[]): { monthly: boolean; month?: string; withOperations?: boolean } {
    if (!args.length) return { monthly: false };
    const withOperations = args.includes('--with-operations');
    const monthlyArgs = args.filter(arg => arg !== '--with-operations');
    if (args.filter(arg => arg === '--with-operations').length > 1 || monthlyArgs[0] !== '--monthly' || monthlyArgs.length > 2) throw new Error('Usage: npm start -- --monthly [YYYY-MM] [--with-operations]');
    const month = closedMonthWindow(monthlyArgs[1], new Date()).month;
    return { monthly: true, month, ...(withOperations ? { withOperations: true } : {}) };
}

async function main(): Promise<void> {
    const options = parseReportArguments(process.argv.slice(2));
    const setup = new InteractiveSetup();
    try {
        if (!await setup.verifyAuthentication()) throw new Error('Azure CLI authentication is required.');
        const context = await setup.getRuntimeSubscriptionContext();
        if (!context) throw new Error('A subscription context is required.');
        process.env.AZURE_SUBSCRIPTION_ID = context.id;
        process.env.AZURE_TENANT_ID = context.tenantId;
        process.env.AZURE_SCOPE = `/subscriptions/${context.id}`;
        if (!options.monthly) process.env.HISTORICAL_DAYS = String(await setup.chooseAnalysisWindowDays(30));
        await setup.maybePersistDefaultSubscription(context);
        configService.reload();
        const app = new FinOpsAssessmentApp();
        if (options.monthly) await app.runMonthly(options.month, options.withOperations);
        else await app.run();
    } finally { setup.close(); }
}

if (require.main === module) {
    main().catch(error => {
        console.error(error instanceof Error ? error.message : 'Assessment failed.');
        process.exitCode = 1;
    });
}
