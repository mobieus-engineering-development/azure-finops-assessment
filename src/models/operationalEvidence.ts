export interface EvidenceSource {
    status: 'complete' | 'unavailable';
    source: string;
    collectedAt: string;
    pages: number;
    reason?: string;
}

export interface InventoryResource {
    id: string;
    name: string;
    type: string;
    location: string | null;
    tags: Record<string, string>;
}

export interface CpuEvidence {
    status: 'observed' | 'no_data' | 'unavailable' | 'not_collected';
    reason?: string;
    source: 'Azure Monitor / Percentage CPU';
    start: string;
    endExclusive: string;
    collectedAt: string | null;
    interval: 'PT1H';
    expectedHours: number;
    observedHours: number;
    coveragePercent: number;
    meanHourlyAverage: number | null;
    p95HourlyAverage: number | null;
    maxHourlyAverage: number | null;
    samples: Array<{ timestamp: string; average: number }>;
}

export interface AdvisorEvidence {
    id: string;
    resourceId: string | null;
    problem: string;
    solution: string;
    impact: string;
    lastUpdated: string | null;
    ageDays: number | null;
    inventoryMatch: 'present' | 'not_in_current_inventory' | 'unknown' | 'no_resource_target';
    reviewEligible: boolean;
    reviewReason: string;
    reportedProperties: Record<string, string>;
}

export interface ResourceEvidence {
    resourceId: string;
    name: string;
    portalUrl: string | null;
    currentCost: number | null;
    previousCost: number | null;
    currency: string;
    inventoryMatch: 'present' | 'not_in_current_inventory' | 'unknown' | 'unallocated' | 'out_of_scope';
    inventory: InventoryResource | null;
    cpu: CpuEvidence;
    advisorIds: string[];
}

export interface OperationalEvidence {
    startedAt: string;
    completedAt: string;
    financialMonth: string;
    inventory: EvidenceSource & { resources: InventoryResource[] };
    advisor: EvidenceSource & { recommendations: AdvisorEvidence[] };
    metricsPolicy: { maxResources: number; requestedResources: number; retentionDays: number; advisorReviewAgeDays: number };
    resources: ResourceEvidence[];
    limitations: string[];
}
