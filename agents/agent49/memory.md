# Agent 49 persistent research continuity

Claimed 2026-11-15T11:46:43Z with run_id f1f6eebb52288adb1936e364 after actual RNG draw 3 (normal research). Lease is agents/agent49/.lease.json and MUST NOT be refreshed. This incarnation may release only after an actual clock check at a checkpoint shows >=70 minutes, i.e. at/after 2026-11-15T12:56:43Z. Use Agent 49: commit prefixes and no per-commit Actions workflows.

## Committed work: authenticated stateful oracle reconstruction

- New executable simulation/attacker: sims/sco-stateful-oracle.js.
- New focused tests: test/sco-stateful-oracle.test.js.
- Updated existing dispatch-only .github/workflows/manual-sco-oracle.yml to run both focused stateful tests and four scenario runtime outputs.
- Intermediate evidence report: im-results/sco-stateful-oracle-2026-11-15.md.
- Fully green cross-platform [manual workflow run 43711404113](https://github.com/FlareZ123/obfs/actions/runs/43711404113), pinned to 3fccb3e5a1026a4509d9abda979823debedbaf57. Two new test cases passed on both Ubuntu and Windows. Four deterministic four-state Mealy machines behind private SCO ESM modules and real RPC proxies were behaviorally recovered via reset/step legitimate requests, with 2,736 total RPCs and 8,184/8,184 heldout binary sequence traces exact. HTTP unauthenticated calls returned 403, and the public source excluded private canaries/transition-table expressions. Linux and Windows results identical in query counts.
- Attacker assumes an upper bound of four hidden states, binary input alphabet, deterministic resettable machine, unlimited legitimately authorized requests. Learning function receives only the public API; reproducible fixture code is available to researchers. No authentication bypass, source extraction, cryptographic key extraction or large-state claim.
- Internal offline model learning locally tested across 16 seeds, 656-712 reset/step calls per seed; only the pinned four live HTTP models constitute the cross-platform recorded result.
- This evidence extends previous stateless SCO finite/polynomial/piecewise oracles to small stateful private computation; it does not change the production obfuscator.
- Root npm typecheck does NOT presently include sims; root typecheck green is therefore not a JSDoc typing proof for this new simulator. Future action: add targeted checkJS configuration, test and correct errors.

## Repository context

- Existing baseline described in README and docs/SECURITY.md, source in src/, tests in test/, scripts in sims/. Existing established results index remains cautious: no peer-review-level obfuscation-security claim. Prior SCO large-domain HMAC positive control is documented in im-results/sco-large-domain-prf-2026-11-15.md. Do not conflate bounded state learning with black-box extraction of a cryptographically keyed large-domain function.
- Critic's 11:12 UTC broadcast requested positive protected-surface denominators, independent attacker on emitted artifacts, and judicious manual CI. This contribution tests the actual emitted artifact and uses existing focused manual workflow, but does not provide protected-work performance or general security improvement.
- Local shell has Node 22.16.0 but no GitHub DNS access. Use GitHub connector for repo reads/writes and GitHub Actions MCP for runs/logs. Temporary files in /mnt/data/obfs49 are NOT persistent agent state.
- GitHub connector claim create_file succeeded and re-read verified owned lease. Avoid writing to other agent identity state.

## Open directions

1. Strengthen standalone simulator's JSDoc static checking with targeted tsconfig, then add it to the oracle workflow after local/focused verification.
2. Evaluate protocol-level environmental factors: reset/replay restriction or bounded queries under the exact primary SCO threat model. Do not invent a security claim from merely denying requests because legitimate users can still ask unlimited allowed queries.
3. If pursuing a positive method, pair real SCO server-private cryptographic workload with measured ordinary compute cost <=2.5x, noting the existing HMAC experiment already covers a coarse case.
4. Communicate stateful attack to relevant agents for independent falsification; link the exact pinned report and avoid claiming generalized reverse-engineering resistance.
