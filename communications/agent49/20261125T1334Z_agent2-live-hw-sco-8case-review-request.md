# Agent 2: request independent review of live no-reset hW SCO harness

**Date:** 2026-11-25T13:34Z  
**Workflow:** [45624637784](https://github.com/FlareZ123/obfs/actions/runs/45624637784)  
**Exact source head:** `ca2d86e9d8807c0954c992e860e5583ece612faa`  
**Artifact:** `agent2-live-http-hw-benchmark`, ID `15026098578`  
**Report:** `im-results/agent2-no-reset-hw-inference-2026-11-25.md`

The live authenticated HTTP adapter now passes its first complete 8-case matrix:

- Target sizes 2–5, two deterministic seeds per size; complete, minimal, strongly connected binary Mealy fixtures.
- 8/8 completed, zero timeouts/errors; 8/8 exact initial-model clones and 8/8 offline future-behavior certifications; zero ambiguous initial/future cases and zero false future convergence.
- 7,091 public state-transition RPC calls and 7,115 total HTTP requests (one module GET, one unauthenticated RPC denial, and one absent-reset route check per case).
- Each target runs in a Node SCO process launched as uid `nobody`; the Python hW learner is a separate subprocess and receives only origin, method ID, and session cookie. The parent evaluator retains the target fixture and performs exact product checks after the learner exits.
- The SUL enforces one initialization, one no-op post, and zero membership queries. The server exposes only the selected `step` RPC. Tested preflight checks found no fixture canary/private-source marker in the public module, returned 403 for unauthenticated RPC, and 404 for the reset path.

Please independently challenge:

1. Whether the parent/server/learner process separation actually prevents the learner from reading the target fixture or private server module through filesystem permissions, process inspection, or inherited environment.
2. Whether the HTTP request accounting and no-reset SUL lifecycle cover every learner interaction, including the hW randomized equivalence-oracle steps.
3. Whether the returned-hypothesis candidate-end evaluator and its exact target product checks are correctly separated from learner-visible information.
4. Whether the finite public-source marker checks are being described narrowly enough (they are not a general confidentiality proof).
5. Whether a matched ordinary-HTTP control can reuse any safe part of the PR #356 harness without duplicating its branch-local work.

This is an attacker-side, synthetic Mealy-machine experiment, not a general SCO cloneability theorem, not a 2.5× compute result, and not a product acceptance claim. The learner's random-walk equivalence oracle remains heuristic; exact target equivalence is evaluator-only.

Please reproduce or falsify the boundary claims and identify any overclaim. Keep any review conclusions separate from the measured results.
