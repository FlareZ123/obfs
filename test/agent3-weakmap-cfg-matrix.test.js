'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');
const {parse,hasWeakMapPrototypeExposure,observesFunctionSource}=require('../src/ast');

// Existing candidate fixture, copied unchanged from test/agent1-weakmap-flow-residuals.test.js.
const storageSource=[
  'const descriptor=Object.getOwnPropertyDescriptor(Storage.prototype,"setItem");',
  'const captured=new WeakMap();',
  'function inspect(){const privateLocal=29;return privateLocal;}',
  'function independent(){const independentLocal=7;return independentLocal;}',
  'export function sample(){',
  '  Object.defineProperty(Storage.prototype,"setItem",{',
  '    ...descriptor,',
  '    value:function(_key,value){captured.set(this,value);}',
  '  });',
  '  localStorage.setItem("storage-prototype-override",inspect);',
  '  return {value:inspect(),independent:independent()};',
  '}'
].join('\n');

const entrySource=[
  "import './mutate.mjs';",
  "export {sample} from './storage.mjs';"
].join('\n');

const runnerSource=[
  'class Storage {',
  '  constructor(){this.data=new Map();}',
  '  setItem(key,value){this.data.set(String(key),String(value));}',
  '}',
  'globalThis.Storage=Storage;',
  'globalThis.localStorage=new Storage();',
  'let documentTitle="";',
  'globalThis.document={};',
  'Object.defineProperty(globalThis.document,"title",{',
  '  get(){return documentTitle;},',
  '  set(value){documentTitle=String(value);}',
  '});',
  "const {sample}=await import('./entry.mjs');",
  'const result=sample();',
  'process.stdout.write(JSON.stringify({result,capturedSource:document.title})+"\\n");'
].join('\n');

/** @typedef {{path:string,sourceType:'module',code:string}} Source */

/**
 * Execute the three-file ESM graph with a DOMString-compatible Document.title.
 * @param {Source[]} files
 * @returns {{result:{value:number,independent:number},capturedSource:string}}
 */
function run(files) {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-weakmap-subclass-prototype-'));
  try {
    for(const file of files)fs.writeFileSync(path.join(directory,file.path),file.code,'utf8');
    fs.writeFileSync(path.join(directory,'runner.mjs'),runnerSource,'utf8');
    const child=spawnSync(process.execPath,[path.join(directory,'runner.mjs')],{
      cwd:directory,encoding:'utf8',timeout:15000
    });
    assert.equal(child.status,0,child.stderr||child.error?.message);
    return JSON.parse(child.stdout);
  } finally {
    fs.rmSync(directory,{recursive:true,force:true});
  }
}


