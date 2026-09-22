/**
 * Cost Analysis Models for Azure Cost Analyzer
 * Supports historical, current, and forecasted cost data
 */

export interface CostDataPoint {
    date: string; // ISO date string
    cost: number;
    currency: string;
}

export interface DailyServiceCostPoint {
    date: string; // ISO date string
    serviceName: string;
    serviceCategory: string;
    cost: number;
    currency: string;
}

export interface ServiceCostDelta {
    serviceName: string;
    serviceCategory: string;
    previousCost: number;
    currentCost: number;
    changeAmount: number;
    changePercent: number | null;
    currency: string;
}

export interface DailyCostFluctuation {
    date: string;
    previousDate: string;
    totalCost: number;
    previousTotalCost: number;
    totalChangeAmount: number;
    totalChangePercent: number | null;
    direction: 'increasing' | 'decreasing' | 'stable';
    significance: 'low' | 'medium' | 'high' | 'critical';
    topServiceDrivers: ServiceCostDelta[];
}

export interface DataProvenance {
    costBasis?: 'ActualCost';
    coverage?: string;
    queriedThrough?: string;
    collectedPages?: number;
    notices?: string[];
    mode: 'live' | 'fallback';
    source: string;
    generatedFromFallback: boolean;
    queryPolicy: {
        apiDelayMs: number;
        maxRetries: number;
        retryBaseDelayMs: number;
        retryMaxDelayMs: number;
    };
}

export interface CostByResource {
    resourceId: string;
    resourceName: string;
    resourceType: string;
    resourceGroup: string;
    location: string;
    cost: number;
    currency: string;
    tags?: Record<string, string>;
}

export interface CostByService {
    serviceName: string;
    serviceCategory: string;
    cost: number;
    currency: string;
    percentageOfTotal: number | null;
}

export interface HistoricalCostData {
    startDate: string;
    endDate: string;
    totalCost: number;
    currency: string;
    dailyCosts: CostDataPoint[];
    dailyServiceCosts: DailyServiceCostPoint[];
    monthlyCosts: CostDataPoint[];
    costByResource: CostByResource[];
    costByService: CostByService[];
    costByResourceGroup: Array<{
        resourceGroup: string;
        cost: number;
        resourceCount: number;
    }>;
}

export interface CurrentCostData {
    billingPeriodStart: string;
    billingPeriodEnd: string;
    currentDate: string;
    monthToDateCost: number;
    estimatedMonthEndCost: number | null;
    currency: string;
    dailyCosts: CostDataPoint[];
    topCostResources: CostByResource[];
    topCostServices: CostByService[];
    comparisonToPreviousMonth: {
        comparableDays?: number;
        previousComparableCost?: number;
        currentComparableCost?: number;
        previousMonthTotal: number;
        changeAmount: number;
        changePercent: number | null;
    };
    monthlyComparison: {
        twoMonthsAgo: {
            name: string;  // e.g., "September 2025"
            total: number;
        };
        lastMonth: {
            name: string;  // e.g., "October 2025"
            total: number;
        };
        currentMonth: {
            name: string;  // e.g., "November 2025"
            monthToDate: number;
            projected: number | null;
        };
        lastTwoMonthsChange: {
            amount: number;
            percent: number | null;
        };
        projectedChange: {
            amount: number | null;
            percent: number | null;
        };
    };
}

export interface ForecastDataPoint {
    date: string;
    predictedCost: number;
    confidenceLower: number; // Lower bound of confidence interval
    confidenceUpper: number; // Upper bound of confidence interval
    currency: string;
}

export interface ForecastedCostData {
    forecastStartDate: string;
    forecastEndDate: string;
    totalForecastedCost: number | null;
    currency: string;
    dailyForecasts: ForecastDataPoint[];
    monthlyForecasts: ForecastDataPoint[];
    forecastMethod: string; // e.g., 'linear', 'exponential', 'azure-api'
    confidenceLevel: number | null; // Null when no validated forecast exists.
    assumptions: string[];
}

export interface CostAnomaly {
    id: string;
    detectedDate: string;
    resourceId?: string;
    resourceType?: string;
    service?: string;
    expectedCost: number;
    actualCost: number;
    deviationPercent: number;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    category?: 'spike' | 'drop' | 'service_concentration' | 'unusual_pattern';
    confidence?: number; // 0-1 scale
    recommendations?: string[];
}

export interface CostTrend {
    period: 'daily' | 'weekly' | 'monthly';
    direction: 'increasing' | 'decreasing' | 'stable';
    changePercent: number;
    changeAmount: number;
    dataPoints: CostDataPoint[];
    insights?: Array<{
        type: 'moving_average' | 'week_over_week' | 'seasonality' | 'projection';
        description: string;
        value: number;
        confidence?: 'low' | 'medium' | 'high';
    }>;
    movingAverages?: {
        sevenDay?: number;
        thirtyDay?: number;
    };
    weekOverWeekChange?: number;
    projectedNextPeriod?: number;
}

export interface ComprehensiveCostAnalysis {
    id: string;
    subscriptionId: string;
    scope: string;
    analysisDate: string;
    historical: HistoricalCostData;
    current: CurrentCostData;
    forecasted: ForecastedCostData;
    trends: CostTrend[];
    anomalies: CostAnomaly[];
    fluctuations: DailyCostFluctuation[];
    dataProvenance: DataProvenance;
    summary: {
        totalHistoricalCost: number;
        currentMonthToDate: number;
        forecastedMonthEnd: number | null;
        forecastedNextMonth: number | null;
        currency: string;
        avgDailySpend: number;
        peakDailySpend: number;
        lowestDailySpend: number;
    };
}

// Legacy interface for backward compatibility
export interface CostAnalysis {
    totalCosts: number;
    costTrends: Array<{
        date: string;
        cost: number;
    }>;
    associatedResources: Array<{
        resourceId: string;
        resourceType: string;
        cost: number;
    }>;
}
