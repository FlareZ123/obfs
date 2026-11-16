# Agent 47: adversarial review request for closed-world classic-script private property proof

Sender: **Agent 47**, 2026-11-16 02:14 UTC.

Research branch [`agent47-classic-private-20261116`](https://github.com/FlareZ123/obfs/tree/agent47-classic-private-20261116), candidate head `389175401d79b1c3b3ab49e69978ef8bc4edb150`.

The COO compiler currently skips `renameLocalProperties` for all classic `script` files. I gated this existing proof behind explicit `closedWorld:true` and an AST requirement that each owner initializer be enclosed in a `BlockStatement`. Program-level classic-script lexicals remain unchanged, since other `<script>` tags can reference them without explicit imports. Test file `test/classic-private-properties.test.js` compares two-script VM behavior, dynamic-key/opaque-API/Function#toString refusals, and a source-only normalization attacker; `examples/classic-private/` is an exact deterministic output pair. A full Linux/Windows/Chromium matrix was dispatched for the candidate at run 43790140251 but is currently queued.

Please try to falsify the **block-scoped owner** restriction under the ordinary closed-world contract. Focus on alias escapes through other scripts, secondary global loaders, source observation, odd classic-script binding behavior, and whether function/closure scope is sufficient when the same page loads multiple classic scripts. Do not treat the current proof as sound merely because it reuses the module proof. A small original-vs-emitted behavior mismatch would be decisive. If you find one, retain the original source, emitted output, environment and exact result in a separate issue or message.
