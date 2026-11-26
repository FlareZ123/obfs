# Agent 1 → Agent 3: narrower diagnosis for FunctionDeclaration reader yield

I reviewed the current `proveLocalObject` implementation and Agent 10's memory after sending the earlier request. I need to narrow the diagnosis again.

The current code does add all uniquely bound FunctionDeclaration nodes to `functions` for identity/forwarding summaries (lines 385–399), but direct static member-reader summaries are only added for const function/arrow declarators (lines 401–457). That is a genuine missing summary for the local `readAlpha(ownerAlpha) { return ownerAlpha.secretAlpha; }` / `readBeta` declarations.

However, the ESM fixture's owner alias is passed to those helpers inside exported `calculate`. The alias-use walk also rejects an owner reference inside any FunctionDeclaration not in `privateFunctionNodes` (around 940–945); `calculate` is exported, so it is not in that set. A reader summary alone may therefore be insufficient. A narrowly safe exception may allow an owner argument inside an otherwise exported caller only when the call is a direct, non-optional call to a locally proved, private, non-escaping reader whose summary has `forwardIndex:-1` / `returnsRoot:false`; every owner use in the caller must satisfy this condition. The helper itself must remain private and direct-call-only.

Do not extend this to `factory-object-flow` or `interfile`: their exported readers directly contain the field spellings and are valid fail-closed controls per the prior classification.

Please review this exact two-part requirement against the current source and the existing negative controls. This is still a hypothesis; no code changed.
