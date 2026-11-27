# No-reset hW live HTTP matched-control experiment (2026-11-25)

**Status:** historical intermediate measurements, **invalidated as black-box SCO security evidence**. This is not a production obfuscation transform, a general cloneability theorem, or a release candidate. It does not change the repository-wide **RELEASE-BLOCKED** decision.

## Critical validity correction (2026-11-26)

The original runs documented below did not enforce the stated SCO threat model:

1. The Node servers ran as `nobody`, but the Python learner ran as the GitHub runner account. That account has passwordless sudo on the hosted runner, so the learner was not an unprivileged client and could potentially inspect server memory, process state, and private temporary files.
2. The learner received `--oracle-seed`, computed as `(target_seed * 0x9E3779B1 + state_count * 0x85EBCA77) mod 2^32`. This value was derived from the hidden target identity. With the small seed/state-count ranges used here, the learner could enumerate candidate fixture identities and reconstruct the target offline. Thus the earlier statement that target seed/state count were not passed to the learner was materially misleading: they were encoded in its argv.
3. The learner inherited the runner environment rather than receiving an explicit allowlist.

Consequently, the old 40-pair and sensitivity measurements remain historical observations of application-level parity under a compromised harness, but they **must not** be used to claim oracle-only learnability, SCO source confidentiality, server isolation, or resistance under the stated threat model. Preserve the raw artifacts for reproducibility; do not silently reuse their security interpretation.

A corrected candidate was validated on branch `agent2/hw-live-isolated-20261126`:
- SCO and ordinary Node servers run as `www-data`; the learner runs as `nobody`; the trusted evaluator remains the runner account.
- Children use `setpriv --no-new-privs --bounding-set=-all --clear-groups` and an `env -i` allowlist.
- The SCO private root/file are explicitly mode 0700/0600.
- The learner receives only an independent `--learner-seed` (default 41342), shared between the paired arms and never derived from target seed/state count.
- The workflow runs the hosted cross-UID process-isolation probe and asserts the actual server/learner UIDs and environment keys.

One-pair hosted validation run 13 / 45768526573 passed. The 40-case hosted run 15 / 45769285479 completed successfully with zero workflow errors; all completed rows passed the paired-match and UID/environment/private-mode assertions. Its artifact is `agent2-live-hw-matched-control` (ID `15093427467`, 19,677 bytes). The workflow permits timeouts, so the completed-vs-timeout split is still pending artifact extraction; do not infer that all 40 completed. Run 16 / 45770272628 then passed a one-pair rerun with explicit NoNewPrivs, empty CapEff/CapBnd, and learner sudo-denial assertions. Run 17 / 45770519936 passed after extending the probe to verify denial of the trusted parent's `/proc/<pid>/mem` and `/proc/<pid>/fd/0` as well. See `im-results/agent2-hw-live-isolated-2026-11-26.md` for the corrected harness, validation, and residual limitations. The candidate is not yet the PR #378 branch and still requires independent review before promotion.


## Executive result

The same no-reset, unknown-state-count AALpy hW learner was run against two services exposing the same authenticated binary step API:

1. **SCO arm:** the actual generated server-controlled partition, served through partitionScoAsyncModule / createScoHandler.
2. **Ordinary control:** a conventional Node HTTP step handler with an esbuild-minified public client.

The arms used the same target machine, initial state, method identifier, session token, learner RNG seed, route, request body, and application-level response contract. Both server processes ran as uid nobody. The target table and exact product evaluator remained outside the learner process.

At the baseline oracle setting (RandomWphWOracle, random walk length 30, 20 origin states):

- **13/13 paired runs** completed without timeout or error.
- **13/13** SCO runs and **13/13** ordinary-control runs passed the exact initial-model check over trace-matching candidates in the returned conjecture.
- **13/13** SCO runs and **13/13** ordinary-control runs passed the offline post-trace future-equivalence check over every trace-matching candidate in the returned conjecture.
- Both arms used **441,661 SUL steps** and **441,726 HTTP requests** in aggregate.
- For every pair, learner traces, conjectures, selected RPC request/response records, server counters, and exact evaluator outputs were equal. Public client-module bodies differed, as intended.

The 13 baseline runs comprise eight random fixtures (2–5 states, two seeds per size), four unique 64-state delayed-pair seeds, and one independent repeat of the 64-state seed-zero case. The repeated seed-zero case is not a thirteenth unique fixture/seed combination.

