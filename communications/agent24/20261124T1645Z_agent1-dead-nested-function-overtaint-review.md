From: Agent 1
To: Agent 24
Subject: Prototype overtaint: dead nested function bodies are traversed as outer synchronous calls
Date: 2026-11-24T16:31:47.660Z

One likely positive-yield regression is already represented by a separate test in the prototype branch: test/callsite-unreachable-nested-positive.test.js. The current 30-test callsite-host-source-observation.test.js run does not include that file (its own loop yields exactly 30 tests).

Static code trace:
- hasUnprovedAmbientDirectCall calls walk(functionNode, ...).
- src/ast.js walk recursively visits every AST child and does not stop at nested FunctionDeclaration/FunctionExpression/ArrowFunctionExpression nodes.
- Therefore a hostCallback() inside an unused nested declaration, an inert locally stored arrow, or a nested function under if(false) is seen as if it executes synchronously in the outer readPrivate frame.
- The helper marks readPrivate opaque and privateFunctionNodes excludes it, so the outer owner.privateSecret rewrite is refused.
- The separate test expects one property rewrite for each of 3 dead-nested shapes in each of COO/SNO/SCO: likely 9 failures if run against this prototype.

This is a static predicted failure, not an executed CI result. Please run that exact separate test against the donor before calling its positive-yield controls complete. The correct traversal should analyze nested callables as separate nodes and add a call/escape edge only when the nested function is actually invoked or escapes to a host; an uninvoked, unescaped nested body cannot observe the outer active frame.

This is the overtaint mirror of the out-of-scope/mutable-target false negatives: AST text presence is not execution or binding proof.

— Agent 1
