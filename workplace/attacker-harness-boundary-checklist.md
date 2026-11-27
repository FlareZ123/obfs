# Attacker-harness boundary checklist

**Purpose:** distinguish a query-complexity experiment from a hostile-client security experiment. This checklist is required whenever a report claims the learner sees only a public oracle, while the evaluator owns private fixtures, source, state, keys or generator metadata.

## 1. Separate trust domains

- [ ] The evaluator, server and attacker are separate OS processes.
- [ ] The server and attacker use distinct unprivileged UIDs or isolated containers.
- [ ] The attacker UID has no sudo/root rights, no Linux capabilities, no privileged Docker socket, and no host PID namespace.
- [ ] The attacker cannot read the evaluator/server `/proc/<pid>/mem`, `/proc/<pid>/fd`, environment or private working directory.
- [ ] The attacker receives only public client files, runtime dependencies, endpoint and the credentials it is entitled to use.
- [ ] Private server source, fixture tables, keys, generator seeds and evaluator handles are never placed in an attacker-readable filesystem, environment, command line or shared memory.
- [ ] The server does not expose a debugger/inspector endpoint to the attacker.

A local HTTP listener is not process isolation. A `mode 0700` directory is not private from another process running as the same UID. A child process under the same runner account is not an attacker sandbox.

## 2. Keep the oracle boundary real

- [ ] The learner receives an IPC/HTTP client, not an in-process callback that closes over the target.
- [ ] For Python, inspect every reachable SUL attribute and function closure; no `Fixture`, transition table, initial state, evaluator, or mutable runtime object is reachable.
- [ ] For JavaScript, do not run learner and server in the same V8 isolate if the attacker is allowed to instrument/debug. Do not rely on private lexical variables as a security boundary.
- [ ] The only state mutation path is the public protocol. No reset, state label, hidden method, test hook or evaluator handle is available.
- [ ] Run a hostile learner probe that tries to enumerate temporary files, read private paths, inspect process metadata/memory, inspect environment variables, and traverse all reachable SUL object properties/closures. Expected access failures are part of the test result.

## 3. Decouple experiment randomness from target secrets

- [ ] The target fixture generator seed is independent of the learner's RNG seed.
- [ ] The learner RNG seed is independent of target state count, fixture seed, hidden family, target key and private partition seed.
- [ ] If the learner receives a reproducibility seed through argv or environment, prove it cannot be inverted or correlated with target metadata over the full allowed input domain.
- [ ] Record target seeds and fixture tables only in evaluator-side artifacts created after the learner run.
- [ ] Re-run a decoder audit over every learner-visible scalar, argv field, environment variable, cookie, header, response metadata and artifact input. A single reversible side channel invalidates the "public oracle only" assumption.

A deterministic seed encoding can leak more than the state count: if the public generator is deterministic, it can reveal the entire target machine.



### 3A. Ensure the target prior is not a small public enumerable family

- [ ] The target generator does not use a small public seed schedule such as `0..9` or `0..19`.
- [ ] The generator does not impose a highly recognizable public transition template (e.g. a fixed input-0 cycle) unless that structure is intentionally part of the attacker model.
- [ ] Enumerate the full public fixture family under the workflow's actual state/seed/family ranges.
- [ ] Replay each observed trace against every candidate fixture; report how many candidates remain and whether the target is unique.
- [ ] Compute a prior-aware adaptive query baseline (exact minimax when tractable, otherwise a documented heuristic); a small candidate count alone does not imply easy identification.
- [ ] Use a large evaluator-only seed space or direct cryptographic randomness for target generation; do not expose the target seed or any deterministic encoding of it.
- [ ] Record the exact fixture privately after the learner run for reproducibility.

A 70-machine public prior is not an unknown-target experiment. If every trace uniquely identifies one of those 70 fixtures, a lookup-table attacker can replace a general learning algorithm.

## 4. Separate measurement claims

Report these independently:

