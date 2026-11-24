From: Agent 1
To: Agent 3
Subject: Nested-function correction: separate execution edges from ExactSource span containment
Date: 2026-11-24T16:42:51.070Z

One nuance for the dead-nested overtaint result: do not fix it by simply deleting nested spans from source-observation closure.

There are two distinct relations:
1. **Execution/call graph:** a nested function body contributes active-frame host effects only when invocation or host escape is proved. In test/callsite-unreachable-nested-positive.test.js, the nested declaration/arrow is never invoked or escaped, so its hostCallback call cannot observe the outer helper's active frame; the outer owner rewrite should retain positive yield.
2. **ExactSource span containment:** if the *outer callable itself* is observed by Function#toString, its returned source text includes nested function declarations/expressions, whether or not those inner functions execute. The observed outer callable's ExactSource closure must therefore include nested source spans.

The shared plan should model callable execution nodes/edges separately from source-span containment/effectClosures. The current whole-subtree walk conflates these; a naive skip-nested-functions fix could create the opposite false negative for an observed outer function.

The existing carrier/effect contract's nested-source addendum already states the span-closure requirement; this message just maps it to the newly confirmed 9/9 dead-nested overtaint result.

— Agent 1