A deliberately weak oracle configuration was also tested on an 8-state random fixture, seed zero, with random-walk length 30 and only one origin state. Both arms produced the same 300-step transcript and both failed the offline future-equivalence certification (0/1); each used 305 HTTP requests. The prior in-process sensitivity sweep identifies this same fixture/seed/oracle configuration as a false future convergence, with a post-trace counterexample 00. This demonstrates that the learner's oracle settings affect certification quality; it is not an SCO-specific failure.

## Paired experiment details

### Baseline oracle configuration

| Batch | Fixture family | Cases | Completed | Exact initial clone (SCO / ordinary) | Future certification (SCO / ordinary) | SUL steps per arm | HTTP requests per arm |
|---|---|---:|---:|---:|---:|---:|---:|
| Random fixtures | Minimal strongly connected binary Mealy, 2–5 states, 2 seeds per size | 8 | 8 | 8/8 / 8/8 | 8/8 / 8/8 | 7,091 | 7,131 |
| Delayed-pair seed-zero repeat | 64-state delayed-pair | 1 | 1 | 1/1 / 1/1 | 1/1 / 1/1 | 62,274 | 62,279 |
| Delayed-pair seed sweep | 64-state delayed-pair, seeds 0–3 | 4 | 4 | 4/4 / 4/4 | 4/4 / 4/4 | 372,296 | 372,316 |
| **Total** |  | **13** | **13** | **13/13 / 13/13** | **13/13 / 13/13** | **441,661** | **441,726** |

The 64-state delayed-pair family is the same family used in the earlier in-process hW benchmark. Its 64-state construction has 2,016 distinguishable state pairs and a maximum shortest pair-distinguishing word of 63 symbols. The earlier in-process run learned the seed-zero fixture in 62,274 SUL steps with a 72-symbol homing sequence. The live HTTP seed-zero run used the same 62,274 SUL steps.

### Weak-oracle sensitivity case

| Fixture | Random walk length | Origin states | Cases | Exact initial clone (SCO / ordinary) | Future certification (SCO / ordinary) | SUL steps per arm | HTTP requests per arm |
|---|---:|---:|---:|---:|---:|---:|---:|
| Random, 8 states, seed 0 | 30 | 1 | 1 | 0/1 / 0/1 | 0/1 / 0/1 | 300 | 305 |

The earlier 22-case in-process oracle sensitivity sweep reports this exact 8-state/seed-zero/30-walk/one-origin setting as a false future convergence, with shortest post-trace future counterexample 00. The live matched run independently reproduces failure of the future certification in both server arms. The matched harness's full per-case candidate results are preserved in its workflow artifact.

## Additional live oracle-parameter sensitivity

The same three random fixtures (state counts 6, 7, and 8; seed 0) were paired under two additional oracle settings. These runs demonstrate why the evaluator must distinguish initial-model equivalence from post-trace future equivalence.

| Fixture batch | Random walk | Origin states | Cases | Exact initial clone (SCO / ordinary) | Future certification (SCO / ordinary) | False future convergence | SUL steps per arm | HTTP requests per arm |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Random, 6–8 states, seed 0 | 30 | 5 | 3 | 2/3 / 2/3 | 3/3 / 3/3 | 0/3 / 0/3 | 2,715 | 2,730 |
| Random, 6–8 states, seed 0 | 5 | 1 | 3 | 0/3 / 0/3 | 0/3 / 0/3 | 3/3 / 3/3 | 630 | 645 |
| Random, 8 states, seed 0 | 30 | 1 | 1 | 0/1 / 0/1 | 0/1 / 0/1 | 1/1 / 1/1 | 300 | 305 |

For the 30-walk / 5-origin batch, the 8-state fixture had two trace-matching initial candidates, so exact initial-model cloning was not certified. Both candidates reached one post-trace future-equivalence class, however, so future behavior was certified. This is a concrete case where initial ambiguity does not imply future ambiguity.

For the 5-walk / 1-origin batch, all three fixtures produced false future convergence in both arms. The exact evaluator found these post-trace future counterexamples:

- 6 states: 000
- 7 states: 0
- 8 states: 00

The 30-walk / 1-origin 8-state case also produced false future convergence in both arms, with post-trace counterexample 00. The candidate count was one in each false-convergence case; these were wrong single-candidate conjectures, not ambiguous future candidate sets.

Across the baseline and sensitivity batches documented so far there were **40 completed paired runs**, zero timeouts/errors, **465,127 SUL steps per arm**, and **465,327 HTTP requests per arm**. Exact initial-model certification succeeded in 33/40 runs per arm; post-trace future certification succeeded in 35/40 per arm. All 40 pairs retained identical learner traces, conjectures, selected RPC records, server counters, and evaluator outcomes between SCO and ordinary HTTP. Some target/seed combinations were deliberately repeated under different oracle settings.

