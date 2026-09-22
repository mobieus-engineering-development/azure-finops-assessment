/**
 * Cost Trend Analyzer
 * Analyzes cost trends over time to identify patterns and growth
 * Enhanced with moving averages, seasonality detection, and projections
 */

import { CostDataPoint, CostTrend, ComprehensiveCostAnalysis } from '../models/costAnalysis';
import { logInfo } from '../utils/logger';

interface TrendInsight {
    type: 'moving_average' | 'week_over_week' | 'seasonality' | 'projection';
    description: string;
    value: number;
    confidence?: 'low' | 'medium' | 'high';
}

export class CostTrendAnalyzer {
    /**
     * Analyze cost trends from comprehensive cost analysis data
     */
    public analyzeTrends(analysis: ComprehensiveCostAnalysis): CostTrend[] {
        logInfo('Analyzing cost trends...');
        
        const trends: CostTrend[] = [];
        const daily = analysis.historical.dailyCosts;
        if (daily.some((point, i) => i > 0 && (Date.parse(point.date) - Date.parse(daily[i - 1].date) !== 86_400_000 || point.currency !== daily[i - 1].currency))) {
            return []; // Do not label sparse observations as continuous-day trends.
        }
        
        // Analyze daily trends with enhanced insights
        const dailyTrend = this.analyzePeriodTrend(
            analysis.historical.dailyCosts,
            'daily'
        );
        if (dailyTrend) {
            // Add moving average insights
            dailyTrend.insights = this.calculateMovingAverages(analysis.historical.dailyCosts);
            trends.push(dailyTrend);
        }
        
        // Analyze weekly trends
        const weeklyTrend = this.analyzeWeeklyTrend(analysis.historical.dailyCosts);
        if (weeklyTrend) trends.push(weeklyTrend);
        
        // Analyze monthly trends
        // Rolling lookbacks contain partial months. Use the explicit closed-month
        // comparison in CurrentCostData rather than compare those partial totals.
        
        logInfo(`Identified ${trends.length} cost trends with advanced analytics`);
        return trends;
    }

    /**
     * Analyze trend for a specific time period
     */
    private analyzePeriodTrend(
        dataPoints: CostDataPoint[],
        period: 'daily' | 'weekly' | 'monthly'
    ): CostTrend | null {
        if (dataPoints.length < 2) return null;

        const costs = dataPoints.map(d => d.cost);
        const firstCost = costs[0];
        if (firstCost <= 0) return null;
        const lastCost = costs[costs.length - 1];
        const changeAmount = lastCost - firstCost;
        const changePercent = firstCost > 0 ? (changeAmount / firstCost) * 100 : 0;

        // Determine direction
        let direction: 'increasing' | 'decreasing' | 'stable';
        if (Math.abs(changePercent) < 5) {
            direction = 'stable';
        } else if (changePercent > 0) {
            direction = 'increasing';
        } else {
            direction = 'decreasing';
        }

        return {
            period,
            direction,
            changePercent,
            changeAmount,
            dataPoints,
            movingAverages: this.calculateMovingAverageValues(dataPoints)
        };
    }

    /**
     * Calculate moving averages insights
     */
    private calculateMovingAverages(dataPoints: CostDataPoint[]): TrendInsight[] {
        const insights: TrendInsight[] = [];
        
        if (dataPoints.length >= 7) {
            const sevenDayAvg = this.calculateSimpleMovingAverage(dataPoints, 7);
            insights.push({
                type: 'moving_average',
                description: `7-day moving average: ${sevenDayAvg.toFixed(2)} ${dataPoints[0].currency}/day`,
                value: sevenDayAvg
            });
        }
        
        if (dataPoints.length >= 30) {
            const thirtyDayAvg = this.calculateSimpleMovingAverage(dataPoints, 30);
            insights.push({
                type: 'moving_average',
                description: `30-day moving average: ${thirtyDayAvg.toFixed(2)} ${dataPoints[0].currency}/day`,
                value: thirtyDayAvg
            });
        }
        
        return insights;
    }

