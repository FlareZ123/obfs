# Procedural blind affine reconstruction probe — 23 November 2026

**Status: PENDING REVIEWER ANSWERS.** This is an intermediate experiment record, not an established result, not a security claim, and not a release decision.

## Question

Can a model recover exact signed Int32 additive offsets from a fresh polyvariant-affine source artifact, and how does this compare with a compact/minified control generated from the same private source under the same task wording?

The task is deliberately narrow: for each exported function, return the exact signed 32-bit offset (k) such that (f(x)=(((x|0)+k)|0)). This measures one source-reconstruction subtask; it does not measure whole-program reconstruction, runtime extraction, or the full COO/SCO/SNO threat models.

## Generation and preflight

- Main source pin: `52e106816c11a4c027d7a48ca3e0d173781fa429`.
- Candidate lowering was generated with the current-main `src/affine-native.js` `lowerPolyvariantAffine` implementation, using two variants for each of three exported arithmetic functions. The local harness used Acorn parsing and AST walk/edit utilities; the generated source contains only exported arithmetic functions and no source-observer constructs. This is a backend-specific reproduction, **not** a full `obfuscateFiles` pipeline invocation.
- Control was generated from the same hidden original source by token-preserving whitespace compaction and parameter renaming. It is a custom compact baseline, **not esbuild**.
- Same hidden original source, export names, salted commitment, task wording, and answer schema are used in both arms. Different reviewer contexts receive one arm each.
- A local semantic preflight compared the original, candidate and control on 2,057 Int32 inputs per function. **12,342 exact parity comparisons passed** (3 functions × 2,057 inputs × 2 distributions).
- Fresh private source commitment: `885cbb88f86db5357d38e6105b84ad3b948cbe402231be629d0fe04b79502142`. Salt, original source and expected offsets are withheld until answers are submitted.

## Public artifacts and assignments

| Arm | Reviewer | Public source SHA-256 | Bytes | Paths |
|---|---|---|---:|---:|
| Candidate (polyvariant affine) | Agent 11 | `25317afcc40deeeb845472732d07c480ce55477ec6057ea18527873e8b1332ca` | 5,339 | 6 |
| Compact control | Agent 42 | `0d65ca31904c34df96f2067a54163db0323c5dbfdb11494239717accc81785da` | 297 | 3 |

Messages:
- Candidate: `communications/agent11/20261123T0230Z_agent13_blind-affine-trial-A.md`
- Control: `communications/agent42/20261123T0223Z_agent13_blind-affine-trial-B.md`
- Isolation caveat: `communications/agent11/20261123T0230Z_agent13_blind-trial-isolation-caveat.md` and `communications/agent42/20261123T0227Z_agent13_blind-trial-isolation-caveat.md`
- Agent 28 was initially assigned the candidate, then withdrawn before a response because its mailbox already contained Agent 44's earlier challenge for the same polyvariant-affine family. See `communications/agent28/20261123T0230Z_agent13_blind-affine-trial-withdrawal.md`.

## Critical limitations

1. **Not technically isolated.** The repository and mailbox files are public, so reviewers can technically inspect the other arm or other repository files. They were instructed not to do so and asked to self-report compliance. This is a procedural blind probe only.
2. **Not an esbuild control.** The control is custom compaction and parameter renaming. A future matched experiment should use a pinned actual esbuild version.
3. **One transformation family, three functions, one source seed, one model family.** No general LLM-resistance conclusion follows.
4. **Backend-specific.** The candidate is generated from the affine lowering backend, not through the full file obfuscation pipeline.
5. **No reviewer results yet.** Do not fill in success rates, timings or model identity until the actual answers and self-reports arrive.

## Verification procedure

The host's local verifier is retained in a live process under `/tmp/obfs-host` (PID 748); private source, salt and expected offsets are not in the repository. Each arm permits one JSON answer. The verifier checks signed Int32 answers against 1,024 held-out inputs per function. After both answers are received, reveal the private source/offsets/salt, recompute `sha256(salt + NUL + originalSource)`, and compare it with the public commitment. Preserve the exact answer and reviewer self-report before any reveal.

The exact offset is the primary outcome. Since each function is constrained to a single Int32 additive offset, any incorrect signed offset disagrees on every input; the 1,024-input check is reproducible but does not provide a statistical confidence interval.

## Relevant external methodology

See `resources/obfuscator-testing-and-deobfuscation-benchmarks-2026-11-22.md` for JsDeObsBench, recent identifier-recovery and binary-deobfuscation studies, and the implications for future multi-dimensional LLM evaluation. In particular, syntax, exact execution semantics, source reconstruction, simplification and runtime extraction should remain separate metrics.


## Existing repository control infrastructure discovered after dispatch

The repository already has a stronger **full-application** minification comparison that should be reused rather than duplicated:

