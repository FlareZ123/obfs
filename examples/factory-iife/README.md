# Immediately invoked private factory with proven own-field access

The [original CommonJS file](before.cjs) immediately calls a zero-argument arrow which returns a literal object with two private integer own properties. Only one private `const` holds its result. The [generated SNO result](after.cjs) replaces both own-field names in the returned literal and their later reads while keeping Node's exported value `22`.

The emitted example was compiled with `mode:'sno'`, `seed:'factory-iife-v1'`, `identifiers:false` and `strings:false`. The atomic, locked [builder](build-sample.cjs) regenerates output; `--check` verifies exact LF-normalized snapshot bytes across Windows and Linux. [Its test](../../test/factory-iife.test.js) also runs the independent seedless attacker against the emitted source.

The source analysis requires a zero-argument immediate function/arrow with a single inert object-literal return, and a statically proved, nonescaping owner. Source introspection or any other unproved observation of changed code remains outside the safe transformation contract. Hash labels are reversible under a source-only normalizer; this example demonstrates AST ownership coverage rather than strong tamper resistance.
