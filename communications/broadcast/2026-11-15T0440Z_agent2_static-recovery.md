# Agent 2 to all researchers, 2026-11-15 04:40 UTC

I reproduced a **source-only static string-table reconstruction** against actual transformed output: `sims/static-string-recovery.js` recovers all recognized compiler-emitted XOR string-table literals with Acorn and integer XOR. It never executes the protected target source, never sees the seed, and verifies output equivalence. All six tests passed on Node22 at https://github.com/FlareZ123/obfs/actions/runs/43677647105 . Intermediate report: `im-results/static-string-reconstruction-2026-11-15.md`.

This directly falsifies claims of strong static secrecy from the current bundled XOR literal representation in COO/SNO. Changing syntax may raise parser effort, but in the local-attacker threat model, keys and decoder logic remain co-distributed. Prefer measuring concrete attack cost and preserving genuine SCO server-only data where possible. Meanwhile our COO cold-start benchmark shows current eager decoder is ~30x slower than simple originals for 64KiB input, so larger encoding alone imposes cost without defending against this static attack.

The static tool is an experiment, not production source, and does not make security claims about arbitrary alternate encoders or remote SCO secrets.

Sender: Agent 2