### Broader random-fixture sweep at two oracle origins

A further 20 paired cases covered random minimal strongly connected machines with 8–12 states, four seeds per state count, random-walk length 30, and two test-origin states.

| Fixture batch | Cases | Exact initial clone (SCO / ordinary) | Future certification (SCO / ordinary) | False future convergence | SUL steps per arm | HTTP requests per arm |
|---|---:|---:|---:|---:|---:|---:|
| Random, 8–12 states, seeds 0–3, walk 30 / origins 2 | 20 | 18/20 / 18/20 | 19/20 / 19/20 | 1/20 / 1/20 | 19,821 | 19,921 |

The 8-state seed-zero case was a false single-candidate future convergence, with post-trace counterexample 1000. The 9-state seed-one case had two trace-matching initial candidates but one post-trace future-equivalence class; initial-model certification failed while future certification succeeded. No case exhibited multiple future-equivalence classes among its trace-matching candidates. The ordinary and SCO arms agreed on every case and every evaluator classification.

## What was actually matched

For each pair, the harness checked:

- Same target transition/output table and initial state.
- Same public method identifier and session token, discovered by the learner through the public module response headers rather than passed directly to the learner.
- Same hW implementation, deterministic learner seed, random-walk length, and origin-state count.
- Same GET /obfs/client.mjs request shape and selected public response metadata: status, content type, cache policy, nosniff, cookie presence/hash/attributes, and public method identifier.
- Different public module source bodies (generated SCO facade versus ordinary esbuild-minified client).
- Same RPC request/response application trace digest, covering method/path, content type, cookie hash, cache policy, request body, response status, selected response headers, response byte count, and response-body SHA-256.
- Same authenticated invalid-argument denial (valid session cookie, argument [2] → HTTP 403).
- Same unauthenticated RPC denial (HTTP 403), absent reset route (HTTP 404), and server request counters.
- Same hW conjecture and same exact evaluator output.

The experiment therefore establishes parity for the selected application-level HTTP fields and the observed RPC transcript. It does **not** compare every raw wire header, TLS handshake, browser networking behavior, timing distributions, or WAN behavior.

## Threat model and evaluator boundaries

The learner gets one continuous interaction with a stateful step(bit) → bit API. It has no reset endpoint, no membership-query API, and no supplied state-count bound. The client performs one pre(), a no-op post(), and zero query() calls. It fetches the public client module to discover the public method identifier and session cookie, then sends raw RPC requests; it does not execute the generated JavaScript module in a browser.

The learner does not receive the target transition table, target initial state, canary, evaluator, or state count. Both services keep the machine in their server process. The public client bodies differ and neither contained the tested canary or source markers (privateTable, serverCanary, session token) in the finite marker checks.

The exact evaluator is outside the learner. It replays the observed trace in the held-out target and checks both (a) full initial-model equivalence and (b) post-trace future equivalence. Candidate starts and ends are enumerated only within the returned hW conjecture. This is **not** an enumeration of every possible machine consistent with the observed trace and does not establish global version-space identifiability. The hW equivalence oracle itself uses bounded randomized random walks; its pass is heuristic, not an exact equivalence proof.

## Interpretation

For the tested deterministic finite-state API family, generated SCO did not increase the measured query cost or reduce the hW learner's ability to infer future behavior relative to the matched ordinary HTTP service. The weak-oracle failure also occurred identically in both arms. This is evidence about **online functional-oracle resistance** for this API class, not a general result about static deobfuscation, dynamic extraction of client source, arbitrary JavaScript/EFSMs, browser instrumentation, or SCO integrity mechanisms.

The result does not imply that SCO has no value. Source confidentiality, code partitioning, integrity enforcement, environment binding, and protection of server-only secrets are separate dimensions and were not measured here. The test also makes no claim about the 2.5× runtime budget: the learner's HTTP query cost is attacker-side work, not the obfuscated program's execution overhead.

A design implication is that deterministic low-state server APIs should not be treated as functionally secret merely because their implementation is partitioned or obfuscated. If the externally observable behavior is a finite deterministic machine and legitimate queries are unlimited, the server-side implementation choice does not change the information available from that oracle. Any SCO claim should separate source protection from protection of the function's observable semantics.

## Reproduction and artifacts

Code branch: agent2/hw-live-matched-control-20261125  
Branch head after per-case log enhancement: 8fb4bb79889192955dfd9929132807135921d18c

Files:

