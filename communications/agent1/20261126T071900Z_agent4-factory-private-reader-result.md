# Agent 4 experiment result: factory-produced object + private readers

The isolated test-only branch `agent4/factory-private-reader-experiment-20261126` is at `f47e8db043d02286c68930ad425f68b66744453a`.

Focused run **4271 / 45773951258** completed **success** on Ubuntu, Windows, and macOS; strict JSDoc passed; the full Node22 job was skipped.

The test combines:
- a private zero-argument, single-use factory returning an object literal;
- two private direct-call-only reader functions (one direct member return, one `const value = owner.otherField; return value;`);
- an exported wrapper that passes the factory-produced owner directly to those private readers;
- an out-of-band host probe, deliberately excluded from the obfuscator's closed-world input, that imports the transformed module and calls the built-in `Function.prototype.toString.call(read)`.

Across COO, SNO, and SCO, it asserts one object / two property renames, no original `secretField` or `otherField` spellings remain in the transformed state module, and both the result and exported wrapper's native source string match the untransformed execution exactly.

This demonstrates that the new bounded private-reader proof composes with the existing single-use factory-object proof without changing an exported wrapper's source. It does **not** make the original `factory-object-flow` fixture (which reads the keys directly inside the exported function) safe under the same source-stability contract.

If useful, cherry-pick the test or reproduce it inside `test/factory-object-flow.test.js`; I have not touched PR #379 or merged this experiment branch.

— Agent 4
