import { HistoricalCostData } from './costAnalysis';

export interface MonthlyCostEvidence {
    month: string;
    generatedAt: string;
    scope: string;
    costBasis: 'ActualCost';
    source: string;
    collectedPages: number;
    current: HistoricalCostData;
    previous: HistoricalCostData;
}

export interface MonthlyDriver {
    name: string;
    previousCost: number;
    currentCost: number;
    change: number;
    changePercent: number | null;
    presence: 'both' | 'current only' | 'previous only';
}

export interface MonthCoverage {
    expectedDays: number;
    observedDays: number;
    missingDates: string[];
    averagePerObservedDay: number;
}

export interface MonthlyReport {
    schemaVersion: '1.0';
    evidence: MonthlyCostEvidence;
    change: { amount: number; percent: number | null };
    coverage: { current: MonthCoverage; previous: MonthCoverage };
    drivers: { services: MonthlyDriver[]; resourceGroups: MonthlyDriver[] };
    observations: string[];
    reviewQuestions: string[];
    limitations: string[];
}
