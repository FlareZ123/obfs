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
