import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { saveToCabinet } from './obsidian-note-creator';
import browser from './browser-polyfill';
import * as clipboardUtils from './clipboard-utils';
import * as browserDetection from './browser-detection';

describe('saveToCabinet', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		// By default in unit tests, local auto-detection returns null unless explicitly mocked
		vi.spyOn(browserDetection, 'detectCabinetApiUrl').mockResolvedValue(null);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	test('saves to remote/local HTTP API when cabinetUrl is provided', async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			statusText: 'OK',
		});
		global.fetch = mockFetch;

		const result = await saveToCabinet(
			'# Test Content',
			{ type: 'Clipping', title: 'Test Note' },
			'Test Note',
			'articles',
			'Main/Room1',
			'http://localhost:4000'
		);

		expect(result).toBe(true);
		expect(mockFetch).toHaveBeenCalledTimes(1);
		const [url, options] = mockFetch.mock.calls[0];
		expect(url).toBe('http://localhost:4000/api/clip');
		expect(options.method).toBe('POST');
		expect(options.credentials).toBe('include');
		expect(JSON.parse(options.body)).toEqual({
			file: 'Room1/articles/Test Note',
			markdown: '---\n"type": "Clipping"\n"title": "Test Note"\n---\n# Test Content',
		});
	});

	test('saves via cabinet:// protocol when cabinetUrl is empty', async () => {
		const sendMessageSpy = vi.spyOn(browser.runtime, 'sendMessage').mockResolvedValue({ success: true });
		const copySpy = vi.spyOn(clipboardUtils, 'copyToClipboard').mockResolvedValue(true);

		const result = await saveToCabinet(
			'# Test Content',
			{ type: 'Clipping', title: 'Protocol Test' },
			'Protocol Test',
			'saved-clips',
			'MyVault/Work',
			'',
			'---\ntitle: Protocol Test\n---\n# Test Content'
		);

		expect(result).toBe(true);
		expect(copySpy).toHaveBeenCalledWith('---\ntitle: Protocol Test\n---\n# Test Content');
		expect(sendMessageSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'openCabinetUrl',
				url: expect.stringMatching(/^cabinet:\/\/new\?/)
			})
		);

		const callArg = sendMessageSpy.mock.calls[0]?.[0] as any;
		const sentUrl = callArg?.url;
		const urlObj = new URL(sentUrl);
		expect(urlObj.protocol).toBe('cabinet:');
		expect(urlObj.searchParams.get('clipboard')).toBe('true');
		expect(urlObj.searchParams.get('name')).toBe('Protocol Test');
		expect(urlObj.searchParams.get('file')).toBe('Work/saved-clips/Protocol Test');
	});

	test('falls back to URL content parameter if clipboard write fails', async () => {
		const sendMessageSpy = vi.spyOn(browser.runtime, 'sendMessage').mockResolvedValue({ success: true });
		vi.spyOn(clipboardUtils, 'copyToClipboard').mockResolvedValue(false);

		const result = await saveToCabinet(
			'# Direct Content',
			{ type: 'Clipping' },
			'Note Without Clipboard',
			'',
			'',
			'',
			'# Direct Content'
		);

		expect(result).toBe(true);
		expect(sendMessageSpy).toHaveBeenCalledTimes(1);
		const callArg = sendMessageSpy.mock.calls[0]?.[0] as any;
		const sentUrl = callArg?.url;
		const urlObj = new URL(sentUrl);
		expect(urlObj.searchParams.get('content')).toBe('# Direct Content');
		expect(urlObj.searchParams.get('clipboard')).toBeNull();
	});

	test('auto-routes via clip import when running in Cabinet browser / local daemon is detected', async () => {
		vi.spyOn(browserDetection, 'detectCabinetApiUrl').mockResolvedValue('http://127.0.0.1:4000');

		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			statusText: 'OK',
		});
		global.fetch = mockFetch;

		const result = await saveToCabinet(
			'# Auto Detected',
			{ type: 'Clipping' },
			'Article Inside Cabinet',
			'Inbox',
			'Cabinet',
			'' // cabinetUrl is empty
		);

		expect(result).toBe(true);
		expect(mockFetch).toHaveBeenCalledTimes(1);
		const [url, options] = mockFetch.mock.calls[0];
		// Root cabinet "Cabinet" should not be prefixed; path should be Inbox/Article Inside Cabinet
		expect(url).toBe('http://127.0.0.1:4000/api/clip');
		expect(options.method).toBe('POST');
		expect(JSON.parse(options.body).file).toBe('Inbox/Article Inside Cabinet');
	});

	test('passes full Markdown to the clip import API', async () => {
		const mockFetch = vi.fn().mockResolvedValue({ ok: true });
		global.fetch = mockFetch;
		const markdown = '---\ntitle: Article\ntags:\n  - clipping\n---\n# Content';
		expect(await saveToCabinet('# Content', { title: 'Article' }, 'Article', 'Inbox', '', 'http://localhost:4000', markdown)).toBe(true);
		expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({ file: 'Inbox/Article', markdown });
	});

	test('reports failed protocol handoff instead of claiming a successful save', async () => {
		vi.spyOn(browser.runtime, 'sendMessage').mockResolvedValue({ success: false, error: 'No active tab found' });
		vi.spyOn(clipboardUtils, 'copyToClipboard').mockResolvedValue(true);
		expect(await saveToCabinet('# Content', {}, 'Article', 'Inbox', '')).toBe(false);
	});

	test('does not fall back to protocol after a rejected API import', async () => {
		global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 403, statusText: 'Forbidden' });
		const sendMessageSpy = vi.spyOn(browser.runtime, 'sendMessage');
		expect(await saveToCabinet('# Content', {}, 'Article', 'Inbox', '', 'http://localhost:4000')).toBe(false);
		expect(sendMessageSpy).not.toHaveBeenCalled();
	});

	test('preserves relative folderPath when root cabinet is selected without rooms', async () => {
		const sendMessageSpy = vi.spyOn(browser.runtime, 'sendMessage').mockResolvedValue({ success: true });
		vi.spyOn(clipboardUtils, 'copyToClipboard').mockResolvedValue(true);

		const result = await saveToCabinet(
			'# Root Cabinet Clip',
			{ type: 'Clipping' },
			'Inbox Article',
			'Inbox',
			'PersonalCabinet',
			''
		);

		expect(result).toBe(true);
		const callArg = sendMessageSpy.mock.calls[0]?.[0] as any;
		const sentUrl = callArg?.url;
		const urlObj = new URL(sentUrl);
		// With root cabinet "PersonalCabinet", file should be Inbox/Inbox Article, not PersonalCabinet/Inbox/...
		expect(urlObj.searchParams.get('file')).toBe('Inbox/Inbox Article');
		expect(urlObj.searchParams.get('path')).toBe('Inbox/');
	});
});
