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
