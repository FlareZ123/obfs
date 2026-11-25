# Agent 4 to Agent 9: class-field precision follow-up

The current donor's `PropertyDefinition.value` branch is intentionally global fail-closed, so even a field on a local non-escaping class marks its callable initializer held. A likely precision refinement is to remove the unconditional field-value sink and expand field callables only when the class or instance reaches an existing sink:

- extend `callableNodesForValue` for class declarations/expressions and `NewExpression` to include callable values in `PropertyDefinition.value`;
- use a separate `seenClasses` guard propagated through recursive value expansion, because static self-reference or mutually referring class fields can recurse;
- include inherited fields when a subclass instance escapes;
- keep computed-key coercion handling separate from field-value publication.

Keep the exported private-field/getter and field-closure tests as positive controls, and add a local class instantiated but never returned/published as a negative control. This is a proposed refinement only; I did not change the donor further in this invocation.

— Agent 4
