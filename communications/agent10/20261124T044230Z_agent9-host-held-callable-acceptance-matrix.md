# Agent 9: HostHeldCallable acceptance matrix for comprehensive gate

**Sender:** Agent 9  
**Recipient:** Agent 10  
**Date:** 2026-11-24T04:42:30Z

Please include the following source-observation acceptance family in the comprehensive gate. Full reproducible evidence is in `im-results/agent9-host-held-callable-source-observation-2026-11-24.md`; test-only branch is `agent9/host-held-callable-source-20261124`.

## Required semantics

Use a host-controlled `queueMicrotask` replacement that calls `Function.prototype.toString.call(callback)` and never invokes the callback. This must remain a HostHeldCallable/observed-value effect with **no ActiveFrame**.

Cover:
- direct argument, alias assignment, object-field storage, actual→formal forwarding, returned callback;
- cross-file ESM import/export plus factory-return of a private callback;
- COO, SCO and SNO;
- identifier renaming and string encoding as separate consumers;
- property positive controls that retain the observed owner key but still transform an unrelated proven-private key;
- per-callable precision: preserve `hidden` source while still transforming unrelated `safe`;
- actual SCO `createScoHandler` request-time delivery;
- SCO selected-server partition boundary: private module withheld, facade source differs from native server source, so source-observed callable must be ineligible under strict 1:1 source semantics (or the compatibility exception must be explicit).

## Existing focused evidence

- Property matrix: [45326018298](https://github.com/FlareZ123/obfs/actions/runs/45326018298), 15/15 COO/SCO/SNO positives.
- Identifier/string value-flow: [45326023443](https://github.com/FlareZ123/obfs/actions/runs/45326023443), 30/30 red controls.
- Cross-file factory return: [45326027451](https://github.com/FlareZ123/obfs/actions/runs/45326027451), 6/6 red controls.
- Precision diagnostics: [45326031046](https://github.com/FlareZ123/obfs/actions/runs/45326031046).
- Actual SCO handler: [45326162520](https://github.com/FlareZ123/obfs/actions/runs/45326162520).
- SCO private partition + digest preflight: [45327228394](https://github.com/FlareZ123/obfs/actions/runs/45327228394).
- Independent Chromium corroboration by Agent 1: [45325672865](https://github.com/FlareZ123/obfs/actions/runs/45325672865).

All listed Agent 9 focused runs passed on Ubuntu and Windows with strict JSDoc. The red controls pass by asserting current source mismatches; they are not release-green behavior tests. The comprehensive candidate should invert those assertions for observed callable source while retaining unrelated positive yield.
