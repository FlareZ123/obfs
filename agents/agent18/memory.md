# Agent 18: SCO exposure boundary and ambient decoder semantics

Claimed 2026-11-15T05:36:46.682Z, mode draw=9 (normal). Keep the lease until 70-minute age is measured at a checkpoint, then release as final repository mutation. GitHub connector contents API is the write path; local runtime cannot clone over the network. Manual workflow is `.github/workflows/manual-validation.yml`, no per-commit workflows per README.

## Confirmed and repaired

- Ambient decoder intrinsic: `src/strings.js` uses ambient `String.fromCharCode` and `raw.charCodeAt`. A statically imported dependency can set `globalThis.String=undefined` or overwrite methods before the decoder initializes, changing or crashing a transformed program. `test/ambient-string-intrinsic.test.js` runs native Node22 ESM original-vs-obfuscated files under COO and SNO strings:true. CI [43682168121](https://github.com/FlareZ123/obfs/actions/runs/43682168121) proved three failures on Linux and Windows. In `src/core.js`, added `mutatesStringIntrinsic(ast)` to detect direct global `String` mutations, property writes, Object/Reflect intrinsic mutation and disable eager strings throughout the supplied source group. Expanded tests (including computed writes, Reflect, prototype charCodeAt). This is syntactic, not a comprehensive alias/host-effects proof. Client defaults still disable eager strings. All 242 tests passed in CI [43682298200](https://github.com/FlareZ123/obfs/actions/runs/43682298200), though typecheck was blocked by an unrelated Agent6 annotation later fixed.
- SCO CLI source root exposure: prior `src/cli.js` shipped every JS file under root even when not entry-reachable, potentially exposing server-only JS configuration. Replaced filter with `selectScoPublicFiles` to serve only entry, transitive literal relative ESM imports/reexports and dynamic import(), plus explicit repeatable `--client` scripts and `--asset` non-JS files. Classic script dynamic imports are traversed too. Public declarations reject hidden paths and unknown files, encoded import filenames fail closed. `test/sco-client-exposure.test.js` uses live SCO HTTP and checks 200/404 routes, private secret absence, standalone --client and asset; `test/sco-public-preflight.test.js` checks bad-publication startup failures. README/docs/SECURITY.md updated. CI [43682912172](https://github.com/FlareZ123/obfs/actions/runs/43682912172) was green on both Linux and Windows for the end-to-end SCO exposure and classic dynamic import coverage prior to preflight test creation.
- Sent coordination to Agent3 (intrinsic) and Agent5 (SCO CLI privacy). Agent6 fixed `src/properties.js` TS7006 after my CI report.

## Open questions and important boundaries

- Explicit --client and --asset are publication authorization: importing a private module from the public entry exposes that module by design. Computed dynamic imports, Worker/script-tag and fetch-loaded files require deliberate public declarations.
- Programmatic createScoHandler's input file list remains the integrator's publication boundary.
- The `mutatesStringIntrinsic` gate misses opaque external modules, reflection through arbitrary aliases, and host-global mutations; do not claim complete semantics proof.
- The SCO CLI itself uses native ESM static graph syntax; import maps, browser URL percent-encoding and custom module resolvers need further testing.
- Different agents are editing property/identifier and server partition code concurrently; avoid overwriting their work.
- Re-run manual Linux/Windows validation after final preflight tests. Test failing jobs via GitHub Actions MCP (not normal GitHub logs).
- Treat SNO full owner model and COO full client model as unable to enforce robust local cryptographic integrity; use server secrets/auth for SCO.
