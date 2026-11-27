# Threat-model and proof boundaries

## Static and dynamic analysis

XOR string encoding, locally proven identifier renaming, and seeded names raise the cost of casual inspection. They are trivially reversible by an adversary who can run JavaScript, observe the decoder, inspect memory, or instrument property access. A measured time slowdown says nothing about deobfuscation resistance.


## Source observations supplied by the runtime host

A compiler's local source scan cannot prove an arbitrary runtime host will preserve the behavior of native callback and stack-inspection APIs. Two independently pinned Node 22 regressions show that a source-changing identifier rewrite can alter ordinary application output even when the supplied JavaScript does not contain an explicit function-source observer.

In one test, the host replaces the mutable `Promise.prototype.then` before loading a CommonJS application and inspects `String(callback)`. Renaming a private local inside the syntactically native-looking `Promise.resolve().then(callback)` changes the result from `[true,17]` to `[false,17]`. The same fixture failed on **current main** [Ubuntu/Windows run 45079829468](https://github.com/FlareZ123/obfs/actions/runs/45079829468) and the **unmerged optional public-callable source-preservation draft** [run 45079534372](https://github.com/FlareZ123/obfs/actions/runs/45079534372). A separately proven direct-call positive control retains genuine identifier-renaming yield. A minimal conservative refusal prototype on the draft branch passed its [focused two-platform gate 45080107944](https://github.com/FlareZ123/obfs/actions/runs/45080107944), but the same prototype's [complete Linux/Windows run 45080198697](https://github.com/FlareZ123/obfs/actions/runs/45080198697) failed broader property-renaming yield, performance and browser regressions, so that prototype remains unmerged. The reproducible contract and source pins are preserved in the [mutable Promise callback report](../im-results/promise-continuation-host-source-observation-2026-11-22.md). A separately served, CSP-constrained **real Chromium COO** module reproduced the same mismatch: native `[true,17]`, obfuscated `[false,17]` in [browser run 45080695020](https://github.com/FlareZ123/obfs/actions/runs/45080695020). An ordinary esbuild-minified control also returned `[false,17]`, demonstrating a shared source-changing-transform limitation rather than an obfuscator-specific security advantage.

In a separate non-strict **CommonJS** test, a directly invoked local worker calls an unowned host function; the host examines its calling function with the Node/V8 legacy `external.caller` accessor and `String(external.caller)`. A local identifier rename inside the worker changes the observable result, despite the worker never being exported. This failed on both platforms against [current main 45080349921](https://github.com/FlareZ123/obfs/actions/runs/45080349921) and [the same draft 45080277508](https://github.com/FlareZ123/obfs/actions/runs/45080277508); the control case without that external call still performs a private rename. The [external sloppy caller report](../im-results/external-sloppy-caller-source-observation-2026-11-22.md) scopes the observation to tested non-strict Node behavior. A separate [real Node `require()` subprocess gate 45080993386](https://github.com/FlareZ123/obfs/actions/runs/45080993386) corroborated the same mismatch on both operating systems, without relying on a VM-only CommonJS shim. It does not establish identical access to strict ESM or every browser runtime.

An unshadowed built-in name or direct-call-only lexical binding does not establish that a function's source is unobservable through a **mutable or externally implemented callee**. Sound source-preserving transformations need explicit runtime assumptions or conservative refusals that protect complete related edit groups. A refusal protects compatibility while potentially reducing useful obfuscation coverage; positive work-yield and whole-suite gates remain essential. These cases establish **compatibility limitations**, not successful tamper resistance, source confidentiality, or compliance with the 2.5× compute budget. The strong-protection release decision remains blocked.


A third boundary concerns the compiler's narrow optimization for a captured
`const get=Reflect.get` that only reads an own primitive from a fresh object
literal. That proof is sound for the assumed native intrinsic, but a real Node
CommonJS `--require` preloader can replace `Reflect.get` before the module
loads. A non-strict replacement can read its calling CommonJS module wrapper's
source using the legacy `arguments.callee.caller` accessor. The compiled
string-literal table changes that observed wrapper source while the originally
supplied input contains no such observer. An isolated, nonzero-string-rewrite,
three-mode red witness reproduced the mismatch on both Node 22 operating
systems in [run 45108344558](https://github.com/FlareZ123/obfs/actions/runs/45108344558),
with a matching pristine-intrinsic positive semantic control. Its executable
[research branch test](https://github.com/FlareZ123/obfs/blob/29a81de25425ae3b35c2b3003552dca1cf5f560e/test/decoder-captured-get-host-real-cjs.test.js)
and [source-pinned report](../im-results/captured-reflect-get-host-caller-source-2026-11-23.md)
explicitly preserve the failing oracle. Known input-visible global aliases
that poison the decoder were conservatively refused in a separate control;
this external preloader witness is therefore a deployment-assumption failure,
not an established current-source analysis bypass. Review preloads and
mutated host intrinsics when claiming behavioral parity, or limit admitted
transforms to a documented pristine-runtime contract. A [matched real-Node ordinary esbuild minifier control](../im-results/reflect-captured-get-minifier-control-2026-11-23.md)
passed Ubuntu and Windows at [pinned run 45129792894](https://github.com/FlareZ123/obfs/actions/runs/45129792894):
pristine-host output agreed with the original, while the same external
preloader distinguished both the minified and compiled sources. This is a
source-changing-transform compatibility boundary, not a unique
obfuscator-specific effect or evidence of anti-analysis strength.
The primary strong-protection release remains blocked.

## Browser DOM-visible executable source

An inline classic script or inline ESM module may read the exact JavaScript
source text embedded in its own HTML document. The current COO identifier and
private-record property rewriters can preserve computed values while changing
source-dependent output observed through `document.documentElement.outerHTML`,
`innerHTML`, `XMLSerializer`, DOM text-node traversal, `Range`, or an
imported helper receiving the browser `Document`. Even when identifiers and
properties are disabled, an authorized `allowedHosts` wrapper can change
observable inline source length. Source-pinned real Chromium evidence covering
these distinct passes and benign positive controls is preserved in the
[DOM source-observation report](../im-results/browser-dom-source-serialization-parity-2026-11-22.md)
and [manual cross-pass acceptance run](https://github.com/FlareZ123/obfs/actions/runs/45030057373).
The acceptance run remains red because the compiler has not integrated a
sound general DOM source-observer guard.

A source-read can pass through module imports, parameter aliases and host DOM
serialization. A JavaScript-only graph also does not establish what additional
source copies the surrounding HTML may expose: identical compiled modules
behaved differently when one host mirrored an imported library's source in
inert HTML. The current HTML asset preflight rejects that specific
script-element mirror if supplied, but cannot establish properties of absent
deployment assets. Until the source-observer integration is validated, require
native-versus-emitted browser parity for applications that read embedded source,
and refuse incompatible optional transforms instead of treating untested
obfuscation output as equivalent. A conservative refusal may preserve
correctness while producing zero obfuscation yield; retained positive private
rewrites must be measured separately. These are **compatibility and admission
limits**, with no demonstrated incremental static/dynamic reconstruction cost,
host-lock bypass resistance or universal 2.5× runtime guarantee.


## Ambient decoder provenance and host-resolved module imports

The eager string decoder consults mutable JavaScript intrinsics, including
`String.fromCharCode`. The compiler's conservative static, dynamic ESM, and
CommonJS dependency checks refuse string encoding when a source-visible
module may mutate those intrinsics before another module initializes.
This preserves native behavior for the proved input graphs in the pinned
[dynamic/static ESM and CommonJS red-green evidence](../im-results/decoder-external-dynamic-import-intrinsic-parity-2026-11-22.md).
It does not prove that the surrounding deployment executes every locally
named import using the compiler's assumed resolver.

A host HTML import map can remap a supplied local ESM path to a `data:`
module, changing an encoded target literal while leaving the original value
unchanged in real Chromium. The [pinned import-map witness](../im-results/browser-host-importmap-decoder-assumption-2026-11-22.md)
runs that native/emitted differential under the same browser host.
A Node 22 `--import` preload can similarly register a loader hook that
remaps `node:path` in ESM or bare `path` in CommonJS to arbitrary code,
falsifying a proposed trust-by-builtin whitelist. The [Node loader-hook
report](../im-results/sno-native-builtin-loader-hook-whitelist-counterexample-2026-11-22.md)
records the unsafe ESM candidate, the merged safe ESM refusal regression,
and the separate CommonJS bare-builtin negative control.
A deployed application must audit the actual HTML import maps, Node loader
hooks and preload code if it relies on ambient decoder equivalence. A hostile
COO browser or fully controlled SNO runtime cannot furnish that trust.
These boundaries are independent of confidentiality, tamper resistance,
and the strict 2.5× runtime requirement.

## Windows DOS device-name admission

The compiler's portable path validator conservatively refuses the console
spellings `CONIN$` and `CONOUT$`, their extension-qualified forms, digit-zero
serial/parallel port forms, and reserved device stems padded with spaces before
an extension. See `test/windows-device-paths.test.js` and Microsoft's
[RtlIsDosDeviceName_U documentation](https://learn.microsoft.com/en-us/windows/win32/devnotes/rtlisdosdevicename_u).

This is a **cross-platform input-admission policy**, not proof that these
names would redirect this compiler's directory-qualified output to a device.
In a [source-pinned Windows Node 22 experiment](https://github.com/FlareZ123/obfs/actions/runs/44960761551),
`CONIN$`, `CONOUT$` and their extension-qualified forms were writable and
readable as ordinary directory-qualified filenames. The conservative
refusal can therefore exclude valid input. It gives no hostile-runtime
integrity or source-confidentiality guarantee.

## Windows DOS 8.3 output-path aliases

Windows filesystems may create a second, shortened 8.3 path for an ordinary
long filename. For example, a source-pinned Windows filesystem probe observed
`privateLongOriginal.mjs` also readable through `PRIVAT~1.MJS` while the
Linux runner kept such paths distinct. The compiler, direct SNO launcher and
SCO publication preflight now conservatively reject supplied filename or
directory components containing `~` followed by decimal digits before a
period or component end. This guards common short-alias spellings even when
the input was prepared on a filesystem with different name semantics.

The check intentionally refuses some independent filenames, and 8.3 name
creation and spelling are filesystem- and volume-dependent. A verified 8.3
pattern does not imply every possible short-name alias is covered. Validate
output deployments on their actual filesystem and deny external mutation of
the trusted build directory. This is an output-path correctness safeguard;
it gives no independent protection against a filesystem-owning SNO attacker,
a hostile browser or online SCO relay. The empirical probe is
`sims/windows-shortname-alias-probe.js` and the admission regressions are in
`test/windows-device-paths.test.js`.

## SCO JSON-wire semantics and bounded batch work

The current generated server-controlled async RPC facades use `JSON.stringify` for arguments and `response.json()` for returned values. An RPC boundary therefore proves at most **JSON-wire-value equality** unless the integrator separately restricts every input and output to a verified JSON-compatible domain. JSON may omit own `undefined` fields, replace nonfinite numbers, change negative zero, lose object reference identity and prototypes, and fail on BigInt or cyclic data. The [real HTTP negative witness](../test/sco-json-shape-contract.test.js) finds that the private application returns an own `value:undefined` field that disappears from the published facade's object even while serialized outputs match. This is a scoped semantic limitation, not a server authorization bypass. A caller relying on `Reflect.ownKeys`, property ownership, special numeric values or aliasing must demand a different admitted boundary or an explicitly specified richer transport; do not label arbitrary remote JavaScript return values 1:1 compatible.

The same private ESM application's [source-pinned resident CPU comparison](../im-results/sco-resident-process-cpu-2026-11-18.md) found severe 2.5× CPU violations for small separately authenticated operations, including 13/13 strict breaches at 1,000 private iterations per call on both platforms in a 12,288-call sample. The [actual compiler-generated bounded batch experiment](../im-results/sco-bounded-real-batch-cpu-2026-11-18.md) instead uses 1,024-call batches with sequential per-item authorization, and found zero strict CPU breaches over 51 paired observations per OS for the 24,576-call/1,000-iteration workload. One-iteration calls remained over budget. These **resident-compute experiments exclude both client facade import and trusted server setup** in order to isolate recurring work, and use a shared-process loopback CPU scope. Under the project's 2.5× rule, only eligible trusted-server initialization may be amortized; a supported resident median alone therefore cannot certify end-to-end SCO budget compliance. They support a **workload-specific opt-in partition**, without proving a universal worst-case compute bound or host-environment integrity.

Batch admission must bound both **number of calls and total authorized private work per request**. The demonstrated handler refuses a 1,024-item batch of 150,000-iteration operations by aggregating declared work before evaluation; it also rejects unauthorized source reads and unauthenticated RPCs, and invokes independent per-item policy. This cap is application-specific: a caller may still consume service resources through repeated legal requests. Production SCO deployments require authentication, rate limiting, principal quotas, contention control, input-size limits, and a reviewed invariant for each batch's state/ordering semantics. Batching does not prevent a legitimate credential-holder from relaying outputs through the original trusted service.

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

## Explicit selected-function build admission

An opt-in function backend is an explicit protection request to the compiler.
The `obfuscateFiles` admission pass now rejects nonempty selections targeting
absent or non-JavaScript files, and snapshots accepted selected-function arrays
before emission. For the seven supported function backends, a missing,
ineligible, duplicated or source-observed selected function causes a build-time
error whenever its underlying lowerer reports a decline. The older register-VM,
expression-VM, native-graph and branch-block lowerers previously returned their
decline counts without the enclosing compiler enforcing them. A successful
build can no longer silently omit those requested transformations.

This is a **non-vacuity check** on the trusted build's explicitly selected
work. It does not strengthen the generated JavaScript against static
reconstruction, browser/Node instrumentation, host imitation, authorized
server queries or runtime modification. Eligibility proofs remain
backend-specific and incomplete for arbitrary JavaScript. It introduces no
additional runtime checks into an accepted, unmodified protected program.

The [reproducible admission audit](../im-results/experimental-function-selection-coverage-2026-11-17.md)
and [full Linux/Windows validation 44197962949](https://github.com/FlareZ123/obfs/actions/runs/44197962949)
at exact source `22e0188999a1e14d40bd2c3efafb47a1ab93d95c`
cover seven missing-file and function-name selectors, legacy refusals,
configuration getter/mutation controls, an actual transformed-function
differential, and real Chromium integration.

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

### Public callable source and protected private work

An ESM or CommonJS entrypoint can expose the exact source of its exported
functions through `Function.prototype.toString`. A field rewrite inside the
body of an exported function (including a CommonJS `module.exports` or
`exports.*` callable) changes that value even if the function's numeric
outputs remain the same. Keep such a public wrapper's body unchanged and
perform private field reads in a module-local helper when the application's
declared entry contract allows that separation.

The local property proof treats callable source as observable behavior. It
admits body-local field edits only when a function binding is unique and every
non-declaration reference is a direct call within that binding's lexical
scope. Exported, escaping, aliased, returned, passed, and otherwise unproved
callable values are not treated as private; unknown function expressions and
methods are conservatively declined. A private direct-call-only helper can
still contain renamed reads even when an exported wrapper calls it, because
the wrapper's own source does not contain the field spelling. See the
[COO/SNO property-source regression](../test/property-exported-callable-source-boundary.test.js)
and [broader CommonJS callable-source cases](../test/commonjs-public-callable-source.test.js).

The local property-renaming pass is currently skipped for classic
`sourceType:'script'` inputs. This source-boundary policy describes the ESM
and CommonJS paths; classic scripts have global-binding/source-visibility
semantics and require a separate proof before enabling local property
renaming there.

The [source-stable wrapper regression](../test/closedworld-private-wrapper.test.js)
uses two ESM modules, checks `hot.toString()` for exact native/emitted equality,
asserts six numeric probes, and requires two genuine cross-file private-key
rewrites. The source-pinned [Ubuntu/Windows focused run
44997812169](https://github.com/FlareZ123/obfs/actions/runs/44997812169)
passed at `18ad424d34646d455b8e2ee38348925775f6c589`.
The test's supported public entry is `worker.mjs`; `state.mjs` is an internal
declared dependency under the explicit closed-world option. Importing the
internal module from an untracked consumer invalidates that scope and could
observe its original keys. This compatibility design does not confer
confidentiality, hostile-loader safety, or independent environment locking.

### Bound callable targets and hostile-runtime extraction

For a constructible target `function internal(){...}` exported only through
`internal.bind(null)`, ordinary `hot.toString()` exposes a generic native
bound-function string. A host can nevertheless execute
`Reflect.construct(hot,[]).constructor.toString()` to recover the original
target function source through its constructed instance. With field and
identifier rewrites this changes an observable value. The exact two-platform
counterexample and conservative-refusal control are documented in
[bound export source reachability](../im-results/bound-export-source-reachability-2026-11-22.md).
One bounded compatibility alternative uses a nonconstructible arrow target
and asserts that `Reflect.construct` throws in both original and emitted code.

Even that arrow cannot hide its source from a fully controlled client runtime.
A host can patch `Function.prototype.bind` before dynamically importing the
protected module, record the actual original function supplied to
`bind`, and forward the normal binding call. This captures the transformed
private function itself while preserving numeric behavior. The exact
[Node and Chromium runtime-interception study](../im-results/bound-runtime-interception-2026-11-22.md)
includes actual two-platform Node 22 execution and a real Chromium ESM test
under `default-src 'none'; script-src 'self'; connect-src 'self'`.
This specific attack extracts a target passed to a patchable method; it does
not establish complete extraction of every arbitrary obfuscated application.
A [matched esbuild comparison](../im-results/bound-runtime-interception-2026-11-22.md#property-mangled-equal-key-negative-control)
also removed the same two original private key spellings from an ordinary
minified build. On both Ubuntu and Windows, one identical pre-import bind
interception recovered the underlying private function from that
property-mangled control and from the obfuscated build. The tested
interception therefore has no demonstrated extra barrier over the
equal-key-mangled control; the experiment does not measure end-to-end
reverse-engineering effort or runtime cost. All COO deployments remain
within the full-control client attacker model.

## Distributed source-byte observation

Source-byte reads are a separate semantic compatibility hazard from the familiar
`Function.prototype.toString` case. A Node ES module can use
`readFileSync(new URL('./other.mjs', import.meta.url), 'utf8')` or
`node:fs/promises.readFile` to inspect the exact source bytes of a module in
the declared build group. The reader can compare a private property spelling
without obtaining or calling the exported object. Browser `fetch` and
`XMLHttpRequest` can likewise request deployed module source. Browser
`CacheStorage` adds another source-observation path: `Cache.add()` implicitly
requests a module URL and `Cache.match().text()` exposes its delivered bytes,
even when the application's AST has no explicit `fetch` call. The bounded
ordinary source-byte preflight now recognizes the named `caches` and
`CacheStorage` roots, and the opt-in ESM source-island proof separately
refuses them. Both checks are conservative and admit finite evidence only;
a host can provide unmodeled source-reading capabilities. In a same-origin
browser document, `Window.frames` can expose an iframe that loads a JavaScript
file as text, allowing declared ESM to inspect `frame.document.body.textContent`
without a direct network reader call. Declared ESM can also create its own
iframe and inspect `HTMLIFrameElement.contentDocument` or `contentWindow`.
The scanner conservatively vetoes these named frame roots and members while
retaining the eligible no-reader property-renaming positive control. This is
only a recognized capability family, since arbitrary same-origin host markup
or runtime-injected objects cannot be fully inferred from the declared file
list.

Browser `PerformanceResourceTiming` exposes a separate source-length observation
without retrieving the source text: `performance.getEntriesByType('resource')`
can report same-origin ESM responses through `decodedBodySize`. In the
[real Chromium 37/42-byte differential](../im-results/resource-timing-esm-byte-size-observer-2026-11-21.md),
a locally renamed module retained its numeric result but changed its
ResourceTiming size. The bounded preflight now recognizes resource-entry
methods, size fields and conservative Performance aliases. An unrelated
`performance.now()` call retains the private-property renaming positive
control. This improves observed byte-size compatibility only; it cannot
authenticate a browser, hide source distribution, or prove semantic parity
under unknown host capabilities.

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

SCO: The obfuscation-controlled server can keep undistributed secrets and enforce authenticated operations. Requests for JavaScript can be replayed, and unlimited responses can be collected. Per-response mutation alone does not ensure secrecy. The SCO CLI now restricts the public file set to entry-reachable ESM modules plus explicit `--client` JavaScript and `--asset` data files. Files elsewhere in `--root` are withheld, including server-only JavaScript modules. Runtime `import()` edges are deliberately excluded from automatic publication, including literal specifiers: unreachable branches must not accidentally publish server-only modules. Non-module scripts, workers and runtime-loaded files likewise require deliberate `--client` declarations. Importing a privileged module from the client entry will expose that module by design. Programmatic `createScoHandler` requires the integrator to pass only public source files. Any `Host`/`Origin` check is an auxiliary signal, not identity authentication. The optional authenticated RPC service retains method implementation on the server, but black-box oracle attacks and timing overhead remain in scope. A [finite-domain authorized oracle experiment](../im-results/sco-authorized-oracle-extraction-2026-11-15.md) showed 256/256 output recovery with unlimited legitimate requests and no secret-key disclosure. A later [source-pinned real SCO HTTP quadratic study](../im-results/sco-quadratic-529-live-oracle-2026-11-21.md) showed that an authorized client with the precise two-rotation source-family grammar needed just **two** selected requests to infer private numeric parameters and exactly clone 1,028 held-out outputs after the service stopped. A distinct [full-entropy quadratic test](../im-results/sco-dense-quadratic-full-entropy-2026-11-21.md) embedded 529 independently random 32-bit coefficients in server-private ESM. A legitimate client recovered **all 529 coefficients** through 529 real authenticated RPC calls and matched 1,028 offline held-outs on both Ubuntu and Windows, despite the emitted client lacking the private source and the unauthorized request remaining forbidden. The 529-query exact-identification lower bound applies to the unrestricted 32-input/32-output degree-at-most-two family in a **value-only chosen-query model**, without timing or other side channels; the source-aware two-query result concerns a much smaller family. Full nonlinear output rank does not stop these attacks. Neither study proves a new authentication bypass, general code reconstruction, incremental strength over an equally trusted conventional private service, or universal 2.5× CPU compliance. After an authorized client learns an exact offline functional substitute, that substitute can execute with the SCO server shut down and independently of the original facade's host checks. This is a limitation of behavior-level execution locking through authorized query access; it does not mean the original server's authentication or host guard was bypassed. Require method-aware per-item authorization for batch calls, and consider oracle leakage even when every operation is authorized. Batch preflight checks initial permission state and cannot infer permission changes caused by earlier operations in the same batch. A state-changing batch must be rejected or checked against a complete, consistent sequential transition model; the optional `preflightScoBatchState` helper evaluates such a model but does not provide transaction isolation. Operational controls such as rate limits, monitoring, and durable authentication belong to the integrator. The project's declared SCO adversary can issue **unlimited legitimate requests**; treating a rate limit as defeating that adversary would silently change the threat model. Rate limits may mitigate production abuse but do not establish source-private functionality resistance under the unlimited-request assumption.

SNO: Under the stated attacker model the adversary owns code, filesystem, and process memory. A hash manifest inside a launcher cannot prevent code modification or bypass. A native Windows/Ubuntu reproduction in [the local-owner manifest attack](../im-results/sno-owner-self-hash-bypass-2026-11-15.md) changes the SNO entry, observes an integrity rejection, then recomputes the expected digest in the attacker-controlled launcher and executes the modified entry successfully. A [second pinned two-platform attack](../im-results/sno-runtime-preload-bypass-2026-11-16.md) uses an attacker-controlled Node loader prelude to change the launched program's result after hash verification while keeping the distributed launcher and entry file byte-identical. This shows a runtime-only interference channel separate from editing the on-disk manifest. For integrity, deploy a remote trust anchor or OS/TEE-backed attestation beyond this project's capabilities.

## Independently reviewed opaque public assets

The optional `reviewedOpaqueAssets` manifest provides a positive byte-identity
publication boundary for COO, SNO and SCO. An integrator supplies an array of
`{path,sha256}` records using exact, relative public asset paths and lowercase
SHA-256 digests of **separately reviewed input bytes**. For example, pass
`{reviewedOpaqueAssets:[{path:'theme.css',sha256:'<reviewed 64-hex digest>'}]}`
as the compiler's mode options or as the second argument to
`createScoHandler`. Every `sourceType:'asset'` file must match one entry,
and every entry must match one asset. Missing, extra, case-mismatched and
byte-changed assets are refused before output files or SCO routes are generated.

This is an explicit trust contract. A manifest computed from the same
unreviewed files immediately before calling the compiler proves nothing
about source confidentiality. Reviewers must approve the exact bytes and
protect the manifest/provenance upstream. Source-bearing content that a
reviewer knowingly approves remains publishable. It is not a signature,
anti-tamper protection against a COO client or SNO host owner, or a proof
about external dependencies or assets created by later deployment steps.
The public `assertReviewedOpaqueAssets(files,reviewedOpaqueAssets)` helper can
recheck output assets after compilation or later packaging. This second check
catches changed bytes after the compiler's initial preflight, provided the
publisher retains the independently approved manifest unchanged.
Recheck all actual deployed output files after bundling, compression and
delivery if claiming a complete publication boundary.

The compiler snapshots each incoming `Buffer` and code getter once before
preflight. A caller's later mutation of its original Buffer cannot rewrite
the already validated output. SCO handler startup already snapshots its
source buffers. The reviewed-asset option adds no emitted JavaScript runtime
instructions; it adds compile or SCO handler setup hashing work.

The reviewed-manifest checker now reads the initial **indexed** array inventory
and snapshots each entry's path and digest once. The public final-output
recheck uses indexed file records and one-read asset metadata, avoiding
caller-provided iterators and getter drift during validation. This remains a
build-time contract: publishing mutated files *after* verification invalidates
the evidence. An [exact pre-fix adversarial replay](../im-results/reviewed-opaque-manifest-snapshot-2026-11-18.md)
reproduced three historical bypasses and their refusal by the changed
checker on Ubuntu and Windows, with strict JSDoc and 17 regression tests.

The three CLI entrypoints accept `--reviewed-assets <manifest.json>` with an
independently prepared JSON array of the same records. The file must resolve
**outside** `--root`, preventing the COO/SNO recursive file scan from
inadvertently republishing the review manifest itself. COO and SNO validate
every copied asset; SCO validates the specifically selected public `--asset`
entries. The CLI reads the approval once at startup and passes it to the same
programmatic validator. This option is deliberately opt-in, and a publisher
must independently maintain its review and final deployment byte identity.
See `test/cli-reviewed-opaque-assets.test.js` for real COO/SNO subprocesses,
an actual SCO HTTP asset response, stale-hash refusals and bad manifest
preflight. A targeted Ubuntu/Windows test at
[commit `035a2db`](https://github.com/FlareZ123/obfs/commit/035a2dbf00e677d27c54864ffb036a29b913bc75)
passed all CLI and manifest tests and compiler typechecking
([run 44286470985](https://github.com/FlareZ123/obfs/actions/runs/44286470985));
its full external JSDoc gate was red from unrelated concurrently modified
`test/sco-selected-graph.test.js` and `test/sco-selected-handler.test.js`.
Do not call that run a complete green release gate.

See `test/reviewed-opaque-assets.test.js` and
`workplace/asset-publication-trust-contract-2026-11-17.md` for a
source-only encoded canary, manifest refusal, positive safe fixtures, and
the explicit review assumption.

## Source-map disclosure preflight

A source map can contain `sourcesContent` with the original untransformed JavaScript, along with original symbol names and source paths. All three programmatic modes now reject supplied assets whose filenames end in `.map` (case-insensitive), reject structurally recognized version-3 source-map JSON (including indexed maps renamed to `.json`, `.txt`, or arbitrary asset extensions), and reject actual `//#`, `//@`, or `/*#` `sourceMappingURL` comments in JavaScript before any transformation. They also reject assets with source-like suffixes (`.js`, `.mjs`, `.cjs`, `.jsx`, `.ts`, `.mts`, `.cts`, `.tsx`, `.vue`, `.svelte`, `.astro`, `.mdx`, `.coffee`, `.litcoffee`) when marked as opaque files; otherwise a transformed distribution could contain a direct copy of its original JavaScript or transpiler inputs. SCO's static-serving handler performs the same preflight, including assets explicitly selected by `--asset`. Remove source-map comments and exclude map sidecars in the source build before obfuscating. Refusal is intentional because copying the map would undermine the intended confidentiality, while silently removing runtime-loaded assets could alter behavior.

The published HTML asset preflight uses the pinned `parse5@7.3.0` HTML5 parser. It rejects inline `<script>` content, inline event-handler attributes, `iframe srcdoc`, `javascript:` links, executable `data:` URLs (including XHTML and common XML document media types), and executable URL targets of `meta http-equiv="refresh"` redirects. External `<script src>` URLs remain syntactically permitted, but those scripts must be transformed and distributed separately by the integrator. The parser also inspects CSS source-map comments inside HTML `<style>` elements, including those nested in `<template>`, with the same CSS comment-aware scanner as standalone stylesheets and SVG `<style>` elements. This refuses embedded inline base64 source maps before the HTML is published. A separate conservative guard now refuses `data:` URLs on HTML `<link rel="stylesheet">` elements, including tokenized `alternate stylesheet` forms and entity-decoded or ASCII-control-obscured schemes: such links can embed a second CSS document with a nested `sourceMappingURL` and unmodified `sourcesContent`, beyond the normal standalone `.css` scan. The [public-HTML-only extractor and previous-compiler comparison](../sims/html-data-stylesheet-attack.js) and [intermediate report](../im-results/html-data-stylesheet-source-leak-2026-11-17.md) document the narrow refusal and its remaining gaps. This intentionally declines benign inline data stylesheets; use separately audited CSS assets for accepted builds. CSS assets and inline HTML/SVG `<style>` content now also refuse embedded `data:` stylesheet `@import` URLs (quoted and `url()` forms, including escaped CSS scheme spellings and WHATWG ASCII tab/newline URL normalization). Such imports can contain an entire second stylesheet plus an original-source map. Ordinary relative or remote imports remain unchanged. See the [paired source-only CSS extractor](../sims/css-nested-data-import-attack.js) and [bounded report](../im-results/css-data-import-disclosure-2026-11-17.md). The asset scanner now uses pinned `css-tree@3.2.1` to distinguish actual import at-rules from inert `@import` tokens inside CSS custom-property declaration values. The [historical red control and Chromium grammar result](../im-results/css-rule-context-compatibility-2026-11-18.md) confirm a bounded reduction in false refusals while preserving recognized data import denial. This is compile-time asset validation, not a runtime anti-debugging or tamper-resistance claim. A further [CSS URL normalization regression](../im-results/css-leading-c0-data-import-2026-11-18.md) shows that decoded import URLs with a CSS-escaped leading ASCII C0 control (for example U+0001) are normalized to `data:` by WHATWG URL parsing. The data-import guard now strips leading U+0000–U+0020 after removing embedded ASCII tab/newline characters and refuses these imports. An artifact-only prepatch extractor and a raw Chromium CSS import control independently confirm the bounded source-publication leak; interior controls that do not normalize to a data scheme remain accepted. The parser never rewrites HTML bytes. It strictly decodes HTML assets as UTF-8 and refuses malformed byte sequences and NUL code units, including UTF-16-like padding that could disguise executable markup from a UTF-8 parser. An HTML page containing inline JavaScript or inline JSON inside a `<script>` block is deliberately refused rather than silently modified, because original program text could escape as an asset. The preflight also handles HTML character references and nested template content.

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

## Native host functions that implicitly expose source

Source-dependent behavior can arise without a syntactic `.stack`,
`.toString`, or `.name` read. In Node.js, `console.trace()` prints caller
frames, native Console formatting can print Error stacks and function
names, `util.getCallSites()` directly returns source locations, and
`process.emitWarning('literal')` exposes call sites under
`--trace-warnings`. Length-changing renaming ahead of such calls can alter
output even when values and exceptions are otherwise preserved.

The AST source-observation gate now conservatively refuses source
rewrites for directly recognized native console, Node util formatting,
caller-location and warning methods, including selected local detached
and bound aliases. For a recognized graph it can preserve *all* original
source bytes, leaving zero protected-work yield in that graph. This is a
compatibility safeguard, not evidence of resistance to debugging, source
reconstruction or tampering. Unmodeled opaque external observers and
indirect native method acquisition remain a risk; users requiring exact
host-observable source should independently test the actual deployment.

### Dynamic `with` scopes and source-exposing host getters

Non-strict CommonJS and browser classic scripts can introduce an opaque
`with (object)` environment. A host `Proxy` may shadow a generated
decoder identifier or a locally captured `Reflect.get` alias, changing
the runtime value of code that was previously considered safe to rewrite.
The same environment may expose source bytes of a **different**
function/class, outside the `with` statement, through an otherwise
unrecognizable property getter.

For this bounded case, the string encoder now preserves literals under
`WithStatement`, and preserves literals inside function/class source
ranges when any `WithStatement` occurs in the file. Unrelated primitive
literals outside those ranges can still be encoded. The captured
`Reflect.get` proof refuses a dynamic `with` environment. Source-exact
native/emitted witnesses were checked in Node on both operating systems
and in real Chromium in COO, SCO, and SNO. Details and red/green source
pins are in the [dynamic scope intermediate report](../im-results/with-scope-lexical-soundness-2026-11-18.md).

This is selective behavioral compatibility, **not** a guarantee that
an untrusted host cannot inspect entire source files or extract the
running program. Source-observation through arbitrary external APIs
remains outside the static proof.

The [native red-control and mode-matrix report](../im-results/implicit-source-three-mode-matrix-2026-11-17.md)
records deterministic 504 observer-refusal cases, 36 transformed
primitive-logging controls, and real native-versus-emitted multi-file ESM
execution. The [warning report](../im-results/node-process-warning-source-observation-2026-11-17.md)
records `--trace-warnings` behavior and the pinned regressions. The
[equal-width proposal](../im-results/fixed-width-source-coordinate-proposal-2026-11-17.md)
explores a future way to retain some protected work under *coordinate-only*
observations, and demonstrates why source-text readers still invalidate
that approach. No general coordinate-preserving compiler path has been
implemented or evaluated against an attacker.

## Performance

The CLI emits executable JavaScript using normal JS operations. String decoding incurs startup cost (especially in COO). Hot-loop string sites are excluded, but the 2.5x runtime requirement is empirical and workload-specific. `test/benchmark.js` samples arithmetic, property read/write, and string comparisons; it fails if any observed median exceeds 2.5x. This does not exhaust possible programs or timing distributions.

## Compatibility

Acorn parses standard stage-4 JavaScript, CommonJS and ESM. JSX, experimental syntax, non-JavaScript languages, unrecognized bundler conventions, native add-on binary changes, code that depends on function-toString source, and unmodeled reflection require other handling. Module specifiers and file paths are preserved. The output writing API uses cross-process lock files with atomic rename within the same filesystem. Paths reject traversal, Windows device names, unsafe Windows filename characters, and case-insensitive collisions. The multi-file directory is not a transactional snapshot.

### HTML, XHTML, and XML script integrity and executable public assets

An HTML, XHTML, or XML document can pin a local JavaScript response using
Subresource Integrity (SRI). A compiler transformation that changes that
script's bytes can cause a browser to reject it, even when the transformed
JavaScript would otherwise behave identically. The publication preflight
therefore preserves original JavaScript bytes when a declared local script
may be bound by SRI. This condition also refuses requested SCO wrappers
that would violate the published integrity commitment.

Declared `.html` and `.htm` assets are parsed with parse5 to recognize
script tags, modulepreload links, and script preloads. Declared `.xhtml`,
`.xht` and `.xml` assets use a namespace-aware SAXES XML parser to inspect
HTML- and SVG-namespace scripts, attributes and CDATA without conflating
unrelated XML data elements with executable source. The admission policy
rejects recognized inline executable source, including script bodies,
event handlers, executable data URLs, and executable script-bearing SVG
content. XML DTDs other than a simple `<!DOCTYPE html>` and XML stylesheet
processing instructions remain conservative refusals. Benign XML data
may remain byte-identical while associated JavaScript is transformed.

HTML import maps (`<script type="importmap">`) can attach an
`integrity` JSON map to imported ESM module URLs, including dependencies
without a directly integrity-annotated `<script src>` tag. The HTML asset
audit now admits only JSON import maps containing explicitly recognized
`imports`, `scopes`, and `integrity` fields, URL-like specifier names,
HTTP(S) or relative web module URLs, and SHA-256/384/512 metadata. Inline
`data:` and `javascript:` module mappings, raw JavaScript source in
specifier names, arbitrary inline JSON scripts, malformed metadata and
unsupported URL schemes are conservatively refused. Even with an ordinary
HTTP(S) or relative URL scheme, raw JavaScript punctuation in an import-map
URL path, query, or fragment causes refusal: that text otherwise discloses
untransformed source in the distributed HTML despite never executing. Normal
alphanumeric query and fragment labels remain accepted. Encoded script
source hidden in otherwise ordinary-looking URL text remains an unresolved
finite-audit boundary. A local or
original-digest-matched module integrity commitment preserves the original
module response bytes in COO/SNO/SCO, including SCO route-prefix aliases;
it may sacrifice otherwise valid obfuscation yield. XHTML import maps and
unreviewed deployment-time import-map rewriting are outside this bounded
HTML-only proof. The dedicated real Chromium
`test/html-importmap-integrity-browser.js` checks native, preserved and
byte-mutated counterfactual module loading.

For SRI, the compiler resolves document-relative URLs, query and fragment
decorations, escaped path characters, possible HTML `<base href>` candidates,
and a scoped XML `xml:base` where relevant. A configured SCO route prefix
is included in published file-path matching. It also compares possible
case- and Unicode-NFC-equivalent filename identities using the output tree's
existing portable path inventory policy. It also tests a Win32-style candidate
which strips terminal ASCII dots and spaces from each decoded URL path
segment. A Windows-backed static host may resolve several URL spellings to
one distributed file. This is a conservative compatibility assumption for
hosting arrangements that behave that way; no universal claim is made about
URL rewriting on Windows, proxy servers, or CDN infrastructure. These
possible aliases can preserve original JavaScript on hosts whose actual
routing distinguishes the names, which is an intentional correctness
preference when deployment semantics have not been supplied.

SCO publishes accepted `.xhtml` and `.xht` files as
`application/xhtml+xml; charset=utf-8` and `.xml` files as
`application/xml; charset=utf-8`. The browser tests separately exercise
`text/xml` execution. Positive-yield tests require unrelated SRI URLs
and ordinary XML data to leave useful transformations enabled.

A bounded additional admission guard recognizes a literal leading XML
declaration in public assets with otherwise unrecognized file extensions.
It applies both XML namespace-aware and HTML source checks to such files,
including local script SRI pinning; named `.svg` assets retain their dedicated
SVG parser and diagnostics. All three COO/SNO/SCO modes have cross-platform
regressions covering `#`, percent-encoded, plus and Unicode path segments
([PR #255](https://github.com/FlareZ123/obfs/pull/255);
[final Linux and Windows validation](https://github.com/FlareZ123/obfs/actions/runs/44979568762)).
This signature is optional in valid XML and cannot establish the eventual
HTTP MIME type. The independently [observed prolog-less XML browser
counterexample](../im-results/undeclared-xml-mime-extension-witness-2026-11-22.md)
and [opaque executable JavaScript MIME counterexample](../im-results/opaque-javascript-mime-source-witness-2026-11-22.md)
remain valid, so this change does not justify source-secrecy claims.

These guards use the explicitly declared file inventory and known resource
pathnames. They do not establish arbitrary proxy routing, undecorated
cross-origin URL equivalence, dynamically inserted integrity attributes,
content served under an unrecognized extension or MIME type, or complete
protection from source disclosure. They preserve observable browser
compatibility and do not establish authorized-environment enforcement or
a quantified attacker reconstruction cost.

Supporting reproducibility: [HTML/SRI study](../im-results/html-sri-public-script-compatibility-2026-11-22.md),
[namespace-aware XHTML and direct XML source regression](https://github.com/FlareZ123/obfs/pull/248),
[portable URL alias browser regression](https://github.com/FlareZ123/obfs/pull/247),
and [Win32-style trailing-dot and space alias regression](https://github.com/FlareZ123/obfs/pull/249).

## SNO ambient package and external dependency resolution

Node resolves the format of `.js` files using the nearest package metadata; package `imports` and named self-reference `exports` also depend on location. The SNO CLI's conservative build-time package-context preflight checks declared inputs and actual output parents and refuses unsupported inherited metadata before publishing bytes. It retains explicit packaged metadata, and the output check participates in the cooperating publication lock. The [source-pinned SNO package-scope evidence](../im-results/sno-ambient-output-package-scope-2026-11-22.md) includes accepted controls and refusal tests on Node 22 Linux and Windows.

The current preflight does not inspect or pin ordinary bare-name dependencies in `node_modules`. The [real Node 22 two-platform regression](../test/sno-external-bare-module-resolution.test.js) demonstrates a native result of 116 versus a generated result of 120 when a relocated program resolves different external package bytes; a shared-ancestor positive control returns 116 in both cases. Reusing the same package name does not imply equivalent dependencies. Deployment must separately review and freeze the dependency tree and Node resolution options. These checks remain compatibility and packaging diagnostics; the SNO threat model gives the attacker full filesystem and runtime control. Local hashes cannot enforce hostile-owner integrity or source secrecy.

### Optional literal CommonJS bare dependency resolution comparison

The opt-in SNO `--audit-bare-cjs` flag uses Node's actual CommonJS
`createRequire(filename).resolve(specifier)` for each directly
recognized string-literal `require('bare-package')` in original and
generated input files. The resolver comparison occurs during the
exclusive build lock before publishing any output file. Missing or
different targets cause an explicit compiler refusal. A shared target
leaves generated bytes identical with or without the audit. The
[finite two-platform proof program](../im-results/sno-direct-bare-resolution-audit-2026-11-22.md)
documents direct-call scope and a matched adverse example: an external
package's `module.parent.filename` differs across source and output
locations even though `require.resolve` selects **the same package
file**. Therefore passing the audit is only evidence about that
specific resolution-path condition, not whole-program package parity.

The audit declines direct require calls governed by a `package.json`
that the compiler has not published yet, since Node cannot resolve a
future package scope soundly before publication. Opaque or asset-marked
`.js`/`.cjs` source files cannot be statically audited and are refused. It refuses known lexical `require` aliases and dynamic direct
specifiers, while independently constructed require functions,
reflective indirections and ESM
imports, runtime loader hooks and dependencies modified after compile.
No runtime checks are emitted and this optional compiler check cannot
prevent an attacker with SNO filesystem/runtime/memory access from
modifying a library after publication. Build against the final
deployment tree and independently pin external dependencies whenever
source integrity matters.
