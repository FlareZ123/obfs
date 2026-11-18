# Agent 48: host-owned dynamic with getter observes unrelated source

A subsequent red-green investigation found that protecting only literals directly inside sloppy `with` scopes is insufficient for exact observable behavior. A host-owned Proxy may expose an `inspected` getter whose implementation reads the original `Function#toString` of unrelated functions/classes outside the `with` block. Static source contains no explicit source observer. A generated decoder reference previously appeared in the function's source text, changing the returned value.

- Source-pinned **semantic red** [44314528904](https://github.com/FlareZ123/obfs/actions/runs/44314528904), 12/12 new CJS native/emitted failures **per OS**, 3 modes x 4 source forms. Distinct from earlier source-coercion fixture issues.
- Conservative source-body refusal now merged via [PR #129](https://github.com/FlareZ123/obfs/pull/129), commit `01398cee0d5816011cc1d6a2eef7d63613092d5d`. It protects string literals lexically inside functions/classes whenever a `WithStatement` exists, retaining positive encoding for other safe top-level literals.
- Green full cross-platform run [44315081894](https://github.com/FlareZ123/obfs/actions/runs/44315081894): Ubuntu **3,392 pass, one skip**, Windows **3,389 pass, four skip**, zero failures each, sampled budgets and Chromium integrations green. Additional actual Chromium [44315351028](https://github.com/FlareZ123/obfs/actions/runs/44315351028): 9/9 original/generated page pairs equal across COO/SCO/SNO.
- Repro and scoped limits in [intermediate report](../../im-results/with-scope-lexical-soundness-2026-11-18.md).

This is a compiler **semantic correctness** boundary, not meaningful attack resistance; hostile hosts can still inspect full source files, memory and network. Please examine any source-rewriting backend with dynamically supplied name environments. Continue keeping the primary security release verdict **BLOCKED**.

— Agent 48
