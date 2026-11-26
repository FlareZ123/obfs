'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {runInNewContext}=require('node:vm');
const {parse}=require('../src/ast');
const {summarizeAmbientCallEffects}=require('../workplace/agent9-ambient-call-bindingid');

/**
 * @param {string} source
 * @returns {ReturnType<typeof summarizeAmbientCallEffects>}
 */
function analyze(source) {
  return summarizeAmbientCallEffects(parse(source,'commonjs'),'commonjs');
}

/**
 * @param {string} source
 * @returns {ReturnType<typeof analyze>['summaries'][number]}
 */
function hiddenSummary(source) {
  const summary=analyze(source).summaries.find(item=>item.bindingNames.includes('internal'));
  assert.ok(summary,'internal must have an ambient-call summary');
  return summary;
}

/**
 * @param {string} setup
 * @returns {string}
 */
function mutationSource(setup) {
  return '(function run(){'+
    'const owner={secretField:7};'+
    'const internal=()=>owner.secretField;'+
    setup+
    'const hot=internal.bind(null);'+
    'hot();'+
    '})();';
}

/** @type {string} */
const customBind=
  'function(){external(this);const target=this;'+
  'return (...args)=>Reflect.apply(target,null,args);}';

/**
 * @param {string} source
 * @returns {unknown[]}
 */
function execute(source) {
  /** @type {unknown[]} */
  const captured=[];
  runInNewContext(source,{external(value){captured.push(value);}});
  return captured;
}

for(const [label,setup] of [
  ['Function constructor alias','const F=Function;F.prototype.bind='+customBind+';'],
  ['global object alias','const g=globalThis;g.Function.prototype.bind='+customBind+';'],
  ['destructured Function.prototype alias','const {prototype:fp}=Function;fp.bind='+customBind+';'],
  ['object-carried Function.prototype alias','const box={prototype:Function.prototype};box.prototype.bind='+customBind+';'],
  ['Reflect.apply argument array',
    'Reflect.apply(Object.defineProperty,Object,[Function.prototype,"bind",{value:'+customBind+',configurable:true,writable:true}]);'],
  ['inherited __defineGetter__ mutator',
    "Function.prototype.__defineGetter__('bind',function(){return "+customBind+';});']
]) {
  test('fails closed for '+label,()=>{
    const source=mutationSource(setup);
    const [captured]=execute(source);
    assert.equal(typeof captured,'function','runtime custom bind must receive the target as this');
    assert.match(String(captured),/owner\.secretField/);
    const summary=hiddenSummary(source);
    assert.equal(summary.hostHeldCallable,true,JSON.stringify(summary.reasons));
    assert.equal(summary.safe,false,JSON.stringify(summary.reasons));
  });
}

for(const [label,setup] of [
  ['unrelated Function.prototype property write','Function.prototype.unrelated=1;'],
  ['read-only Function.prototype inspection','Object.getOwnPropertyNames(Function.prototype);'],
  ['freezing the native Function.prototype','Object.freeze(Function.prototype);'],
  ['bind call before later Function.prototype mutation',
    'const hot=internal.bind(null);Function.prototype.bind='+customBind+';hot();']
]) {
  test('does not over-refuse '+label,()=>{
    let source='(function run(){'+
      'const owner={secretField:7};'+
      'const internal=()=>owner.secretField;'+setup;
    if(!setup.includes('const hot='))
      source+='const hot=internal.bind(null);hot();';
    source+='})();';
    const summary=hiddenSummary(source);
    assert.equal(summary.hostHeldCallable,false,JSON.stringify(summary.reasons));
    assert.equal(summary.safe,true,JSON.stringify(summary.reasons));
  });
}

test('native bind with no Function.prototype exposure remains safe',()=>{
  const source=mutationSource('');
  const summary=hiddenSummary(source);
  assert.equal(summary.hostHeldCallable,false);
  assert.equal(summary.safe,true);
});


test('per-file summary misses a sibling ESM module that mutates Function.prototype.bind',async()=>{
  const fs=require('node:fs/promises');
  const os=require('node:os');
  const path=require('node:path');
  const {spawnSync}=require('node:child_process');
  const {pathToFileURL}=require('node:url');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-bind-sibling-mutation-'));
  try {
    const mutator=[
      'const nativeBind=Function.prototype.bind;',
      'Function.prototype.bind=function(...args){',
      "  if(this&&this.name==='internal'&&Function.prototype.toString.call(this).includes('=>7')){",
      '    external(this);const target=this;const thisArg=args[0];const boundArgs=args.slice(1);',
      '    return (...callArgs)=>Reflect.apply(target,thisArg,[...boundArgs,...callArgs]);',
      '  }',
      '  return Reflect.apply(nativeBind,this,args);',
      '};'
    ].join('\n');
    const entry=[
      "import './mutator.mjs';",
      '(function run(){',
      'const internal=()=>7;',
      'const hot=internal.bind(null);',
      'const result=hot();',
      'globalThis.__result=result;',
      '})();'
    ].join('\n');
    await fs.writeFile(path.join(root,'mutator.mjs'),mutator);
    await fs.writeFile(path.join(root,'entry.mjs'),entry);
    const runner=[
      "globalThis.external=value=>{globalThis.__captured=Function.prototype.toString.call(value);};",
      "await import(process.argv[1]);",
      "process.stdout.write(JSON.stringify({captured:globalThis.__captured,result:globalThis.__result}));"
    ].join('\n');
    const child=spawnSync(process.execPath,[
      '--input-type=module','-e',runner,pathToFileURL(path.join(root,'entry.mjs')).href
    ],{encoding:'utf8',timeout:15000});
    assert.equal(child.status,0,child.stderr||child.error?.message);
    const runtime=JSON.parse(child.stdout);
    assert.match(runtime.captured,/=>7/);
    assert.equal(runtime.result,7);
    const summary=summarizeAmbientCallEffects(parse(entry,'module'),'module')
      .summaries.find(item=>item.bindingNames.includes('internal'));
    assert.ok(summary);
    assert.equal(summary.safe,true,JSON.stringify(summary));
    assert.equal(summary.hostHeldCallable,false);
  } finally {
    await fs.rm(root,{recursive:true,force:true});
  }
});


test('receiver map models this for a custom bind method stored directly on the local function',()=>{
  const source='(function run(){'+
    'const owner={secretField:7};'+
    'const internal=()=>owner.secretField;'+
    'internal.bind=function(){external(this);const target=this;'+
    'return (...args)=>Reflect.apply(target,null,args);};'+
    'const hot=internal.bind(null);hot();'+
    '})();';
  const [captured]=execute(source);
  assert.equal(typeof captured,'function');
  assert.match(String(captured),/owner\.secretField/);
  const summary=hiddenSummary(source);
  assert.equal(summary.hostHeldCallable,true,JSON.stringify(summary.reasons));
  assert.equal(summary.safe,false,JSON.stringify(summary.reasons));
});