    /**
     * Calculate moving average values for trend object
     */
    private calculateMovingAverageValues(dataPoints: CostDataPoint[]): {
        sevenDay?: number;
        thirtyDay?: number;
    } {
        const result: { sevenDay?: number; thirtyDay?: number } = {};
        
        if (dataPoints.length >= 7) {
            result.sevenDay = this.calculateSimpleMovingAverage(dataPoints, 7);
        }
        
        if (dataPoints.length >= 30) {
            result.thirtyDay = this.calculateSimpleMovingAverage(dataPoints, 30);
        }
        
        return result;
    }

    /**
     * Calculate simple moving average for last N periods
     */
    private calculateSimpleMovingAverage(dataPoints: CostDataPoint[], periods: number): number {
        if (dataPoints.length < periods) return 0;
        
        const recentData = dataPoints.slice(-periods);
        const sum = recentData.reduce((total, dp) => total + dp.cost, 0);
        return sum / periods;
    }

    /**
     * Analyze weekly trends (week-over-week comparison)
     */
    private analyzeWeeklyTrend(dailyCosts: CostDataPoint[]): CostTrend | null {
        if (dailyCosts.length < 14) return null;

        // Compare last 7 days to previous 7 days
        const lastWeek = dailyCosts.slice(-7);
        const previousWeek = dailyCosts.slice(-14, -7);
        
        const lastWeekTotal = lastWeek.reduce((sum, d) => sum + d.cost, 0);
        const previousWeekTotal = previousWeek.reduce((sum, d) => sum + d.cost, 0);
        if (previousWeekTotal <= 0) return null;
        
        const changeAmount = lastWeekTotal - previousWeekTotal;
        const changePercent = previousWeekTotal > 0 ? (changeAmount / previousWeekTotal) * 100 : 0;
        
        let direction: 'increasing' | 'decreasing' | 'stable';
        if (Math.abs(changePercent) < 5) {
            direction = 'stable';
        } else if (changePercent > 0) {
            direction = 'increasing';
        } else {
            direction = 'decreasing';
        }

        return {
            period: 'weekly',
            direction,
            changePercent,
            changeAmount,
            dataPoints: [...previousWeek, ...lastWeek],
            weekOverWeekChange: changePercent
        };
    }

    /**
     * Project cost for next period using linear regression
     */
    private projectNextPeriod(dataPoints: CostDataPoint[]): number | undefined {
        if (dataPoints.length < 5) return undefined;

        // Use last 30 days for projection
        const recentData = dataPoints.slice(-30);
        const n = recentData.length;
        
        // Simple linear regression
        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
        
        recentData.forEach((dp, index) => {
            const x = index;
            const y = dp.cost;
            sumX += x;
            sumY += y;
            sumXY += x * y;
            sumX2 += x * x;
        });
        
        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;
        
        // Project for next period (index = n)
        const projection = slope * n + intercept;
        return Math.max(0, projection); // Ensure non-negative
    }

    /**
     * Calculate statistics for cost data
     */
    public calculateStatistics(dataPoints: CostDataPoint[]): {
        average: number;
        highest: number;
        lowest: number;
        median: number;
        stdDeviation: number;
    } {
        const costs = dataPoints.map(d => d.cost);
        const sorted = [...costs].sort((a, b) => a - b);
        
        const average = costs.reduce((sum, cost) => sum + cost, 0) / costs.length;
        const highest = Math.max(...costs);
        const lowest = Math.min(...costs);
        const median = sorted[Math.floor(sorted.length / 2)];
        
        // Calculate standard deviation
        const squaredDiffs = costs.map(cost => Math.pow(cost - average, 2));
        const variance = squaredDiffs.reduce((sum, diff) => sum + diff, 0) / costs.length;
        const stdDeviation = Math.sqrt(variance);

        return {
            average,
            highest,
            lowest,
            median,
            stdDeviation
        };
    }
}
