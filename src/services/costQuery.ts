import { AzureCliCredential } from '@azure/identity';
import { CostManagementClient, QueryDefinition, QueryResult } from '@azure/arm-costmanagement';

export type CostPage = Pick<QueryResult, 'columns' | 'rows' | 'nextLink'>;
export type CostTransport = (query: QueryDefinition, nextLink?: string) => Promise<CostPage>;

/** Query only: no Azure mutation operations are exposed. */
export function azureCostTransport(tenantId: string, scope: string): CostTransport {
    const credential = new AzureCliCredential({ tenantId });
    const client = new CostManagementClient(credential, { retryOptions: { maxRetries: 0 } });
    return async (query, nextLink) => {
        if (!nextLink) return client.query.usage(scope, query);
        const url = new URL(nextLink);
        if (url.protocol !== 'https:' || url.host !== 'management.azure.com' || url.username || url.password || url.hash ||
            url.pathname.toLowerCase() !== `${scope}/providers/Microsoft.CostManagement/query`.toLowerCase()) {
            throw new Error('Unsafe cost continuation URL. Collection stopped.');
        }
        const token = await credential.getToken('https://management.azure.com/.default');
        const response = await fetch(url, {
            method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30_000),
            headers: { Authorization: `Bearer ${token.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(query)
        });
        if (!response.ok) throw Object.assign(new Error('Cost continuation failed.'), {
            statusCode: response.status, response: { headers: response.headers }
        });
        if (response.status === 204) return {};
        const body = await response.json() as { properties?: CostPage };
        if (!body.properties) throw new Error('Cost continuation response has no properties.');
        return body.properties;
    };
}

export function sumCosts(values: number[]): number {
    let total = 0, correction = 0;
    for (const value of values) {
        const adjusted = value - correction, next = total + adjusted;
        correction = (next - total) - adjusted; total = next;
    }
    if (!Number.isFinite(total)) throw new Error('Cost aggregation is not finite.');
    return total;
}

export function percentChange(previous: number, current: number): number | null {
    return previous > 0 ? (current - previous) / previous * 100 : null;
}

export function usageDate(value: unknown): string {
    const digits = String(value);
    if (!/^\d{8}$/.test(digits)) throw new Error('Invalid UsageDate in cost response.');
    const iso = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}T00:00:00.000Z`;
    const date = new Date(iso);
    if (!Number.isFinite(date.getTime()) || date.toISOString() !== iso) throw new Error('Invalid calendar date in cost response.');
    return iso;
}

export function retryAfterMs(error: any, now: number): number {
    const headers = error?.response?.headers;
    return Math.max(0, ...['retry-after', 'x-ms-ratelimit-microsoft.consumption-retry-after',
        'x-ms-ratelimit-microsoft.costmanagement-qpu-retry-after',
        'x-ms-ratelimit-microsoft.costmanagement-entity-retry-after',
        'x-ms-ratelimit-microsoft.costmanagement-tenant-retry-after'].map(name => {
        const raw = headers?.get?.(name) ?? headers?.[name];
        if (raw == null) return 0;
        const seconds = Number(raw);
        if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
        const date = Date.parse(String(raw));
        return Number.isFinite(date) ? Math.max(0, date - now) : 0;
    }));
}
