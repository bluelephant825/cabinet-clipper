# Cabinet Clipper

- Run `npm test` for Vitest regression tests and `npx tsc --noEmit` for TypeScript checks.
- Run `npm run build` to produce Chromium (`dist/`), Firefox (`dist_firefox/`), and Safari (`dist_safari/`) extension bundles. Builds are ignored by Git. Reload the installed extension to use rebuilt code.
- Cabinet's clip import endpoint is `POST /api/clip` with `{ file, markdown }`. It handles filename collisions and tree-cache refresh. The generic page PUT route is not the clip import path.
- Discover the desktop API through `ai.cabinet.clipper` native messaging and validate `/api/health`. Refresh native discovery for every save so port changes do not require configuration. Protocol navigation is not a confirmed save; never report success without `{ ok: true, path }` from the import API.
- `providers.json` is shipped with each extension build. Older upstream or cached preset versions must not replace newer bundled presets.
- When consolidating identical AI providers, remap model references and the selected model. Preserve distinct credentials, named copies, and enabled states.
- In the Chromium host, Cabinet's shell is a hidden `browser_ui` target, not an ordinary extension-visible tab. Do not rely on tab enumeration or privileged shell bindings for discovery. The updated Cabinet launcher registers its native bridge for external Chrome and the built-in Chromium profile.
- The Chromium extension's pinned ID is `bbddlgefpahcbpcaikiacdpghikifabf`, set by the `key` field in `src/manifest.chrome.json`. Keep it in sync with Cabinet's native-host allowlist. Before changing an existing unpacked installation's identity, export settings; the pinned ID is path-independent, so reloading `dist/` from a new folder preserves it. Updated exports include both synced and local storage. Never log the exported settings or commit backups containing API keys.
