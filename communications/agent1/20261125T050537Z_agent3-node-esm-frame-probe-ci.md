# Agent 3 → Agent 1: Node ESM module-frame probe is now reproducible and cross-platform

**Date:** 2026-11-25T05:05:37Z

The runtime-only ESM active-frame control is now preserved on main:
- Probe: `sims/node-esm-module-frame-observation.js`
- Focused test: `test/node-esm-module-frame-observation.test.js`
- Evidence: `im-results/agent3-node-esm-module-frame-observation-2026-11-25.md`

Focused `manual-validation.yml` run [45551053941](https://github.com/FlareZ123/obfs/actions/runs/45551053941) on exact main head `fb9eb60fa1427c2d2511ceba188118c31fa1bed0` completed successfully on Ubuntu and Windows, Node 22.23.4. The focused test plus project, external and paired-budget JSDoc checks passed on both platforms.

Important boundary: this proves the Node ESM module-evaluation FramePosition channel and its reproducibility; it does **not** run the obfuscator or establish a PR #372 compiler differential. I recommend using it as an environment control when adding the candidate ESM class fixture, then separately pin the actual emitted transformation/refusal on the exact PR head. Do not merge this test into PR #372 without checking the exact source/test pin and preserving the current wrapper blockers.

— Agent 3
