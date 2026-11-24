# Source-observer result-flow repair: executed red/green evidence (24 November 2026)

**Status:** intermediate branch evidence only; not an established result, release acceptance, or security guarantee.

## Candidate provenance

- Original reviewed candidate: `agent3/source-observer-plan-producer-20261124` at `246af59679d4388703b93fb36918d9e9b344cca1`.
- Critic-frozen main base: `f82fbdf400f424471ad6f7e69d76d3d512ee5657`.
- Rebased working branch: `agent3/frozen-main-rebase-20261124`, currently `ed1f234747f2733879b24b4214ef2888d3b060bc`.
- PR #370 used GitHub's rebase merge to replay the candidate onto the exact frozen base. The rebase produced 58 non-empty commits; three empty commits were dropped. The original candidate branch remains preserved.
- No production mainline source-observer implementation was merged.

## Exact original-candidate red harness

Run [45401539337](https://github.com/FlareZ123/obfs/actions/runs/45401539337) checked out exact candidate `246af59679d4388703b93fb36918d9e9b344cca1`, verified that value with `git rev-parse HEAD`, fetched the pinned harness from `f82fbdf400f424471ad6f7e69d76d3d512ee5657` without changing the checkout, and executed it on Node 22.23.4 / Ubuntu.

Harness SHA-256: `5e1ecf2763b8e5c995dac53429f7122ee92e9a0d2a20f1d26ceab73adf30a6e7`.

All eight red cases were accepted by the original candidate:

| Case | Original candidate observation |
| --- | --- |
| exported callable prefix | validator accepted |
| class binding named `Function` | validator accepted |
| import binding named `Function` | validator accepted |
| appended second source reader | validator accepted |
| `Function.prototype.toString` mutation | validator accepted |
| disconnected `sourceText` export | producer accepted |
| exported mirror overwrite | validator accepted |
| mutable reader binding plus overwrite | validator accepted |

The harness exits successfully because it asserts that these unsafe acceptances are reproduced. This is negative evidence against the original candidate, not acceptance.

## Repaired-branch changes

The reanchored branch adds a narrow, opt-in first-slice source-observation plan:

1. `acceptPlannedPass` now consumes the same `MappedSourceRange[]` contract returned by `getInitialPlanRanges`, matching the core pipeline. This removes the array/Map transaction mismatch that previously prevented positive execution.
2. The plan represents the host effect's returned value separately from the observed callable. It adds explicit values, value facts, bindings and definitions for the reader-result binding and exported mirror, with two value-flow edges: host result → reader binding (assignment), and reader binding → exported `sourceText` (export).
3. The protected semantic closure now contains four tracked spans: callable declaration, direct reader call, reader-result declarator, and exported mirror declarator.
4. Post-pass validation requires a top-level non-exported callable, exactly one direct reader, a top-level `const` reader-result binding, and a top-level exported `const sourceText` alias to that exact binding. It rejects added callable syntax, added direct readers, lexical/import/class/parameter/destructuring `Function` bindings, and extra references to the tracked names.
5. Because the effective intrinsic remains unverified, the host effect carries `UnknownHostEffect` alongside the intended `ExactSource` effect; returned result/reader/export value facts have `proofStatus: 'unknown'` and `['Primitive','Unknown']` possibilities. The caller-supplied pristine-intrinsics premise is not a trust anchor.
6. Source-edit mapping now models explicit `after-node` insertion affinity at a protected span's end, matching the existing edit-map boundary test.
7. The dedicated browser fixture is invoked from `test/browser-integration.js`, so it is included by the repository's real Chromium runner.

The focused regression file includes the eight executed red cases (plus a destructured-`Function` shadow case), producer rejection of a disconnected export, exported-mirror overwrite rejection, and a direct test of the mapped-range array contract.

## Focused repaired-branch validation

[Run 45401968340](https://github.com/FlareZ123/obfs/actions/runs/45401968340) tested branch head `ed1f234747f2733879b24b4214ef2888d3b060bc`:

- Ubuntu and Windows focused Node 22.23.4 jobs both passed.
- The source-observation producer regression file passed on both platforms, including the negative rebind cases.
- Strict project JSDoc, external JSDoc, and paired/complete-suite runtime-budget evaluator JSDoc passed on both platforms.
- The comprehensive `node22` job was intentionally skipped by focused-test dispatch. This run is not a full repository validation receipt.

An earlier focused checkpoint, [run 45400924802](https://github.com/FlareZ123/obfs/actions/runs/45400924802), passed the original 13 producer cases and strict JSDoc on both platforms before the eight-case negative regression was added.

## Outstanding work and limits

- Execute the repaired branch's new source-observer fixture in real Chromium; wiring is present but no browser receipt is claimed yet.
- Obtain Agent 2's independent review of the value-flow graph and post-pass rebind rules.
- Agent 10 retains sole comprehensive acceptance ownership. The full Node 22 Linux/Windows suite, full real-Chromium integration, strict JSDoc gates, full failure/skip inventory, and measured runtime/yield gate remain outstanding.
- The host intrinsic is still `unknown-or-mutable`; a declared pristine-intrinsics premise does not establish trusted dispatch in COO's attacker-controlled runtime. This plan must not be described as tamper-resistant or as an attacker-proof source-observer solution.
- The product remains **RELEASE-BLOCKED**. This is a narrow experimental compatibility candidate, not a merged production implementation and not a three-mode security result.
