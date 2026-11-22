# Host-owned V8 stack formatting observes a transformed private helper (22 November 2026)

**Status:** bounded adversarial and source-parity evidence. **Release implication:** strong-protection release remains blocked.

## Source and reproduction

The test-only branch `agent1/node-stack-source-boundary-20261122` committed the executable regression at
[`3b14bbd8a43697b19c9d4f40ee12111b4ae277a4`](https://github.com/FlareZ123/obfs/commit/3b14bbd8a43697b19c9d4f40ee12111b4ae277a4).
The original test is `test/node-stack-private-callable-source-boundary.test.js`.
The [source-pinned focused run 45081010384](https://github.com/FlareZ123/obfs/actions/runs/45081010384)
passed on Ubuntu and Windows with strict project/external JSDoc checks.

Both operating systems printed:

```json
{"mode":"sno","renamedBindings":1,"nativeResult":17,"obfuscatedResult":17,"sourceRecovered":true,"sourceIdentical":false}
```

The compiler input is a CommonJS module with a private `privateHelper(secretLocal)` function, one call from the exported `publicReader`, and an ordinary `Math.random()` use. The compiler is invoked with `mode:'sno'`, identifier rewriting enabled, property and string rewriting disabled, and `preservePublicCallableSource:true` supplied. On the tested mainline source, this setting does not protect the private helper from the identifier rewrite. The output has one genuinely renamed binding and no original `secretLocal` spelling.

Before each native/transformed VM execution, the controlling Node host assigns a replacement `Math.random` that accesses `new Error().stack`. The host also assigns `Error.prepareStackTrace` to locate the active `privateHelper` frame, extract `CallSite.getFunction()`, and format that function with `String(function)`. Both executions return the number 17. The host nevertheless obtains each live helper's complete source text, observing the different parameter spellings.

V8 documents the [structured stack trace API](https://v8.dev/docs/stack-trace-api), including host-supplied `Error.prepareStackTrace` and `CallSite` function access. The demonstrated behavior depends on V8/Node, the tested synchronous non-strict function shape, and a host able to replace intrinsics before execution. Other frames (including certain strict-mode and async frames) can hide their function references.

## Interpretation

An unexported, direct-call-only helper is not intrinsically source-secret from a fully controlling Node runtime. The compiled function is live, and the host can trigger stack inspection through an otherwise ordinary ambient call. A compiler proving lexical non-escape alone cannot infer that a hostile process cannot observe it. This is also a native-versus-emitted source-observation mismatch under a shared instrumentation host, despite identical value output.

For the supplied SNO threat model, the attacker already controls files, loader, memory and runtime; this experiment illustrates one additional dynamic extraction mechanism. It does **not** show recovery of the original pre-obfuscation source, arbitrary function extraction, a new static deobfuscation technique, universal cross-engine behavior, independent host admission, or a measured 2.5× performance result. An ordinary minifier control has not been run for this fixture, and no incremental obfuscation-security claim follows.

## Implications for the canonical source contract

The canonical current-main integration in [PR #299](https://github.com/FlareZ123/obfs/pull/299) is a separate candidate branch. This evidence is from the stated mainline test source; it does not by itself evaluate or invalidate PR #299's optional public source contract. Where an application promises strict source-byte parity to external host instrumentation, private direct-call-only selection needs an explicit host trust assumption or a refusal. Where source-byte parity is outside the application contract, this is a threat-boundary observation rather than a code defect. The independent runtime extraction evidence should remain in `im-results/`.

## Second test: host-visible source changes an observed result

A focused follow-up added a second fixture at exact test SHA
[`2dec566dc1d13d88fe4c8a935790418200cd73be`](https://github.com/FlareZ123/obfs/commit/2dec566dc1d13d88fe4c8a935790418200cd73be).
[Two-platform run 45081214457](https://github.com/FlareZ123/obfs/actions/runs/45081214457)
completed **SUCCESS** with strict JSDoc. The host's replacement `Math.random` now
returns `Number(capturedFunctionSource.includes("secretLocal"))` after triggering
the same stack formatter, making the native and transformed calculations depend
on the function's source spelling.

Both operating systems confirmed the deliberate native-versus-emitted value
discrepancy:

```json
{"mode":"sno","nativeResult":18,"emittedResult":17,"sourceVisibleToHost":true}
```

This gives an executable **semantic parity counterexample under a controlling
V8 host** for the selected identifier renaming, alongside the first test's
value-preserving source-extraction observation. It relies on a deliberately
source-sensitive external hook and does not establish that ordinary unmodified
`Math.random` changes output. An attacker with the specified SNO full process
control could create the hook; a compiler cannot simultaneously preserve
arbitrary externally observed function-source spelling and rename that
spelling. Deployment must explicitly define whether such host-controlled
source observers fall within its claimed compatibility contract. It does
not expand the static attack capability or demonstrate a source secrecy gain.


## Real Chromium COO source-dependent execution

A separate source-pinned real-browser test at
[`ffe01596e7f140fa34f2628e3fde4ae276e95e97`](https://github.com/FlareZ123/obfs/commit/ffe01596e7f140fa34f2628e3fde4ae276e95e97)
proves the same V8 observer mechanism in **client-only browser execution**:
`test/coo-stack-private-source-browser.test.js`. [Focused validation
45082169462](https://github.com/FlareZ123/obfs/actions/runs/45082169462)
completed **SUCCESS** on Ubuntu/Windows; the browser test executed in real
Google Chrome on Ubuntu and intentionally skipped browser execution on Windows.
Strict project/external JSDoc steps passed. Its Ubuntu execution printed:

```json
{"nativeValue":18,"emittedValue":17,"nativeSourceCaptured":true,"emittedSourceCaptured":true,"renamedBindings":1}
```

The original classic script places a private `const privateHelper` arrow inside
a block, calls it once to initialize a top-level lexical result and exposes
only that numeric result to a subsequent script. The obfuscator, invoked with
`mode:'coo'`, transformed exactly one binding. The host page installed an
`Error.prepareStackTrace` callback before loading the unmodified or obfuscated
JavaScript. A replaced `Math.random` inspected `CallSite.getFunction()` during
the helper's direct execution and returned 1 when the captured source contained
the original parameter spelling. The native value was 18; emitted was 17.

The host is deliberately privileged, as assumed by COO's attacker model.
This checks the correctness boundary for arbitrary host-supplied source
observers and demonstrates access to the **emitted** function source. It does
not recover the original source bytes from an obfuscated binary without having
the native baseline or determine resistance relative to a minifier.

### Positive-yield fixture selection

The [diagnostic admission matrix 45082043932](https://github.com/FlareZ123/obfs/actions/runs/45082043932)
at `22452b3c3eef78bf62119bb188e395c0fd69f796` passed on both Node22
operating systems. It distinguishes one block-scoped classic script candidate
(`bindings=1`) from an inline IIFE candidate (`bindings=0`) and confirms
that neither is source-observing by the local AST proof. Earlier browser
hypotheses `ad838cfdbafe3da4ff52698d63af2481869853dc`,
`36725f0b3502ed98060d310615cf64ed114b9664` and
`c360b55031319ed801f2681802642c8ff397a75b` deliberately asserted
nonzero yield and **failed** before executing the browser. They cannot serve
as source-parity counterexamples. The block-scoped fixture is the real,
measured compiler-positive case.

## Strict-mode boundary

The SNO test was extended at
`108ec55024c2d2c90a2da98c6139a2decf601e2b` with a strict-mode
negative control. [Run 45082176617](https://github.com/FlareZ123/obfs/actions/runs/45082176617)
passed all three SNO cases on Ubuntu and Windows, including the assertion
that V8 `CallSite.getFunction()` returns `undefined` for the tested strict
helper frame. The result narrows the current extraction witness: it is
effective for the demonstrated non-strict synchronous shapes. The full-control
SNO attacker retains other memory/debugging capabilities outside this API.
