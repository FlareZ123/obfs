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
