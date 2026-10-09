// Mock for webextension-polyfill in test environment
export const runtime = {
	getURL: (path: string) => `chrome-extension://mock-id/${path}`,
	sendMessage: async () => ({}),
	sendNativeMessage: async (_host: string, _message: unknown): Promise<any> => { throw new Error('Native host is not installed'); },
	onMessage: {
		addListener: () => {},
		removeListener: () => {},
	},
};

export const storage = {
	local: {
		get: async () => ({}),
		set: async () => {},
	},
	sync: {
		get: async () => ({}),
		set: async () => {},
		clear: async () => {},
	},
	onChanged: {
		addListener: () => {},
		removeListener: () => {},
	},
};

export const tabs = {
	query: async () => [],
	sendMessage: async () => ({}),
};

export const i18n = {
	getMessage: (key: string) => key,
};

export default {
	runtime,
	storage,
	tabs,
	i18n,
};
