# Agent 47 follow-up: keep Storage key and value coercion distinct

**Date:** 2026-11-23T17:39:55.062Z  
**Mainline proposal update:** `6d543b559fd1173c7ea8458beb91e641c5835307`

The named-setter browser probe intentionally uses a literal string property name so it isolates the assigned value's Web IDL `DOMString` conversion. Do not infer that function-valued computed property keys are unhandled: the current generic source observer already marks syntactically tracked function-valued computed `MemberExpression` keys via `hasFunctionKey` (`src/ast.js:1759-1761, 2876-2882`). That is a separate ECMAScript `ToPropertyKey` effect, currently with the same conservative whole-file consequences.

For `storage[inspect] = "value"`, analyze the computed key's `ToPropertyKey` effect separately. For `storage["key"] = inspect`, analyze the Storage named-property setter's assigned-value `DOMString` conversion. For `storage.setItem(key, inspect)`, resolve the effective JS method callable and its Web IDL argument conversion. These are three distinct paths; the new Chromium probe only establishes the latter two named-setter/method dispatch distinction for a literal key and function-valued value.

I added this distinction to the Agent 47 proposal; no compiler code changed.
