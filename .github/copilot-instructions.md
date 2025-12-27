# Copilot / Agent Instructions — NoobHeaders

Short, focused instructions to help an AI agent become productive quickly in this repository.

## Quick orienting summary
- What this project is: a small browser extension (Chrome/Firefox) that modifies HTTP headers using the declarativeNetRequest API.
- Build flow: TypeScript sources in `src/` are bundled (multiple entry points) with `scripts/build.js` → output to `dist/`.
- Tests run against compiled `dist/` (see testing note below).

## Fast setup (commands)
- Install: `pnpm install`
- Build: `pnpm build` (dev: `pnpm build:dev`, watch: `pnpm build:watch`)
- Tests: `pnpm test` (note: `test` runs a dev build first)
- Lint/format: `pnpm run lint` / `pnpm run format`
- Package: `pnpm run package` (creates `packages/noobheaders-*-*.zip` using `manifest.chrome.json` and `manifest.firefox.json`)

## Key files and responsibilities (where to look)
- Architecture/entry points: `src/background.ts`, `src/popup.ts`, `src/options.ts`, `src/i18n.ts` — these are built individually by `scripts/build.js` and copied into `dist/`.
- Rule generation: `src/rules.ts` — converts profiles into Declarative Net Request rules (important: URL-filter OR semantics and id offset handling).
- Matching logic: `src/auto-switch.ts` — `matchFilter`, `domainFromUrl`, `isValidDomain` used by UI and background auto-switching.
- Badge & storage handling: `src/background.ts` — reads `STORAGE_KEYS` from `src/types/index.ts`, applies rules via `chrome.declarativeNetRequest` and maintains badge counts.
- Header applicability helpers: `src/header-utils.ts` — `headerAppliesToUrl` and `countApplicableHeadersForUrl`.
- Types: `src/types/index.ts` — central place for shared interfaces (Profile, Header, Filter, STORAGE_KEYS).
- Packaging & release helpers: `scripts/package.js`, `scripts/update-version.js`, `scripts/update-version-lib.js`.
- Assets & locales: `_locales/*/messages.json` (i18n tests enforce key parity with `en`).

## Project-specific conventions and gotchas
- Tests import compiled files from `dist/`. Always ensure a build has run (the `pnpm test` script runs a dev build for you).
- When changing the extension manifest for distribution, update the corresponding `manifest.chrome.json` and `manifest.firefox.json` (the packaging step replaces the manifest when creating per-browser packages).
- i18n: any change to UI strings requires adding/updating keys in `_locales/en/messages.json` and keeping all other locales in sync (tests compare keys to `en`).
- Commit messages: Conventional Commits with an emoji after the colon are enforced via Husky `commit-msg` hook (see `scripts/verify-commit-msg.js`). Run `pnpm prepare` to enable hooks locally.
- Lint/format: project uses Biome (`pnpm run lint`, `pnpm run format`).
- Use TypeScript types from `src/types/index.ts` — they are the canonical schema for profiles and storage keys.
- Resource types and default url filter are centralized in `src/rules.ts` (`DEFAULT_URL_FILTER`) — prefer using that constant rather than duplicating lists.

## Tests & adding tests
- Tests live in `tests/*.test.js` and use Node's built-in test runner (`node --test`).
- Pattern: build first, import functions from `dist/*.js`, write small focused tests with `assert` and `test` from `node:test`.
- i18n tests will fail if locales are inconsistent; manifest tests verify manifest fields.

## Examples & micro-guidance (copy/paste snippets)
- Generate rules for a profile: `import { convertProfileToRules } from '../dist/rules.js' // in tests`
- Match domain filters: `matchFilter(url, { type: 'domain', value: '*.example.com' })` (see `src/auto-switch.ts`)
- Update packaging after changing output: run `pnpm build && pnpm run package` and verify `packages/noobheaders-*.zip` contains expected files.

## When editing UI strings / versioning
- To change the displayed version, run `node scripts/update-version.js <x.y.z>` which updates `manifest*.json` and top-level HTML version strings (used during release).

## CI / release notes
- CI (see `.github/workflows/ci.yml`) runs `pnpm test`, `pnpm run lint`, builds icons, and verifies manifest/i18n.
- Releases are handled by `semantic-release`; releases also run `scripts/update-version.js` as part of the pipeline.

## Scope of this doc
- This file documents only discoverable patterns and workflows (build/test/manifest/i18n/packaging) that an AI agent needs to be productive. If anything here is unclear or you want me to add short examples (e.g., a minimal unit-test template or a sample migration PR guidance), tell me which area to expand.

---

Please review and tell me which sections you'd like expanded or examples you'd like added.