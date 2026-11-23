# Checkpoint 23 November 2026 03:45 UTC — block-packed benchmark typecheck fix

Follow-up to the 03:42 checkpoint. Immutable lease remains `agent14-20261123T024720Z-gpt6-continuation`, claimed at `2026-11-23T02:47:20.104368Z`; do not refresh. Release threshold remains **03:57:20.104368Z**.

The first full SCO typecheck run [45107371984](https://github.com/FlareZ123/obfs/actions/runs/45107371984) found a strict JSDoc nullability issue in the new benchmark: `result.clone` remained typed as `Machine|null` after `assert.equal(result.certified,true)`. I fixed this by explicitly throwing unless `result.certified` and `result.clone!==null`, then using a narrowed `clone` local. No runtime/test failure was reported.

After that fix:
- Focused behavior + project/external JSDoc run [45107651418](https://github.com/FlareZ123/obfs/actions/runs/45107651418), source `0a939a6ae16b505a3e97263a1ecf7c2810cde760`, passed on both Ubuntu and Windows.
- Full SCO typecheck run [45107656016](https://github.com/FlareZ123/obfs/actions/runs/45107656016) was still running on both OSes at the last check. It includes the added workplace script and test in `jsconfig.sco-oracles.json`; wait for it before claiming strict SCO JSDoc success.

The block-packed script is a parameterized block-size sweep (32 and 8,192) and remains exploratory; Agent 49's fixed-32 blocklist implementation is the measured report/default. My local 8,192 result is delayed-five-only, not a cross-fixture recommendation. The focused CI test now exercises all three fixtures at both sizes and passed on both OSes.

---

# Checkpoint 23 November 2026 03:42 UTC — block-packed storage sweep and validation

Follow-up to the 03:29 checkpoint. Immutable lease remains `agent14-20261123T024720Z-gpt6-continuation`, claimed at `2026-11-23T02:47:20.104368Z`; do not refresh. Release threshold remains **03:57:20.104368Z**.

Agent 49 responded to the bitset tradeoff and implemented a sparse 32-candidate block-list representation in `workplace/sco-five-state-blocklist-benchmark.js`. Their report `im-results/sco-five-state-step-only-2026-11-23.md` records 186,624,800 candidate bytes, 3.56× less storage than the active-ID list, and ~1.11× aggregate local runtime. Agent 49 also extended the live authenticated HTTP matched control to five states; full two-OS run 45106569967 passed. This closes the offline-callback/live-RPC integration gap for the declared five-state model.

I independently prototyped a parameterized block-size sweep and preserved it as:
- `workplace/sco-five-state-block-packed-benchmark.js`
- `test/sco-five-state-block-packed-benchmark.test.js`
- included both in `jsconfig.sco-oracles.json`.

The local delayed-five-only prototype showed:
- block size 32, one-byte local-ID/state entries: 186,624,800 bytes, 5,147 ms learner time;
- block size 8,192, two-byte entries: 331,858,420 bytes, 4,718 ms learner time;
- both retained the 49-query, 4-candidate, 722,453,014-scanWork result and exact product-BFS equivalence.
These timings were from a standalone `/tmp` prototype, not a full three-fixture or cross-platform measurement. The committed test now runs all three canonical fixtures (random five-state, delayed five-state, padded four-state) at both block sizes and asserts exact query/scan counts, held-out traces, and equivalence. This is a comparative storage experiment, not a replacement for Agent 49's default.

Validation in progress:
- Focused two-platform run [45107356871](https://github.com/FlareZ123/obfs/actions/runs/45107356871): test and strict project/external JSDoc passed on Ubuntu; the same steps passed on Windows and its job was finishing at last check.
- Full manual SCO typecheck run [45107371984](https://github.com/FlareZ123/obfs/actions/runs/45107371984): in progress on both OSes; it includes `jsconfig.sco-oracles.json`, so wait for it before claiming the new workplace script is SCO-typechecked.

No changes were made to Agent 49's learner or live RPC integration. If block-size sweep passes, compare full three-fixture runtime/RSS before recommending a default; otherwise remove or retain the experimental script based on the failure evidence.

---

# Checkpoint 23 November 2026 03:29 UTC — five-state canonical completeness CI green

Follow-up to the 03:24 checkpoint. Immutable lease remains `agent14-20261123T024720Z-gpt6-continuation`, claimed at `2026-11-23T02:47:20.104368Z`; do not refresh. Release threshold remains **03:57:20.104368Z**.

Agent 49 incorporated the generator checks I suggested:
- all 160,675 generated five-state canonical transition tables are unique and fully reachable;
- exhaustive enumeration of all 65,536 labelled four-state transition graphs canonicalizes to exactly the generated 5,248-graph set.

The fresh full manual SCO run [45105822873](https://github.com/FlareZ123/obfs/actions/runs/45105822873), source `79b3f7c3febc3fa41cfdf1f97503fafd19b9cc94`, completed **successfully** on both Ubuntu and Windows. The five-state learner test, strict SCO JSDoc, and root strict JSDoc passed on both. This supersedes the earlier pre-completeness-check run 45105195468.

Sent final confirmation to Agent 49 in `communications/agent49/20261123T0329Z_agent14_final-five-state-validation.md`. No further validation concern from this review. The result remains a bounded deterministic binary Mealy-machine clone, offline callback testing only; no real-server five-state bound, arbitrary JavaScript, source/key recovery, domain lock, or target-side 2.5× result is established.

---

# Checkpoint 23 November 2026 03:24 UTC — full SCO five-state validation complete

Follow-up to the 03:23 checkpoint. Immutable lease remains `agent14-20261123T024720Z-gpt6-continuation`, claimed at `2026-11-23T02:47:20.104368Z`; do not refresh. Release threshold remains **03:57:20.104368Z**.

The full manual SCO workflow [45105195468](https://github.com/FlareZ123/obfs/actions/runs/45105195468) completed **successfully** on both Ubuntu and Windows. It includes the five-state canonical test, existing four-state/live matched-control tests, and strict SCO JSDoc checks.

Agent 49's report `im-results/sco-five-state-step-only-2026-11-23.md` now records:
- random minimal five-state, delayed-output five-state, and padded four-state fixtures;
- exact equivalence checked by independent partition refinement plus 128 held-out sequences per fixture;
- under the false four-state bound, the delayed five-state machine is falsely certified after 45 queries; under the correct five-state bound it is certified after 49;
- the six-state canonical count is 5,931,540 graphs / 24,295,587,840 models, making a four-byte full candidate array about 91.1 GiB. This is a representation limit, not a security threshold;
- explicit limits: offline callback testing, deterministic binary stationary fixed-initial-state model; no real server identity proof, key extraction, browser/WAN/domain lock, or target-side 2.5x runtime result.

My independent generator check found 160,675 generated five-state graphs, 160,675 unique 30-bit keys, and all five states reachable in every graph. The exact count matches the brute-force labelled-graph count divided by (4!). I sent the full-green review to Agent 49 in `communications/agent49/20261123T0324Z_agent14_full-five-state-run-review.md`.

No new implementation was made to Agent 49's learner. Their bounded five-state clone is now empirically validated by the full manual workflow. The state bound remains an independent premise; finite queries cannot establish an unbounded machine's full future behavior. Keep all results in `im-results/` and the global release decision RELEASE-BLOCKED.

---

# Checkpoint 23 November 2026 03:23 UTC — independent canonical generator check

Follow-up to the 03:22 checkpoint. Immutable lease remains `agent14-20261123T024720Z-gpt6-continuation`, claimed at `2026-11-23T02:47:20.104368Z`; do not refresh. Release threshold remains **03:57:20.104368Z**.

I independently executed the same recursive BFS-target enumeration logic as Agent 49's five-state generator in a standalone Node check. For (n=5), it emitted 160,675 transition tables; a packed 30-bit key set had 160,675 unique entries, and BFS from state 0 reached all five states in every generated table. Together with the independent brute-force count of 3,856,200 reachable labelled graphs and the free (4!) relabelling action, this supports the exact canonical count and completeness under the fixed ordered-input assumptions.

Sent Agent 49 the check and suggested preserving the uniqueness/reachability assertions in their test: `communications/agent49/20261123T0323Z_agent14_generator-uniqueness-check.md`.

Run 45105195468 remains the validation pin. Step 34 passed on both OSes; Ubuntu strict JSDoc checks passed. Windows strict JSDoc was still pending at the last status check, so do not claim the entire workflow is green yet.

---

# Checkpoint 23 November 2026 03:22 UTC — five-state canonical learner validation

Follow-up to the 03:20 checkpoint. Immutable lease remains `agent14-20261123T024720Z-gpt6-continuation`, claimed `2026-11-23T02:47:20.104368Z`; do not refresh. Release threshold remains **03:57:20.104368Z**.

Reviewed the first full manual SCO workflow after Agent 49 added the five-state canonical learner. Run [45105195468](https://github.com/FlareZ123/obfs/actions/runs/45105195468), source pin `67379220ba581c3cbf31ec402f6c776fe8f4977f):
- Step 34, "Certify canonical five-state step-only continuation", passed on both Ubuntu and Windows.
- Ubuntu completed the SCO-specific strict JSDoc config and root strict JSDoc successfully; Windows was still completing those steps at the last check. The overall workflow had not yet completed.
- The test covers a random minimal five-state machine, a delayed-output five-state machine, and a padded four-state machine. Each certificate is checked against independent partition refinement and 128 held-out sequences; the test enforces a per-fixture offline attacker CPU ceiling of 15 seconds.
- The workspace candidate array is 663,554,832 bytes. Do not confuse this implementation memory figure with the theoretical one-bit-per-model bound in the count report.

Sent Agent 49 the green-step review in `communications/agent49/20261123T0322Z_agent14_five-state-green-review.md`. This is strong practical evidence of a bounded five-state no-reset clone, but remains conditional on the actual SCO system having at most five reachable states. It does not establish that bound for a real service and does not overturn the no-finite-transcript impossibility for unbounded machines.

---

# Checkpoint 23 November 2026 03:20 UTC — review of Agent 49 canonical five-state learner

Follow-up to the 03:16 checkpoint. Immutable lease remains `agent14-20261123T024720Z-gpt6-continuation`, claimed `2026-11-23T02:47:20.104368Z`; do not refresh. Release threshold remains **03:57:20.104368Z**.

Agent 49 implemented `sims/sco-step-only-five-state.js` using the BFS-canonical model space. I reviewed the code and test:
- The model count matches the independent DP/brute-force result: 165,888,708 models for all reachable sizes 1–5; 160,675 five-state canonical transition graphs.
- Their graph/output factorization stores shared transition tables once, model output assignments in the low ID bits, and current state in the high bits of a 32-bit candidate entry. The active candidate array is 663,554,832 bytes; this is distinct from the theoretical ~19.8 MiB one-bit membership bound.
- The canonical transition DP and recursive generator appear structurally consistent with the BFS numbering rule. I suggested a uniqueness/reachability check over all generated five-state graphs and an exhaustive four-state canonical-set comparison in `communications/agent49/20261123T0320Z_agent14_five-state-learner-review.md`.
- My initial note that `manual-sco-oracle.yml` lacked the five-state test step was stale: the workflow was updated after I fetched it. I sent a correction at `communications/agent49/20261123T0321Z_agent14_five-state-workflow-correction.md`. Current workflow includes the explicit five-state test and strict `jsconfig.sco-oracles.json` check.
- The full two-OS manual SCO workflow [45105195468](https://github.com/FlareZ123/obfs/actions/runs/45105195468) was in progress at the last check and includes the five-state test at step 34. Await the final result before making any stronger claim.

I did not modify Agent 49's learner. The no-bound theorem and canonical count report remain in `im-results/sco-five-state-canonical-count-2026-11-23.md`. The five-state learner is still conditional on the declared maximum state count; a finite oracle transcript cannot prove that bound.

---

# Checkpoint 23 November 2026 03:16 UTC — SCO state-bound theorem and canonical five-state count

Follow-up to the 03:11 checkpoint. Immutable lease remains `agent14-20261123T024720Z-gpt6-continuation`, claimed at `2026-11-23T02:47:20.104368Z`; do not refresh. Release threshold remains **03:57:20.104368Z**.

Read Agent 49's four-state SCO no-reset broadcast and sent two reviews:

1. `communications/agent49/20261123T0312Z_agent14_state-bound-review.md`: a four-state bound is credible only if independently established by protocol/architecture, not inferred from finite oracle traces. For any finite no-reset transcript of length (T), an adversarial (T+2)-state Mealy machine can mimic the observed path and diverge on a later continuation. With a finite set of resettable queries, a prefix-tree machine can mimic all queried paths and diverge on an unqueried continuation. Thus no finite transcript certifies universal equivalence for unbounded finite-state machines.
2. `communications/agent49/20261123T0315Z_agent14_five-state-canonical-count.md`: derived a BFS-canonical reachable-machine DP and independently brute-force checked the five-state transition-graph count.

The canonical recurrence starts with (D(1)=1). Before processing BFS source state (i), discard (k<i+1). For each ordered input edge, add (kD(k)) to the same (k) (target an already discovered state) and (D(k)) to (k+1) (discover exactly the next BFS state) if (k<n). After (nd) edges, multiply (D(n)) by (m^{nd}) output assignments.

For two inputs/two outputs:
- exact four reachable states: 5,248 canonical transition graphs; 1,343,488 Mealy machines;
- all reachable sizes 1–4: 1,357,508 machines versus the existing 16,777,216 labelled four-state table space;
- exact five reachable states: 160,675 canonical transition graphs; 164,531,200 Mealy machines;
- all reachable sizes 1–5: 165,888,708 machines (one-bit membership upper bound about 19.8 MiB, excluding current-state and transition data).

Independent C++ exhaustive enumeration of all (5^{10}=9,765,625) labelled five-state transition graphs found 3,856,200 reachable graphs; division by (4!=24) gives 160,675 canonical graphs, matching the DP. Durable report: `im-results/sco-five-state-canonical-count-2026-11-23.md`, commit `9d0b19362bb6ccb399873af65a7697b2ed196c00`.

No five-state learner was implemented. The count is a model-space feasibility result, not an attack success or proof that a complete learner fits a runtime budget. Agent 49 should decide whether to implement canonical generation. The four-state result remains conditional on a trusted bound; the no-bound impossibility is a limitation on universal certification, not a claim that every SCO surface is cloneable.

---

# Checkpoint 23 November 2026 03:11 UTC — generated ESM export-binding provenance

Follow-up to the 03:03 checkpoint. Immutable lease remains `agent14-20261123T024720Z-gpt6-continuation`, claimed `2026-11-23T02:47:20.104368Z`; do not refresh. Release threshold remains **03:57:20.104368Z**.

Agent 16's PR review identified a third false-reconstruction path: generated-arm recovery selected a top-level declaration by the public export's spelling without proving that the export specifier referred to that local binding. A local generated-looking `round1` could coexist with `alternate` exported as `round1`, causing the attack to reconstruct a function the module did not publicly expose.

Ported the guard from Agent 16's branch:
- `assertStaticPublicModule(source, requireMatchingBindings=false)` now optionally requires export-specifier local and exported names to match.
- Generated-arm recovery calls it with `true`; the esbuild-minified path retains the alias-aware `recoverMinifiedPublicMath` path with the default `false`.
- Added a native ESM negative control proving `alternate as round1` changes the actual public value, plus a positive minified alias control recovering `round1=-123, round2=23, round3=-31`.
- The first two alias-test runs failed because the test initially expected all three exports to alias `alternate`; ESM syntax aliases only `alternate as round1`, while `round2` and `round3` remain their local bindings. Corrected those test expectations; this was a test-oracle mistake, not a source-guard failure.

Evidence:
- Full 17-test focused suite and strict project/external JSDoc passed on Ubuntu and Windows in [run 45104272046](https://github.com/FlareZ123/obfs/actions/runs/45104272046), exact code/test source `e10be6fb5e9583ea41546bd5223f561e808557c2`.
- Latest report-only branch commit: `83c516557dc8b8429bc61026dd2d39a8c71eae0e`.
- PR #282 comment: 7090524909.
- Sent Agent 16 the integration details in `communications/agent16/20261123T0311Z_agent14_export-binding-guard-port.md`.

The current research branch head is `83c516557dc8b8429bc61026dd2d39a8c71eae0e`; no production `src/` change. The generated-arm proof now checks both the admitted expression grammar and the actual public binding identity. The minified arm remains alias-aware. This is a stronger attacker proof, not a security gain for the obfuscator. Keep RELEASE-BLOCKED.

Next: await Agent 16 review and Agent 13 private-verifier comparison; do not merge or promote based on focused CI alone.

---

# Checkpoint 23 November 2026 03:03 UTC — positive control for lexical shadow repair

Follow-up to the 03:00 checkpoint. The immutable lease is still `agent14-20261123T024720Z-gpt6-continuation`, claimed at `2026-11-23T02:47:20.104368Z`; no refresh. The orderly-release threshold remains **03:57:20.104368Z**.

Added a positive control to avoid overcorrecting the symbolic parser: a branch-local slot may harmlessly shadow the function parameter name because normalization and switch selection have already occurred, and the slot initializer reads the distinct normalized register. The solver still accepts this source, recovers offset 17, and native Node results are 17, 18, and 16 for inputs 0, 1, and -1.

- Expanded 15-test focused run [45103536740](https://github.com/FlareZ123/obfs/actions/runs/45103536740) at code/test pin `21c6514f574d503237c6edffaa7efb184b42eba6`: Ubuntu and Windows passed the focused test, strict project JSDoc, and strict external JSDoc.
- Updated report commit: `40720ad2380928a42c30694720ffa02dcfcac5f7` on research branch.
- PR #282 positive-control comment: 7090419687.
- Sent Agent 16 the positive control and source pin in `communications/agent16/20261123T0304Z_agent14_tdz-positive-shadow-control.md`.
- Latest research branch head is `40720ad2380928a42c30694720ffa02dcfcac5f7`; no production `src/` files changed.

The narrowed guard now distinguishes the two unsafe self-shadow forms from a harmless parameter-name shadow. The primary release decision remains RELEASE-BLOCKED; this is attacker-proof soundness work only. Continue awaiting Agent 16's independent review and Agent 13's private-verifier comparison.

---

# Checkpoint 23 November 2026 03:00 UTC — branch-slot self-shadow regression

Follow-up to the 02:56 checkpoint. The immutable lease remains `agent14-20261123T024720Z-gpt6-continuation`, claimed at `2026-11-23T02:47:20.104368Z`; do not refresh. Release threshold remains **03:57:20.104368Z**.

A further lexical binding edge was found in the noncompact branch-restoration path: the manually handled case-local slot could reuse the exact name of the outer normalized-input register. Its initializer then self-reads the uninitialized case-local `const` (TDZ), while the previous name-only restoration proof treated it as the outer register. The solver now rejects `slotName===normalized`. Added a regression verifying both native branch calls throw and both symbolic entry points refuse.

- Latest code/test pin: `bced99281dfe285d4fcfa53f041f23830d13aa7d`.
- Expanded focused CI: [run 45103149695](https://github.com/FlareZ123/obfs/actions/runs/45103149695), Ubuntu + Windows Node 22, focused test and strict project/external JSDoc all green.
- The focused file now includes both TDZ witnesses, the fresh challenge-A solver test, and the existing 96 positive emitted cases.
- Updated report commit: `00756156040a040a44ce3add2716418b7459e73a` on the research branch.
- PR #282 follow-up comment: 7090369644.
- Sent Agent 16 the second witness and green pin in `communications/agent16/20261123T0300Z_agent14_branch-slot-self-shadow.md`.

This remains a correction to the independent attacker's proof recognizer only. No production `src/` changes, no claim that the actual emitter produces either hostile form, and no security release promotion. Continue waiting for Agent 16's independent review and Agent 13's private-verifier comparison. The research branch is now at `bced99281dfe285d4fcfa53f041f23830d13aa7d` plus the subsequent report-only commit `00756156040a040a44ce3add2716418b7459e73a`.

---

# Checkpoint 23 November 2026 02:56 UTC — symbolic TDZ proof repair and fresh affine challenge

**Current incarnation:** normal research mode selected by the required executed RNG draw (5). Claimed `agents/agent14/.lease.json` as `agent14-20261123T024720Z-gpt6-continuation` at **2026-11-23T02:47:20.104368Z** and verified the push. Do not refresh. After every checkpoint, compare the real UTC clock with that original timestamp; orderly release is permitted only at or after **2026-11-23T03:57:20.104368Z**, after pushing all useful work and deleting the lease as the final repository mutation.

## New work: PR #282 source-only affine solver peer review

Research branch: `agent14/llm-matched-affine-evaluation-20261122`. PR #282 remains open and research-only; no `src/` production compiler changes.

- Agent 16 supplied a generated-looking two-path counterexample where an inner block reads `slot`, returns, then declares a later `const slot`. Node 22 confirms `round1(0)` throws TDZ `ReferenceError`, while `round1(1)` returns 18.
- The previous `block()` visitor returned on the first return and missed later lexical bindings, incorrectly accepting this arbitrary source as offset 17. A pre-fix focused CI run [45102547683](https://github.com/FlareZ123/obfs/actions/runs/45102547683) at `fdfe4731106c5a0f1da6b112a20a545cdb728835` reproduced the missing expected exception on both OSes.
- Fixed `sims/polyvariant-affine-symbolic-recover.js` to preflight the complete block, allow only the admitted const/nested-block/terminal-return grammar, and refuse nonterminal returns or unsupported statements. The exact regression now checks native behavior and requires both `recoverSymbolicAffine` and `attackPublishedSource` to fail closed.
- The exact final focused two-platform run [45102784023](https://github.com/FlareZ123/obfs/actions/runs/45102784023) at `b771c68905c660b109c4c306b51279759e902114` passed on Node 22 Ubuntu and Windows, including strict project and external JSDoc. The existing 96 positive emitted CJS/ESM compact/native cases passed as part of the focused test.
- Windows checkout initially exposed CRLF normalization in the public challenge hash check; test now canonicalizes line endings before comparing the challenge's LF SHA without modifying source passed to the parser.
- Durable report: `im-results/llm-matched-affine-tdz-shadow-2026-11-23.md` (added at branch head `187654d3a020affb4cf834e00b7e560de36edff3`).

## Agent 13 BLIND-20261123-A static solver check

Copied the exact 5,339-byte public artifact from Agent 13's challenge message to a branch fixture and verified canonical SHA-256 `25317afcc40deeeb845472732d07c480ce55477ec6057ea18527873e8b1332ca`. The existing source-only symbolic parser recovered:

```json
{"round1":169,"round2":-127,"round3":334}
```

This solver uses Acorn AST parsing and the admitted arithmetic algebra; it uses no compiler/transform internals, hidden source, runtime execution, or chosen-query oracle. The focused two-platform run passed. This was an automated CI execution of the static solver, **not** a blind LLM trial or a no-tools model submission. Sent the answer and qualifications to `communications/agent13/20261123T0255Z_agent14_blind-affine-trial-a-result.md`; requested comparison with Agent 13's private verifier.

## Coordination

- Replied to Agent 16 with the independent Node witness, pre-fix red and post-fix green pins, and a request for independent revalidation: `communications/agent16/20261123T0255Z_agent14_tdz-shadow-reproduction-and-fix.md`.
- Added PR #282 comment 7090322854 with the proof-boundary correction and exact CI pins.
- Current research branch head after report commit: `187654d3a020affb4cf834e00b7e560de36edff3`. The final code/test CI pin remains `b771c68905c660b109c4c306b51279759e902114` because the later commit only adds the report.

## Interpretation and next actions

This fixes an unsound source-only *attacker proof recognizer* for an arbitrary generated-looking source shape. It is not evidence that the actual compiler emits the hostile shape, does not improve obfuscator security, and does not change the release decision. The primary objective remains RELEASE-BLOCKED.

1. Wait for Agent 16 to independently reproduce the final fail-closed behavior; if it identifies another lexical-scope counterexample, extend the proof-boundary tests rather than widening the grammar speculatively.
2. Ask Agent 13 to confirm the three recovered challenge offsets against its private verifier. Do not characterize this static-solver run as an LLM blind trial.
3. Keep PR #282 research-only until independent methodology review; do not merge a source-only attack fix into production merely because its focused gate is green.
4. Continue to require source-only attacks, held-out behavioral checks, exact pins, and separate full-control threat-model evidence for any security claim.

---

# Checkpoint 22 November 2026 ~14:25 UTC: symbolic source-only affine recovery

Research-only PR #282 branch head `cc00fa00bf114602c0a384a9d10d8860e50f73b1`. Added `sims/polyvariant-affine-symbolic-recover.js` (create `e330ee2`, extended compact support `829e6f8`) and wired `sims/llm-matched-affine-static-attack.js` to it (`90b13fb`, refactors), retaining the old two-sample interpreter only for a deterministic nonlinear falsifier. The new verifier proves a restricted set of generated modular affine cases by AST: single `(input|0)` normalization, pure partition switch 2/4/8, full labels and unreachable default, native `(normalized>>shift)<<shift|label` case restoration, or compact additive register form, static pure const/return arithmetic, coefficient/offset tracking modulo2^32, safe-number magnitude bounds, same `(1,k)` for all branches. Pure ESM shell check from previous checkpoint applies to *both* attacker arms. It refuses unsupported grammar rather than matching two finite samples.

Updated `test/llm-matched-affine-static-attack.test.js` with the known 2-case generated CJS fixture `examples/polyvariant-affine/obfuscated.cjs` expected offset 262, old nonlinear negative, and **96 drafted deterministic compiler-output instances** (2 compact toggles × 2 module types × 3 path counts × 8 source seeds), each comparing native, generated and standalone clone on 16 numeric/exotic inputs and an individual `Symbol.toPrimitive` trace. `jsconfig.llm-matched-affine.json` includes the new module. **These 96 cases have not yet been run in CI or against the exact new source file**; do not report as passing. Independent local Python modular arithmetic check of both frozen noncompact case outputs computed `(1,262)` for each; 10,000 cases per mask n=1,2,3 verified signed two's-complement case restoration, zero mismatch, and 10,000 random compact arithmetic checks had zero mismatch and max intermediate <2^53. These are independent bounded calculations, not project CI. Report `im-results/llm-matched-affine-evaluation-2026-11-22.md` records these qualifications and historic source pins, no changed security conclusion.

Requested independent code review from Agent 3 at `communications/agent3/2026-11-22T1420Z_agent14_symbolic-affine-recovery-review.md`, updated PR #282 comment ID 7080399105 requesting the existing manual 2-OS validation. Latest source SHA `cc00fa...` had no associated PR-triggered workflow runs when checked; manual workflow dispatch unavailable in connected tools and container GitHub DNS is blocked. Thus **release remains RELEASE-BLOCKED, research branch pending CI**. External long-term repo convergence in `workplace/three-mode-candidate-convergence-2026-11-22.md` still names no released positive candidate.

## Checkpoint 22 November 2026 ~14:08 UTC: full ESM declaration-shell proof refusal

Branch PR #282 head last updated to `f6fc43afc20b5b972f4e2e5e1da5bfb23e0b98b7` after source-only minified arm enhancement. `sims/llm-matched-affine-static-attack.js` now calls `assertStaticMinifiedModule(source)` before extracting functions: it accepts a restricted inert ESM shell of function declarations, const function-valued initializers, named exports, empty statements and directive prologues, and refuses any eager statement, mutable declaration, reexport or import. Commit `dd21ebc1` implementation, `2152f296` initial regression, `69af60ad` corrects test source newline escapes, `70b65fb` report, `f6fc43af` real Node ESM mismatch witness. Original `export function round1(x){return ((x|0)+1)|0}; round1=x=>42` genuinely yields 42 at input 0 in an imported module; a naïve declaration-only clone yields 1. This differs from earlier input-coercion counterexample and catches unproved module-time mutation. A local Acorn grammar check accepted esbuild-shaped pure function export shell and declined appended reassignment. **The exact full project and latest test changes have not received new two-OS CI/JSDoc results**; no public-source security improvement claimed. Communicated first proof gap to candidate owner Agent 8 via `communications/agent8/2026-11-22T1402Z_agent14_affine-coercion-proof-fix.md` on main commit `926b094d`.

Inspected decoder-`eval` concern in `src/core.js`: `mutatesDecoderIntrinsic` explicitly rejects *any* direct `eval` or dynamic compiler reference (line ~1763), so no compelling new bug; do not pursue or file speculative complaint without a real repro. Reviewed external 2025/2026 source-recovery literature and repository `resources/obfuscator-testing-and-deobfuscation-benchmarks-2026-11-22.md`, which already covers benchmark methodologies; no redundant resource added. Strong-protection verdict unchanged.

## Follow-up checkpoint: 22 November 2026, 13:57 UTC

Extended PR #282 on the same branch with deterministic exotic-input differential test (`test/llm-matched-affine-static-attack.test.js`, commit `14d103b59b0c6aad52394f9241774a24b6c19608`) and restricted-grammar proof/caveats (`im-results/llm-matched-affine-evaluation-2026-11-22.md`, head `574c14e86286d31cb5d3dae810ad37a51d8e08e0`). Independent local Node 22.16 reproduction used a textually matched grammar recognizer, acorn, 300 deterministic randomized single-read source expressions, 18 primitive/exotic inputs and 3 fresh `Symbol.toPrimitive` traces per source = 6,300 comparisons, with zero mismatches. The counterexample multi-read expression is now rejected in that local reproduction, original coercion 3 and clone coercion 1. **This local reproduction is independent code, not execution of the exact checked-in module**, because the container cannot clone GitHub (DNS blocked), the web downloader cannot fetch the raw branch path, and Github connector cannot dispatch the manual-only Actions workflow. Automated CI validation remains pending, no green source pin for the latest branch. Broader security release remains blocked. Agent8 convergence dossier `workplace/three-mode-candidate-convergence-2026-11-22.md` already names no release-grade candidate per mode; avoid fragmentary new branch proliferation.

## Incarnation checkpoint: 22 November 2026, 13:50 UTC

Claimed `agents/agent14/.lease.json` at **2026-11-22T13:46:04Z** with run ID `agent14-20261122T134604Z-gpt6-compatibility` (normal mode draw 5), verified by remote fetch. New branch-only PR #282 fix: `sims/llm-matched-affine-static-attack.js` counted algebraic factor but not the number of source-level input coercions. An input referenced three times can have arithmetic factor 1 yet observable `valueOf` behavior differs from a single-read clone. Demonstrated locally on Node 22 with a counter `valueOf`: original expression `((((x|0)+(x|0))-(x|0))|0)` yields 0 with 3 coercions; single-read formula yields 1 with 1 coercion. Commit `e97cbf7` adds `reads` tracking and declines reads != 1, `f31dc24` adds a fail-closed fixture, `f7903d6` adds a scoped research report. Left an independent-review comment on PR #282. **No new two-platform CI was run**; do not treat the branch as source-pinned green. Worker and browser external tools returned concrete ngrok 404; GitHub connector writes worked. Candidate remains RELEASE-BLOCKED. Next: independently verify JSDoc/Node tests on PR branch, check source-only inference for another symbolically accepted multi-coercion case, and reconcile exact current control result with Agent8 candidate dossier. Do not claim branch merged. Under the immutable 13:46:04 lease, the earliest normal-mode orderly release clock is 2026-11-22T14:56:04Z. Keep lease until actual check >=70min.

## Final adversarial proof-boundary regression, 22 November 2026

[Two-platform green run 45026326593](https://github.com/FlareZ123/obfs/actions/runs/45026326593) at exact source `358b54bfb46be90f337e8fbd3ee869017ca7cbe7` includes a **hand-crafted two-case nonlinear source counterexample** to the generated-path interpreter's finite two-inputs-per-case offset inference. Its extra `(input&-4)` term vanishes on parity representatives 0,1,2,3 and is nonzero at 4. The existing source-only interpreter reconstructs a zero-offset module that matches observed inputs but fails at 4 (8 vs 4). New negative test intentionally asserts that mismatch; complete Ubuntu+Windows suite still green. This precisely bounds the claim: the successful real compiler-generated affine population **does not** constitute a general formal deobfuscator proof for arbitrary JS. Report updated in `im-results/llm-matched-affine-evaluation-2026-11-22.md`; PR #282 head expected `16d67bf3d7bcb3fe71d61cb99b630bdc0ed7e820`. Keep source-family limits and RELEASE-BLOCKED verdict.

# Agent 14 final handoff: 22 November 2026, latest source-pinned research

**Status:** normal-mode incarnation (secure RNG 7), claimed immutable lease `agents/agent14/.lease.json` at **2026-11-22T12:06:24.943Z**. Release only after an actual clock check reaches **2026-11-22T13:16:24.943Z**; then commit/push all useful state, delete lease as **final repository mutation**, and verify remote absence. No lease refresh.

**Research PR:** [#282, source-matched hidden-affine reconstruction and CPU/browser controls](https://github.com/FlareZ123/obfs/pull/282), branch `agent14/llm-matched-affine-evaluation-20261122`, latest head `8613ed36b0e0f255fd722a0b2631beaf200e5808`. **Open for independent methodology review only; no `src/` compiler changes or security release claim.** Primary report `im-results/llm-matched-affine-evaluation-2026-11-22.md`.

- **Latest source-pinned two-OS green:** [run 45025956395](https://github.com/FlareZ123/obfs/actions/runs/45025956395) at `66f7b1d6aea50ec1fc8d8bcaaacf027130555a61`. Ubuntu+Windows strict JSDoc, actual randomized two-mode generated-vs-esbuild same-hidden-source ESM, zero-query exact three-export static reconstruction, post-grade standalone ESM import and independent behavioral oracle checks, four-arm warmed CPU; conservative parser refuses missing, duplicate and unsupported exports/expressions. Earlier run 45025846199 was red on test's incorrect expected error *class* for an already correct missing-export failure; corrected to assert parser's actual fail-closed message, then green.
- **Last browser CSP green:** [run 45025531347](https://github.com/FlareZ123/obfs/actions/runs/45025531347), exact source `0c841500090bf91df8d03d7607bd6f9867a8cbb2`, Chrome 157, real HTTP-served four independent ESM files (native, protected COO, minified, rebuilt from public code), source-only reconstruction committed before original reveal. 8,212 fixed + seeded-deterministic input test cases per export, **73,908** per-arm native comparisons, **36** precise stateful object coercion/error traces. Source text protected **5,321B** vs rebuilt **183B**. Nine warmed paired browser wall-time protected/native median 0.851x, rebuilt/native 0.805x, not calibrated CPU/startup-inclusive budget. Server serves same-origin CSP `default-src 'none'; script-src 'self'; connect-src 'self'`, `X-Content-Type-Options: nosniff`; Puppeteer executes test inside DevTools context, which has privileges potentially outside CSP. All exact original/public/rebuilt source+timing preserved [artifact 14754949761](https://github.com/FlareZ123/obfs/actions/runs/45025531347), SHA256 `3fa9fe1c32a81b5adf75e850c91e10c834d7f16261218933412454f3cf2a2cf3`.
- **Earlier broad source-only population:** 32 fresh cryptographically randomized source programs (8 COO+8 SNO per OS), both generated and esbuild arms exactly statically reconstructed, **196,608** held-out verifier comparisons, complete after-grade original/public/source receipts on Ubuntu+Windows [run 45022512857](https://github.com/FlareZ123/obfs/actions/runs/45022512857). Latest four-way Node CPU [run 45024144186](https://github.com/FlareZ123/obfs/actions/runs/45024144186) generated/native median ~1.23–1.45x, independent rebuilt/native ~0.999–1.007x, 52/52 warmed paired samples below 2.5x across both OS/modes; no claim about COO cold-start or other programs. The exported function source differs observably from the original, so numeric parity does not establish full 1:1 JS source-reflection semantics.
- **Model isolation gap:** The same-source questions and salted private-source commitment are available, but a genuinely isolated LLM attack trial has **not** run. No no-repo compliance claim can be trusted without technical isolation, and disclosed post-grade source archives cannot be recycled as blind questions. A separate Workers API attempted earlier was unavailable (ngrok 404). Keep anti-LLM confidence at **unmeasured**, not “resistant”.
- **Coordination:** Candidate owner Agent 8 received `communications/agent8/20261122T1311Z_agent14_chromium-csp-clone-final.md`; a separate frozen artifact mismatch `digest(seed,message)` emitted as `digest(_vccab8cb5e553,message)` was sent to canonical source-observer owner Agent3 `communications/agent3/20261122T1219Z_agent14_polyvariant-export-source-mismatch.md`. The unrelated red generated-sample workflow was left unmodified; our tests reside in the pre-existing green `manual-obfuscation-sample.yml` and `manual-compact-browser.yml`.
- **Candidate conclusion:** This narrow public two-path affine family is source-only functionally reconstructable in both Node and Chrome, even though sampled repeated execution fits the 2.5x bound. The overarching SCO/COO/SNO security release remains **RELEASE-BLOCKED**. Next useful action is independent review of #282 and better-threat-model candidate selection; do not promote this negative control as strong protection.

---

## Checkpoint: 22 November 2026, four-way independent reconstruction and CPU control

- PR #282 head `0144fad934aa326cf68f69be01a211a8e51a857b` now includes a **fully runnable source-only rebuilt ESM module**, extra 256 independent unpublished numeric validations per export and arm after host commitment, broader input coercion/error parity and positive source-reflection mismatch metrics. The matched parser still uses no compiler internals, hidden source or runtime queries.
- [Run 45024144186](https://github.com/FlareZ123/obfs/actions/runs/45024144186), source exact `6a7f24c0a855e21ef7e515c7133b2dcfb77733e8`, passed Ubuntu and Windows on four-arm post-init hot arithmetic: native, ordinary esbuild, actual polyvariant, and zero-oracle source-reconstructed standalone ESM. Each platform/mode combination uses 13 pair-counterbalanced trials × 8m dynamic calls × 3 exports; 4 freshly randomized source programs across both OS/modes. Generated/native medians: Ubuntu COO 1.254, SNO 1.230, Windows COO 1.450, SNO 1.376. Source-reconstructed/native: 1.000, 0.999, 1.007, 1.000, respectively. All 52 generated/native measured CPU pairs under 2.5. Source lengths generated 5,314–5,333 bytes, reconstructed 182–185. All are **narrow hot post-init**, no full COO release certification; static recovery means **security-negative**. Raw provenance archived in same run.
- Latest report `im-results/llm-matched-affine-evaluation-2026-11-22.md` includes source-reflection mismatch and both source-pinned four-way CPU comparisons. GitHub workflows stay manual; two-platform `manual-obfuscation-sample.yml` now includes strict JSDoc, exact public/private post-grade source archives, 32-source static ESM tests, and four-way CPU archives. No product `src/` changes, and unrelated polyvariant frozen-artifact failure was communicated to Agent3.
- Concrete earlier Windows failure [run 45023705232](https://github.com/FlareZ123/obfs/actions/runs/45023705232) at 1m/call originated in Windows process.cpuUsage coarse 16ms intervals sometimes returning zero. Raising workload to 8m/call fixed both platforms in [run 45023836263](https://github.com/FlareZ123/obfs/actions/runs/45023836263) without suppressing proof checks. Latency and ratio must be understood as sampled/conditioned, not a general guarantee.
- New partial final to user already reported meaningful post-init performance within 2.5x and security limit. Continue productive work until measured lease age >=70m then final clean release. **Do not refresh lease.**

## Checkpoint: 22 November 2026, browser-verified source-only clone

- [PR #282](https://github.com/FlareZ123/obfs/pull/282) remains research-only, open. Current substantive head has `sims/llm-matched-affine-chromium.js`: actual Chrome 157.0.8103.78 HTTP-served **four ESM modules** from one new hidden source, independent public source-only reconstruction submitted before reveal, genuine runtime on **COO/browser**, not only Node. Baseline `manual-compact-browser.yml` already installed Chrome; added targeted JSDoc and Chromium run with post-grade original/public/rebuilt source receipts. No extra workflow.
- Latest [browser run 45025299761](https://github.com/FlareZ123/obfs/actions/runs/45025299761), code `232c0e6674972cbbd0c52ed6533b661502619230`, **green**: 73,908 per-public-vs-native output/exception comparisons over 8,212 input values per export, plus **36 exact stateful object-coercion trace checks** across valueOf/toString/Symbol.toPrimitive/throwing cases; all 4 ESM arms operated. Source-only rebuilt module 181 bytes vs protected 5,330. Chrome warmed wall-time protected/native median 0.869x and rebuilt/native 0.809x in that one source/9-pair session, not CPU or startup-inclusive claim. Exact artifact ID `14755536799`, digest `sha256:5015053b9d2d083bfdf7df55bbac98deba75b8bfdb0060d99c57c4b3ce3277fb`.
- Earlier independent successful [browser run 45025050110](https://github.com/FlareZ123/obfs/actions/runs/45025050110), code `7d9950e153a0173ace6099c9ce425e415f60dfcc`, had 73,908 output/exception comparisons and 9 rounds as initial browser source, 5,333B protected vs 182B clone, baseline ratio 0.903/0.871.
- Latest standalone Node [run 45024505268](https://github.com/FlareZ123/obfs/actions/runs/45024505268) green on both OS after rejection of async/generator unsound source-only expressions and deterministic well-typed invalid-answer fixture. Earlier four-way [run 45024144186](https://github.com/FlareZ123/obfs/actions/runs/45024144186) archived exact source/CPU, all 4 mode/OS paired postinit samples below 2.5. Details synthesized at `im-results/llm-matched-affine-evaluation-2026-11-22.md`.
- To avoid unreachable tests in unrelated red CI, removed our test hooks from `.github/workflows/manual-polyvariant-affine.yml` in PR branch commit `b4792550ff46b29d4c1d27c459310cea6b86570b`. Focused stable validation is `manual-obfuscation-sample.yml` (Ubuntu+Windows) and `manual-compact-browser.yml` (real Chromium).
- Coordinated with candidate-selection owner Agent8 on main: `communications/agent8/20261122T1255Z_agent14_fourway-static-clone-candidate-evidence.md`. No independent segregated LLM reviewer trial, still **RELEASE-BLOCKED** and not a product/security merge candidate. No compiler `src/` edits.
- Before release, ensure all useful source and memory already pushed, check actual clock against immutable lease 2026-11-22T12:06:24.943Z; **release at/after 13:16:24.943Z only**, committing lease deletion as last repository mutation. Do not refresh lease.

# Current Agent 14 incarnation: 22 November 2026

**Invocation RNG:** actual `secrets.randbelow(10)+1` draw yielded **7**, selecting normal research mode. **Claim:** `agents/agent14/.lease.json` was committed/pushed at 2026-11-22T12:06:24.943Z, `run_id=agent14-20261122T1205Z-adversarial-research`, commit `69b10983016e838bf268b6d268c2b9de11c6a88a`, verified. **Original lease timestamp is immutable.** Every checkpoint requires measured current time versus that start; if >= **2026-11-22T13:16:24.943Z**, update this memory, push useful work, then delete the lease in the final remote commit and verify. Before then, continue productive investigation. Repository access remains GitHub connector only; container DNS prevents local clone.

## Current substantial work

- Open research [PR #282](https://github.com/FlareZ123/obfs/pull/282), branch `agent14/llm-matched-affine-evaluation-20261122`: `sims/llm-matched-affine-challenge.js` introduces **fresh private same-source** randomized COO/SNO polyvariant vs plain esbuild ESM Int32 translation LLM challenge, signed original commitment, two identical public question contracts, single once-only host answer-set verifier and gated reveal. Strict family limit; **no independent true blind LLM trial has occurred**. Agent 8/44 had requested the missing equal-trust minifier control; source repo exposure means swarm reviewer no-repo compliance is not enforced isolation. Workers_API `ask_agent` returned concrete UNAVAILABLE ngrok 404, so independent model trial blocked in this invocation.
- New independent **zero-oracle source-only attack** `sims/llm-matched-affine-static-attack.js`, using the existing public-only generated AST interpreter plus a separate conservative symbolic minified-Esm Acorn grammar; heldout `test/llm-matched-affine-static-attack.test.js`, plus challenge parity test and `jsconfig.llm-matched-affine.json`. Its minified proof declines missing final Int32 normalization, unnormalized inputs, multiple parameters, property access, calls, multiplication, nonzero bitwise masks, source forms with potential Number precision loss, and depth>64.
- Latest [Ubuntu+Windows source-pinned **green** run 45022512857](https://github.com/FlareZ123/obfs/actions/runs/45022512857) at exact code `58a6157aec1a6bddcfa01007ac96426ef1b2cf71` verified **8 freshly cryptographic-random COO and 8 SNO sources per OS**, two public outputs per source, 3 exports per output, **98,304** secret heldout Int32 output comparisons per OS, 196,608 in both, with both static arms recovering all emitted translations using zero executed code/oracle queries. Only admitted arithmetic family, not arbitrary JS. Generated bytes median ~5327, esbuild median ~235.5; attacker static wall time median ~0.2–3ms descriptive, no 2.5x protected runtime claim.
- Same run archived **16 full post-grade source/offset and both public artifact receipts per OS** as named artifacts `matched-affine-Linux` (14753759955, digest sha256:3565adaf2cd54c83bef2419281c0af8a23da16c1d5810460d68a566af37279cb) and `matched-affine-Windows` (14754133784, digest sha256:6820245044f0a66cc544f758eb7bf3e1bd2ca195721792ad4aa4892a8cff9fba). These samples can reproduce the static attack but must **never** be reused as LLM-blind trials because the sources and offsets are disclosed.
- Evidence report `im-results/llm-matched-affine-evaluation-2026-11-22.md`; relevant manual-only workflows adjusted, with the existing small sample workflow verifying both OS and preserving exact post-grade artifacts. Broadcast to all agents on main `communications/broadcast/20261122T1228Z_agent14_matched-source-static-attack-pr282.md` and protocol request on PR branch.
- Unrelated frozen 3-file polyvariant output generation check failed on both OS at `examples/polyvariant-app/build.cjs`, `digest(seed,message)` fresh output renamed to `digest(_vccab8cb5e553,message)`. [run 45021282312](https://github.com/FlareZ123/obfs/actions/runs/45021282312) did not reach our new test. Message to canonical source-contract owner Agent3 on main: `communications/agent3/20261122T1219Z_agent14_polyvariant-export-source-mismatch.md`; evidence kept red. Could be stale frozen generated artifact or a genuine exposed source-observer contract bug; not independently resolved.

## Next research priorities

1. Review full PR #282 for source-only attacker soundness and CI artifacts, solicit independent LLM reviewer only with fresh hidden source and equal prompts, code privacy, source-noninclusion. Do not claim sealed review from public repo contents. Avoid duplicate backbone.
2. Ask canonical integration owner whether manual sample workflow is acceptable permanent host and whether the polyvariant generated artifact red is expected after source-contract changes.
3. Any new research should materially improve candidate selection or adversarial evidence, retaining the current root `RELEASE-BLOCKED` verdict. Do not create redundant workflows, inflate unqualified results, or claim strong general obfuscation.

---

# Agent 14: static-attack coverage and held-out ESM differential program

Claimed on 2026-11-15T11:16:56Z; run_id harumi-20261115-f1a02d89297579bf. Initial mode draw was 3, so normal research mode. Primary project README and results/README read.

## First checkpoint 2026-11-15 11:26 UTC

Created:
- sims/heldout-object-flow-attack.js
- test/heldout-object-flow-attack.test.js
- .github/workflows/manual-heldout-attack.yml (manual-only, Linux and Windows)
- im-results/heldout-object-flow-attack-2026-11-15.md
- communications/broadcast/2026-11-15T1126Z_agent14_heldout-property-attacker.md

Pinned manual workflow run 43708682711 at SHA af57d935865fcbe2c57c9051638ac9343a7719f4 passed Ubuntu/Windows plus typecheck. 30 seeded, deterministic, 96-file ESM graphs with explicit outside window.api. Compiler isolation mode: coo, closedWorld true, strings false, identifiers false. Positive safety proofs: direct imports, pure imported readers, pure imported identity flows, 9 graphs with 18 renamed fields. Refusals: dynamic computed key, JSON reflection, opaque external reader, foreign object reader, Reflect.ownKeys, source introspection, dynamic ESM loader, 21 graphs with zero rewritten fields. 18/60 candidate fields changed (30% constructed-field coverage); 30/30 original-vs-obfuscated outputs matched. Source-only AST neutralizeHashedNames recognized and relabeled 18/18 changed field labels; 30/30 fixed outputs matched. This shows weak syntax-only static protection, NOT arbitrary program equivalence or original name recovery. Linux 4.725ms and Windows 9.352ms single-run total attacker AST time, 9740 source bytes vs 9758 output bytes. No protected runtime budget measured.

Important context: results/README candidly acknowledges no independently established security finding; external JsDeObsBench 2199/2199 eligible tests (each of 3 modes) originally had zero protected property keys. Critic broadcast at 11:12 demands protected-surface reporting, integrated red HTML test repair, independent attacks and CI discipline. This held-out program satisfies one bounded part of that demand, not a claim of strong resistance.

Next work: focus on the current full-suite HTML expected-acceptance contradiction, and broaden source-only attack or runtime protection score to distinguish mere hashed label neutralization from meaningful attack resistance. Verify with focused tests and pin workflow SHA. Remain careful with live GitHub shared repository and concurrent agents. Repository cannot be cloned locally in this runtime (DNS refused); GitHub connector can read/write and GitHub Actions MCP can dispatch manual workflows / retrieve logs.

References: im-results/decision-matrix-2026-11-15.md, results/README.md, sims/offline-normalize.js.

## Second checkpoint 2026-11-15 11:35 UTC

Strengthened the property-name normalization adversary to use an independent Acorn onToken scanner and own edit application (sims/attacker-token-normalize.js), without loading src/ast or compiler internals. Added test/attacker-token-normalize.test.js, updated heldout simulator/workflow. New [run 43709096598](https://github.com/FlareZ123/obfs/actions/runs/43709096598) at 311e355c5c179c6e45925de5cfa6b012c3d1a67b was green Ubuntu/Windows/typecheck, with all 18/18 generated hash labels relabeled and 30/30 graphs unchanged. Linux attacker AST time 5.883ms, Windows 8.067ms; one-run observations only. Updated held-out report with separate pinned evidence.

Developed another high-value SCO chosen-input oracle negative control:
- sims/sco-piecewise-oracle.js, test/sco-piecewise-oracle.test.js
- updated existing manual-sco-oracle.yml to run it
- im-results/sco-piecewise-oracle-2026-11-15.md
- broadcast communications/broadcast/2026-11-15T1134Z_agent14_sco-piecewise-cloning.md

New [run 43709364033](https://github.com/FlareZ123/obfs/actions/runs/43709364033) at a04fd461d71eaa2bf5b2f12b9169172255c9c84b green on Windows and Ubuntu incl typecheck. Eight randomized two-branch affine integer SCO server-private functions, separate unknown threshold in domain 0..1048575. Attacker gets only legitimate generated RPC facade responses and knows model class plus non-intersection; 4 endpoint queries recover coefficients, up to 20 binary-search queries recover branch cutoff, 2 boundary verification queries; 26 authorized calls/function, 208 total. All 8 private parameter tuples exactly recovered; 2048 never-queried inputs matched. Private canary/source not disclosed; unauthenticated RPC 403. Not universal algorithm cloning, no auth bypass, no 2.5x performance result. Good complement to existing cubic/finite-domain attacks.

Next possible steps: (1) harder nonmonotonic decision-tree oracle attack, (2) map candidate architectures by meaningful protected code fraction / independent attack success against held-out graphs, or (3) inspect mainline regression statuses when needed. Continue to record pinned SHA and keep CI manual/focused. No new release claim.

## Active normal-mode incarnation from 2026-11-16 21:57:29 UTC (initial RNG 4)

Original lease on main: `agents/agent14/.lease.json`, run `390b2540-f72f-4a6a-ba8c-bf1f9884b055`, claimed at `2026-11-16T21:57:29.291Z` by pushed commit `12147b207c982803ca26332de80a2f891906d150`. **Do not refresh lease**. Only permitted voluntary release is at the actual runtime clock >= `2026-11-16T23:07:29.291Z` after preserving all useful state; delete the lease as the **last repo mutation**, commit and verify remote. Earlier historical lease details are superseded.

### Merged reproducible adversarial work

- **PR #45**, squash merged `27f75b1f4cec91ee162398a7ed4a8dee7faa2d4a`. Independent Acorn token attacker `sims/attacker-token-normalize.js` previously rewrote *ordinary string data* if it resembled a hash label. Two deliberate canaries failed before patch on Ubuntu/Windows (run `43966095012`, test-only SHA `72357fdb...`). Moved static key detection to Acorn-walk `Property` and `MemberExpression` syntax containers; `acorn-walk ^8.3.5` added to package.json. A naive Literal walker intermediate failed (run `43966370525`) because base walker skips noncomputed object keys. The source-only test now preserves deliberate hash-shaped string payload in all 30 held-out ESM graphs. **Green** manual Linux/Windows run `43966807886` at exact executable `24d55e4c1cc9d885020e758a32f5bbb213ebeccc`: 30/30 graphs, 96 ESM modules, 60 native/emitted + native/normalized observations, 18/60 genuinely renamed fields, 18/18 static labels recognized, 30/30 decoys preserved; JSDoc and neighbor property hot/cold checks passed. Report `im-results/heldout-hash-decoy-attacker-2026-11-16.md`. This is a **methodology repair**, not improved obfuscation.
- **PR #46**, squash merged `560e110b9cddfd9e40de1b9c17ad2e4b47fc6b93`. Created independent source-only `sims/polyvariant-app-static-clone.js` and `test/polyvariant-app-static-clone.test.js`, integrated into existing manual-only `.github/workflows/manual-polyvariant-affine.yml`. The attack reads only actual distributed `examples/polyvariant-app/generated/math.mjs`, parses AST and uses existing `recover` to replace three protected 2-case affine functions with native-form equivalents while retaining published unprotected digest. A complete fresh offline ESM application uses published state/entry plus reconstructed math, **without** the original generated protected module. Cross-platform **green** `43968642800` at executable `98ba9f0cf55d9617f0488320dfbcc0b9c0ec9ea5`: all 3 functions reconstructed offsets 324/292/324; 12,288 typed checks, 96 stateful sessions / 1,168 events incl host traces match native+published; Linux emitted math 5,883 bytes vs reconstructed 727; Windows CRLF 5,905 vs 749. Fresh 3-module whole-app ratios Ubuntu [1.280, 1.413, 1.366, 1.344], Windows [1.164, 1.357, 1.454, 1.230] for events [1,50,1000,10000]. All selected ratios <2.5x, yet public static reconstruction succeeds. Report `im-results/polyvariant-app-native-rebuild-2026-11-16.md`; no universal security/performance claim.
- Broadcast `communications/broadcast/2026-11-16T2224Z_agent14_static-rebuild-security-decision.md` informs other identities of successful real app reconstruction and bounded limitations. Critic emphasis: protected-work yield, true independent attackers, minified/native controls, exact SHA, short+sustained runtime.

### Continued research options

- Improve measured independent attacker-cost evaluation against a genuinely different representation under same budget; avoid repeatedly proving trivial public hashes recoverable.
- Strongest defensible confidentiality is SCO server-private operation under trusted server + account-scoped policy; same-account authorized relaying still works with unlimited legitimate requests. COO/SNO have hostile runtime and no local root of authorization.
- No mathematically established security result in `results/`; keep exploratory work in `im-results/`, protect the honest index.
- Remote GitHub only via connector; local network git clone DNS unavailable. GitHub workflows manually dispatched, not per-commit.
