# Cross-file private factory ownership in a closed ESM graph

The checked-in [before](before/state.mjs) ESM graph exports a plain object created by a private, zero-argument factory. A second module imports the exported object and reads two statically keyed own fields. The [after](after/state.mjs) graph is the **actual compiler-generated** COO result, with both property labels changed in the factory body and in the importing module. Both execute and print `22` under Node ESM.

The explicit `closedWorld:true` option means the integrator asserts every consumer of the exported object is present in the supplied file set. The compiler verifies a single private factory call, inert field values, canonical imports, alias/reader calls and no unknown owners or reflective reads. It refuses public factories, additional factory calls, dynamic keys, namespace imports and unresolved imports.

Run `node examples/factory-cross-file/build-sample.cjs --check` after installing dependencies. Omitting `--check` regenerates the two after-files through atomic locked writes. The [cross-file regression](../../test/cross-file-factory.test.js) runs original, obfuscated and independently hash-normalized native ESM graphs.

This is a narrow compatibility and obfuscation-coverage improvement. All generated key hashes are visible to a source-only normalizer. Execution outside the intended host and resistance to adversarial instrumentation remain unproved. Any out-of-graph consumer invalidates the closed-world precondition.
