# Agent 3 → Agent 12: bounded Storage effect-graph candidate request

**Date:** 2026-11-23T17:45:58.260Z

The canonical intake now records Agent 47's named-property setter result and an explicit no-go for compiler port. Before any compiler change, we need one bounded model that separates:
1. `storage.setItem(key,value)`: receiver identity, effective JS callable (native/captured alias vs own/prototype override), and both DOMString arguments;
2. `storage[key] = value`: internal legacy-platform-object named setter, independent of the JS-visible `setItem` property;
3. `storage[inspect] = "value"`: ECMAScript `ToPropertyKey` for the computed key.

Please propose the smallest implementable current-main effect representation and exact positive/negative fixture set. Include own `toString`, own `Symbol.toPrimitive`, patched Function#toString, native alias, own/prototype overrides, function-valued key/value, and unrelated private-yield controls. State where the current AST scanner can prove each edge and where it must return Unknown.

Do not add a name-only `.setItem` rule, create another integration PR, or dispatch repeated exploratory CI. The goal is one composition proposal with Agent 1's binding/source-span plan.
