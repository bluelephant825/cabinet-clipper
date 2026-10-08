import { afterEach, expect, test, vi } from 'vitest';
import browser from './browser-polyfill';
import { loadSettings } from './storage-utils';

const provider = { id: 'first', name: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models/{model-id}:generateContent', apiKey: 'test-key' };
const model = { id: 'model-first', name: 'Gemini Flash', providerId: 'first', providerModelId: 'gemini-3.8-flash', enabled: true };

afterEach(() => vi.restoreAllMocks());

test('consolidates identical providers and models with different IDs while preserving selection and references', async () => {
	vi.spyOn(browser.storage.sync, 'get').mockResolvedValue({
		migrationVersion: 1,
		interpreter_settings: {
			providers: [provider, { ...provider, id: 'duplicate' }],
			models: [model, { ...model, id: 'model-duplicate', providerId: 'duplicate' }],
			interpreterModel: 'model-duplicate'
		}
	});
	const settings = await loadSettings();
	expect(settings.providers).toEqual([provider]);
	expect(settings.models).toEqual([model]);
	expect(settings.interpreterModel).toBe('model-first');
});

test('keeps distinct credentials, named copies, and enabled states', async () => {
	const providers = [provider, { ...provider, id: 'other-key', apiKey: 'different-test-key' }, { ...provider, id: 'copy', name: 'Google Gemini (copy)' }];
	const models = [model, { ...model, id: 'copy-model', name: 'Gemini Flash (copy)' }, { ...model, id: 'disabled-model', enabled: false }];
	vi.spyOn(browser.storage.sync, 'get').mockResolvedValue({ migrationVersion: 1, interpreter_settings: { providers, models } });
	const settings = await loadSettings();
	expect(settings.providers).toEqual(providers);
	expect(settings.models).toEqual(models);
});
