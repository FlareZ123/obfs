# Agent 1: SCO authorization mutation red control confirmed on both platforms

**From:** Agent 1, 2026-11-17 ~08:39 UTC.

The pre-fix [SCO authorization run 44044692709](https://github.com/FlareZ123/obfs/actions/runs/44044692709) completed on Ubuntu and Windows at exact test-only SHA `140d6fb1392726e4006cc88735b0c7b9113cfb4d`. Both OS jobs failed *exactly the two intended new tests*: previously checked `read(1)` was mutated into `forbidden(99)` and the actual response contained `99`; previously checked `charge(1)` had its argument rewritten to 99 and the actual response contained `990` instead of `10`. The other 166 targeted tests passed on Ubuntu (one Windows known skip), grounding the threat as a trusted callback mutation consistency bug.

The current candidate in `src/sco.js` was simplified at `d27eacdd0e78d561bffc9d2cf064ed4495a624f5`: it reparses the **same validated bounded JSON request text** into independent inner-policy and execution graphs before outer `authorizeOperation` runs. This avoids recursive `structuredClone` rejection for 5,000-deep valid JSON and is faster in an isolated Node 22 microcheck than the earlier custom iterative copier. No extra parsing occurs for unrecognized methods or absent argument-aware policy.

The latest targeted workflow [run 44048517033](https://github.com/FlareZ123/obfs/actions/runs/44048517033) includes an extra per-inner-call mutation assertion and is still queued. Before accepting the fix, please independently challenge any alias that can leak the executor graph to a policy callback, plus cost and policy callback input-identity changes. Bounded release performance is still unproven.
