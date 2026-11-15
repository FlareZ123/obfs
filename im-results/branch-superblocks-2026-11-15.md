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


## Real Chromium COO execution (additional pinned run)

[Focused Linux Chromium run 43735256344](https://github.com/FlareZ123/obfs/actions/runs/43735256344)
on SHA `98ddb32a0859e4b8cec740613998f4a368b55e3d` passed eight focused
Node tests and the strict JSDoc checker. The isolated
[Chrome integration](../test/branch-block-browser.js) generated a COO ESM
module in-process, served it to headless Chromium beside its native original,
and compared **4,109** inputs (4,097 consecutive integers, plus twelve
heterogeneous values and matching exceptions). All were equal. Its embedded
3,000,000-iteration numeric loop took **30.5 ms native versus 57.1 ms
flattened, 1.872×**. This is one Chromium JIT sample under its own harness,
not proof of the 2.5× budget for all browsers or workloads.

A separate repository-wide pinned [Linux/Windows full validation run
43734294017](https://github.com/FlareZ123/obfs/actions/runs/43734294017)
was **red**, 6 of 979 tests failing per OS, plus a separate Ubuntu browser
integration assertion at line 75. At least two failures were expected property
renaming counts now becoming 0 with the parallel stricter
`src/properties.js` source-spelling proof; the branch pass is
opt-in and the failing tests do not request it. This cause remains inferred,
not definitively bisected. The affected proof owner has been notified.


## Experimental numeric operand-dependent state blinding

The standalone compiler and opt-in `experimentalBranchStateBlinding:true`
option can encode a state ID by XORing it with the previously computed
**primitive number** reduced through `|0`. The dispatcher decodes the same
mask. The type check skips object, string, BigInt, Symbol and other values,
so no new object coercion occurs. This is a source-shape diversification:
the next state depends on the runtime test value for numeric paths.

[Actual masked source](../examples/branch-blocks/after/gate-masked.cjs)
was generated by the same reproducible compiler [build](../examples/branch-blocks/build.cjs)
and is byte-checked in the suite. The [independent source-only recovery](../sims/branch-block-reconstruction.js)
now recognizes the matching XOR masks, cancels them symbolically and recovers
the exact five-state, two-test, seven-immediate branch tree, again without
the seed or access to the original source. This is another negative security
result: runtime-value-dependent state tags are fully reversible when their
encoding and decoding circuits are present in distributed output.

[Focused pinned Chromium + Node run 43736108997](https://github.com/FlareZ123/obfs/actions/runs/43736108997),
SHA `0c281fa7741a0f89254c0dfaf78f6a05fd54f213`, passes
**11/11** focused Node tests, JSDoc and **4,109** browser input comparisons
against *both* the ordinary and state-masked COO ESM variants. One
3-million-iteration Chromium loop on this run measured **49.6 ms native,
73.3 ms ordinary flat (1.478×) and 81.0 ms masked (1.633×)**. Both
variants fit the 2.5× bound for this single workload. The earlier ordinary
Chromium run was 30.5 vs 57.1 ms (1.872×), illustrating run-to-run JIT and
clock variability. Whole-app and other browser measurements remain necessary.


## Cross-platform held-out recovery and long hot-loop follow-up

[Reproducible corpus](../sims/branch-block-recovery-corpus.js) generates
120 deterministic bounded random conditional trees with seed-per-case,
then invokes an independent source-only parser on each compiler output.
The [pinned Linux/Windows run
43736928794](https://github.com/FlareZ123/obfs/actions/runs/43736928794)
reconstructed **210 variants from 105 admitted programs**, covering
**8,234 basic blocks** and **10,920 compared transformed/recovered executions**
with value or exception class/message equivalence. The other 15 generated
programs were conservatively declined because the root was not a
conditional expression. This result is limited to the emitted format
recognized by the attacker and observed input cases, including Symbols
and BigInts; it is not a general JavaScript program equivalence proof.

A 1.2M-call interleaved six-trial Node 22 profile
[43736748023](https://github.com/FlareZ123/obfs/actions/runs/43736748023)
measured one **2.606×** slowdown for the masked variant on Linux
mixed-positive/negative inputs, violating the 2.5× cap in that micro-run.
Its native median was only **6.64 ms**, so clock/JIT noise was a credible
confounder. The subsequent [12-million-call per-trial Linux/Windows run
43737145220](https://github.com/FlareZ123/obfs/actions/runs/43737145220)
passed the focused suite on both OS and produced:

| Workload | Linux plain | Linux masked | Windows plain | Windows masked |
| --- | ---: | ---: | ---: | ---: |
| Mixed positive/negative | 1.409× | 1.773× | 1.488× | 1.793× |
| Alternating zero/nonzero | 1.203× | 1.394× | 1.253× | 1.444× |
| Numeric/string coercion | 1.168× | 1.360× | 1.184× | 1.388× |

The longer trials suggest substantial short-run variance; both runs are
retained. The 2.5× budget is workload-specific. This transform is still
opt-in and does not establish an application-wide runtime ceiling. The
source-only parser recovering every admitted held-out format also means
that its masked mode has no demonstrated security advantage compensating
for the higher measured median slowdown.


## Why the numeric state mask is algebraically cancellable

Let q be a target case identifier (an unsigned 32-bit integer) and v
the result of the just-evaluated branch test. Define m(v) as ToInt32(v)
when typeof v is "number", and as zero for every other type. The
emitted branch encodes its target as

    state = ToUint32(q XOR m(v)).

Before entering the next block the dispatcher computes

    case = ToUint32(state XOR m(v)).

Bitwise XOR is self-inverse at all 32 positions, so

    case = ToUint32((q XOR m(v)) XOR m(v)) = q

for every possible Number value, including NaN, infinities and signed
zero. Non-Number types use a zero mask. The scratch test result remains
unchanged between the two operations. First dispatch starts with a
scratch variable whose typeof is "undefined" and therefore a zero mask.
The additional ToInt32 conversion runs only on primitive Numbers; it
cannot invoke user-defined object coercion.

A source-only attacker can apply this identity without knowing v,
the build seed, the runtime branch or a sampled execution. The
[independent recovery tool](../sims/branch-block-reconstruction.js)
implements exactly this cancellation across both published variants,
including the held-out corpus. This argument covers input/result values
and exception types/messages in the subset studied. Source-level stack
locations and function-string introspection differ, so external
observers still need an explicit application contract.


## Independent source-only integrity-tampering attack

[Reproducible tamper script](../sims/branch-block-tamper.js) parses only
the two public compiler-generated files using Acorn. With no access to
the original source or build seed, it toggles a single ciphertext bit
in each public encoded immediate and executes the modified source in
a separate Node VM context. The [pinned Linux/Windows run
43738417403](https://github.com/FlareZ123/obfs/actions/runs/43738417403)
reported exactly **7 modified public immediates** in each variant.
Across **1,025** integer inputs per variant, **all 1,025 returned
results differed** from the published version, while both altered
modules continued to execute without any integrity rejection.
This is a constructive bypass of the sample's absent integrity check.
It does not demonstrate bypass of a separately configured SCO
authorization boundary, nor does it imply every arbitrary tamper
will execute successfully. The experiment's verdict is unequivocal
for this published COO/SNO-local basic-block format: ciphertext
diversification alone supplies no tamper resistance.

## Compiler resource-bound proof

The AST lowerer now walks left-deep immediate chains iteratively
and declines expressions exceeding **32** native operations per
individual basic block. This avoids unbounded proof recursion and
caps the emitted arithmetic work per block. A pinned [cross-platform
gate 43737978022](https://github.com/FlareZ123/obfs/actions/runs/43737978022)
accepted and compared a 32-operation function against native
results, then conservatively declined 33, 64, 128 and 512-operation
examples without modifying their source. Separately, the focused
coercion-side-effect regression verifies that the runtime-number
state mask adds no primitive-conversion hook calls or error effects
for tested objects, with [Linux/Windows run
43738180843](https://github.com/FlareZ123/obfs/actions/runs/43738180843)
green. These strengthen the narrow semantic proof; they do not
establish equivalence for arbitrary JavaScript constructs.
