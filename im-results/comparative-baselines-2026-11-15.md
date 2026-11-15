# Comparative obfuscator baseline evaluation (2026-11-15)

Status: **intermediate evidence**, not an established academic result. Reproduction scripts live in `sims/` and `test/`. The shared repository has two concurrent baselines:

- `src/`: Acorn-based primary CLI with string encoding, local and direct ESM cross-file property renaming, SCO per-request mutation, SNO local manifest checks, and COO host checks. Maintained by Agent 7 and contributors.
- `lib/`: TypeScript Program/checker-backed alternative, source-preserving own-property renaming, authenticated SCO builder, and COO/SNO build helpers. Maintained by Agent 1; callable through `require('./lib/transform')` and `require('./lib/build')`. This is a comparison implementation, not the main CLI.

These are prototypes with different interfaces and safety analyses. No independent evidence establishes which yields a superior security-performance tradeoff at this point.

## Independent threat dimensions

| Dimension | Evidence and limitations | Provisional assessment |
| --- | --- | --- |
| Static reconstruction | `test/attack.test.js` demonstrates that the TypeScript variant's deterministic hashed property names can be normalized with `sims/reconstruct.js` without access to the original source or secret seed. Primary `src/` string encoding uses an in-file decoder. | Weak static concealment |
| Dynamic instrumentation | The adversary can inspect scripts and instrument a complete browser or Node runtime. Neither baseline has a measured anti-instrumentation defense. | No demonstrated resistance |
| Modification / integrity | SNO local hash manifest and COO local host checks are controlled by the attacker under the prescribed threat models. SCO's private HTTP builder requires a bearer token, but issued scripts are inspectable. | Local gates are bypassable |
| Authorized-environment execution | COO observes `location.hostname`; this can be replaced. SNO reads local process metadata or hashes, both attacker-controlled. SCO could keep server-side secrets and enforce server authorization, but client-delivered JS can be replayed. | Limited to real server trust boundary |
| Performance | Four Node 22.16.0 property-mangling microbenchmarks after warmups; see below. Each workload performs at least one property rename, and all observed median ratios are below 2.5. | Supported only for measured workload sample |
| Behavioral compatibility | Local TypeScript alternative: 37 Node tests passed and one optional Chromium test skipped after the latest soundness fixes; see `test/transform.test.js`, `test/modes.test.js`, `test/attack.test.js`. Agent 7's independent primary suite and Agent 2's manually dispatched CI tests supplement the evidence. | Partial, broad JS semantics remain unproved |

## Reproducible Node runtime evidence

Run `node sims/benchmark.js` from an installed checkout. Median of eleven warmed trials for each original and modified function. Each function is called with 3,000,000 loop iterations, interleaving original/modified timing order. The updated benchmark asserts at least one property was transformed, preventing misleading no-op ratios.

| Workload | Properties renamed | Original median ms | Modified median ms | Ratio |
| --- | ---: | ---: | ---: | ---: |
| numeric update | 2 | 5.851 | 5.692 | 0.973 |
| alias update | 1 | 6.070 | 5.946 | 0.980 |
| string-key bracket update | 2 | 4.889 | 5.001 | 1.023 |
| direct helper call | 1 | 2.974 | 4.918 | 1.654 |

The complete captured run and source SHA-256 hashes are in `im-results/baseline-performance.json`. Ratios are observations under a specific Node/V8/runtime environment, not calibrated performance guarantees. Browser performance has not been measured.

### Primary COO cold-start budget violation

Agent 2 independently ran the primary Acorn string-encoder in isolated fresh VM realms, with property renaming disabled. [`coo-cold-start-budget-2026-11-15.md`](coo-cold-start-budget-2026-11-15.md) records ratios **2.7412×**, **30.6009×**, and **32.1773×** on 4 KiB, 64 KiB, and 256-string workloads respectively (manual CI run [43677098108](https://github.com/FlareZ123/obfs/actions/runs/43677098108)). Those workloads exceed the 2.5× COO ceiling. The property-only microbenchmarks above cannot establish budget compliance for the main CLI's eager string decoder. The encoder requires a workload-aware mitigation and a successful retest.

## Correctness counterexamples found and mitigated

The TypeScript alternative initially renamed properties when aliases could leak via:

1. An implicit `arguments[0]` reference to an explicit function parameter.
2. Rest and destructured function parameters, or async/generator return wrappers.
3. Computed lookup of an exported binding accessed through an ESM namespace, dynamic import, CommonJS `require`, or reexport.
4. An identity helper's return value passed through an arrow function's implicit return.
5. Replacement of an initially primitive own property with a function that uses `this` and reflective enumeration to observe key names.
6. Indirect `eval` or `Function` lookups through computed global-object keys (partially guarded, since arbitrary dynamic evaluation remains undecidable in general).
7. Deleting an own key and revealing an inherited prototype getter with the original name.
8. Overwriting a property through destructuring or for-of assignment targets, which ordinary direct-write analysis misses.

Focused regressions in `test/transform.test.js` now force such objects to retain their source property names. For example, `const a={secret:1};a.secret=function(){return Object.keys(this)[0]};console.log(a.secret());` must retain the `secret` key after transformation.

The TypeScript guards reject common implicit aliases and dynamic lookups. They do not constitute a complete proof for arbitrary JavaScript, particularly reflective source introspection or deeply indirect dynamic evaluation.

The shared manual Windows/Linux validation run [43676810363](https://github.com/FlareZ123/obfs/actions/runs/43676810363) exposed about twenty behavioral regressions in the primary implementation, including reflection, async identity, scope, and module resolution. See `test/property-reflection.test.js`, `test/cross-file-ambiguity.test.js`, and Agent 3's broadcast for reproductions. This is a validation blocker until retested after repairs.

Agent 2 separately found lexical-containment and exported-alias hazards in the Acorn baseline, with evidence in `test/lexical-scope.test.js` and `test/exported-alias.test.js`. These proofs should be compared against the TypeScript implementation in a shared mutation corpus.

## Differential fuzzing

Run `node sims/fuzz.js`. The deterministic 33-case default corpus, seed `0xC0FFEE`, exercised 28 property renames after the last repair and reported zero value/output mismatches. It checks aliases, helper calls, implicit arguments, rest, reflection, spread, mutation, computed keys, unsafe escapes, and identity forwarding. Use `OBFS_FUZZ_ROUNDS` to scale it; each round takes substantial compiler time. This is regression evidence, not a statistical guarantee of soundness.

## Outstanding blockers and investigation priorities

- Establish a common canonical API and run the same differential corpus against both `src/` and `lib/`.
- Compare strict semantic safety around indirect calls, closures, module identity, prototype mutation, getters/setters, and `Function.prototype.toString` introspection. General source-level observation cannot be guaranteed identical while rewriting source text.
- Measure browser ESM graphs in a real Chromium/Firefox/WebKit matrix. The current local browser host failed to start; an attempted Playwright connector returned an availability error.
- Add reproducible adversarial static and dynamic extraction measurements beyond simple name normalization. Evaluate selective virtualization, code splitting, remotely held secrets, and server-only execution with separately measured initialization/runtime costs.
- Validate published package dependencies and both CLIs from a clean Windows 11 install, including NodeNext ESM interop and filesystem constraints.
- Preserve the 2.5× runtime budget for every representative workload; make security and speed tradeoffs explicit.

No claims from this report have been promoted to `results/` as novel research.
