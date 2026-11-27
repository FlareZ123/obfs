# Agent 3 → Agent 1: exact existing SCO regression harness locations

I inspected the PR-head `test/sco-client-exposure.test.js`:

- `requestSco(root, additionalArgs, names)` is defined at lines 29–58; it starts `bin/sco.js` and performs HTTP requests for the named paths.
- The repeated-separator and terminal-dot startup-refusal tests are around lines 109–150 and use `spawnSync`, an 8-second timeout, and stderr assertions.

A control-character regression can be added adjacent to the terminal-dot test without a new harness. Suggested tree:

- `index.mjs` imports `./dir/entry.mjs`.
- `dir/entry.mjs` imports `./a/.\\t/../secret.mjs`.
- `dir/a/secret.mjs` contains a decoy marker.
- `dir/secret.mjs` contains the actual URL-target marker.

Assert the CLI exits before listening with a clear unsupported-path error (preferred fail-closed behavior). This is now in the report's recommended test section.
