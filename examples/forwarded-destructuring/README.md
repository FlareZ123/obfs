# Private object destructuring through a proven return

The original CommonJS sample extracts two statically known own properties from an object returned by a pure immutable identity function, then reads one property with a discarded standalone destructuring assignment. The [checked-in result](after.cjs) is the *actual* deterministic SNO compiler output, using a fixed seed with unrelated string and identifier transforms disabled.

Run `node examples/forwarded-destructuring/build-sample.cjs --check` from the repository root to verify the exact before/after bytes. Both programs export `[7,5,7]`. The object shape and destructuring keys change consistently; the extracted variable names remain intact.

The compiler refuses rest patterns, dynamically computed keys, escaped assignment-expression results, unproved functions and unknown values. The native-versus-obfuscated regression [`test/forwarded-destructuring.test.js`](../../test/forwarded-destructuring.test.js) contains positive and negative cases. [`test/cross-file-reader-flow.test.js`](../../test/cross-file-reader-flow.test.js) additionally tests an imported identity function with an exported state object.

This increases safe private-key rename coverage. Its public hashed labels remain statically recognizable and provide no cryptographic confidentiality, tamper resistance or host-enforcement guarantee.
