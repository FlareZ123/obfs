# SNO direct bare CommonJS resolution audit, opt-in candidate

**22 November 2026. Classification: intermediate semantic compatibility
mechanism.** This report is independent of the build-time package-scope
admission already integrated on `main`, and of the experimental runtime
package-scope guard rejected after a visible Module._pathCache side effect.

## Reproduced failure

The already merged
[`test/sno-external-bare-module-resolution.test.js`](../test/sno-external-bare-module-resolution.test.js)
proves that an unchanged SNO CommonJS script can resolve a different
external `node_modules` package after publication. A source package
returns 103 and an output package returns 107; with the same local
`+13` computation, native Node returns **116** and generated SNO
returns **120**, despite unchanged emitted SHA-256 manifest bytes.
A shared-ancestor package positive returns **116** in both.
[Ubuntu/Windows focused CI 45082266763](https://github.com/FlareZ123/obfs/actions/runs/45082266763)
establishes that original counterexample.

This is a source/output dependency provenance problem, separate from
`package.json` `type`, `imports` and self-reference `exports`
scope drift handled by the current
[`assertSnoPackageScope`](../src/cli.js).

## Proposed opt-in compiler preflight

The candidate branch `agent45/sno-static-bare-resolution-20261122`
adds `--audit-bare-cjs` as an optional SNO-only build flag.
It does **not** change default builds or emitted JavaScript. During
the existing exclusive output-directory publication lock, before any
output file is written, the compiler:

1. Parses original and generated CommonJS files and collects direct,
   string-literal `require('bare-package')` sites. It ignores native
   builtins, path-relative specifiers and `#imports` (the latter is
   separately controlled by package-scope admission). Named shadowing, visible lexical aliases, direct dynamic specifiers
   and direct-eval/with scope hazards are refused conservatively using
   declared-binding and AST position analysis. More indirect resolver
   constructions remain outside this finite scanner. Opaque or asset-
   marked JavaScript files are refused as unverifiable, including
   upper-case `.JS` and `.CJS` extensions that Node may execute.
2. Requires the set of direct bare calls to be identical before and after
   obfuscation, rejecting a generated call introduced or changed by
   any selected experimental backend.
3. Resolves source and intended output file directories against the
   nearest existing canonical ancestor. It calls Node's
   `module.createRequire(filename).resolve(specifier)` for each site.
4. Refuses direct calls beneath any `package.json` that this build will
   emit. Node cannot use this as-yet-unwritten package metadata during
   prepublication resolver checks, including future named self-references.
5. Refuses missing packages or differing absolute resolution targets
   before publication. It permits actual same-file shared dependencies;
   byte-for-byte copies in different directories are conservatively
   refused because their module-relative paths and behavior can differ.

The native API is documented in [Node 22 CommonJS resolution](https://nodejs.org/download/release/latest-jod/docs/api/modules.html)
and [Node 22 module API](https://nodejs.org/download/release/v22.23.3/docs/api/module.html).
No application module is *executed* during this audit. The compiler
process's own resolver cache may change, but the application executes in
an independently started Node process, so the runtime cache-observer
counterexample to the earlier proposed SNO launcher check does not apply.

The candidate test
[`test/sno-static-bare-resolution-audit.test.js`](../test/sno-static-bare-resolution-audit.test.js)
covers the mismatch refusal, shared external parent byte-identical
emitted output, missing output package refusal, primitive builtin/path
exclusion, lexical `require` shadowing and COO/SCO flag refusal.
The final conservative scanner, future-package refusal and tests
passed the **Ubuntu and Windows** focused suite and strict project/external
JSDoc gates at source
[`15bf54c3fa292e43e518bf83b13e21e709ae423d`](https://github.com/FlareZ123/obfs/commit/15bf54c3fa292e43e518bf83b13e21e709ae423d),
[run 45085286967](https://github.com/FlareZ123/obfs/actions/runs/45085286967).
An earlier version of this opt-in mechanism at
[`c0347e70690812b20cb56a69f80597891c26d773`](https://github.com/FlareZ123/obfs/commit/c0347e70690812b20cb56a69f80597891c26d773)
passed the **full** Ubuntu and Windows behavioral/adversarial, configured
browser and performance integration workflow
[45084516422](https://github.com/FlareZ123/obfs/actions/runs/45084516422).
Later changes only tighten the optional scanner and its negative
cases; the full CI is **historical coverage**, not an exact full
integration verdict for the current source.

### Parent-module identity remains observable

A newly added same-path negative control uses a third-party package
whose source reads `module.parent.filename`. Both native and
generated CommonJS entries resolve **exactly the same package file**.
The audit therefore accepts their resolution, but native execution
returns `source` and the generated distribution returns `out`
because the application's entry directory changed. This explicitly
demonstrates that path-equality admission is *insufficient* to guarantee
arbitrary downstream package semantics. It is a useful bounded
preflight, with a known counterexample to whole-program equivalence.
The additional test is in
[`test/sno-static-bare-resolution-audit.test.js`](../test/sno-static-bare-resolution-audit.test.js).

## Scope and limits

The finite static scanner examines **direct, literal CommonJS calls**.
It does not certify `module.require`, aliases, `createRequire`,
ESM static/dynamic imports, nonliteral or reflective specifiers, custom
loaders, nondefault flags, environment-dependent `NODE_PATH`, remote
dependency mutation after build, or application-owned packages that
observe their invoking file's dynamic call stack. No new client/server
authorization enforcement is implied. A matched resolved path is a
narrow admission signal that does not prove whole-program semantic
equivalence, source secrecy, or resistance to a hostile SNO owner.

The opt-in flag affects compilation time only and produces no runtime
operations. The original SNO bootstrap and manifest remain unchanged.
Successful positive cases should compare exact emitted bytes against a
same-seed build with the option disabled. Source and output trees must
be placed at their final build-time paths and frozen as far as possible.
A later deployment move or package upgrade demands a fresh audit.

Strong obfuscator release remains **RELEASE-BLOCKED** and the
three-mode 2.5× and adversarial evaluations remain independent.
