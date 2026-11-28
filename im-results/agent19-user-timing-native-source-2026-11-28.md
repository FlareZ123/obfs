# Native User Timing source disclosure: provisional differential evidence

**Agent 19 · 2026-11-28 · intermediate engineering evidence, not a release result.**

## Witness and threat-relevant behavior

Node 22's native `performance.mark` accepts a string name and an options
record. If `options.detail` contains a callable, the structured-clone failure
includes the callable's exact `Function#toString` source spelling in its
`DataCloneError.message`. The same applies to `performance.measure`
with function-bearing `detail`. This observation can cross the ordinary
compiled JavaScript/native host boundary without any explicit
`String(fn)` or `fn.toString()` in user code.

A bounded reproducer:

```js
const { performance } = require('node:perf_hooks');
function inspect(){const owner={secretField:47};return owner.secretField;}
let observed='';
try {
  performance.mark('fixed', {detail:{nested:[inspect]}});
} catch (error) {
  observed=error.message;
}
module.exports={observed,value:inspect()};
```

The original and obfuscated computation both returned `value:47`, but
before the options observer correction, emitted code renamed the local
`owner` identifier inside `inspect`; the native error text consequently
changed despite numeric parity. This is a semantic incompatibility, **not**
a demonstrated security improvement or attacker-extraction resistance.

## Source-pinned red evidence

- Source commit: `dbbf95f8f664a0166716dd1e05a0b1c74255565c` on
  `agent19/performance-user-timing-source-observer-20261128`.
- Runtime gate: [Actions 46142594161](https://github.com/FlareZ123/obfs/actions/runs/46142594161),
  Node 22 on **Ubuntu and Windows**.
- **On each OS: 24 tests, 3 passed, 21 failed**. Across all three obfuscation
  modes (`coo`, `sno`, `sco`), all seven function-bearing
  `detail` variants disagreed in native-vs-emitted `DataCloneError.message`.
  The three separate primitive-detail positive controls passed and still
  performed unrelated private-property rewriting.
- Representative emitted error name:
  `function inspect(){const _va71433e9decb={secretField:47};return _va71433e9decb.secretField;} could not be cloned.`
  versus native:
  `function inspect(){const owner={secretField:47};return owner.secretField;} could not be cloned.`
- Test: `test/agent19-user-timing-detail-source.test.js`. This executes
  **actual** `node:perf_hooks` native APIs inside Node's VM with injected
  native performance, not a fake source-reading host.

Earlier direct-`performance.mark(fn)` detection-only red test:
`0bed6b8c899838612ce2708c08b0ebf970f727e3`,
[Actions 46142087270](https://github.com/FlareZ123/obfs/actions/runs/46142087270).
It had 18 static classifier failures and three positive controls, but its
native/emitted parity assertions passed: do **not** conflate the classifier
red with the confirmed options runtime mismatch above.

## Candidate defense and nonvacuity

The focused patch `ed1aa4f63d85e4b7061e61a13cac81f981bc6610`
extends `src/ast.js::observesFunctionSource` to inspect the native
User Timing method's name and options argument, including direct,
`.call`, `.apply`, bound and reflective invocations. The options
proof uses the existing `mayCoerceSourceWithinWebRecord` to allow
syntactically proven primitive/literal options while declining
function-bearing and opaque values.

The prior direct-call patch `ffe5989f1c583d31038fc7a7030d9016bf6e1a7a`
passed [Actions 46142236398](https://github.com/FlareZ123/obfs/actions/runs/46142236398)
on Ubuntu/Windows, including strict JSDoc, but that run predated
the options remedy. **Neither the options remedy, cross-file graph
behavior, nor real Chromium is a release pass until its own exact-head
green receipt is obtained.** Selected-Wasm counterfactuals, dynamic
record carrier/source-provenance paths, and the native browser host
are investigated separately.

## Next falsifiers

1. Compare patch source `ed1aa4f...` and subsequent source-transport
   commits against the exact red tests on both operating systems;
   inspect failed actual assertions, not merely workflow conclusions.
2. Execute `test/agent19-user-timing-interfile-source.test.js` in native
   Node ESM and `test/agent19-user-timing-source-browser.js` in actual
   Chromium with primitive positive yields.
3. Test `node:perf_hooks` imported receiver provenance, local method
   object carriers, direct function argument/return flow, and
   `performance.measure` option aliases.
4. Compare full-suite and independent protection-yield/CPU evidence on
   any proposed integration head. Current repository release
   status remains **NO-GO**; this report does not waive that status.

Evidence class: reproducible native differential / prototype repair.
Place in `im-results/` until broad acceptance is established.

## Follow-up falsifiers and corrected negative evidence (2026-11-28 12:30Z)

The *pre-ESM-provenance-collector* branch `agent19/user-timing-imported-receiver-red-20261128`
at `e1e870781e0756c04a9d0465ba5de0fe3902de1e` passed
[CI 46144261154](https://github.com/FlareZ123/obfs/actions/runs/46144261154)
on Ubuntu and Windows: all **15/15** real Node ESM source-parity cases
(three modes × four imported receiver/method/factory/detail shapes and
three primitive-positive controls) already preserved behavior.
Consequently the subsequent `collectImportedTimingAliases` proof is
**additional explicit graph provenance/defense in depth, not a verified
repair of an ESM runtime mismatch in those 15 fixtures**. Do not describe
the successful precollector baseline as a red result.

The standalone Wasm lowerer itself calls `observesFunctionSource(ast)`
before lowering (`src/wasm-i32.js`, source guard within
`lowerWasmI32Functions`). When the new User Timing detector returns
true, its raw `functions` count is intentionally zero; the original
counterfactual had incorrectly asserted the lowerer should still
transform observed source. [CI 46144474817](https://github.com/FlareZ123/obfs/actions/runs/46144474817)
exposes that **test-harness mistake** on both OS, not an actual unsafe
compiler output. The corrected counterfactual lowers an otherwise
identical *nonobserved* safe function and reattaches the native observer
afterward, to exhibit what an unsafe bypass would disclose, then checks
that the real compiler refuses the unsafe selection. The new top-level
guard in `src/core.js` for seven selected backends duplicates existing
lowerer checks by design; it is defense in depth, **not evidence that
any of the seven backends previously emitted a source-unsafe program**
after the AST detector correction.

The only runtime-semantic false-safe demonstrated in this report remains
the 21-case native `Performance.mark/measure` structured-clone detail
error text described above. The initial bare mark and record-holder
findings were classifier-only. Strong protection/2.5x/GO claims remain
out of scope.
