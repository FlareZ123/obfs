# Four-way native, minified, obfuscated, and reconstructed ESM release control

**Date:** 2026-11-17. **Classification:** Intermediate experimental control; original nine-trial design passed two-platform CI, balanced 12-trial extension pending validation. This is not a positive obfuscation result.

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

## Matched three-query attacker across all four variants

A separate [independent black-box competitor](../sims/polyvariant-app-three-query-competitor.js) obtains only the running exported arithmetic functions of each distribution and queries each round export once at input zero. It commits to the same signed-Int32 translation hypothesis for native, esbuild-minified, published COO and previously reconstructed math. The [negative-control tests](../test/polyvariant-app-three-query-competitor.test.js) show the three observations cannot reconstruct nonlinear functions in general.

After committing to the prediction, a separate verifier compares 4,096 held-out signed Int32 inputs per helper against the relevant public distribution and the unchanged native reference. These 12,288 additional comparison queries per distribution are **verification**, excluded from the three-query attack budget, and separately counted in the output. Identical query budgets and hypotheses remove the unequal static-decompiler algorithm confound for this restricted family. They do not establish a matched wall-clock human attack budget, arbitrary-function cloning ability, or a source-recovery result.

## Functional and runtime comparisons

The Node four-way experiment [\`sims/polyvariant-app-four-way-control.js\`](../sims/polyvariant-app-four-way-control.js) imports each candidate in a unique temporary ESM directory for every trial to ensure a newly parsed/evaluated graph, then invokes the same application and verifies complete JSON responses, the full emitted external host callback values against the returned trace, and exact host callback parity across all four graphs. Workloads contain **1, 50, 1,000, and 10,000 events**. Each variant receives **twelve trials per workload**, with four order permutations and the same deterministic Unicode-bearing records. It retains every runtime sample and computes the repository's one-sided paired median confidence diagnostic for minified, published, and reconstructed versus native.

This Node timing endpoint includes module import/evaluation and each stateful invocation. It excludes independent Node process startup, source preparation, the minifier's build time, and static attacker work. It is an *application session* measurement in a reused Node process, with a fresh ESM graph each time. It does not establish a full production end-to-end 2.5× bound. Source sizes, SHA-256s, and attack results are recorded in the same output.

The [real Chromium four-way browser](../test/polyvariant-app-four-way-browser.js) serves all twelve module files through a common ephemeral 127.0.0.1 HTTP origin, imports all four genuine ESM graphs, and compares exact full JSON results **and** serialized host callback traces over the same event counts. It separately times a warmed 10,000-event session, twelve trials per variant, with the same rotated-order control and the paired budget diagnostic. A second **browser-fresh ESM graph** control loads each of the three modules at a unique URL prefix for every trial, preventing browser module-map reuse of either the entry or dependencies. Two workloads (one and 10,000 events) each receive nine paired trials of the four variants, and every newly imported module graph's complete JSON and emitted callback values must match the unchanged native reference; the server asserts 288 unique module fetches, including all dependencies. The measurement includes loopback HTTP module delivery, parse/link/evaluate, and one full application invocation. It excludes headless browser process startup, initial document load, DNS/TLS/WAN effects, and real deployment caches. Browser warm and fresh-graph data remain independent, neither establishes a universal 2.5× guarantee.

## Distinct claims and release criterion

- **Compatibility** requires parity on all recorded complete outputs, external callbacks, and held-out arithmetic functions.
- **Static recoverability** is established only for the actual selected functions and attacker algorithms. A public-only successful reconstruction falsifies a strong secrecy claim for those functions.
- **Dynamic instrumentation, integrity bypass, and environmental lock** are *not* proven by this minified comparison; the independently exercised SNO and SCO attacks remain separately relevant.
- **Cost** needs short and sustained sessions plus a distribution-aware uncertainty statement; ratios vary across hardware/OS. The strict 2.5× requirement cannot be certified universally from twelve pairs.
- **External performance** still needs real browser cold load, WAN transport and full deployment traces if future decisions invoke them.

This experiment is intentionally a negative-control fairness check. A safe compiler can be useful even when an attacker recovers its protected functions, but claims about resistance must be grounded in an attack budget and a credible advantage over conventional minification.

## Execution provenance

Manual workflow: [\`.github/workflows/manual-minified-control.yml\`](../.github/workflows/manual-minified-control.yml) on Linux and Windows Node 22, with actual Chromium on Linux. The [exact pinned two-platform Node and Ubuntu Chromium run 44033291091](https://github.com/FlareZ123/obfs/actions/runs/44033291091) passed at commit `c9e27ed461a318abcdf30657296aa03b438a791f` under the earlier nine-trial ordering. Raw Node Linux/Windows and browser Linux JSON audit artifacts are attached to that run. The subsequent balanced 12-trial change needs separate validation and cannot inherit that pin. Retain exact measured timings and attack outputs when making security or performance comparisons.
