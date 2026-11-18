# Bound native RegExp/String constructor function-source observer

**Agent 3, 18 November 2026 UTC. Intermediate semantic correctness.**

The project's earlier unbound \`RegExp\` and \`String\` ToString guards did not model native bound constructor identities and shifted argument positions. Such functions can expose function source through a RegExp pattern, invalid flag SyntaxError or returned String value, including indirectly through \`Reflect.construct\`.

## Native reproducer and required semantic boundary

A native Node 22 \`new (RegExp.bind(null))("abc",protectedLabel)\` fails with a SyntaxError containing the original \`protectedLabel\` function body, and \`new (String.bind(null))(protectedLabel).toString()\` returns its original source. Similarly \`RegExp.bind(null,"abc")(protectedLabel)\` shifts the flags operand to position 0 of the eventual call. This means the syntactic first argument alone cannot determine which native \`RegExp\` operand is stringified after \`bind\`.

The new [12-shape native differential](../test/bound-native-constructor-source-observer.test.js) covers bound RegExp pattern and flags, prebound pattern/flags, \`Reflect.construct\`, identifier aliases, owned records/destructuring, bound String construction, regular invocation and captured String argument. Each case requires native name-sensitive observation, compiler source detection and COO/SNO output parity. A primitive-only control demands **two actual renamed private fields in each mode**.

**Red:** manually dispatched [two-platform run 44255238333](https://github.com/FlareZ123/obfs/actions/runs/44255238333), immutable source \`c99d6af3a3457da3d1cfe7127342fdbd99b5d4f8\`, observed \`RegExp bound pattern must be a source observer: false !== true\` on both OSes. Each runner reported **157/158 passed, 1 failure**; native and primitive-positive controls passed.

## Fix and green differential

\`src/ast.js\` now tracks \`boundRegExpConstructors\` and \`boundStringConstructors\` as monotone fixed-point alias sets, alongside owned-record property maps. Local object initializers, member assignments, identifier aliases and destructuring propagate these aliases. The source analyzer recognizes inline native \`.bind\` and scans all explicitly supplied operands to conservatively handle shifting arity. Captured arguments at direct native \`.bind\` calls are also inspected.

**Fix commit:** \`c03a77cf5cfb5003f6fdc04baba2937c9adf246c\`. The next manually dispatched [two-OS Web IDL/source-observer workflow 44255420455](https://github.com/FlareZ123/obfs/actions/runs/44255420455), pinned to this exact commit, **passed** selected Node 22 semantic tests, strict JSDoc on both OSes and the existing dedicated Blob/Web IDL real Chromium suites on Ubuntu.

The result does not prove precision for arbitrary native constructor mutation, dynamic property discovery, proxy forwarding or instrumentation. It does not demonstrate material resistance above equal-trust ordinary minification or satisfy a universal 2.5× runtime bound.
