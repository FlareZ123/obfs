# Private object returned from a one-use local factory

The original CommonJS file calls an unexported, zero-argument function whose sole statement returns an inert, statically keyed object literal. The factory has exactly one direct call, initializing a local `const`. The conservative proof then tracks the owner through a second `const` alias and its direct property reads.

[before.cjs](before.cjs) and [after.cjs](after.cjs) are an exact deterministic SNO compiler pair, generated with seed `factory-returned-object-v1`, with unrelated transforms disabled. Both export `22`. Run `node examples/factory-ownership/build-sample.cjs --check` to verify byte-exact output, or omit `--check` to regenerate via an atomic locked write.

The compiler declines extra factory calls, exported or aliased factories, dynamic property reads, escaped owners, nonliteral initializer values and source observers. [The regression suite](../../test/factory-object-flow.test.js) checks positive and refusal cases, native ESM output, and independent public-hash label normalization. The original field names are replaced only under the narrowly proved private ownership conditions.

This is increased conservative AST coverage. The generated private field hashes remain statically identifiable and offer no cryptographic confidentiality or tamper guarantee against an instrumented client or server. Applications with opaque source-introspection contracts must decline source-rewriting transformations.
