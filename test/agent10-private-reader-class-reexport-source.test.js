'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');

const original=[
  {path:'state.mjs',sourceType:'module',code:[
    'const privateRecord={secretAlpha:23};',
    'class Reader {',
    '  static {',
    '    function readAlpha(owner){return owner.secretAlpha;}',
    '    this.value=readAlpha(privateRecord);',
    '  }',
    '}',
    'export {Reader};'
  ].join('\n')},
  {path:'entry.mjs',sourceType:'module',code:[
    'import {Reader} from "./state.mjs";',
    'export const result=Reader.value;'
  ].join('\n')}
];

/**
 * Run the emitted graph and observe the exported class's exact native source
 * from a separate host module that is not included in the obfuscator input.
 * @param {typeof original|ReturnType<typeof obfuscateFiles>['files']} files
 * @returns {Promise<[number,string]>}
 */
async function run(files){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-class-reexport-source-'));
  try{
    for(const file of files)await fs.writeFile(path.join(root,file.path),file.code);
    await fs.writeFile(path.join(root,'host-probe.mjs'),[
      'import {result} from "./entry.mjs";',
      'import {Reader} from "./state.mjs";',
      'process.stdout.write(JSON.stringify([result,Function.prototype.toString.call(Reader)]));'
    ].join('\n'));
    const child=spawnSync(process.execPath,[path.join(root,'host-probe.mjs')],{
      cwd:root,encoding:'utf8',timeout:15000
    });
    assert.equal(child.status,0,child.stderr||child.error?.message);
    return /** @type {[number,string]} */(JSON.parse(child.stdout.trim()));
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

for(const mode of /** @type {const} */ (['coo','sno','sco'])){
  test(mode+' preserves class source when a local class is exported after its static block',async()=>{
    const native=await run(original);
    const transformed=obfuscateFiles(original,{mode,closedWorld:true,
      seed:'class-static-block-late-export-'+mode,
      strings:false,identifiers:false,properties:true});
    const state=transformed.files.find(file=>file.path==='state.mjs');
    assert.ok(state,mode+': state module must be emitted');
    const actual=await run(transformed.files);
    process.stdout.write('CLASS_REEXPORT_SOURCE_WITNESS '+JSON.stringify({
      mode,properties:state.metrics.properties,
      nativeClassSource:native[1],transformedClassSource:actual[1]
    })+'\n');
    assert.equal(state.metrics.properties,0,
      mode+': the class source is externally observable after the later re-export');
    assert.deepEqual(actual,native,
      mode+': numeric result and host-observed class source must be identical');
  });
}
