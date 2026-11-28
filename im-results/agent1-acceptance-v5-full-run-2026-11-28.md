# Agent 1 — v5 fail-closed acceptance full run (2026-11-28)

**Classification:** intermediate operational evidence in `im-results/`; not an academically established result and not a release approval.

## Frozen source and workflow

- Candidate SHA: `d4a7a4bcb00ef178314d8e9e1448b955ea8ce8da`
- Branch: `agent1/frozen-acceptance-spine-v5-20261128`
- Product-source base: `5d262b309f50e2beee84417cc66406b4e932c260`
- Full run: [GitHub Actions run 46185516351](https://github.com/FlareZ123/obfs/actions/runs/46185516351)
- Final decision artifact: [artifact 15279892178](https://github.com/FlareZ123/obfs/actions/runs/46185516351/artifacts/15279892178)
- Final workflow conclusion: failure, as expected for the fail-closed NO-GO result.
- The final decision job's own process-level suite passed all 21 tests before evaluating live evidence.

The final decision job consumed exactly two JSON receipts, checked their source commit against the dispatched SHA, checked Node v22.23.4 and Linux/Windows coverage, evaluated all eight upstream job results, and wrote `acceptance-decision.json` with the candidate SHA, upstream job results, blockers/unresolved reasons, and exact raw-file SHA-256 values.

## Machine-readable decision

`RELEASE-BLOCKED`.

Upstream jobs:

| Job | Result |
|---|---|
| full-validation | failure |
| matched-minifier | failure |
| sco-equal-trust | success |
| sco-cpu | success |
| sno-cpu | success |
| application-challenge | success |
| application-sco | success |
| adversarial-applications | success |

Evidence file hashes retained by the decision:

| Artifact file | Platform | SHA-256 |
|---|---|---|
| `release-evidence-Linux.json` | linux | `320766503a85d4f2e41b68d26758f8c39b418abb69bbb9ed14371b1d4dc68d55` |
| `release-evidence-Windows.json` | win32 | `52ab5ec69cc26fc2db08c38fdb5b065625b6d86ddbccceb04733c18daa9bbf40` |

Decision artifact ZIP SHA-256: `988151cd2cb388d71e91f39ece39146d0c82a0db395277653f67ca486af3e14f`.

## Why it is blocked

### Full correctness validation

The full two-OS Node suite ran 5,477 tests on each platform and reported 13 failures on both:

- Linux: 5,438 passed, 13 failed, 26 skipped.
- Windows: 5,429 passed, 13 failed, 35 skipped.

The reported failing cases were:

1. `bound-runtime-minifier-control.test.js` — same pre-import bind interception recovers private target from minified and obfuscated ESM.
2. `factory-object-flow.test.js` — private ESM factory preserves two-file native Node execution.
3. `function-declaration-reader-proof.test.js` — cross-module native ESM graph preserves direct named declaration reader calls.
4. `function-declaration-reader-proof.test.js` — public-only source normalization retains a functional clone beside ordinary minifier.
5. `interfile.test.js` — four-file ESM dataflow preserves named imports, nested calls and external APIs.
6. `private-class-source-yield.test.js` — COO private direct-use class preserves value and permits private owner rename.
7. `private-class-source-yield.test.js` — SNO private direct-use class preserves value and permits private owner rename.
8. `private-tuple-session.test.js` — private tuple end-to-end cold session measures compile, initialization and complete execution.
9. `sco-private-process-loader.test.js` — selected SCO private dependency has unproved module initializer state in `private/engine.mjs`.
10. `sco-private-transitive-relay.test.js` — selected SCO private dependency has unproved module initializer state in `private/deep/leaf.mjs`.
11. `sno-bound-runtime-interception.test.js` — SNO cannot conceal a non-constructible bound private target from the host before requiring the entry.
12. `source-stable-bound-export.test.js` — bound public export keeps native source and callable metadata while private primitive keys change.
13. `bound-runtime-interception.test.js` — hostile bind interception recovers actual private target source despite source-stable bound export.

These are test failures, not 13 independently proven exploits. Agent 10's subsequent oracle review and correction materially narrows interpretation: attacker inspection of **transformed** source is intended, not itself a semantic mismatch. Exported functions/objects may remain valid positive fixtures under an explicit `closedWorld:true` contract if all semantic consumers are included and no in-group code observes original source text or relies on original external keys. Re-evaluate factory-object-flow, function-declaration-reader-proof, interfile and private-tuple cases against actual in-program `.toString()`, `Function.prototype.toString.call`, `Reflect.apply`, alias observation and the closed-world boundary. The bound-interception tests currently treat successful attacker extraction as a passing assertion; separate vulnerable-control success from candidate resistance. The local-class direct-use case appears to be a genuine positive-yield control and should remain. See `im-results/agent10-source-observation-review-of-main-red-tests-2026-11-28.md` and its correction section. Browser integration, typechecks, external JSDoc and benchmark steps passed on both platforms.

### Matched-minifier dependency

Both matched-minifier matrix jobs failed before producing a valid comparison: `npm ci` rewrote the existing mirror URL to registry.npmjs.org, which returned HTTP 404 for `gemini-js@1.0.2`. This is an infrastructure/dependency blocker, not a measured resistance or performance result. The matched minifier control must be repaired or replaced with a pinned, reproducible dependency before another full acceptance run.

### Adversarial evidence and compute

Both adversarial-application matrix jobs succeeded and emitted source-pinned evidence. Both summaries nevertheless reported `RELEASE-BLOCKED`.

- COO and SNO evidence reported demonstrated functional clones and recovered selected functions.
- Security-axis evidence reported static reconstruction, SNO owner-loader substitution, a forged public manifest, and offline execution of reconstructed/copied public code.
- SCO's legitimate same-account relay was kept separate from source extraction. Private-source extraction and unauthorized-token-bypass evidence remained unmeasured, so those dimensions cannot pass.
- Neither platform emitted the explicit eight-dimension acceptance receipt required for GO.
- SCO budget evidence reported sample exceedance; the strict cross-mode familywise, compute-boundary familywise, and SNO post-initialization checks also reported over-budget observations.

The fact that the individual SCO/SNO CPU producer jobs were green means only that those evidence-producing jobs ran. It does not override the strict budget verdicts in the receipts.

## Interpretation and next work

The decision boundary behaved as intended: green evidence producers did not override failed prerequisites, blocked security evidence, unmeasured acceptance dimensions, or strict compute-budget breaches. The full workflow is a completed NO-GO.

Do not rerun the full workflow until:
1. the 13 full-validation failures are individually classified, fixed or explicitly shown to be false-negative test controls, and reproduced on a fresh exact main SHA;
2. the `gemini-js@1.0.2` dependency is pinned to an available trusted source or the matched-minifier control is replaced reproducibly;
3. strict 2.5x budget exceedances are eliminated or the measured workload/initialization accounting is corrected with evidence;
4. SCO private-source extraction and unauthorized-token-bypass axes are measured separately;
5. the evidence producer emits a complete, explicit acceptance receipt for every required dimension.

The exported-factory multi-root work on Agent 9's separate branch has a 66/66 three-platform focused receipt, but remains a donor, not a current-main integration. Agent 1 requested its minimal source/test/dependency handoff; do not merge the stale branch ancestry wholesale.
