import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { compressToUTF16, decompressFromUTF16 } from 'lz-string';
import { createRequire } from 'node:module';

const { prepareStorageMigration, canonical } = createRequire(import.meta.url)('../../scripts/migrate-cabinet-settings.mjs');
import browser from './browser-polyfill';
import { exportAllSettings, importAllSettingsFromJson } from './import-export';
import { saveFile } from './file-utils';

vi.mock('../managers/template-manager', () => ({ templates: [], editingTemplateIndex: -1, saveTemplateSettings: vi.fn(), loadTemplates: vi.fn() }));
vi.mock('../managers/template-ui', () => ({ showTemplateEditor: vi.fn(), updateTemplateList: vi.fn() }));
vi.mock('../managers/property-types-manager', () => ({ addPropertyType: vi.fn(), updatePropertyTypesList: vi.fn() }));
vi.mock('./storage-utils', () => ({ generalSettings: { propertyTypes: [] }, loadSettings: vi.fn() }));
vi.mock('./import-modal', () => ({ showImportModal: vi.fn() }));
vi.mock('./file-utils', () => ({ saveFile: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./i18n', () => ({ getMessage: (key: string) => key }));

beforeEach(() => {
	vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));
	vi.stubGlobal('alert', vi.fn());
});
afterEach(() => {
	vi.restoreAllMocks();
	vi.clearAllMocks();
	vi.unstubAllGlobals();
});

test('migration round-trips provider settings, template chunks, local history, and highlights without logging secrets', async () => {
	const template = { id: 'default', name: 'Default', path: 'Inbox', noteContentFormat: '{{content}}' };
	const syncData = { migrationVersion: 1, template_list: ['default'], template_default: [compressToUTF16(JSON.stringify(template))], interpreter_settings: { providers: [{ id: 'provider', apiKey: 'fake-migration-secret' }], models: [{ id: 'model', providerId: 'provider' }] } };
	const localData = { clipHistory: [{ url: 'https://example.com/article' }], highlights: { article: ['highlight'] } };
	vi.spyOn(browser.storage.sync, 'get').mockResolvedValue(syncData);
	vi.spyOn(browser.storage.local, 'get').mockResolvedValue(localData);
	const syncSet = vi.spyOn(browser.storage.sync, 'set').mockResolvedValue(undefined);
	const localSet = vi.spyOn(browser.storage.local, 'set').mockResolvedValue(undefined);
	vi.spyOn(browser.storage.sync, 'clear').mockResolvedValue(undefined);
	const log = vi.spyOn(console, 'log').mockImplementation(() => {});
	await exportAllSettings();
	const content = vi.mocked(saveFile).mock.calls[0][0].content;
	await importAllSettingsFromJson(content);
	const imported = syncSet.mock.calls[0][0] as Record<string, any>;
	expect(imported.interpreter_settings).toEqual(syncData.interpreter_settings);
	expect(JSON.parse(decompressFromUTF16(imported.template_default.join('')))).toEqual(template);
	expect(imported.__cabinetLocalStorage).toBeUndefined();
	expect(localSet).toHaveBeenCalledWith(localData);
	expect(JSON.stringify(log.mock.calls)).not.toContain('fake-migration-secret');
});

test('the private rollout helper compresses templates, clears only local workaround URLs, and retains configuration values', () => {
	const template = { id: 'default', path: 'Inbox', name: 'Default' };
	const backup = { template_list: ['default'], template_default: template, general_settings: { cabinetUrl: 'http://127.0.0.1:52658' }, interpreter_settings: { providers: [{ apiKey: 'fake-private-value' }] }, __cabinetLocalStorage: { history: ['old-entry'] } };
	const prepared = prepareStorageMigration(backup);
	expect(JSON.parse(decompressFromUTF16(prepared.syncData.template_default.join('')))).toEqual(template);
	expect(prepared.syncData.general_settings.cabinetUrl).toBe('');
	expect(prepared.syncData.interpreter_settings).toEqual(backup.interpreter_settings);
	expect(prepared.localData).toEqual(backup.__cabinetLocalStorage);
	expect(backup.general_settings.cabinetUrl).toBe('http://127.0.0.1:52658');
	expect(prepareStorageMigration({ general_settings: { cabinetUrl: 'https://cabinet.example' } }).syncData.general_settings.cabinetUrl).toBe('https://cabinet.example');
	expect(canonical({ b: 2, a: [{ d: 4, c: 3 }] })).toEqual({ a: [{ c: 3, d: 4 }], b: 2 });
});

test('rejects invalid local migration data before changing synced settings', async () => {
	const clear = vi.spyOn(browser.storage.sync, 'clear');
	await expect(importAllSettingsFromJson(JSON.stringify({ __cabinetLocalStorage: [] }))).rejects.toThrow('Error importing settings');
	expect(clear).not.toHaveBeenCalled();
});
