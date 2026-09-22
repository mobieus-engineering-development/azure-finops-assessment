import { AzureCliCredential } from '@azure/identity';
import { QueryDefinition } from '@azure/arm-costmanagement';
import { azureCostTransport } from '../../src/services/costQuery';

const scope = '/subscriptions/test-subscription';
const definition: QueryDefinition = { type: 'ActualCost', timeframe: 'Custom',
    timePeriod: { from: new Date('2026-09-01T00:00:00Z'), to: new Date('2026-09-02T23:59:59.999Z') },
    dataset: { granularity: 'Daily', aggregation: { totalCost: { name: 'Cost', function: 'Sum' } } } };

afterEach(() => jest.restoreAllMocks());

test.each([
    'https://example.com/subscriptions/test-subscription/providers/Microsoft.CostManagement/query',
    'http://management.azure.com/subscriptions/test-subscription/providers/Microsoft.CostManagement/query',
    'https://management.azure.com/subscriptions/another/providers/Microsoft.CostManagement/query',
    'https://management.azure.com/subscriptions/test-subscription/providers/Microsoft.Compute/virtualMachines',
    'https://user:password@management.azure.com/subscriptions/test-subscription/providers/Microsoft.CostManagement/query'
])('rejects unsafe continuation without acquiring a token or making a network request: %s', async url => {
    const token = jest.spyOn(AzureCliCredential.prototype, 'getToken');
    const fetcher = jest.spyOn(global, 'fetch');
    await expect(azureCostTransport('test-tenant', scope)(definition, url)).rejects.toThrow('Unsafe');
    expect(token).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
});

test('continuation preserves POST body, refuses redirects and unwraps REST properties', async () => {
    jest.spyOn(AzureCliCredential.prototype, 'getToken').mockResolvedValue({ token: 'synthetic-test-token', expiresOnTimestamp: 0 });
    const page = { columns: [{ name: 'Cost' }], rows: [[12]] };
    const fetcher = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ properties: page }), { status: 200 }));
    const url = `https://management.azure.com${scope}/providers/Microsoft.CostManagement/query?api-version=2022-10-01&$skiptoken=test`;
    await expect(azureCostTransport('test-tenant', scope)(definition, url)).resolves.toEqual(page);
    expect(fetcher).toHaveBeenCalledWith(new URL(url), expect.objectContaining({ method: 'POST', redirect: 'error', body: JSON.stringify(definition) }));
});

test('continuation errors retain retry headers but never include response bodies', async () => {
    jest.spyOn(AzureCliCredential.prototype, 'getToken').mockResolvedValue({ token: 'synthetic-test-token', expiresOnTimestamp: 0 });
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('private-response-body', { status: 429, headers: { 'retry-after': '12' } }));
    const transport = azureCostTransport('test-tenant', scope);
    try { await transport(definition, `https://management.azure.com${scope}/providers/Microsoft.CostManagement/query`); throw new Error('Expected rejection'); }
    catch (error: any) {
        expect(error.statusCode).toBe(429);
        expect(error.response.headers.get('retry-after')).toBe('12');
        expect(error.message).not.toContain('private-response-body');
    }
});