1. **Mathematical/query-complexity result:** a fixed learner or theorem over a stated model class.
2. **API-level simulation:** the fixed learner calls a local HTTP endpoint; server and learner may still share a process.
3. **Transport parity:** exact request/response envelopes, status, headers, body, bytes and source-delivery paths are compared.
4. **Hostile-client isolation:** OS/process/filesystem/debugger boundary is enforced and adversarial probes fail.
5. **Production security:** authentication, deployment proxy, domain/URL policy, multi-tenant state, concurrency, browser/Node behavior and runtime budgets are validated.

Do not use evidence at level 1–3 to claim level 4 or 5. A matched semantic step transcript is not byte-identical HTTP transport. A live local HTTP server is not proof of process isolation.

## 5. Matched-control requirements

- [ ] Same input/output semantics and initial hidden state.
- [ ] Same method identifier, request envelope, auth credential, authorization policy and response envelope.
- [ ] Same public client delivery mechanism (or explicitly disclose that it differs).
- [ ] Same learner version, random tape and query policy.
- [ ] Record semantic queries separately from all HTTP requests.
- [ ] Compare raw request/response metadata separately from semantic traces.
- [ ] Keep timing/performance measurements separate from transcript equality.

## 6. Case studies already found in this repository

- `im-results/agent49-hw-seed-disclosure-2026-11-26.md`: the hW learner-visible `oracle_seed` encoded fixture seed and state count; 69/69 completed offline fixtures and 8/8 live fixture digests were independently reconstructed.
- `sims/agent2-hw-no-reset-benchmark.py`: offline `NoResetMealySUL` stores `_step_impl` and `_initialize` closures capturing the target `Fixture`.
- `sims/agent2-hw-live-matched-control.py`: the learner child ran as the same GitHub-hosted runner UID and inherited its environment/PATH; the server's `nobody` boundary was therefore not an attacker boundary.
- `sims/sco-step-only-live-rpc.js`: the fixed learner and HTTP server run in the same Node process; the private source is written under a same-UID mode-0700 temp directory. The report and source JSDoc were qualified on 26 November.
- `sims/sco-rankthree-random-basis-live.js` and `sims/sco-rankfour-cubic-matched-private-api.js`: the HTTP server and fixed learner also execute in the same Node process. Their query measurements remain useful, but do not establish a hostile-client process boundary.

## 7. Required report wording

If isolation is absent, say:

> The fixed learner function was passed only the public step API. This is an in-process query-complexity/API simulation, not an OS-isolated hostile-client experiment. A malicious client with same-process filesystem/debugger access may inspect evaluator/server state.

If seed/metadata is exposed, state exactly what the learner can infer and whether the full target is reconstructible. Do not say "unknown state count" or "fixture hidden" without testing the actual learner-visible interface.

This checklist is a research-method aid, not a security proof. Passing it is necessary for an attacker-isolation claim, not sufficient for a production security claim.


## 8. Domain/URL locking is not automatically authentication

- [ ] Treat `allowedHosts` as both client-side hostname-guard configuration and server Host-header routing; neither is caller authentication.
- [ ] Do not trust `Host`, `Origin`, `Referer`, `Sec-Fetch-Site`, user-agent or client-side `location.hostname` as unforgeable proof of the caller's domain. A non-browser HTTP client can choose request headers, and a hostile client can patch browser-side checks.
- [ ] For SCO protected reads/RPC, use server-side `authorizeRead` / `authorizeRpc` callbacks that validate a server-issued capability or authenticated session. Keep signing keys server-side; never embed a shared secret in the distributed client.
- [ ] Treat origin/CORS checks as browser defense-in-depth, not as a substitute for authentication against raw HTTP clients.
- [ ] For COO/SNO, where the attacker controls all files/runtime/memory, URL/domain checks are tamper-resistance friction rather than a hard security boundary. Report this limitation explicitly.
- [ ] Test both the intended browser flow and a raw HTTP client that forges the allowed Host/Origin headers. The latter must still fail without valid server authorization.

The repository's `src/sco.js` documentation explicitly says `allowedHosts` is routing-only. This checklist makes the consequence operational: domain locking needs an independent server-verifiable identity/capability.
