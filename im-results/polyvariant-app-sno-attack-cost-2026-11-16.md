# Frozen transformed three-module SNO application: static recovery and offline owner clone

**Date:** 2026-11-16. **Classification:** Intermediate reproducible negative security evidence.  
**Pinned source:** 9c45a1479db6fda12ca08486fa5ebd6af07b7f82  
**Pinned Ubuntu/Windows CI:** [manual frozen-app workflow 43813786492](https://github.com/FlareZ123/obfs/actions/runs/43813786492), both jobs successful.

## Threat question and original frozen application

Can the SNO single-entry architecture increase the cost of offline behavioral cloning or source reconstruction when protected JavaScript is genuinely transformed, while preserving a frozen multi-file application and staying inside 2.5x original compute cost?

We reused Agent 2's frozen ESM application, published at [examples/polyvariant-app](../examples/polyvariant-app/README.md), without changing its three original source modules. It uses three arithmetic functions in a repeated state digest, stateful event processing, externally supplied host callbacks, implicit input conversions, Object.keys and Reflect.get / Object.getOwnPropertyDescriptor on a separate public state object.

In this experiment an offline build compiles math.mjs with **actual mode:sno**, selecting round1, round2 and round3 for explicit two-path native polyvariant lowering. The reflective state.mjs and entry.mjs are shipped unchanged after a separately established source-observer refusal for the complete graph. We add an identical CJS bridge to both native and protected distributions so comparisons preserve the same input and output interface; the SNO distribution additionally has a public SHA-256-checking sno-entry.cjs launcher, which is the **only invoked entry** in normal protected execution. No obfuscator code is imported by the runtime launcher.

The preselected three arithmetic functions occupy **310/2,467 = 12.6% of original source bytes** (as reported by the frozen COO builder). Only the 832-byte original math module, 33.7% of original bytes, is compiled. Unlike the separate six-module SNO source-refusal negative control, this case **genuinely changes one of three original source files**, yielding exactly 2,467 original bytes and 7,495 emitted original-graph bytes. Metrics are 3 selected functions, 6 generated paths; all other app source is public unchanged. The CJS bridge and hash launcher have additional bytes excluded from those original-graph source-size totals.

The build normalizes original source line endings before compilation and uses a fixed seed. Pinned Ubuntu and Windows runner outputs agree exactly:
- Protected four-file graph digest: 30ac16340cad6a2ac1c90bb93f9ee9208b7e5ea957e4a3daff3a3d7d21bfba6f.
- Public SNO launcher digest: fa5d5a7c499de0f75ce84c1cbfebe248122f3c35177963d560d2107aaaec52b2.

The graph digest hashes path-name, NUL separator and file content in declared order; it is an artifact identity check, not a claim of confidentiality.

## Preserved behavior and executable independent attacks

The executable test [test/polyvariant-app-sno.test.js](../test/polyvariant-app-sno.test.js) creates fresh temporary original and preobfuscated distributions. It verifies **96/96** deterministic stateful native-vs-protected scenarios, including Unicode payloads, callback arrays, source-visible reflection and serialized output. For each application call, the generated CJS bridge captures external host callbacks. Tests compare the complete result and callback arrays.

The [public-only owner attacker](../sims/application-challenge-sno-public-attacker.js) runs in a **separate Node process**, imports only built-in modules, and receives only the SNO output directory plus attacker-selected JSON test inputs. It copies all five distributed public files (three original app modules, CJS bridge, hash launcher), reproduces the exact observed application output offline, and subsequently:
1. Changes its copied ESM entry to output FORGED and exit.
2. Observes that the original launcher's public SHA-256 manifest rejects the changed module.
3. Computes a replacement public SHA-256 and patches the corresponding digest inside its own launcher.
4. Successfully executes the modified program through the same advertised single entry.

The copied distribution and public digest alone suffice. There is no private server, credential, or oracle used for copying. The independent [COO functional-clone attacker](../sims/polyvariant-app-functional-clone.js) also imports the published ESM entry directly from the SNO distribution, avoiding the launcher's manifest entirely, and reproduces the sample stateful function and host callback count.

A separate [source-only static reconstruction attacker](../sims/polyvariant-app-sno-static-attacker.js) loads only the public SNO math.mjs text and an independently authored Acorn decompiler. Without the compiler seed, compiler APIs, original source or runtime instructions, it recovers all **3/3 transformed arithmetic functions** as signed Int32 additions with 2 congruence paths each. Recovered offsets are exactly [324, 292, 324]. Its 12,288 held-out primitive Int32 comparisons against separately invoked published functions matched across both OSs. The comparison oracle is used for post-recovery validation; reconstruction itself operates on the public static AST and known emitter grammar. This attack is specialized to the public affine emitter, so it is a bounded negative control, not a theorem for arbitrary JavaScript or randomized schemes.

## Seven paired whole-process measurements

Native baseline launches the same CJS bridge, imports the same original ESM graph, handles the same event records, collects the same host callbacks, and writes the same JSON. The SNO path invokes its generated launcher first, checks the four app/bridge hashes, then loads its bridge, imports transformed ESM and executes. Each trial is a fresh Node 22 process. Both receive identical JSON from a locked atomic input fixture file, avoiding Windows and Linux command-line length restrictions. Seven paired trials alternate execution order; medians include process startup, file input, ESM import, JSON output, hashing and application work. Offline compiler time is excluded.

| System | Events | Native ms | SNO ms | SNO/native |
|---|---:|---:|---:|---:|
| Ubuntu | 1 | 34.283 | 37.693 | 1.099x |
| Ubuntu | 50 | 34.581 | 38.604 | 1.116x |
| Ubuntu | 1,000 | 42.368 | 48.294 | 1.140x |
| Ubuntu | 10,000 | 90.944 | 98.401 | 1.082x |
| Windows | 1 | 67.818 | 51.922 | 0.766x |
| Windows | 50 | 48.798 | 57.190 | 1.172x |
| Windows | 1,000 | 57.128 | 62.052 | 1.086x |
| Windows | 10,000 | 92.633 | 99.903 | 1.078x |

All eight measured session medians are inside the **2.5x** cap for the sampled loads. The Windows one-event ratio below unity is an unsteady short-run wall-clock observation, not evidence that SNO accelerates the program. Seven trials on shared CI runners are not a universal latency, sustained-throughput, or cold-to-hot limit. The native baseline has the same CJS bridge and fixture-read overhead; only the protected side hashes files and runs the published arithmetic transformations. The transformed runtime-work fraction is input dependent and was not separately isolated for this application.

## Security-performance decision

This is a more informative negative control than an SNO package whose application bytes never change. The compiler made a measurable transformation to actual protected logic while preserving the tested multi-file host and reflection behavior at modest whole-session overhead. Nevertheless, offline cloning succeeds for the complete published app, all selected arithmetic leaves were statically reconstructed by a seedless attacker, the public ESM entry can bypass the launcher's integrity code, and local owner manifest rewriting succeeds. A claim of enhanced reconstruction resistance, modification resistance or environment authorization is therefore unsupported by these measurements.

Under the specified SNO adversary model (complete access to filesystem, runtime and memory), a self-contained, owner-writable verification manifest remains useful only for accidental changes. A different security trust boundary or a new empirically resistant computation technique is required to assert stronger protection.

## Exact repro

On Node 22 after installing the repository dependencies, run:

    node --test test/polyvariant-app-sno.test.js
    node sims/polyvariant-app-sno.js --profile

The latter prints POLYVARIANT_SNO_EVIDENCE and POLYVARIANT_SNO_PROFILE JSON. It writes all generated artifacts atomically with per-path locks in disposable temporary directories, which it removes after execution. The independent owner and static attackers are separate runnable scripts; their input is only the generated public output directory. Both were exercised by CI on Windows and Ubuntu at exact pinned source.
