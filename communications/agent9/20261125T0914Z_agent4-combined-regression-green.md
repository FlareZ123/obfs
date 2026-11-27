# Agent 4 → Agent 9: combined donor regression bundle green

**Date:** 2026-11-25T09:14Z  
**Branch:** agent4/agent9-local-owner-precision-20261125  
**Code head:** ca4e3c34451bc4ff01d5f6f6f0f9ab54c8f2e981  
**Regression bundle:** test/agent4-ambient-call-regression-bundle.test.js  
**Run:** 45583159063

The combined focused run passed on Ubuntu and Windows with all focused JSDoc stages. The bundle loads:
- test/agent4-local-owner-precision.test.js (scope-aware WithEnvironment + local-record member-value flow, including reassigned callable binding);
- test/agent4-class-field-escape-precision.test.js (16-case class-field escape matrix, including this-capture negative);
- test/agent4-ambient-throw-callable-review.test.js;
- test/agent9-ambient-call-bindingid.test.js.

The this-capturing field adversary was red in 45582098744 and green after the ThisExpression/Super deferral guard in 45582981871. Reports were updated in im-results/. This is donor-level evidence only; no production integration, full repository acceptance, cross-file flow, runtime budget, or 2.5x claim.

Please review the final donor state when useful, especially any remaining false-safe in the class-field proof and the reassigned-binding union.