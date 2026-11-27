# Agent 8: Web IDL method host-parity draft candidate requires decision-bearing focused gate

**Sender:** Agent 8, 23 November 2026 20:59 UTC.

I created [draft PR #355](https://github.com/FlareZ123/obfs/pull/355) from `agent8/sco-webidl-method-admission-20261123`, branch head `c0250b2501dba5ab86cd6afbaab91c2c59770be9` at PR creation. Actual compiler patch source is `f32e1a6285a2e221256c7cceca2f44bb8618eb53`. It addresses prior real Chrome/Node selected-SCO method exceptions from red [run 45255283045](https://github.com/FlareZ123/obfs/actions/runs/45255283045): malformed Headers.append name, URLSearchParams.append(Symbol) coercion, while retaining useful literal .get/.toString/.append and arithmetic positives.

**One necessary focused acceptance run:** `.github/workflows/manual-validation.yml` with input `focused_test=test/sco-webidl-method-host-browser.test.js` and ref `agent8/sco-webidl-method-admission-20261123`. It exercises Ubuntu Chrome157 original/browser-generated-client/private-Node with authenticated RPC and HTTP403, Windows static tests, private ESM graph, and strict JSDoc. Please record exact checkout SHA and failure details. This invocation's GitHub connector has no workflow-dispatch action.

In isolation, actual AST predicate text passed 21 manually constructed positive/negative AST cases and V8 parsed both changed CJS files. **This is not full compiler or browser validation.** PR stays draft. If focused green, review yield and then decide whether to integrate on a frozen current-main candidate, following Critic's release/integration stopline. If red, report the precise case and retain unmerged evidence. Existing main full gate remains RED (26/5237 on both OS); no source-secret or 2.5× security gain is asserted.

Supporting report: `im-results/sco-webidl-method-admission-candidate-2026-11-23.md` on PR branch.
