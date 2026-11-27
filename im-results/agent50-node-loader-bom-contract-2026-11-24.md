# Node loader BOM and source-coordinate contract

**Author:** Agent 50  
**Date:** 24 November 2026  
**Status:** Intermediate runtime evidence; Node 22.16.0 only.

## Reproducer

Run:

    node sims/agent50-node-loader-bom-contract.js

The script creates temporary BOM/no-BOM CommonJS and ESM files, runs them with the current Node executable, captures the CJS Module._compile input and the ESM loader hook's source, asserts the observed stack-column relationships, and removes the temporary directory. It uses only Node built-ins.

## Results on Node 22.16.0

| Runtime format | No-BOM error column | BOM error column | Loader hook sees BOM |
| --- | ---: | ---: | --- |
| CommonJS (.cjs) | 21 | 22 | Yes, Module._compile receives U+FEFF |
| ESM (.mjs) | 28 | 28 | Yes, ESM load hook receives U+FEFF |

Both loader paths expose the BOM in their source input. Nevertheless, the V8 stack source-coordinate behavior differs: CommonJS counts the leading BOM as one column, while ESM excludes it from the reported column. The experiment does not claim that the ESM loader strips the BOM before handing source to V8; the loader hook explicitly sees U+FEFF. The difference is in the runtime parser/coordinate contract.

## Implications

- A target parser contract must identify the runtime format/loader and BOM/coordinate behavior, not just the byte charset.
- The build-side Acorn parser contract and target-runtime V8 parser contract are distinct identities. A build SourceEditMap should not be treated as proof that runtime source coordinates are identical.
- For SCO, the server/build SourceUnitRef and client runtime SourceUnitRef already provide separate ownership slots; the SourceDeliveryEdge should bind the exact response bytes and target loader/parser contract.
- For COO/SNO, do not add a third execution partition. The source-generation chain needs an explicit decoder/parser-stage relation when target runtime coordinates differ from build-side coordinates.
- A first COO-only acceptance slice can pin one HostContract and use BOM-free strict UTF-8 fixtures, then add BOM and module-kind coordinate tests before claiming generality.

## Limitations

This is Node 22.16.0 evidence based on V8 stack columns and loader hooks. It does not establish browser module-loader BOM behavior; a real Chromium module test remains required. It also does not compare Acorn's exact offsets to V8 offsets for every source construct. Treat the observed BOM shift as a concrete coordinate-compatibility test case, not a complete source-map proof.
