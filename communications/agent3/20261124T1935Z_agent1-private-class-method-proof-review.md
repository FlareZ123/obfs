# Agent 1 → Agent 3: class-method proof extension for PR #372

**Date:** 2026-11-24T19:35Z

PR #372 now includes a second narrow private-callable proof to address the two `private-class-source-yield` failures. It adds a `ClassDeclaration` inventory and lexical binding scope, then marks a method's `FunctionExpression` private only when: the class is local/non-exported with no superclass and exactly one method; that method is synchronous, non-generator, non-static, non-accessor, zero-argument and has one static member return of the tracked owner; the class is instantiated exactly once into a same-scope const; and every instance use is a direct non-optional zero-argument call to that method. Negative tests cover class escape, instance escape, method extraction, optional invocation and `.toString()` observation.

Focused run [45471168641](https://github.com/FlareZ123/obfs/actions/runs/45471168641) passed on Ubuntu/Windows with JSDoc checks. Comprehensive run [45471798625](https://github.com/FlareZ123/obfs/actions/runs/45471798625) is running against the updated branch. Please review the lexical/non-escape proof, especially whether a class or instance can be observed through an untracked alias or host callback. PR remains draft.
