# SNO runtime package-scope preflight after relocation

**22 November 2026. Classification: experimental compatibility safeguard.**
This is an intermediate implementation and test program, with no claim of
obfuscation secrecy, hostile-filesystem tamper prevention, or universal 2.5×
runtime compliance. Strong-protection release remains **RELEASE-BLOCKED**.

## Problem and original evidence

The compiler's build-time SNO package-context admission is location-specific.
A generated distribution can be moved under a different ancestor
`package.json`, or executed through an alternate symlink-resolution mode.
The ordinary SNO SHA-256 manifest still verifies its own emitted bytes while
Node decides a different .js module format at execution time. The original
[build-time package-scope finding](sno-ambient-output-package-scope-2026-11-22.md)
explicitly left relocation and nondefault loader flags unresolved.

The independent source-pinned
[bare external resolution regression](../test/sno-external-bare-module-resolution.test.js)
also confirms that dynamic `node_modules` provenance is outside the manifest:
native 116 versus generated 120 with deliberately distinct external packages
and 116/116 with a shared parent. This separate failure is not repaired by
the proposed runtime module-scope check.

Node documents `--preserve-symlinks` as retaining symlink paths for module
resolution, unlike the default realpath behavior. A local Node 22.16.0
scratch reproduction loaded the same `module.exports=314` through a
symlink located under `{"type":"module"}`: default loader returned 314;
`--preserve-symlinks` returned an ESM namespace `{}` from an otherwise
unaltered launcher. See
[Node 22 CLI documentation](https://nodejs.org/download/release/v22.23.3/docs/api/cli.html#--preserve-symlinks).

## Candidate mechanism

The candidate changes `createSnoLauncher` in
`agent45/sno-runtime-module-scope-20261122`:

1. Snapshot an explicitly supplied `sourceType` together with each
   path and content record. No property is reread after caller getters.
2. Verify the existing emitted-file SHA-256 manifest before environment
   preflight.
3. For every declared JavaScript `.js` source, obtain the nested file path through Node's native
   `require.resolve()` and then walk its ancestor package metadata.
   Resolution must follow the effective nested-loader symlink mode rather
   than the launcher's `__dirname` alone. Refuse a CommonJS-versus-ESM package type mismatch.
   `sourceType: 'module'` without an included package scope is conservatively
   excluded because Node can syntax-detect typeless modules.
4. Keep direct `createSnoLauncher` calls without `sourceType` metadata
   backward-compatible and without an emitted scope check.

The test `test/sno-runtime-package-scope.test.js` covers a built and
later relocated CommonJS entry, an explicitly packaged ESM dependency
positive control, direct API no-metadata output, and symlink-preserving
runtime refusal. Additional controls explicitly distinguish
`--preserve-symlinks-main` alone from the combination of both
symlink-preservation flags. All tests await actual native Node execution; they check
that the manifest has not changed and that a mismatch is refused before
application exports become visible.

## Evidence status

Candidate source and tests are committed to the research branch. A syntax
compilation check of `src/sno.js` passed in an isolated V8 runtime.
**No cross-platform CI verdict is asserted here yet.** Record exact
immutable SHA, Ubuntu/Windows focused run, strict JSDoc result and full
integration verdict before proposing integration to main.


### Loader-flag false positive and correction

An initial candidate used `path.join(__dirname,file)` directly when
examining the nearest package metadata. In a native Node 22.16.0 control,
executing the launcher as the main module with
`--preserve-symlinks-main` retains the launcher's alias `__dirname`,
yet ordinary nested `require('./entry.js')` still resolves the **actual**
file realpath. That initial check would spuriously refuse a valid
CommonJS execution merely because an ESM package file was located above
the lexical alias.

With both `--preserve-symlinks` and `--preserve-symlinks-main`, the
nested file itself retains the alias and Node actually sees the external
ESM package. The revised candidate inspects
`path.dirname(require.resolve(path.join(__dirname,file)))`, explicitly
matching the real path selected for native nested CommonJS resolution
in these controls. A minimal isolated V8 virtual-filesystem simulation
of the generated launcher accepted 314 under the actual CommonJS
directory and refused the same hashed entry under the ESM host parent.
A byte-exact comparison of generated launchers without sourceType
metadata found **identical output** before and after this candidate,
with an added 652 source bytes for one explicitly declared .js file.
These are bounded simulations and local Node controls. Cross-platform
tests still have final authority before integration.

## Limits and risks

The check observes package `type`, not all external package `imports`
or `exports`, arbitrary third-party bare module resolution, loader hooks,
custom conditions, runtime injection or Node flags such as
`--experimental-default-type`. Files without declared `sourceType`
remain outside the new admission. It is a runtime best-effort diagnostic;
a full-control SNO owner can modify both launcher and metadata. Since the
check happens once during initialization, its ongoing repeated hot-work
cost is zero in the selected design, while its startup disk-read cost
requires a separate measurement. Compatibility positives must retain
native behavior and generated work must actually execute. The existing
integrity-bypass and owner-extraction attacks continue to apply.
