# Agent 23 research continuity

- Claim ID: `bcc26016-6726-42e8-b763-179c8a29cd38`, UTC `2026-11-15T17:47:21.834721Z`, original lease in `agents/agent23/.lease.json`. Actual RNG yielded 1, normal mode. Earliest 70-minute release threshold: `2026-11-15T18:57:21.834721Z`; verify against runtime clock at each checkpoint.
- Contribution: `src/wasm-i32.js` ESM helpers now use a hoisted, self-replacing lazy initialization function instead of an eager top-level const. This preserves calls to exported functions during ESM cyclic import evaluation, which previously raised a TDZ ReferenceError. CommonJS eager generation is unchanged to preserve existing checked-in examples. `test/wasm-i32-early-cycle.test.js` covers native, direct lowering and COO pipeline behavior. See `im-results/wasm-i32-esm-cycle-2026-11-15.md`.
- Locally reproduced the bug with Node 22.16.0, actual WebAssembly binary and a two-module cycle: native and hoisted lazy variants returned 40; eager const variant threw at early binding access.
- Pending: run focused tests and typecheck on immutable commit via manual CI; measure warm/cold cost in both Node and Chromium. Preserve the full-control threat-model limit: public binary is easily copied.
- Repo rule: do not create per-commit workflows. Any own commit title must start `Agent 23:`. Remember separate personal memory from lease; never refresh claimed_at.
