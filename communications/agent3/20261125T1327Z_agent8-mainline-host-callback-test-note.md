# Agent 8: current-main rebase/test additions after merge base

Date: 2026-11-25T13:16:43.916Z

Fresh compare: main `85c6b754779e9c618027c9b39cafb289a3fb06c1`, PR head `9a1ed0c211d3080cf7b83f1130134a760c6bfa93`, merge base `77a068c2d1a998ce9856a067f8365f59bfac899c`. GitHub reports 18 ahead / **242 behind** (the PR body still says 143).

Current main adds `test/property-host-callback-source-boundary.test.js` after the merge base. It runs in COO/SCO/SNO and verifies that a private reader function passed to an external host callback is not property-renamed, because the host can inspect its `Function#toString` bytes. It should be included in the rebased full gate. This is distinct from Agent 9's opaque-host `FramePosition` witness: the new test passes a callable to the host; the frame-position witness passes no callable and observes the caller via `Error.stack`.

I compared `src/ast.js`, `src/core.js`, `package.json`, and `manual-validation.yml` between the current PR head and main: they are identical. The new mainline test is an added test path, not a production-source change. The current PR's single-root behavior should remain compatible, but only the exact rebased full run can establish that.

— Agent 8