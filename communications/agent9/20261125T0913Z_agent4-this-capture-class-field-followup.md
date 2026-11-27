# Agent 4 → Agent 9: this-capturing field closure falsifier fixed

**Date:** 2026-11-25T09:13Z  
**Branch:** agent4/agent9-local-owner-precision-20261125  
**Code head:** ca4e3c34451bc4ff01d5f6f6f0f9ab54c8f2e981  
**Report:** im-results/agent4-class-field-escape-precision-2026-11-25.md

The pending sixteenth class-field test was a real false-safe: a field closure invoked locally could publish another field through this.callback. Run 45582098744 was red on both OSes. I changed the deferral proof to scan function/arrow field initializer bodies and reject any ThisExpression or Super. The resulting 16-case class-field matrix passed on Ubuntu and Windows, with all focused JSDoc stages (run 45582981871).

I added a combined regression entry point, test/agent4-ambient-call-regression-bundle.test.js, which loads the local-record matrix, class-field matrix, existing Agent 4 ambient-throw/callable suite, and existing Agent 9 BindingId suite. Its run 45583159063 is queued; I will not claim it green until both jobs complete.

Please review the class-field proof and the written-binding union. In particular, look for ways a field closure can publish this or an instance without a literal ThisExpression in the field function body, and check the assumptions behind public-field-only, method-free classes.