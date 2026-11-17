# One-shot blind affine reconstruction harness

**Date:** 2026-11-17. **Classification:** Intermediate experimental apparatus. This is an anti-LLM test design and a known-family static negative control, not evidence that a deployed obfuscator resists a new reasoning agent.

## Objective and test boundary

The primary prompt explicitly anticipates groups of autonomous adversaries. A defensible model-resistance claim needs genuinely new obfuscated JavaScript supplied to a reviewer **without** original source, compiler seed, source-recovery scripts, previous private offsets, or evaluator output before the reviewer commits to an answer. Past known-seed benchmark examples cannot establish this.

The CJS/JSDoc helper [\`sims/llm-blind-affine-challenge.js\`](../sims/llm-blind-affine-challenge.js) creates a new temporary in-memory three-leaf ESM application on each invocation using Node's cryptographic \`randomInt(1,256)\` (constants 1 through 255, matching the compiler's admitted grammar) and \`randomBytes\`. Each exported \`round1\`, \`round2\`, \`round3\` is a source-obscured chain of ten signed integer additions/subtractions with one explicit \`|0\` input normalization and one final signed \`|0\` conversion. The generated input functions are the **private ground truth**.

The compiler is invoked with an independent random seed and opt-in two-path polyvariant native affine lowering in **COO** or **SNO**, leaving three independent public ESM exports. A run is eligible only if the compiler reports exactly three transformed leaves and six generated paths. Unknown or unsuitable code is rejected by the compiler's existing eligibility system.

The only data intended for a blind reviewer is \`challenge.question\`:

- The complete publicly emitted obfuscated ESM text.
- SHA-256 of those emitted bytes, the mode label, and the three public export names.
- A salted SHA-256 commitment to the private original source without revealing the source or the salt.
- A fixed JSON answer schema and instruction to recover an independent signed Int32 offset for each of the three exports.

The reviewer submits a single JSON object to \`challenge.verify(answer)\`. The verifier rejects malformed offsets, compares proposed behavior with private function offsets over **1,024 deterministic held-out Int32 values per leaf**, and disallows further answers for that instance. Once a single answer is submitted (including a wrong one), \`challenge.reveal()\` discloses the original source, salt, offsets, and commitment, allowing third parties to verify that the private ground truth was fixed. Actual private code is never evaluated from an untrusted response; the response is parsed as primitive JSON data.

## Required independent-adversary protocol

1. Host creates a single challenge instance with a fixed announced mode. Give the independent reviewer **only** the serializable public \`question\`; do not give it the hidden closure, original code, static recoverer, or private commit information.
2. Record the exact public question digest and the reviewer's complete submitted answer in an auditable transcript. Enforce a predeclared wall-clock budget and query budget; if testing static-only resistance, do not supply runtime execution oracle.
3. Verify the one-shot answer, then reveal the original source and salt. Check the SHA-256 commitment and held-out arithmetic results independently. Preserve reviewer prompt/model/version, attempts, tools and timing.
4. Repeat across many independent generated seeds. Report success fraction and time-to-recovery with uncertainty. Do not equate the number of appearances of opaque source with actual resistance.

## Bounded negative control

[\`test/llm-blind-affine-challenge.test.js\`](../test/llm-blind-affine-challenge.test.js) submits results from the existing independent [public-source affine decompiler](../sims/polyvariant-affine-static-recover.js), which reads only \`question.source\` and advertised public names. The test also exercises bad-format answers, known-wrong Int32 offsets, one-shot restrictions, sealed private source before submission, both modes, and post-answer salted source commitment. This establishes whether the harness accidentally leaks an answer or mismodels known static recovery. Since that decompiler was designed for the emitter grammar, its success is **not** evidence of an independently adapting LLM agent or recovery of arbitrary JS semantics.

## Current implementation and external reviewer limit

The local external reviewer worker was contacted on 2026-11-17 with *only* the published 5,883-byte ESM \`math.mjs\` text and no original source/seed. Its service returned \`UNAVAILABLE: ... SSE probe returned 404\`, so there was **no model answer**. No agent-based reconstruction result or model-resistance claim can be recorded from that attempt.

At the time of this draft, the helper and pure test code have been syntax parsed, and their two-platform execution in repository CI is pending. Test parity and exact field counts must be verified by a completed workflow before treating any empirical result as established.


## Independent private-program recovery matrix

The additional [\`sims/blind-affine-public-recovery-matrix.js\`](../sims/blind-affine-public-recovery-matrix.js) creates **twelve entirely different private sources in each of COO and SNO**, for 24 separate distributions, and tests the existing independent AST recovery algorithm against **all 72 emitted functions**. Every answer is submitted while the original remains sealed, then checked against 3,072 held-out comparisons and revealed for commitment auditing. The 24*3*1024 = 73,728 held-out arithmetic checks are repetitions of a bounded grammar-family test. Every distribution receives its own cryptographic source and compiler randomness.

The matrix reports distribution uniqueness, public output sizes, attack times, complete selected-function recovery counts, and byte-exact auditability. When CI sets \`OBFS_BLIND_AUDIT_FILE\`, a cross-process-locked atomic write preserves a full post-verification JSON transcript containing each \`publishedSource\`, answer, original private source and salt. This avoids treating a successful claim from a static attacker as reproducible without access to the actual distributed bytes and private commitment.

[\`test/blind-affine-public-recovery-matrix.test.js\`](../test/blind-affine-public-recovery-matrix.test.js) exercises a smaller six-distribution matrix and replays its static recovery and SHA-256 source commitments independently of the matrix's verdict. The branch's manual-validation workflow adds the full 24-distribution experiment and uploads \`blind-affine-audit-<OS>.json\` for each OS. The first branch CI run was queued before these additions; a new run at the updated branch SHA is required.

## Security and design limitations

- COO and SNO distribute executable code to their stated fully controlling attackers, and this toy family has a straightforward public AST recovery. This experiment tests a model's ability to recover a known affine family, not environment-lock enforcement or source confidentiality of general JavaScript.
- Releasing the response verification result can leak one bit per submitted answer; the harness explicitly permits one answer per challenge instance. An operator who repeatedly creates challenges may produce unlimited **different** public programs, and this does not secure any long-lived distributed program.
- A salted commitment only fixes the original source for later audit. It provides no code confidentiality, authorization, license enforcement, or integrity protection of hostile runtimes.
- The original \`|0\` expression and proof compare exact numeric signed 32-bit input semantics. They are deliberately unsuitable for arbitrary JS objects, \`Symbol\` coercion, \`BigInt\`, and reflective callbacks. Compiler source-source semantic parity must be checked separately for those types.
- The harness is designed to falsify exaggerated anti-model claims. The project should not advertise model-resistant protection unless an independently run, blinded, fully logged attacker fails under a well-defined practical budget and comparable conventional minification controls.


## Two-platform validated negative control: 17 November 2026

The first original branch gates failed because the private generator sampled constants through 511 while the affine compiler admits only literals 0 through 255. Generator and design were corrected to sample 1 through 255, with no compiler weakening or acceptance expansion.

The completed [manual full validation run 44027932848](https://github.com/FlareZ123/obfs/actions/runs/44027932848) **passed both Ubuntu and Windows Node 22 suites, strict JSDoc and the existing Chromium/browser integrations**, at exact committed source e0256b99415a4c46c4528dc84e7509d8c01eb201. The standalone private-source matrix produced 24 independently generated distributions (12 COO, 12 SNO), 72 reconstructed functions, 73,728 held-out integer comparisons, 24 distinct private-source SHA-256s and 24 distinct distributed-source SHA-256s. Each challenge was submitted exactly once before source and salt were revealed for salted SHA-256 verification. Audit archives are retained as GitHub Actions artifacts named blind-affine-audit-Linux and blind-affine-audit-Windows, containing the post-answer public/private transcript.

On Ubuntu, the known-family source-only AST recoverer's median per-distribution wall-clock samples were **1.661 ms COO** and **0.806 ms SNO**, each over twelve different private programs. On Windows, the corresponding medians were **3.348 ms COO** and **1.493 ms SNO**. Output size ranged **5,317–5,350** and **5,325–5,351** bytes (Ubuntu COO/SNO), and **5,318–5,341** and **5,316–5,345** bytes (Windows COO/SNO). These are program-specific exploratory samples and are not fair native/minified attack-time comparisons.

**Observed outcome:** The pre-existing public-source affine grammar interpreter recovered every randomly generated published function in this small challenge family. No independent language-model reviewer or human adversary attempted the sealed questions. This is a reproducible *negative static-secrecy control* and a validated adversarial evaluation harness. It neither proves nor refutes resilience against future model attacks on a different grammar, and the hostile-runtime and 2.5x release gates remain independent.

## Integrated mainline validation, 2026-11-17 08:43 UTC

The exact integrated source at merge-parent commit `2f0e9662fed59633fe4ecdae8ab5998e6077790d` passed [manual-validation run 44047611302](https://github.com/FlareZ123/obfs/actions/runs/44047611302) on Node 22 Windows and Ubuntu, including the repository-wide behavioral and adversarial tests, strict JSDoc, performance sampler and actual Ubuntu Chromium suite. The completed work was merged as [PR 50](https://github.com/FlareZ123/obfs/pull/50) at `aa7dfc4fbfa9f395a90e7bdef852b9c6c400160e`.

For **each operating system independently**, the full source-only control generated 12 fresh unknown-source examples per mode, 24 distinct original and 24 published variant hashes across COO/SNO, recovered 36 arithmetic exports per mode, and passed 36,864 held-out signed-Int32 checks per mode (73,728 total per OS). The source-only interpreter received only each publicly emitted challenge, with the original source and commitment salt disclosed only after its one-shot answer. The exact audit transcript JSON is attached to the CI run for both operating systems.

| Platform | COO median measured AST-recovery time | SNO median measured AST-recovery time | Outputs recovered |
| --- | ---: | ---: | --- |
| Ubuntu Node 22 | 1.4813 ms | 0.7406 ms | 36/36 per mode |
| Windows Node 22 | 3.8024 ms | 1.4635 ms | 36/36 per mode |

All times describe this implementation and selected affine private program family under runner-dependent conditions. They exclude an independent human or model's reasoning effort and cannot rank arbitrary obfuscation techniques. **No independent LLM reviewer submitted a sealed blind answer.** This is a reproducible known-family AST negative control, with full provenance and real cross-platform execution. Any subsequent anti-LLM claim still requires a separate reviewer who receives only the sealed public question before ground truth is revealed.
