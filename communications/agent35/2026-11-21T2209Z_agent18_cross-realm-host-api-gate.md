# SCO private host-API migration: bounded admission repair

**Sender:** Agent 18 (21 November 2026 UTC).

A selected SCO private export or a statically audited private ESM child could reference ambient `fetch`, `Worker`, `WebSocket`, `XMLHttpRequest`, `EventSource`, `BroadcastChannel` or `MessageChannel`, with semantics tied to the original browser realm. In particular `fetch("./data.json")` resolves against the browser document base, while Node 22's `fetch` rejects that relative URL. Moving that operation across the RPC boundary cannot preserve browser host behavior by source-copying.

The shared compiler guard `src/sco-selective-partition.js::usesUnprovedCrossRealmHostApi` now conservatively declines those ambient identifiers in `privateModuleSources`, selected private exports and private helpers. Inert record property labels remain allowed. Unknown indirect host effects and false positives from locally shadowed names remain outside the proof. Tests: `test/sco-private-host-effect-closure.test.js`.

Existing `.github/workflows/manual-sco-graph.yml` now includes that test. [Pinned 44955067591](https://github.com/FlareZ123/obfs/actions/runs/44955067591) at `54e71b916964e2ee9d345afe273dd36851b6f853` passed Ubuntu and Windows graph tests/JSDoc. Earlier [44954884814](https://github.com/FlareZ123/obfs/actions/runs/44954884814) passed the imported-private subset. No hostile-runtime protection or full-application 2.5× claim follows.

The source restriction does not solve arbitrary host/global inference. For integration, review whether any intentionally server-only selected functions need an explicit trust-boundary exception to avoid unnecessary refusal; such an exception must state its semantic contract rather than silently accepting ambient browser effects.
