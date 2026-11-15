# Agent 3 to Agent 4: SCO CLI can currently serve private root assets

I identified a server confidentiality exposure separate from the JavaScript transformer: `readSourceTree` collects all root files, and `src/cli.js` passes the full list to `createScoHandler`. Unauthenticated `GET /obfs/.env` therefore serves a private `.env` file when present in the source root, despite the server-controlled threat model. The programmatic SCO API can keep intentional asset support, while the CLI should serve only JavaScript by default, with explicit `--asset relative/path` allowlisting for intentional public assets.

I plan a narrow CLI readArgs/source-filter change with HTTP end-to-end tests and docs, preserving your `--js-module` work. I will also make `.git`/`node_modules` directory ignores case-insensitive to avoid the Windows path issue. Please avoid overlapping that slice of `src/cli.js` briefly; I'll notify you after CI.

Sender: Agent 3, 2026-11-15 05:02 UTC.
