# Agent 24 research continuity

Lease for this incarnation: \`agents/agent24/.lease.json\`, run id
\`agent24-bfda3adba307eeb1\`, original claimed_at
\`2026-11-15T18:37:18Z\`. Do **not** refresh. After every checkpoint compare actual
UTC clock; release by deleting lease only once elapsed time reaches 70 minutes
(\`2026-11-15T19:47:18Z\`), and only as the final repo mutation after all
useful state is pushed. The user explicitly invoked \`prompt.md\`, and the
mandatory random draw returned 5, normal research mode.

## Delivered code and evidence

1. \`src/rpc-keyed-isolation.js\`: new
   \`createScoKeyedIsolation(principalOf)\` authenticated-principal FIFO
   callback for \`createScoHandler({runRpcIsolated})\`. Each verified principal
   has an independent queue; failures release; idle entries are deleted.
   Three unit tests plus real HTTP cross-request authorization test:
   \`test/sco-keyed-isolation.test.js\`. Usage/constraints added to
   \`docs/SCO_AUTHORIZATION.md\` and README. Focused Linux + Windows manual
   [43749195532](https://github.com/FlareZ123/obfs/actions/runs/43749195532)
   green at commit \`57bd2e630866bd561f2ff3482ba97f171743f79c\`.
   The resolver must derive stable IDs from verified sessions; never
   client-chosen headers. No cross-process transactional guarantees.

2. \`src/sco-selective-partition.js\`: deliberately restricted opt-in
   \`partitionScoSelectedAsyncExports(file,{privateNames:[...]})\` retains
   directly exported public functions locally while replacing selected
   async exports with authenticated server-private RPC stubs via existing
   \`partitionScoAsyncModule\`. Strict AST admission refuses arbitrary
   declarations, imports, reexports, mutable exports and known private
   function-reference escape shapes. It now also rejects private code
   references to separated public function objects, overlapping public/
   private ambient state roots, a private singleton function as a value,
   and direct dynamic lexical evaluation. Static uncomputed member/object
   keys are distinguished from true lexical references. This is not a
   fully semantics-preserving compiler for arbitrary JS.

3. Actual generated ESM source pair
   \`examples/sco-selective/{before,after}/mixed.mjs\` and reproducible
   \`build.cjs\`. The private HMAC key, private crypto import and HMAC loop
   are absent from client output. \`test/sco-selective-partition.test.js\`
   validates exact generated source, safe admission/refusals, a two-file
   ESM consumer, external host API, authorized and denied real HTTP calls.
   The first cross-platform run caught CRLF sample mismatches; builder and
   test normalized sample line endings, later runs green.

4. \`sims/sco-selective-challenge.js\` with pinned
   [43751130545](https://github.com/FlareZ123/obfs/actions/runs/43751130545)
   Linux+Windows success at \`2ee7b692be4ba76b21797fef2166b16a76c673d3\`.
   Direct unauthenticated target RPC = 403, private key canary absent from
   served source, attacker-owned external HTTP relay with its own
   legitimate unlimited-query token returns **20/20** held-out exact
   secret-dependent outputs. Eight alternating sessions of 200,000 local
   public calls + one 16,000-HMAC protected call recorded native/relay:
   Ubuntu **40.279121/48.246921 ms = 1.197815×**, Windows
   **36.758100/41.312800 ms = 1.123910×**. This is a scoped, warm Node 22
   localhost trial, no universal 2.5x claim or anti-relay protection.
   \`im-results/sco-selective-2026-11-15.md\` and root README summarize.

5. \`manual-sco-authorization.yml\` remains dispatch-only and now gates
   both new suites plus external strict JSDoc and attack benchmark.
   First attempt at external strict types found missing annotations; fixed
   \`sims/sco-selective-challenge.js\` to use typed Promise<void>,
   guarded method map and number arrays. Linux + Windows green at
   [43751704931](https://github.com/FlareZ123/obfs/actions/runs/43751704931).
   Latest static-key admission refinement focused [43752392758](https://github.com/FlareZ123/obfs/actions/runs/43752392758)
   green; newer state-hardening focused [43752169983](https://github.com/FlareZ123/obfs/actions/runs/43752169983)
   green. Later focused run at \`ff639d68082db43f87240213847aa8ee64df6502\`
   was also green ([43752392758] was that source? Check exact source before
   citing). All important commits are pushed to main.

6. Communication to Agent 5:
   \`communications/agent5/2026-11-15T1854Z_agent24_selective-sco-partition.md\`.
   Broadcast:
   \`communications/broadcast/2026-11-15T1928Z_agent24_selective-sco-boundary-relay.md\`.
   Maintainer requested a real generated before/after example and advanced
   architecture; this effort implements a narrow one with attacker evidence.

## Broader project correctness and research priorities

The full \`manual-validation.yml\` run dispatched on
\`agent24/sco-static-key-proof-20261115\` source
\`ff639d68082db43f87240213847aa8ee64df6502\`, run
[43752475288](https://github.com/FlareZ123/obfs/actions/runs/43752475288),
remains **red**, 5 failures on Ubuntu and 6 on Windows (out of 1055 tests,
1 skipped). Prior baseline run at 17:50 UTC was already red with cross-file
property/assignment failures. The late trailing 5000-line Actions job log
did not include failure names because failures occurred early. A targeted
\`manual-transform-safety.yml\` run \`43752754825\` is underway for
diagnosis. Inspect its exact results before making claims about shared
property compiler fixes.

No new per-commit CI was added; all runs were manually dispatched.
The original full repository includes many reversible native AST, VM,
Wasm and symbol techniques. Existing independent attackers statically
recover many variants. COO has no trusted server, SNO owner controls
filesystem/memory; under SCO, only server-private source remains withheld,
yet authorized online relays demonstrate functional cloning. Keep these
threat distinctions in future reports.

## Next productive actions

- Finish diagnosis of the red full validation; avoid accidentally attributing
  preexisting property failures to the new selective code.
- Expand selective source/ambient closure proof only when a concrete
  differential counterexample motivates it; source-introspection,
  reflection and arbitrary JS semantics remain outside the model.
- Assess actual browser network RTT and session startup if seeking release
  guarantees; current 2.5x evidence is one warm localhost workload.
- Keep attack simulations independently reproducible, preserve private-only
  source boundaries, make only benchmark-backed claims.

## 2026-11-18 05:07 UTC: new incarnation and bounded principal lookup research

- Normal research mode selected by an executed RNG result of 4. Lease claimed, pushed and independently verified: `agents/agent24/.lease.json` with `run_id=agent24-d7e5950338e987b8` and `claimed_at=2026-11-18T05:07:31.853Z`. No lease refresh. Only voluntarily release at measured 70 min (06:17:31.853Z) as final repo mutation after all useful state is pushed.
- Per-principal FIFO SCO isolation already existed. Added optional `maxPrincipalResolutionMs` (positive integer ≤ 2147483647) in `src/rpc-keyed-isolation.js`: unresolved async principal resolutions can hold an aggregate `maxPendingTotal` slot forever; this bounds the wait and returns pre-execution `ScoIsolationBusyError` HTTP 429, releasing capacity and preventing late auth results from executing. Does **not** cancel provider-side I/O, interrupt synchronous blocking, guarantee fairness, or change the default infinity timeout.
- Added `test/sco-principal-resolution-deadline.test.js` covering timeout validation, late resolution, real HTTP 429/recovery, and already-running protected execution. `docs/SCO_AUTHORIZATION.md` and manual SCO authorization gate updated. Linux/Windows Node22 JSDoc and targeted SCO regression green at exact `e0373cc4094f9c56a85f37ab1a28679e4e107fb1`, CI [44243086456](https://github.com/FlareZ123/obfs/actions/runs/44243086456).
- Added `sims/sco-principal-resolution-cost.js` comparing existing helper vs opt-in deadline under 7 paired trials for sync/async cached auth and tiny/8KiB SHA-256 private work. First run [44243687690](https://github.com/FlareZ123/obfs/actions/runs/44243687690) failed only because Windows process CPU quantized a short 10k-loop population to 0; profiler now marks unresolved ratios rather than fabricating CPU. Revised source `c35d99e460d67449ea3472014dc5de4198295a40` passed CI [44243963075](https://github.com/FlareZ123/obfs/actions/runs/44243963075) Linux/Windows. **Budget veto:** asynchronous resolved cached principal + tiny work exceeded strict >2.5x vs unchanged helper: CPU 5/7 Ubuntu, 6/7 Windows; median CPU 2.65x / 3.01x. Asynchronous + 8KiB hashes ~1.17x / 1.14x median CPU, 0/7 breaches. Sync resolver ~0.93x / 0.94x tiny CPU. These are *isolator-relative* warm-process timings, not native vs obfuscated complete-app guarantees.
- Optimized cached Promise resolution to avoid registering timer when the Promise has already settled in a microtask, retaining a real timer for pending resolution (`src/rpc-keyed-isolation.js` commit `0f76072c05d4c47ca63d340801f51d224b9e367d`). Added regression for immediately resolved/rejected async principal and late rejected timeout at `e8cd76dedc5635277c8f45da97c008ba3c4cbc5d`. Manual SCO authorization run against this source on `agent24/sco-principal-cost-20261118` had been dispatched; locate and verify run (likely 44244635187).
- Strong obfuscation objective remains release blocked per `results/README.md`; keep queue helper in intermediate evidence, never claim improved client code secrecy or universal 2.5x. If optimization produces a strict >2.5 cost pair, leave optional, document veto. Prior normal agent24 research about selective SCO partition remains in preceding history.


## 22 November 2026, new incarnation: event-loop deadline bound and measured veto

- Uniform RNG result **6** => normal agent. Claimed Agent 24 on main commit `431216565e17c8b92d542db8f966f7fa09ab3133`; original lease `2026-11-22T17:55:56.635Z`, `run_id=agent24-20261122T175556Z-research-review`. First permitted release checkpoint is `2026-11-22T19:05:56.635Z`. Do not refresh lease or voluntarily exit before measured 70 minutes. On release, commit/push all state, delete lease as **final git mutation** then verify.
- Existing `src/rpc-keyed-isolation.js` deadline relied on timers, which can be starved by a synchronous or queued-microtask principal verifier. Test-only commit `f8a27ad4352fe51570a9b2d9218e368201751c54` adds two 35ms-block / 5ms-deadline witnesses; Linux+Windows [red CI 45052792052](https://github.com/FlareZ123/obfs/actions/runs/45052792052) fails both expected rejection assertions. The test-only branch is `agent24/principal-resolution-deadline-red-20261122`.
- Candidate `3806d09d6545337a5de7be19f8e9e3ffd15ddafd` adds two monotonic `performance.now()` reads per finite-deadline lookup and refuses late-resolved principals, aborting cooperating signal and releasing reservation. Windows [candidate CI 45052627292](https://github.com/FlareZ123/obfs/actions/runs/45052627292) passed 304/305 Node tests (one skip), both strict JSDoc stages, all simulator checks, and Chromium through other SCO fixtures. Ubuntu targeted Node test stage passed but the separate `test/sco-host-ipv6-browser.js` returned `pending` instead of `[::1]|42`, making overall workflow red before strict JSDoc.
- **Strict performance veto:** the same candidate CI Windows Node22 cached async + `abortPrincipalLookup:true` tiny-effect helper-only profile had **6/21 CPU pairs over 2.5×** relative to default keyed isolation (median 2.248×, max 3.118×). Ubuntu was 0/21 (median 1.837×, max 2.120×). Heavy SHA-256 per-op groups were 0/21 each. This is not original-vs-obfuscated app timing or causal attribution without same-code placebo. Preserve failed pairs, do **not merge or claim runtime compliance**.
- Candidate doc commit `8de47f2613897b4d4ab4425c1de87eb203eb4961`, report `im-results/sco-principal-resolution-eventloop-expiry-2026-11-22.md` at commit `ceb9d1f6a5bc9e2f30b384bac7f669607cf992d4`. Draft **[PR #292](https://github.com/FlareZ123/obfs/pull/292)** on branch `agent24/principal-resolution-elapsed-deadline-20261122` explicitly blocks merge pending performance work. No release/security gain claimed.
- Independently read Agent 5 [PR #289](https://github.com/FlareZ123/obfs/pull/289) alias-DAG two-line compiler optimization: per-query visited retention seems logically sound for monotonic finite AST provenance reachability (not the path-dependent bound-argument count). Sent review `communications/agent5/20261122T180651Z_agent24_alias-dag-review.md` on main commit `efa38b0fb2868ce1522419f3f067e56fe5fecfce`. Review is scoped; no independent full code/CI reproduction.
- Authoritative overall `results/README.md` stays RELEASE-BLOCKED for COO/SNO/SCO. Critic requested candidate convergence, matched controls, strict CPU veto and no repetitive full CI. Continue productive research within active lease. Possible next work: a preregistered, same-source elapsed-deadline versus clock-placebo ablation or separate genuinely stronger three-mode candidate. Do not reproduce broad matrix unnecessarily.


### 22 November continuation after 18:23Z: independent common-basis lemma

- Agent43's full-rank low-output-residual cycle theorem has a singular interpolant condition. Derived elementary **common basis existence** for every permutation `F:GF(q)^n -> GF(q)^n`: with k independent inputs/outputs already selected, U=input span and G^-1(W) have size q^k and share zero; their union has at most `2q^k-1 < q^n`, so the next vector outside both increases both ranks. Hence some input basis yields an invertible output affine interpolant. This is **existential**, not efficient basis discovery.
- Standalone exhaustive Node CJS/JSDoc `sims/low-output-residual-common-basis-peercheck.js`, wrapper `test/common-basis-existence.test.js`, explicit `jsconfig.external.json` entry, report `im-results/common-nonsingular-affine-basis-2026-11-22.md`. All 5040 zero-fixed 3-bit permutations checked against 168 ordered bases: 126 common bases for 1344 functions, 132 for2352, 144 for1176, 168 for168. 1500 seeded 4-bit permutations have 11880..13920 common ordered bases of 20160. Greedy partial-basis count certificate tested.
- [Two-OS focused CI 45054376204](https://github.com/FlareZ123/obfs/actions/runs/45054376204) at source `7a1e8406b613dfd69589f3b26fed7093cd2730c9` succeeded in both Node focused execution and both strict project/external JSDoc jobs; existing `manual-validation.yml`, no new workflow. Research-only draft **[PR #294](https://github.com/FlareZ123/obfs/pull/294)** on `agent24/common-basis-existence-20261122`, latest head `e5d396a462a793cf412691d8183d40a447ace205`.
- IMPORTANT priority correction: Agent39's existing independently reviewed `im-results/affine-low-rank-oracle-inversion-2026-11-21.md` **already handles singular M** using quotient completion, expected additional `k+1.607` samples then `2^r` orbit. Agent7 deterministic completion also handles singular. Common-basis result is structural geometric observation **not an improved attacker query method**. Explicitly noted in PR report and sent to Agent43 via `communications/agent43/20261122T1816Z_agent24_common-affine-basis-lemma.md` plus `communications/agent43/20261122T1822Z_agent24_common-basis-ci-and-prior.md`.
- SCO branch `agent24/principal-resolution-elapsed-deadline-20261122` has second profiler and same-code placebo at source `d4cf37eb629c2dc4f8079ce27c5f3a286e1703a5`. [CI 45053445284](https://github.com/FlareZ123/obfs/actions/runs/45053445284) Windows complete green, Ubuntu browser IPv6 native page fails before generated path. Windows guarded-vs-default CPU 4/21 >2.5x, same-code guarded-vs-guarded 0/21 >2.5; Ubuntu both 0/21. Report appended at commit `1c950b11d86b1f8222774f3d063da3d3ceb0bb69`. **Keep PR #292 draft/unmerged because strict CPU veto**.
- Further work: look for genuinely strong mode-specific candidate or independent soundness bug; avoid presenting mathematics as positive obfuscator; preserve source-pinned controls, type checks, and unmodified-vs-compiled comparisons.
