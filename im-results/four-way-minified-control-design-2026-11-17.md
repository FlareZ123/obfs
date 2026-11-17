# Four-way native, minified, obfuscated, and reconstructed ESM release control

**Date:** 2026-11-17. **Classification:** Intermediate experimental design, pending actual two-platform CI. This is not a positive obfuscation result.

## Question and fixed application

Does the current COO affine/polyvariant emitter provide measurable security value beyond ordinary production minification on the same multi-file stateful application, after accounting for the 2.5× performance budget?

Use the frozen, already independently reproduced [three-module ESM application](../examples/polyvariant-app/native/) unchanged. The application contains three exported Int32 arithmetic helpers repeatedly called from a digest, a stateful session machine, external callback delivery, Unicode payloads, and reflective reads of a separate public state object.

The four distributed variants are:

1. **Native**: exact frozen source of \`math.mjs\`, \`state.mjs\`, and \`entry.mjs\`, normalizing only CRLF to LF.
2. **Minified**: each of those three source files separately transformed with the documented \`esbuild 0.28.2\` JavaScript API using \`minify:true\`, \`format:'esm'\`, \`target:'es2022'\`, \`legalComments:'none'\`. It does not bundle modules, rewrite paths, or request property mangling. This is an ordinary third-party baseline and not a candidate obfuscation technique.
3. **Published**: the existing actual COO builder emits the three transformed numeric leaves and retains native module boundaries. The builder, seed, and source are unchanged.
4. **Reconstructed**: an independent static attacker reads published \`math.mjs\` bytes and reconstructs all three numeric leaves without the original source, compiler, or seed. The two other public files are carried through untouched.

The different publication strategies are intentional: ordinary production minification processes the entire original graph; the safety-gated obfuscator can select only the three proven arithmetic leaves. Measure full graph bytes and report actual transformed coverage rather than calling the entire graph encrypted.

## Two static attackers and held-out checks

[\`sims/polyvariant-app-minified-static-attacker.js\`](../sims/polyvariant-app-minified-static-attacker.js) accepts only the delivered minified module text and the known public export names. It uses generic Acorn AST parsing to recover \`round1\`, \`round2\`, \`round3\`, including ES module export aliases. The experiment evaluates those recovered functions on 4,096 held-out Int32 inputs per function, comparing against a separately loaded native reference. The native reference is used exclusively after extraction to check correctness.

The existing specialized public-only [polyvariant affine source reconstruction](../sims/polyvariant-app-static-clone.js) independently recovers those three functions from the *obfuscated* public bytes. The attacker algorithms are different, so their elapsed times do not form an equal-complexity oracle and must never be interpreted as proof of a cryptographic gap. They are concrete recoveries at an explicit application interface.

## Functional and runtime comparisons

The Node four-way experiment [\`sims/polyvariant-app-four-way-control.js\`](../sims/polyvariant-app-four-way-control.js) imports each candidate in a unique temporary ESM directory for every trial to ensure a newly parsed/evaluated graph, then invokes the same application and verifies complete JSON responses, the full emitted external host callback values against the returned trace, and exact host callback parity across all four graphs. Workloads contain **1, 50, 1,000, and 10,000 events**. Each variant receives **nine trials per workload**, with four order permutations and the same deterministic Unicode-bearing records. It retains every runtime sample and computes the repository's one-sided paired median confidence diagnostic for minified, published, and reconstructed versus native.

This Node timing endpoint includes module import/evaluation and each stateful invocation. It excludes independent Node process startup, source preparation, the minifier's build time, and static attacker work. It is an *application session* measurement in a reused Node process, with a fresh ESM graph each time. It does not establish a full production end-to-end 2.5× bound. Source sizes, SHA-256s, and attack results are recorded in the same output.

The [real Chromium four-way browser](../test/polyvariant-app-four-way-browser.js) serves all twelve module files through a common ephemeral 127.0.0.1 HTTP origin, imports all four genuine ESM graphs, and compares exact full JSON results **and** serialized host callback traces over the same event counts. It separately times a warmed 10,000-event session, nine trials per variant, with the same rotated-order control and the paired budget diagnostic. A second **browser-fresh ESM graph** control loads each of the three modules at a unique URL prefix for every trial, preventing browser module-map reuse of either the entry or dependencies. Two workloads (one and 10,000 events) each receive nine paired trials of the four variants, and every newly imported module graph's complete JSON and emitted callback values must match the unchanged native reference; the server asserts 216 unique module fetches, including all dependencies. The measurement includes loopback HTTP module delivery, parse/link/evaluate, and one full application invocation. It excludes headless browser process startup, initial document load, DNS/TLS/WAN effects, and real deployment caches. Browser warm and fresh-graph data remain independent, neither establishes a universal 2.5× guarantee.

## Distinct claims and release criterion

- **Compatibility** requires parity on all recorded complete outputs, external callbacks, and held-out arithmetic functions.
- **Static recoverability** is established only for the actual selected functions and attacker algorithms. A public-only successful reconstruction falsifies a strong secrecy claim for those functions.
- **Dynamic instrumentation, integrity bypass, and environmental lock** are *not* proven by this minified comparison; the independently exercised SNO and SCO attacks remain separately relevant.
- **Cost** needs short and sustained sessions plus a distribution-aware uncertainty statement; ratios vary across hardware/OS. The strict 2.5× requirement cannot be certified universally from nine pairs.
- **External performance** still needs real browser cold load, WAN transport and full deployment traces if future decisions invoke them.

This experiment is intentionally a negative-control fairness check. A safe compiler can be useful even when an attacker recovers its protected functions, but claims about resistance must be grounded in an attack budget and a credible advantage over conventional minification.

## Execution provenance

Manual workflow: [\`.github/workflows/manual-minified-control.yml\`](../.github/workflows/manual-minified-control.yml) on Linux and Windows Node 22, with actual Chromium on Linux. The initial pinned Node-only branch run [44014229913](https://github.com/FlareZ123/obfs/actions/runs/44014229913) was queued at design time. The browser extension was added later on the branch. Record exact green source SHA and raw measurements in a follow-up to this note before promoting any empirical conclusion.
