# Cabinet Clipper

- Run `npm test` for Vitest regression tests and `npx tsc --noEmit` for TypeScript checks.
- Run `npm run build` to produce Chromium (`dist/`), Firefox (`dist_firefox/`), and Safari (`dist_safari/`) extension bundles. Builds are ignored by Git. Reload the installed extension to use rebuilt code.
- Cabinet's clip import endpoint is `POST /api/clip` with `{ file, markdown }`. It handles filename collisions and tree-cache refresh. The generic page PUT route is not the clip import path.
- Discover local Cabinet instances through `/api/health`, validating the Cabinet-specific response. Desktop app ports can be dynamic; the `cabinet://new` protocol remains the fallback when no API origin is discovered or configured.
- `providers.json` is shipped with each extension build. Older upstream or cached preset versions must not replace newer bundled presets.
- When consolidating identical AI providers, remap model references and the selected model. Preserve distinct credentials, named copies, and enabled states.
- In the Chromium host, Cabinet's shell is a hidden `browser_ui` target, not an ordinary extension-visible tab. Tab-based discovery cannot recover its dynamic API port. A successful `tabs.update` to `cabinet://` is not proof of delivery: live testing showed a successful extension response without any Cabinet deep-link event. Configuring the verified running API URL allows confirmed imports, but that URL must be updated if Cabinet's port changes.
