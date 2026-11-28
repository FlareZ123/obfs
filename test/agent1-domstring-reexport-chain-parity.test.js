'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src/core');

/** @typedef {import('../src/core').SourceFile} SourceFile */

/**
 * Execute an exact ESM graph with a host-injected native-style DOMString
 * coercer. The host is outside the compiled closed-world module set, as
 * genuine browsers keep Web IDL DOM element bindings outside supplied JS.
 *
 * @param {readonly SourceFile[]} files
 * @returns {[number,string]}
 */
function execute(files){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-domstring-reexport-'));
  try{
    for(const file of files){
      fs.writeFileSync(path.join(directory,file.path),String(file.code),'utf8');
    }
    fs.writeFileSync(path.join(directory,'runner.mjs'),[
      'globalThis.document={',
      '  createElement(){',
      '    const attributes=new Map();',
      '    return {',
      '      setAttribute(key,value){attributes.set(String(key),String(value));},',
      '      getAttribute(key){return attributes.get(String(key))??null;}',
      '    };',
      '  }',
      '};',
      'const entry=await import("./entry.mjs");',
      'console.log(JSON.stringify(entry.answer));'
    ].join('\n'),'utf8');
    const child=spawnSync(process.execPath,[path.join(directory,'runner.mjs')],{
      cwd:directory,encoding:'utf8',timeout:10000
    });
    assert.equal(child.status,0,child.stderr||child.error?.message);
    return /** @type {[number,string]} */ (JSON.parse(child.stdout.trim()));
  }finally{
    fs.rmSync(directory,{force:true,recursive:true});
  }
}

/** @param {number} variant @returns {SourceFile[]} */
function graph(variant){
  const state=variant===3?
    'const element=document.createElement("div");export default element;':
    'export const element=document.createElement("div");';
  const bridge=[
    'export {element} from "./state.mjs";',
    'import {element as alias} from "./state.mjs";export {alias as element};',
    'export * from "./state.mjs";',
    'export {default as element} from "./state.mjs";'
  ][variant];
  return [
    {path:'state.mjs',sourceType:'module',code:state},
    {path:'bridge.mjs',sourceType:'module',code:bridge},
    {path:'entry.mjs',sourceType:'module',code:[
      'import {element} from "./bridge.mjs";',
      'const owner={privateField:19,secondField:7};',
      'function reader(){return owner.privateField+owner.secondField;}',
      'element.setAttribute("data-source",reader);',
      'export const answer=[reader(),element.getAttribute("data-source")];'
    ].join('\n')}
  ];
}

test('positive control transforms private own property when no DOMString observer exists',()=>{
  const original='const owner={privateField:19};export const answer=owner.privateField;';
  const output=obfuscateFiles([{path:'entry.mjs',sourceType:'module',code:original}],{
    mode:'coo',seed:'reexport-dom-positive',properties:true,identifiers:true,
    strings:false,closedWorld:true
  });
  assert.ok(output.files[0].metrics.properties>=1,
    'The compiler must have real own-property renaming yield in a safe control');
});

for(let variant=0;variant<4;variant++){
  for(const mode of /** @type {const} */(['coo','sco','sno'])){
    test(mode+': native DOMString coercion preserves source via reexport bridge '+variant,()=>{
      const original=graph(variant);
      const expected=execute(original);
      const output=obfuscateFiles(original,{
        mode,seed:'agent1-native-dom-reexport-'+variant+'-'+mode,
        properties:true,identifiers:true,strings:false,closedWorld:true
      });
      const emitted=execute(output.files);
      const metrics=output.files.map(file=>({
        file:file.path,properties:file.metrics.properties,bindings:file.metrics.bindings
      }));
      process.stdout.write('DOMSTRING_REEXPORT '+JSON.stringify({variant,mode,metrics})+'\n');
      assert.deepEqual(emitted,expected,
        'Native DOMString setter exposed rewritten function-source bytes; '+
        JSON.stringify({variant,mode,metrics}));
    });
  }
}
