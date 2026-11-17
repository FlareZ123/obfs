# SCO capability dispatch granularity: predeclared CPU comparison (17 November 2026)

**Status:** executable experimental benchmark; do not promote to a general 2.5× performance result without a pinned run. It supplements the independent public-interface behavioral recovery in sco-capability-public-oracle-2026-11-17.md.

## Question and decision criterion

The handle API can be used once per elementary private operation, or one time around an entire server-resident session. For the same seeded four-state Mealy machine, does moving the handle lookup and callback outside the arithmetic loop eliminate enough overhead to satisfy the project's strict 2.5× CPU comparison on the selected server-resident workload?

A **candidate granularity** is rejected for this isolated workload if any of the recorded paired protected/native CPU ratios strictly exceeds 2.5. Passing all finite samples cannot prove a universal budget. The experiment does not include browser RPC traffic, network overhead, authorization lookups, handle creation, revocation, server cold startup or end-to-end sessions; these remain separate release requirements.

## Reproduction

Run on Node 22 or later:

~~~powershell
node sims/sco-capability-granularity.js
npx tsc -p jsconfig.sco-oracles.json
~~~

The source uses the same fixed four-state hidden machine and a fixed pseudorandom input tape (seed 0x637aa125) for all variants. It warms each variant, then profiles 200,000 and 1,000,000 private transitions with six sequential trials each. Three execution orders rotate, so each position is visited twice by each mode.

- **native:** Direct step function using a mutable state record.
- **per-step:** For every symbol, call the scoped handle lookup/use callback and then run the identical step function.
- **per-session:** Call the same scoped handle lookup/use callback once and run the complete input tape inside that callback.

All operations are executed inside the real isolated per-principal request scope. The stopwatch and process CPU counter start inside the settled scope; handle minting and revocation are excluded from the measured hot region in both handle cases. The direct baseline is measured in the same context. Data preparation, module loading, authentication, queuing and allocation of one new handle happen before the timed region. Both wall elapsed time (hrtime.bigint) and process CPU time (cpuUsage) are recorded independently, with ratio decisions based on measured process CPU milliseconds.

Every trial asserts **exact output checksum parity** among all three modes. The raw JSONL output includes exact trial order, CPU milliseconds, wall milliseconds, both ratios, observed 2.5x exceedance counts and maximum ratios. This is one host-process descriptive sample rather than randomized independent samples; no statistical tail or median guarantee is made.

## Interpretation constraints

The per-step and per-session modes have different RPC semantics if surfaced directly to a client. Per-session dispatch is an architecture option only when the protected application can move a whole operation across the trusted-server boundary while preserving its public contract. This experiment isolates the cost of repeated server-local handle validation; a fully protected client/server comparison must measure each allowed operation, network marshalling and complete workflow.

The attacker's fixed online source-learning and authorization results are separate from this CPU question. Improving server CPU by batching does not itself increase the difficulty of reconstructing a finite state machine through authorized resettable public observations. 
