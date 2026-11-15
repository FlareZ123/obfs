# SCO response seed disclosure and source-only normalization

Date: 2026-11-15  
Researcher: Agent 10  
Status: intermediate implementation and adversarial evidence, not a security certification

## Scope and threat model

SCO controls an independent server, while a client adversary can inspect all delivered JavaScript and make unlimited legitimate requests. The server may retain secrets that are never distributed. This experiment evaluates two concrete static attacks on the client-facing portion of the current implementation.

## Finding A: leaked per-request seed permits a bounded offline dictionary attack

The historical `src/sco.js` response ended with the literal comment `/* variant:<48-hex-digit seed> */`. This 192-bit random value was also supplied to `obfuscateFiles` as the per-request seed. With a known filename, a candidate binding-name dictionary and a bounded search over original identifier offsets, the source-only tool `sims/sco-seed-dictionary.js` computes:

```text
salt = SHA256(seed + "/" + filename).hex()
digest = SHA256(salt + "/" + candidateOffset + "/" + candidateName).hex()
generated = "_v" + digest.substring(window, window + 12)
```

The identifier renamer probes up to 12 overlapping windows. A match against an observed generated identifier exposes a candidate original name and declaration offset. The exercise does not execute the target program, and the attacker does not need the original source. For the bounded fixture, recovered names are substituted into the transformed program and the result is checked by a JavaScript VM.

Reproduction: `test/sco-seed-dictionary.test.js`. It tests two actual renamed bindings, a missing-dictionary negative case, and input validation. The fixture is purposely small; its success does not establish efficient recovery of arbitrary names without a dictionary or without a seed.

**Mitigation committed:** `src/sco.js` now ends served JavaScript with `response.end(varied)`, retaining the request seed only server-side. See commit `3fecf250`. This removes the disclosed seed and its specific straightforward dictionary attack route while leaving client-visible source and outputs available. The absence of a seed comment is asserted by a real HTTP test.

## Finding B: request-time literal spelling variation is statically canonicalizable

`sims/sco-variant-normalize.js` parses the output AST, normalizes predictable generated identifier names using the existing `sims/offline-normalize.js` utility, and emits canonical JSON spellings for source string-literal values. The tool also accepts historical seed-marked responses for comparison. It executes no target JS.

`test/sco-variant-normalize.test.js` fetches independently generated SCO versions over HTTP. It checks that they execute equivalently in an isolated VM and that the source-only canonicalizer collapses this tested variant family to identical readable source with the plaintext literal. This remains true after the seed-comment removal. The test demonstrates that cosmetic literal spelling variation alone does not confer strong static resistance.

The test does not implement a generalized decompiler or prove that every future SCO transformation can be canonicalized. Separate server-resident RPC implementations remain outside the delivered code.

## Correctness fixes made during the same investigation

- `src/core.js`: the opt-in eager string decoder now opts out after file-group mutations of ambient `String` through simple aliases, transitive aliases, destructuring, `Reflect.get`, or known dynamic compiler references. `test/ambient-string-alias.test.js` runs true multi-file CJS fixtures in isolated Node processes.
- `src/sco.js`: request-time string spelling variation respects `observesFunctionSource`. `test/sco-source-observation.test.js` exercises HTTP plus `Function#toString` observations and checks that safe unobserved literals may still vary.

These are syntactic, fail-closed guards. They are not complete interprocedural proofs for arbitrary dynamic mutation and source introspection.

## Validation

Manual Node22 Windows and Ubuntu validation with JSDoc type checking, finite benchmark samples, and Ubuntu Chromium passed for:

- Alias safety: [43682859451](https://github.com/FlareZ123/obfs/actions/runs/43682859451)
- Dynamic compiler extension: [43683148213](https://github.com/FlareZ123/obfs/actions/runs/43683148213)
- SCO source-observation guard: [43683329396](https://github.com/FlareZ123/obfs/actions/runs/43683329396)
- Static SCO canonicalization before seed-removal: [43683551502](https://github.com/FlareZ123/obfs/actions/runs/43683551502)

The seed-removal and dictionary reproducer ran in [43683982449](https://github.com/FlareZ123/obfs/actions/runs/43683982449): all behavior tests passed, but the **overall workflow failed** strict JSDoc checking for a concurrent SCO route-validation nullability regression (`src/sco.js:257-258`). Agent 18 was notified in `communications/agent18/2026-11-15T0609Z_agent10_sco-null-narrowing.md`; this is pending full revalidation. Do not cite this run as a completed validation pass.

## Performance and limitations

Removing a trailing source comment has no additional runtime computation. The alias/source-observation guards run at transformation time and can conservatively exclude an obfuscation pass; the benchmark samples remain insufficient to establish a universal 2.5× bound. Static canonicalization and seed leakage are independent weaknesses: withholding the seed makes the specific dictionary calculation impractical offline, but client source is still inspectable and native runtime instrumentation remains available. Any SCO security claim should distinguish server-resident authenticated operations from shipped source obfuscation.
