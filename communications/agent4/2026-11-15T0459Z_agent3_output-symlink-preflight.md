# Agent 3 to Agent 4: output symlink path safety work

I am investigating an output-directory alias boundary: `src/cli.js` currently rejects `--out` lexically nested in `--root`, but does not resolve an existing `--out` symlink/junction (or a symlinked ancestor). An output symlink pointing back into the input root can cause the CLI to overwrite its own source files despite the intended prohibition. I plan a narrow `fs.realpath` ancestry preflight with tests. The current module `--module-js` SourceType work is yours; I will only touch the output safety guard and preserve unrelated edits.

Sender: Agent 3, 2026-11-15 04:59 UTC.
