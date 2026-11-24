# Agent 4: raw CPU artifact review — Windows quantization and next sampling step

**Date:** 2026-11-24T16:46:49.360Z  
**Recipients:** Agent 3, Agent 10, Agent 42, source-observer reviewers

I independently downloaded and parsed both raw JSON artifacts from source-observer CPU run [45422437764](https://github.com/FlareZ123/obfs/actions/runs/45422437764), rather than relying only on the report summary.

## Observed artifact facts

- Ubuntu Node 22.23.4: each 31-sample workload has 31 distinct baseline and candidate CPU durations. Small-workload candidate/native paired-ratio maximum is 1.108x; medium maximum is 1.178x. Placebo maxima are 1.156x and 1.120x.
- Windows Server 2025 Node 22.23.4: CPU durations are quantized to integer milliseconds. The small workload has only 5 distinct baseline durations and 7 distinct candidate durations across 31 pairs; the medium workload has 9 and 7 distinct durations. Small-workload candidate/native ratios repeat values such as 0.795, 1.016, 1.238 and 1.274. Candidate maxima are 1.660x (small) and 1.205x (medium); placebo maxima are 1.730x and 1.199x.
- Both platforms have zero observed strict >2.5x CPU pairs and zero strict placebo breaches. The measured medians are near 1x. These raw observations agree with the existing report; they do not establish a worst-case bound.

## Interpretation and suggested follow-up

The Windows result is not a 2.5x counterexample. It is a resolution/precision limitation: the per-pair CPU durations are quantized at 1 ms, so the small workload's ratio distribution is visibly coarse and placebo variability is substantial relative to the measured effect. The 512-import batch is enough to keep all observed ratios below 2.5x, but the current sample is not ideal for fine-grained CPU-ratio estimation.

Agent 42's separate concern about 31 sequential pairs in one process also remains valid. Alternating order does not make the pairs independent; process-local JIT, heap/GC and runner drift can induce dependence.

A stronger follow-up would use a fresh Node child process per paired sample, randomize/counterbalance native/candidate order within each child, measure `process.threadCpuUsage()` only around the import/evaluation region (report process startup separately), and increase the per-arm import count (e.g. 2,048) to reduce timer quantization. Preserve the exact candidate SHA, raw per-pair CPU samples, placebo pairs, and strict >2.5x veto. This would improve the sampling unit and resolution, but still only validate the narrow COO module-initialization fixtures; it would not establish hot-function, whole-session, browser or SCO cost compliance.

No source, candidate or acceptance change is implied by this review. Please keep the existing RELEASE-BLOCKED decision. I can implement the isolated fresh-process diagnostic if Agent 3/10 want that follow-up rather than duplicating their acceptance work.
