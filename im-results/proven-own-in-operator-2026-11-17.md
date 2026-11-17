# Proven private-property membership lowering for the `in` operator

**Agent 1, 17 November 2026.** **Intermediate engineering result.**
Only a small bounded extension to property-rename coverage is claimed.
This is not an established deobfuscation-resistance breakthrough, and
the published-file attacker below readily reconstructs the example.

## Semantic argument

For an ordinary, initially literal-owned JavaScript record `O` with an
own data property `k`, `"k" in O` is a membership query on its current
property set. The repository's existing `proveLocalObject` accepts an
owner only when the binding is proven private, its aliases/functions are
tracked, all access paths are statically known, and the object cannot
escape to unproved consumers or have its fields deleted through ordinary
syntax or reflective APIs. It also refuses source observers that would
distinguish the original spelling.

The positive transformation now admits `"k" in O` **only** when the
left operand is a direct string `Literal`, the right side is a proven
owner alias, and `k` is verified against the original **own fields**.
The compiler rewrites that exact literal to the same seeded new key used
in the object declaration, dot/computed reads and destructuring.
The transformation retains the `in` operator and receiver evaluation.
That last property matters when a lexical owner is read before its
initializer: reducing the expression to the constant `true` would
incorrectly suppress the original temporal-dead-zone exception. The
rewritten `"newKey" in O` still references the owner, preserving the
ReferenceError and original control effects.

The change is implemented in `src/properties.js` as an additional
`inChecks` proof result and `inOperatorPropertyEdits`; every consumer
updates consistently: local `renameLocalProperties`, closed-world ESM
`renameCrossFileProperties`, and opt-in `symbolizeLocalProperties`
(the latter writes the created private Symbol identifier as left operand).
Unknown/prototype keys, dynamic left expressions, owner escapes, dynamic
source observation, mutation through opaque methods and foreign-shape
function calls retain conservative refusal. No new global builtins or
runtime decoder are injected for ordinary string field renaming.

The syntactic argument does **not** prove compatibility under an opaque
host module that can observe or modify the exported record, a hostile
modification of the compiler runtime, or novel unclassified source
observers. Existing closed-world integration assumptions remain essential.
Finite differential tests alone cannot prove general JavaScript
equivalence.

## Native/ESM/Symbol evidence and known unrelated baseline failure

`test/property-in-operator.test.js` verifies COO and SNO real
CommonJS execution against native for positive cases (single/alias
owner, simultaneous member read, writes, sequential owning records)
and negative controls (inherited field queries, dynamic keys,
side-effectful computed keys, reflected owner shape, deletion, foreign
function call shape). It also uses actual Node ESM process loading for
closed-world consumer membership and native Symbol-key lowering.
The later version adds interprocedural and early-TDZ positive fixtures,
an inherited getter control, and function-source refusal.

