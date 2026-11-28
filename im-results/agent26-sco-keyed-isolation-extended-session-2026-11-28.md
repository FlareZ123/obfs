# Extended SCO keyed isolation: 65,536-call CPU and wall profile (28 November 2026)

**Evidence classification:** Intermediate, finite empirical measurement; not a new obfuscation algorithm, security certification, or universal performance guarantee.

## Source and reproduction

- Exact compiler and test source: [\`06eb55e9f864d72f5db9f44762e15ceae908918e\`](https://github.com/FlareZ123/obfs/tree/06eb55e9f864d72f5db9f44762e15ceae908918e), branch \`agent26/keyed-isolation-session-profile-20261123\`.
- Manual focused run [45148181377](https://github.com/FlareZ123/obfs/actions/runs/45148181377), attempt 1, completed **success**: Ubuntu job \`137602581768\` and Windows job \`137602581956\`, Node \`v22.23.4\`. The run executes one profile test, both project/external JSDoc checks, and the paired-budget config check; the full Node test job was skipped. This is a focused CI receipt, **not** full-suite acceptance.
- Full emitted observation arrays, per-trial ratios, profile summaries, checksums and job IDs: [machine-readable evidence](agent26-sco-keyed-isolation-extended-session-2026-11-28.json). Values are extracted from both original job logs; the independent publication check recomputed four median ratios and both strict breach counts from the raw observations before writing the artifact.
- To reproduce on a Node 22 checkout of that SHA with dependencies installed: \`OBFS_FOCUSED_TEST=test/sco-keyed-isolation-session-profile.test.js node sims/focused-test-dispatch.js\`. On Windows PowerShell, assign \`$env:OBFS_FOCUSED_TEST\` before running the Node command. The test logs a \`SCO_KEYED_ISOLATION_SESSION_PROFILE=...\` JSON record.

## Measurement

A preconstructed \`createScoKeyedIsolation\` wrapper serially executes authenticated-looking callbacks for one fixed principal. Each sample tests four arms: plain direct async HMAC, an identical direct placebo, default uncapped isolation, and opt-in capped isolation (\`maxPendingPerPrincipal:8\`, \`maxPendingTotal:32\`). Twelve balanced-order trials on each OS, with warmups preceding the measured sessions, perform either 65,536 calls × one SHA-256 HMAC round × 64-byte payload or 128 calls × 128 rounds × 16,384-byte payload. The input bytes change per call and all arm checksums match exactly (\`933162009\` tiny, \`3255572992\` substantial). The cap is **never exercised** because calls are awaited sequentially; this is only a wrapper-cost profile.

| Runner | Workload | Median capped/direct CPU | Median capped/direct wall | Median uncapped/direct CPU | Direct placebo CPU | Strict capped CPU >2.5× | Strict capped wall >2.5× |
|---|---|---:|---:|---:|---:|---:|---:|
| Ubuntu | 65,536 × 1 | 1.747× | 1.791× | 1.832× | 0.979× | 0/12 | 0/12 |
| Ubuntu | 128 × 128 | 1.003× | 1.007× | 1.002× | 1.010× | 0/12 | 0/12 |
| Windows | 65,536 × 1 | 1.997× | 1.921× | 1.898× | 0.997× | 1/12 | 1/12 |
| Windows | 128 × 128 | 0.905× | 0.995× | 1.000× | 1.000× | 0/12 | 0/12 |

The tiny Ubuntu bounded-wrapper CPU median was **1.747×**, the corresponding Windows median **1.997×**; capping contributed essentially no extra median CPU over uncapped isolation (capped/uncapped medians **0.958×** and **1.002×**, respectively). The substantial HMAC session was near parity. Windows had one strict tiny-workload CPU ratio **2.506410256×** (trial 11) and one strict wall ratio **2.582247074×** (trial 6); these are **different pairs**, not evidence of a systematic security or budget failure. Linux had zero >2.5× pairs in both workloads. Direct-placebo arms had zero strict CPU breaches on either OS.

## Interpretation and limits

The longer tiny-workload session increased baseline measured CPU from the previous 8,192-call pilot's ~15 ms on Windows to **140–219 ms** per direct arm. This reduces the proportional impact of a 15–16 ms Windows CPU tick but does not remove CPU granularity, OS scheduling, virtualization, JIT drift or paired-order confounders. The one Windows CPU threshold exceedance is only 0.0064× beyond the strict 2.5× line. Do **not** generalize any sample median into a universal budget guarantee.

These numbers include resolver/queue/promise overhead in every repeated call, while excluding one-time isolation creation. They exclude HTTP wire cost, TLS, browser execution, host-clock effects, private-method authorization policy, concurrency and attacker behavior. The example does not run obfuscated JavaScript; it measures a trusted SCO server helper, not the complete SCO/COO/SNO compiler output. It therefore cannot certify the primary objective's whole-application 2.5× bound, source confidentiality, environment locking, or release readiness. The authoritative [decision index](../results/README.md) remains **RELEASE-BLOCKED**.

**Next discriminating test:** compare a real authenticated mixed-client/remote SCO session with equivalent native service under matched trust/transport and a predeclared compute boundary, rather than claiming a protected-script budget from only the helper's serial hot path.
