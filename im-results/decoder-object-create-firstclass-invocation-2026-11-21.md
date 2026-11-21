# First-class Object.create call paths and long-string decoder provenance

**21 November 2026. Agent 1. Status: intermediate semantic compatibility evidence.**

## Program and threat boundary

ECMAScript `Object.create(prototype, propertiesObject)` accepts property descriptors that can install getters. Standard function invocation mechanisms `Function.prototype.call`, `.apply`, `.bind`, and `Reflect.apply` can all invoke the same callable after the method is detached or forwarded. See [MDN Object.create](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/create), [MDN Function.bind](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/bind), [MDN Function.apply](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/apply), and [MDN Reflect.apply](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Reflect/apply).

The experimental `test/decoder-object-create-invocation.test.js` matrix runs a three-module CommonJS graph: the entry first requires a mutator, then requires a separate target exporting a 2,049-character literal. The mutator installs an accessor returning `String.prototype`, then overwrites its `charCodeAt` before the target is imported. Native and obfuscated graphs run in separate real Node 22 child processes; the asserted contract is identical exit status, stdout and stderr. The long-string transformation metric is also checked, **after** process-level output parity.

Each of nine independently described call shapes is crossed with COO and SNO, and with an unsafe String.prototype accessor versus a harmless Number.prototype control: 36 cases. The positive controls require one encoded long-string literal and remain evidence of nonzero compatible decoder yield. The unsafe cases require refusing eager decoding if the getter can expose a mutable decoding intrinsic.

## Pinned before-fix result

The source `d50c55b1023484cea85143df174f1b1a105503e9` includes the separate direct-Object.create and captured-method alias guards under development, plus this new 36-case test, before its own generalized first-class invocation patch. [Linux/Windows manual-validation run 44932055948](https://github.com/FlareZ123/obfs/actions/runs/44932055948) completed.

On **both Ubuntu and Windows**, 16 first-class invocation cases failed, precisely the eight unsafe String.prototype variants times two modes. The 18 matched Number.prototype positive controls and the two-hop direct const-alias checks passed. The failing families were `Object.create.call`, `.apply`, `Reflect.apply(Object.create,...)`, direct or captured `.bind`, method stored in an object literal, later holder-property assignment, and `const {create}=Object` destructuring. Both native and emitted processes exited normally, but their stdout differed.

Full Node suite context: Ubuntu 4,142 pass / 23 fail / one skip, Windows 4,138 pass / 24 fail / four skip, out of 4,166 each. Seven other failures existed in earlier source-paired candidate runs. Windows also failed a separate `paired server-only WebAuthn signature verification CPU screen` in this run; it is not part of the first-class semantic regression and requires its own independent baseline. Do not call these whole suites green.

## Bounded candidate and limitations

An experimental compiler patch `24d06038960149e5393e7307b435e133ff4c1e4d` tracks statically visible aliases of the native `Object.create` method and simple object-holder fields, extracts property-descriptor argument positions through direct `call`/`apply`, `Reflect.apply`, and `bind` routes, and reuses the existing accessor return-provenance predicate. [Manual run 44932548115](https://github.com/FlareZ123/obfs/actions/runs/44932548115) completed on Ubuntu and Windows. **All 36 first-class invocation cases passed on each OS, including all 18 Number.prototype positive-yield controls and native/emitted process parity.** The seven recurrent unrelated Node tests were the only Node failures. Ubuntu: 4,158 pass / 7 fail / one skipped; Windows: 4,155 pass / 7 fail / four skipped (out of 4,166 each). Both JSDoc typechecking gates passed; the full workflow remained red because of unrelated Node and browser integration failures. This source-pinned result establishes a scoped compiler correctness repair, with no universal soundness or adversarial-runtime claim.

This is a compile-time decoder-admission change, not a runtime anti-debugging or tamper mechanism. Finite known-call matching remains incomplete for `bind` with pre-bound arguments, forwarding through opaque functions, dynamically computed holder keys, cross-file method forwarding, arbitrary `Proxy` traps, and replacement of built-in reflective methods. The 2.5x runtime ceiling has not been established for arbitrary workloads by these tests.

The project-wide strongest-obfuscation release gate remains **RELEASE-BLOCKED**, irrespective of whether this scoped bug is repaired.

## Suggested follow-up

Prefer one coherent family of differential tests and a documented fail-closed inference rule over an endless list of syntax-specific patches. For any new call route, require a native/emitted observable mismatch before expanding the compiler, retain matched Number.prototype controls, and compare the number of transformed literals so over-refusal remains visible. Treat dynamic invocation routes whose effects cannot be proven as unresolved.
