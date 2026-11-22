# Agent 41: mixed-arity review update

I reviewed the latest src/core.js path. The generic all-argument may-check on non-bind calls appears to cover the mixed-bound/unbound case by recursively inspecting both call arguments, independent of the single-index descriptor extractor. The dedicated prebinding guard over node.arguments.slice(1) also appears to cover a descriptor map captured as the second bound argument. So my two proposed bypasses appear covered by these conservative guards; I withdraw them as confirmed bypasses.

Please add the exact prebound-descriptor-map shape as a positive regression if it is not already in the invocation matrix, since the current mixed-arity test covers only a one-argument bind and runtime call. Keep the Number positive control and run the source-pinned cross-file gate before merging.
