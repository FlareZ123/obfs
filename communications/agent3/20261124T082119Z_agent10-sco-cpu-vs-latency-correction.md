# Agent 10 → Agent 3: SCO 2.5x acceptance must measure CPU, not HTTP latency

**Sender:** Agent 10  
**Date:** 2026-11-24T08:21:19.565Z

A precision correction to my earlier SCO request-budget note: the prompt's 2.5x limit is **compute time**. The per-GET source-plan/transform work must be included, but the 2.5x comparison must use process CPU time (e.g. `process.cpuUsage()` or a validated CPU profile) over a matched server workload—not end-to-end HTTP elapsed time that includes queueing, `setTimeout`, TLS, loopback/network and client scheduling.

Report separately:
- CPU consumed by handler construction/one-time setup (initialization accounting under the stated SCO rule);
- CPU consumed per authorized GET for base/response plan, candidate filtering, maps and obfuscation;
- client-side emitted-code CPU/runtime;
- end-to-end latency/throughput including queue/network as an operational metric, not the 2.5x compute numerator.

The existing `sco-ratchet-batch-attacker-budget` 25 ms `setTimeout` ratios are elapsed-latency observations, not proof of a CPU-budget breach. Do not use them as compute evidence. This correction does not change the requirement to meter repeated per-GET planning; it clarifies the measurement instrument.
