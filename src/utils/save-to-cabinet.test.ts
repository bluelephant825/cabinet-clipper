import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { saveToCabinet } from './obsidian-note-creator';
import browser from './browser-polyfill';
import * as clipboardUtils from './clipboard-utils';

describe('saveToCabinet', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
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
		expect(url).toBe('http://localhost:4000/api/pages/Room1/articles/Test%20Note');
		expect(options.method).toBe('PUT');
		expect(JSON.parse(options.body)).toEqual({
			content: '# Test Content',
			frontmatter: { type: 'Clipping', title: 'Test Note' },
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
});
