/**
 * Professional HTML Report Generator for Azure Cost Analysis
 * Industrial, utilitarian design with comprehensive data presentation
 */

import { ComprehensiveCostAnalysis, DailyCostFluctuation } from '../models/costAnalysis';
import { Recommendation, RecommendationSummary } from '../models/recommendation';
import { VMCostSummary, VMCostAnalysis, VMCostRecommendation } from '../models/vmCostAnalysis';
import { format } from 'date-fns';

export class HtmlReportGenerator {
    private dateLabel(value: string): string {
        return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value));
    }
    
    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    private formatCurrency(amount: number | null, currency: string = 'USD'): string {
        if (amount === null || !Number.isFinite(amount)) return 'Unavailable';
        return new Intl.NumberFormat('en-US', { style: 'currency', currency, currencyDisplay: 'code' }).format(amount);
    }

    private formatPercent(value: number | null): string {
        if (value === null || !Number.isFinite(value)) return 'N/A';
        const sign = value > 0 ? '+' : '';
        return `${sign}${value.toFixed(1)}%`;
    }

    private getSeverityClass(severity: string): string {
        const map: Record<string, string> = {
            'critical': 'severity-critical',
            'high': 'severity-high',
            'medium': 'severity-medium',
            'low': 'severity-low'
        };
        return map[severity] || 'severity-low';
    }

    private getTrendIcon(direction: string): string {
        const icons: Record<string, string> = {
            'increasing': '↗',
            'decreasing': '↘',
            'stable': '→'
        };
        return icons[direction] || '→';
    }

    private generateCss(): string {
        return `
* { margin: 0; padding: 0; box-sizing: border-box; }

body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', sans-serif;
    font-size: 14px;
    line-height: 1.6;
    color: #1a1a1a;
    background: #f5f5f5;
    padding: 0;
}

.container {
    max-width: 1400px;
    margin: 0 auto;
    background: #ffffff;
}

/* Header */
.report-header {
    background: linear-gradient(135deg, #0f2557 0%, #1a4d8f 100%);
    color: #ffffff;
    padding: 40px 48px;
    border-bottom: 4px solid #0a1835;
}

.report-title {
    font-size: 32px;
    font-weight: 700;
    margin-bottom: 8px;
    letter-spacing: -0.5px;
}

.report-subtitle {
    font-size: 16px;
    opacity: 0.9;
    font-weight: 400;
}

.report-meta {
    display: flex;
    gap: 32px;
    margin-top: 24px;
    font-size: 13px;
    opacity: 0.85;
}

.meta-item {
    display: flex;
    align-items: center;
    gap: 8px;
}

.meta-label {
    opacity: 0.7;
}

/* Executive Summary */
.executive-summary {
    background: #f8f9fa;
    padding: 32px 48px;
    border-bottom: 1px solid #e0e0e0;
}

.summary-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 24px;
    margin-top: 24px;
}

.summary-card {
    background: #ffffff;
    padding: 24px;
    border-radius: 4px;
    border: 1px solid #e0e0e0;
    border-left: 4px solid #0f2557;
}

.summary-label {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #666;
    font-weight: 600;
    margin-bottom: 8px;
}

.summary-value {
    font-size: 28px;
    font-weight: 700;
    color: #0f2557;
    line-height: 1.2;
}

.summary-subtitle {
    font-size: 12px;
    color: #888;
    margin-top: 4px;
}

/* Sections */
.section {
    padding: 40px 48px;
    border-bottom: 1px solid #e0e0e0;
}

.section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
    padding-bottom: 12px;
    border-bottom: 2px solid #0f2557;
}

.section-title {
    font-size: 20px;
    font-weight: 700;
    color: #0f2557;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.section-badge {
    background: #0f2557;
    color: #ffffff;
    padding: 4px 12px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

/* Tables */
table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 16px;
    font-size: 13px;
}

thead {
    background: #f8f9fa;
    border-top: 2px solid #0f2557;
    border-bottom: 2px solid #e0e0e0;
}

th {
    text-align: left;
    padding: 12px 16px;
    font-weight: 600;
    text-transform: uppercase;
    font-size: 11px;
    letter-spacing: 0.5px;
    color: #0f2557;
}

td {
    padding: 12px 16px;
    border-bottom: 1px solid #f0f0f0;
}

tbody tr:hover {
    background: #fafafa;
}

.table-number {
    font-family: 'Courier New', monospace;
    font-weight: 600;
}

.table-primary {
    color: #0f2557;
    font-weight: 600;
}

/* Progress Bars */
.progress-bar {
    height: 8px;
    background: #e0e0e0;
    border-radius: 4px;
    overflow: hidden;
    margin-top: 4px;
}

.progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #0f2557 0%, #1a4d8f 100%);
    transition: width 0.3s ease;
}

/* Badges & Pills */
.badge {
    display: inline-block;
    padding: 4px 10px;
    border-radius: 3px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.3px;
}

.severity-critical {
    background: #dc3545;
    color: #ffffff;
}

.severity-high {
    background: #fd7e14;
    color: #ffffff;
}

.severity-medium {
    background: #ffc107;
    color: #1a1a1a;
}

.severity-low {
    background: #6c757d;
    color: #ffffff;
}

.trend-up {
    color: #dc3545;
}

.trend-down {
    color: #28a745;
}

.trend-stable {
    color: #6c757d;
}

/* Anomaly Cards */
.anomaly-list {
    display: grid;
    gap: 16px;
    margin-top: 16px;
}

.anomaly-card {
    background: #ffffff;
    border: 1px solid #e0e0e0;
    border-left: 4px solid #dc3545;
    padding: 20px;
    border-radius: 4px;
}

.anomaly-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 12px;
}

.anomaly-title {
    font-weight: 600;
    font-size: 14px;
    color: #1a1a1a;
}

.anomaly-details {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid #f0f0f0;
    font-size: 12px;
}

.anomaly-detail-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.anomaly-detail-label {
    color: #888;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
}

.anomaly-detail-value {
    font-weight: 600;
    color: #1a1a1a;
}

/* Recommendations */
.recommendation-card {
    background: #ffffff;
    border: 1px solid #e0e0e0;
    border-left: 4px solid #28a745;
    padding: 24px;
    margin-bottom: 16px;
    border-radius: 4px;
}

.recommendation-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 16px;
}

.recommendation-title {
    font-size: 16px;
    font-weight: 700;
    color: #0f2557;
    margin-bottom: 4px;
}

.recommendation-description {
    color: #555;
    margin-bottom: 16px;
    line-height: 1.6;
}

.recommendation-metrics {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
    padding: 16px;
    background: #f8f9fa;
    border-radius: 4px;
    margin-top: 16px;
}

.metric-item {
    display: flex;
    flex-direction: column;
}

.metric-label {
    font-size: 11px;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    margin-bottom: 4px;
}

.metric-value {
    font-size: 18px;
    font-weight: 700;
    color: #28a745;
}

/* Trend Cards */
.trend-card {
    background: #ffffff;
    border: 1px solid #e0e0e0;
    padding: 20px;
    margin-bottom: 16px;
    border-radius: 4px;
}

.trend-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
}

.trend-title {
    font-size: 14px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.trend-indicator {
    font-size: 24px;
    font-weight: 700;
}

.trend-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 16px;
    padding-top: 16px;
    border-top: 1px solid #f0f0f0;
}

/* Charts Placeholder */
.chart-container {
    background: #fafafa;
    border: 1px solid #e0e0e0;
    padding: 24px;
    border-radius: 4px;
    margin-top: 16px;
    text-align: center;
    min-height: 200px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.chart-placeholder {
    color: #888;
    font-size: 12px;
}

/* Daily Costs Grid */
.daily-costs-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 8px;
    margin-top: 16px;
}

.daily-cost-item {
    background: #fafafa;
    border: 1px solid #e0e0e0;
    padding: 12px;
    border-radius: 4px;
    text-align: center;
}

.daily-cost-date {
    font-size: 11px;
    color: #888;
    margin-bottom: 4px;
}

.daily-cost-amount {
    font-size: 16px;
    font-weight: 700;
    color: #0f2557;
    font-family: 'Courier New', monospace;
}

/* Footer */
.report-footer {
    background: #f8f9fa;
    padding: 32px 48px;
    text-align: center;
    font-size: 12px;
    color: #888;
    border-top: 1px solid #e0e0e0;
}

.footer-note {
    margin-top: 8px;
    font-style: italic;
}

/* Utilities */
.text-muted {
    color: #888;
}

.text-success {
    color: #28a745;
}

.text-danger {
    color: #dc3545;
}

.text-warning {
    color: #ffc107;
}

.font-mono {
    font-family: 'Courier New', monospace;
}

.mt-1 { margin-top: 8px; }
.mt-2 { margin-top: 16px; }
.mt-3 { margin-top: 24px; }
.mb-1 { margin-bottom: 8px; }
.mb-2 { margin-bottom: 16px; }
.mb-3 { margin-bottom: 24px; }

/* Responsive */
@media (max-width: 768px) {
    .report-header,
    .executive-summary,
    .section {
        padding: 24px;
    }
    
    .summary-grid {
        grid-template-columns: 1fr;
    }
    
    .section-title {
        font-size: 18px;
    }
    
    table {
        font-size: 12px;
    }
    
    th, td {
        padding: 8px;
    }
}

@media print {
    body {
        background: #ffffff;
    }
    
    .container {
        max-width: 100%;
    }
    
    .section {
        page-break-inside: avoid;
    }
    
    .anomaly-card,
    .recommendation-card,
    .trend-card {
        page-break-inside: avoid;
    }
}
        `.trim();
    }

    public generate(
        analysis: ComprehensiveCostAnalysis,
        recommendations?: Recommendation[],
        recommendationSummary?: RecommendationSummary,
        vmCostSummary?: VMCostSummary
    ): string {
        const generatedAt = new Date().toISOString();
        
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="Azure Cost Analysis Report - Comprehensive financial analysis and optimization recommendations">
    <title>Azure Cost Analysis Report - ${this.escapeHtml(format(new Date(analysis.analysisDate), 'MMM dd, yyyy'))}</title>
    <style>${this.generateCss()}</style>
</head>
<body>
    <div class="container">
        ${this.generateHeader(analysis, generatedAt)}
        <div style="margin: 24px 0 16px 0;">
            <input type="text" id="report-search" placeholder="Search report..." style="width: 100%; max-width: 400px; padding: 8px 12px; font-size: 15px; border: 1px solid #ccc; border-radius: 4px;">
        </div>
        <script>
        (function() {
            var input = document.getElementById('report-search');
            var lastHighlight;
            input.addEventListener('input', function() {
                if (lastHighlight) {
                    lastHighlight.style.background = '';
                }
                var val = input.value.trim().toLowerCase();
                if (!val) return;
                var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
                var found = false;
                while (walker.nextNode()) {
                    var node = walker.currentNode;
                    if (node.nodeValue.toLowerCase().includes(val)) {
                        var span = document.createElement('span');
                        span.style.background = '#ffe066';
                        var idx = node.nodeValue.toLowerCase().indexOf(val);
                        span.textContent = node.nodeValue.substr(idx, val.length);
                        var after = node.splitText(idx);
                        after.nodeValue = after.nodeValue.substr(val.length);
                        node.parentNode.insertBefore(span, after);
                        lastHighlight = span;
                        span.scrollIntoView({behavior: 'smooth', block: 'center'});
                        found = true;
                        break;
                    }
                }
            });
        })();
        </script>
        ${this.generateExecutiveSummary(analysis)}
        ${this.generateCostBreakdown(analysis)}
        ${this.generateDailyFluctuationsSection(analysis)}
        ${this.generateTrendsSection(analysis)}
        ${this.generateAnomaliesSection(analysis)}
        ${this.generateTopServices(analysis)}
        ${vmCostSummary ? this.generateVMCostSection(vmCostSummary) : ''}
        ${this.generateRecommendationsSection(recommendations, recommendationSummary)}
        ${vmCostSummary ? this.generateVMRecommendationsSection(vmCostSummary) : ''}
        ${this.generateFooter(analysis, generatedAt)}
    </div>
</body>
</html>`;
    }

    private generateHeader(analysis: ComprehensiveCostAnalysis, generatedAt: string): string {
        const provenance = analysis.dataProvenance;
        return `
        <header class="report-header">
            <h1 class="report-title">Azure Cost Analysis Report</h1>
            <p class="report-subtitle">Comprehensive Financial Analysis & Optimization Insights</p>
            <div class="report-meta">
                <div class="meta-item">
                    <span class="meta-label">Subscription:</span>
                    <span>${this.escapeHtml(analysis.subscriptionId)}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">Analysis Period:</span>
                    <span>${this.escapeHtml(this.dateLabel(analysis.historical.startDate))} - ${this.escapeHtml(this.dateLabel(analysis.historical.endDate))} (UTC)</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">Generated:</span>
                    <span>${this.escapeHtml(format(new Date(generatedAt), 'MMM dd, yyyy HH:mm:ss'))}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">Data Mode:</span>
                    <span>${provenance.mode === 'live' ? 'LIVE API — PROVISIONAL COSTS' : 'UNVERIFIED'}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">Throttle Policy:</span>
                    <span>${provenance.queryPolicy.apiDelayMs}ms delay, ${provenance.queryPolicy.maxRetries} maximum attempts</span>
                </div>
            </div>
            <p>${this.escapeHtml(provenance.coverage || 'Coverage not specified')} — ${this.escapeHtml(provenance.costBasis || 'Cost basis not specified')}</p>
            <p>Queried through (UTC): ${this.escapeHtml(provenance.queriedThrough || 'Not specified')}</p>
            ${(provenance.notices || []).map(note => `<p>${this.escapeHtml(note)}</p>`).join('')}
        </header>`;
    }

    private generateExecutiveSummary(analysis: ComprehensiveCostAnalysis): string {
        const summary = analysis.summary;
        const current = analysis.current;
        const analysisDays = Math.max(
            1,
            Math.floor((new Date(analysis.historical.endDate).getTime() - new Date(analysis.historical.startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1
        );
        
        return `
        <section class="executive-summary">
            <h2 class="section-title">Executive Summary</h2>
            <div class="summary-grid">
                <div class="summary-card">
                    <div class="summary-label">Total Cost (${analysisDays} Days)</div>
                    <div class="summary-value">${this.formatCurrency(summary.totalHistoricalCost, summary.currency)}</div>
                </div>
                <div class="summary-card">
                    <div class="summary-label">Month to Date (excluding today)</div>
                    <div class="summary-value">${this.formatCurrency(summary.currentMonthToDate, summary.currency)}</div>
                    <div class="summary-subtitle">Estimated: ${this.formatCurrency(summary.forecastedMonthEnd, summary.currency)}</div>
                </div>
                <div class="summary-card">
                    <div class="summary-label">Average per observed day</div>
                    <div class="summary-value">${this.formatCurrency(summary.avgDailySpend, summary.currency)}</div>
                    <div class="summary-subtitle">Peak: ${this.formatCurrency(summary.peakDailySpend, summary.currency)}</div>
                </div>
                <div class="summary-card">
                    <div class="summary-label">Closed-month change</div>
                    <div class="summary-value">
                        ${this.formatPercent(current.monthlyComparison.lastTwoMonthsChange.percent)}
                    </div>
                    <div class="summary-subtitle">${this.formatCurrency(current.monthlyComparison.lastTwoMonthsChange.amount, summary.currency)}</div>
                </div>
            </div>
        </section>`;
    }

    private generateCostBreakdown(analysis: ComprehensiveCostAnalysis): string {
        const current = analysis.current;
        const monthlyComp = current.monthlyComparison;
        
        return `
        <section class="section">
            <div class="section-header">
                <h2 class="section-title">Monthly Cost Breakdown</h2>
                <span class="section-badge">${analysis.summary.currency}</span>
            </div>
            
            <table>
                <thead>
                    <tr>
                        <th>Period</th>
                        <th>Total Cost</th>
                        <th>Change</th>
                        <th>Trend</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td class="table-primary">${this.escapeHtml(monthlyComp.twoMonthsAgo.name)}</td>
                        <td class="table-number">${this.formatCurrency(monthlyComp.twoMonthsAgo.total, analysis.summary.currency)}</td>
                        <td>-</td>
                        <td>-</td>
                    </tr>
                    <tr>
                        <td class="table-primary">${this.escapeHtml(monthlyComp.lastMonth.name)}</td>
                        <td class="table-number">${this.formatCurrency(monthlyComp.lastMonth.total, analysis.summary.currency)}</td>
                        <td class="${monthlyComp.lastTwoMonthsChange.amount > 0 ? 'text-danger' : 'text-success'}">
                            ${this.formatCurrency(Math.abs(monthlyComp.lastTwoMonthsChange.amount), analysis.summary.currency)}
                            (${this.formatPercent(monthlyComp.lastTwoMonthsChange.percent)})
                        </td>
                        <td class="${monthlyComp.lastTwoMonthsChange.amount > 0 ? 'trend-up' : 'trend-down'}">
                            ${monthlyComp.lastTwoMonthsChange.amount > 0 ? '↗' : '↘'}
                        </td>
                    </tr>
                    <tr>
                        <td class="table-primary">${this.escapeHtml(monthlyComp.currentMonth.name)} (MTD)</td>
                        <td class="table-number">${this.formatCurrency(monthlyComp.currentMonth.monthToDate, analysis.summary.currency)}</td>
                        <td colspan="2" class="text-muted">Projected: ${this.formatCurrency(monthlyComp.currentMonth.projected, analysis.summary.currency)}</td>
                    </tr>
                </tbody>
            </table>
            
            <h3 class="mt-3 mb-2" style="font-size: 16px; font-weight: 600;">Recent Daily Costs</h3>
            <div class="daily-costs-grid">
                ${analysis.current.dailyCosts.slice(-14).map(day => `
                    <div class="daily-cost-item">
                        <div class="daily-cost-date">${this.escapeHtml(this.dateLabel(day.date))}</div>
                        <div class="daily-cost-amount">${this.formatCurrency(day.cost, day.currency)}</div>
                    </div>
                `).join('')}
            </div>
        </section>`;
    }

    private generateTrendsSection(analysis: ComprehensiveCostAnalysis): string {
        if (!analysis.trends || analysis.trends.length === 0) {
            return '';
        }

        return `
        <section class="section">
            <div class="section-header">
                <h2 class="section-title">Cost Trends & Patterns</h2>
                <span class="section-badge">${analysis.trends.length} Trends</span>
            </div>
            
            ${analysis.trends.map(trend => `
                <div class="trend-card">
                    <div class="trend-header">
                        <div>
                            <div class="trend-title">${this.escapeHtml(trend.period)} Trend</div>
                            <div class="text-muted" style="font-size: 12px; margin-top: 4px;">
                                ${this.escapeHtml(trend.direction)} ${this.formatPercent(trend.changePercent)}
                            </div>
                        </div>
                        <div class="trend-indicator ${trend.direction === 'increasing' ? 'trend-up' : trend.direction === 'decreasing' ? 'trend-down' : 'trend-stable'}">
                            ${this.getTrendIcon(trend.direction)}
                        </div>
                    </div>
                    
                    <div class="trend-stats">
                        ${trend.movingAverages?.sevenDay ? `
                            <div class="metric-item">
                                <div class="metric-label">7-Day Average</div>
                                <div class="metric-value" style="font-size: 16px; color: #0f2557;">
                                    ${this.formatCurrency(trend.movingAverages.sevenDay, analysis.summary.currency)}
                                </div>
                            </div>
                        ` : ''}
                        
                        ${trend.movingAverages?.thirtyDay ? `
                            <div class="metric-item">
                                <div class="metric-label">30-Day Average</div>
                                <div class="metric-value" style="font-size: 16px; color: #0f2557;">
                                    ${this.formatCurrency(trend.movingAverages.thirtyDay, analysis.summary.currency)}
                                </div>
                            </div>
                        ` : ''}
                        
                        ${trend.weekOverWeekChange !== undefined ? `
                            <div class="metric-item">
                                <div class="metric-label">Week over Week</div>
                                <div class="metric-value" style="font-size: 16px; color: ${trend.weekOverWeekChange > 0 ? '#dc3545' : '#28a745'};">
                                    ${this.formatPercent(trend.weekOverWeekChange)}
                                </div>
                            </div>
                        ` : ''}
                        
                        ${trend.projectedNextPeriod ? `
                            <div class="metric-item">
                                <div class="metric-label">Projected Next ${this.escapeHtml(trend.period)}</div>
                                <div class="metric-value" style="font-size: 16px; color: #0f2557;">
                                    ${this.formatCurrency(trend.projectedNextPeriod, analysis.summary.currency)}
                                </div>
                            </div>
                        ` : ''}
                    </div>
                    
                    ${trend.insights && trend.insights.length > 0 ? `
                        <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #f0f0f0;">
                            ${trend.insights.map(insight => `
                                <div style="margin-bottom: 8px; font-size: 13px; color: #555;">
                                    <strong>${this.escapeHtml(insight.type.replace(/_/g, ' '))}:</strong> ${this.escapeHtml(insight.description)}
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>
            `).join('')}
        </section>`;
    }

    private generateDailyFluctuationsSection(analysis: ComprehensiveCostAnalysis): string {
        const fluctuations = (analysis.fluctuations || []).slice(0, 10);

        if (fluctuations.length === 0) {
            return `
            <section class="section">
                <div class="section-header">
                    <h2 class="section-title">Daily Fluctuations & Service Drivers</h2>
                    <span class="section-badge">No Significant Changes</span>
                </div>
                <p style="color: #666; padding: 20px 0;">No daily cost movement exceeded the configured fluctuation threshold.</p>
            </section>`;
        }

        return `
        <section class="section">
            <div class="section-header">
                <h2 class="section-title">Daily Fluctuations & Service Drivers</h2>
                <span class="section-badge">Top ${fluctuations.length}</span>
            </div>

            <div class="anomaly-list">
                ${fluctuations.map((fluctuation: DailyCostFluctuation) => {
                    const increase = fluctuation.totalChangeAmount >= 0;
                    return `
                    <div class="anomaly-card" style="border-left-color: ${increase ? '#dc3545' : '#28a745'};">
                        <div class="anomaly-header">
                            <div>
                                <div class="anomaly-title">
                                    ${this.escapeHtml(this.dateLabel(fluctuation.previousDate))} → ${this.escapeHtml(this.dateLabel(fluctuation.date))} (UTC)
                                </div>
                                <div style="font-size: 12px; color: #888; margin-top: 4px;">
                                    Total daily change: <strong class="${increase ? 'text-danger' : 'text-success'}">${this.formatCurrency(fluctuation.totalChangeAmount, analysis.summary.currency)} (${this.formatPercent(fluctuation.totalChangePercent)})</strong>
                                </div>
                            </div>
                            <span class="badge ${this.getSeverityClass(fluctuation.significance)}">${this.escapeHtml(fluctuation.significance)}</span>
                        </div>

                        ${fluctuation.topServiceDrivers.length > 0 ? `
                            <table>
                                <thead>
                                    <tr>
                                        <th>Service</th>
                                        <th>Category</th>
                                        <th>Previous Day</th>
                                        <th>Current Day</th>
                                        <th>Delta</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${fluctuation.topServiceDrivers.slice(0, 5).map(driver => `
                                        <tr>
                                            <td class="table-primary">${this.escapeHtml(driver.serviceName)}</td>
                                            <td>${this.escapeHtml(driver.serviceCategory)}</td>
                                            <td class="table-number">${this.formatCurrency(driver.previousCost, analysis.summary.currency)}</td>
                                            <td class="table-number">${this.formatCurrency(driver.currentCost, analysis.summary.currency)}</td>
                                            <td class="table-number ${driver.changeAmount >= 0 ? 'text-danger' : 'text-success'}">
                                                ${this.formatCurrency(driver.changeAmount, analysis.summary.currency)} (${this.formatPercent(driver.changePercent)})
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        ` : `
                            <p style="color: #666; font-size: 13px;">Service-level attribution data was not available for this day pair.</p>
                        `}
                    </div>`;
                }).join('')}
            </div>
        </section>`;
    }

    private generateAnomaliesSection(analysis: ComprehensiveCostAnalysis): string {
        if (!analysis.anomalies || analysis.anomalies.length === 0) {
            return `
            <section class="section">
                <div class="section-header">
                    <h2 class="section-title">Cost Anomalies</h2>
                    <span class="section-badge">None Detected</span>
                </div>
                <p style="color: #666; padding: 20px 0;">No significant cost anomalies detected in the recent period. This is good news!</p>
            </section>`;
        }

        const criticalCount = analysis.anomalies.filter(a => a.severity === 'critical').length;
        const highCount = analysis.anomalies.filter(a => a.severity === 'high').length;
        const mediumCount = analysis.anomalies.filter(a => a.severity === 'medium').length;
        const lowCount = analysis.anomalies.filter(a => a.severity === 'low').length;
        const totalCount = analysis.anomalies.length;

        return `
        <section class="section">
            <div class="section-header">
                <h2 class="section-title">Cost Anomalies</h2>
                <div style="display: flex; gap: 12px; align-items: center;">
                    <span class="section-badge">${totalCount} Shown</span>
                    ${criticalCount > 0 ? `<span class="badge severity-critical">${criticalCount} Critical</span>` : ''}
                    ${highCount > 0 ? `<span class="badge severity-high">${highCount} High</span>` : ''}
                    ${mediumCount > 0 ? `<span class="badge severity-medium">${mediumCount} Medium</span>` : ''}
                    ${lowCount > 0 ? `<span class="badge severity-low">${lowCount} Low</span>` : ''}
                </div>
            </div>
            <p style="font-size: 12px; color: #666; margin-bottom: 16px;">Descriptive flags against the observed-period mean, using configured lookback and severity thresholds. These are not calibrated probabilities or causal findings.</p>
            
            <div class="anomaly-list">
                ${analysis.anomalies.map(anomaly => {
                    const anomalyDate = new Date(anomaly.detectedDate);
                    const isWeekendDay = [0, 6].includes(anomalyDate.getUTCDay());
                    const dayName = anomalyDate.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
                    return `
                    <div class="anomaly-card">
                        <div class="anomaly-header">
                            <div>
                                <div class="anomaly-title">${this.escapeHtml(anomaly.description)}</div>
                                <div style="font-size: 12px; color: #888; margin-top: 4px;">
                                    ${this.escapeHtml(this.dateLabel(anomaly.detectedDate))} UTC${isWeekendDay ? ` <span style="background: #f0e6ff; color: #6b21a8; padding: 2px 6px; border-radius: 3px; font-size: 10px; font-weight: 600; margin-left: 6px;">📅 ${dayName}</span>` : ''}
                                </div>
                            </div>
                            <span class="badge ${this.getSeverityClass(anomaly.severity)}">
                                ${this.escapeHtml(anomaly.severity)}
                            </span>
                        </div>
                        
                        <div class="anomaly-details">
                            <div class="anomaly-detail-item">
                                <div class="anomaly-detail-label">Observed-period mean</div>
                                <div class="anomaly-detail-value">${this.formatCurrency(anomaly.expectedCost, analysis.summary.currency)}</div>
                            </div>
                            <div class="anomaly-detail-item">
                                <div class="anomaly-detail-label">Actual Cost</div>
                                <div class="anomaly-detail-value">${this.formatCurrency(anomaly.actualCost, analysis.summary.currency)}</div>
                            </div>
                            <div class="anomaly-detail-item">
                                <div class="anomaly-detail-label">Deviation</div>
                                <div class="anomaly-detail-value ${anomaly.deviationPercent > 0 ? 'text-danger' : 'text-success'}">
                                    ${this.formatPercent(anomaly.deviationPercent)}
                                </div>
                            </div>
                            ${anomaly.service ? `
                                <div class="anomaly-detail-item">
                                    <div class="anomaly-detail-label">Service</div>
                                    <div class="anomaly-detail-value">${this.escapeHtml(anomaly.service)}</div>
                                </div>
                            ` : ''}
                            ${anomaly.confidence ? `
                                <div class="anomaly-detail-item">
                                    <div class="anomaly-detail-label">Confidence</div>
                                    <div class="anomaly-detail-value">${Math.round(anomaly.confidence * 100)}%</div>
                                </div>
                            ` : ''}
                        </div>
                        
                        ${anomaly.recommendations && anomaly.recommendations.length > 0 ? `
                            <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #f0f0f0;">
                                <div style="font-size: 12px; font-weight: 600; color: #0f2557; margin-bottom: 8px;">RECOMMENDED ACTIONS:</div>
                                ${anomaly.recommendations.map(rec => `
                                    <div style="font-size: 13px; color: #555; margin-bottom: 4px;">• ${this.escapeHtml(rec)}</div>
                                `).join('')}
                            </div>
                        ` : ''}
                    </div>
                `;}).join('')}
            </div>
        </section>`;
    }

    private generateTopServices(analysis: ComprehensiveCostAnalysis): string {
        const services = analysis.current.topCostServices.slice(0, 10);
        
        return `
        <section class="section">
            <div class="section-header">
                <h2 class="section-title">Top Cost Services</h2>
                <span class="section-badge">Top 10</span>
            </div>
            
            <table>
                <thead>
                    <tr>
                        <th>Rank</th>
                        <th>Service</th>
                        <th>Category</th>
                        <th>Cost</th>
                        <th>% of Total</th>
                        <th>Distribution</th>
                    </tr>
                </thead>
                <tbody>
                    ${services.map((service, index) => `
                        <tr>
                            <td class="table-number">${index + 1}</td>
                            <td class="table-primary">${this.escapeHtml(service.serviceName)}</td>
                            <td>${this.escapeHtml(service.serviceCategory)}</td>
                            <td class="table-number">${this.formatCurrency(service.cost, service.currency)}</td>
                            <td class="table-number">${this.formatPercent(service.percentageOfTotal)}</td>
                            <td style="min-width: 150px;">
                                <div class="progress-bar">
                                    <div class="progress-fill" style="width: ${Math.max(0, Math.min(100, service.percentageOfTotal || 0))}%"></div>
                                </div>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </section>`;
    }

    private generateRecommendationsSection(
        recommendations?: Recommendation[],
        summary?: RecommendationSummary
    ): string {
        if (!recommendations || recommendations.length === 0) {
            return `
            <section class="section">
                <div class="section-header">
                    <h2 class="section-title">Optimization Recommendations</h2>
                    <span class="section-badge">Not assessed</span>
                </div>
                <p class="text-muted">Optimization opportunities and potential savings were not assessed. No conclusion about resource efficiency can be drawn from this cost report.</p>
            </section>`;
        }

        return `
        <section class="section">
            <div class="section-header">
                <h2 class="section-title">Optimization Recommendations</h2>
                <span class="section-badge">${recommendations.length} Recommendations</span>
            </div>
            
            ${summary ? `
                <div class="summary-grid" style="margin-bottom: 32px;">
                    <div class="summary-card">
                        <div class="summary-label">Total Potential Savings</div>
                        <div class="summary-value" style="color: #28a745;">
                            ${this.formatCurrency(summary.totalPotentialMonthlySavings, summary.currency)}/mo
                        </div>
                        <div class="summary-subtitle">
                            ${this.formatCurrency(summary.totalPotentialAnnualSavings, summary.currency)}/year
                        </div>
                    </div>
                    <div class="summary-card">
                        <div class="summary-label">Total Recommendations</div>
                        <div class="summary-value">${summary.totalRecommendations}</div>
                    </div>
                </div>
            ` : ''}
            
            ${recommendations.map(rec => `
                <div class="recommendation-card">
                    <div class="recommendation-header">
                        <div>
                            <div class="recommendation-title">${this.escapeHtml(rec.title)}</div>
                            <div style="font-size: 12px; color: #888; margin-top: 4px;">
                                ${this.escapeHtml(rec.resourceType)} • ${this.escapeHtml(rec.resourceName)}
                            </div>
                        </div>
                        <span class="badge ${this.getSeverityClass(rec.priority)}">
                            ${this.escapeHtml(rec.priority)} priority
                        </span>
                    </div>
                    
                    <div class="recommendation-description">
                        ${this.escapeHtml(rec.description)}
                    </div>
                    
                    <div style="background: #f8f9fa; padding: 16px; border-radius: 4px; margin-bottom: 16px;">
                        <div style="font-size: 12px; font-weight: 600; color: #0f2557; margin-bottom: 8px;">ACTION REQUIRED:</div>
                        <div style="font-size: 13px; color: #555;">${this.escapeHtml(rec.action)}</div>
                    </div>
                    
                    <div class="recommendation-metrics">
                        <div class="metric-item">
                            <div class="metric-label">Current Monthly Cost</div>
                            <div class="metric-value" style="color: #dc3545;">
                                ${this.formatCurrency(rec.currentMonthlyCost, rec.currency)}
                            </div>
                        </div>
                        <div class="metric-item">
                            <div class="metric-label">Projected Monthly Cost</div>
                            <div class="metric-value" style="color: #0f2557;">
                                ${this.formatCurrency(rec.projectedMonthlyCost, rec.currency)}
                            </div>
                        </div>
                        <div class="metric-item">
                            <div class="metric-label">Monthly Savings</div>
                            <div class="metric-value">
                                ${this.formatCurrency(rec.potentialMonthlySavings, rec.currency)}
                            </div>
                        </div>
                        <div class="metric-item">
                            <div class="metric-label">Annual Savings</div>
                            <div class="metric-value">
                                ${this.formatCurrency(rec.potentialAnnualSavings, rec.currency)}
                            </div>
                        </div>
                        <div class="metric-item">
                            <div class="metric-label">Savings Percentage</div>
                            <div class="metric-value">
                                ${rec.savingsPercent.toFixed(0)}%
                            </div>
                        </div>
                        <div class="metric-item">
                            <div class="metric-label">Implementation Effort</div>
                            <div class="metric-value" style="font-size: 14px; text-transform: uppercase;">
                                ${this.escapeHtml(rec.effort)}
                            </div>
                        </div>
                    </div>
                    
                    ${rec.rationale ? `
                        <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e0e0e0;">
                            <div style="font-size: 12px; font-weight: 600; color: #0f2557; margin-bottom: 8px;">RATIONALE:</div>
                            <div style="font-size: 13px; color: #555;">${this.escapeHtml(rec.rationale)}</div>
                        </div>
                    ` : ''}
                </div>
            `).join('')}
        </section>`;
    }

    private generateVMCostSection(vmCostSummary: VMCostSummary): string {
        if (!vmCostSummary || vmCostSummary.topCostVMs.length === 0) {
            return '';
        }

        return `
        <section class="section">
            <div class="section-header">
                <h2 class="section-title">Virtual Machine Cost Analysis</h2>
                <span class="section-badge">${vmCostSummary.topCostVMs.length} VMs</span>
            </div>
            
            <div class="summary-grid" style="margin-bottom: 24px;">
                <div class="summary-card">
                    <div class="summary-label">Total VM Cost (90 Days)</div>
                    <div class="summary-value">${this.formatCurrency(vmCostSummary.totalVMCost, 'USD')}</div>
                </div>
                <div class="summary-card">
                    <div class="summary-label">Average VM Cost</div>
                    <div class="summary-value">${this.formatCurrency(vmCostSummary.averageVMCost, 'USD')}</div>
                </div>
                <div class="summary-card">
                    <div class="summary-label">Cost Trends</div>
                    <div class="summary-value" style="font-size: 16px;">
                        <span class="trend-up">${vmCostSummary.vmsByTrend.increasing} ↗</span> | 
                        <span class="trend-down">${vmCostSummary.vmsByTrend.decreasing} ↘</span> | 
                        <span class="trend-stable">${vmCostSummary.vmsByTrend.stable} →</span>
                    </div>
                </div>
                <div class="summary-card">
                    <div class="summary-label">Potential Monthly Savings</div>
                    <div class="summary-value" style="color: #28a745;">${this.formatCurrency(vmCostSummary.totalPotentialSavings, 'USD')}</div>
                </div>
            </div>

            <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 16px;">Per-VM Cost Breakdown</h3>
            <table>
                <thead>
                    <tr>
                        <th>VM Name</th>
                        <th>Status</th>
                        <th>Resource Group</th>
                        <th>Size</th>
                        <th>Total Cost</th>
                        <th>Avg Daily</th>
                        <th>Active Days</th>
                        <th>Trend</th>
                    </tr>
                </thead>
                <tbody>
                    ${vmCostSummary.topCostVMs.map(vm => `
                        <tr${vm.isDeleted ? ' style="opacity: 0.7; background-color: #fef3f3;"' : ''}>
                            <td class="table-primary">${this.escapeHtml(vm.vmName)}</td>
                            <td>
                                ${vm.isDeleted 
                                    ? `<span style="background: #fee2e2; color: #dc2626; padding: 2px 8px; border-radius: 3px; font-size: 11px; font-weight: 600;">🗑️ DELETED</span>
                                       ${vm.lastSeenDate ? `<div style="font-size: 10px; color: #888; margin-top: 2px;">Last seen: ${vm.lastSeenDate}</div>` : ''}`
                                    : '<span style="background: #d1fae5; color: #059669; padding: 2px 8px; border-radius: 3px; font-size: 11px; font-weight: 600;">Active</span>'
                                }
                            </td>
                            <td>${this.escapeHtml(vm.resourceGroup)}</td>
                            <td class="text-muted">${this.escapeHtml(vm.vmSize || 'N/A')}</td>
                            <td class="table-number">${this.formatCurrency(vm.totalCost, 'USD')}</td>
                            <td class="table-number">${this.formatCurrency(vm.averageDailyCost, 'USD')}</td>
                            <td class="table-number">${vm.daysActive}/${vm.daysInPeriod} (${vm.utilizationPercentage.toFixed(0)}%)</td>
                            <td class="${vm.costTrend === 'increasing' ? 'trend-up' : vm.costTrend === 'decreasing' ? 'trend-down' : 'trend-stable'}">
                                ${vm.isDeleted ? '<span style="color: #888;">N/A</span>' : `${this.getTrendIcon(vm.costTrend)} ${this.formatPercent(vm.trendPercentage)}`}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>

            ${vmCostSummary.topCostVMs.length > 0 ? this.generateVMMonthlyBreakdown(vmCostSummary.topCostVMs.slice(0, 5)) : ''}
        </section>`;
    }

    private generateVMMonthlyBreakdown(topVMs: VMCostAnalysis[]): string {
        if (topVMs.length === 0 || !topVMs[0].monthlyCosts || topVMs[0].monthlyCosts.length === 0) {
            return '';
        }

        const months = topVMs[0].monthlyCosts.map(m => m.monthName);

        return `
            <h3 style="font-size: 16px; font-weight: 600; margin-top: 32px; margin-bottom: 16px;">Monthly Cost Breakdown (Top 5 VMs)</h3>
            <table>
                <thead>
                    <tr>
                        <th>VM Name</th>
                        ${months.map(month => `<th>${this.escapeHtml(month)}</th>`).join('')}
                        <th>Projected Monthly</th>
                    </tr>
                </thead>
                <tbody>
                    ${topVMs.map(vm => `
                        <tr>
                            <td class="table-primary">${this.escapeHtml(vm.vmName)}</td>
                            ${vm.monthlyCosts.map(mc => `
                                <td class="table-number">
                                    ${this.formatCurrency(mc.totalCost, 'USD')}
                                    ${mc.comparedToPreviousMonth !== undefined ? `
                                        <div class="text-muted" style="font-size: 10px;">
                                            ${this.formatPercent(mc.comparedToPreviousMonth)}
                                        </div>
                                    ` : ''}
                                </td>
                            `).join('')}
                            <td class="table-number" style="font-weight: 600;">
                                ${this.formatCurrency(vm.projectedMonthlyCost, 'USD')}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>`;
    }

    private generateVMRecommendationsSection(vmCostSummary: VMCostSummary): string {
        const allRecommendations: Array<{vm: VMCostAnalysis; rec: VMCostRecommendation}> = [];
        
        for (const vm of vmCostSummary.topCostVMs) {
            for (const rec of vm.recommendations) {
                allRecommendations.push({ vm, rec });
            }
        }

        if (allRecommendations.length === 0) {
            return '';
        }

        // Sort by savings potential and take top 10
        allRecommendations.sort((a, b) => b.rec.estimatedMonthlySavings - a.rec.estimatedMonthlySavings);
        const topRecommendations = allRecommendations.slice(0, 10);

        const totalPotentialSavings = topRecommendations.reduce((sum, r) => sum + r.rec.estimatedMonthlySavings, 0);

        return `
        <section class="section">
            <div class="section-header">
                <h2 class="section-title">VM-Specific Recommendations</h2>
                <span class="section-badge">${topRecommendations.length} Recommendations</span>
            </div>
            
            <div class="summary-grid" style="margin-bottom: 24px;">
                <div class="summary-card">
                    <div class="summary-label">Total Potential Savings</div>
                    <div class="summary-value" style="color: #28a745;">${this.formatCurrency(totalPotentialSavings, 'USD')}/mo</div>
                    <div class="summary-subtitle">${this.formatCurrency(totalPotentialSavings * 12, 'USD')}/year</div>
                </div>
                <div class="summary-card">
                    <div class="summary-label">By Type</div>
                    <div class="summary-value" style="font-size: 14px;">
                        ${Object.entries(vmCostSummary.recommendationsByType).map(([type, count]) => 
                            `${type}: ${count}`
                        ).join(' | ')}
                    </div>
                </div>
            </div>

            ${topRecommendations.map(({ vm, rec }) => `
                <div class="recommendation-card" style="border-left-color: ${rec.confidence === 'high' ? '#28a745' : rec.confidence === 'medium' ? '#ffc107' : '#6c757d'};">
                    <div class="recommendation-header">
                        <div>
                            <div class="recommendation-title">${this.escapeHtml(rec.title)}</div>
                            <div style="font-size: 12px; color: #888; margin-top: 4px;">
                                VM: ${this.escapeHtml(vm.vmName)} • ${this.escapeHtml(vm.resourceGroup)}
                            </div>
                        </div>
                        <span class="badge ${rec.confidence === 'high' ? 'severity-low' : rec.confidence === 'medium' ? 'severity-medium' : 'severity-high'}" 
                              style="background: ${rec.confidence === 'high' ? '#28a745' : rec.confidence === 'medium' ? '#ffc107' : '#6c757d'};">
                            ${this.escapeHtml(rec.confidence)} confidence
                        </span>
                    </div>
                    
                    <div class="recommendation-description">
                        ${this.escapeHtml(rec.reason)}
                    </div>
                    
                    <div class="recommendation-metrics">
                        <div class="metric-item">
                            <div class="metric-label">Monthly Savings</div>
                            <div class="metric-value">${this.formatCurrency(rec.estimatedMonthlySavings, 'USD')}</div>
                        </div>
                        <div class="metric-item">
                            <div class="metric-label">Annual Savings</div>
                            <div class="metric-value">${this.formatCurrency(rec.estimatedAnnualSavings, 'USD')}</div>
                        </div>
                        <div class="metric-item">
                            <div class="metric-label">Implementation Effort</div>
                            <div class="metric-value" style="font-size: 14px; text-transform: uppercase;">
                                ${this.escapeHtml(rec.implementationEffort)}
                            </div>
                        </div>
                        <div class="metric-item">
                            <div class="metric-label">VM Current Cost (90 days)</div>
                            <div class="metric-value" style="font-size: 14px; color: #0f2557;">
                                ${this.formatCurrency(vm.totalCost, 'USD')}
                            </div>
                        </div>
                    </div>
                </div>
            `).join('')}
        </section>`;
    }

    private generateFooter(analysis: ComprehensiveCostAnalysis, generatedAt: string): string {
        const provenance = analysis.dataProvenance;
        return `
        <footer class="report-footer">
            <div style="font-weight: 600; margin-bottom: 8px;">Azure Cost Analyzer</div>
            <div>Generated: ${this.escapeHtml(format(new Date(generatedAt), 'MMMM dd, yyyy HH:mm:ss'))}</div>
            <div class="footer-note">
                Data source: ${this.escapeHtml(provenance.source)} • Mode: ${provenance.mode.toUpperCase()} • Fallback used: ${provenance.generatedFromFallback ? 'YES' : 'NO'}
            </div>
        </footer>`;
    }
}
