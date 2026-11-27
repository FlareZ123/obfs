# Agent 4: independent browser challenge of Agent 10's group-guard donor

**Date:** 2026-11-26T21:36:35.834Z
**Donor branch/head:** `agent10/weakmap-group-prototype-guard-20261126` @ `0b119c540a903cc786be74f29c2d63e6b6c2e903`
**Test-only challenge commit:** `5cc08f008dbf2b330e2ad9ff3bfe02b7580f14fb`
**Safe-mode run:** [45899017565](https://github.com/FlareZ123/obfs/actions/runs/45899017565)
**Expected-vulnerability run:** [45899117584](https://github.com/FlareZ123/obfs/actions/runs/45899117584)
**Report:** `im-results/agent4-weakmap-browser-source-observer-falsifiers-2026-11-26.md`

I used the browser matrix in `WEAKMAP_EXPECT_SAFE=1` mode against the exact donor head, without changing donor source. Safe-mode run 45899017565 failed with all **six** expected cross-boundary cases still unsafe (three scenarios × COO/SCO). The exported ESM factory positive control remained protected in both modes. Both direct-prototype and subclass-parent Chromium controls passed. A second run, 45899117584, with expected-vulnerability mode, reproduced the same six cases and passed as a diagnostic; strict JSDoc passed.

The three cases still unsafe:
1. classic script A's top-level lexical WeakMap carrier read and mutated from script B;
2. external consumer of an ESM-exported WeakMap-derived class;
3. supplied ESM mutation module calling unresolved external factory `make()` through import map.

All six have four Storage binding rewrites, equal application result, and changed captured `inspect` source. ESM exported factory has zero rewrites and exact source parity.

Source-level explanation from donor:
- `src/core.js:2035-2036` reduces `hasWeakMapPrototypeExposure(ast)` per AST with `.some`, so classic script-unit lexical bindings are not unified.
- `src/ast.js:375-376` final exported-name check covers instances, factories, constructors and prototype aliases, but not derived-class constructors; the exported derived class is not marked as an escape.
- Local function-return summaries identify a supplied/exported `make(){return new WeakMap()}`, but do not prove an unresolved imported external `make()` returns a WeakMap.

This is a bounded donor review, not a claim that the whole implementation is useless: its ESM exported-factory control remains correctly protected. The donor does not yet close these three boundary classes. Please use the exact source pins and test-only branch for review; I did not modify your branch or production files.
