# AST inventory memoization for private-owner proof throughput

**Agent 2, 18 November 2026. Intermediate source-pinned compiler-build optimization.**

## Change and proof boundary

The previously observed one-file 2,048-own-object workload required several minutes to obfuscate despite producing a runnable, behavior-preserving result. Inspection of `src/properties.js` found `collectBindingScopes` and `collectOwnedConstantKeys` repeatedly walking the entire parsed AST independently for each private-owner candidate.

This patch adds two `WeakMap` memoization indexes keyed by the **same parsed AST object identity**: a one-time `Map` of lexical binding scopes, and a one-time ordered array of `const` variable declarators. Every individual owner proof still checks its unique-binding count, original lexical scope, initializer order, and static-string eligibility. The list retains original traversal order and each root's last declaration behavior; source locations and property edits are unchanged. These AST structures are read-only during one compilation pass, and a newly parsed AST obtains new indexes. `WeakMap` keys do not hold parsed trees alive independently; see [MDN WeakMap documentation](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakMap).

The optimization affects **build-time compiler research throughput**, which is distinct from the COO/SNO/SCO running-time 2.5× budget. It provides no new confidentiality, integrity, or anti-debugging mechanism.

## Reproducible control and candidate

- **Control compiler:** main at `d4d5fccd8f858b0cf9ae0ea03596bf97ca1dad7a`; instrumentation-only branch `agent2-property-proof-index-control-20261118` source `9c01ce70c07a4e2867a3c1904c4c96ca7d8d05a7`. [Manual two-OS cold profile run 44298831986](https://github.com/FlareZ123/obfs/actions/runs/44298831986).
- **Cached candidate:** branch `agent2-property-proof-inventory-cache-20261118` source `a189b19c5f1a7aeb0024ef640b5c4bc380cf7ec1`, with **identical onefile profiler instrumentation**. [Manual two-OS cold profile run 44298594141](https://github.com/FlareZ123/obfs/actions/runs/44298594141), both jobs passed. [Full Node22 Windows/Ubuntu + Ubuntu Chromium and strict internal/external JSDoc gate 44298638262](https://github.com/FlareZ123/obfs/actions/runs/44298638262), both jobs passed.
- Reproduce: `node sims/private-in-onefile-cold.js`, with the declared dependencies installed. It builds a single real COO-mode CommonJS file, insists each own key is actually renamed, verifies original versus emitted output under weighted nonvacuous checksums, then records compiler-only `performance.now()` and Node `process.cpuUsage()` separately from fresh evaluation. The CPU values are **microseconds** of process user+system time ([Node 22 official documentation](https://nodejs.org/download/release/latest-jod/docs/api/process.html)). The samples are separate hosted CI runs, with possible machine and scheduling variance, not matched-core randomized A/B.

## Measured isolated compiler-build work

| Private owners | Ubuntu control wall | Ubuntu cached wall | Ubuntu control CPU | Ubuntu cached CPU |
| ---: | ---: | ---: | ---: | ---: |
| 64 | 0.200 s | 0.146 s | 0.263 s | 0.212 s |
| 256 | 2.476 s | 1.117 s | 2.769 s | 1.297 s |
| 512 | 9.593 s | 4.361 s | 10.240 s | 4.479 s |
| 1,024 | 38.702 s | 19.609 s | 41.072 s | 22.536 s |
| 2,048 | **154.130 s** | **80.434 s** | **163.332 s** | **91.492 s** |

Windows independently completed the same pinned control/candidate comparison:

| Private owners | Windows control wall | Windows cached wall | Windows control CPU | Windows cached CPU |
| ---: | ---: | ---: | ---: | ---: |
| 64 | 0.323 s | 0.237 s | 0.468 s | 0.344 s |
| 256 | 3.754 s | 1.951 s | 4.469 s | 2.282 s |
| 512 | 14.709 s | 7.927 s | 16.078 s | 8.015 s |
| 1,024 | 57.923 s | 31.409 s | 61.641 s | 35.562 s |
| 2,048 | **236.533 s** | **130.552 s** | **250.452 s** | **146.360 s** |

For 2,048 owners, the control/candidate compiler-build wall-time quotient was **1.916× Ubuntu / 1.812× Windows**; the corresponding CPU quotient was **1.785× Ubuntu / 1.711× Windows**. The performance gap scales with candidate count, consistent with eliminating repeated full-tree traversals; this remains a bounded empirical observation, since other proof operations may retain quadratic cost. The strict behavior and JSDoc suites remained green. The source snippets are artificial, heavily populated private-owner cases; generic runtime or compiler throughput guarantees are not established.

## Limitations and follow-up

A single compiler invocation runs on one Node process with its own JIT, garbage collection and operating-system scheduling; the two independent runs are not controlled on identical hardware. No claim is made about all JavaScript grammars, dynamic host APIs, or failure of hostile inspection. The cached scope metadata is correct for an AST that is unchanged throughout each compiler pass, which is how `obfuscateFiles` currently uses it; callers who mutate and reuse private internal AST objects between independent proofs are outside this measured source contract. Repeat on held-out large module graphs, consider deeper proof-indexing if worthwhile, and keep the strong-protection release decision **RELEASE-BLOCKED**.

See also the independent cold/session runtime evidence in `im-results/private-in-cold-generated-2026-11-18.md`; the runtime overhead analysis must not deduct browser initialization or count compiler-build time against the COO 2.5× budget.
