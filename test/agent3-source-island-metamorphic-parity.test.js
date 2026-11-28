'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src/core');

/** @typedef {import('../src/core').SourceFile} SourceFile */
/** @type {SourceFile[]} */
const sourceFiles=[
  {path:'watched.mjs',sourceType:'module',
    code:'const a={visibleA:17};const v=a.visibleA;export function watched(){return v;}'},
  {path:'independent.mjs',sourceType:'module',
    code:'const b={privateB:23};const v=b.privateB;export function unrelated(){return v;}'},
  {path:'entry.mjs',sourceType:'module',code:[
    'import {watched} from "./watched.mjs";',
    'import {unrelated} from "./independent.mjs";',
    'console.log(JSON.stringify({source:watched.toString(),value:unrelated()}));'
  ].join('\n')}
];

/**
 * Native/emitted exact Node ESM stdout, including a function-source witness.
 * @param {SourceFile[]} files
 * @returns {string}
 */
function execute(files) {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'agent3-observer-yield-'));
  try {
    for(const file of files){
      assert.equal(typeof file.code,'string');
      fs.writeFileSync(path.join(directory,file.path),file.code,'utf8');
    }
    const child=spawnSync(process.execPath,[path.join(directory,'entry.mjs')],{
      cwd:directory,encoding:'utf8',timeout:15000
    });
    assert.equal(child.status,0,child.stderr||child.error?.message);
    return child.stdout.trim();
  } finally {
    fs.rmSync(directory,{force:true,recursive:true});
  }
}

const original=execute(sourceFiles);
assert.deepEqual(JSON.parse(original),{
  source:'function watched(){return v;}',
  value:23
});
for(const mode of /** @type {const} */ (['coo','sco','sno']))test(
  mode+': source-observer island emits protected key and preserves native Node ESM stdout',()=>{
    const output=obfuscateFiles(sourceFiles,{
      mode,seed:'agent3-source-island-executed-'+mode,
      closedWorld:true,strings:false,identifiers:true,properties:true,
      experimentalSourceObserverIslands:['independent.mjs']
    });
    const independent=output.files.find(file=>file.path==='independent.mjs');
    assert.ok(independent && independent.metrics.properties>0,
      mode+': must emit an independently safe key rewrite');
    assert.equal(independent.metrics.bindings,0,
      mode+': exported function source must remain unchanged');
    const emitted=execute(output.files.map(file=>({
      path:file.path,sourceType:file.sourceType,code:String(file.code)
    })));
    assert.equal(emitted,original,mode+': native/emitted output and source parity');
  }
);

/**
 * Deterministic 48-case metamorphic mixture of two primitive records and
 * their direct ESM exports, with an independently visible function-source
 * string in the unchanged module. This probes source-preserving local own
 * property renaming and the three published obfuscation architectures.
 * The selected leaf deliberately exports only inert zero-argument functions.
 * @param {number} index
 * @returns {SourceFile[]}
 */
function metamorphicFiles(index){
  const key='privateField'+index, secondary='hiddenRecord'+index;
  const value=index%4===0?String(index*17):
    index%4===1?JSON.stringify('alphabet-'+index):
    index%4===2?'true':'null';
  const other=index%3===0?String(index+20):
    index%3===1?'false':JSON.stringify('private-'+index);
  return [
    {path:'watched.mjs',sourceType:'module',
      code:'const a={visibleField'+index+':17};'+
        'const v=a.visibleField'+index+';export function watched(){return v;}'},
    {path:'independent.mjs',sourceType:'module',
      code:'const record={'+key+':'+value+'};\n'+
        'const snapshot=record.'+key+';\n'+
        'const extra={'+secondary+':'+other+'};\n'+
        'const second=extra.'+secondary+';\n'+
        'export function unrelated(){return snapshot;}\n'+
        'export function independent(){return second;}'},
    {path:'entry.mjs',sourceType:'module',code:[
      'import {watched} from "./watched.mjs";',
      'import {unrelated,independent} from "./independent.mjs";',
      'console.log(JSON.stringify({watched:watched.toString(),first:unrelated(),second:independent(),named:unrelated.name,arity:unrelated.length}));'
    ].join('\n')}
  ];
}

test('source islands: 48 mixed primitive two-record values preserve native/emitted ESM across all modes',()=>{
  /** @type {Record<string,number>} */
  const positive={coo:0,sco:0,sno:0};
  for(let index=0;index<48;index++){
    const files=metamorphicFiles(index);
    const native=execute(files);
    for(const mode of /** @type {const} */(['coo','sco','sno'])){
      const output=obfuscateFiles(files,{
        mode,closedWorld:true,seed:'agent3-primitive-property-metamorphic-'+index+'-'+mode,
        properties:true,identifiers:true,strings:false,
        experimentalSourceObserverIslands:['independent.mjs']
      });
      const selected=output.files.find(file=>file.path==='independent.mjs');
      assert.ok(selected,'missing selected leaf');
      assert.equal(selected.metrics.bindings,0,'an observed export must not be renamed');
      assert.ok(selected.metrics.properties>=1,'missing protected field: '+index+' '+mode);
      assert.equal(output.files.find(f=>f.path==='watched.mjs')?.code,files[0].code);
      assert.equal(output.files.find(f=>f.path==='entry.mjs')?.code,files[2].code);
      const emitted=execute(output.files.map(file=>({
        path:file.path,sourceType:file.sourceType,code:String(file.code)
      })));
      assert.equal(emitted,native,'native/emitted mismatch: '+index+' '+mode);
      positive[mode]++;
    }
  }
  assert.deepEqual(positive,{coo:48,sco:48,sno:48});
});
