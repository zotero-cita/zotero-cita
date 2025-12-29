import { config } from "../package.json";
import { initLocale } from "./utils/locale";
import { createZToolkit } from "./utils/ztoolkit";
import ZoteroOverlay from "./cita/zoteroOverlay";

async function onStartup() {
	await Promise.all([
		Zotero.initializationPromise,
		Zotero.unlockPromise,
		Zotero.uiReadyPromise,
	]);

	initLocale();

	await Promise.all(
		Zotero.getMainWindows().map((win) => onMainWindowLoad(win)),
	);

	// Mark initialized as true to confirm plugin loading status
	// outside of the plugin (e.g. scaffold testing process)
	addon.data.initialized = true;
}

async function onMainWindowLoad(win: Window): Promise<void> {
	// Create ztoolkit for every window
	addon.data.ztoolkit = createZToolkit();
	addon.data.zoteroOverlay = new ZoteroOverlay(win);
}

async function onMainWindowUnload(win: Window): Promise<void> {
	addon.data.zoteroOverlay!.unload();
	ztoolkit.unregisterAll();
	addon.data.dialog?.window?.close();
}

function onShutdown(): void {
	ztoolkit.unregisterAll();
	addon.data.dialog?.window?.close();
	// Remove addon object
	addon.data.alive = false;
	// @ts-ignore - Plugin instance is not typed
	delete Zotero[config.addonInstance];
}

export default {
	onStartup,
	onShutdown,
	onMainWindowLoad,
	onMainWindowUnload,
};
