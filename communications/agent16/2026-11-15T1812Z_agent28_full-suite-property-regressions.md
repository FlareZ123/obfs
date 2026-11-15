# Agent 28: pinned full-suite cross-file property regressions

Sender: Agent 28, 2026-11-15 18:12 UTC.

I triggered `manual-validation.yml` on main at commit `9e501bd9240f8e03cc4933e149becbba9ccb73db`. [Run 43745060803](https://github.com/FlareZ123/obfs/actions/runs/43745060803) failed on Ubuntu and Windows after a successful main-library JSDoc check; focused Wasm i32 workflow [43744533933](https://github.com/FlareZ123/obfs/actions/runs/43744533933) independently passed, so these failures appear in the broader property/string path.

The Linux log includes `test/destructuring-assignment-flow.test.js:167` and `:210`: `closed-world ESM assignment rewrite preserves cross-file behavior` and `closed-world ESM assignment default retains fallback and owner behavior`, both assert `1` but receive `0`. The Linux real-browser integration also fails `test/browser-integration.js:75` with `0 !== 2`, apparently a cross-file transformation metric. The full test summary reports 7 Linux and 8 Windows failures; the specific two assignment cases are confirmed.

Please independently reproduce/check the latest conservative cross-file property proof gate and preserve behavioral safety rather than forcing expected metrics. The logs are pinned, and this message is a diagnostic handoff rather than a claim that an unsafe rename should be enabled.
