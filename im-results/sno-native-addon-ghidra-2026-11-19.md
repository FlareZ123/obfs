# SNO native Node-API AOT: near-native runtime, readable stripped machine code

**Agent 8, 19 November 2026. Status: intermediate candidate result.**

## Question

Could moving selected SNO kernels from JavaScript into a stripped native Node-API addon create a
useful protection substrate while staying inside the 2.5x runtime ceiling?

This is a different representation from the repository's JavaScript, WebAssembly, and V8 cached
bytecode candidates. The protected kernel is compiled to native machine code and exposed through
the ABI-stable Node-API surface.

The retained artifacts are:

- `sims/sno-native-addon/addon.c`
- `sims/sno-native-addon/binding.gyp`
- `sims/sno-native-addon/bench.js`
- `sims/sno-native-addon/DecompileAllFunctions.java`

The final validation is GitHub Actions run
[44474931093](https://github.com/FlareZ123/obfs/actions/runs/44474931093)
at source commit `7d1854c63899585a4dddde85933c987af0d6978b`.

## Candidate

The C kernel implements the same branchy integer workload used by Agent 8's earlier source-free
V8 bytecode experiment:

- nested rounds over an `Int32Array`;
- two parity-dependent arithmetic paths;
- 32-bit wrapping multiply/add/xor;
- a final xor-right-shift mix.

The addon uses only `node_api.h` and `NAPI_VERSION=8`. Node's current documentation describes
Node-API as stable and ABI-stable across Node versions when the addon stays on the Node-API C
surface. The experiment builds with pinned `node-gyp@13.1.0`.

Release builds use `-O3 -fvisibility=hidden -Wl,--strip-all` on Linux and optimized MSVC
settings on Windows. The internal C function has a deliberately descriptive name,
`secretLedgerTransformNative`, so the artifact can be checked for symbol leakage.

## Behavioral parity

The harness checks 24 generated inputs on both Linux and Windows.

All **24/24** cases match the JavaScript reference on both platforms.

The heavy timing case uses 256 signed 32-bit values across 50,000 rounds. Five shorter warm-up
calls are run first.

## Warm runtime

Final medians:

| Platform | JavaScript | Native addon | native/original |
| --- | ---: | ---: | ---: |
| Ubuntu / Node 22.23.4 | 24.4670 ms | 24.4613 ms | **0.99977x** |
| Windows / Node 22.23.4 | 19.9868 ms | 19.9759 ms | **0.99945x** |

For this coarse kernel, the Node-API crossing cost is negligible relative to the work performed.
This fixture is comfortably inside the 2.5x runtime ceiling.

These are warm function timings for one integer-heavy workload. They are not a universal
performance proof. Small functions, object-heavy code, callbacks into JavaScript, allocation,
exceptions, and frequent boundary crossings need separate coverage.

## Raw artifact leakage

Final release artifact sizes:

| Platform | addon bytes | descriptive internal identifier present |
| --- | ---: | --- |
| Linux | 14,448 | no |
| Windows | 109,056 | no |

The descriptive internal function name does not survive as a raw string in either release
artifact.

That symbol stripping is useful hygiene. It is not a reconstruction barrier by itself.

## Static attacker

The final attack uses official Ghidra 12.2 in headless mode with Java 25.

The committed `DecompileAllFunctions.java` script:

1. opens the imported addon;
2. iterates every non-external function discovered by Ghidra;
3. calls the documented `DecompInterface.decompileFunction()`;
4. prints the resulting C-like pseudocode.

No source symbols, debug information, or candidate source are supplied to Ghidra.

The headless analysis recovered 30 functions from the stripped Linux addon. The protected kernel
appears as an anonymous `FUN_...` function.

The recovered pseudocode exposes the core program structure directly. In particular it recovers:

- the nested loop structure;
- the parity-dependent branch;
- multiplication by `0x41c64e6d` (1103515245);
- xor with `0x3039` (12345);
- the final `value ^ value >> 0xd` mix;
- the companion even-path multiply/add constants in the same anonymous function.

A representative recovered fragment is structurally:

```text
value = (input + value) * 0x41c64e6d ^ 0x3039;
value = value ^ value >> 0xd;
```

The function's original descriptive name is gone, but the control/data semantics are still
readable from ordinary current tooling.

## Harness correction

An earlier run used Rizin extracted from Cutter 2.5.0. Rizin found and analyzed the addon, but its
standalone CLI process did not locate the Cutter-packaged Sleigh specification and produced no
Ghidra decompiler output. That packaging failure is not evidence of resistance.

The final run replaces that path with the official Ghidra 12.2 headless analyzer and a documented
decompiler API script. This produces real C-like output and is the evidence used here.

## Interpretation

Plain native AOT materially changes the presentation layer and gives an excellent performance
substrate for this workload. It does not create a strong static reconstruction barrier on its
own.

The result is stronger than a string or symbol inspection. Ghidra recovers the anonymous stripped
kernel's loop and arithmetic semantics without the original function name.

The SNO threat model is stronger still: the attacker owns the server filesystem, Node runtime,
debugger, and memory. Therefore machine code must also withstand dynamic tracing, breakpointing,
memory inspection, and direct invocation. Static readability is already enough to deny plain AOT
standalone protection credit for this fixture.

## What remains promising

The performance result is worth preserving. Native AOT is approximately native-speed here, so it
may be a useful substrate for **additional native-level obfuscation** whose overhead would be
unacceptable on top of a slower VM or Wasm backend.

Future native work should spend the available budget on mechanisms that survive Ghidra and
runtime tracing, for example experimentally validated native control-flow or data encodings,
rather than treating compilation and stripping as security.

Any such extension should keep the present admission test:

1. behavior parity on held-out inputs;
2. warm runtime under 2.5x;
3. stripped-artifact analysis by a current native decompiler;
4. attacker-controlled runtime tracing under the SNO model.

## Release impact

The repository remains release-blocked on the strong-protection objective.

This experiment rejects **plain** native Node-API AOT as a standalone security backend. It also
establishes a potentially valuable performance substrate: a coarse typed kernel can cross the
Node-API boundary and execute at essentially the JavaScript baseline cost on both tested
platforms.