Initial red behavior at original compiler SHA
`6c42c2dc19661c302a1f2fd30ff05dab179868ec`:
[manual cross-reader run 44125281129](https://github.com/FlareZ123/obfs/actions/runs/44125281129)
had 9/17 targeted new tests fail on both Windows/Ubuntu, primarily
because the original proof deliberately refused `in` operands.
After changes, all **17/17** focused cases passed on both OS in
[run 44125604512](https://github.com/FlareZ123/obfs/actions/runs/44125604512)
at `69fa11ab507b7a6e51f2cc47cc6f5827db0a31a0`.
A separate full cross-file reader step failed a **previously existing
positive-yield regression** (`test/cross-file-reader-flow.test.js`:
"imported reader is safe across multiple consumers", expected rename=1,
observed=0). Its origin predates this patch: the exact untouched base
`d2ae352734ae84ecfa211a0ff761302774b1a0f0` independently
reproduced the same subtest-74/226 failure on Windows and Ubuntu in
[run 44126003165](https://github.com/FlareZ123/obfs/actions/runs/44126003165).
The baseline issue was sent to the related source-proof researcher
in `communications/agent3/2026-11-17T1630Z_agent1_baseline-cross-reader-yield-regression.md`.
It is neither evidence of a semantic discrepancy in this patch nor an
excuse to mark the failing broad suite green.

A separate manual Symbol/Chromium validation avoids attributing the
existing cross-reader baseline to this new feature. Both Windows and
Ubuntu **passed** at exact
`ce553429984e3083fad9bfb0e565afbe45627664`,
[run 44126784959](https://github.com/FlareZ123/obfs/actions/runs/44126784959):
focused real-node/ESM/negative tests, the existing private Symbol suite,
real Chromium on Ubuntu, strict base and external JSDoc, and a new
native-vs-emitted hot `in` workload. The expanded source-only attack
follow-up also **passed** on both OS at
`aba4d42ab0d71658146eba8f1c470dec43390d2d`,
[run 44127272851](https://github.com/FlareZ123/obfs/actions/runs/44127272851).
The later [run 44127600036](https://github.com/FlareZ123/obfs/actions/runs/44127600036)
at exact `58508fd9ebf9a0970079ed60cf077d0d6607aac1` passed
**both Windows and Ubuntu**, including expanded TDZ/interprocedural,
prototype and source-observation controls, strict JSDoc checks, the
existing Symbol backend tests, the published-only attack, and Ubuntu
real Chromium. It is the final behavioral pin for this report.

## Actual Chromium ESM and external host surface

The additional `test/property-in-browser.js` runs native, string-key
renamed and Symbol-key variants of the **same two-file browser ESM
application** under headless Chromium. A separate page-owned method
`window.externalBridge.accept` is present before the ESM entry loads.
All variants compute exactly `[true,7,true,11]`, and the external
bridge spelling remains verbatim in the generated entry module.
The string-key variant demonstrably rewrites one private own key,
including its membership literal, and the Symbol variant creates one
private symbol. No external host API field is renamed. This is
browser semantic parity under the supplied page; it is not resistance
to an instrumented browser that can import every file.

The first Chromium-containing pinned run
[44128236626](https://github.com/FlareZ123/obfs/actions/runs/44128236626)
at `0a6598281c7406f1c688406ec68bdfcaf2ac4172`
**executed Chromium successfully** and printed that result, then
failed the new browser fixture's JSDoc address narrowing. We fixed
that type issue without modifying the runtime proof. The subsequent
[44128613641](https://github.com/FlareZ123/obfs/actions/runs/44128613641)
at exact `671a287a65c94ec7414d31af98437c4b729aaeb1`
passed **all steps on Windows and Ubuntu**, including the Chromium
ESM proof and strict external/base JSDoc. This is the current
full focused source pin.

## Runtime and static attacker measurements

`sims/property-in-operator-profile.js` measures the identical
1,000,000 / 10,000,000 / 25,000,000 iteration closed-owner loop under
native CJS vs renamed CJS (COO and SNO settings), 13 alternating
same-process warmed samples each. The observed emitted/native
ratio-of-medians across both OS and all six configurations was about
**0.990 to 1.030** at the first green evidence pin; at 25,000,000
iterations it was **~1.000 Windows** and **0.998 COO / 1.010 SNO
Ubuntu**. The source size increased from **215 to 220 bytes** on the
selected private-field kernel. These are in-process hot-loop measurements,
with startup, IO, remote network, ESM graphs, client idle, and real
application work excluded. They do not prove the required hard 2.5×
bound for every input and environment.

`sims/property-in-operator-static-recover.js` is a small public-only
AST normalizer. It receives the emitted source but no original file,
seed, or private compiler state, identifies one `_p[hex]`-named
owner field, and rewrites its literal, direct access and `in` probe
to the neutral `x` key. On Node 22 Ubuntu and Windows, the independent
normalizer reconstructed the three sites and produced a runnable
**160-byte clone** from the **193-byte emitted example**; native
reference was **188 bytes**. All ten held-out integer inputs matched.
Individual measured attacker parse/edit work was **0.445–1.604 ms**,
depending on runner/first-call startup. It is a trivial attack on this
small case and provides no practical source confidentiality guarantee.
The attacker can also simply execute the supplied obfuscated file.

## Decision

Admit this as a narrowly sound **positive property-coverage** improvement
only after the complete final differential/typechecking pin is green and
a reviewer confirms that the additional `inChecks` summary cannot be
overgeneralized through unproved cross-file aliases. Preserve the known
cross-reader positive-yield baseline failure as a separate issue.
Do not rank the private-member rename alone above ordinary minification
on reconstruction hardness: the immediate public-only AST attack shows
why that claim would be unjustified. For a release, source-observer safety,
host APIs, cold/full-session performance and hostile runtime security
still require distinct application-scale evidence.
