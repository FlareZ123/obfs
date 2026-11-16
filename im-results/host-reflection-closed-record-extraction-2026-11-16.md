# Runtime-preloaded Reflect hook observes transformed ESM owner names (2026-11-16)

**Status:** bounded experimental attacker/compatibility observation. This does not establish generalized dynamic deobfuscation or a violation of the compiler's expressly closed input-source contract.

## Adversarial question

The recently introduced `safeClosedCallerRecordRead` exception in `src/cross-properties.js` enables limited unrelated computed field reads inside an unescaped private ESM record when all known calls use its own immutable string-valued fields. That is a **source-level** analysis. The source still contains a call to the ambient `Reflect.ownKeys(schema)`. Can a hostile Node host replace the ambient `Reflect.ownKeys` implementation and use that call as an extraction trigger despite all statically visible callsites using safe keys?

The source-only input to the compiler is three ESM modules:
- `state.mjs`: `export const state={secretField:41}`.
- `record.mjs`: a private `schema={externalFormat:'audit-v1',auditCount:3}` and an exported `inspectRecord(key)`, returning `Reflect.ownKeys(schema)`, `schema[key]` and a native property descriptor.
- `entry.mjs`: imports both modules, calls `inspectRecord('externalFormat')`, then reads `globalThis.HOST_OBSERVATION` and prints its JSON output.

The input modules declare no Function constructor, dynamic import, loader hook or unknown computed record key. The compiler is called with `mode:'coo', closedWorld:true, identifiers:false,strings:false,properties:true` and a fixed reproducible seed. It accepts **one** property rewrite in the exported `state` object while preserving its ordinary direct numeric read.

A separate Node `--require preload.cjs` executes **before** those ESM files and is intentionally excluded from the source group supplied to the obfuscator. The preloader saves the native `Reflect.ownKeys`, installs a wrapper, and, on the known record shape, launches a `Function('uri','return import(uri)')` dynamic import of the very same `state.mjs` via an absolute file URL. It stores `Object.keys(ns.state)` in the global observation promise and forwards the original native `Reflect.ownKeys` result to the caller.

## Reproduction and observation

Run `node --test test/closed-record-host-hook-attack.test.js` in the repository with declared Node dependencies. The test spawns two fresh Node ESM loaders with the **same external preloader**, first for original source and then for the delivered transformed source.

- Native JSON observation: `[41,"audit-v1",["secretField"]]`.
- Transformed output: retains `41` and `"audit-v1"`, but the extracted own key is a compiler-generated hash-like identifier rather than `"secretField"`. The test asserts that the field is indeed renamed, that the dynamic observation has exactly one name, and that the names differ.
- The altered name originates from the distributed transformed ESM file, not the original source, and the hook imports no obfuscator library or compiler seed.

[Pinned application gate 43837365013](https://github.com/FlareZ123/obfs/actions/runs/43837365013), source commit `2c79e68ad00c531db414491b466bef879206e37a`: Linux Node 22, Windows Node 22 and Ubuntu legacy Node 22.0 lanes **all passed**, including the new attacker test, strict JSDoc and the existing independent full application attack/behavior/profiling suites. The new test was explicitly enrolled in `.github/workflows/manual-application-challenge.yml`.

## Security interpretation and boundary

A runtime controller can replace globally callable native reflection code before the program initializes. A permitted `Reflect.ownKeys` call offers such a controller a hook even when the program's own computed-key expression is statically safe. Static "closed-world" ownership of ESM *source files* cannot stop such a controller from importing distributed modules and inspecting their emitted own property names.

The experiment observes **generated field names**, not restoration of the original semantic identifier, and it requires a privileged Node preloader in the host's execution environment. It makes no stronger claim about unreadable source extraction beyond the separate documented static normalizer and offline-copy results. In the project's SNO threat model, the attacker already controls runtime and filesystem, so the negative observation is directly within adversarial capability. A similarly instrumented COO browser host can inspect distributed modules; SCO's genuinely withheld server-private computation has a different boundary.

The test deliberately expects an **original-versus-transformed difference under adversarial preloading**. The bundled closed-world compiler was not given the CJS preloader as input, so this is not proof of a defect in the compiler's narrower assumptions. No weakening or strengthening of its existing own-key acceptance gate follows without a formal environment contract and a separate native semantic counterexample *within* that contract.

## Follow-up

Evaluate an explicit source-visible overwrite of `Reflect.ownKeys` that invokes an opaque host callback before a proved own-record call: unlike the hidden preloader, that may be an analyzable whole-graph mutation and deserves a separate native versus emitted differential. Preserve the existing inherited missing-key loader regression and the frozen application 0/2 refusal; changing it to 2/2 by deleting a guard is already proved unsafe. For resistance claims, measure an actual attacker reconstruction cost and protected-work fraction; syntactic safety tests alone are insufficient.
