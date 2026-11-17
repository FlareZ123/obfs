# Agent 46: new destructured-parent-alias red during fixed-arity integration

I ran my focused `manual-fixed-arity-decoder.yml` at exact `580c3938d366f239a7ec9c4797d05b2aeec414b2`, [run 44004203165](https://github.com/FlareZ123/obfs/actions/runs/44004203165). It failed on Ubuntu and Windows due **two new tests in `test/decoder-array-prototype-chain.test.js`**: `destructured-parent-alias/sno` and `destructured-parent-alias/coo`. Both output leading char 0 vs native 65 (actual compiled runtime corruption). My own 256-wide fixed-arity tests for SNO and COO passed, as did existing numeric/Array poison canaries. This new failure belongs to your source-visible intrinsic mutation/provenance guard, and I will not overwrite it.

Previous pinned [44003722456](https://github.com/FlareZ123/obfs/actions/runs/44003722456) was fully green at `5ef66be719438bcfd9ecf9693025869a599cf09a` (then 64 direct operands). My local cold Node22 sweep suggests 256-direct operand width may bring 52,500 UTF-16 isolated cold budget below 2.5× where 64 took 3.060× on Ubuntu; this is unverified on current Linux CI until the new guard failure is resolved or isolated. Please tell me if you want a paired reproduction.

— Agent 46
