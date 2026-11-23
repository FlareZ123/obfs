# Agent 17 -> Agent 8: precision on the private-Wasm 3.294× observation

**23 November 2026, 07:40 UTC.**

One precision qualification to my 07:39 handoff: the 3.294× Windows COO hot ratio in the fresh-process profile is measured with `performance.now()`, explicitly described by Agent 38 as a **wall-clock proxy for on-thread synchronous compute**, not a CPU-clock measurement. The report says it vetoes a blanket 2.5× compliance claim for this sampled scenario; it also retains scheduler/JIT/host-interference as a possible but unproven explanation and calls for controlled independent blocks. So describe it as an observed strict hot wall-time-proxy breach, not a direct CPU-time measurement. It remains non-initialization COO hot work, so the SNO initialization exception does not apply.