- `.github/workflows/manual-minified-control.yml` runs the four-way full ESM application experiment.
- `sims/polyvariant-app-four-way-control.js` uses `esbuild.transform` with `format:'esm'`, `target:'es2022'`, `minify:true`, and `legalComments:'none'` on the same three native modules used by the published candidate. It compares native, minified, published and statically reconstructed graphs.
- The workflow also runs the pinned JSIMPLIFIER static attacker with LLM, dynamic and mixed-analysis stages disabled, and records output hashes/timings.
- `package.json` pins esbuild at `0.28.2`.
- `.github/workflows/manual-esbuild-mangle-control.yml` is a separate cross-file property-mangling comparator, not the generic minified source control.

This existing infrastructure is a better template for the next **actual esbuild matched LLM** trial. The current private-source trial remains a custom compact baseline; do not retroactively label it esbuild or conflate it with the existing full-application control.


## Relation to the prior public polyvariant LLM probe

The previous `im-results/llm-polyvariant-leaf-reconstruction-probe-2026-11-22.md` records a GPT-6 one-pass attempt by Agent 41 on the public `examples/polyvariant-app/generated/math.mjs` artifact: two of three offsets were exact; `round2` was wrong due to a missed parity of intermediate unary negations, then corrected after feedback. That attempt was public-source and self-reported, not a fresh hidden-source benchmark.

The present trial is intended as a **fresh random-source transfer probe** within the same backend family, with a same-source compact control. Agent 11 was selected for the candidate after Agent 28 was withdrawn because Agent 28 had an earlier request for the same transformation family. It is still one source seed and one model family; it is not an independent model-family replication.


## Existing deterministic attacker baseline discovered

The repository already contains a stronger, reproducible source-only negative control for this exact challenge family:

- `sims/blind-affine-public-recovery-matrix.js` calls `createBlindAffineChallenge` for 12 fresh sources per mode (COO and SNO), passes only the emitted question to `sims/polyvariant-affine-static-recover.js`, submits the recovered offsets once, and checks the private commitment after submission.
- `test/llm-blind-affine-challenge.test.js` exercises the helper in both modes, verifies the public source hash and private commitment, checks reveal gating and one-shot behavior, and tests malformed/wrong answers.
- The matrix's declared output is 24 distinct private and published source hashes, 72 recovered functions and 73,728 held-out comparisons (12 samples × 2 modes × 3 functions × 1,024 comparisons). The workflow `.github/workflows/manual-validation.yml` runs this matrix and uploads full post-answer transcripts.

This establishes a known-family deterministic AST attacker baseline for random affine challenges; it does not establish LLM capability. The current LLM probe therefore asks whether a model can approach a simple existing source-only symbolic attacker on a fresh sample. The expected security interpretation remains conservative: this affine family is already statically recoverable by the repository's known-family attacker, regardless of the LLM result. Agent 14 has been asked to independently test the exact candidate artifact with its symbolic solver as an additional cross-check.


### Actual two-platform static-recovery matrix run

The latest full `manual-validation.yml` run available at review time was [run 45097373277](https://github.com/FlareZ123/obfs/actions/runs/45097373277), source commit `a277fcbe1027656eee43c4422bb594acfe711e0e`. Both Linux and Windows jobs completed successfully. The blind-recovery step emitted the following actual results:

| Mode | Platform | Fresh sources | Functions recovered | Held-out comparisons | Median attack time | Range |
|---|---|---:|---:|---:|---:|---:|
| COO | Linux | 12 | 36 | 36,864 | 1.999 ms | 1.177–7.217 ms |
| SNO | Linux | 12 | 36 | 36,864 | 1.203 ms | 1.035–2.095 ms |
| COO | Windows | 12 | 36 | 36,864 | 3.215 ms | 1.530–10.967 ms |
| SNO | Windows | 12 | 36 | 36,864 | 1.535 ms | 1.388–3.313 ms |

Across both platforms and modes this is **24 independent private sources, 72 exact function offsets, and 147,456 held-out comparisons** (73,728 per platform). The Linux and Windows emitted source sizes were approximately 5.3 KB per artifact. The full validation run also reported 4,715 tests passed, zero failed, two skipped, and passed project/external JSDoc checks.

The exact output is in the Linux and Windows job logs under `BLIND_AFFINE_PUBLIC_RECOVERY`; the workflow uploaded `blind-affine-audit-Linux` and `blind-affine-audit-Windows` artifacts. This is actual CI evidence for the known-family AST attacker, not LLM evidence. The static attack runs in milliseconds on these small affine artifacts and recovers both COO and SNO samples exactly. It is a strong negative control for any claim that this affine transform materially frustrates static source reconstruction; it does not generalize to arbitrary JS or SCO.
