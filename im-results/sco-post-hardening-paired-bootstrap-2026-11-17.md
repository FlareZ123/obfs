# SCO post-hardening cold-session paired-sample uncertainty (2026-11-17)

**Status:** independent, source-pinned reanalysis of a previously completed finite sample. This is intermediate performance evidence, with no universal bound or new obfuscation-resistance claim.

## Origin and exact reproduction

Agent 9 requested independent scrutiny of the frozen, three-call SCO performance measurement after strict UTF-8 and authorization hardening. I inspected the source code of the measuring harness, the existing conditional bootstrap, both original job logs, and the frozen-application report.

- [Manual run 43962835725](https://github.com/FlareZ123/obfs/actions/runs/43962835725), code SHA **5899d3a2ffbfab7d75613d5b028949e0133c9b39**, Node **v22.23.4** on Ubuntu and Windows.
- Job IDs: Ubuntu **133640880364**, Windows **133640880002**. Each printed all 9 native and 9 SCO cold-client times for two workloads under the marker \`APPLICATION_SCO_COLD_SESSION\`.
- Reproducer: \`node sims/application-challenge-sco-post-hardening-bootstrap.js\`. The script commits the source-pinned raw arrays and imports the existing seeded \`bootstrap\` implementation from \`sims/application-challenge-sco-cold-bootstrap.js\`; no new statistical estimator was invented.
- Method: 25,000 paired chronological-index resamples with replacement, SHA-256 counter-stream seed per platform/workload, ratio of the two resampled **medians**, 2.5% and 97.5% interpolated percentiles. Rounded raw times preserve all previously published ratios to better than **0.00001×**.

## Results

| Platform / three-call workload | Native median ms | SCO median ms | Observed ratio | Conditional 95% resampling interval | Resamples above 2.5× |
|---|---:|---:|---:|---:|---:|
| Ubuntu / 120,000 events per call | 47.564129 | 115.305172 | **2.424204×** | **2.346584–2.497428×** | 1.74% |
| Windows / 120,000 events per call | 99.147500 | 209.178100 | **2.109767×** | 2.038267–2.220323× | 0.00% |
| Ubuntu / 1 event per call | 26.056125 | 108.467220 | **4.162830×** | 3.918521–4.614761× | 100.00% |
| Windows / 1 event per call | 64.390100 | 205.663600 | **3.194025×** | 3.012209–3.341606× | 100.00% |

The Windows/light interval is from this exact deterministic 25,000-resample sequence. A different random sequence can yield a slightly different empirical percentile, especially with only nine observed pairs.

## Independent interpretation

**The heavy Ubuntu result remains practically fragile.** Its observed median satisfies 2.5×, and this exact conditional resampling interval ends slightly *below* 2.5×. The endpoint is only approximately 0.002572× below the threshold. Neither the endpoint nor the 1.74% resample fraction is a confidence guarantee that future hardware, load, network, process-startup or application scenarios satisfy the budget. An earlier **different** Ubuntu run's conditional upper endpoint exceeded 2.5×. Treat these as distinct samples and avoid pooling them as a controlled before/after intervention.

**The light workload is a reproducible negative control.** Both newer light medians exceed 2.5×, with the complete sample-conditional intervals above 2.5×. This is a concrete refutation of a universal performance guarantee for the tested architecture and client boundary.

**The source-pinned design has important scope limits.** The native comparison launches the six-module ESM entry, while the protected client launches a CJS relay worker importing the emitted single-module ESM facade; this difference belongs to the measured application boundary, rather than a controlled equivalent-bootstrap CPU benchmark. The original trusted SCO server is already initialized and excluded under the prompt's SCO server-initialization allowance. Timings include child startup, module loading, three calls and JSON output, all through localhost HTTP/1.1. They omit realistic WAN delay, TLS and authorization-store costs. Nine sequential, alternately ordered pairs do not calibrate a population distribution or demonstrate independence under hosted-runner scheduling.

**No causal claim about strict UTF-8 checking is warranted.** The old and newer runs used different GitHub runner sessions and source snapshots. Their changes include other authorization and policy hardening. A new on-run paired baseline-versus-treatment experiment would be necessary to attribute any performance difference to a particular change.

**No attacker-security improvement follows.** The same application continues to admit authorized online function relaying. Client-code withholding is source confidentiality under a trusted-server boundary; online functional cloning, source reconstruction, tamper resistance and execution-control guarantees are separate threat dimensions.

The source-pinned run reports exact native/SCO JSON differential matches and a real Chromium client check. This reanalysis recalculates the timing uncertainty alone and does not rerun those behavior tests. It is reproducible offline from the committed raw logs.
