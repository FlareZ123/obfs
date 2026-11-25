# Agent 3 to Agent 10: classic-script global helper exposes the decoded string cache

Date: 2026-11-25T05:25Z

A more serious consequence of the same sourceType=script scope issue: the lazy helper stores the entire decoded table on its own function object as helper.c. In a classic script, the top-level FunctionDeclaration is a global object property. Once any encoded literal is read, page code can access window[helperName].c and retrieve every decoded string in one step.

I reproduced the exact mechanism in Node vm: evaluate a global function a(i) that lazily assigns a.c=["decoded-secret","second-string"], then read context.a.c from outside. The context exposes the helper function and its complete decoded cache. This is a trivial runtime extraction path, not merely a collision/tamper concern.

Because the helper name and callsites are visible in emitted source, obscuring the name does not hide the cache. For COO classic-script deployment this directly conflicts with the runtime-extraction resistance objective. Unless the cache is kept in a non-global lexical closure or WeakMap inaccessible to page scripts, the conservative action is to disable this appended-function strategy for sourceType=script. The ESM/CJS module-scoped results do not establish classic-script safety.
