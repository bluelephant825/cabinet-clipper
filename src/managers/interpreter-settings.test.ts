import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import browser from '../utils/browser-polyfill';
import { generalSettings } from '../utils/storage-utils';
import { getPresetProviders, initializeInterpreterSettings } from './interpreter-settings';

vi.mock('../utils/i18n', () => ({ getMessage: (key: string) => key, translatePage: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../icons/icons', () => ({ initializeIcons: vi.fn() }));

const bundled = JSON.parse(readFileSync(new URL('../../providers.json', import.meta.url), 'utf8'));
const { JSDOM } = require('jsdom');
let dom: any;

beforeEach(() => {
	dom = new JSDOM(readFileSync(new URL('../settings.html', import.meta.url), 'utf8'));
	for (const key of ['window', 'document', 'FormData', 'Event', 'HTMLElement']) vi.stubGlobal(key, dom.window[key]);
	vi.stubGlobal('alert', vi.fn());
	vi.spyOn(browser.storage.sync, 'get').mockResolvedValue({ migrationVersion: 1 });
	vi.spyOn(browser.storage.sync, 'set').mockResolvedValue(undefined);
	vi.spyOn(browser.storage.local, 'get').mockResolvedValue({ provider_presets: { ...bundled, version: '2020.01.01', 'google-gemini': { ...bundled['google-gemini'], popularModels: [{ id: 'old', name: 'Old model' }] } } });
	vi.stubGlobal('fetch', vi.fn(async (url) => ({ ok: true, json: async () => String(url).startsWith('chrome-extension:') ? bundled : { ...bundled, version: '2020.01.01', 'google-gemini': { ...bundled['google-gemini'], popularModels: [{ id: 'old', name: 'Old model' }] } } })));
});

afterEach(() => {
	dom.window.close();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

async function clickAndWait(selector: string) {
	document.querySelector<HTMLButtonElement>(selector)!.click();
	await vi.waitFor(() => expect(document.querySelector<HTMLElement>(selector.includes('add-provider') ? '#provider-modal' : '#model-modal')?.style.display).toBe('flex'));
}

test('uses newer bundled Gemini presets instead of stale upstream or cached presets', async () => {
	const presets = await getPresetProviders();
	expect(presets['google-gemini'].popularModels).toEqual(bundled['google-gemini'].popularModels);
	expect(presets['google-gemini'].baseUrl).toBe(bundled['google-gemini'].baseUrl);
});

test('keeps bundled presets usable when the upstream server is unavailable', async () => {
	vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 10 * 60 * 1000);
	vi.mocked(fetch).mockRejectedValue(new Error('Offline'));
	const presets = await getPresetProviders();
	expect(presets['google-gemini'].popularModels).toEqual(bundled['google-gemini'].popularModels);
});

test('reinitialization and rapid saves create only one provider, and reopening does not accumulate change handlers', async () => {
	await initializeInterpreterSettings();
	await initializeInterpreterSettings();
	await clickAndWait('#add-provider-btn');
	const preset = document.querySelector<HTMLSelectElement>('#provider-preset')!;
	preset.value = 'google-gemini';
	preset.dispatchEvent(new Event('change'));
	document.querySelector<HTMLInputElement>('#provider-api-key')!.value = 'test-key';
	const save = document.querySelector<HTMLButtonElement>('.provider-confirm-btn')!;
	save.click();
	save.click();
	await vi.waitFor(() => expect(document.getElementById('provider-modal')!.style.display).toBe('none'));
	expect(generalSettings.providers).toHaveLength(1);

	await clickAndWait('#add-provider-btn');
	preset.value = 'google-gemini';
	preset.dispatchEvent(new Event('change'));
	document.querySelector<HTMLInputElement>('#provider-api-key')!.value = 'test-key';
	document.querySelector<HTMLButtonElement>('.provider-confirm-btn')!.click();
	await vi.waitFor(() => expect(document.getElementById('provider-modal')!.style.display).toBe('none'));
	expect(generalSettings.providers).toHaveLength(1);
});

test('reopening the model dialog and saving the same model does not duplicate it', async () => {
	await initializeInterpreterSettings();
	generalSettings.providers = [{ id: 'gemini', name: 'Google Gemini', baseUrl: bundled['google-gemini'].baseUrl, apiKey: 'test-key' }];
	for (let i = 0; i < 2; i++) {
		await clickAndWait('#add-model-btn');
		const select = document.querySelector<HTMLSelectElement>('#model-provider')!;
		select.value = 'gemini';
		select.dispatchEvent(new Event('change'));
		const radio = document.querySelector<HTMLInputElement>('input[value="gemini-3.8-flash"]')!;
		expect(radio.checked).toBe(true);
		expect(document.querySelector<HTMLInputElement>('[name="providerModelId"]')!.value).toBe('gemini-3.8-flash');
		radio.checked = true;
		radio.dispatchEvent(new Event('change', { bubbles: true }));
		document.querySelector<HTMLButtonElement>('.model-confirm-btn')!.click();
		await vi.waitFor(() => expect(document.getElementById('model-modal')!.style.display).toBe('none'));
	}
	expect(generalSettings.models).toHaveLength(1);
	expect(generalSettings.models[0].providerModelId).toBe('gemini-3.8-flash');
});
