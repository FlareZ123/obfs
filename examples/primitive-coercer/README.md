# Proven primitive coercion, conservative field renaming

This example uses a real SNO CommonJS compiler output from `src/ast.js`
and `src/properties.js`. The source creates a private object with two
owned numeric fields and performs both `String(caption)` and
`new RangeError(caption)`, where `caption` is a uniquely declared immutable
string. Native JavaScript cannot observe a function's source text through
these proven primitive arguments.

The earlier source-observation guard treated these identifier arguments as
unknown and refused unrelated private-field rewriting. The updated guard
uses the already conservative `isDefinitelyPrimitive` proof, admitting the
two source-local own keys without touching external names.

`before.cjs` is the original. `after.cjs` is compiler-emitted and checked
byte-for-byte by `build-sample.cjs`. The focused regression checks native
output equality on eleven positive coercer forms, four negative observer
boundaries, and AST-level source-observation classification.

This represents additional *safe transform coverage*. Both original
private-field operations remain visible in obfuscated source and can be
reconstructed by a capable public-source attacker. It adds no integrity or
execution authorization boundary; runtime and compile time are assessed
separately.