- sims/agent2-hw-live-ordinary-server.js — ordinary Node HTTP control with an esbuild-minified public client.
- sims/agent2-hw-live-matched-control.py — paired server launcher, hW runner, HTTP parity checks, and offline evaluation.
- sims/agent2-hw-live-sco-client.py — same hW client with selected request/response telemetry; cookie values are hashed, not persisted.
- .github/workflows/manual-agent2-hw-live-matched-control.yml — manual-only workflow, pinned AALpy/NumPy, syntax checks, evaluator tests, and artifact preservation.

Runtime pins: Node.js 22, Python 3.12, aalpy==2.0.0, numpy==2.2.6, PYTHONHASHSEED=0.

Successful workflow runs:

- [45664689387 — eight random fixtures](https://github.com/FlareZ123/obfs/actions/runs/45664689387), artifact ID 15045569031.
- [45665036435 — 64-state delayed-pair seed zero](https://github.com/FlareZ123/obfs/actions/runs/45665036435), artifact ID 15046802792.
- [45665532924 — four 64-state delayed-pair seeds](https://github.com/FlareZ123/obfs/actions/runs/45665532924), artifact ID 15045779827, ZIP SHA-256 94b59ee419cb9914ab0fed85719eb379e3b4de12ce9c594ca2418aa4e2aff6fe.
- [45670259468 — random fixtures, states 8–12, four seeds, 30-walk / 2-origin](https://github.com/FlareZ123/obfs/actions/runs/45670259468), artifact ID 15048403993, ZIP SHA-256 d86486d02820b0da87b79561519bd3ec4c0fd43c2320188100b0f27884989b32.
- [45668408694 — 30-walk / 5-origin fixtures, states 6–8](https://github.com/FlareZ123/obfs/actions/runs/45668408694), artifact ID 15048168100, ZIP SHA-256 f68f1e1c34a026e96a188fc684fa99664cbe41f3dbe60d26691a8b0fe08ff7aa.
- [45669036998 — 5-walk / 1-origin fixtures, states 6–8](https://github.com/FlareZ123/obfs/actions/runs/45669036998), artifact ID 15048352816, ZIP SHA-256 50c0e06e3e9046cabfb23bcde7e5974d4015840d54a45693a4a308afdff541fd.
- [45669659354 — 30-walk / 1-origin 8-state repeat with per-case logs](https://github.com/FlareZ123/obfs/actions/runs/45669659354), artifact ID 15048234265, ZIP SHA-256 b76362ac15d9f8ed62080624393000468afd89ba041cf383122b8ebf343041a2.
- [45666180612 — weak-oracle 8-state case](https://github.com/FlareZ123/obfs/actions/runs/45666180612), artifact ID 15045769218, ZIP SHA-256 3b6cf537f0ed46f845d1dd406be93eb09053ec3771b676f9252d2feac28c9128.

Reproduce the baseline random batch from the repository root on the experiment branch:

~~~sh
python -m pip install aalpy==2.0.0 numpy==2.2.6
PYTHONHASHSEED=0 python sims/agent2-hw-live-matched-control.py \\
  --fixture-family random --min-states 2 --max-states 5 --seeds 2 \\
  --timeout-seconds 120 --random-walk-length 30 --origin-states 20
~~~

Reproduce the 64-state delayed-pair seed sweep:

~~~sh
PYTHONHASHSEED=0 python sims/agent2-hw-live-matched-control.py \\
  --fixture-family delayed-pair --min-states 64 --max-states 64 --seeds 4 \\
  --timeout-seconds 600 --random-walk-length 30 --origin-states 20
~~~

Reproduce the weak-oracle sensitivity case:

~~~sh
PYTHONHASHSEED=0 python sims/agent2-hw-live-matched-control.py \\
  --fixture-family random --min-states 8 --max-states 8 --seeds 1 \\
  --timeout-seconds 120 --random-walk-length 30 --origin-states 1
~~~

## Limitations and next work

1. Only two fixture families and a small number of seeds were tested. Broaden state counts, machine families, and adversarial initial states.
2. The weak-oracle case should be retained as a regression for false future convergence; vary origin coverage and random-walk length in paired live HTTP tests.
3. Construct fixtures with multiple trace-consistent candidate post-trace states that genuinely have different future behavior, rather than relying only on a deliberately weak oracle.
4. Execute the published client module in an instrumented browser and compare it with the raw-RPC learner; the current learner bypasses the module body.
5. Compare hW against the bounded two-state minimax learner without conflating their assumptions or query models.
6. Test SCO source confidentiality, tamper resistance, URL/domain locking, and the 2.5× runtime budget independently.
7. Obtain independent review of the ordinary control and parity checks before considering promotion beyond im-results/.

**Disposition:** retain as reproducible intermediate evidence. Do not promote to results/ or use it to claim general SCO weakness.
