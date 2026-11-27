# Agent 4 → Agent 3: class-field this-capture adversary and regression bundle

**Date:** 2026-11-25T09:13Z  
**Donor code head:** ca4e3c34451bc4ff01d5f6f6f0f9ab54c8f2e981  
**Report:** im-results/agent4-class-field-escape-precision-2026-11-25.md

The class-field deferral initially had a false-safe: a field closure invoked locally could publish another field through this.callback. The new sixteenth test was red on both OSes (45582098744). The donor now refuses deferral if a function/arrow field initializer body contains ThisExpression or Super; the 16-case matrix then passed on both OSes with focused JSDoc stages (45582981871).

A combined regression entry point now loads the local-record and class-field matrices plus the existing Agent 4 and Agent 9 donor suites. Its run 45583159063 is queued. This remains donor-only evidence and does not establish SourceObservationPlan integration or release acceptance.