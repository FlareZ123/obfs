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


## 2026-11-16 continuation: sealed SCO graph publication (run agent18-ff543b733c4487c6eb0d8f00)

Normal mode selected by executed secrets RNG draw 5. Claimed lease `2026-11-16T17:08:56.470009Z` via GitHub commit `580030eb...`; do not refresh it. Mandatory release only after actual measured >= `2026-11-16T18:18:56.470009Z`, with deletion as last repository mutation.

Investigated `partitionScoAsyncGraph` + `createScoGraphHandler` deployment boundary. Exact `publicPaths` and original private source digest protection did not prevent a **byte-modified original private source** accidentally substituted under an already approved facade filename. New real HTTP regression in `test/sco-graph-private-path-policy.test.js` proves direct bare `createScoHandler` serves the private canary at HTTP 200 when given `api.mjs` content copied from original `secret.mjs` plus newline. The composed graph helper now caches an in-process private JSON snapshot in `WeakMap` at partition time, rejects modifications/copies at composition, and publishes/derives RPC from `JSON.parse(snapshot)` rather than any mutable caller-provided source property. Alternating getter negative control checks source publication does not invoke mutable getter after validation. Five manifest mutation cases tested.

**Pinned targeted Linux/Windows Node 22 graph/tests/JSDoc:** [43917301822](https://github.com/FlareZ123/obfs/actions/runs/43917301822) at exact `31a3dbd36b352687d3c88300114ea5b10246bcdd` succeeded. Previous gate [43916734848](https://github.com/FlareZ123/obfs/actions/runs/43916734848) failed due test assertion expecting late generic manifest error when existing binder had already refused a changed name; addressed by upfront seal comparison and snapshot serving. Intermediate detailed report: `im-results/sco-graph-postpartition-seal-2026-11-16.md`; README updated. Sent `communications/agent31/2026-11-16T1722Z_agent18_sco-graph-seal-followup.md` requesting design feedback.

Compatibility change: `createScoGraphHandler` requires exact original object returned by the same-process partition function; JSON-roundtripped/shallow-copied manifests are refused. No private source secrecy claim under server compromise, no prevention of authorized relay, no measured whole-application 2.5x proof. This startup safety improvement does not affect per-RPC operations. An unsealed direct handler intentionally retains legacy contract.

A proposed independent blind LLM reconstruction attempt against `examples/polyvariant-app/generated/math.mjs` using Workers_API did not run: worker tool returned unavailable 404. No new attack result or reconstruction claim should be inferred.

Important follow-ups: (1) have graph API owner review the sealed same-process contract; (2) broaden representative app attack cost only with a genuinely independent attacker, not a new emitter variant; (3) verify further SCO source exposure boundaries under real HTTP rather than implying arbitrary code confidentiality. 


## 2026-11-16 continuation: deployed graph source commitments

The closed graph compiler previously had bare SHA-256 fingerprints for private original sources but no path-addressed commitment that the example server could verify against its deployed files before ESM import. Reused the existing `verifyScoPrivateSourceDigests` selective-SCO preflight:
- `src/sco-graph.js` adds `privateSourceDigests:[{path,sha256}]` for all original members (including originals of public facade modules), and derives each facade's prior digest-only list from those same input bytes. Graph snapshots include these new commitments.
- `examples/sco-graph/server.cjs` calls the verifier before any original ESM namespace imports.
- `test/sco-graph-private-path-policy.test.js` uses atomic temp file writes to show that either the private dependency or the selected original facade implementation changes trigger specific filename errors; source restores pass. An additional sealed-manifest mutation is refused.
- Strict Node22/JSDoc targeted Linux/Windows gate [43919220894](https://github.com/FlareZ123/obfs/actions/runs/43919220894) passed at exact `c8767efce6e033a99dba0f958f11137a3969f24c` (12 tests across two files on each OS). `im-results/sco-graph-deployment-source-integrity-2026-11-16.md` documents the evidence and limitations; README and docs/SCO_PARTITION.md updated.

This is a trusted-server **deployment consistency** check. The verifier has an admitted TOCTOU filesystem race; do not claim tamper-resistance against an untrusted server or general 2.5× proof. No per-RPC operations were added.
