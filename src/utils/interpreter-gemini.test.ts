import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendToLLM, resetLastRequestTime, testProviderOrModelConnection } from './interpreter';
import { generalSettings } from './storage-utils';

describe('sendToLLM with Google Gemini', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		resetLastRequestTime();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		resetLastRequestTime();
	});

	test('normalizes baseUrl to /v1beta/openai/ and attaches x-goog-api-key', async () => {
		generalSettings.providers = [
			{
				id: 'google-gemini',
				name: 'Google Gemini',
				apiKey: 'test-gemini-key',
				apiKeyRequired: true,
				baseUrl: 'https://generativelanguage.googleapis.com/v1beta/chat/completions',
			}
		];

		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			text: async () => JSON.stringify({
				choices: [
					{
						message: {
							content: JSON.stringify({
								prompts_responses: {
									prompt_1: 'Summary of the page'
								}
							})
						}
					}
				]
			}),
		});
		global.fetch = mockFetch;

		const modelConfig = {
			id: 'gemini-model',
			providerId: 'google-gemini',
			providerModelId: 'gemini-2.5-flash',
			name: 'Gemini 2.5 Flash',
			enabled: true
		};

		const promptVariables = [
			{ key: 'prompt_1', prompt: 'Summarize this page' }
		];

		const result = await sendToLLM('Context here', 'Content here', promptVariables, modelConfig);

		expect(mockFetch).toHaveBeenCalledTimes(1);
		const [url, options] = mockFetch.mock.calls[0];
		expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
		expect(options.headers['Authorization']).toBe('Bearer test-gemini-key');
		expect(options.headers['x-goog-api-key']).toBe('test-gemini-key');
		expect(result.promptResponses).toEqual([
			{ key: 'prompt_1', prompt: 'Summarize this page', user_response: 'Summary of the page' }
		]);
	});

	test('provides clear error message when 401 unauthenticated is received', async () => {
		generalSettings.providers = [
			{
				id: 'google-gemini',
				name: 'Google Gemini',
				apiKey: 'invalid-key',
				apiKeyRequired: true,
				baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
			}
		];

		const mockFetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 401,
			statusText: 'Unauthorized',
			text: async () => JSON.stringify({
				error: {
					code: 401,
					message: 'Request had invalid authentication credentials.',
					status: 'UNAUTHENTICATED'
				}
			}),
		});
		global.fetch = mockFetch;

		const modelConfig = {
			id: 'gemini-model',
			providerId: 'google-gemini',
			providerModelId: 'gemini-2.5-flash',
			name: 'Gemini 2.5 Flash',
			enabled: true
		};

		const promptVariables = [
			{ key: 'prompt_1', prompt: 'Summarize this' }
		];

		await expect(sendToLLM('Context', 'Content', promptVariables, modelConfig)).rejects.toThrow(
			/Google Gemini authentication failed \(401\)/
		);
	});
});

describe('testProviderOrModelConnection', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	test('fails early if required API key is missing', async () => {
		const result = await testProviderOrModelConnection({
			id: 'gemini',
			name: 'Google Gemini',
			baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
			apiKey: '',
			apiKeyRequired: true
		});

		expect(result.success).toBe(false);
		expect(result.message).toContain('API key is required');
	});

	test('successfully tests connection and measures latency', async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			text: async () => JSON.stringify({
				choices: [{ message: { content: 'OK' } }]
			})
		});
		global.fetch = mockFetch;

		const result = await testProviderOrModelConnection({
			id: 'gemini',
			name: 'Google Gemini',
			baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
			apiKey: 'valid-gemini-key',
			apiKeyRequired: true
		}, 'gemini-2.5-flash');

		expect(result.success).toBe(true);
		expect(result.message).toContain('Connected successfully');
		expect(result.latency).toBeDefined();
		expect(mockFetch).toHaveBeenCalledTimes(1);

		const [url, options] = mockFetch.mock.calls[0];
		expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
		expect(options.headers['x-goog-api-key']).toBe('valid-gemini-key');
		const body = JSON.parse(options.body);
		expect(body.model).toBe('gemini-2.5-flash');
	});

	test('returns informative error on 401 authentication failure', async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 401,
			statusText: 'Unauthorized',
			text: async () => JSON.stringify({
				error: {
					code: 401,
					message: 'Request had invalid authentication credentials.',
					status: 'UNAUTHENTICATED'
				}
			})
		});
		global.fetch = mockFetch;

		const result = await testProviderOrModelConnection({
			id: 'gemini',
			name: 'Google Gemini',
			baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
			apiKey: 'bad-key',
			apiKeyRequired: true
		});

		expect(result.success).toBe(false);
		expect(result.message).toContain('Authentication failed (401)');
		expect(result.message).toContain('aistudio.google.com/apikey');
	});
});

