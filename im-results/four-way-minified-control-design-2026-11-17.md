# Four-way native, minified, obfuscated, and reconstructed ESM release control

**Date:** 2026-11-17. **Classification:** Validated, application-scoped adversarial negative control; both 9-trial baseline and balanced 12-trial extension passed pinned Linux/Windows and Ubuntu Chromium validation. This is not a positive obfuscation result.

## Question and fixed application

Does the current COO affine/polyvariant emitter provide measurable security value beyond ordinary production minification on the same multi-file stateful application, after accounting for the 2.5× performance budget?

Use the frozen, already independently reproduced [three-module ESM application](../examples/polyvariant-app/native/) unchanged. The application contains three exported Int32 arithmetic helpers repeatedly called from a digest, a stateful session machine, external callback delivery, Unicode payloads, and reflective reads of a separate public state object.

The four distributed variants are:

1. **Native**: exact frozen source of \`math.mjs\`, \`state.mjs\`, and \`entry.mjs\`, normalizing only CRLF to LF.
2. **Minified**: each of those three source files separately transformed with the documented \`esbuild 0.28.2\` JavaScript API using \`minify:true\`, \`format:'esm'\`, \`target:'es2022'\`, \`legalComments:'none'\`. It does not bundle modules, rewrite paths, or request property mangling. This is an ordinary third-party baseline and not a candidate obfuscation technique.
3. **Published**: the existing actual COO builder emits the three transformed numeric leaves and retains native module boundaries. The builder, seed, and source are unchanged.
4. **Reconstructed**: an independent static attacker reads published \`math.mjs\` bytes and reconstructs all three numeric leaves without the original source, compiler, or seed. The two other public files are carried through untouched.

The different publication strategies are intentional: ordinary production minification processes the entire original graph; the safety-gated obfuscator can select only the three proven arithmetic leaves. Measure full graph bytes and report actual transformed coverage rather than calling the entire graph encrypted. The separately instrumented [application coverage study](../sims/polyvariant-app-execution-coverage.js) identifies 309 original selected arithmetic source bytes out of the 2,467-byte native three-module graph (12.52533% by bytes). The obfuscated distribution is 7,518 bytes and the ordinary esbuild output 1,115 bytes under the prior source-pinned baseline. This byte fraction is a source-coverage descriptor, not a dynamic CPU fraction or independent security metric.

## Two static attackers and held-out checks

[\`sims/polyvariant-app-minified-static-attacker.js\`](../sims/polyvariant-app-minified-static-attacker.js) accepts only the delivered minified module text and the known public export names. It uses generic Acorn AST parsing to recover \`round1\`, \`round2\`, \`round3\`, including ES module export aliases. The experiment evaluates those recovered functions on 4,096 held-out Int32 inputs per function, comparing against a separately loaded native reference. The native reference is used exclusively after extraction to check correctness.

The existing specialized public-only [polyvariant affine source reconstruction](../sims/polyvariant-app-static-clone.js) independently recovers those three functions from the *obfuscated* public bytes. The attacker algorithms are different, so their elapsed times do not form an equal-complexity oracle and must never be interpreted as proof of a cryptographic gap. They are concrete recoveries at an explicit application interface.

## Matched three-query attacker across all four variants

A separate [independent black-box competitor](../sims/polyvariant-app-three-query-competitor.js) obtains only the running exported arithmetic functions of each distribution and queries each round export once at input zero. It commits to the same signed-Int32 translation hypothesis for native, esbuild-minified, published COO and previously reconstructed math. The [negative-control tests](../test/polyvariant-app-three-query-competitor.test.js) show the three observations cannot reconstruct nonlinear functions in general.

After committing to the prediction, a separate verifier compares 4,096 held-out signed Int32 inputs per helper against the relevant public distribution and the unchanged native reference. These 12,288 additional comparison queries per distribution are **verification**, excluded from the three-query attack budget, and separately counted in the output. Identical query budgets and hypotheses remove the unequal static-decompiler algorithm confound for this restricted family. They do not establish a matched wall-clock human attack budget, arbitrary-function cloning ability, or a source-recovery result.

## Functional and runtime comparisons

The Node four-way experiment [\`sims/polyvariant-app-four-way-control.js\`](../sims/polyvariant-app-four-way-control.js) imports each candidate in a unique temporary ESM directory for every trial to ensure a newly parsed/evaluated graph, then invokes the same application and verifies complete JSON responses, the full emitted external host callback values against the returned trace, and exact host callback parity across all four graphs. Workloads contain **1, 50, 1,000, and 10,000 events**. Each variant receives **twelve trials per workload**, with four order permutations and the same deterministic Unicode-bearing records. It retains every runtime sample and computes the repository's one-sided paired median confidence diagnostic for minified, published, and reconstructed versus native.

This Node timing endpoint includes module import/evaluation and each stateful invocation. It excludes independent Node process startup, source preparation, the minifier's build time, and static attacker work. It is an *application session* measurement in a reused Node process, with a fresh ESM graph each time. It does not establish a full production end-to-end 2.5× bound. Source sizes, SHA-256s, and attack results are recorded in the same output.

The [real Chromium four-way browser](../test/polyvariant-app-four-way-browser.js) serves all twelve module files through a common ephemeral 127.0.0.1 HTTP origin, imports all four genuine ESM graphs, and compares exact full JSON results **and** serialized host callback traces over the same event counts. It separately times a warmed 10,000-event session, twelve trials per variant, with the same rotated-order control and the paired budget diagnostic. A second **browser-fresh ESM graph** control loads each of the three modules at a unique URL prefix for every trial, preventing browser module-map reuse of either the entry or dependencies. Two workloads (one and 10,000 events) each receive twelve paired trials of the four variants, and every newly imported module graph's complete JSON and emitted callback values must match the unchanged native reference; the server asserts 288 unique module fetches, including all dependencies. The measurement includes loopback HTTP module delivery, parse/link/evaluate, and one full application invocation. It excludes headless browser process startup, initial document load, DNS/TLS/WAN effects, and real deployment caches. Browser warm and fresh-graph data remain independent, neither establishes a universal 2.5× guarantee.

## Distinct claims and release criterion

- **Compatibility** requires parity on all recorded complete outputs, external callbacks, and held-out arithmetic functions.
- **Static recoverability** is established only for the actual selected functions and attacker algorithms. A public-only successful reconstruction falsifies a strong secrecy claim for those functions.
- **Dynamic instrumentation, integrity bypass, and environmental lock** are *not* proven by this minified comparison; the independently exercised SNO and SCO attacks remain separately relevant.
- **Cost** needs short and sustained sessions plus a distribution-aware uncertainty statement; ratios vary across hardware/OS. The strict 2.5× requirement cannot be certified universally from twelve pairs.
- **External performance** still needs real browser cold load, WAN transport and full deployment traces if future decisions invoke them.

This experiment is intentionally a negative-control fairness check. A safe compiler can be useful even when an attacker recovers its protected functions, but claims about resistance must be grounded in an attack budget and a credible advantage over conventional minification.

## Execution provenance

Manual workflow: [\`.github/workflows/manual-minified-control.yml\`](../.github/workflows/manual-minified-control.yml) on Linux and Windows Node 22, with actual Chromium on Linux. The [exact pinned two-platform Node and Ubuntu Chromium run 44033291091](https://github.com/FlareZ123/obfs/actions/runs/44033291091) passed at commit `c9e27ed461a318abcdf30657296aa03b438a791f` under the earlier nine-trial ordering. Raw Node Linux/Windows and browser Linux JSON audit artifacts are attached to that run. The subsequent balanced 12-trial change needs separate validation and cannot inherit that pin. Retain exact measured timings and attack outputs when making security or performance comparisons.


## Exact twelve-trial cross-platform evidence, 2026-11-17 09:01 UTC

The balanced [manual run 44047990141](https://github.com/FlareZ123/obfs/actions/runs/44047990141) passed Node 22 Windows and Ubuntu strict JSDoc, static recovery, selected-function matched-query probes, Node full application differential, and real Chromium full application plus host-callback and 288 fresh ESM graph request checks. **Executable source SHA:** `69464f296a8e426c1be175960e7130f7e3203646` (a later documentation-only update does not change executable bytes). Windows job `133918367938`, Ubuntu job `133918368141`; full node and browser JSON are retained as workflow artifacts.

The **same three public-runtime chosen fitting queries** against each original, minified, COO and independently reconstructed graph produced `round1=324`, `round2=292`, `round3=324` on both operating systems. Each committed restricted Int32-translation clone then matched 12,288 separate verifier-only signed Int32 comparisons against the public distribution and held-out original reference. The matching offsets and output behavior establish no incremental protection over conventional minification against **this identical bounded query attacker**. Ordinary public-source-only attacks separately recovered the three selected arithmetic leaves from both distributed code families. The generated and native source files remained identical to the prior experiment.

| Node workload events | Windows COO/native median ratio | Windows upper paired median bound | Ubuntu COO/native median ratio | Ubuntu upper paired median bound |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 1.2592× | 1.7227× | 1.3688× | 1.4450× |
| 50 | 1.3850× | 1.9366× | 1.4696× | 1.5487× |
| 1,000 | 1.5157× | 1.6102× | 1.9688× | 2.2485× |
| 10,000 | 1.2524× | 1.3954× | 1.3138× | 1.4442× |

On **all four workloads** the separate simultaneous familywise diagnostic reported sampled median support with conservative joint coverage at least 97.4609375% (four workload populations, within-workload i.i.d. assumptions). Windows' maximum observed single paired slowdown was 2.02635×, Ubuntu's 2.29839×, with zero actual observations above the stipulated 2.5× limit. This sampled result is neither an arbitrary-code guarantee nor a worst-case time bound.

Ubuntu real Chromium's warmed 10,000-event trial found COO/native ratio of separate medians **2.15493×**, with one-sided upper paired median bound **2.33333×**, 12 of 12 observed ratios within 2.5× and exact full output/callback parity. At the 1-event and 10,000-event fresh ESM graph workloads, all 12 trials per variant loaded and executed with 288 actual HTTP ESM module requests; two sample median ratios were near 1.00× because these include a dominant loopback/browser module-delivery cost. Neither test estimates real WAN, TLS or arbitrary browser startup.

**Decision:** reject the tested selective COO affine/polyvariant configuration as demonstrating an advantage over ordinary esbuild minification on this application and bounded chosen-query attacker. Both distribution families are straightforwardly cloned under the restricted signed Int32 translation hypothesis. This rejects a claim of stronger *measured selected-function confidentiality* rather than implying general obfuscation impossibility, browser lock success or arbitrary application compatibility. The exact same-state-output capability is separately verified; dynamic debugger resistance, integrity tampering and authorization boundaries require separate tests.