/** @type {ReadonlyArray<readonly [string,string,string]>} */
const cases=[
['if-false-heap-write','const carrier={instance:new WeakMap()}; if(false) carrier.instance={};','carrier.instance'],
['if-else-shared-heap','const carrier={}; if(true) carrier.instance=new WeakMap(); else carrier.instance={};','carrier.instance'],
['if-false-binding-write','let carrier={instance:new WeakMap()}; if(false) carrier={};','carrier.instance'],
['ternary-heap-write','const carrier={instance:new WeakMap()}; false ? (carrier.instance={}) : 0;','carrier.instance'],
['short-circuit-heap-write','const carrier={instance:new WeakMap()}; false && (carrier.instance={});','carrier.instance'],
['switch-no-matching-case','const carrier={instance:new WeakMap()}; switch(0){case 1:carrier.instance={};break;}','carrier.instance'],
// Independent native-positive selectors: case test expressions run even when
// the selector does not match and even when a default appears first.
['switch-matched-selector-effect','const carrier={instance:{}};switch(0){case (carrier.instance=new WeakMap(),0):break;}','carrier.instance'],
['switch-unmatched-selector-effect','const carrier={instance:{}};switch(0){case (carrier.instance=new WeakMap(),1):break;}','carrier.instance'],
['switch-selector-after-default','const carrier={instance:{}};switch(0){default:break;case (carrier.instance=new WeakMap(),1):break;}','carrier.instance'],
// Executed selector joins must not erase a live carrier on a path where a
// preceding case matches before the later selector could be evaluated.
['switch-early-match-skips-later-selector','const carrier={instance:new WeakMap()};switch(0){case 0:break;case (carrier.instance={},1):break;}','carrier.instance'],
// A benign computed selector must still admit useful private rewrites.
['switch-benign-nonliteral-selector','class Ordinary{} const carrier={instance:new Ordinary()};switch(0){case (carrier.instance=new Ordinary(),1):break;}','carrier.instance'],
// Executed case bodies have abrupt completions: a subsequent same-case
// overwrite after break/throw/return is dead and cannot clear a WeakMap.
['switch-case-break-dead-write','const carrier={instance:{}};switch(0){case 0:carrier.instance=new WeakMap();break;carrier.instance={};}','carrier.instance'],
['switch-case-throw-dead-write','const carrier={instance:{}};try{switch(0){case 0:carrier.instance=new WeakMap();throw 1;carrier.instance={};}}catch{}','carrier.instance'],
['switch-case-return-dead-write','const carrier={instance:{}};function fill(){switch(0){case 0:carrier.instance=new WeakMap();return;carrier.instance={};}}fill();','carrier.instance'],
['switch-case-nested-if-break','const carrier={instance:{}};switch(0){case 0:if(true){carrier.instance=new WeakMap();break;}carrier.instance={};}','carrier.instance'],
['switch-case-fallthrough-preserves','const carrier={instance:{}};switch(0){case 0:carrier.instance=new WeakMap();case 1:break;}','carrier.instance'],
// Executing a case selector can invoke a user-defined accessor or implicit
// coercion hook. The private function source must remain stable after these.
['switch-defineproperty-accessor','const carrier={instance:{}};const observer={};Object.defineProperty(observer,"v",{get(){carrier.instance=new WeakMap();return 1;}});switch(0){case observer.v:break;}','carrier.instance'],
['switch-defineproperties-accessor','const carrier={instance:{}};const observer={};Object.defineProperties(observer,{v:{get(){carrier.instance=new WeakMap();return 1;}}});switch(0){case observer.v:break;}','carrier.instance'],
['switch-reflect-defineproperty-accessor','const carrier={instance:{}};const observer={};Reflect.defineProperty(observer,"v",{get(){carrier.instance=new WeakMap();return 1;}});switch(0){case observer.v:break;}','carrier.instance'],
['switch-selector-implicit-string-hook','const carrier={instance:{}};const key={toString(){carrier.instance=new WeakMap();return "1";}};switch(0){case ""+key:break;}','carrier.instance'],
// Nested abrupt completion inside try/finally can bypass a later dead write
// within the current case, function block or labeled block.
['switch-case-finally-break-dead-write','const carrier={instance:{}};switch(0){case 0:try{carrier.instance=new WeakMap();break;}finally{}carrier.instance={};}','carrier.instance'],
['switch-case-finally-return-dead-write','const carrier={instance:{}};function fill(){switch(0){case 0:try{carrier.instance=new WeakMap();return;}finally{}carrier.instance={};}}fill();','carrier.instance'],
['try-finally-return-dead-write','const carrier={instance:{}};function fill(){try{carrier.instance=new WeakMap();return;}finally{}carrier.instance={};}fill();','carrier.instance'],
['label-try-finally-break-dead-write','const carrier={instance:{}};outer:{try{carrier.instance=new WeakMap();break outer;}finally{}carrier.instance={};}','carrier.instance'],
['switch-case-finally-throw-dead-write','const carrier={instance:{}};try{switch(0){case 0:try{carrier.instance=new WeakMap();throw 1;}finally{}carrier.instance={};}}catch{}','carrier.instance'],
// Catch handlers may resume on an exceptional path, but a native return or
// break can still bypass all later writes. The abstract state must retain
// both alternatives rather than treating the post-try write as definite.
['try-catch-finally-return-early','const carrier={instance:{}};function fill(){try{carrier.instance=new WeakMap();return;}catch(e){}finally{}carrier.instance={};}fill();','carrier.instance'],
['switch-case-try-catch-finally-break-early','const carrier={instance:{}};switch(0){case 0:try{carrier.instance=new WeakMap();break;}catch(e){}finally{}carrier.instance={};}','carrier.instance'],
['try-catch-both-paths-abrupt','const carrier={instance:{}};function fill(){try{carrier.instance=new WeakMap();throw 1;}catch(e){return;}finally{}carrier.instance={};}fill();','carrier.instance'],
// A genuinely resuming catch with no WeakMap must still allow useful yield.
['try-catch-finally-resumes-positive','class Ordinary{} const carrier={instance:new Ordinary()};try{throw 1;}catch{carrier.instance=new Ordinary();}finally{}','carrier.instance'],
// A switch or loop that may return/throw can bypass later sibling writes,
// while an unlabeled ordinary break consumed by the switch/loop does not.
['switch-return-before-clear','const carrier={instance:{}};function fill(){switch(0){case 0:carrier.instance=new WeakMap();return;}carrier.instance={};}fill();','carrier.instance'],
['switch-throw-before-clear','const carrier={instance:{}};function fill(){switch(0){case 0:carrier.instance=new WeakMap();throw 1;}carrier.instance={};}try{fill();}catch{}','carrier.instance'],
['switch-if-return-before-clear','const carrier={instance:{}};function fill(){switch(0){case 0:if(true){carrier.instance=new WeakMap();return;}}carrier.instance={};}fill();','carrier.instance'],
['loop-return-before-clear','const carrier={instance:{}};function fill(){for(let i=0;i<1;i++){carrier.instance=new WeakMap();return;}carrier.instance={};}fill();','carrier.instance'],
['switch-break-followed-ordinary','class Ordinary{} const carrier={instance:new WeakMap()};switch(0){case 0:break;}carrier.instance=new Ordinary();','carrier.instance'],
['loop-break-followed-ordinary','class Ordinary{} const carrier={instance:new WeakMap()};for(let i=0;i<1;i++){break;}carrier.instance=new Ordinary();','carrier.instance'],
// Loop update expressions are skipped after break/return/throw, but run after
// continue. A dead update must not erase a live WeakMap carrier.
['for-update-after-break-skipped','const carrier={instance:{}};for(let i=0;i<1;(carrier.instance={}),i++){carrier.instance=new WeakMap();break;}','carrier.instance'],
['for-update-after-return-skipped','const carrier={instance:{}};function fill(){for(let i=0;i<1;(carrier.instance={}),i++){carrier.instance=new WeakMap();return;}}fill();','carrier.instance'],
['for-update-after-throw-skipped','const carrier={instance:{}};try{for(let i=0;i<1;(carrier.instance={}),i++){carrier.instance=new WeakMap();throw 1;}}catch{}','carrier.instance'],
['for-update-after-nested-break-skipped','const carrier={instance:{}};for(let i=0;i<1;(carrier.instance={}),i++){carrier.instance=new WeakMap();if(true)break;}','carrier.instance'],
['for-update-after-continue-runs','class Ordinary{} const carrier={instance:{}};for(let i=0;i<1;(carrier.instance=new Ordinary()),i++){carrier.instance=new WeakMap();continue;}','carrier.instance'],
['dowhile-condition-after-break-skipped','const carrier={instance:{}};do{carrier.instance=new WeakMap();break;}while((carrier.instance={},false));','carrier.instance'],
// Class definitions eagerly execute computed keys (including instance
// elements); a throwing static field can prevent a later sibling overwrite.
['class-static-computed-field-key-write','const carrier={instance:{}};class Holder{static [(carrier.instance=new WeakMap(),"x")]=1;}','carrier.instance'],
['class-instance-computed-method-key-write','const carrier={instance:{}};class Holder{[(carrier.instance=new WeakMap(),"x")](){}}','carrier.instance'],
['class-static-field-throw-skips-write','const carrier={instance:{}};try{class Holder{static x=(carrier.instance=new WeakMap(),(()=>{throw 1})());}carrier.instance={};}catch{}','carrier.instance'],
// Every loop condition is evaluated again after a normally completed body;
// do-while evaluates its first condition only after the body.
['dowhile-final-condition-write','const carrier={instance:{}};let i=0;do{carrier.instance={};}while((carrier.instance=new WeakMap(),i++<0));','carrier.instance'],
['while-final-condition-write','const carrier={instance:{}};let i=0;while((carrier.instance=new WeakMap(),i++<1)){carrier.instance={};}','carrier.instance'],
['for-final-condition-write','const carrier={instance:{}};for(let i=0;(carrier.instance=new WeakMap(),i<1);i++){carrier.instance={};}','carrier.instance'],
// Expressions evaluate property keys, constructor callees and call callee
// before arguments. A late WeakMap write must not disappear in the model.
['object-computed-key-write','const carrier={instance:{}};const obj={[(carrier.instance=new WeakMap(),"x")]:1};','carrier.instance'],
['assignment-computed-key-write','const carrier={instance:{}};const obj={};obj[(carrier.instance=new WeakMap(),"x")]=1;','carrier.instance'],
['new-callee-side-effect-write','const carrier={instance:{}};const obj=new (carrier.instance=new WeakMap(),Object)();','carrier.instance'],
['call-callee-before-args-write','const carrier={instance:{}};function f(){}(carrier.instance={},f)((carrier.instance=new WeakMap(),0));','carrier.instance'],
['class-heritage-side-effect-write','const carrier={instance:{}};class Holder extends (carrier.instance=new WeakMap(),Object){}','carrier.instance'],
['destructure-computed-key-write','const carrier={instance:{}};const obj={x:1};const {[(carrier.instance=new WeakMap(),"x")]:x}=obj;','carrier.instance'],
// Class computed names execute before any static field initializers,
// including names declared after a field. Instance initializers are deferred.
['class-computed-name-before-static-field','const carrier={instance:{}};class Holder{static x=(carrier.instance=new WeakMap());static [(carrier.instance={},"k")]=1;}','carrier.instance'],
['class-computed-method-before-static-field','const carrier={instance:{}};class Holder{static x=(carrier.instance=new WeakMap());static [(carrier.instance={},"k")](){}}','carrier.instance'],
['class-instance-field-not-yet-executed','const carrier={instance:{}};class Holder{static [(carrier.instance=new WeakMap(),"k")]=1;instance=(carrier.instance={});}','carrier.instance'],
['class-throwing-static-field-skips-later-field','const carrier={instance:{}};try{class Holder{static a=(carrier.instance=new WeakMap(),(()=>{throw 1})());static b=(carrier.instance={});}}catch{}','carrier.instance'],
// Matched native-negative controls must preserve useful private-source yield.
['class-benign-computed-key-yield','class Ordinary{} const carrier={instance:new Ordinary()};class Holder{static [(carrier.instance=new Ordinary(),"k")]=1;}','carrier.instance'],
['class-benign-static-clear-yield','class Ordinary{} const carrier={instance:new WeakMap()};class Holder{static field=(carrier.instance=new Ordinary());}','carrier.instance'],
// Class expressions need the same definition phase as declarations; their
// computed element names and heritage are evaluated synchronously.
['class-expression-computed-method-key','const carrier={instance:{}};const Holder=class{[(carrier.instance=new WeakMap(),"k")](){}};','carrier.instance'],
['class-expression-computed-field-key','const carrier={instance:{}};const Holder=class{static [(carrier.instance=new WeakMap(),"k")]=1;};','carrier.instance'],
['class-expression-heritage-write','const carrier={instance:{}};const Holder=class extends (carrier.instance=new WeakMap(),Object){};','carrier.instance'],
['class-expression-name-before-static-field','const carrier={instance:{}};const Holder=class{static x=(carrier.instance=new WeakMap());static [(carrier.instance={},"k")]=1;};','carrier.instance'],
['class-expression-instance-field-deferred','const carrier={instance:{}};const Holder=class{static [(carrier.instance=new WeakMap(),"k")]=1;instance=(carrier.instance={});};','carrier.instance'],
['object-computed-method-key','const carrier={instance:{}};const obj={[(carrier.instance=new WeakMap(),"k")](){}};','carrier.instance'],
['class-expression-benign-field-yield','class Ordinary{} const carrier={instance:new WeakMap()};const Holder=class{static x=(carrier.instance=new Ordinary());};','carrier.instance'],
// A named class expression's name is local to the expression. It must not
// shadow/overwrite an outer binding of the same spelling in abstract state.
['class-expression-inner-name-shadows-outer-carrier','const carrier={instance:new WeakMap()};const Holder=class carrier{};','carrier.instance'],
['class-expression-inner-name-shadows-with-key','const carrier={instance:new WeakMap()};const Holder=class carrier{static ["k"](){}};','carrier.instance'],
// Exception completion inside expressions stops later sibling evaluations.
// A syntactic sequence that writes an ordinary value after a thrown call is
// not proof that the WeakMap has been cleared at runtime.
['throwing-class-computed-name-skips-next-key','const carrier={instance:{}};try{class Holder{[(carrier.instance=new WeakMap(),(()=>{throw 1})(),"x")](){}[(carrier.instance={},"y")](){}}}catch{}','carrier.instance'],
['throwing-class-expression-key-skips-next','const carrier={instance:{}};try{const Holder=class{[(carrier.instance=new WeakMap(),(()=>{throw 1})(),"x")](){}[(carrier.instance={},"y")](){}};}catch{}','carrier.instance'],
['throwing-object-key-skips-next-property','const carrier={instance:{}};try{const obj={[(carrier.instance=new WeakMap(),(()=>{throw 1})(),"x")]:1,[(carrier.instance={},"y")]:2};}catch{}','carrier.instance'],
['throwing-object-value-skips-next-property','const carrier={instance:{}};try{const obj={x:(carrier.instance=new WeakMap(),(()=>{throw 1})()),y:(carrier.instance={})};}catch{}','carrier.instance'],
['throwing-array-element-skips-next','const carrier={instance:{}};try{const items=[(carrier.instance=new WeakMap(),(()=>{throw 1})()),(carrier.instance={})];}catch{}','carrier.instance'],
['throwing-call-argument-skips-next','const carrier={instance:{}};function f(){} try{f((carrier.instance=new WeakMap(),(()=>{throw 1})()),(carrier.instance={}));}catch{}','carrier.instance'],
['throwing-expression-skips-next-statement','const carrier={instance:{}};try{(carrier.instance=new WeakMap(),(()=>{throw 1})());carrier.instance={};}catch{}','carrier.instance'],
// Static class initialization executes synchronously, including abrupt
// static-block throws, although ordinary method bodies are not executed.
['for-static-block-throw-skips-update','const carrier={instance:{}};try{for(let i=0;i<1;(carrier.instance={}),i++){carrier.instance=new WeakMap();class Holder{static{throw 1;}}}}catch{}','carrier.instance'],
['switch-static-block-throw-skips-write','const carrier={instance:{}};try{switch(0){case 0:carrier.instance=new WeakMap();class Holder{static{throw 1;}}carrier.instance={};}}catch{}','carrier.instance'],
['try-static-block-throw-skips-write','const carrier={instance:{}};try{carrier.instance=new WeakMap();class Holder{static{throw 1;}}carrier.instance={};}catch{}','carrier.instance'],
['for-static-block-normal-update','class Ordinary{} const carrier={instance:{}};for(let i=0;i<1;(carrier.instance=new Ordinary()),i++){carrier.instance=new WeakMap();class Holder{static{void 0;}}}','carrier.instance'],
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
['direct-property-overwrite','class Ordinary {} const carrier={instance:new WeakMap()}; carrier.instance=new Ordinary();','carrier.instance'],
['direct-primitive','class Ordinary {} const carrier={instance:new Ordinary()};','carrier.instance'],
// Follow-on reachability and alias-transfer adversaries. Native controls were
// independently executed before compilation; all ten have WeakMap.prototype.
['throw-dead-overwrite','let carrier={instance:{}};try{carrier.instance=new WeakMap();throw 1;carrier.instance={};}catch{}','carrier.instance'],
['break-dead-overwrite','let carrier={instance:{}};for(let i=0;i<1;i++){carrier.instance=new WeakMap();break;carrier.instance={};}','carrier.instance'],
['continue-dead-overwrite','let carrier={instance:{}};for(let i=0;i<1;i++){carrier.instance=new WeakMap();continue;carrier.instance={};}','carrier.instance'],
['return-dead-overwrite','let carrier={instance:{}};function fill(){carrier.instance=new WeakMap();return;carrier.instance={};} fill();','carrier.instance'],
['aliased-local-helper','let carrier={};function fill(){carrier={instance:new WeakMap()};} const alias=fill;alias();','carrier.instance'],
['transitive-aliased-helper','let carrier={};function fill(){carrier={instance:new WeakMap()};} const alias=fill;const alias2=alias;alias2();','carrier.instance'],
['callback-helper','let carrier={};function fill(){carrier={instance:new WeakMap()};}[1].forEach(fill);','carrier.instance'],
['getter-captured-write','let carrier={};const obj={get value(){carrier={instance:new WeakMap()};return 0;}};void obj.value;','carrier.instance'],
['switch-case-break-write','let carrier={instance:{}};switch(0){case 0:carrier.instance=new WeakMap();break;case 1:carrier.instance={};}','carrier.instance'],
['nested-branch-heap','let carrier={instance:{}};if(true){if(true){carrier.instance=new WeakMap();}else{carrier.instance={};}}else{carrier.instance={};}','carrier.instance'],
// Eight native-negative controls: preserve at least some meaningful private
// rewrite yield, not just all-or-nothing refusal on every control-flow shape.
['if-true-definite-overwrite','class Ordinary{} const carrier={instance:new WeakMap()};if(true)carrier.instance=new Ordinary();','carrier.instance'],
['if-false-else-definite-overwrite','class Ordinary{} const carrier={instance:new WeakMap()};if(false){}else carrier.instance=new Ordinary();','carrier.instance'],
['ternary-true-definite-overwrite','class Ordinary{} const carrier={instance:new WeakMap()};true?(carrier.instance=new Ordinary()):0;','carrier.instance'],
['logical-and-true-definite-overwrite','class Ordinary{} const carrier={instance:new WeakMap()};true&&(carrier.instance=new Ordinary());','carrier.instance'],
['logical-nullish-definite-overwrite','class Ordinary{} const carrier={instance:new WeakMap()};null??(carrier.instance=new Ordinary());','carrier.instance'],
['same-object-aliased-overwrite','class Ordinary{} const carrier={instance:new WeakMap()};const alias=carrier;alias.instance=new Ordinary();','carrier.instance'],
['direct-local-helper-definite-overwrite','class Ordinary{} const carrier={instance:new WeakMap()};function clear(){carrier.instance=new Ordinary();}clear();','carrier.instance'],
['unread-getter-should-not-write','class Ordinary{} let carrier={instance:new Ordinary()};const unused={get value(){carrier={instance:new WeakMap()};return 0;}};','carrier.instance'],
// Abrupt completion nested inside a block or known conditional must prevent
// later unreachable writes from killing a live WeakMap provenance state.
['if-true-return-dead-overwrite','let carrier={instance:{}};function fill(){if(true){carrier.instance=new WeakMap();return;}carrier.instance={};}fill();','carrier.instance'],
['nested-block-return-dead-overwrite','let carrier={instance:{}};function fill(){{carrier.instance=new WeakMap();return;}carrier.instance={};}fill();','carrier.instance'],
['both-branches-return-dead-overwrite','let carrier={instance:{}};function fill(){if(Math.random()>0.5){carrier.instance=new WeakMap();return;}else{carrier.instance=new WeakMap();return;}carrier.instance={};}fill();','carrier.instance'],
['if-true-throw-dead-overwrite','let carrier={instance:{}};try{if(true){carrier.instance=new WeakMap();throw 1;}carrier.instance={};}catch{}','carrier.instance'],
['nested-block-throw-dead-overwrite','let carrier={instance:{}};try{{carrier.instance=new WeakMap();throw 1;}carrier.instance={};}catch{}','carrier.instance'],
['both-branches-break-dead-overwrite','let carrier={instance:{}};for(let i=0;i<1;i++){if(i===0){carrier.instance=new WeakMap();break;}else{carrier.instance=new WeakMap();break;}carrier.instance={};}','carrier.instance']
];
const tail='\nconst nativeSet=nativePrototype.set;\n'+
'nativePrototype.set=function(key,value){ document.title=value; return Reflect.apply(nativeSet,this,[key,value]); };';

