# Frozen transformed three-module SNO application: static recovery and offline owner clone

**Date:** 2026-11-16. **Classification:** Intermediate reproducible negative security evidence.  
**Primary performance and synchronous hook source:** 61e7143ddaca118aef3206aa915cf7cc7ce1d0b1  
**Pinned Ubuntu/Windows CI:** [manual frozen-app workflow 43814631907](https://github.com/FlareZ123/obfs/actions/runs/43814631907), both jobs successful.

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

## File-preserving runtime ESM source substitution

A further independent [Node module hook attacker](../sims/sno-esm-runtime-hook-attack.js)
uses the documented Node 22.15+ [synchronous registerHooks load hook](https://nodejs.org/download/release/v22.18.0/docs/api/module.html#customization-hooks).
The attacker receives only the published SNO directory and controls
its own Node process startup. A data URL supplied through Node's
--import option registers a synchronous ESM source loader before the
advertised SNO CJS entry executes. The normal launcher checks every
published SHA-256 digest and sees the expected bytes. The attacker hook
then substitutes a new in-memory math.mjs module when the CJS bridge
dynamically imports the public application. Its replacement digest
function returns an attacker-selected constant **777** while preserving
the public method exports required by the application.

Two selected event records now produce a reflected state digest of 777
and external host callback records with value 777, rather than the genuine
native digest. The same published launcher completes normally in both
cases. The independent attacker checks SHA-256 for **all five distributed
files before and after**. Both platforms reported runtimeHooked=true
and runtimeDiskMutations=0. The changed code was supplied solely
through an attacker-controlled loader argument, with **zero altered
published bytes and no manifest rewrite**.

This is a concrete runtime/loader instrumentation test on the actually
transformed ESM graph, separate from public-file copying and the digest
replacement attack. It depends on the attacker's stipulated control
of Node process flags. A trusted launch policy or externally protected
loader could exclude this capability, but the SNO threat model grants it.

### Node 22.0 loader compatibility follow-up

The [later three-job manual gate 43816370969](https://github.com/FlareZ123/obfs/actions/runs/43816370969)
at exact source fb5fc123b7e03f9ed90f72c57e58efa60051fa37
passes Ubuntu and Windows on current Node 22, plus a separate
Ubuntu **Node 22.0.0** job, the project's earliest declared Node major
release. The attacker tests both synchronous registerHooks and the
older asynchronous module.register loader on current Node; Node 22.0
uses the [documented asynchronous register API](https://nodejs.org/download/release/v22.0.0/docs/api/module.html#customization-hooks)
to substitute the same ESM source without modifying any disk hashes.
The original 96-case behavior and independent attackers pass on that
legacy job too. The 22.0 job does **not** run the paired performance
profile, so the table below remains a measurement of the current Node
22 runner versions at the primary pinned gate.

## Seven paired whole-process measurements

Native baseline launches the same CJS bridge, imports the same original ESM graph, handles the same event records, collects the same host callbacks, and writes the same JSON. The SNO path invokes its generated launcher first, checks the four app/bridge hashes, then loads its bridge, imports transformed ESM and executes. Each trial is a fresh Node 22 process. Both receive identical JSON from a locked atomic input fixture file, avoiding Windows and Linux command-line length restrictions. Seven paired trials alternate execution order; medians include process startup, file input, ESM import, JSON output, hashing and application work. Offline compiler time is excluded.

| System | Events | Native ms | SNO ms | SNO/native |
|---|---:|---:|---:|---:|
| Ubuntu | 1 | 21.486 | 24.637 | 1.147x |
| Ubuntu | 50 | 22.366 | 23.852 | 1.066x |
| Ubuntu | 1,000 | 27.041 | 31.470 | 1.164x |
| Ubuntu | 10,000 | 59.322 | 64.474 | 1.087x |
| Windows | 1 | 59.218 | 63.782 | 1.077x |
| Windows | 50 | 60.815 | 66.395 | 1.092x |
| Windows | 1,000 | 72.425 | 78.760 | 1.087x |
| Windows | 10,000 | 115.451 | 121.111 | 1.049x |

All eight measured session medians are inside the **2.5x** cap for the sampled loads. Earlier Windows one-event samples varied substantially, including a below-unity ratio on the previous green gate, illustrating short-process runner noise. Seven trials on shared CI runners are not a universal latency, sustained-throughput, or cold-to-hot limit. The native baseline has the same CJS bridge and fixture-read overhead; only the protected side hashes files and runs the published arithmetic transformations. The transformed runtime-work fraction is input dependent and was not separately isolated for this application.

## Security-performance decision

This is a more informative negative control than an SNO package whose application bytes never change. The compiler made a measurable transformation to actual protected logic while preserving the tested multi-file host and reflection behavior at modest whole-session overhead. Nevertheless, offline cloning succeeds for the complete published app, all selected arithmetic leaves were statically reconstructed by a seedless attacker, the public ESM entry can bypass the launcher's integrity code, local owner manifest rewriting succeeds, and in-memory ESM source replacement runs after successful disk-hash verification. A claim of enhanced reconstruction resistance, modification resistance or environment authorization is therefore unsupported by these measurements.

Under the specified SNO adversary model (complete access to filesystem, runtime and memory), a self-contained, owner-writable verification manifest remains useful only for accidental changes. A different security trust boundary or a new empirically resistant computation technique is required to assert stronger protection.

## Exact repro

On Node 22 after installing the repository dependencies, run:

    node --test test/polyvariant-app-sno.test.js
    node sims/polyvariant-app-sno.js --profile

The latter prints POLYVARIANT_SNO_EVIDENCE and POLYVARIANT_SNO_PROFILE JSON. It writes all generated artifacts atomically with per-path locks in disposable temporary directories, which it removes after execution. The independent owner and static attackers are separate runnable scripts; their input is only the generated public output directory. Both were exercised by CI on Windows and Ubuntu at exact pinned source.
