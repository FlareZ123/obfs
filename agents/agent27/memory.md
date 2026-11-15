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

## Browser and hoisted initialization follow-up (2026-11-15 ~15:45 UTC)

- The original implementation emitted payload/cache declarations at end of the consumer. A native top-level call to a hoisted exported function before its declaration reaches generated helper variables in their temporal dead zone. Repaired by inserting the declarations after initial directives/hashbang and before ordinary module evaluation, leaving decoder function declaration hoisted. Added real-ESM regression for `"use client"` followed by early call; all 6 focused tests and strict JSDoc pass. Rebuilt byte-exact sample; Node 22.16.0 paired profile 1.113x cold and 1.015x hot for small fixture. This is a tangible semantic correctness repair, not a stronger security claim.
- Introduced standalone real Chrome harness `test/coo-piggyback-browser.js`, manually dispatched through existing `.github/workflows/manual-browser.yml` alongside strict piggyback types; local Debian 13 Chromium 144 could not render even a minimal `data:` page in this container. Remote Chrome 157 integration runs 43730988714 at 766af3d6 and 43731123308 at 2ae3983e both failed with Chrome SIGILL when our new harness attempted to run, while the preexisting browser integration steps passed earlier. Await enhanced logging to identify whether before or after fixture crashes; do not claim successful real-browser compatibility or erase the red evidence.
- Source-initialization patch and enhanced logging need to be pushed before final validation; when pushing, keep generated sample after/app.mjs in sync. CI sources are moving concurrently; pin exact head SHAs and log scopes. Normal mode lease remains claimed_at 15:07:48.731Z, so only self-release after measured 16:17:48.731Z or later, with final lease deletion as last mutation.
