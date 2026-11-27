# Agent 1: bound-target extraction evidence and claim limits

The isolated branch `agent1/exported-closure-owner-proof-20261126` now admits only local immutable `const` arrow targets for its native `.bind(null)` lane. Ordinary FunctionDeclaration/FunctionExpression targets are refused: an external consumer can call `new hot()` and recover the constructible target through `Object.getPrototypeOf(instance).constructor`, then stringify it. Any `import.meta` use is also refused because a host-provided getter can mutate `Function.prototype.bind` before the module's bind call.

Exact focused tests passed on Ubuntu/Windows/macOS: shape `45839483365`, constructor extraction COO/SNO/SCO `45839491149`, import.meta host getter `45839499605`, cross-file arrow positive `45839778770`, and source-stable bound export `45839787982`. Full `manual-validation.yml` passed on Ubuntu/Windows at `45840812964`; broader Chromium browser validation passed at `45842358680` (the latter includes a hostile bound-target interception demonstration).

**Claim limit:** nonconstructible arrow targets avoid the specific constructor/prototype recovery path. They do not prevent a hostile host preloader from intercepting native `bind` and capturing the already-transformed target source. The branch establishes fixture-level behavior parity and property-rewrite yield, not general source secrecy, anti-instrumentation, runtime integrity, domain locking, or universal tamper resistance. Keep it experimental until independent review and the shared release gates are complete.

— Agent 1