for(const [name,setup,access] of cases) {
  test('CFG carrier semantic parity: '+name,()=>{
    const nativeShared=Function('"use strict";\n'+setup+'\nreturn Object.getPrototypeOf('+access+')===WeakMap.prototype;')();
    if(['switch-matched-selector-effect','switch-unmatched-selector-effect',
        'switch-selector-after-default','switch-early-match-skips-later-selector',
        'switch-case-break-dead-write','switch-case-throw-dead-write',
        'switch-case-return-dead-write','switch-case-nested-if-break',
        'switch-case-fallthrough-preserves',
        'switch-defineproperty-accessor','switch-defineproperties-accessor',
        'switch-reflect-defineproperty-accessor',
        'switch-selector-implicit-string-hook',
        'switch-case-finally-break-dead-write','switch-case-finally-return-dead-write',
        'try-finally-return-dead-write','label-try-finally-break-dead-write',
        'switch-case-finally-throw-dead-write',
        'try-catch-finally-return-early',
        'switch-case-try-catch-finally-break-early',
        'try-catch-both-paths-abrupt',
        'switch-return-before-clear','switch-throw-before-clear',
        'switch-if-return-before-clear','loop-return-before-clear',
        'for-update-after-break-skipped','for-update-after-return-skipped',
        'for-update-after-throw-skipped','for-update-after-nested-break-skipped',
        'dowhile-condition-after-break-skipped',
        'class-static-computed-field-key-write',
        'class-instance-computed-method-key-write',
        'class-static-field-throw-skips-write',
        'dowhile-final-condition-write',
        'while-final-condition-write',
        'for-final-condition-write',
        'object-computed-key-write',
        'assignment-computed-key-write',
        'new-callee-side-effect-write',
        'call-callee-before-args-write',
        'class-heritage-side-effect-write',
        'destructure-computed-key-write',
        'class-computed-name-before-static-field',
        'class-computed-method-before-static-field',
        'class-instance-field-not-yet-executed',
        'class-throwing-static-field-skips-later-field',
        'class-expression-computed-method-key',
        'class-expression-computed-field-key',
        'class-expression-heritage-write',
        'class-expression-name-before-static-field',
        'class-expression-instance-field-deferred',
        'object-computed-method-key',
        'class-expression-inner-name-shadows-outer-carrier',
        'class-expression-inner-name-shadows-with-key',
        'throwing-class-computed-name-skips-next-key',
        'throwing-class-expression-key-skips-next',
        'throwing-object-key-skips-next-property',
        'throwing-object-value-skips-next-property',
        'throwing-array-element-skips-next',
        'throwing-call-argument-skips-next',
        'throwing-expression-skips-next-statement',
        'for-static-block-throw-skips-update',
        'switch-static-block-throw-skips-write',
        'try-static-block-throw-skips-write'].includes(name))
      assert.equal(nativeShared,true,'Selector must execute in native Node: '+name);
    if(['switch-benign-nonliteral-selector',
        'try-catch-finally-resumes-positive',
        'switch-break-followed-ordinary','loop-break-followed-ordinary',
        'for-update-after-continue-runs',
        'for-static-block-normal-update',
        'class-benign-computed-key-yield',
        'class-benign-static-clear-yield',
        'class-expression-benign-field-yield'].includes(name))
      assert.equal(nativeShared,false,'Benign selector must not produce WeakMap');
    const mutateSource=setup+'\nconst nativePrototype=Object.getPrototypeOf('+access+');'+tail;
    const mutationAst=parse(mutateSource,'module');
    const group=hasWeakMapPrototypeExposure(mutationAst);
    const local=observesFunctionSource(mutationAst);
    const sourceFiles=[
      {path:'entry.mjs',sourceType:'module',code:entrySource},
      {path:'mutate.mjs',sourceType:'module',code:mutateSource},
      {path:'storage.mjs',sourceType:'module',code:storageSource}
    ];
    const native=run(sourceFiles);
    const evidence=[];
    for(const mode of ['coo','sco','sno']) {
      const compiled=obfuscateFiles(sourceFiles,{
        mode,seed:'agent3-cfg-carrier-'+name+'-'+mode,
        properties:false,identifiers:true,strings:false,closedWorld:true
      });
      const storage=compiled.files.find(file=>file.path==='storage.mjs');
      assert.ok(storage);
      const emitted=run(compiled.files.map(file=>({
        path:file.path,sourceType:'module',code:String(file.code)
      })));
      evidence.push({mode,bindings:storage.metrics.bindings,
        nativeSource:native.capturedSource,emittedSource:emitted.capturedSource,
        parity:JSON.stringify(native)===JSON.stringify(emitted)});
    }
    console.log('CFG_CARRIER '+JSON.stringify({name,nativeShared,group,local,evidence}));
    if(nativeShared) {
      assert.ok(native.capturedSource.includes('privateLocal'),JSON.stringify(native));
      assert.ok(evidence.every(row=>row.parity),JSON.stringify(evidence));
    } else {
      assert.ok(evidence.every(row=>row.parity&&row.bindings>0),JSON.stringify(evidence));
    }
  });
}
