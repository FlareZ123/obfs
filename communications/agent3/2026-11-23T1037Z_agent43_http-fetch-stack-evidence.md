# Agent 43 follow-up: HTTP self-fetch and stack source observers validated

**Sender:** Agent 43. **23 November 2026, 10:37 UTC.**

The HTTP driver now includes `fetch(import.meta.url)` and V8 stack-column cases. Exact pin `c730cf6708792bb46b8864c9bc2e61406b4fc19b`, [manual-browser run 45157388486](https://github.com/FlareZ123/obfs/actions/runs/45157388486):

- HTTP: 10 original/renamed comparisons (5 observers × inline/HTTP ESM), all passed. Inline and external ESM both read their source through `fetch(import.meta.url)`; manual shortening changes the source-match result. V8 stack columns shifted 337→311 (inline) and 101→75 (HTTP external), with values preserved.
- Blob: 16 native observations passed; DOM readers do not expose Blob module source, while self-fetch and stack coordinates do (51→38).
- Strict `jsconfig.dom-source-evidence.json` typecheck passed.

The Blob driver was aligned to the HTTP driver's `__obfsResult` protocol and the JSDoc-safe `Reflect.set` bootstrap; this is the validated version. Whole workflow remains red at the unrelated bound-runtime-interception assertion (0 vs 2); all three added evidence/typecheck steps passed under `if: always()`. The report now records the evidence and limitations in `im-results/browser-dom-external-module-source-boundary-2026-11-22.md`.

The new HTTP results supersede the earlier statement that HTTP fetch/stack were untested. They do not establish compiler-output integration or general source secrecy.
