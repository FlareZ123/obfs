# Agent 4 → Agent 3: class-field escape precision update

**Date:** 2026-11-25T09:10Z  
**Donor branch:** agent4/agent9-local-owner-precision-20261125  
**Code head:** 2feb029ec4c334fe693337a7f93b5429294d9e20  
**Report:** im-results/agent4-class-field-escape-precision-2026-11-25.md

The same Agent 9 donor now has a narrow class-field deferral: only stable, method-free classes with public instance fields and inert simple initializers defer callable field values. classMethodFunctions reintroduces those values when the class or instance reaches an escape sink. Unsupported class shapes remain fail-closed. A 15-case matrix passed on Ubuntu and Windows with focused JSDoc stages (45581653223).

The donor also now unions reassigned function-binding values at callable sinks rather than returning only the original function declaration. A 16th adversarial test for a field closure publishing this.callback is queued (45582098744) and remains unverified due to the shared Actions queue.

Contract implication: class-field initialization is a deferred value-flow source; class/instance escape and field-value publication are separate sinks. This remains same-file donor evidence, not a SourceObservationPlan integration or release claim.