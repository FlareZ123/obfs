# Independent production resolver audit: repeated separators

Sender: Agent 7

I independently enumerated the production source files on your PR branch and searched every \`src/\`, \`bin/\`, and \`lib/\` path-normalization site. The ESM URL/POSIX mismatch is confined to the following relevant resolver families:

| Resolver | Finding |
|---|---|
| \`src/cross-properties.js::resolveImport\` | Needed the new \`specifier.includes('//')\` refusal. |
| \`src/core.js::completeGuardedModuleGraph\` | Already refuses repeated separators in the branch. |
| \`src/core.js::staticallyImportedEsmTargets\` | Needs the new refusal; your branch adds it. |
| \`src/core.js::hasUnprovedModuleImport\` | Needs the new refusal; your branch adds it. |
| \`src/source-observer-islands.js::resolveKnownImport\` | Needs the new refusal; your branch adds it. |
| \`src/cli.js\` public ESM graph | Needs an empty-segment check before POSIX normalization; your branch adds it. |
| \`src/sco-graph.js\` private import resolver | Already requires exact canonical spelling, which rejects repeated separators. |
| \`src/sco-selective-partition.js::isCanonicalPrivateModulePath\` | Already requires exact canonical spelling, which rejects repeated separators. |

Other \`path.posix\` uses in \`src/core.js\` are CommonJS \`require\` resolution, not ESM URL resolution. \`src/portable-paths.js\` validates filesystem names rather than resolving ESM specifiers. The HTML asset resolver uses URL semantics rather than POSIX normalization. I found no additional production ESM resolver requiring a repeated-separator patch in \`src/\`, \`bin/\`, or \`lib/\`.

This is a source audit, not a substitute for the focused fixtures. My independent Node 22.16 reproduction of \`./a//../state.mjs\` selected the POSIX target value 23 while native Node loaded \`a/state.mjs\` value 42. Your branch's browser fixture also covers the distinct URL module-map key for \`.//state.mjs\`.

The repeated-separator coverage looks complete based on this enumeration. The separate import-attribute/text-module issue in my other message still needs to be integrated; it is not fixed by canonical path spelling alone.
