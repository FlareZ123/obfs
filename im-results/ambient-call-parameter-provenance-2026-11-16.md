# Ambient host capability through local call parameters: paired semantic regression

**Agent 4, 2026-11-16. Engineering intermediate result.** This note reports exact Node ESM original-versus-generated behavior under a declared, source-visible global Reflect mutation and an unchanged opaque host preloader. It is not evidence of strong obfuscation or a complete source/host effect proof.

## Frozen witness and violation

The three-file test graph in `test/closed-record-visible-reflect-overwrite.test.js` exports `state={secretField:41}` from `state.mjs`. A separate `record.mjs` invokes `Reflect.ownKeys` on an unrelated local schema. The entry module receives `globalThis` as a direct call argument, or forwards it one local function farther, and destructures its `Reflect` property through a computed formal parameter:

```js
function replace({['Ref'+'lect']:cap}) {
  cap.ownKeys = globalThis.HOST_REFLECT;
}
replace(globalThis);
```

The test-only `preload.cjs` defines `HOST_REFLECT`; when `record.mjs` inspects its schema, that callback dynamically imports `state.mjs` and records `Object.keys(ns.state)`. Native execution prints `[41,"audit-v1",["secretField"]]`. At compiler commit `bbd86c71c24d5c06c25af47eb8d1319e8eca3e37`, after adding tests only, emitted execution instead observed randomized `_p...` owner keys. The compiler had counted one unsafe renamed exported owner key.

The [pre-fix pinned application workflow 43892388977](https://github.com/FlareZ123/obfs/actions/runs/43892388977) recorded **four failures** on Ubuntu at these exact independently parameterized cases: direct function declaration, one-hop forwarded function declaration, arrow function and one-hop forwarded arrow function. The failure is observed output parity, not an inferred vulnerability merely from changed source text. An unrelated ordinary-record parameter fixture remained a nonvacuous safe one-key positive.

## Change and validation

At compiler commit `30b7178018514b7cbde233d803200dd9c8ee60c5`, the cross-file own-record exception uses a bounded callsite-to-formal-parameter provenance transfer for uniquely named local function declarations and direct `const` function/arrow initializers. The pass joins ordinary identifier assignments, direct local-call forwarding and object-pattern extraction until its ambient-root and host-capability sets reach a fixed point. The four original witnesses now preserve owner spelling and native output. The unrelated ordinary-record function retains **one actual safe cross-file property rewrite**.

The [post-fix pinned application workflow 43892841749](https://github.com/FlareZ123/obfs/actions/runs/43892841749) passed all three named jobs: Ubuntu, Windows and Ubuntu legacy Node 22, with the declared-reflection regressions, strict JSDoc, frozen application adversarial tests, whole-process sample profile and Ubuntu real Chromium checks. This is an observed green integration at its exact source SHA. It is not a universal semantic or 2.5× bound. The four negative tests execute real Node ESM in spawned subprocesses on Ubuntu/Windows; the browser suite is a separate integration workload.

## Explicit limitations

The new dataflow is lexical-name based and limited to direct local function calls with syntactically identifiable definitions. It is not a general lexical-binding identity, imported-call, method-call, closure-return, Proxy, dynamic-dispatch, or arbitrary function-effect analysis. It conservatively refuses unsafe owner renaming when the tracked capability can mutate an intrinsic; unrelated source-safe reads can still be transformed. Ambiguous callers and external runtime effects need a more general sound proof or refusal. The `closedWorld` flag still supplies only a declared module graph, not a trusted runtime boundary.

The host callback's ability to import and enumerate public COO owner objects illustrates the lack of client-side secrecy under the stipulated full-control attacker. The compiler change repairs native/generated behavioral parity for the specified cases; it does **not** materially increase measured attacker cloning cost.

## Reproduce

At the red and green SHAs linked above, execute the repository's `manual-application-challenge.yml` workflow from a manual GitHub Actions dispatch. To run locally on Node 22 after `npm install`:

```powershell
node --test test/closed-record-visible-reflect-overwrite.test.js
npm run typecheck
```

The workflow also executes the named protected-work yield and reflection adversary scripts. Compare the actual `compiled.crossFile.properties` assertions and original-versus-emitted stdout for each case; count the distinct unchanged negative graph and unrelated positive separately.
