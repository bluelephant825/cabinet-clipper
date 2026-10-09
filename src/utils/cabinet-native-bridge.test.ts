import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { afterEach, expect, test, vi } from 'vitest';
import browser from './browser-polyfill';
import { discoverCabinetNativeApi } from './cabinet-native-bridge';

afterEach(() => vi.restoreAllMocks());

test('the pinned manifest identity matches the native host allowlist', () => {
	const manifest = JSON.parse(readFileSync(new URL('../manifest.chrome.json', import.meta.url), 'utf8'));
	const id = createHash('sha256').update(Buffer.from(manifest.key, 'base64')).digest('hex').slice(0, 32).replace(/[0-9a-f]/g, x => String.fromCharCode(97 + parseInt(x, 16)));
	expect(id).toBe('bbddlgefpahcbpcaikiacdpghikifabf');
	expect(manifest.permissions).toContain('nativeMessaging');
});

test.each(['https://remote.example', 'http://127.0.0.1.evil.example', 'http://user:pass@127.0.0.1:54321', 'http://127.0.0.1:54321/arbitrary', 'http://127.0.0.1:54321?query=1', 'file:///tmp/cabinet', 'not a URL'])('rejects unsafe or non-origin native responses: %s', async (apiUrl) => {
	vi.spyOn(browser.runtime, 'sendNativeMessage').mockResolvedValue({ success: true, version: 1, apiUrl });
	expect(await discoverCabinetNativeApi()).toBeNull();
});

test('an unavailable native host returns no connection, not fabricated success', async () => {
	vi.spyOn(browser.runtime, 'sendNativeMessage').mockRejectedValue(new Error('Host missing'));
	expect(await discoverCabinetNativeApi()).toBeNull();
});
