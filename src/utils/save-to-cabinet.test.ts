import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { saveToCabinet } from './obsidian-note-creator';
import browser from './browser-polyfill';
import * as clipboardUtils from './clipboard-utils';
import * as browserDetection from './browser-detection';

function successfulImport() {
	return { ok: true, status: 200, json: async () => ({ ok: true, path: 'Inbox/Saved Article' }) };
}

describe('saveToCabinet', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		// By default in unit tests, local auto-detection returns null unless explicitly mocked
		vi.spyOn(browserDetection, 'detectCabinetApiUrl').mockResolvedValue(null);
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(successfulImport()));
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	test('saves to remote/local HTTP API when cabinetUrl is provided', async () => {
		const result = await saveToCabinet('# Test Content', { type: 'Clipping', title: 'Test Note' }, 'Test Note', 'articles', 'Main/Room1', 'http://localhost:4000');
		expect(result).toBe(true);
		expect(fetch).toHaveBeenCalledTimes(1);
		const [url, options] = vi.mocked(fetch).mock.calls[0];
		expect(url).toBe('http://localhost:4000/api/clip');
		expect(options?.method).toBe('POST');
		expect(options?.credentials).toBe('include');
		expect(JSON.parse(options?.body as string)).toEqual({
			file: 'Room1/articles/Test Note',
			markdown: '---\n"type": "Clipping"\n"title": "Test Note"\n---\n# Test Content',
		});
	});

	test('never claims success from an unconfirmed protocol navigation', async () => {
		const sendMessageSpy = vi.spyOn(browser.runtime, 'sendMessage').mockResolvedValue({ success: true });
		const copySpy = vi.spyOn(clipboardUtils, 'copyToClipboard').mockResolvedValue(true);
		expect(await saveToCabinet('# Content', {}, 'Article', 'Inbox', '', '')).toBe(false);
		expect(sendMessageSpy).not.toHaveBeenCalled();
		expect(copySpy).not.toHaveBeenCalled();
		expect(fetch).not.toHaveBeenCalled();
	});

	test('auto-routes via clip import when running in Cabinet browser / local daemon is detected', async () => {
		vi.spyOn(browserDetection, 'detectCabinetApiUrl').mockResolvedValue('http://127.0.0.1:54321');
		const result = await saveToCabinet('# Auto Detected', { type: 'Clipping' }, 'Article Inside Cabinet', 'Inbox', 'Cabinet', '' // cabinetUrl is empty
		);
		expect(result).toBe(true);
		const [url, options] = vi.mocked(fetch).mock.calls[0];
		// Root cabinet "Cabinet" should not be prefixed; path should be Inbox/Article Inside Cabinet
		expect(url).toBe('http://127.0.0.1:54321/api/clip');
		expect(JSON.parse(options?.body as string).file).toBe('Inbox/Article Inside Cabinet');
	});

	test('replaces a stale loopback workaround URL with the freshly discovered native URL', async () => {
		vi.spyOn(browserDetection, 'detectCabinetApiUrl').mockResolvedValue('http://127.0.0.1:54322');
		expect(await saveToCabinet('# Content', {}, 'Article', 'Inbox', '', 'http://127.0.0.1:52658')).toBe(true);
		expect(browserDetection.detectCabinetApiUrl).toHaveBeenCalledWith(1000, 'http://127.0.0.1:52658');
		expect(vi.mocked(fetch).mock.calls[0][0]).toBe('http://127.0.0.1:54322/api/clip');
	});

	test('preserves an explicitly configured remote Cabinet target', async () => {
		expect(await saveToCabinet('# Content', {}, 'Article', 'Inbox', '', 'https://cabinet.example')).toBe(true);
		expect(browserDetection.detectCabinetApiUrl).not.toHaveBeenCalled();
		expect(vi.mocked(fetch).mock.calls[0][0]).toBe('https://cabinet.example/api/clip');
	});

	test('passes full Markdown to the clip import API', async () => {
		const markdown = '---\ntitle: Article\ntags:\n  - clipping\n---\n# Content';
		expect(await saveToCabinet('# Content', { title: 'Article' }, 'Article', 'Inbox', '', 'http://localhost:4000', markdown)).toBe(true);
		expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string)).toEqual({ file: 'Inbox/Article', markdown });
	});

	test.each([{}, { ok: true }, { ok: false, path: 'Inbox/Article' }, { ok: true, path: '' }])('requires an explicit saved-path acknowledgement: %j', async (body) => {
		vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => body } as Response);
		expect(await saveToCabinet('# Content', {}, 'Article', 'Inbox', '', 'http://localhost:4000')).toBe(false);
	});

	test('does not fall back to protocol after a rejected API import', async () => {
		vi.mocked(fetch).mockResolvedValue({ ok: false, status: 403, statusText: 'Forbidden' } as Response);
		const sendMessageSpy = vi.spyOn(browser.runtime, 'sendMessage');
		expect(await saveToCabinet('# Content', {}, 'Article', 'Inbox', '', 'http://localhost:4000')).toBe(false);
		expect(sendMessageSpy).not.toHaveBeenCalled();
	});

	test('does not retry an ambiguous failed POST that might already have saved', async () => {
		vi.mocked(fetch).mockRejectedValue(new Error('Connection lost'));
		expect(await saveToCabinet('# Content', {}, 'Article', 'Inbox', '', 'http://localhost:4000')).toBe(false);
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	test('preserves relative folderPath when root cabinet is selected without rooms', async () => {
		expect(await saveToCabinet('# Root Cabinet Clip', { type: 'Clipping' }, 'Inbox Article', 'Inbox', 'PersonalCabinet', 'http://localhost:4000')).toBe(true);
		// With root cabinet "PersonalCabinet", file should be Inbox/Inbox Article, not PersonalCabinet/Inbox/...
		expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string).file).toBe('Inbox/Inbox Article');
	});
});
