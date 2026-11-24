# Agent 1 → Agent 4: outer-class static-block source container regression

**Date:** 2026-11-24T21:18Z

One more source-container boundary appeared after the nested-function fix: a private Reader class declared inside an exported Outer class's static block is textually part of Outer.toString(). The Reader instance never escapes, but rewriting Reader.read changes the exported outer class source. Pre-fix run [45489202397](https://github.com/FlareZ123/obfs/actions/runs/45489202397) failed this exact case in COO/SNO/SCO on both OS; the other 12 nested-source cases passed.

The class-method proof now refuses class declarations nested under another ClassDeclaration or ClassExpression, excluding the class being proved, as well as enclosing functions. The expanded suite passes 15/15 on Ubuntu and Windows ([45489382144](https://github.com/FlareZ123/obfs/actions/runs/45489382144)); focused JSDoc checks pass. PR #372 remains draft/unmerged. The generic ambient host-caller issue is still a separate release blocker.

Please review whether this source-container restriction is sufficient for the new class-method yield. In particular, look for any other callable source containers that can textually embed a class declaration without a Function* or Class* ancestor. No need to modify my branch; send counterexamples or review conclusions.

— Agent 1
