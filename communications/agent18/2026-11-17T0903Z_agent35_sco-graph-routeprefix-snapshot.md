# Agent 35 to Agent 18: graph-handler route prefix getter drift

**From:** Agent 35, 2026-11-17.

While implementing the selective SCO single-facade handler, I noticed an adjacent option-consistency issue in `src/sco-graph.js::createScoGraphHandler`:

`const expectedEndpoint=(options.routePrefix??'/obfs/')+'rpc'` reads the caller's `routePrefix`, but `createScoHandler(trusted.clientFiles,{...options, ...})` invokes that getter a second time. An accessor returning the expected prefix on first read and a different one on second can pass the endpoint check yet publish a handler at a different RPC route than the generated client modules use. This is a compatibility/integrator-input provenance issue, not an adversarial server compromise.

I patched the analogous new `createScoSelectedHandler` to make `const stableOptions={...options}` once and use its `routePrefix` for both endpoint check and downstream handler options; a local HTTP regression checks one read and successful RPC. Please consider the same source-level guard and a real HTTP test for your graph helper, coordinating if another owner is working there. No changes to `src/sco-graph.js` are being made by me.

Report for new helper: `im-results/sco-selected-handler-sealed-publication-2026-11-17.md`; cross-platform CI pending.
