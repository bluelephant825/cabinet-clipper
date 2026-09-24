import browser from './browser-polyfill';
import { sanitizeFileName } from '../utils/string-utils';
import { generateFrontmatter as generateFrontmatterCore, generateFrontmatterObject as generateFrontmatterObjectCore } from './shared';
import { Template, Property } from '../types/types';
import { generalSettings, incrementStat } from './storage-utils';
import { copyToClipboard } from './clipboard-utils';
import { getMessage } from './i18n';

export async function generateFrontmatter(properties: Property[]): Promise<string> {
	const typeMap: Record<string, string> = {};
	for (const pt of generalSettings.propertyTypes) {
		typeMap[pt.name] = pt.type;
	}
	return generateFrontmatterCore(properties, typeMap);
}

export async function generateFrontmatterObject(properties: Property[]): Promise<Record<string, any>> {
	const typeMap: Record<string, string> = {};
	for (const pt of generalSettings.propertyTypes) {
		typeMap[pt.name] = pt.type;
	}
	return generateFrontmatterObjectCore(properties, typeMap);
}

function openObsidianUrl(url: string): void {
	browser.runtime.sendMessage({
		action: "openObsidianUrl",
		url: url
	}).catch((error) => {
		console.error('Error opening Obsidian URL via background script:', error);
		window.open(url, '_blank');
	});
}

async function tryClipboardWrite(fileContent: string, obsidianUrl: string): Promise<void> {
	const success = await copyToClipboard(fileContent);
	
	if (success) {
		// &clipboard tells Obsidian to read data from clipboard instead of the content param.
		// content is a fallback shown only if Obsidian can't access the clipboard (e.g. on Linux).
		obsidianUrl += `&clipboard&content=${encodeURIComponent(getMessage('clipboardError', 'https://help.obsidian.md/web-clipper/troubleshoot'))}`;
		openObsidianUrl(obsidianUrl);
		console.log('Obsidian URL:', obsidianUrl);
	} else {
		console.error('All clipboard methods failed, falling back to URI method');
		// Final fallback: use URI method with actual content (same as legacy mode)
		// Note: We don't add &clipboard here since we're bypassing the clipboard entirely
		obsidianUrl += `&content=${encodeURIComponent(fileContent)}`;
		openObsidianUrl(obsidianUrl);
		console.log('Obsidian URL (URI fallback):', obsidianUrl);
	}
}

export async function saveToObsidian(
	fileContent: string,
	noteName: string,
	path: string,
	vault: string,
	behavior: Template['behavior'],
): Promise<void> {
	let obsidianUrl: string;

	const isDailyNote = behavior === 'append-daily' || behavior === 'prepend-daily';

	if (isDailyNote) {
		obsidianUrl = `obsidian://daily?`;
	} else {
		// Ensure path ends with a slash
		if (path && !path.endsWith('/')) {
			path += '/';
		}

		const formattedNoteName = sanitizeFileName(noteName);
		obsidianUrl = `obsidian://new?file=${encodeURIComponent(path + formattedNoteName)}`;
	}

	if (behavior.startsWith('append')) {
		obsidianUrl += '&append=true';
	} else if (behavior.startsWith('prepend')) {
		obsidianUrl += '&prepend=true';
	} else if (behavior === 'overwrite') {
		obsidianUrl += '&overwrite=true';
	}

	const vaultParam = vault ? `&vault=${encodeURIComponent(vault)}` : '';
	obsidianUrl += vaultParam;

	// Add silent parameter if silentOpen is enabled
	if (generalSettings.silentOpen) {
		obsidianUrl += '&silent=true';
	}

	if (generalSettings.legacyMode) {
		// Use the URI method
		obsidianUrl += `&content=${encodeURIComponent(fileContent)}`;
		console.log('Obsidian URL:', obsidianUrl);
		openObsidianUrl(obsidianUrl);
	} else {
		// Try to copy to clipboard with fallback mechanisms
		await tryClipboardWrite(fileContent, obsidianUrl);
	}
}

function openCabinetUrl(url: string): void {
	browser.runtime.sendMessage({
		action: "openCabinetUrl",
		url: url
	}).catch((error) => {
		console.error('Error opening Cabinet URL via background script:', error);
		window.open(url, '_blank');
	});
}

export async function saveToCabinet(
	content: string,
	frontmatter: Record<string, any>,
	noteName: string,
	path: string,
	vault: string,
	cabinetUrl?: string,
	fullMarkdownContent?: string
): Promise<boolean> {
	// Format folder path according to vault/room hierarchy
	let folderPath = path.trim();
	if (vault.trim()) {
		const vaultSegments = vault.trim().split('/');
		if (vaultSegments.length > 1) {
			// Drop the root cabinet name (first segment)
			const roomPath = vaultSegments.slice(1).join('/');
			folderPath = roomPath ? `${roomPath}/${folderPath}` : folderPath;
		} else {
			folderPath = `${vault.trim()}/${folderPath}`;
		}
	}
	if (folderPath && !folderPath.endsWith('/')) {
		folderPath += '/';
	}
	if (folderPath && folderPath.startsWith('/')) {
		folderPath = folderPath.substring(1);
	}

	const formattedNoteName = sanitizeFileName(noteName);
	const fullPath = `${folderPath}${formattedNoteName}`;

	// If Cabinet API URL is configured, use HTTP PUT
	if (cabinetUrl && cabinetUrl.trim() !== '') {
		try {
			const baseUrl = cabinetUrl.replace(/\/+$/, '');
			const pathSegments = fullPath.split('/').map(segment => encodeURIComponent(segment));
			const url = `${baseUrl}/api/pages/${pathSegments.join('/')}`;
			
			const response = await fetch(url, {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					content,
					frontmatter
				}),
			});

			if (!response.ok) {
				console.error(`Failed to save to Cabinet API: ${response.status} ${response.statusText}`);
				return false;
			}
			
			return true;
		} catch (error) {
			console.error('Error saving to Cabinet API:', error);
			return false;
		}
	}

	// Standalone Cabinet App: Save via cabinet:// protocol
	try {
		const noteBody = fullMarkdownContent !== undefined ? fullMarkdownContent : content;
		const params = new URLSearchParams();
		if (vault.trim()) {
			params.append('vault', vault.trim());
		}
		if (folderPath) {
			params.append('path', folderPath);
		}
		params.append('name', formattedNoteName);
		params.append('file', fullPath);

		if (generalSettings.silentOpen) {
			params.append('silent', 'true');
		}

		const success = await copyToClipboard(noteBody);
		if (success) {
			params.append('clipboard', 'true');
		} else {
			params.append('content', noteBody);
		}

		const cabinetUri = `cabinet://new?${params.toString()}`;
		openCabinetUrl(cabinetUri);
		return true;
	} catch (error) {
		console.error('Error saving to Cabinet via protocol:', error);
		return false;
	}
}