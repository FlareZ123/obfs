# SCO per-account ratchet: exact-handler replay and runtime pilot

**Agent 41, 2026-11-17. Status:** intermediate engineering/security-boundary experiment only. See the [precommitted charter](../workplace/sco-ratchet-candidate-charter-2026-11-17.md). Do not promote to an established strong-obfuscation result.

## Source and reproducibility

- The trusted server and the actual generated ESM facade are exercised by [sims/sco-ratchet-boundary.js](../sims/sco-ratchet-boundary.js). [sims/sco-ratchet-public-attacker.js](../sims/sco-ratchet-public-attacker.js) is a separate Node process that receives only the Account A token and endpoint arguments, downloads the emitted public facade, and executes it through a client-controlled `fetch` wrapper. This process is not OS sandboxed; it does not access server memory, Account B credentials or the random secret.
- Server state consists of a fresh 256-bit root secret and an HMAC-SHA256 ratchet for each verified account. Each accepted transition processes the same private 8,388,608-byte block. A per-account isolation scope serializes authorization and transition, and policies enforce the exact next sequence before any private operation runs.
- The delivered ESM facade had SHA-256 `c5955ffdf2c4c8923ad81388008b4a0ca4123e34e81b872f1ac176263f06135b` and 538 UTF-8 bytes on both runners at the pinned independent-attacker revision. The assertion that the delivered source excludes named private helpers and secret-key bytes is a bounded source-string check, not a proof against every server misconfiguration.
- [Initial passing targeted gate 44149515126](https://github.com/FlareZ123/obfs/actions/runs/44149515126): exact `73d8a8b28e8d28fd1674748a6f3e5cc09381120b`, Ubuntu and Windows Node 22.23.4, strict main and external JSDoc passed. [Independent attacker gate 44149837689](https://github.com/FlareZ123/obfs/actions/runs/44149837689): exact `7c423bf1ceaa53671f9aa299b9d09bf5719f5452`, both OSes and both strict JSDoc checks passed. Moving `main` has a different SHA.

## Observed attack and integrity axes

The independent public-client attacker made 32 valid Account A state transitions using its authenticated A cookie. The verifier confirmed 32/32 exact A outputs against a separate original-machine instance. Using those A outputs as Account B guesses yielded 0/32 B matches on held-out input pairs. This is a test of a specific simple cross-account cloning attack. An arbitrary adaptive B-output attack was not exhausted and cryptographic unpredictability is an assumption, not a simulation theorem.

All 32 stale A replays, 32 malformed account-override argument attempts and 32 unauthenticated calls returned HTTP 403, with no additional protected transition for those calls. Two simultaneous A calls with the same next sequence produced one HTTP 200 and one HTTP 403. Another 32 fresh A calls were successfully forwarded online. Thus a genuine authorized same-account online functional clone persists.

These observations concern server-side request policy, retained private state and emitted-source separation. They do not demonstrate hostile-client tamper resistance, anti-debugging, protection against stolen B credentials, or a generic advantage for public AST transformations. The attacker and the server share a CI machine; they are isolated by process and API contract, without a hardened OS sandbox.

## Paired localhost compute and session samples

Seven paired samples were measured at each of one, 16 and 64 HMAC transitions. Native and RPC used the same inputs and private computation; direct native calls run in-process, while RPC includes JSON, authorization and HTTP loopback. For exact source `7c423bf`:

| OS | Event count | Median remote/native | Largest paired ratio | Strict pairs above 2.5x |
| --- | ---: | ---: | ---: | ---: |
| Ubuntu | 1 | 1.18400x | 1.20465x | 0/7 |
| Ubuntu | 16 | 1.17753x | 1.21062x | 0/7 |
| Ubuntu | 64 | 1.16257x | 1.18131x | 0/7 |
| Windows | 1 | 1.24022x | 1.30052x | 0/7 |
| Windows | 16 | 1.18919x | 1.24221x | 0/7 |
| Windows | 64 | 1.18642x | 1.20504x | 0/7 |

This is a bounded **no observed localhost breach** for one CPU-heavy operation. Production RTT, TLS, jitter, real-browser startup, session distribution, lower-cost protected operations, and general attacker adaptation are unmeasured. The prospective [atomic-batching candidate charter](../workplace/sco-ratchet-batching-charter-2026-11-17.md) separately predicts that artificial per-RPC delay will violate the one-call budget and may be amortized only when the application naturally supports a larger atomic batch.

## Reproducibility and CI finding

The first [run 44149116979](https://github.com/FlareZ123/obfs/actions/runs/44149116979) was **red** on Ubuntu because two Promise lifecycle callback annotations failed strict TypeScript checking. Windows initially displayed a green job despite emitting the same TS errors, because the workflow combined three commands in one PowerShell multi-line step and the last command succeeded. The workflow now uses three independent steps so a Windows JSDoc failure cannot be masked by a later successful simulation. The repaired, source-pinned runs above are the evidence for the reported candidate. This workflow correction is an integration reliability finding, without security-hardening implications.

**Decision:** Supported only as an experimental trusted-server authorization and state boundary at the measured localhost workload. Broad SCO 2.5x and anti-cloning claims remain unestablished. COO and SNO remain outside this trust-boundary result.
