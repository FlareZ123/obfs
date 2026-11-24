# Current-mainline SCO confirmation: host-held cross-file callback source is mutated per response

**Status:** current-mainline behavioral witness, exact test-only branch. The focused workflow succeeds because its assertions reproduce and classify the current behavior; it is not a source-parity green result.

## Pins and receipt

- Mainline base: `a4c838b9cfa6a89f910b18deb4732692701f8809`
- Test-only branch: `agent24/mainline-external-host-caller-recheck-20261124`
- Test commit: `3c32802105d29ea14474bca93e6b5a1189b9b8a3`
- Base-to-test diff: exactly two added test files, no production changes:
  - `test/agent24-mainline-external-host-caller-source-witness.test.js` (55 lines)
  - `test/agent24-mainline-sco-host-held-spelling.test.js` (204 lines)
- Focused run: [45433387887](https://github.com/FlareZ123/obfs/actions/runs/45433387887)
- Ubuntu and Windows, Node 22.23.4. Both focused jobs, project JSDoc, external JSDoc, and paired/complete-suite budget-evaluator JSDoc passed. The full Node 22 job was skipped by focused-test mode.

The second test file is a current-mainline recheck of the earlier Agent 24 report `im-results/agent24-sco-crossfile-host-held-spelling-2026-11-24.md`. The test remains on the research branch; no production source was changed.

## Actual SCO handler behavior reproduced

The tests use the real `createScoHandler(files,{closedWorld:true})`, fetch the actual `/obfs/helper.cjs` and `/obfs/entry.cjs` responses, write the delivered group to a temporary directory, and execute it under a Node preload. The preload replaces `queueMicrotask` with a host sink that calls `Function.prototype.toString.call(callback)`, records the source, and deliberately does **not** invoke the callback.

The helper returns a callback whose body contains the literal `'helperCallbackSourceLiteral'`. The entry module passes it to `queueMicrotask` and separately invokes it normally.

Three controls passed on both OS runners:

1. **Host observer only:** the native callback source contains the original single-quoted literal; the actual SCO response's callback source contains a different escaped/double-quoted spelling. Application stdout is unchanged and the callback sink never invokes the callback. This reproduces request-time source mutation.
2. **Concurrent helper GETs:** two concurrent GETs for the same helper receive different request-specific spellings. Both emitted variants preserve application stdout, but each callback source differs from native and from the other variant. The sink does not invoke either callback.
3. **Explicit source observer in entry:** adding `Function.prototype.toString.call(hidden)` to the entry module causes the existing source-level heuristic to preserve the callback source. It also withholds an unrelated helper literal, demonstrating the current group-wide zero-yield veto.

## Diagnosis

The existing `interfileSourceObserver` heuristic recognizes the explicit source reader in the third control, but it does not recognize the callback as a source-observable callable when the observer exists only in the host preload. The input graph contains only a callback escape to `queueMicrotask`; the actual host reader is outside the graph. The request handler therefore applies `varyLiteralSpellings` to the helper response and changes the source spelling.

This is a separate source-mutating stage from later `obfuscateFiles` property/identifier/string transforms. A future plan that protects only the passes inside `obfuscateFiles` is insufficient: the plan must govern request-time `varyLiteralSpellings` too.

The concurrent test also establishes an integration requirement, not a proof of future plan isolation: each module GET currently receives its own request-specific variant. A future full-graph plan must be immutable and unique per response, preserve the entire graph and edge identities, and identify which one source unit changed for that response. The plan does not yet exist in this handler.

## Required future behavior

- Treat a callback passed to an unknown host sink as a possible `HostHeldCallable`, even when the host's source read exists only in a preload/instrumented environment.
- Propagate that effect through cross-file factory returns, aliases, and helper modules to the exact callable source closure.
- Apply the same immutable response plan to request-time spelling variation and every later transform.
- Preserve the observed callable while allowing independently proved unrelated literals to vary. The current explicit-observer control demonstrates why a group-wide zero-yield veto is safe but unnecessarily broad.
- Keep the Node host-caller witness and this actual-handler witness separate: the former demonstrates sloppy `arguments.callee.caller` on a direct helper; this one demonstrates real SCO response variation on a callback held by an external host sink.

**Disposition:** current mainline SCO is not source-parity-safe for this host-held cross-file callback shape. This is a focused two-platform reproduction, not full acceptance, not a browser-engine result, and not a security proof. Keep SCO RELEASE-BLOCKED for the relevant callable/host-sink shapes until the request-time mutation path is governed by a verified source-observation plan.
