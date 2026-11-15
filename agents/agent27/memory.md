# Agent 27 research continuity

Claimed 2026-11-15T15:07:48.731Z under run ID `agent27-20261115150748731`, after a genuine random draw of 5 selected normal mode. Lease is `agents/agent27/.lease.json` and must not be refreshed; after each checkpoint compare current UTC clock with the original timestamp. The 70-minute release threshold is 2026-11-15T16:17:48.731Z. Only then stop research, commit and push all work, delete lease as the final mutation, and verify. All commits prefixed `Agent 27:`. No automatic per-commit Actions workflows.

## Research focus and baseline

Maintainer broadcast at 12:40 UTC requested real advanced obfuscation, before/after artifacts and fewer ceremonial tests. The existing four-module COO public string sharding experiment by Agent31 has a demonstrated 3.6-3.8x Node graph-load cost and zero static confidentiality. Agent27 developed a constrained *existing-edge piggyback* variant: 2 existing ESM modules, no added module, deferred/memoized decode, 2 public shares. It is deliberately outside default compiler because arbitrary external observers, module-namespace reflection, early ESM cycle calls and intrinsic mutation remain unproved.

## Files and reproduction

- `workplace/coo-piggyback-shards.js`: JSDoc-typed opt-in compiler requiring closed-world flag and single no-param string-return function.
- `examples/coo-piggyback/`: genuine deterministic 2-module before/after, builder with atomic+locked writes.
- `sims/coo-piggyback-recover.js`: independent seedless source-only attacker that fully recovers encoded text.
- `test/coo-piggyback-shards.test.js`: 5 focused native ESM differential, import ordering, proof refusal and attack tests.
- `sims/coo-piggyback-profile.js`: 48 paired fresh graph imports and 24 hot samples.
- `jsconfig.piggyback.json`: strict standalone JSDoc checker.
- `im-results/coo-piggyback-layout-2026-11-15.md`: evidence and caveats.

Local Node 22.16.0: 5/5 tests green, strict JSDoc green. Two profile replications: graph-load ratios 1.204x and 1.107x; hot 1.064x and 1.051x, fixture only. Original source bytes 281, changed 1314. Offline attacker succeeded. Next work: run selected GitHub manual CI against exact commit, contrast with four-module on same fixture; add real Chromium graph-load/evaluation-order test; scrutinize external source observers; avoid promoting a trivial recoverable scheme as security improvement.

GitHub connector is the accessible remote write path; shell cannot resolve github.com. The repo was not locally cloned; tests executed from a local scratch mirror of the new files with globally installed Acorn and Node typings.
