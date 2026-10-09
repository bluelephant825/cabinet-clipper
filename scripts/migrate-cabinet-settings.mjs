import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import LZString from 'lz-string';

const NATIVE_ORIGIN = 'chrome-extension://bbddlgefpahcbpcaikiacdpghikifabf/';

export function prepareStorageMigration(backup) {
	if (!backup || typeof backup !== 'object' || Array.isArray(backup)) throw new Error('Invalid settings backup');
	const { __cabinetLocalStorage: localData = {}, ...syncData } = backup;
	if (!localData || typeof localData !== 'object' || Array.isArray(localData)) throw new Error('Invalid local settings');
	if (syncData.template_list !== undefined && (!Array.isArray(syncData.template_list) || !syncData.template_list.every(id => typeof id === 'string'))) throw new Error('Invalid template list');
	for (const id of syncData.template_list || []) {
		const key = `template_${id}`;
		const template = syncData[key];
		if (template && !(Array.isArray(template) && template.every(chunk => typeof chunk === 'string'))) {
			const compressed = LZString.compressToUTF16(JSON.stringify(template));
			syncData[key] = Array.from({ length: Math.ceil(compressed.length / 8000) }, (_, index) => compressed.slice(index * 8000, (index + 1) * 8000));
		}
	}
	if (syncData.general_settings?.cabinetUrl) {
		try {
			const url = new URL(syncData.general_settings.cabinetUrl);
			if (['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) syncData.general_settings = { ...syncData.general_settings, cabinetUrl: '' };
		} catch {}
	}
	return { syncData, localData };
}

export function canonical(value) {
	if (Array.isArray(value)) return value.map(canonical);
	if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
	return value;
}

async function main() {
	const [backupPath, apiOrigin, targetId] = process.argv.slice(2);
	const url = new URL(apiOrigin);
	if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password || url.pathname !== '/' || url.search || url.hash || !targetId) throw new Error('Invalid migration target');
	const tabsResponse = await fetch(`${url.origin}/api/browser/tabs`);
	if (!tabsResponse.ok) throw new Error('Browser unavailable');
	const { tabs } = await tabsResponse.json();
	if (!tabs.some(tab => tab.id === targetId && tab.url.startsWith(`${NATIVE_ORIGIN}settings.html`))) throw new Error('The target is not the pinned clipper settings page');
	await fs.chmod(backupPath, 0o600);
	const { syncData, localData } = prepareStorageMigration(JSON.parse(await fs.readFile(backupPath, 'utf8')));
	const expected = createHash('sha256').update(JSON.stringify(canonical({ sync: syncData, local: localData }))).digest('hex');
	const expression = `(async () => {
		if (chrome.runtime.id !== 'bbddlgefpahcbpcaikiacdpghikifabf') throw new Error('Wrong extension');
		const syncData = JSON.parse(${JSON.stringify(JSON.stringify(syncData))});
		const localData = JSON.parse(${JSON.stringify(JSON.stringify(localData))});
		await chrome.storage.sync.set(syncData);
		await chrome.storage.local.set(localData);
		const actual = { sync: await chrome.storage.sync.get(Object.keys(syncData)), local: await chrome.storage.local.get(Object.keys(localData)) };
		const canonical = ${canonical.toString()};
		const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(canonical(actual))));
		return { digest: Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('') };
	})()`;
	const response = await fetch(`${url.origin}/api/browser/tabs/${encodeURIComponent(targetId)}/evaluate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expression }), signal: AbortSignal.timeout(30000) });
	if (!response.ok) throw new Error('Migration request failed');
	const body = await response.json();
	if (body.result?.digest !== expected) throw new Error('Migration verification failed');
	console.log(JSON.stringify({ verified: true, templates: syncData.template_list?.length || 0, providers: syncData.interpreter_settings?.providers?.length || 0, models: syncData.interpreter_settings?.models?.length || 0, localKeys: Object.keys(localData).length }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main().catch(() => {
		console.error('Settings migration failed. Existing extension data has not been removed.');
		process.exitCode = 1;
	});
}
