'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

const source=[
  'const owner={privateField:7};',
  'class Reader{read(){return owner.privateField;}}',
  'export const reader=new Reader();'
].join('\n');

/**
 * Import the transformed module from a separate consumer and inspect the
 * exported method through the same Function#toString surface available to
 * an external module.
 * @param {string} code
 * @param {string} [importer]
 * @returns {Promise<{methodSource:string,value:number}>}
 */
async function inspectExportedInstance(code,importer='import {reader} from "./reader.mjs";'){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-private-instance-'));
  try{
    await atomicWrite(path.join(root,'reader.mjs'),code);
    await atomicWrite(path.join(root,'entry.mjs'),[
      importer,
      'process.stdout.write(JSON.stringify({methodSource:reader.read.toString(),value:reader.read()}));'
    ].join('\n'));
    const child=spawnSync(process.execPath,[path.join(root,'entry.mjs')],{
      cwd:root,encoding:'utf8',timeout:15000
    });
    assert.equal(child.status,0,child.stderr||child.error?.message);
    return /** @type {{methodSource:string,value:number}} */ (JSON.parse(child.stdout));
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

for(const mode of /** @type {Array<'coo'|'sno'|'sco'>} */ (['coo','sno','sco'])){
  test(mode+' exported instance declaration must not expose a renamed class method',async()=>{
    const native=await inspectExportedInstance(source);
    const transformed=obfuscateFiles([{
      path:'reader.mjs',sourceType:'module',code:source
    }],{
      mode,seed:'private-class-exported-instance/'+mode,
      properties:true,identifiers:false,strings:false
    });
    const output=transformed.files.find(file=>file.path==='reader.mjs');
    assert.ok(output,'the module must remain present in '+mode);
    assert.equal(output.metrics.properties,0,
      mode+': an exported instance is not a private class instance');
    assert.ok(output.code.includes('read(){return owner.privateField;}'),
      mode+': preserve the method body spelling for external source observers');
    const emitted=await inspectExportedInstance(String(output.code));
    assert.equal(emitted.value,native.value,
      mode+': the exported method must preserve its computed result');
    assert.equal(emitted.methodSource,native.methodSource,
      mode+': Function#toString must remain byte-identical');
  });
}


const exportAliasShapes=[
  {
    label:'named export specifier',
    code:[
      'const owner={privateField:7};',
      'class Reader{read(){return owner.privateField;}}',
      'const reader=new Reader();',
      'export {reader};'
    ].join('\n'),
    importer:'import {reader} from "./reader.mjs";'
  },
  {
    label:'default export',
    code:[
      'const owner={privateField:7};',
      'class Reader{read(){return owner.privateField;}}',
      'const reader=new Reader();',
      'export default reader;'
    ].join('\n'),
    importer:'import reader from "./reader.mjs";'
  },
  {
    label:'renamed export alias',
    code:[
      'const owner={privateField:7};',
      'class Reader{read(){return owner.privateField;}}',
      'const reader=new Reader();',
      'const publicReader=reader;',
      'export {publicReader as reader};'
    ].join('\n'),
    importer:'import {reader} from "./reader.mjs";'
  },
  {
    label:'object container export',
    code:[
      'const owner={privateField:7};',
      'class Reader{read(){return owner.privateField;}}',
      'const reader=new Reader();',
      'export const bundle={reader};'
    ].join('\n'),
    importer:'import {bundle} from "./reader.mjs";\nconst reader=bundle.reader;'
  },
  {
    label:'method extraction export',
    code:[
      'const owner={privateField:7};',
      'class Reader{read(){return owner.privateField;}}',
      'const reader=new Reader();',
      'const method=reader.read;',
      'export {method};'
    ].join('\n'),
    importer:'import {method} from "./reader.mjs";\nconst reader={read:method};'
  },
  {
    label:'bound method export',
    code:[
      'const owner={privateField:7};',
      'class Reader{read(){return owner.privateField;}}',
      'const reader=new Reader();',
      'const bound=reader.read.bind(reader);',
      'export {bound};'
    ].join('\n'),
    importer:'import {bound} from "./reader.mjs";\nconst reader={read:bound};'
  },
  {
    label:'prototype reflection export',
    code:[
      'const owner={privateField:7};',
      'class Reader{read(){return owner.privateField;}}',
      'const reader=new Reader();',
      'export const prototype=Object.getPrototypeOf(reader);'
    ].join('\n'),
    importer:'import {prototype} from "./reader.mjs";\nconst reader={read:prototype.read};'
  },
  {
    label:'global assignment',
    code:[
      'const owner={privateField:7};',
      'class Reader{read(){return owner.privateField;}}',
      'const reader=new Reader();',
      'globalThis.reader=reader;',
      'export {};'
    ].join('\n'),
    importer:'import "./reader.mjs";\nconst reader=globalThis.reader;'
  }
];

for(const mode of /** @type {Array<'coo'|'sno'|'sco'>} */ (['coo','sno','sco'])){
  test(mode+' indirect export forms must also refuse private class-instance proof',async()=>{
    for(const shape of exportAliasShapes){
      const native=await inspectExportedInstance(shape.code,shape.importer);
      const transformed=obfuscateFiles([{
        path:'reader.mjs',sourceType:'module',code:shape.code
      }],{
        mode,seed:'private-class-export-alias/'+mode+'/'+shape.label,
        properties:true,identifiers:false,strings:false
      });
      const output=transformed.files.find(file=>file.path==='reader.mjs');
      assert.ok(output,shape.label+': module must remain present in '+mode);
      assert.equal(output.metrics.properties,0,
        mode+'/'+shape.label+': exported instance must not qualify as private');
      const emitted=await inspectExportedInstance(String(output.code),shape.importer);
      assert.equal(emitted.value,native.value,mode+'/'+shape.label+': behavior parity');
      assert.equal(emitted.methodSource,native.methodSource,
        mode+'/'+shape.label+': Function#toString parity');
    }
  });
}


/**
 * Import an exported class from a separate module and inspect both the class
 * and prototype method source while checking the module's own private use.
 * @param {string} code
 * @returns {Promise<{classSource:string,methodSource:string,value:number,result:number}>}
 */
async function inspectExportedClass(code){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-private-class-export-'));
  try{
    await atomicWrite(path.join(root,'reader.mjs'),code);
    await atomicWrite(path.join(root,'entry.mjs'),[
      'import Reader,{result} from "./reader.mjs";',
      'const reader=new Reader();',
      'process.stdout.write(JSON.stringify({classSource:Reader.toString(),methodSource:Reader.prototype.read.toString(),value:reader.read(),result}));'
    ].join('\n'));
    const child=spawnSync(process.execPath,[path.join(root,'entry.mjs')],{
      cwd:root,encoding:'utf8',timeout:15000
    });
    assert.equal(child.status,0,child.stderr||child.error?.message);
    return /** @type {{classSource:string,methodSource:string,value:number,result:number}} */ (JSON.parse(child.stdout));
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

const exportedClassShapes=[
  {
    label:'default class declaration',
    code:[
      'const owner={privateField:7};',
      'export default class Reader{read(){return owner.privateField;}}',
      'const reader=new Reader();',
      'export const result=reader.read();'
    ].join('\n')
  },
  {
    label:'default export specifier',
    code:[
      'const owner={privateField:7};',
      'class Reader{read(){return owner.privateField;}}',
      'const reader=new Reader();',
      'export {Reader as default};',
      'export const result=reader.read();'
    ].join('\n')
  }
];

for(const mode of /** @type {Array<'coo'|'sno'|'sco'>} */ (['coo','sno','sco'])){
  test(mode+' exported class declaration forms must preserve class and method source',async()=>{
    for(const shape of exportedClassShapes){
      const native=await inspectExportedClass(shape.code);
      const transformed=obfuscateFiles([{
        path:'reader.mjs',sourceType:'module',code:shape.code
      }],{
        mode,seed:'private-class-exported-class/'+mode+'/'+shape.label,
        properties:true,identifiers:false,strings:false
      });
      const output=transformed.files.find(file=>file.path==='reader.mjs');
      assert.ok(output,mode+'/'+shape.label+': module must remain present');
      assert.equal(output.metrics.properties,0,
        mode+'/'+shape.label+': an exported class is not a private source container');
      const emitted=await inspectExportedClass(String(output.code));
      assert.deepEqual(emitted,native,
        mode+'/'+shape.label+': class/method source and behavior must remain identical');
    }
  });
}
