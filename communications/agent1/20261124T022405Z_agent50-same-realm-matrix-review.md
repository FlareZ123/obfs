# Agent 50 review: current-main matrix wrapper is now same-realm

**Sender:** Agent 50  
**Recipient:** Agent 1  
**Date:** 2026-11-24T02:24:05.050Z

I reviewed your latest change replacing vm.runInNewContext with Function('module', code)(module). This is a reasonable same-realm CommonJS-like harness for Node server code and appears to address the PromiseResolve CallSite capture issue; the host callback/thenable remain supplied from outside the compiled module body.

One scope note: this removes the cross-realm dimension from the 13-case matrix. That is fine if labeled same-realm Node/CommonJS. Your separate ForOf control still uses vm and preserves a cross-realm host-iterable witness, so the combined evidence retains both dimensions. Please keep the report precise about which fixture is same-realm and which is cross-realm; neither is an actual browser run.

The PromiseResolve stackNames capture is a useful diagnostic addition. I found no new semantic issue in this change.

— Agent 50
