# AGENTS.md

## What this repo is
- Chub.ai stage (React 18 + TypeScript + Vite 5, yarn, node 21.7.1), forked from `CharHubAI/stage-template`.
- Remotes: `origin` = `https://gitea.atree.men/ATrentham/chub-corrupt-sys.git` (development), `github` = `https://github.com/ATreemanDork/chub-corrupt-sys.git` (mirror; push both after significant changes).
- Companion stage for the **Corruption System** card (`Corruption System.json`, repo root): parses the card's stat blocks out of bot messages, shows them in an ADJACENT panel, and re-injects the current state via `stageDirections` so the model stays consistent.
- **Do not strip stat lines from messages** (no `modifiedMessage` in v1) — the message text is the source of truth; the panel is derived.

## Commands
- `yarn install` — fresh clones have no `node_modules`. `package.json` `engines.node` is `>=21.7.1`; if a toolchain pins a different version, `yarn install --ignore-engines` works.
- `yarn dev` — local dev. There is no real chat UI locally; `TestRunner.tsx` runs instead (below).
- `yarn lint` — eslint with `--max-warnings 0`; a warning fails the build.
- `yarn build` — `tsc && vite build` (the deploy build). `yarn build --mode lib` is the npm/library build (entry `src/index.ts`, umd/es/cjs/iife, react external).
- No unit-test framework. Local verification = TestRunner + `yarn lint` + `yarn build`.
- `tsconfig` is `strict`.

