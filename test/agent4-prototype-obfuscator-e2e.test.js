'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,sourceType:'module',code:string}} ModuleFile */

/**
 * Execute the module graph with a host-provided browser-like global.
 * @param {ReadonlyArray<{path:string,code:string|Buffer}>} files
 * @returns {Promise<string>}
 */
async function execute(files) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-prototype-e2e-'));
  try {
    for(const file of files) await atomicWrite(path.join(directory,file.path),file.code);
    const preloader=path.join(directory,'host.cjs');
    await atomicWrite(preloader,"globalThis.window={externalCallback(){return 'host-window';}};");
    const child=spawnSync(process.execPath,['--require',preloader,path.join(directory,'entry.mjs')],{
      encoding:'utf8',timeout:15000
    });
    assert.equal(child.status,0,child.stderr);
    return child.stdout;
  } finally {
    await fs.rm(directory,{recursive:true,force:true});
  }
}

/** @returns {ModuleFile[]} */
function graph() {
  return [
    {path:'state.mjs',sourceType:'module',code:"export const state={secretField:41};"},
    {path:'record.mjs',sourceType:'module',code:[
      "const schema={externalFormat:'audit-v1',auditCount:3};",
      'export function inspectRecord(key){',
      '  return {',
      '    value:schema[key],',
      '    keys:Reflect.ownKeys(schema).sort(),',
      '    enumerable:Object.getOwnPropertyDescriptor(schema,"externalFormat")?.enumerable===true',
      '  };',
      '}'
    ].join('\n')},
    {path:'prototypes.mjs',sourceType:'module',code:[
      'export function makeCases(){',
      '  function Local(){this.callback=function ownCallback(){return "own-shadow";};}',
      '  Local.prototype.callback=function prototypeCallback(){return "prototype";};',
      '  const shadowed=new Local();',
      '  const inherited=Object.create(Local.prototype);',
      '  class Base{callback(){return "base";}}',
      '  class Derived extends Base{callback(){return "derived";}}',
      '  class Field{callback=function fieldCallback(){return "field";};}',
      '  Field.prototype.callback=function fieldPrototype(){return "field-prototype";};',
      '  const field=new Field();',
      '  function Replacement(){return {callback:function replacement(){return "replacement";}};}',
      '  Replacement.prototype.callback=function replacementPrototype(){return "replacement-prototype";};',
      '  const replacement=new Replacement();',
      '  function Accessor(){}',
      '  Object.defineProperty(Accessor.prototype,"callback",{get(){return function getterCallback(){return "getter";};}});',
      '  const accessor=new Accessor();',
      '  return {',
      '    shadowed:shadowed.callback(),',
      '    inherited:inherited.callback(),',
      '    derived:new Derived().callback(),',
      '    field:field.callback(),',
      '    replacement:replacement.callback(),',
      '    accessor:accessor.callback(),',
      '    dynamic:shadowed["callback"](),',
      '    prototypeKeys:Reflect.ownKeys(Local.prototype).sort(),',
      '    replacementPrototypeKeys:Reflect.ownKeys(Replacement.prototype).sort(),',
      '    accessorGetter:Object.getOwnPropertyDescriptor(Accessor.prototype,"callback").get()()',
      '  };',
      '}'
    ].join('\n')},
    {path:'entry.mjs',sourceType:'module',code:[
      "import {state} from './state.mjs';",
      "import {inspectRecord} from './record.mjs';",
      "import {makeCases} from './prototypes.mjs';",
      "const first=inspectRecord('externalFormat');",
      "const second=inspectRecord('auditCount');",
      'const result={',
      '  state:state.secretField,',
      '  record:[first.value,second.value,first.keys,first.enumerable],',
      '  prototype:makeCases(),',
      '  external:window.externalCallback()',
      '};',
      'console.log(JSON.stringify(result));'
    ].join('\n')}
  ];
}

test('COO property obfuscation preserves multi-file prototype, reflection, and host API behavior',async()=>{
  const files=graph();
  const native=await execute(files);
  const compiled=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'agent4-prototype-e2e-20261125',
    identifiers:false,strings:false,properties:true
  });
  assert.ok(compiled.crossFile.properties>=1,'the fixture must exercise an actual cross-file property rename');
  assert.equal(await execute(compiled.files),native);
});
