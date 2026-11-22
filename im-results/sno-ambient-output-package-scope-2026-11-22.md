# SNO input/output package-scope parity and conservative build refusal

**22 November 2026. Classification: source-pinned packaging compatibility
finding.** This report does not establish an obfuscation-security result
or remove the repository's RELEASE-BLOCKED decision.

## Mechanism and reproducible counterexample

Node 22 determines the module format of a `.js` file using its nearest
`package.json`, searching ancestors until the volume root or a
`node_modules` boundary. The `.cjs` and `.mjs` extensions specify their
format independently. See the [official Node 22 package rules](https://nodejs.org/download/release/latest-jod/docs/api/packages.html).

The compiler initially classified `.js` using metadata **inside** its
declared input group. An emitted CommonJS `entry.js` could inherit
`{"type":"module"}` from a parent of the output root, changing the runtime
format even when the source and SHA-256 manifest bytes were identical.
A local Node 22.16.0 independent reproduction used `source/entry.js`
containing `module.exports=23;`; the original CommonJS `require()`
returned 23. The exact same text placed under
`host/package.json` with `{"type":"module"}` failed with
`ReferenceError: module is not defined`.

The reverse mismatch is also real: an original input tree can inherit
an external ESM package without the compiler seeing that file. An
untracked `package.json` inside a reused output tree can override a
packaged scope on either side, including a stale CommonJS package
inside an intended ESM tree. A Node 22.16.0 local control confirmed that
an external `{"type":null}` and non-object JSON package metadata cause
`ERR_INVALID_PACKAGE_CONFIG`; treating these as ordinary CommonJS
metadata would silently change a native failure into a successful build.

## Implementation boundary

`src/cli.js` now calls `assertSnoPackageScope` against the input source
before compiling SNO. During output publication, the same check runs
under the existing cooperating directory lock, after output-path
preflight and before any emitted file is written.

The check compares each `.js` source type against any **non-emitted**
package metadata on the effective filesystem path. It resolves the
nearest existing real ancestor of the root, examines nested directories
for pre-existing metadata, respects the `node_modules` boundary,
and stops at a `package.json` the current build will itself emit.
An external ESM/CommonJS mismatch or invalid package shape/type causes
an explicit refusal. The check does not add hidden package files or
rewrite application source, which could expose unapproved metadata
to source readers.

The scope check is intentionally confined to the **CLI build location**.
The pathless programmatic `createSnoLauncher(files,entry)` cannot
perform deployment-directory admission. This is a static preflight
for cooperative build environments, with no claim of defeating an
uncooperative writer, loader interceptor or filesystem owner.

## Executable regression matrix

`test/sno-ambient-package-scope.test.js` contains **16 focused tests**, including
15 targeted scenarios and a 27-cell native-versus-generated Node package
placement matrix. The negative paths assert build rejection
before any protected source is published; positive paths execute the
actual generated SNO entry in a separate Node process.

| Class | Cases and expected result |
| --- | --- |
| External output ESM | Unscoped CommonJS `.js` refuses; explicit root and nested CommonJS packages succeed; `.cjs`-only output succeeds |
| Node boundary | `.js` under `node_modules` ignores the outside ESM ancestor; symlinked output resolves its real neutral destination and succeeds |
| Multi-file graph | A `.cjs` launcher with an unscoped CommonJS `.js` dependency under external ESM refuses |
| Reused output | Stale nested ESM overrides unscoped CommonJS and refuses; stale nested CommonJS consistent with source succeeds; stale nested CommonJS overriding an emitted ESM package refuses |
| Input environment | Unscoped source `.js` under an external ESM package refuses; the external CommonJS equivalent is admitted and executes with native parity |
| Invalid packages | External output `{"type":null}` and external input non-object metadata both refuse |
| Byte identity | Matched seeded outputs under no external package and an external CommonJS package are byte-for-byte identical, including `entry.js` and `sno-entry.cjs`, and both run with result 97 |
| Exhaustive placement matrix | Root input package type × output ancestor type × stale nested output type, each chosen from absent/CommonJS/ESM: all 27 original-versus-generated cases completed, with 17 admitted/native-matching builds and 10 expected refusals |

## External package-resolution red/green extension

The `.cjs` and `.mjs` extensions fix module format but do **not**
isolate a file from external Node `package.json` resolution contracts.
Two separate real Node 22.23.4 Windows/Ubuntu counterexamples were
produced on the then-current main baseline, with independently
executed native and generated SNO sources:

- **Private package alias:** The unbundled input host declared
  `{"imports":{"#target":"./source/target.cjs"}}` and the output host
  declared `{"imports":{"#target":"./foreign.cjs"}}`. The unmodified
  native `require('#target')` returned **103** while generated SNO
  returned **107**. The included-package control returned **103** in
  both arms. Original source commit
  `c1c8b659a04b02e2570b6464fa6ba04f7f905710`, both-OS
  [red run 45025118109](https://github.com/FlareZ123/obfs/actions/runs/45025118109).
- **Named self-reference:** The input host package
  `{"name":"scope-pkg","exports":{"./value":"./source/value.cjs"}}`
  and output host mapped the same package specifier to
  `./foreign.cjs`. Native `require('scope-pkg/value')` returned
  **137** and generated SNO returned **139**. A packaged
  `name`/`exports` control returned **137** in both arms. Original
  source commit `26f736611a04641b76fb67f224202e391ec84ccc`,
  both-OS [red run 45025620272](https://github.com/FlareZ123/obfs/actions/runs/45025620272).

For these finite classes, the SNO CLI now extends
`assertSnoPackageScope` to executable `.js`, `.cjs`, and `.mjs`
inputs and outputs. An external `package.json` containing an own
`"imports"` field, or both a valid named package and an own `"exports"`
field, causes a **build-time refusal** before executable output is
published. The current build can safely include a `package.json`
inside its declared input inventory; its explicit mappings are then
emitted with the code. No source rewrite is needed.

- [Five-case focused imports gate 45025545478](https://github.com/FlareZ123/obfs/actions/runs/45025545478)
  at `bac633570dccaa20d76965cf1c2b2548ae81abc6` passed
  both OSes, including positive included-package `#target`,
  negative external source, external output and stale nested output,
  plus a mixed CommonJS/ESM dependency case.
- [Four-case focused named exports gate 45025723893](https://github.com/FlareZ123/obfs/actions/runs/45025723893)
  at `ed9fc0a3224cd51f25ab697e3a5d57fec62c987f` passed
  both OSes, including packaged self-reference, external source/output
  refusal, and a compatible `exports`-without-`name` control.
- Each green focused run also completed the strict in-repository and
  external JSDoc typechecks on Ubuntu and Windows.

These checks deliberately reject even a source that never uses a
potentially reachable external mapping. They are a conservative
admission contract, rather than static proof of every dynamic Node
module resolution. A custom loader, later change to external metadata,
or an uncaptured third-party dependency remains outside this contract.

## Validation and source pins

The [16-test focused gate 45024526818](https://github.com/FlareZ123/obfs/actions/runs/45024526818)
at source `30eea73aa6ef3b223bcc33cc560937888e26b46b`
passed on both Ubuntu and Windows Node 22.23.4, including the 27-cell
native/generated matrix and both JSDoc typecheck steps. One preceding
[matrix run 45024388982](https://github.com/FlareZ123/obfs/actions/runs/45024388982)
failed for an **independently identified test-oracle error**: an
`--eval` wrapper supplied a global `module` binding, so using
`typeof module` to classify ESM falsely reported CommonJS. The
corrected oracle observes lexical top-level `this`, and the entire
matrix then passed on both operating systems. This red run is retained
to keep the oracle correction auditable.

The [15-case focused gate 45024087840](https://github.com/FlareZ123/obfs/actions/runs/45024087840),
source `bf420229bb4e56fd926587f8083e55813a1a0987`,
passed on **Ubuntu and Windows Node 22.23.4**, including both strict
project and external JSDoc typecheck gates. Its executable implementation
is pinned from `dd465a0870599383ea637a7030a6366943473bd8`;
the later test commit adds only the matched emitted-byte control.

The earlier [14-case focused run 45023994969](https://github.com/FlareZ123/obfs/actions/runs/45023994969)
also passed on both operating systems at `dd465a0870599383ea637a7030a6366943473bd8`.
The [full repository integration run 45024226049](https://github.com/FlareZ123/obfs/actions/runs/45024226049)
passed **both Ubuntu and Windows** at frozen source
`dfda4d67a6a59c356c987be601725064f94cb82e`, including the
refined nested/input package implementation, behavioral suites,
strict project/external JSDoc and the configured workload/browser
checks. That full integration source predates the later external
`imports` and named self-reference guards, so a fresh full run is
required before claiming integration coverage of those guards.
The earlier [full run 45022860316](https://github.com/FlareZ123/obfs/actions/runs/45022860316)
also passed both platforms at older source
`838a48462d563ac8a1e6168e9a4b31ee87ab00dc`;
it is historical coverage rather than the refined implementation pin.

## Constraints and release meaning

This package preflight checks **module format and external package
metadata admission**, including the identified external `"imports"`
and named `"exports"` self-reference counterexamples. It does not
prove arbitrary Node dependency graph closure, full functionality
equivalence across loaders, or same-package dependency resolution when
packages are deliberately modified after obfuscation. External bare
package dependencies from `node_modules` and application-specific
loader hooks require an independent integrator review. The red/green
cases above establish bounded refusal against two real mis-resolutions,
with a packaged-metadata positive control.

The check assumes default Node symlink realpath resolution. A distinct
Node 22.16.0 native reproduction loaded the same CommonJS `.js` file
through a symlink whose lexical ancestor was ESM: default Node returned
79, whereas `node --preserve-symlinks` failed. The flag is documented
by [Node's CLI reference](https://nodejs.org/download/release/latest-jod/docs/api/cli.html).
Therefore environments using this flag or custom loaders require
separate source/deployment parity validation.

The proof envelope is a finite build-time test suite, not a general
theorem for arbitrary JavaScript. External package metadata can still
change after the check, and a distribution can be relocated to a
different package tree. Build into a clean directory and revalidate
the final deployment location. The compiler accepts some deliberately
unsupported source/dependency forms only under separate integration
contracts; this package check does not replace those contracts.

The admitted output-byte control supports **zero emitted-source delta
for the selected compatible pair**. The preflight executes only while
building and does not add runtime operations; the 2.5× repeated
execution budget is unchanged by this check in that pair. No new
general overhead bound, source secrecy advantage, tamper resistance,
or adversarial cost advantage was demonstrated.

The existing SNO filesystem-owner and in-memory loader attacks remain
effective under the declared threat model. The strong-protection
release decision remains **RELEASE-BLOCKED**.
