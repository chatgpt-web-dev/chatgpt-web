# Repository Guidelines

## Project Structure & Module Organization
- `src/`: Vue 3 frontend source (components, store, router, locales, styles).
- `public/`: static assets served as-is.
- `service/`: Node backend service (separate `pnpm install`, `.env` file lives here).
- `docs/`: screenshots and documentation assets.
- `dist/`: frontend build output (generated).
- Root configs: `vite.config.ts`, `tsconfig.json`, `eslint.config.ts`.

## Build, Test, and Development Commands
- `pnpm bootstrap`: install frontend deps and set up Husky hooks.
- `pnpm dev`: run the Vite dev server for the frontend.
- `pnpm build`: type-check then build the frontend (`dist/`).
- `pnpm preview`: preview the built frontend locally.
- `pnpm lint` / `pnpm lint:fix`: run ESLint (and auto-fix) on the frontend.
- `pnpm type-check`: run `vue-tsc` for frontend type checks.
- Backend (run in `service/`): `pnpm install`, `pnpm start` (dev), `pnpm build`, `pnpm prod`.
- Backend checks (run in `service/`): `pnpm lint`, `pnpm lint:fix`, `pnpm type-check`.

## Coding Style & Naming Conventions
- Indentation: 2 spaces (see `src/` for examples).
- TypeScript + Vue SFCs; prefer PascalCase for Vue components (e.g., `ChatHeader.vue`).
- Code comments must be written in English.
- ESLint is the source of truth; run `pnpm lint:fix` before commit.
- Commit hooks are managed by Husky (`pnpm bootstrap`).

## Icons (unplugin-icons)
- Use `Icon*` components (e.g., `<IconRiDownload2Line />`) in templates; they are auto-imported.
- In script/render functions, `Icon*` components are also auto-imported via `unplugin-auto-import`; avoid manual `~icons/...` imports.
- If an icon name fails, switch to a valid icon in the same collection (e.g., `ri`), then rerun the app.
- Loader note: `@iconify/utils` uses `searchForIcon()` with `getPossibleIconNames()`, so numeric names like `settings4-line` can resolve to `settings-4-line` at load time.
- Rule: always use the `Icon*` component form (e.g., `<IconRiSettings4Line />`) for icons going forward.

## i18n Keys & Usage
- Locale files live in `src/locales/` (`en-US.json`, `zh-CN.json`, `zh-TW.json`, `ko-KR.json`).
- `en-US.json` is the canonical schema; add new keys there first, then mirror them in other locales.
- Use nested namespaces like `common.save`, `chat.newChatButton`, `setting.user.roles`.
- Access strings via `t('namespace.key')`; avoid hardcoded UI text in components.
- When adding keys, keep naming consistent (lower camelCase) and reuse existing namespaces where possible.

## Testing Guidelines
- No dedicated test suite is configured yet; rely on `pnpm type-check` and `pnpm lint`.
- If you add tests, document the runner and naming pattern in this file.

## Commit & Pull Request Guidelines
- Use Conventional Commits (e.g., `feat: add user settings`).
- Always work on a feature branch; do not commit directly to `main`.
- Create or switch to a feature branch before any changes (e.g., `git checkout -b feature/my-change`).
- New features target the `feature` branch; other changes target `main`.
- PRs should include a clear description, link related issues, and note any UI changes with screenshots.
- Commit with signed-off and signed commits: `git commit -s -S -m "feat: ..."`.

## Configuration & Environment
- Backend secrets live in `service/.env` (copy from `service/.env.example`).
- Frontend API base URL is in root `.env` as `VITE_GLOB_API_URL`.
- Required Node version: `^20 || ^22 || ^24`.
