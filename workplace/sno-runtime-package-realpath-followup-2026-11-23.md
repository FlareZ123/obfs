# Research proposal: side-effect-aware SNO runtime package-context admission

**23 November 2026. Status: unverified hypothesis and test plan.**
**Maintainer:** Agent 45. This document is not an implementation, security
result, release proof or claim of full JavaScript observational parity.

## Why investigate this approach?

The source-pinned
[rejected runtime-scope candidate](../im-results/sno-runtime-package-scope-2026-11-22.md)
would use eager `require.resolve(path.join(__dirname, relativeJavaScriptFile))`
before requiring the SNO entry. It correctly diagnosed the tested
symlink/module-scope mismatches but inserted entries into Node's
JavaScript-visible `Module._pathCache` before the application ran.
The native-vs-guarded negative test
[`test/sno-runtime-scope-pathcache-negative.test.js`](../test/sno-runtime-scope-pathcache-negative.test.js)
returned `false` versus `true` and passed Ubuntu/Windows
[run 45083818287](https://github.com/FlareZ123/obfs/actions/runs/45083818287).
This direct 1:1 behavior violation disqualifies the proposed default
guard despite intended-case passes
[45084008608](https://github.com/FlareZ123/obfs/actions/runs/45084008608).

## Bounded alternative worth falsifying

For a **statically known, emitted, literal relative `.js` file path**
that will be loaded by ordinary Node CJS `require`, the native loader
ordinarily canonicalizes the requested filename before selecting its
nearest package `type`. One candidate is to inspect that path with
`fs.realpathSync` in the SNO launcher, rather than calling
`require.resolve`. The candidate could distinguish a canonical nested
path under default symlink treatment from a lexical nested path under
effective `--preserve-symlinks`.

This is merely a mechanism hypothesis. No proof has established that
`fs.realpathSync` has zero other application-observable state,
that the loader's realpath treatment is reproduced under all flags
and hooks, or that a check performed before the first user module is
semantically invisible. Native Node's effective flags may originate
from `NODE_OPTIONS`; relying on naive `process.execArgv` parsing can
miss them. Custom loaders, preload hooks and filesystem races may
invalidate a simple path calculation.

## Minimal acceptance/rejection program

1. Keep the existing `Module._pathCache` observer test and add
   `require.cache`, `require.extensions`, and same-process
   `process.moduleLoadList` observer controls. Test the source and
   emitted executable in **fresh native Node 22 processes**.
2. Use the real source/output package fixtures from
   [`test/sno-runtime-package-scope.test.js`](../test/sno-runtime-package-scope.test.js):
   normal realpath CJS positive, relocated under ESM negative,
   embedded nested ESM metadata positive, and a symlink with
   `--preserve-symlinks`, `--preserve-symlinks-main` separately and together.
   Include `NODE_OPTIONS` flag propagation and a preloaded loader hook.
3. Instrument `fs.realpathSync` and package `fs.readFileSync` from a
   `--require` preload to observe whether a protected launcher can alter
   externally visible counts/order before application startup. If the
   protected or embedding application can observe a difference in an
   allowed execution environment, label it a **compatibility rejection**.
   Do not normalize away observer differences merely to make tests pass.
4. Keep the runtime diagnostic optional initially; compare emitted
   bytes and repeated hot-work performance independently. Treat added
   initialization reads under SNO's explicitly exempt initialization
   policy. Avoid changing default COO or SCO client behavior.
5. Check Node official docs and Node's actual resolver implementation
   for the tested version before making claims about realpath handling,
   package-boundary resolution or effective flags. Preserve exact
   Node/version, host OS, seeds, source SHA, all stdout/stderr and
   the negative fixtures.

A zero-difference result on this finite matrix could justify further
experimentation. It would still leave unknown loader hooks, attacker
control of filesystem/runtime/memory, and unauthorized modification
unresolved. The mainline **build-time-only** `assertSnoPackageScope`
is already accepted at `5f43afc`, with successful source-pinned
full CI [45082616910](https://github.com/FlareZ123/obfs/actions/runs/45082616910).
The separate opt-in prepublication `--audit-bare-cjs` at `eaadc0a`
is also source-pinned full green
[45086267550](https://github.com/FlareZ123/obfs/actions/runs/45086267550).
**Do not replace either accepted mechanism with this unverified idea.**

Strong-protection release status: **RELEASE-BLOCKED**.
