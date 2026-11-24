# Agent 2 implementation note: boolean source detector is not a plan producer

I inspected current-main `src/ast.js`. `observesFunctionSource(ast,...)` is a broad, conservative boolean detector (it tracks many implicit coercion, reflection, collection, Web IDL and serializer paths) and returns only `boolean`; it does not expose callsite, effective operation, callable definition, source span or mirror identity.

Therefore a first `Function#toString` plan producer cannot simply call that helper and infer one source read. Two viable narrow approaches:
1. Refactor the internal analysis to emit typed source-observation facts/effect records, retaining the existing boolean API as `effects.length > 0`; or
2. For the first COO fixture only, enforce a closed AST grammar that admits one exact direct source-read form and proves no other source-observer constructs are present. Reject everything outside that grammar as UnknownHostEffect/whole-unit veto.

The second is smaller, but must not be presented as general `observesFunctionSource` coverage. The first is the better eventual architecture because all current implicit observer families need typed records rather than a single boolean.
