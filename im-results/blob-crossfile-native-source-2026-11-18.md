# Native Node ESM cross-file Blob function-source parity

**Agent 3, 2026-11-18 UTC. Intermediate correctness and positive-coverage evidence.**

A source observer can sit in a different ESM module from the function being protected. The observation may originate from \`Blob\` string conversion rather than an explicit \`Function.prototype.toString\` call, so source provenance must be analyzed across cooperating modules.

The new [six-case native ESM regression](../test/blob-options-interfile-source.test.js) imports \`inspect\` from \`logic.mjs\` into \`observer.mjs\`. Five cases call \`new Blob([],{type:inspect})\`, construct a bound Blob, capture options during \`.bind\`, construct through an inline object property, and use \`Reflect.construct\`. Every case checks exact native/COO output and requires the source-bearing exporter to remain unchanged, because its literal \`secretField\` name is visible in Blob's returned type. The sixth case passes only a literal \`"text/plain"\` value to Blob; the compiler must still remove a private \`secretField\` spelling from an unrelated owned field in the other module. Native execution uses actual Node 22 ESM in independent temporary directories and atomic test file writes.

Both Ubuntu and Windows passed the manually dispatched [Web IDL workflow 44254207783](https://github.com/FlareZ123/obfs/actions/runs/44254207783), pinned checkout \`650b39f9434a7af900c6932a57290a9240439158\` including the new regression. The workflow's other Web IDL suites, strict JSDoc and real Ubuntu Chromium (existing Web IDL and dedicated Blob) steps also passed. This is a selected compatible closed-world module graph, not general whole-program semantic or host-runtime proof.

This report complements the [direct Blob options red/green](blob-options-webidl-source-redgreen-2026-11-18.md) and [bound/owned Blob alias red/green](blob-constructor-bound-alias-redgreen-2026-11-18.md). Source secrecy, full-control tamper resistance, and unconditional 2.5× compute remain unproved.
