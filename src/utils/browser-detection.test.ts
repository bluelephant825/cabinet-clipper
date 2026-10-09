import { afterEach, beforeEach, expect, test, vi } from 'vitest';

beforeEach(() => vi.resetModules());
afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

test.each(['external Chrome', 'Cabinet Chromium'])('discovers the native API in %s without any Cabinet tab', async () => {
	const { default: browser } = await import('./browser-polyfill');
	vi.spyOn(browser.runtime, 'sendNativeMessage').mockResolvedValue({ success: true, apiUrl: 'http://127.0.0.1:54321', version: 1 });
	vi.spyOn(browser.tabs, 'query').mockResolvedValue([]);
	const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'ok', dataDir: '/cabinet', installKind: 'desktop' }) });
	vi.stubGlobal('fetch', fetchMock);
	const { detectCabinetApiUrl } = await import('./browser-detection');
	expect(await detectCabinetApiUrl()).toBe('http://127.0.0.1:54321');
	expect(browser.runtime.sendNativeMessage).toHaveBeenCalledWith('ai.cabinet.clipper', { action: 'discover', version: 1 });
});

test('fresh native discovery wins over both a stale configured URL and cached origin after restart', async () => {
	const { default: browser } = await import('./browser-polyfill');
	vi.spyOn(browser.runtime, 'sendNativeMessage').mockResolvedValueOnce({ success: true, apiUrl: 'http://127.0.0.1:54321', version: 1 }).mockResolvedValueOnce({ success: true, apiUrl: 'http://127.0.0.1:54322', version: 1 });
	vi.spyOn(browser.tabs, 'query').mockResolvedValue([]);
	vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'ok', dataDir: '/cabinet', installKind: 'desktop' }) }));
	const { detectCabinetApiUrl } = await import('./browser-detection');
	expect(await detectCabinetApiUrl()).toBe('http://127.0.0.1:54321');
	expect(await detectCabinetApiUrl(1000, 'http://127.0.0.1:52658')).toBe('http://127.0.0.1:54322');
});

test('discovers Cabinet on a nonstandard port from an open loopback tab', async () => {
	const { default: browser } = await import('./browser-polyfill');
	vi.spyOn(browser.tabs, 'query').mockResolvedValue([{ url: 'http://127.0.0.1:54321/' }] as any);
	const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'ok', dataDir: '/cabinet', installKind: 'desktop', stale: false }) });
	vi.stubGlobal('fetch', fetchMock);
	const { detectCabinetApiUrl } = await import('./browser-detection');
	expect(await detectCabinetApiUrl()).toBe('http://127.0.0.1:54321');
	expect(fetchMock.mock.calls[0][0]).toBe('http://127.0.0.1:54321/api/health');
});

test('rejects unrelated services even when they return HTTP 200', async () => {
	const { default: browser } = await import('./browser-polyfill');
	vi.spyOn(browser.tabs, 'query').mockResolvedValue([]);
	vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'ok' }) }));
	const { detectCabinetApiUrl } = await import('./browser-detection');
	expect(await detectCabinetApiUrl()).toBeNull();
});

test('retries discovery after Cabinet was initially unavailable', async () => {
	const { default: browser } = await import('./browser-polyfill');
	vi.spyOn(browser.tabs, 'query').mockResolvedValue([]);
	const fetchMock = vi.fn().mockRejectedValue(new Error('Unavailable'));
	vi.stubGlobal('fetch', fetchMock);
	const { detectCabinetApiUrl } = await import('./browser-detection');
	expect(await detectCabinetApiUrl()).toBeNull();
	fetchMock.mockResolvedValue({ ok: true, json: async () => ({ status: 'ok', dataDir: '/cabinet', installKind: 'desktop', stale: false }) });
	expect(await detectCabinetApiUrl()).toBe('http://127.0.0.1:4000');
});
