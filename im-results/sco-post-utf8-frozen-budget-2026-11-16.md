# SCO frozen application after trusted-server policy and UTF-8 hardening: fresh-process budget check

**Status:** source-pinned intermediate behavioral and performance observation, not a full deployment guarantee or an obfuscation-security result.

## Purpose and controls

The previously published [six-module application and explicit asynchronous SCO facade](../examples/application-challenge/README.md) is a frozen workload with a trusted server holding five private ESM modules and a 515-byte public client. Its [earlier budget and attacker study](application-challenge-sco-source-relay-2026-11-16.md) measured three large calls per fresh process close to the 2.5× allowance on Ubuntu and three tiny calls above the limit. We reran the *same* manual frozen-application workflow after adding SCO exact-boolean authorization, guarded state models, stricter batch preflight, and raw-body `buffer.isUtf8` validation.

Pinned run: [43962835725](https://github.com/FlareZ123/obfs/actions/runs/43962835725), SHA `5899d3a2ffbfab7d75613d5b028949e0133c9b39`. Ubuntu and Windows Node v22.23.4 jobs **both passed**, including exact public facade source reproduction, native/RPC functional comparisons, authorized online relay, nine-pair fresh-process cost fixture, historical bootstrap reproduction and the Ubuntu real Chromium client.

The cold comparison launches independent new Node client processes with **three calls per process**, alternates nine paired native and SCO trials per workload, and includes client startup, module load, JSON and RPC HTTP/1.1 loopback. The original trusted server is already initialized, matching the prompt's permitted SCO server-only setup deduction. It does **not** include real WAN, TLS or production authorization storage.

## Fresh process performance (new pinned runners)

| Platform | Event workload per call | Native median ms | SCO median ms | SCO/native ratio | Sampled 2.5× condition |
|---|---:|---:|---:|---:|---|
| Ubuntu | 120,000 | 47.564129 | 115.305172 | **2.424204×** | Pass, narrow |
| Windows | 120,000 | 99.147500 | 209.178100 | **2.109767×** | Pass |
| Ubuntu | 1 | 26.056125 | 108.467220 | **4.162830×** | Fail |
| Windows | 1 | 64.390100 | 205.663600 | **3.194025×** | Fail |

The tests compared complete output JSON for all trial cases, not merely timing, and the CI jobs' source-private and Chromium checks also completed successfully.

## Interpretation and limits

The selected **heavy** fresh-client session has a median below 2.5× on both runners, while the **thin-call** session violates the budget substantially on both. This replicates the earlier qualitative threshold distinction with the newer protected SCO implementation, without proving any universal performance cap. In particular, the Ubuntu heavy margin is small and timing samples on shared CI hosts fluctuate; the earlier conditional bootstrap upper endpoint of 2.5081× belongs to the *older* nine-pair sample, not a confidence interval for this run.

These are **not paired baseline-before-change vs after-change server versions on one runner**. The old and new source snapshots were run many hours apart, and the Windows absolute times shifted materially. We cannot causally attribute timing differences to the `isUtf8` validity scan, authorization guards, underlying CI machines, or runtime scheduling from these measurements. A separate [parser-only A/B profile](sco-rpc-invalid-utf8-2026-11-16.md) measured 1.04–1.10× for valid 96–65,568-byte JSON CPU parsing in current Linux/Windows runners; this cannot be multiplied into a session ratio without accounting for its actual work fraction.

The trusted-server source remains withheld, but an independent authorized client in this same fixture successfully relays allowed operations to the original server. None of these cost results establishes source reconstruction resistance, standalone offline functional cloning difficulty, protection against a compromised server or safe domain locking in COO/SNO. Stronger claims require attacker-cost evidence, real deployment network/authentication assumptions and held-out application workloads.
