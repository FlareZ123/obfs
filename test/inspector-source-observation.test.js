'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');
const {parse,observesDistributedSource}=require('../src/ast');

/**
 * Run an independent Node process so the inspector sees the actual CJS file.
 * The source code itself has no fs reads or explicit source-file loader.
 * @param {string} folder
 * @param {string} code
 * @returns {Promise<string>}
 */
async function execute(folder,code) {
  await atomicWrite(path.join(folder,'entry.cjs'),code);
  const run=spawnSync(process.execPath,[path.join(folder,'entry.cjs')],{
    encoding:'utf8',timeout:15000
  });
  assert.equal(run.status,0,run.stderr);
  return run.stdout.trim();
}

const observedCode=[
  "'use strict';",
  "const inspector=require('node:inspector');",
  'const session=new inspector.Session();',
  'let ownScript=null;',
  'session.connect();',
  "session.on('Debugger.scriptParsed',message=>{",
  "  if(message.params.url.endsWith('/entry.cjs')) ownScript=message.params.scriptId;",
  '});',
  'const owner={secretField:7};',
  "session.post('Debugger.enable',{},error=>{",
  '  if(error) throw error;',
  "  session.post('Debugger.getScriptSource',{scriptId:ownScript},(failure,answer)=>{",
  '    if(failure) throw failure;',
  '    process.stdout.write(JSON.stringify({value:owner.secretField,',
  "      matchesSource:answer.scriptSource.includes(['secret','Field',':7'].join(''))}));",
  '    session.disconnect();',
  '  });',
  '});'
].join('\n');

test('Node inspector source access retains original property names',async()=>{
  const original=[{path:'entry.cjs',sourceType:'commonjs',code:observedCode}];
  const emitted=obfuscateFiles(original,{mode:'sno',seed:'inspector-source-observer',
    strings:false,identifiers:false});
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-inspector-'));
  try {
    const before=await execute(path.join(dir,'native'),observedCode);
    const after=await execute(path.join(dir,'emitted'),emitted.files[0].code);
    assert.deepEqual(JSON.parse(before),{value:7,matchesSource:true});
    assert.equal(after,before,emitted.files[0].code);
    assert.equal(emitted.files[0].metrics.properties,0,'source-inspected owner must retain spelling');
  }finally {await fs.rm(dir,{recursive:true,force:true});}
});

test('independent scalar owner without inspector remains positively renameable',()=>{
  const source='const owner={secretField:7};module.exports=owner.secretField;';
  const output=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:source}],{
    mode:'sno',seed:'inspector-contrast',strings:false,identifiers:false
  }).files[0];
  assert.equal(output.metrics.properties,1,output.code);
});

for(const fixture of [
  {name:'CommonJS builtin',type:'commonjs',source:
    "const inspector=require('node:inspector');const owner={secretField:7};module.exports=owner.secretField;"},
  {name:'CommonJS legacy alias',type:'commonjs',source:
    "const inspector=require('inspector');const owner={secretField:7};module.exports=owner.secretField;"},
  {name:'ESM imported session',type:'module',source:
    "import {Session} from 'node:inspector';const owner={secretField:7};console.log(owner.secretField);"},
  {name:'ESM promise-session import',type:'module',source:
    "import {Session} from 'node:inspector/promises';const owner={secretField:7};console.log(owner.secretField);"},
  {name:'ESM dynamic import',type:'module',source:
    "const inspector=await import('node:inspector');const owner={secretField:7};console.log(owner.secretField);"}
]) {
  test('static inspector API source-observer gate: '+fixture.name,()=>{
    const sourceType=/** @type {'commonjs'|'module'} */(fixture.type);
    assert.equal(observesDistributedSource(parse(fixture.source,sourceType)),true);
    const output=obfuscateFiles([{path:sourceType==='module'?'entry.mjs':'entry.cjs',
      sourceType,code:fixture.source}],{
      mode:sourceType==='module'?'coo':'sno',seed:'inspector-specifier/'+fixture.name,
      strings:false,identifiers:false
    }).files[0];
    assert.equal(output.metrics.properties,0,output.code);
  });
}

test('ordinary Node builtin use remains eligible for private own-key rewrite',()=>{
  const source="const crypto=require('node:crypto');const owner={secretField:7};module.exports=owner.secretField;";
  assert.equal(observesDistributedSource(parse(source,'commonjs')),false);
  const output=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:source}],{
    mode:'sno',seed:'not-inspector',strings:false,identifiers:false
  }).files[0];
  assert.equal(output.metrics.properties,1,output.code);
});
