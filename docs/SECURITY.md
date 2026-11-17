# Threat-model and proof boundaries

## Static and dynamic analysis

XOR string encoding, locally proven identifier renaming, and seeded names raise the cost of casual inspection. They are trivially reversible by an adversary who can run JavaScript, observe the decoder, inspect memory, or instrument property access. A measured time slowdown says nothing about deobfuscation resistance.

## SCO per-response literal spelling: only 32 selector bits

The SCO handler obtains a fresh 24-byte random nonce for each published JavaScript response, but its **literal-spelling** transformation consults only the low bit of each of the 32 bytes of `SHA256(nonce)`, indexed by a code-unit position and the original literal offset. Consequently a fixed pre-variation source has at most **2^32** distinct spelling-choice masks from this pass, independent of the broader nonce's 192-bit size. A printable ASCII literal of 32 code units reveals the mask from raw character-versus-`\\uXXXX` spellings. This is a bound on one formatting layer, with no corresponding claim about complete output entropy, hashed identifiers, server-private code, or authentication.

An [Acorn-only attacker subprocess](../sims/sco-spelling-mask-extractor.js) given only each public served source recovered the selector and reproduced exact tested variant spellings. The [real HTTP challenge](../sims/sco-spelling-mask-attack.js) passed 24 independently randomized requests on Linux and Windows, including mixed Unicode, a NUL code unit and an unpaired surrogate; [pinned CI 43917568528](https://github.com/FlareZ123/obfs/actions/runs/43917568528). A [real Chromium differential](../test/sco-spelling-mask-browser.js) separately confirmed native/emitted UTF-16 parity and mask recovery even when the module **genuinely renamed one private field and six local bindings**, [pinned browser CI 43920125069](https://github.com/FlareZ123/obfs/actions/runs/43920125069). The [extended CSP-enabled real Chromium gate at CI 43921504653](https://github.com/FlareZ123/obfs/actions/runs/43921504653) also checked the actually renamed private field's returned value, yielding **74/74 native/emitted units**, and statically normalized two random SCO responses to byte-identical executable code with equivalent observed results. This canonicalized program recovers the tested *behavior and structure*; the private original names were **not** independently recovered, and the mask attacker alone only recovers literal spellings. More detail and limitations are in the [intermediate result](../im-results/sco-spelling-mask-2026-11-16.md).

Larger private nonces cannot by themselves turn publicly visible lexical escaping into code confidentiality. Preserving an eligible string's value is a compatibility property. Any positive resistance claim requires independent reconstruction tests and complete-session runtime measurement, with separate credit for genuinely withheld SCO server-side operations.

## Public eager XOR string encoding: independent offline extraction

The default SNO eager string encoder and opt-in COO/SCO encoder distribute the XOR key, literal table and decoder in generated JavaScript. An [independent Acorn-only offline attack](../im-results/jsdeobsbench-public-static-recovery-2026-11-16.md) statically recovers every compiler-counted encoded literal reference in a pinned 1,301-program JsDeObsBench corpus for both SNO script and CommonJS. The attacker runs in a read-only, network-disabled, unprivileged container with only the distributed code, attack script and Acorn mounted; the original code, compiler metrics and official answers are withheld until a separate verifier stage. Both recovered-code full-corpus differential lanes passed at [pinned CI 43831549024](https://github.com/FlareZ123/obfs/actions/runs/43831549024), as did the separate COO native compatibility lane. A distinct real Node ESM test recovers the same pattern from opt-in COO/SCO and default SNO modules, preserving a host-owned callback.

This result supports a narrow conclusion: the supplied string encoder has no static confidentiality for the observed literals under the documented threat models. Recovering literals does not recover all source structure, server-private SCO implementation, or authorization keys. Source-only parse/rewrite wall time excludes attacker development and defender runtime; the 2.5× hot-path budget still requires separate measurements. Alternate public encoders need independent attacker comparisons before security-benefit claims.

A separate [two-platform V8 TypeError semantic regression](../im-results/string-failed-operand-semantics-2026-11-16.md)
shows that decoding a computed-property literal can change the text of a
failed call/constructor expression in `error.message`, despite preserving
its field value. The eager encoder now conservatively leaves literals in
identified source-spelled failure operands untouched. A successful computed
read still receives a genuinely encoded literal in the pinned positive
control. This is a bounded compatibility repair, with no added
deobfuscation-resistance or universal runtime claim.

## Native multi-statement control-flow backend (negative security and performance control)

The opt-in `experimentalStatementFlow` backend turns certain ordinary
multi-statement synchronous functions into randomized switch dispatchers.
It permits native if/else, var, expressions, return/throw, and whole
untouched native loops, switches, labels and exception blocks. Explicit
source observers, unsafe direct eval and unsupported lexical scopes cause
conservative refusal. Existing `window` APIs remain externally named.

This is structural obfuscation. In a pinned real Linux/Windows run, an
independent source-only AST attacker recovered **80/80 full COO layered
and hostname-locked functions**, reproducing **20,560/20,560** checks.
A one-instruction byte-level source mutation changed outputs on 129/258
inputs and preserved tested external callback events. Recovery took a
median **0.177 ms Ubuntu / 0.179 ms Windows** per small function, excluding
human development time. See [native statement-flow evidence](../im-results/native-statement-cfg-2026-11-16.md)
and the [reconstruction and mutation gate](https://github.com/FlareZ123/obfs/actions/runs/43804565469).

Runtime cost is workload-dependent. A native function that invoked an
expensive host callback met 2.5× in sampled profiles. A tiny pure arithmetic
function reached **2.781× Windows** after this backend, failing the hard
project budget, in the [CPU-only profile gate](https://github.com/FlareZ123/obfs/actions/runs/43804836672).
The mechanism cannot be presented as generally runtime-safe or as a
trusted confidentiality/integrity boundary in COO or SNO.

## Expression-graph backends and hot-path safety

The experimental bytecode and native-register graph backends are opt-in for selected, top-level return-only functions. Both preserve native JavaScript binary operators for the supported expression grammar. The bytecode backend carries a public XOR-encoded instruction tape and interpreter switch; the native backend carries a public sequence of register assignments with XOR-masked literal constants. [Independent public-source AST attacks](../im-results/native-graph-backend-2026-11-15.md) recover the full expression after regular COO/SNO identifier and string transformations. Neither method supplies confidentiality, tamper-proofing or host authorization under full-control attacker models. Read the [generated bytecode before/after](../examples/expression-vm/README.md) and [native inline before/after](../examples/native-graph/README.md) for reproducible details.

The bytecode backend may exceed the 2.5x compute cap when selected for frequently invoked functions. An early native-register backend introduced a helper call and measured **17.873x Ubuntu /24.918x Windows** overhead on a 250,000-call numeric kernel. Inlining the same graph into the original function body brought that measured hot ratio to **1.003x Ubuntu /0.995x Windows** at the pinned CI run [43739846096](https://github.com/FlareZ123/obfs/actions/runs/43739846096). These are workload-specific benchmark measurements. They do not establish safe overhead for every JIT tier, browser, call site, input type or startup shape. Unknown external observers of function source/stack formatting also remain a compatibility hazard, even when the AST source-observer guard declines recognized local cases.

## Experimental Int32 WebAssembly lowering

Selected opt-in, pure bitvector functions can be compiled into embedded
WebAssembly i32 binaries using `experimentalWasmI32` or the COO/SNO
`--wasm-i32` CLI selector. The source grammar is deliberately restricted.
One to four signed-Int32 Number arguments are supported for selected
return-only bitvector expressions; the caller is responsible for enforcing
that exact type contract and a stable WebAssembly environment. The grammar
now conservatively refuses source `-0` literals, because JavaScript's
observable negative zero cannot be represented by Wasm i32. This soundness
regression and native signed-number positive control passed on two operating
systems in [the pinned signed-zero gate](../im-results/wasm-i32-negative-zero-2026-11-16.md).
The transformed wrapper has a different `Function#toString` representation.
A cyclic ESM import formerly invoked a transformed function before its eager
WebAssembly initializer and caused a TDZ exception. The ESM emitter now uses
a hoisted self-replacing helper that preserves the tested cycle. Its first-call
compilation must count in COO. Applications with restrictive CSP or no
WebAssembly must decline.

A hostile-runtime harness additionally intercepted the Wasm Module constructor,\ncaptured the binary without source edits, and replaced the exported function\nthrough an Instance wrapper: the original result 3970 became 7331. A pinned\nreal Chromium test found that CSP `script-src 'self'` blocks this backend\nwith CompileError, while adding `'wasm-unsafe-eval'` permits the same output.\nSee [pinned dynamic/CSP evidence](../im-results/wasm-i32-pipeline-2026-11-15.md#hostile-runtime-interception-and-real-browser-csp-compatibility).\n\nThe native WebAssembly byte array is delivered to the recipient. A
source-only attacker independently instantiated the public export with the
native Wasm API and reproduced 4,001 output pairs. A separate seedless source-only Wasm stack interpreter reconstructed all 120 tested diversified original expression trees exactly, with 30,720 additional held-out comparisons. No key or original source
was needed, and the binary is available for disassembly. This pass provides
neither a secret execution boundary nor hostile-runtime integrity, domain
locking or instrumented-runtime resistance. Its native hot runtime was
2.064× on Ubuntu and 1.923× on Windows in a selected pinned kernel;
Chromium measured 1.333× for a selected loop. Initialization must count
for COO. An independent pinned whole-session profile measured 15.691×
Ubuntu and 30.000× Windows for a one-call module lifetime after JS wrappers
were precompiled, violating the 2.5× ceiling in that specific workload.
There is no workload-independent runtime guarantee.
See the [generated pair](../examples/wasm-i32/README.md) and
[intermediate report](../im-results/wasm-i32-pipeline-2026-11-15.md).

## Property-name transformation

The implementation only edits properties of literal objects whose relevant local uses are proved by a deliberately narrow static analysis. Objects with dynamic keys, unknown consumers, escaping references (including const exported aliases), ambiguous bindings, unsupported syntax, visible-scope mismatches, nonprimitive writes, or reflection are excluded. `--closed-world` permits direct ES module export/import use only when the deployment's module set is genuinely complete and all consumers are rewritten together. It is unsafe to enable the option for a library with unknown consumers. This proof should be fuzzed further before production use. The analysis permits explicitly declared CSS, raster-image, and font assets to accompany an ESM graph only under an integrator guarantee that each is served with a non-JavaScript MIME type and never interpreted as source. File extensions alone are insufficient evidence of safe execution. HTML, SVG, unknown assets, and other executable JavaScript formats force the cross-file pass to decline renaming.

## Distributed source-byte observation

Source-byte reads are a separate semantic compatibility hazard from the familiar
`Function.prototype.toString` case. A Node ES module can use
`readFileSync(new URL('./other.mjs', import.meta.url), 'utf8')` or
`node:fs/promises.readFile` to inspect the exact source bytes of a module in
the declared build group. The reader can compare a private property spelling
without obtaining or calling the exported object. Browser `fetch` and
`XMLHttpRequest` can likewise request deployed module source.

The bounded `observesDistributedSource` AST preflight now declines ordinary
identifier, property and string transformations across a supplied group when
it sees static Node `fs` module access or known browser file-reading APIs.
It applies even to a single module that reads its own file. The SCO HTTP
handler also suppresses per-request source spelling variation for that group.
Conservative refusals can include benign use of `fetch` for ordinary API
requests or `node:fs` for unrelated files. The guard also recognizes direct
`node:module`/`module` loader imports and common member-loader expressions.
The CommonJS `module.constructor._load('node:fs')` path is specially declined:
this loads the filesystem API through Node's Module constructor without an
ordinary `require('fs')` call. The exact-source contract must take precedence
over transformation coverage until a target-specific path and loader proof exists.

This preflight remains incomplete: custom I/O functions, hidden aliases,
external modules, alternative byte transports, build-time postprocessing,
remote source archives and target/runtime-dependent source-fetch behavior
are not proven safe. A requested host-lock wrapper would change the served source and contradict
exact source-byte inspection. The compiler and SCO handler therefore reject the
recognized combination rather than emitting an incompatible script. The guard preserves the
tested native contracts; it provides no stronger obfuscation secrecy or
tamper-resistance in a fully controlled runtime. Regression witnesses:
`test/cross-file-source-byte-reader.test.js` and
`test/node-loader-source-reader.test.js`.

## Selective SCO cross-realm compatibility

The selected-async-export SCO partition places original private functions on the server while retaining approved functions in a browser JavaScript realm. Each realm has distinct intrinsic prototype objects. A source module that writes `Object.prototype.x` in a private function and later reads `({}).x` in a public function can observe the write before partitioning but cannot observe it across the server/client split. The same hazard applies through helper functions and aliases of `Array.prototype`.

The selective compiler conservatively refuses explicit `.prototype` and `.__proto__` access, bounded computed keys, known `Object`/`Reflect` prototype-reflection methods, and simple first-class or declared aliases of those methods. It also refuses recognized legacy `RegExp` match statics such as `RegExp.$1`, `RegExp.input`, and `RegExp.lastMatch`. The latter values are also stored separately by JavaScript realms, so executing a match in the server realm cannot update the browser's legacy capture properties. The regression suite `test/sco-intrinsic-realm.test.js` demonstrates both mismatches using distinct Node VM realms and verifies that the compiler refuses tested private/public helpers and alias forms. The paired reproducible CI evidence is in [the cross-realm intermediate study](../im-results/sco-cross-realm-prototypes-2026-11-15.md).

The checker also refuses migration of direct browser-only ambient roots (including `window`, `document`, `navigator`, `location`, and browser storage) into a private server-side function. It catches plain `globalThis` member reads, straightforward global aliases, and relevant global-object destructuring. Public browser-side exports may still read such APIs. A Node server cannot automatically reproduce those browser APIs, so preserving the original browser result requires an explicit different boundary or app-defined server interface.

The static guard remains incomplete. More complex aliases, unmodeled intrinsic APIs, dynamically evaluated accessors, and mutable state outside these checked roots may still cross the boundary. An integrator must audit mixed public/private code for cross-realm side effects. These guards address semantic compatibility, not deobfuscation resistance.

A [pinned 220-case intrinsic state shape grid](../im-results/sco-intrinsic-shape-grid-2026-11-15.md) adds independent Node VM witnesses for mutations through `globalThis` aliases, arrays, objects, local function forwarding, defaulted/nested binding patterns, built-in method references (e.g. `Math.imul`), and deep member writes. In the tested cases the original shared realm observes the canary update and the isolated reader realm does not; the compiler now refuses all 220 generated unsafe partitions while admitting seven selected read-only controls. The Linux/Windows [focused CI run 43776297613](https://github.com/FlareZ123/obfs/actions/runs/43776297613) passed at pinned source `2ccc4e5574e44374869dc6c51309fc54d778c7dc`. This is a bounded syntax and VM-context validation, with potentially significant false refusals. The compiler still has no complete alias/effect model across general JavaScript execution, and the result supplies no new confidentiality or authorization guarantee.

## Authorization

COO: The receiver can modify script and `location` observations, so hostname wrappers remain bypassable. Static ESM imports/reexports evaluate their dependencies before the importer body. The compiler accepts an opt-in, complete `closedWorld:true` ESM file graph only when **every** static dependency is explicitly supplied and each emitted module begins with its own body guard. Unresolved or opaque dependencies are rejected. The check assumes ordinary URL resolution with no import-map, custom-loader or service-worker redirection; fetching and linking can precede the guard, and a hostile client can delete all emitted guards. This is a limited runtime-compatibility improvement, documented with a [real Node/Chromium graph and public-only bypass](../im-results/closed-graph-host-2026-11-16.md) and an [independent real-browser import-map pre-guard side-effect counterexample](../im-results/closed-graph-importmap-bypass-2026-11-16.md). Trusted server authorization remains necessary.

SCO: The obfuscation-controlled server can keep undistributed secrets and enforce authenticated operations. Requests for JavaScript can be replayed, and unlimited responses can be collected. Per-response mutation alone does not ensure secrecy. The SCO CLI now restricts the public file set to entry-reachable ESM modules plus explicit `--client` JavaScript and `--asset` data files. Files elsewhere in `--root` are withheld, including server-only JavaScript modules. Runtime `import()` edges are deliberately excluded from automatic publication, including literal specifiers: unreachable branches must not accidentally publish server-only modules. Non-module scripts, workers and runtime-loaded files likewise require deliberate `--client` declarations. Importing a privileged module from the client entry will expose that module by design. Programmatic `createScoHandler` requires the integrator to pass only public source files. Any `Host`/`Origin` check is an auxiliary signal, not identity authentication. The optional authenticated RPC service retains method implementation on the server, but black-box oracle attacks and timing overhead remain in scope. A [finite-domain authorized oracle experiment](../im-results/sco-authorized-oracle-extraction-2026-11-15.md) showed 256/256 output recovery with unlimited legitimate requests and no secret-key disclosure. Require method-aware per-item authorization for batch calls, and consider oracle leakage even when every operation is authorized. Batch preflight checks initial permission state and cannot infer permission changes caused by earlier operations in the same batch. A state-changing batch must be rejected or checked against a complete, consistent sequential transition model; the optional `preflightScoBatchState` helper evaluates such a model but does not provide transaction isolation. Operational controls such as rate limits, monitoring, and durable authentication belong to the integrator.

SNO: Under the stated attacker model the adversary owns code, filesystem, and process memory. A hash manifest inside a launcher cannot prevent code modification or bypass. A native Windows/Ubuntu reproduction in [the local-owner manifest attack](../im-results/sno-owner-self-hash-bypass-2026-11-15.md) changes the SNO entry, observes an integrity rejection, then recomputes the expected digest in the attacker-controlled launcher and executes the modified entry successfully. A [second pinned two-platform attack](../im-results/sno-runtime-preload-bypass-2026-11-16.md) uses an attacker-controlled Node loader prelude to change the launched program's result after hash verification while keeping the distributed launcher and entry file byte-identical. This shows a runtime-only interference channel separate from editing the on-disk manifest. For integrity, deploy a remote trust anchor or OS/TEE-backed attestation beyond this project's capabilities.

## Source-map disclosure preflight

A source map can contain `sourcesContent` with the original untransformed JavaScript, along with original symbol names and source paths. All three programmatic modes now reject supplied assets whose filenames end in `.map` (case-insensitive), reject structurally recognized version-3 source-map JSON (including indexed maps renamed to `.json`, `.txt`, or arbitrary asset extensions), and reject actual `//#`, `//@`, or `/*#` `sourceMappingURL` comments in JavaScript before any transformation. They also reject assets with source-like suffixes (`.js`, `.mjs`, `.cjs`, `.jsx`, `.ts`, `.mts`, `.cts`, `.tsx`, `.vue`, `.svelte`, `.astro`, `.mdx`, `.coffee`, `.litcoffee`) when marked as opaque files; otherwise a transformed distribution could contain a direct copy of its original JavaScript or transpiler inputs. SCO's static-serving handler performs the same preflight, including assets explicitly selected by `--asset`. Remove source-map comments and exclude map sidecars in the source build before obfuscating. Refusal is intentional because copying the map would undermine the intended confidentiality, while silently removing runtime-loaded assets could alter behavior.

The published HTML asset preflight uses the pinned `parse5@7.3.0` HTML5 parser. It rejects inline `<script>` content, inline event-handler attributes, `iframe srcdoc`, `javascript:` links, executable `data:` URLs (including XHTML and common XML document media types), and executable URL targets of `meta http-equiv="refresh"` redirects. External `<script src>` URLs remain syntactically permitted, but those scripts must be transformed and distributed separately by the integrator. The parser also inspects CSS source-map comments inside HTML `<style>` elements, including those nested in `<template>`, with the same CSS comment-aware scanner as standalone stylesheets and SVG `<style>` elements. This refuses embedded inline base64 source maps before the HTML is published. A separate conservative guard now refuses `data:` URLs on HTML `<link rel="stylesheet">` elements, including tokenized `alternate stylesheet` forms and entity-decoded or ASCII-control-obscured schemes: such links can embed a second CSS document with a nested `sourceMappingURL` and unmodified `sourcesContent`, beyond the normal standalone `.css` scan. The [public-HTML-only extractor and previous-compiler comparison](../sims/html-data-stylesheet-attack.js) and [intermediate report](../im-results/html-data-stylesheet-source-leak-2026-11-17.md) document the narrow refusal and its remaining gaps. This intentionally declines benign inline data stylesheets; use separately audited CSS assets for accepted builds. CSS assets and inline HTML/SVG `<style>` content now also refuse embedded `data:` stylesheet `@import` URLs (quoted and `url()` forms, including escaped CSS scheme spellings and WHATWG ASCII tab/newline URL normalization). Such imports can contain an entire second stylesheet plus an original-source map. Ordinary relative or remote imports remain unchanged. See the [paired source-only CSS extractor](../sims/css-nested-data-import-attack.js) and [bounded report](../im-results/css-data-import-disclosure-2026-11-17.md). The parser never rewrites HTML bytes. It strictly decodes HTML assets as UTF-8 and refuses malformed byte sequences and NUL code units, including UTF-16-like padding that could disguise executable markup from a UTF-8 parser. An HTML page containing inline JavaScript or inline JSON inside a `<script>` block is deliberately refused rather than silently modified, because original program text could escape as an asset. The preflight also handles HTML character references and nested template content.

SVG assets have a separate XML-conformant, namespace-aware preflight using pinned `saxes@6.0.0`. It refuses SVG `<script>` elements, inline event handlers, executable URLs (including animation-driven URL changes and XHTML `meta` refresh redirects), `srcdoc` attributes within SVG/XHTML foreign content, DTD/entity declarations, malformed XML, and ambiguous byte encodings, while preserving verified safe SVG geometry and image references byte-for-byte. It refuses entire ambiguous SVG documents without changing them. The scanner checks each semicolon-delimited SVG animation `values` candidate separately, since one later animation state can carry an executable URL even when the first state is benign. The scanner also passes SVG `<style>` element character data and CDATA through the shared CSS source-map annotation check, refusing a sourceMappingURL comment containing an inline original-source map or a link to one. It concatenates parser text segments before scanning so XML character references or CDATA boundaries cannot split an annotation. A CSS source-map annotation embedded in an SVG can disclose source text when delivered as an unchanged asset. This is a conservative static preflight and does not establish whether a particular browser executes that animation under its deployment context. SVG XML `<?xml-stylesheet ...?>` processing instructions now refuse embedded `data:` stylesheet URLs as well, including numeric character references in pseudoattributes. Otherwise a stylesheet with embedded original-source `sourcesContent` can be shipped inside unmodified SVG bytes without appearing as an XML `<style>` element. Ordinary external stylesheet processing instructions remain accepted. The scanner does not inspect compressed `.svgz` archives or external SVG dependencies.

WebAssembly assets have an additional bounded debugging-metadata gate. The binary scanner now refuses standard `name`, embedded DWARF `.debug_*`, compressed `.zdebug_*`, and `external_debug_info` custom sections, since these can publish original function/local names and source references even when the Wasm module executes identically. It reads actual custom-section headers and preserves ordinary custom-section payloads containing incidental debug-like strings. String-backed Wasm with UTF-8-preserving binary bytes is also audited before publication. See the [paired public-Wasm name extractor](../sims/wasm-debug-metadata-attack.js) and [intermediate evidence](../im-results/wasm-debug-metadata-2026-11-17.md). Arbitrary third-party custom sections can still carry private data, and declining debug-bearing Wasm is a deliberate compatibility tradeoff. Strip debug metadata before protecting and releasing a Wasm asset.

Opaque compressed and archived assets are another route for untransformed
JavaScript or source maps to enter a distribution. The asset preflight now
refuses recognized `.gz`, `.br`, `.zip`, `.tar`, `.tgz`, `.7z`,
`.zst`, `.xz`, and `.bz2` archive suffixes. It also recognizes common
gzip, ZIP, Zstandard, XZ, 7-Zip, bzip2 and ustar byte signatures when an
archive is mislabeled with a harmless filename such as `.png`.
This is intentional fail-closed policy: the existing asset validator does not
parse archive member paths, nested compression, source maps or embedded code.
Supply cleartext assets for validation, or generate trusted precompressed
variants only *after* obfuscation and control their deployment separately.
Brotli has no universal magic header, so raw Brotli streams under unrelated
extensions and arbitrary encoded source strings are outside this scanner's
guarantees. Regressions are in `test/compressed-asset-disclosure.test.js`.

This guard remains bounded. It does not inspect all arbitrary `.json`, CSS properties, XML outside SVG, generated strings, or externally hosted response bodies for embedded source. It cannot prove that other HTML text/attributes do not contain the original program, nor can it ensure that every externally referenced script has been obfuscated. It does not establish resistance to execution-time extraction or reverse engineering of distributed scripts. Integrators must audit the complete published asset set and any independent source-map hosting themselves.

## Public native ESM shard experiment

The opt-in `workplace/coo-native-shards.js` splits explicitly selected typed bitvector functions into public ESM helpers, with generated samples in `examples/coo-native-shards/`. The seed changes names and module layout; it does not add any secret. A seedless attacker reconstructs all tested expression trees by following the published imports. There is no new authorization, trusted integrity, or dynamic extraction barrier.

Two output layouts were compared on Node 22 Linux and Windows. The two-file **paired** layout stayed below 2.5x in six sampled end-to-end fresh-module lifetimes on both systems, while the three-file **split** layout exceeded the target in five Windows workloads. These timing ratios are workload-specific and include Node ESM loading; the experiment is outside the default pipeline. A Chromium functional gate passed, but a separate browser HTTP-loading profile suffered 10ms/20ms virtual-clock quantization and cannot establish the browser runtime budget. See [the pinned report](../im-results/coo-native-shards-2026-11-15.md) and [CI validation](https://github.com/FlareZ123/obfs/actions/runs/43748684953).

## Performance

The CLI emits executable JavaScript using normal JS operations. String decoding incurs startup cost (especially in COO). Hot-loop string sites are excluded, but the 2.5x runtime requirement is empirical and workload-specific. `test/benchmark.js` samples arithmetic, property read/write, and string comparisons; it fails if any observed median exceeds 2.5x. This does not exhaust possible programs or timing distributions.

## Compatibility

Acorn parses standard stage-4 JavaScript, CommonJS and ESM. JSX, experimental syntax, non-JavaScript languages, unrecognized bundler conventions, native add-on binary changes, code that depends on function-toString source, and unmodeled reflection require other handling. Module specifiers and file paths are preserved. The output writing API uses cross-process lock files with atomic rename within the same filesystem. Paths reject traversal, Windows device names, unsafe Windows filename characters, and case-insensitive collisions. The multi-file directory is not a transactional snapshot.
