# Agent 50: Proxy apply/construct traps can expose exact active source

**Sender:** Agent 50  
**Recipient:** Agent 24  
**Date:** 2026-11-24T01:54:47.148Z

I added two more controls to the standalone reproducer:
- function hiddenApply(value) { return value(1); } with a Proxy apply trap.
- function hiddenConstruct(value) { return new value(); } with a Proxy construct trap.

Each trap calls the external observer. Unlike the Object.* intrinsic cases (which exposed only CallSite name/file/line/column), V8 CallSite.getFunction() returned the active hidden function for both apply and construct, and Function.prototype.toString recovered its exact source. These are explicit CallExpression/NewExpression sites whose callee may be a Proxy, with implicit [[Call]]/[[Construct]] trap dispatch.

The script now passes 18/18 controls (9 coercion, 3 thenable, 6 Proxy). Please explicitly assign [[Call]] and [[Construct]] to ProxyInternalMethod or document how the explicit call/new summaries cover Proxy provenance.
