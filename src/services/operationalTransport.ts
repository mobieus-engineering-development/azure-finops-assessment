import { AzureCliCredential } from '@azure/identity';
import { retryAfterMs } from './costQuery';

export type EvidenceGet = (url: string) => Promise<unknown>;

/** Resource IDs are joined case-insensitively, without rewriting encoded path segments. */
export function normalizeResourceId(value: string): string { return value.trim().replace(/\/+$/, '').toLowerCase(); }

export function resourceInScope(id: string, scope: string): boolean {
    return normalizeResourceId(id).startsWith(`${normalizeResourceId(scope)}/`) && !/[?#\\\x00-\x1f\x7f]/.test(id) && !/%2[fFeE]|%5[cC]/.test(id) &&
        !id.split('/').some(segment => segment === '.' || segment === '..');
}

/** Only GET inventory, cached Advisor recommendations and metrics for this subscription. */
export function azureEvidenceGet(tenantId: string, scope: string): EvidenceGet {
    const credential = new AzureCliCredential({ tenantId });
    const root = normalizeResourceId(scope);
    let blockedUntil = 0;
    return async input => {
        const url = new URL(input), pathname = url.pathname.toLowerCase();
        const allowed = pathname === `${root}/resources` || pathname === `${root}/providers/microsoft.advisor/recommendations` ||
            (resourceInScope(pathname, root) && pathname.endsWith('/providers/microsoft.insights/metrics'));
        if (url.protocol !== 'https:' || url.host !== 'management.azure.com' || url.username || url.password || url.hash || !allowed) {
            throw new Error('Operational endpoint is outside the read-only allowlist.');
        }
        for (let attempt = 0; attempt < 3; attempt++) {
            if (Date.now() < blockedUntil) throw Object.assign(new Error('Operational endpoint is cooling down.'), { statusCode: 429 });
            const token = await credential.getToken('https://management.azure.com/.default');
            const response = await fetch(url, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(30_000),
                headers: { Authorization: `Bearer ${token.token}` } });
            if (response.ok) return response.json();
            if (response.status === 429 || response.status === 503) {
                const wait = Math.max(1000 * 2 ** attempt, retryAfterMs({ response }, Date.now()));
                if (attempt < 2 && wait <= 30_000) { await new Promise(resolve => setTimeout(resolve, wait)); continue; }
                blockedUntil = Date.now() + wait;
            }
            throw Object.assign(new Error('Operational evidence request failed.'), { statusCode: response.status });
        }
        throw new Error('Operational evidence request failed.');
    };
}
