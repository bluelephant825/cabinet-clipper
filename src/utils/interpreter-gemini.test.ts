import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendToLLM, resetLastRequestTime, testProviderOrModelConnection, parseLLMResponse } from './interpreter';
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

	test('targets native generateContent endpoint and attaches X-goog-api-key', async () => {
		generalSettings.providers = [
			{
				id: 'google-gemini',
				name: 'Google Gemini',
				apiKey: 'test-gemini-key',
				apiKeyRequired: true,
				baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models/{model-id}:generateContent',
			}
		];

		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			text: async () => JSON.stringify({
				candidates: [
					{
						content: {
							parts: [
								{
									text: JSON.stringify({
										prompts_responses: {
											prompt_1: 'Summary of the page'
										}
									})
								}
							]
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
		expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
		expect(options.headers['X-goog-api-key']).toBe('test-gemini-key');
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
				baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models/{model-id}:generateContent',
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
			baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models/{model-id}:generateContent',
			apiKey: '',
			apiKeyRequired: true
		});

		expect(result.success).toBe(false);
		expect(result.message).toContain('API key is required');
	});

	test('successfully tests connection and measures latency with native Gemini endpoint', async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			text: async () => JSON.stringify({
				candidates: [{ content: { parts: [{ text: 'OK' }] } }]
			})
		});
		global.fetch = mockFetch;

		const result = await testProviderOrModelConnection({
			id: 'gemini',
			name: 'Google Gemini',
			baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models/{model-id}:generateContent',
			apiKey: 'valid-gemini-key',
			apiKeyRequired: true
		}, 'gemini-2.5-flash');

		expect(result.success).toBe(true);
		expect(result.message).toContain('Connected successfully');
		expect(result.latency).toBeDefined();
		expect(mockFetch).toHaveBeenCalledTimes(1);

		const [url, options] = mockFetch.mock.calls[0];
		expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
		expect(options.headers['x-goog-api-key']).toBe('valid-gemini-key');
	});

	test('defaults to gemini-3.8-flash when no model is specified', async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			text: async () => JSON.stringify({
				candidates: [{ content: { parts: [{ text: 'OK' }] } }]
			})
		});
		global.fetch = mockFetch;

		await testProviderOrModelConnection({
			id: 'gemini',
			name: 'Google Gemini',
			baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models/{model-id}:generateContent',
			apiKey: 'valid-gemini-key',
			apiKeyRequired: true
		});

		const [url] = mockFetch.mock.calls[0];
		expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent');
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
			baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models/{model-id}:generateContent',
			apiKey: 'bad-key',
			apiKeyRequired: true
		});

		expect(result.success).toBe(false);
		expect(result.message).toContain('Authentication failed (401)');
		expect(result.message).toContain('aistudio.google.com/apikey');
	});

	test('automatically strips corrupted /openai/ from Gemini baseUrl', async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			text: async () => JSON.stringify({
				candidates: [{ content: { parts: [{ text: 'OK' }] } }]
			})
		});
		global.fetch = mockFetch;

		const result = await testProviderOrModelConnection({
			id: 'gemini',
			name: 'Google Gemini',
			baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/models/{model-id}:generateContent',
			apiKey: 'valid-gemini-key',
			apiKeyRequired: true
		}, 'gemini-2.5-flash');

		expect(result.success).toBe(true);
		const [url] = mockFetch.mock.calls[0];
		expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
	});
});

describe('parseLLMResponse quote handling', () => {
	const promptVariables = [
		{ key: 'prompt_1', prompt: 'Summarize this page' }
	];

	test('does not leave escaped double quotes in response text', () => {
		const rawResponse = `\`\`\`json
{
  "prompts_responses": {
    "prompt_1": "Researchers at OpenAI used 10,000 autonomous AI agents to prove a \\"singularity\\" exists in the Navier-Stokes equations, which describe fluid flow."
  }
}
\`\`\``;

		const result = parseLLMResponse(rawResponse, promptVariables);
		expect(result.promptResponses).toHaveLength(1);
		expect(result.promptResponses[0].user_response).toBe(
			'Researchers at OpenAI used 10,000 autonomous AI agents to prove a "singularity" exists in the Navier-Stokes equations, which describe fluid flow.'
		);
		expect(result.promptResponses[0].user_response).not.toContain('\\"');
	});

	test('handles direct keys without prompts_responses wrapper', () => {
		const rawResponse = `{"prompt_1": "AI solved a \\"singularity\\" problem."}`;
		const result = parseLLMResponse(rawResponse, promptVariables);
		expect(result.promptResponses[0].user_response).toBe('AI solved a "singularity" problem.');
	});

	test('handles conversational preamble before JSON block', () => {
		const rawResponse = `Here is the requested summary:\n{"prompts_responses": {"prompt_1": "She said \\"hello\\""}}\nHope this helps!`;
		const result = parseLLMResponse(rawResponse, promptVariables);
		expect(result.promptResponses[0].user_response).toBe('She said "hello"');
	});

	test('handles fallback extraction when JSON contains trailing commas or issues', () => {
		const rawResponse = `{"prompts_responses": {"prompt_1": "Proved a \\"singularity\\" exists", }}`;
		const result = parseLLMResponse(rawResponse, promptVariables);
		expect(result.promptResponses[0].user_response).toBe('Proved a "singularity" exists');
	});
});

