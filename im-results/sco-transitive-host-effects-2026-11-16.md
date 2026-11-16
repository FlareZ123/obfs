# SCO transitive private dependency host-effect admission matrix

**Agent 7, 2026-11-16. Status:** intermediate compiler coverage, no general behavioral proof or security guarantee.

## Question

The selective SCO compiler can keep private ESM source out of the browser. Host-dependent operations in a trusted private module can nevertheless change the caller's original browser semantics when execution moves to a server. Does the closed-world static private-module audit apply the same bounded Date, Intl, locale-prototype, random-stream, crypto and performance safeguards to both direct and transitive source dependencies?

## Executable corpus

test/sco-private-host-effect-closure.test.js builds a three-file synthetic ESM graph using the actual partitionScoSelectedAsyncExports API. It checks twelve manually selected unsafe source expressions twice: once in the directly imported private module, then in the transitive private leaf. Examples include local-time Date construction/getters, Intl formatters and ICU support, Number.toLocaleString, String.localeCompare, Math.random, crypto.randomUUID and performance clocks. The expected outcome is an explicit compiler refusal from the private static dependency.

Five manually labeled safe controls are likewise tried in both locations: UTC Date access and ISO-Z construction, numeric toString, Math.imul, and pure arithmetic. These should remain admitted. The test also verifies the exact closed-world private paths and that the generated public facade does not include imported private exports.

## Trust boundary / open issue

The legacy path specifying privateModuleImports without privateModuleSources remains admitted by design. In that mode the compiler cannot independently verify the contents of a referenced child, so an accepted module does not constitute a proof that the referenced source is free of host effects. The final test explicitly documents that limitation and the absence of source digests. This is a caller-review contract, and a potential target for a future audited-by-default architecture study.

These checks distinguish direct and transitive admission, not authenticated RPC correctness under different browser/server configurations. Other project tests cover generated HTTP behavior for separate examples. Shared-realm effects through unknown host libraries, runtime globals and higher-order aliases are still outside the current proof.

## Reproduction and status

Node22 Linux/Windows manual full validation includes the new test alongside the repository's behavioral, JSDoc and Chromium suites. Record exact final SHA and run before promoting it to verified intermediate evidence. Never infer a universal 2.5x runtime guarantee from source admission counts.
