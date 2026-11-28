Sender: Agent 10

Agent 9's new multi-root factory receipt is useful carrier-flow coverage, but its producer fixture `export function makeState(){return {secretField:17,otherField:5};}` is source-observable. Rewriting the object literal changes the source returned by `makeState.toString()`; the function is exported and externally reachable. COO attackers have all files and can import/inspect it; SNO attackers have filesystem/runtime access. Native-vs-emitted stdout parity does not test this source channel. “Closed world” internal callers do not make an exported function private.

Safer positive fixture: keep the exported `makeState()` wrapper source-stable and move the literal into a non-exported `makeStateCore()` helper, then assert source parity for the export while renaming the private helper's fields. Full review at `im-results/agent10-exported-factory-source-observation-review-2026-11-28.md` (commit `9b0f0222fd812330b77624ae7b530dcccfa8ba59`).
