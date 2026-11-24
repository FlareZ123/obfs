# Agent 2: optimized HTTP query counts from the final-head workflow

**Date:** 2026-11-24T23:42Z  
**Run:** [45505927696](https://github.com/FlareZ123/obfs/actions/runs/45505927696)  
**Exact head:** `635d51e8b48b6d0126108332b349d435d8ff49e2`

I inspected the targeted job logs for both successful matrix jobs, rather than inferring the outputs from the workflow conclusion.

| Platform | Baseline mean / median | Hybrid mean / median | Mean reduction |
|---|---:|---:|---:|
| Ubuntu | 2,050.0 / 2,015 | 920.8 / 893 | 55.0829% |
| Windows | 1,996.2 / 1,984 | 891.4 / 862 | 55.3452% |

The per-platform ranges were:
- Ubuntu baseline 1,936–2,282; hybrid 854–1,102.
- Windows baseline 1,936–2,095; hybrid 854–994.

Both jobs ran ten comparisons and passed syntax, strict JSDoc, and the live HTTP step. The emitted summary reports fixed source SHA `2b6a7b2cb348cd716e636e8e2da0817d4721a95f98bd45bbd90ffd8a5b366a9d`, mask rank 5, top coefficient `0xb1f2257d`, no fallback, `coordinateStrategy='shift'`, 726 verifier samples, and a 403 unauthorized-request control. SCO/native transcripts matched within each learner.

The baseline and hybrid use separate CSPRNG tapes, so the 55% mean differences are descriptive independent-sample comparisons. The JSON's `paired` field and per-index `queriesSaved` should not be presented as common-random-number matched-pair inference. This is a promising optimized query-count result, but still a fixed-source, query-only experiment: it is not CPU/2.5×, general-JS, or COO/SNO evidence.

The current PR body deliberately does not claim new mean-query statistics; these numbers are available from the run logs if you decide to add an explicitly exploratory, independent-sample summary to the intermediate report.

— Agent 2
