# SCO native Error stack across realms: catch destructuring and first-class carriers

**Date:** 2026-11-17. **Agent:** 29. **Status:** intermediate semantic correctness hardening; native VM witnesses reproduced locally, compiler regression validation pending.

## Threat and observation

Selective SCO moves an async private export into the server realm while retaining public code in the original client realm. V8 native Error stacks include source filename and call-site coordinates. Under identical source code, `vm.runInNewContext(..., {filename:'client.mjs'})` and `vm.runInNewContext(..., {filename:'server-private-long.mjs'})` can return different JSON-visible strings. This is a relocation-correctness concern, independent of source secrecy.

Two source shapes evade the existing simple identifier-based `isStackReceiver` origin check:

1. Direct catch parameter extraction: `try { throw new Error('tag'); } catch ({stack:trace}) { return trace; }`. Constant-computed `['sta'+'ck']`, unknown computed `[key]`, and nested `{stack:{length}}` variants are native-observable.
2. First-class Error carriers: `({err}).err.stack`, `[err][0].stack`, passing `new Error` to a local reader, and a Proxy with explicit forwarding `get` trap. These paths can read the source-origin stack through a receiver no longer recognized as an Error instance.

The native Node 22.16 VM experiment compared the same expression at two filenames. Each of four catch variants and four first-class carrier variants exposed a differing stack string or stack-string length. For the Proxy variant, `new Proxy(err,{})` yields `undefined` for `stack` on this V8 host, so the valid observed witness uses `{get(target,key){return target[key];}}`. This negative control matters: generic Proxy behavior cannot be assumed to forward this accessor.

## Narrow compiler intervention

- At `5fc8d23ed2d9154940ab8d9fbfac268aef4c60b3`, `src/sco-selective-partition.js` began refusing catch parameter `ObjectPattern` reads with literal `stack` or unknown computed keys. `test/sco-catch-destructure-stack.test.js` exercises four refusals and three positives. New-test ESM newline escaping corrected at `f377fd52154d71a8bf0042a6e526a4c900701f3e`.
- At `68feb41aaee4990e6fce1037d85a6035c3264fc6`, a narrow `returnsError` first-class escape guard treats Error-origin values in object-literal property values, array elements, and call/new argument lists as an unproved stack exposure. `test/sco-error-carrier-realm.test.js` exercises four refusals and four admitted direct-message/local-stack controls.

These rules intentionally decline additional benign cases, including a caught literal record with a field named `stack` or a direct `String(new Error(...))` call. They improve conservatism within a static contract while lowering admissible private-work coverage for some inputs. Neither adds obfuscation strength or hides execution from a legitimate online SCO relay.

## Evidence and validation boundaries

- Node 22.16 local VM native witnesses: eight paired expressions, each compared at `client.mjs` and `server-private-long.mjs`; differences reproduced. The raw individual stack strings depend on runtime/filename and were not treated as an independent compiler red gate.
- Manual full [Linux/Windows Node 22 and Ubuntu Chromium run 44139327279](https://github.com/FlareZ123/obfs/actions/runs/44139327279) was dispatched for exact `f377fd52`, containing only the catch-pattern guard, **pending at time of writing**.
- `68feb41a` includes the additional carrier guard and requires a fresh exact-source test/typecheck pin. Existing historical green workflow runs cannot validate either modification.

**Unresolved:** This finite provenance model does not prove every Error escape, especially functions stored in objects, heap aliases through assignments, and dynamic extraction via deliberately opaque helpers. Runtime-observable `Error.prepareStackTrace`, overridden intrinsics, and diverse browser engines further bound the claim. Full source-graph semantic equivalence and the project's universal 2.5x runtime restriction remain unproved. The relevant long-term direction is origin/escape effect analysis with measured false-refusal and protected-work yield, rather than an ever-growing collection of syntactic special cases.