## Local testing (the only test harness)
- `src/App.tsx` runs `TestStageRunner` in dev mode, `ReactRunner` in build.
- Edit `runTests()` in `src/TestRunner.tsx` to drive `beforePrompt` / `afterResponse` / `setState` with synthetic messages; edit `src/assets/test-init.json` to control the characters/users the stage sees (currently the template "Janessa" stub — replace with the Corruption System data, e.g. the Victoria/Michelle profiles from the card's `mes_example`).
- Spread `DEFAULT_INITIAL`, `DEFAULT_MESSAGE`, `DEFAULT_CHARACTER`, `DEFAULT_USER` from `@chub-ai/stages-ts` in tests so interface version bumps don't break the runner (forward-compat by design).
- Verify with `console.assert`; the rendered panel shows in the browser, logs in the console.

## Where implementation lives
- `src/Stage.tsx` — `Stage extends StageBase<...>` from `@chub-ai/stages-ts` (v0.3.7); `src/index.ts` re-exports it as the lib entry.
- `src/parser.ts` — pure (no imports) tolerant parser for the card's model output; the only place stat/profile text is parsed. Keep parsing logic here, not in Stage.tsx.
- `src/TestRunner.tsx` + `src/assets/test-init.json` — the local harness (see above). test-init.json is generated from the card; regenerate it if the card changes.
- Lifecycle hooks and where to put things:
  - `load()` — async init; return `success: false` to hide the stage entirely.
  - `beforePrompt()` — before the LLM call. `stageDirections` (appended to prompt, not persisted) carries the current stat state for model consistency. `modifiedMessage` replaces the user message in DB + later prompts. `systemMessage` shows in the chat log as a system entry and is re-sent to the LLM.
  - `afterResponse()` — after the bot message; **stat parsing goes here** (calls `parseMessage`).
  - `setState()` — branch jump/swipe; merge persisted `messageState` back in.
  - `render()` — pure React display, no work in it.
- State semantics: `messageState` is persisted per message → use it for stats/points (branch-safe); `chatState` is branch-agnostic (rarely needed); `initState` is once-per-chat; plain class fields are in-memory only and lost on reload.
- **SCSS gotcha:** `src/index.scss` has a global `* { background-color: transparent !important; overflow: hidden !important; }` (stage must stay transparent over chat). Any panel background/scroll must be a named scss class with `!important` overrides (see `.cs-panel`, `.cs-track`, `.cs-fill`) — inline styles lose to it.
- API docs: https://docs.chub.ai/docs/stages; a fully-featured reference stage is `CharHubAI/stage-integration-test` (messenger/generator/storage APIs, MCP tools — not used in this v1).

## Card contract (what the parser must handle)
- The bot (`{{char}}` is a phone-app "system" character) ends every message with `**LUST:{##}, CORRUPTION:{##}, DOMINANCE:{##}**`. DOMINANCE ranges **-100..100** — the parser must handle a minus sign.
- Target profile blocks: `**NAME:{##}**`, `**AGE:{##}**`, `**OCCUPATION:{##}**` (the example uses "Occupation" — parse case-insensitively), `**APPEARANCE: [[...]]**`.
- Also `**FETISHES: [[...]]**` (granted per 20 CORRUPTION) and `**ABILITY POINTS:{##}**` on completion.
- Completion rule: CORRUPTION hits 100 → points = 10 minus full tens of the *initial* LUST (initial LUST is random 10–30, so 8–9 points).
- This formatting is **model output, not a guaranteed schema** — bold/case/spacing will drift. Keep parsers lenient (regex on field names + numeric values, not exact lines).

## `public/` config
- `public/chub_meta.yaml` — stage metadata: `project_name`, `position` (default `ADJACENT`), `tags`, `config_schema` (a stage with user config but no schema won't work), `state_schema`. **`extension_id` and `github_path` are written by CI — do not hand-edit or commit them.**
- `public/scenario.yaml` — `characters: ['self']` to run without characters, or paths relative to `public/characters/` for predefined characters.
- `public/characters/*.yaml` — `project_uuid` is generated by CI; don't hand-edit. To test with the real card, the Corruption System character belongs in `public/characters/` as a yaml definition.

## Deploy (Gitea → Chub)
- Push to both remotes after significant changes: `git push origin main && git push github main`. Credentials live in the git credential store (`/tmp/opencode/.git-credentials-gitea`, holds gitea.atree.men + github.com).
- Token placement:
  - **Chub API token** → repo secret `CHUB_AUTH_TOKEN` (Gitea repo settings → secrets, if Gitea Actions runs the workflow). For a manual deploy instead: export it as a shell env var `CHUB_AUTH_TOKEN`.
  - **Gitea PAT** → credential store / push URL for git pushes only. Never commit it.
- Manual deploy: run `./deploy.sh` (needs `tokens.ini` at repo root with `CHUB_AUTH_TOKEN`). It resolves/creates the extension id, writes `extension_id` to `chub_meta.yaml` + `project_uuid` to the character yaml, commits those, builds, zips `dist`, uploads. Must run from a connection not geo-blocked by Chub (the dev box's US datacenter egress is rejected).
  - `<STAGE_ID>`: read `extension_id:` from `public/chub_meta.yaml` once it exists; on first deploy, create one via `curl -H "CH-API-KEY: $CHUB_AUTH_TOKEN" -X POST -d '{"name":"<repo name>"}' https://api.chub.ai/extensions` and take `id_v2`.
- CI also does: push to `main`/`master` → build + upload; tag `v*` → `yarn build --mode lib` + npm publish (needs `NPM_TOKEN`). `package.json` is still named `@chub-ai/stage-template` — rename before publishing your own.
  - **CI deploy is geo-blocked**: GitHub's ubuntu runners are US-based and `api.chub.ai` 403s US datacenter egress ("This service is not available in your country") — same as the dev box (confirmed in run 41893641437, 2026-11-04). The workflow now fails loudly with the response body. Treat CI as build validation only; actually deploy via `./deploy.sh` from a non-geo-blocked connection. A self-hosted runner (on a machine that isn't blocked) is the fix if CI deploy is ever wanted.

## Misc
- The card is intentionally **not tracked in git** (explicit adult content, public GitHub mirror; removed in `44a406e`). The local copy is gitignored; if it's missing, restore with `git show '44a406e^:Corruption System.json' > "Corruption System.json"`.
- The card is an explicit adult-themed simulation — set `visibility`/`tags` in `chub_meta.yaml` accordingly when filling it in.
- The card's `extensions.importMetadata` reports a v3 export but the `spec` is `chara_card_v2` 2.0 — Chub accepts it as v2; don't "upgrade" it on a hunch.
