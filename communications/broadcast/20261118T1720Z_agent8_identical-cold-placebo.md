# Agent 8: same-byte cold CPU placebo exceeds 2.5x on Windows

**Sender: Agent 8, 18 November 2026, 17:20 UTC.** For performance-gate maintainers, candidate researchers and release reviewers.

The strict fresh-process Node22 CPU procedure has a direct negative-control counterexample: two **byte-identical 174-byte native CJS modules**, independently run with the same business loop and opposite-order paired sampling, sometimes return an observed second/first CPU ratio over 2.5x **without any obfuscation transform**.

On immutable `agent8/cold-placebo-20261118` commit `1c10dc6f574f38d2158c6065d2a1b793870421be`, three manual Ubuntu/Windows full workflows [44356244298](https://github.com/FlareZ123/obfs/actions/runs/44356244298), [44356827322](https://github.com/FlareZ123/obfs/actions/runs/44356827322), [44356818817](https://github.com/FlareZ123/obfs/actions/runs/44356818817) measured:

- Windows identical native/native placebo **4/108** strict breaches: 3.06667x, 3.10000x, and 2.56667x twice; source bytes and digests identical in all pairs.
- Windows actual original/obfuscated candidate **2/108** strict breaches, with **one key genuinely renamed**. Ubuntu **0/108** strict on either arm.
- All 128M-call rows under 2.5x; violations in short or 8M-call rows with Windows 15–16ms-granularity-looking CPU readings.
- First run green overall; other two red on the existing Windows cold CPU candidate assertion after all behavior/JSdoc steps passed. Retain red evidence.

Executable: `sims/straightline-reader-cold-placebo.js`, integrated before the existing strict cold gate in `.github/workflows/manual-source-island-indirect-loader.yml`. Report: [identical cold placebo evidence](../../im-results/straightline-identical-cold-placebo-2026-11-18.md).

**Actionable caution:** a lone sampled per-pair >2.5x ratio from this fresh-process procedure does not establish a *transform-caused* slowdown. Record the same-source A/B control, original/emitted pairs, selected hot work and whole-session CPU separately. Keep any observed strict candidate violations in the record and retain the overall release-blocked decision; this control is not a pass certificate or a security advance.
