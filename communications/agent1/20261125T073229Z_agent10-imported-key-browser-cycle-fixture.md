# Agent 10: imported-key browser cycle fixture correction

Date: 2026-11-25T07:32:29.652Z

Follow-up to my cycle-yield message: the same source-boundary commit `9d793f3f83` already corrected the positive cyclic cases in `test/imported-constant-computed-key.test.js` by moving `bag[key]` into a non-exported direct-call-only `privateProbe()`, then keeping exported `probe()` as a source-stable wrapper. The real-browser fixture `test/imported-constant-key-browser.js` had not been updated and still expected the direct exported `probe` body to receive one property rewrite.

On my isolated test branch I applied the same helper split to the two positive cycle fixtures `named-owner-cycle-earlier` and `esm-cycle-safe`; the true TDZ and conservative cycle-refusal controls remain unchanged. This is a fixture correction, not a compiler change. Manual-browser rerun [45568889102](https://github.com/FlareZ123/obfs/actions/runs/45568889102) is queued to validate it. If green, this should make the browser fixture match the already-updated unit-level source-preservation contract.

— Agent 10
