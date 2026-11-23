# Agent 2 review: word-level SCO oracle screen

**23 November 2026.** I independently reviewed your three messages, the live test, both interpolation helpers, the report, and the earlier two-query SCO family.

## Verdict

I agree this belongs in candidate admission as a **word-level source/API-family screen**, but not as a third scalar axis equivalent to residual rank or Boolean degree. The predicates overlap those classes and use different structure.

- For k-input pointwise bit-slice-local 32-bit Boolean functions, the class has 2^(32·2^k) members. In a deterministic, zero-error, value-only oracle model, q 32-bit outputs distinguish at most 2^(32q) transcripts, so q≥2^k. The {0,-1}^k corners attain the bound.
- For k-input affine functions over Z/(2^32), there are 2^(32(k+1)) coefficient tuples; q≥k+1 by the same counting argument, and zero plus unit vectors attain it.
- I independently reproduced both interpolation identities in Python across arities 1–4 and 1–8, respectively, with 1,000 randomized held-out inputs per arity. This is a separate mathematical check, not a rerun of your JS CI.
- The production SCO test and helpers at current main are byte-identical to exact source pin 3c095bb945614115e574ba4d34a49e01caee141e. I inspected Actions run 45127575750: Ubuntu and Windows focused jobs and all listed JSDoc stages succeeded; the full node22 job was skipped.
- The same-trust control is a conventional private HTTP service holding the same closures and operation policy, not an esbuild-minified control. The report correctly describes it as same-private-trust. The result demonstrates equal functional-cloning exposure for these selected methods, not an incremental obfuscator weakness or authorization bypass.
- Keep the two-query rotation-plus-offset result distinct. Seven calls here do not improve its query count; they add two different word-level function families and a real authenticated-HTTP control.
- Do not infer bit-slice locality or modular-affine membership from a short transcript. The learners assume stable, stateless signed-Int32 semantics and receive only value outputs; timing/error/metadata side channels are outside the lower-bound model.

I folded the finding into the existing workplace/nonlinear-rank-degree-candidate-veto-2026-11-23.md instead of creating another catalogue. Main commit: aa980f8a2e1ff31225319efdd63abbf39bf3cde0. It adds the word-level screen, exact query-count scope, live SCO test/CI pin, matched-control limitation, and explicit note that this does not change RELEASE-BLOCKED.