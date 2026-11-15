# Experimental native-superblock control-flow flattening (2026-11-15)

**Status:** Intermediate compiler implementation and falsifiable attack result.
**Author:** Agent 21. **Mode:** opt-in COO ESM / SNO CommonJS-compatible
native JavaScript; not active in default production output.
**Pinned focused run:** [43733943243](https://github.com/FlareZ123/obfs/actions/runs/43733943243),
commit `eb857f7f40c5d8df5480f47d30bc347ed79dc297`.
**Node:** v22.23.4, GitHub-hosted Ubuntu runner.

## Proposed transformation

[Implementation](../src/branch-blocks.js) proves a deliberately narrow AST
shape: one top-level named function, one plain parameter, one return statement
whose expression contains a ternary. Conditions and leaves may be left-deep
native arithmetic/bitwise chains on that parameter with 0–255 numeric literals.
Nested ternaries recursively become blocks, bounded by 16 nesting levels and
128 basic blocks.

For every state, the compiler emits a source-shuffled case labeled by a
seed-derived 32-bit integer. Each case resets a private scratch variable to
the original argument, applies the native JavaScript compound operators in
source evaluation order, then returns or selects exactly one successor. Number
literals appear as masked XOR pairs. No call, getter, property, assignment,
arbitrary expression, or unrelated side effect is speculated through either
branch. The pass rejects unsupported functions and known source observers.

The [real CommonJS original](../examples/branch-blocks/before/gate.cjs) and
[real generated after file](../examples/branch-blocks/after/gate.cjs) are
checked in. The [build script](../examples/branch-blocks/build.cjs)
reproduces the after bytes exactly; the checked-in source regression tests
this, rather than writing an illustrative pseudo-output.

## Differential behavior

The [7-test focused suite](../test/branch-blocks.test.js) and
[reconstruction tests](../test/branch-block-reconstruction.test.js) passed
on the pinned runner, with strict JSDoc verification. This covers 2,049
consecutive numeric values, nested branch routing, strings, booleans, null,
undefined, NaN, infinities, BigInts, Symbols (including matching exception
types/messages), observably coerced objects and bounded refusal cases.
The standalone generated example additionally matches its original on 4,097
consecutive integer inputs and a heterogeneous value set. These cases are
samples, not a 1:1 correctness proof for all JavaScript or all environments.

## Measured 2.5× budget

[The profiler](../sims/branch-block-profile.js) executes six interleaved,
warmed 1.2-million-call trials per source/obfuscated variant, excluding module
loading, and reports the median time of each set. Each workload uses an integer
checksum and checks behavior. These *isolated hot-call* numbers exclude
application-level and browser effects:

| Input distribution | Native median (ms) | Flattened median (ms) | Ratio |
| --- | ---: | ---: | ---: |
| Mixed positive/negative | 5.031 | 8.472 | 1.684× |
| Alternating branch bias | 8.304 | 12.199 | 1.469× |
| Numeric/string coercion | 15.866 | 20.570 | 1.296× |

All three measured samples fit 2.5×, but the smallest medians span only
5–21 ms and are affected by JIT and clock variation. No global compiler
performance guarantee follows. Longer profiles, Windows and Chromium runs,
real application traces, memory, initialization and parameter-shape variation
remain outstanding. Consumers must profile accepted functions and opt in only
when they meet their actual budget.

## Adversarial source-only evaluation

An independent [source-only attacker](../sims/branch-block-reconstruction.js)
receives the committed *after file*, no seed, and no original source.
It parses each state case and XOR immediate, follows branch labels, and
reconstructs a single expression function. In the pinned run, it recovered
5/5 states, 2/2 condition nodes and 7/7 masked operations, producing a
behavioral clone for all 4,097 tested integers and the heterogeneous inputs.

This establishes a concrete **negative protection result** for this format:
an automated attacker can undo its branch flattening without dynamic
instrumentation or brute force. The transform may complicate casual visual
inspection, but it has no demonstrated strong resistance under the project's
stated attacker model. It adds no runtime authorization or integrity boundary.
Full-control COO and SNO adversaries can additionally instrument the output.

## Open research questions

A useful next experiment should materially increase recovery cost while
retaining the demonstrated runtime profile. Candidate directions include
mixed superblock graph forms, multi-file state dispatch, native operation
fusion and richer branch semantics. Every candidate needs an updated
independent attacker with measured effort, real before/after artifact,
differential test, and hot-call/whole-app performance. Failed attacks must
be recorded alongside successful attacks without relabeling reversible
diversification as cryptographic protection.
