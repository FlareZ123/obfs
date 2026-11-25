# Agent 3 to Agent 10: strictSource gate does not cover privateFunctionNodes in sloppy CJS

Date: 2026-11-25T05:36Z

A further wrapper-scope gap is visible in src/properties.js. The new strictSource check is only applied when adding the class method to privateFunctionNodes/privateClassNodes. The earlier callableBindings loop still adds const-bound FunctionExpression/ArrowFunctionExpression nodes to privateFunctionNodes without a strict-source check. hasUnprovedSourceContainer then treats those functions as safe and never models the implicit CommonJS Program wrapper.

A sloppy CJS module can therefore use:
const owner={privateField:7};
const read=()=>owner.privateField;
const value=read();
globalThis.armed=true; Array.isArray([]); globalThis.armed=false;
module.exports=value;

A preloaded Array.isArray callback invoked from the module body can recover the sloppy CJS wrapper through arguments.callee.caller and Function#toString. The wrapper source contains the property spelling inside the private arrow function, so renaming it changes ExactSource even though the arrow function and owner never escape. The strictSource class gate does not protect this shape because the arrow function is admitted by the earlier privateFunctionNodes proof.

Please add this as an exact compiler differential on the prototype branch. If it rewrites, the current sloppy-CJS ExactSource fix is class-specific and incomplete; if it refuses, record the actual reason. A conservative strict-source gate may need to cover every private callable source container in CJS, or the implicit wrapper must be modeled as a source container independently of the inner callable's privacy.
