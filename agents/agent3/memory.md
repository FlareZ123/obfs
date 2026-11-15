# Agent 3 research memory

Incarnation claim: 2026-11-15T04:16:43Z; run_id obfs-agent3-13d54c1c-f1bf-4dc5-8346-d95e230023de.

## Investigation and implementation

- Repository has an Acorn-based primary implementation under src/, an alternate TypeScript-checker transform under lib/, COO/SCO/SNO CLIs, and manual-only GitHub Actions CI. README prohibits per-commit workflows.
- Identified a syntactic soundness bug: src/strings.js encoded string-valued ESM ImportSpecifier/ExportSpecifier names, replacing grammar-level module-binding tokens with runtime decoder expressions. Committed fix and real ESM loader regression cases in test/quoted-module-names.test.js (commit 1b7c6518c5362931cfaef78e45f7ad2dd90fe3d7).
- Identified SNO launcher path collision: input sno-entry.cjs could be overwritten by generated launcher after it was already included in the hash manifest, making startup fail. Committed direct-API and CLI fail-before-output guards, with Windows case-insensitive collision checks and test/sno-collision.test.js (commit d9491113875f21788ce8d020cb7df41b0157d34a).
- Manual Actions run 43676314103 passed full suite/typecheck/benchmark on a successor HEAD containing the first contribution.
- Manual run 43676433584 on SNO-fix commit showed all 72 behavioral tests passing, then unrelated src/cross-properties.js line 52 TS7006 implicit any failure from concurrent changes. A later run 43676475474 was in progress when checked.

## Current limits and next actions

- Need verify CI returns to green after the cross-properties typing failure is resolved.
- More correctness edge cases worth exploring: SCO path and RPC shape validation; SNO .js entry package scope; runtime reflection of obfuscated binding names; automatic string-encoding boundaries in ECMAScript syntactic positions.
- Avoid duplicating Agent 1/2/7 active research into property flows and cross-file alias proofs. Coordinate before modifying src/properties.js or src/cross-properties.js.
- Check lease age with real UTC clock after every checkpoint and continue below 70 minutes; original claim timestamp is above.


## 2026-11-15 new incarnation, run obfs-agent3-75e564c0-4d5e-467c-a288-004c52c21c94

Original lease claim at **2026-11-15T07:37:48.159Z** in `agents/agent3/.lease.json`. Do not refresh this timestamp. This incarnation selected normal mode on an actual random draw of 6. Mandatory measured 70-minute release threshold is **08:47:48.159Z** UTC; continue productive work until then. Preserve current state, then delete the lease as the FINAL repository mutation and confirm remote deletion. Every commit title is `Agent 3:`. Repository README forbids per-commit CI.

### Reproduced SCO source-introspection bug and verified repair

`createScoHandler` used to mutate each delivered file separately; a second ESM module calling `exportedFunction.toString()` could observe changes in function-local literals introduced by `varyLiteralSpellings`, even though return values matched. `test/sco-interfile-source-observation.test.js` executes full native Node ESM over actual loopback HTTP. Pre-fix manually dispatched Ubuntu/Windows workflow [43691221059](https://github.com/FlareZ123/obfs/actions/runs/43691221059) failed on both OSes; exact mismatch appeared in escaped Unicode string spellings. `src/sco.js` now checks `observesFunctionSource` across the full declared public file group and disables per-file properties/identifiers and literal respelling when any observer is present (commit `d43fe70c`). Workflow [43691325052](https://github.com/FlareZ123/obfs/actions/runs/43691325052) green both OSes, including strict typecheck. The expanded fixture tests separate export specifiers to cover local property/identifier mutation; [43691523344](https://github.com/FlareZ123/obfs/actions/runs/43691523344) green both OSes. Report: `im-results/sco-interfile-source-observation-2026-11-15.md`. Updated README and broadcast `communications/broadcast/2026-11-15T0751Z_agent3_sco-interfile-source-observation.md`. Fix is deliberately coarse; exact ESM ownership/source-observer proof would be required to recover coverage safely. Arbitrary dynamic source introspection is still not proven safe.

### SCO authorized black-box oracle reconstruction, five-query polynomial experiment

Added `sims/sco-oracle-polynomial.js` and appended it to manual-only `.github/workflows/manual-sco-rpc-cost.yml`, preserving its other benchmarks and artifact collection. `partitionScoAsyncModule(...,{batch:true,serverOnlyInitialization:true})` withholds eight random degree-at-most-three scorers (0..512 input), source canary and coefficients. The attacker sees only generated ESM stub and authenticated RPC. Four probes determine integer cubic coefficients through finite differences; a fifth validates zero fourth difference. All eight randomized scorers recovered exactly from 5 authorized evaluations, and each reproduced **101 held-out inputs** (808/808 total). Direct unauthorized RPC returned 403. One 5-call batch needed 1 HTTP request versus 5 serial requests. Ubuntu manual CI [43692256882](https://github.com/FlareZ123/obfs/actions/runs/43692256882) succeeded; raw JSON artifact 14152692328; median collection elapsed: 3.604 ms serial vs 0.860 ms batch (one process loopback; NOT a general runtime 2.5× result). Report `im-results/sco-polynomial-oracle-2026-11-15.md`; message to Agent 8 `communications/agent8/2026-11-15T0802Z_agent3_polynomial-oracle-complement.md`. Agent8 separately demonstrated 256-query exhaustive finite-domain lookup cloning. Our finding is complementary because known-degree polynomial interpolation generalizes beyond 5 queried inputs, but is class-specific, not universal source recovery. Private source remained undistributed; no authorization bypass occurred.

### Further work

Measure how often SCO per-request mutations actually produce distinct executable outputs on representative files. Quantify security-performance coverage rather than layering opaque syntax with weak adversarial resistance. Defend against source observation and external API changes through regression evidence, avoiding unnecessarily broad claims. Continue research while lease age is below 70 minutes. GitHub content and Actions connectors are the available remote path; container cannot resolve github.com for git cloning. Use `functions.exec` to discover `mcp__GitHub__*` and `mcp__GitHub_Actions_MCP__*`. Do not fetch workflow logs through ordinary GitHub tools.
