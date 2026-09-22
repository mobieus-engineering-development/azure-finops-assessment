import { CostAnomaly, ComprehensiveCostAnalysis } from '../models/costAnalysis';
import { configService } from '../utils/config';
import { sumCosts } from '../services/costQuery';

/** Descriptive threshold flags, not a calibrated probability model. */
export class AnomalyDetector {
    public detectAnomalies(analysis: ComprehensiveCostAnalysis): CostAnomaly[] {
        const config = configService.getAnalysisConfig();
        const cutoff = Date.parse(analysis.analysisDate) - config.anomalyLookbackDays * 86_400_000;
        const points = analysis.historical.dailyCosts.filter(p => Date.parse(p.date) >= cutoff && Date.parse(p.date) <= Date.parse(analysis.analysisDate));
        if (points.length < 7 || new Set(points.map(p => p.currency)).size !== 1) return [];
        const mean = sumCosts(points.map(p => p.cost)) / points.length;
        if (mean <= 0) return [];
        const order = { low: 1, medium: 2, high: 3, critical: 4 };
        const anomalies: CostAnomaly[] = [];
        for (const point of points) {
            const deviation = (point.cost - mean) / mean * 100;
            const magnitude = Math.abs(deviation);
            if (magnitude <= config.anomalyThresholdPercent) continue;
            const severity = magnitude > 100 ? 'critical' : magnitude > 50 ? 'high' : magnitude > 30 ? 'medium' : 'low';
            if (order[severity] < order[config.anomalyMinSeverity]) continue;
            anomalies.push({ id: `threshold-${point.date}`, detectedDate: point.date, expectedCost: mean, actualCost: point.cost,
                deviationPercent: deviation, severity, category: deviation > 0 ? 'spike' : 'drop',
                description: `Threshold flag: ${deviation.toFixed(1)}% versus observed-period mean; not a calibrated probability or causal finding.`,
                recommendations: ['Investigate service-level changes, credits, billing freshness and workload changes before drawing conclusions.'] });
        }
        return anomalies.sort((a, b) => order[b.severity] - order[a.severity] || Math.abs(b.deviationPercent) - Math.abs(a.deviationPercent))
            .slice(0, config.anomalyMaxDisplay);
    }
}
