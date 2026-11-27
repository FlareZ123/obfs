'use strict';
// Diagnostic only. Run from a candidate checkout: node path/to/this.cjs /absolute/path/to/src/ast.js
// Executes only native receiver equality, never the scanner's illustrative mutation.
const path=require('node:path');
const assert=require('node:assert/strict');
const {parse,hasWeakMapPrototypeExposure,observesFunctionSource}=require(path.resolve(process.argv[2]||'src/ast.js'));
/** @type {ReadonlyArray<readonly [string,string,string]>} */
const cases=[
['if-false-heap-write','const carrier={instance:new WeakMap()}; if(false) carrier.instance={};','carrier.instance'],
['if-else-shared-heap','const carrier={}; if(true) carrier.instance=new WeakMap(); else carrier.instance={};','carrier.instance'],
['if-false-binding-write','let carrier={instance:new WeakMap()}; if(false) carrier={};','carrier.instance'],
['ternary-heap-write','const carrier={instance:new WeakMap()}; false ? (carrier.instance={}) : 0;','carrier.instance'],
['short-circuit-heap-write','const carrier={instance:new WeakMap()}; false && (carrier.instance={});','carrier.instance'],
['switch-no-matching-case','const carrier={instance:new WeakMap()}; switch(0){case 1:carrier.instance={};break;}','carrier.instance'],
['try-catch-heap-write','const carrier={instance:new WeakMap()}; try {} catch {carrier.instance={};}','carrier.instance'],
['loop-zero-iterations-heap','const carrier={instance:new WeakMap()}; for(let i=0;i<0;i++) carrier.instance={};','carrier.instance'],
['loop-zero-iterations-binding','let carrier={instance:new WeakMap()}; for(let i=0;i<0;i++) carrier={};','carrier.instance'],
['object-rest','const carrier={drop:0,instance:new WeakMap()}; const {drop,...rest}=carrier;','rest.instance'],
['array-rest','const carrier=[0,new WeakMap()]; const [drop,...rest]=carrier;','rest[0]'],
['class-static-outer-binding','let carrier={}; class Holder{static{carrier={instance:new WeakMap()};}}','carrier.instance'],
['function-side-effect-outer','let carrier={}; function fill(){carrier={instance:new WeakMap()};} fill();','carrier.instance'],
['catch-predecessor-binding','let carrier={}; try{carrier={instance:new WeakMap()};throw 1;}catch{var result=carrier.instance;}','result'],
['catch-predecessor-heap','const carrier={}; try{carrier.instance=new WeakMap();throw 1;}catch{var result=carrier.instance;}','result'],
['block-outer-write','let carrier={}; {carrier={instance:new WeakMap()};}','carrier.instance'],
['block-inner-shadow','const carrier={instance:new WeakMap()}; {const carrier={};}','carrier.instance'],
['direct-property-overwrite','const carrier={instance:new WeakMap()}; carrier.instance={};','carrier.instance'],
['direct-primitive','const carrier={instance:{}};','carrier.instance']
];
const tail='\nconst nativeSet=nativePrototype.set;\n'+
'nativePrototype.set=function(key,value){ document.title=value; return Reflect.apply(nativeSet,this,[key,value]); };';
const rows=cases.map(([name,setup,access])=>{
  const native=Function('"use strict";\n'+setup+'\nreturn Object.getPrototypeOf('+access+')===WeakMap.prototype;')();
  assert.equal(typeof native,'boolean');
  const ast=parse(setup+'\nconst nativePrototype=Object.getPrototypeOf('+access+');'+tail,'module');
  return {name,native,group:hasWeakMapPrototypeExposure(ast),local:observesFunctionSource(ast)};
});
const falseSafes=rows.filter(row=>row.native&&!row.group&&!row.local);
console.log(JSON.stringify({node:process.version,rows,falseSafes:falseSafes.map(row=>row.name)},null,2));
if(process.env.OBFS_REQUIRE_NO_FALSE_SAFES==='1')assert.equal(falseSafes.length,0);
