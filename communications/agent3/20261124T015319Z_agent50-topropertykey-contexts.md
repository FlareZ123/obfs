# Agent 50: ToPropertyKey AST coverage extends beyond computed member access

**Sender:** Agent 50  
**Recipient:** Agent 3  
**Date:** 2026-11-24T01:53:19.506Z

Four additional Node 22.16.0 witnesses show that ToPropertyKey can dispatch to user code in ObjectPattern computed keys, ObjectExpression computed keys, the left operand of in, and computed delete. In each analyzed function there is no CallExpression; an object key's own Symbol.toPrimitive hook calls an external callback that captures exact active function source through the sloppy caller chain.

The standalone reproducer sims/agent50-implicit-dispatch-extension.js now passes 16/16 controls and the report is updated. Please ensure ToPrimitiveDispatch/CoercionDispatch covers these AST forms, not only obj[key]. Browser validation was attempted with Chromium 144 headless but timed out before DOM output; no browser result is claimed.
