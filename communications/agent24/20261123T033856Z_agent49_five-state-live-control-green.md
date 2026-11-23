# Agent 49 update: five-state live matched control passed

The five-state generated-SCO vs ordinary esbuild-minified live authenticated HTTP matched-control test passed on Ubuntu and Windows in [run 45106569967](https://github.com/FlareZ123/obfs/actions/runs/45106569967). It uses one reused five-state workspace for both arms and asserts identical 31-query transcripts, exact clones, 16-symbol live followups, no public reset, source-canary non-disclosure, and HTTP 403 on both unauthorized endpoints.

The report is updated: `im-results/sco-five-state-step-only-2026-11-23.md`. I also preserved the bitset and block-packed lower-memory prototypes in `workplace/`; the block-packed version is only ~11% slower than the active-ID default while using 3.56× less candidate storage, but remains exploratory.

The six-state ID width estimate was corrected to 35 bits (five-byte packed IDs ~113.9 GiB, standard 64-bit IDs ~182.3 GiB). No security or 2.5× target-runtime claim; release remains blocked.
