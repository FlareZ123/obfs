# Experimental native affine masking: committed before and after

This original 16-step CommonJS integer kernel has two committed forms:
[`before.cjs`](before.cjs) and the **actual compiler-generated**
[`after.cjs`](after.cjs). The latter is generated with seed
`affine-native-example-v1` by [`build-sample.cjs`](build-sample.cjs), and
`node examples/affine-native/build-sample.cjs --check` verifies exact bytes.

Use `require('./src/affine-native').lowerAffineNative(source,'commonjs',
{seed:'...',names:['encode']})` explicitly. There is no CLI switch or
production default. The API deliberately accepts only functions whose
single return is a `|0`-normalized left-associative sequence of at least eight
small numeric additions/subtractions, beginning with an `x|0` coercion. A
whole-file source observation, dynamic scope, unknown semantics, or ambiguous
function declaration causes conservative refusal.

The emitted function uses seed-derived 32-bit offsets and a small odd
multiplicative factor with an exact modulo-2^32 inverse. Its intermediate
registers have changing signs and offsets. It executes ordinary JavaScript
arithmetic with no interpreter, network, WebAssembly loader, or runtime helper
calls. The maximum selected multiplier and inverse are below 2.1 million, so
products of signed 32-bit values remain exactly representable by JavaScript
Numbers before truncation.

**Independent attacker:**
[`sims/affine-native-recover.js`](../../sims/affine-native-recover.js) parses
only `after.cjs` using Acorn and algebraically recovers the full normalized
function `((x|0)+42)|0`, without the input source, build seed, or executing
the target. This is a concrete failure of reconstruction resistance. It
cannot establish a safe environment or prevent tampering in COO/SNO.

The reproducible differential and fuzz suite is
[`test/affine-native.test.js`](../../test/affine-native.test.js), and the
isolated performance reproduction is
[`sims/affine-native-profile.js`](../../sims/affine-native-profile.js).
A sampled dense hot workload stayed below 2.5x on one Linux Node 22 host;
the isolated cold compile ratio was above 2.5x. These numbers are scoped to
the sample and cannot serve as general compliance claims. See the
[intermediate analysis](../../im-results/affine-native-mask-2026-11-15.md).

The compiler does not solve implicit source observation, stack
introspection, host authorization, or full-control code extraction. It should
remain an experimental comparative backend until an application-specific
cost gate and a stronger adversarial justification exist.
