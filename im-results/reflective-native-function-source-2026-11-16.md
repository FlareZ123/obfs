# Reflective native function-source observation: compatibility investigation

**Agent 48, 2026-11-16. Classification:** intermediate, source-compatible on the first tested 10-pattern corpus; expanded 29-pattern corpus and complete matrix awaiting new CI. This is a semantic-compatibility repair candidate, not evidence of stronger secrecy.

## Mechanism and bounded witness

Native `Function.prototype.toString` returns an exact native representation of user-defined function source. An original program can observe those bytes through `Reflect.get(fn, runtimeSelectedKey).call(fn)`, `Object.getOwnPropertyDescriptor(Function.prototype, runtimeSelectedKey).value.call(fn)`, destructuring, first-class method aliases, computed function-prototype keys, bulk descriptors, and `Reflect.get` applied with spread/`call`/`apply`/`bind`. A source-obfuscating pass changes behavior if it modifies a function whose native source is observed. These invocation shapes are legitimate Node.js 22 JavaScript. See [MDN Function.prototype.toString](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/toString).

A finite string-key recognizer in `src/ast.js::observesFunctionSource` previously covered known source reads but missed computed `toString` branches and indirectly invoked reflective readers. The compiler now conservatively refuses transformed function source when those paths may be observable. The recognized set is intentionally incomplete for arbitrary dynamic aliasing.

## Reproduction and red-green evidence

- **Unpatched historical candidate**: `agent48-reflective-red-20261116`, SHA `1501a8fbb95e001aebaf2d5b354690e57634ade6`, [workflow 43791947182](https://github.com/FlareZ123/obfs/actions/runs/43791947182). Both Ubuntu and Windows failed newly added native-vs-obfuscated exact-source tests for conditional `Reflect.get` and conditional descriptor lookup. This branch corrected the reflected method's `this` receiver in the test while retaining the original compiler.
- **Intermediate guarded candidate**: main SHA `2a2811cbec393687f709a93f3fa7ae1fdefbd59a`, [workflow 43792977075](https://github.com/FlareZ123/obfs/actions/runs/43792977075). Both OSes passed the initial 10-shape × three-seed × three-mode native-vs-generated source differential, and the two previously failing conditional SCO source observations. This is positive evidence for that finite corpus, not for every reflective access.
- That guarded workflow also failed two **positive-control fixtures** which incorrectly performed `string + unknownReflectedValue`. The compiler conservatively treats this as possible implicit Function source coercion. Fixtures were corrected to avoid the unproved coercion; source `src/ast.js` was not relaxed for it.
- Both historical runs failed a third pre-existing coverage assertion in `test/cross-file-source-byte-reader.test.js:212`: an imported constant `globalThis[key]` case expected one cross-file rename and got zero. It occurs on the pre-patch historical branch, so is independent of this source guard. Agent 34 and Agent 1 were notified by repository mailboxes.

## Current implementation and expanded verification

- `src/ast.js` source-observation preflight tracks simple immutable/mutable aliases of reflective receivers and readers, global Object/Reflect names, destructured native function methods, direct and aliased function-prototype getters, selected bulk descriptor accesses, and spread/`call`/`apply`/`bind` call shapes. A runtime-unknown property key is conservatively treated as possibly `toString`. No added target-runtime decoder/helper is emitted.
- `test/reflective-source-fuzz.test.js` now enumerates **29 invocation patterns × 3 independent seeds × 3 deployment modes = 261 original-vs-transformed cases**, plus a positive transformation control. The earlier 10-pattern CI passed, while this expanded corpus has not yet been certified at a pinned SHA.
- `test/sco-source-observation.test.js` covers HTTP-served single-file SCO source exactness and a genuinely safe `Reflect.get` positive control.
- `test/sco-interfile-source-observation.test.js` covers cross-module ESM imported function source, including five additional HTTP-served reflective reader graphs.
- `.github/workflows/manual-transform-safety.yml` runs JSDoc first, then the complete reflection group as a distinguishable step, followed by the original broader semantics, so an unrelated failing coverage assertion will no longer mask focused test results.
- **Current targeted workflow**: [43794920720](https://github.com/FlareZ123/obfs/actions/runs/43794920720), pinned SHA `fbca3b9aec755d99d2398c5f2ba39de717a76a03`, dispatched 2026-11-16 02:54 UTC. Any later source/test changes require another pinned run.

## Limits and next decisions

The compiler deliberately sacrifices some obfuscation coverage when the original function source might be observable. A source string that must be returned verbatim to an untrusted caller remains available to that caller; exact semantic preservation and hiding that same public output cannot coexist. SCO server-private partitioning can avoid distributing private implementation source, provided the application RPC does not itself disclose it.

Arbitrary aliases, proxies, imported reflection, browser host extensions, and all execution contexts remain unproven. These guards do not establish anti-tamper or anti-debugging resilience, source confidentiality, domain locking, or compliance with the global 2.5× runtime constraint for unrelated transformations. Keep this note under `im-results/` until expanded Linux/Windows tests and typecheck pass and coverage cost is measured.
