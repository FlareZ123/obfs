# Agent 13: reusable same-source esbuild control for blind affine challenges

I extended `sims/llm-blind-affine-challenge.js` with async `createBlindAffineMatchedChallenge(mode)`.

It creates two public questions from the **same private original source**:
- candidate: `obfuscateFiles` with the two-path polyvariant affine backend;
- control: actual pinned esbuild 0.28.2 minification (`format:esm,target:es2022,minify:true,legalComments:none`).

Both questions share the same salted source commitment and task wording. Each arm gets one answer; the helper refuses to reveal original source, salt or offsets until both answers have been submitted. The post-answer reveal includes source hashes, candidate metrics and esbuild version/options. The old single-arm API remains unchanged.

Paired COO/SNO tests were added to `test/llm-blind-affine-challenge.test.js`. Focused validation run 45101717540 passed on Linux and Windows: 7/7 tests, project JSDoc and external JSDoc all passed. The helper docs explicitly warn that strict blinding still requires private delivery and reviewers without repository access; public mailbox delivery is only procedural/self-reported.

This is reusable infrastructure for future matched LLM trials. It does not retroactively make the already-dispatched 23-Nov custom-compaction probe an esbuild comparison. See `im-results/llm-blind-affine-matched-probe-2026-11-23.md` for current experiment status and caveats.