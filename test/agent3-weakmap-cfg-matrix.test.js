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
['both-branches-break-dead-overwrite','let carrier={instance:{}};for(let i=0;i<1;i++){if(i===0){carrier.instance=new WeakMap();break;}else{carrier.instance=new WeakMap();break;}carrier.instance={};}','carrier.instance'],
// Accessor descriptors are not own data slots: writes may invoke a no-op setter.
// Order matters because getters and setters coalesce to one native descriptor.
['accessor-getter-then-setter','const carrier={get instance(){return new WeakMap();},set instance(v){}};function clear(){carrier.instance=0;}clear();','carrier.instance'],
['accessor-setter-then-getter','const carrier={set instance(v){},get instance(){return new WeakMap();}};function clear(){carrier.instance=0;}clear();','carrier.instance'],
// Native-negative yield control ensures an overbroad veto is not misreported as a pass.
['accessor-ordinary-no-weakmap','class Ordinary{} const carrier={get instance(){return new Ordinary();},set instance(v){}};function clear(){carrier.instance=0;}clear();','carrier.instance'],
// Test separate failure mechanisms: accessor descriptor construction, and
// ordinary direct/alias assignments, independently of local-helper proof.
['accessor-get-then-set-no-write','const carrier={get instance(){return new WeakMap();},set instance(v){}};','carrier.instance'],
['accessor-set-then-get-no-write','const carrier={set instance(v){},get instance(){return new WeakMap();}};','carrier.instance'],
['accessor-get-then-set-direct-write','const carrier={get instance(){return new WeakMap();},set instance(v){}};carrier.instance=0;','carrier.instance'],
['accessor-get-then-set-alias-write','const carrier={get instance(){return new WeakMap();},set instance(v){}};const alias=carrier;alias.instance=0;','carrier.instance'],
['accessor-getter-only-no-write','const carrier={get instance(){return new WeakMap();}};','carrier.instance'],
['accessor-getter-only-caught-write','const carrier={get instance(){return new WeakMap();}};try{carrier.instance=0;}catch{}','carrier.instance'],
// The thrown value is evaluated after preceding comma/call side effects.
// Catch-variable abstract provenance must use the post-expression throw edge.
['throw-sequence-updated-member','let result;const carrier={};try{throw (carrier.instance=new WeakMap(),carrier.instance);}catch(e){result=e;}','result'],
['throw-call-updated-member','let result;let carrier={};function fill(){carrier={instance:new WeakMap()};}try{throw (fill(),carrier.instance);}catch(e){result=e;}','result'],
['throw-sequence-ordinary-control','class Ordinary{} let result;const carrier={};try{throw (carrier.instance=new Ordinary(),carrier.instance);}catch(e){result=e;}','result'],
// Native computed-key, heritage and constructor-callee evaluation occurs at
// definition/use time. The effect interpreter must visit these expressions.
['eval-order-object-computed-key','let carrier={};const o={[(carrier.instance=new WeakMap(),"x")]:0};','carrier.instance'],
['eval-order-class-static-field-key','let carrier={};class Holder{static [(carrier.instance=new WeakMap(),"x")]=0;}','carrier.instance'],
['eval-order-class-method-key','let carrier={};class Holder{static [(carrier.instance=new WeakMap(),"x")](){}}','carrier.instance'],
['eval-order-assignment-lhs-key','let carrier={};const o={};o[(carrier.instance=new WeakMap(),"x")]=0;','carrier.instance'],
['eval-order-destructure-key','let carrier={};const source={x:0};let x;({[(carrier.instance=new WeakMap(),"x")]:x}=source);','carrier.instance'],
['eval-order-class-extends-expression','let carrier={};class Holder extends (carrier.instance=new WeakMap(),Object){}','carrier.instance'],
['eval-order-new-callee-expression','let carrier={};class Holder{}new (carrier.instance=new WeakMap(),Holder)();','carrier.instance'],
['eval-order-object-ordinary-control','class Ordinary{}let carrier={};const o={[(carrier.instance=new Ordinary(),"x")]:0};','carrier.instance'],
// Verify Agent 4's remaining bounded transfer-order hypotheses with native
// source-observer evidence, including a nonexposing instance-field control.
['logical-or-assignment-skips-rhs','const carrier={instance:new WeakMap()};carrier.instance||={};','carrier.instance'],
['logical-nullish-assignment-skips-rhs','const carrier={instance:new WeakMap()};carrier.instance??={};','carrier.instance'],
['optional-member-skips-computed-key','const carrier={instance:new WeakMap()};null?.[(carrier.instance={})];','carrier.instance'],
['optional-call-skips-argument','const carrier={instance:new WeakMap()};null?.method(carrier.instance={});','carrier.instance'],
['instance-field-init-deferred','const carrier={instance:new WeakMap()};class Holder{x=(carrier.instance={});}','carrier.instance'],
['instance-field-init-executed-control','class Ordinary{}const carrier={instance:new WeakMap()};class Holder{x=(carrier.instance=new Ordinary());}new Holder();','carrier.instance'],
['for-of-rhs-effect-precedes-iteration','let carrier={};for(const x of (carrier={instance:new WeakMap()},[0])){break;}','carrier.instance']
];
const tail='\nconst nativeSet=nativePrototype.set;\n'+
'nativePrototype.set=function(key,value){ document.title=value; return Reflect.apply(nativeSet,this,[key,value]); };';

for(const [name,setup,access] of cases) {
  test('CFG carrier semantic parity: '+name,()=>{
    const nativeShared=Function('"use strict";\n'+setup+'\nreturn Object.getPrototypeOf('+access+')===WeakMap.prototype;')();
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
