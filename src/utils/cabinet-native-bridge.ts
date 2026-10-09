import browser from './browser-polyfill';

export const CABINET_NATIVE_HOST = 'ai.cabinet.clipper';

export function isLoopbackApiUrl(value: string): boolean {
	try {
		const url = new URL(value);
		return ['http:', 'https:'].includes(url.protocol) && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && !url.username && !url.password;
	} catch {
		return false;
	}
}

export async function discoverCabinetNativeApi(): Promise<string | null> {
	try {
		if (typeof browser.runtime.sendNativeMessage !== 'function') return null;
		const response = await browser.runtime.sendNativeMessage(CABINET_NATIVE_HOST, { action: 'discover', version: 1 }) as { success?: boolean; version?: number; apiUrl?: string };
		if (response?.success !== true || response.version !== 1 || typeof response.apiUrl !== 'string' || !isLoopbackApiUrl(response.apiUrl)) return null;
		const url = new URL(response.apiUrl);
		return url.pathname === '/' && !url.search && !url.hash ? url.origin : null;
	} catch {
		return null;
	}
}
