# Browser WindowProxy aliases can corrupt eager string decoding

**Status:** Intermediate compiler-correctness result, 18 November 2026.
**Author:** Agent 20. **Branch:** `agent20/browser-window-decoder-alias-20261118`.
This report does not establish increased reverse-engineering resistance.

## Failure mode and scope

The compiler's opt-in COO and default/opt-in SNO string encoding reconstructs
literal UTF-16 content at initialization by invoking ambient
`String.fromCharCode` and `String.prototype.charCodeAt`. A different
earlier module can mutate those intrinsics through a global alias before
the encoded module initializes. The native, literal-bearing program remains
unchanged. The emitted eager decoder can construct a different string.

Previously `src/core.js::mutatesDecoderIntrinsic` recognized direct
`globalThis`, `window`, `self`, `global` and audited
`document.defaultView` paths, but omitted the browser `top`, `parent`,
`frames`, `opener` references and their nested member forms.
The [WHATWG HTML Standard](https://html.spec.whatwg.org/multipage/nav-history-apis.html)
defines these as `WindowProxy` navigation references. The precise target
depends on frame and opener relationships. The fix conservatively treats
them as *possible* ambient-global references, never assuming every
`opener` or parent window is the current global.

## Reproduction and controls

The committed `test/decoder-browser-window-alias.test.js` creates three
CommonJS files and executes native and compiler-generated graphs in fresh
Node 22 children, so intrinsic mutation never affects the testing process.
The first file loads an earlier mutator followed by a literal export.
A representative case emulates a top-level browser with:

```js
globalThis.top = globalThis;
top.String.fromCharCode = () => '?';
```

The native output is `window-alias-protected-literal`; a baseline
COO/SNO eager decoder may instead print `??????????????????????????????`.
The original red run
[44283686918](https://github.com/FlareZ123/obfs/actions/runs/44283686918)
was frozen at source `2f3eb66d53f1c7fae047eedb21854191246fd0e1`:
**10/14 tests failed on both Ubuntu and Windows**. Two of those failing
tests used a Node `window.parent` shim that omitted `parent` and were
**fixture defects**, not proven compiler mismatches. The other **eight**
failures exercised four correctly provisioned aliases in two modes.
The prepatch `frames` tests and the two harmless-Number controls
passed. This distinction prevents overclaiming ten independently
established compiler defects.

The initial compiler guard change in
`bd64ba8c08bd4053bbd767fd038aab7df9870bfc` made all correctly
provisioned unsafe cases pass, while exposing the two misconfigured
`window.parent` witnesses. The fixture was repaired by explicitly
assigning `globalThis.parent=globalThis` in the Node simulation.

The decisive postpatch
[run 44284671871](https://github.com/FlareZ123/obfs/actions/runs/44284671871)
at exact source `fdbaada9f40ee4a2353d620160c7dbd9142fa781`
passed **14/14** focused child-process tests on each OS; both production
and fixed-arity JSDoc gates passed alongside the existing neighboring
string-decoder compatibility tests.

The separate `test/decoder-browser-window-alias-browser.js`
executes *real top-level Chromium ESM graphs* via a local HTTP server,
with original and emitted assets served on separately instantiated pages.
For each of `top`, `parent`, `frames`, and `window.top`, Chromium
reported the exact original `browser-window-alias-canary` and zero
encoded literals under the proven unsafe mutation. A fifth Chromium
fixture modified only `top.Number.windowAliasCanary`, preserved the same
original output, and required **one actually encoded literal**. This
positive control ensures the fix has not made string protection vacuous.
The Ubuntu workflow log records all five actual browser observations.
The Node fixtures also require one encoded literal after an unrelated
Number mutation in both COO and SNO.

## Change and interpretation

The code change adds the four browser global-reference candidates to
`globalNames` and recursive `isGlobal` member recognition in
`src/core.js::mutatesDecoderIntrinsic`. No new runtime code is added
to accepted outputs; the compiler may deliberately disable eager
string encoding for additional uncertain programs.

The compile-time guard strengthens behavioral preservation only in
the tested scope. The emitted XOR string table remains statically
recoverable by an attacker with public output. The true browser
prepatch case was not run in Chromium in this record: the first red
comparison uses explicit Node WindowProxy shims, while Chromium verifies
the *postpatch* browser semantics. The security objective, independent
tamper resistance, and universal strict 2.5x runtime bound remain
unproved. A workload-specific performance comparison is still required
before enabling the decoder in production.

## Long decoder-path follow-up, 18 November 2026 10:37 UTC

The initial witness used a short literal and the `String.fromCharCode`
reconstructor. The independent follow-up
`test/decoder-windowproxy-chunked.test.js` exercises a **2,049-unit**
payload, which causes the compiler's default long-string chunk/spread
decoder path. It mutates `top.String.prototype.charCodeAt`,
`parent.String.prototype.charCodeAt`,
`top.Array.prototype[Symbol.iterator]`, and
`window.parent.Array.prototype[Symbol.iterator]` in an earlier
CommonJS file. Both COO and SNO outputs must preserve the exact
native SHA-256 and output length, with **zero eligible encoded literals**
after these modifications. The unrelated `top.Number` property
write is a positive control requiring **one actual long encoded literal**
in both modes.

The two-platform focused
[run 44286888489](https://github.com/FlareZ123/obfs/actions/runs/44286888489)
passed all ten new child-process tests, adjacent existing decoder tests,
the production and fixed-arity JSDoc gates, and the earlier live Chromium
short-string suite. It adds evidence for a separate decoder mechanism,
without implying that the large-string workload satisfies the universal
2.5x budget or that the long-string mutation was independently reproduced
in Chromium. The compiler itself was unchanged after the first fix.
