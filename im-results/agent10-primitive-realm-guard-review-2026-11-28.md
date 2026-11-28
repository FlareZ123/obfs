# Agent 10 — independent review of primitive-prototype SCO donor

**Branch:** `agent33/primitive-realm-prototype-guard-20261128`  
**Head:** `9c3b636698050ffb4b069f8518901c130baf0919`  
**Run:** [46177324026](https://github.com/FlareZ123/obfs/actions/runs/46177324026)  
**Disposition:** **not ready to integrate**. Both Ubuntu and Windows fail with 169/173 tests passing.

## Four observed failures

1. **Transitive function-metadata fixture — test 64.**  
   `test/sco-private-child-transitive-identity.test.js:97` fails before the intended metadata refusal. The thrown error is `SCO privateModuleSources must describe exactly the reachable static graph` from `collectPrivateStaticImportClosure` (`src/sco-selective-partition.js:1824`). The fixture supplies `private/a.mjs` and `private/b.mjs`, with `a.mjs` importing `./b.mjs`. Check whether the closure resolver's path normalization or the fixture's `privateModuleImports` declaration is wrong. Do not interpret this as evidence that the metadata guard passed.

2. **Host-effect diagnostic preempted — test 67.**  
   `test/sco-private-host-effect-closure.test.js:79` expects a configuration/entropy/clock refusal, but the new realm-prototype guard fires first with `SCO private static dependency contains realm-local prototype access: private/engine.mjs`. This is still a refusal, but the test no longer demonstrates the specific host-effect classifier. Either preserve the more specific host-effect diagnostic ordering or explicitly widen the test to accept the new earlier refusal while keeping separate tests for the host-effect classifier.

3. **Previously “safe” UTC operations — test 68.**  
   `test/sco-private-host-effect-closure.test.js:103` expects a positive result for `new Date(0).getUTCFullYear()`, then other deterministic controls. A Date prototype method is inherited and can be patched in the attacker-controlled client realm; UTC removes timezone dependence, not prototype-mutation dependence. Refusing this operation is defensible under the SCO threat model. The positive-control list should not treat deterministic output as proof of cross-realm equivalence. Keep explicit tests showing that patched inherited methods are rejected.

4. **Own string index false positive — test 70.**  
   `test/sco-private-host-effect-closure.test.js:148` expects `return "abc"[0];` to be admitted, but the guard throws `Selective SCO cannot partition realm-local prototype access`. This is a real positive-yield regression: an in-range string index is an own indexed property of the string exotic object, not a lookup on `String.prototype`. The implementation appears to intend to whitelist it via `primitivePropertyKey` / `isOwnStringIndex` and `ownStringIndex` in `realmStateObservation`, but the actual fixture disproves that path. Isolate the AST shape and repair the recognition; retain refusal for out-of-range indices such as `"abc"[3]` and for `"abc"[0].toString()`.

## Review guidance

- Preserve the realm/prototype refusal for inherited primitive method reads; the Node vm witness `[7,7,0]` is a valid semantic counterexample for relocation across independently patched realms.
- Do not broaden that refusal to own string length/index reads without a separate counterexample. The current own-index test is a positive control and must remain.
- Treat the Date UTC failures as a threat-model/test-expectation correction, not automatically as a reason to weaken the guard.
- Fix the static graph fixture/closure mismatch independently so the metadata escape test reaches the behavior it is intended to test.
- Do not integrate this donor until the full graph suite and strict JSDoc pass on both OSes and the own-property positive control is restored.

This review distinguishes semantic safety from yield: rejecting inherited methods can be correct, while rejecting a proven own string index is an unnecessary loss of transformation coverage.
