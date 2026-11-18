# Candidate charter: fused stateful ARX kernel in one WebAssembly module

**Proposed by Agent 3, 18 November 2026 UTC. Status: unimplemented, unmeasured, and unselected.**

## Decision this experiment must answer

Can the compiler package a substantial stateful, nonlinear, host-observable JavaScript application into a **single fused WebAssembly hot-work kernel** that costs at most 2.5× the original on real Node and Chrome sessions while requiring materially more independent attacker work to reconstruct than the **same application minified with esbuild**?

This is a falsifiable comparison in **COO**, with a possible subsequent SNO check. It is not a claim of secrecy against instrumented runtimes, and it does not assume a local domain lock can enforce authorization. The idea differs from the [rejected per-leaf affine/polyvariant experiment](candidate-over-minification-decision-2026-11-17.md): its intended protected workload is a non-affine multiword state transition, and its cost hypothesis is **one JS/Wasm boundary per batch** rather than one wrapper per selected leaf/call. No additional source-masking layout is credited as security unless the matched attacker measurement supports it.

## Concrete, precommitted experiment envelope

**Application.** Create a frozen three-file ESM app \`examples/stateful-arx-app/native/{kernel.mjs,state.mjs,entry.mjs}\`. The protected kernel is a deterministic four-word \`Uint32\` ARX state transition with multiple rotations, additions and xors, fed by UTF-16 code-unit blocks from a record stream. \`state.mjs\` must maintain state across calls and per-record host callback emissions; \`entry.mjs\` must export a scenario interface. Include Unicode surrogate edge cases, negative/unsigned numeric boundaries, repeated calls, mutation and external callback trace checks. Specify the exact transition source and its zero- or signed-32-bit semantics **before** constructing an attacker, and do not label it cryptographically secure. An unmodified native graph and actual input fixtures are the common reference.

**Control.** esbuild with pinned dependency version, \`minify:true\`, preserving the same ESM external API and trust boundary, without undocumented property mangling. Record \`package-lock.json\` hash and the baseline's emitted byte hashes. A plain hand-written optimized JS version of the batch operation is an optional extra performance control, not a substitute for the minified baseline.

**Candidate.** Compile a proven-pure state transition plus its repeated block iteration into one persistent WebAssembly module exposing a single batch kernel. JS translates inputs/outputs at the declared boundary. No per-code-unit JS/Wasm calls, no encrypted keys residing in the client, and no claim that bytecode is an execution trust boundary. Count actual hot loop iterations in Wasm (e.g., an independent instrumented version) and validate the same record/host trace. Preserve original exported function behavior or decline transformations when a source observer or external call might distinguish the fused implementation. If actual program bytes cannot be frozen, do not run the security comparison.

## Predeclared attacker access and comparison

The attacker receives **every emitted ESM and Wasm byte**, can modify and replay them, can run DevTools/Node inspector, intercept \`WebAssembly.compile\`, \`WebAssembly.instantiate\`, and \`WebAssembly.Memory\`, can disassemble/decompile the Wasm and use arbitrary scripts, and has an unlimited local copy. For both candidate and minifier, use the same fixed query/time allowance and the same held-out tests. A public callback or \`runScenario\` invocation is an allowed black-box oracle.

Recruit at least two independently implemented attack paths. One must be **static/disassembly-first** without executing a candidate-specific known-output probe; one must be **dynamic instrumentation** allowed to dump the real instantiated module and memory. Give each path the same preregistered effort budget against a shuffled, blinded candidate/minifier pair. Suggested starting cap: **20 human or equivalently metered agent minutes per artifact**, fixed prior to seeing artifacts. Preserve timestamps, tools, generated scripts and byte-accurate output reconstruction; do not count CI runtime as researcher effort. Held-out verification requires at least 12,288 unseen input records with exact state/output and callback equality after the attacker submits its reconstruction. Report successes and time-to-working-clone separately for each attack and each arm.

The predeclared **security promotion criterion** is a reproducible, material increase in reconstruction effort over minification on both independent attack paths, with neither exposed trivial public oracle nor independent source extraction defeating the difference. One possible threshold to precommit before freezing sources is a **minimum 3× median valid attacker time** for both attack paths across at least three balanced blinded trials. A single efficient, fully validated equal-budget attacker clone of both arms is sufficient to **reject** this particular candidate as a demonstrated incremental advantage. Do not reinterpret an attacker timeout as proof of obfuscation; report inconclusive when controls fail as well.

## Compute, semantic and anti-vacuity vetoes

- Predeclare real Node22 Ubuntu and Windows CPU clocks plus a real-clock recent Chrome engine. Measure fresh-process, fresh-ESM graph, warmed 1/50/1,000/10,000-record sessions and hot kernel work separately. **Every observed paired normalized CPU slowdown above 2.5× rejects** the specific observed workload, even if medians pass. Include setup and browser initialization on the COO side; no server-initialization exemption applies.
- Require exact native/candidate/minified outputs, exception types/messages for supported inputs, external host callback order, and mutable state transitions across every scenario. Cases that cannot be preserved must decline explicitly and remain in coverage statistics.
- Require proof of meaningful transformed executed work. Suggested preregistered gate: at least **50% of baseline application CPU** spent in genuinely transformed logic on the 1,000/10,000-record sessions, measured with source-coincident CPU profiles; recording only source-byte or AST counts is not enough.
- Keep static reconstruction, dynamic extraction, host/environment spoofing and integrity bypass reports separate. Do not infer environment authorization from JavaScript, Wasm or local checksums when the adversary controls the client.

## Stop rule and implementation handoff

**Do not build a long new test matrix until** a four-page-or-shorter design and minimal runner establish the exact native app, minified control, candidate Wasm bytes, one matched Node+Chrome CPU boundary, one real executed-work counter, and the first independent attack. Reject or shelve if the first equal-effort attacker trivially reconstructs both versions, or if any strict compute pair violates 2.5×; further cosmetic Wasm changes require a new reason to expect a different outcome.

Likely reusable infrastructure: \`src/wasm-i32.js\` for binary construction, \`examples/polyvariant-app\` for real ESM state/callback normalization, \`sims/polyvariant-app-execution-coverage.js\` for independent work counts, and \`sims/four-way\` evidence for equal-trust control methodology. The current i32 lowerer is **pure-expression only**, so adding a verified batched loop and linear-memory ABI is a substantial uncompleted engineering dependency.

No artifact emitted by this charter is a new protection result. Until an independent equal-budget attacker and all runtime vetoes are passed at one frozen source, the existing **RELEASE-BLOCKED** decision in \`results/README.md\` remains correct.
