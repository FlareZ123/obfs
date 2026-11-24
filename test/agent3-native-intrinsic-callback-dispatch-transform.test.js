'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {obfuscateFiles}=require('../src');

/** @type {Array<{kind:string,observation:'source'|'frame',body:string}>} */
const cases=[
  {kind:'json-toJSON',observation:'frame',
    body:'JSON.stringify({toJSON:function(){external();return 1;}});'},
  {kind:'json-replacer',observation:'source',
    body:"JSON.stringify({x:1},function(key,value){if(key==='x')external();return value;});"},
  {kind:'json-reviver',observation:'source',
    body:"JSON.parse('{\"x\":1}',function(key,value){if(key==='x')external();return value;});"},
  {kind:'array-sort',observation:'frame',
    body:'[2,1].sort(function(a,b){external();return a-b;});'},
  {kind:'string-replace',observation:'frame',
    body:"'a'.replace(/a/,function(){external();return 'b';});"},
  {kind:'array-map',observation:'frame',
    body:'[1].map(function(value){external();return value;});'},
  {kind:'map-forEach',observation:'frame',
    body:"new Map([['x',1]]).forEach(function(){external();});"},
  {kind:'array-from-map',observation:'frame',
    body:'Array.from([1],function(value){external();return value;});'}
];

/**
 * Execute a CommonJS module and observe the active hidden() frame from a
 * callback invoked by a native built-in.
 * @param {string} code
 * @param {'source'|'frame'} observationKind
 * @returns {{value:unknown,source:string|null,frameName:string|null,column:number|null}}
 */
function observe(code,observationKind) {
  /** @type {{source:string|null,frameName:string|null,column:number|null}} */
  const observation={source:null,frameName:null,column:null};
  const external=/** @type {()=>void} */(Function('observation','kind',
    'return function external(){'+
    'if(kind===\'source\'){'+
      'const captured=arguments.callee.caller.caller;'+
      'observation.source=captured?Function.prototype.toString.call(captured):null;'+
    '}else{'+
      'const ErrorCtor=Error;const previous=ErrorCtor.prepareStackTrace;'+
      'try{ErrorCtor.prepareStackTrace=(_error,sites)=>sites;'+
      'const sites=new Error().stack;'+
      'const frame=sites.find(site=>site.getFunctionName()===\'hidden\');'+
      'observation.frameName=frame?.getFunctionName()??null;'+
      'observation.column=frame?.getColumnNumber()??null;'+
      '}finally{ErrorCtor.prepareStackTrace=previous;}'+
    '}'+
    '}'
  )(observation,observationKind));
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-agent3-native-callback-'));
  const filePath=path.join(directory,'entry.cjs');
  try {
    fs.writeFileSync(filePath,code,'utf8');
    const resolved=require.resolve(filePath);
    delete require.cache[resolved];
    const reader=/** @type {(external:()=>void)=>unknown} */(require(filePath));
    const value=reader(external);
    return {...observation,value};
  } finally {
    try { delete require.cache[require.resolve(filePath)]; } catch {}
    fs.rmSync(directory,{recursive:true,force:true});
  }
}

/**
 * @param {'coo'|'sno'} mode
 * @param {string} code
 * @returns {ReturnType<typeof obfuscateFiles>['files'][number]}
 */
function compile(mode,code) {
  const result=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code}],{
    mode,seed:'agent3-native-intrinsic-callback-dispatch',
    identifiers:false,strings:false,properties:true
  });
  assert.equal(result.files.length,1);
  return result.files[0];
}

for(const mode of /** @type {const} */(['coo','sno'])) {
  for(const scenario of cases) {
    test(mode+' native intrinsic callback diagnostic source-observation witness: '+scenario.kind,()=>{
      const source=
        'const other={unrelatedField:2};'+
        'function hidden(external){const owner={longPrivatePropertyName:1};'+
        scenario.body+
        'return owner.longPrivatePropertyName;}'+
        'function plain(){return other.unrelatedField;}'+
        'function publicReader(external){return hidden(external)+plain();}'+
        'module.exports=publicReader;';
      const before=observe(source,scenario.observation);
      assert.equal(before.value,3);
      if(scenario.observation==='source') {
        assert.ok(before.source?.includes('owner.longPrivatePropertyName'),
          scenario.kind+' must expose exact native hidden() source');
      } else {
        assert.equal(before.frameName,'hidden',
          scenario.kind+' must expose the active hidden() frame');
        assert.ok(Number.isInteger(before.column),
          scenario.kind+' must expose a frame column');
      }

      const output=compile(mode,source);
      assert.ok(output.metrics.properties>=1,
        scenario.kind+' must retain nonzero property rewrite yield');
      assert.ok(!String(output.code).includes('unrelatedField'),
        scenario.kind+' must rename the unrelated plain() positive control');
      const after=observe(String(output.code),scenario.observation);
      assert.equal(after.value,before.value,
        scenario.kind+' must preserve ordinary return values');
      if(scenario.observation==='source') {
        assert.notEqual(after.source,before.source,
          scenario.kind+' should fail source parity if the owner property is renamed');
      } else {
        assert.notEqual(after.column,before.column,
          scenario.kind+' should expose a changed active-frame column after the preceding key is renamed');
      }
    });
  }
}
