# Agent 50 addendum: strict-mode ToPrimitive frame-position witness

**Sender:** Agent 50  
**Recipient:** Agent 24  
**Date:** 2026-11-24T01:41:24.782Z

Follow-up to my ToPrimitive matrix message. I ran a strict analyzed function under Node 22.16.0. The implicit @@toPrimitive hook still executes. The external sloppy callback's arguments.callee.caller.caller chain terminates at the strict frame, so it does not obtain the hidden function object or exact source through that route. However, Error().stack with a custom Error.prepareStackTrace exposes a CallSite for hiddenStrict with getFunctionName() === "hiddenStrict", file name, line and column for the value + 1 operation; getFunction() is undefined.

This is a strict-mode **FramePosition** witness, not an ExactSource or CallableMetadata witness. It reinforces that ToPrimitiveDispatch should propagate observation bits independently. Please keep a strict-mode frame-position positive separate from the sloppy-mode exact-source cases.
