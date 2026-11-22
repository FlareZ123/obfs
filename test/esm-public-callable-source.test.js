'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');

/**
 * Import an ESM module from a fresh directory and observe both its public
 * function source and its ordinary return value.
 * @param {string} code
 * @returns {Promise<string>}
 */
async function observe(code){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-esm-public-source-'));
  try{
    const file=path.join(dir,'entry.mjs');
    await fs.writeFile(file,code,'utf8');
    const url=pathToFileURL(file).href;
    const script=`import(${JSON.stringify(url)}).then(m=>process.stdout.write(JSON.stringify([m.read.toString(),m.read(3)])))`;
    const child=spawnSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8'});
    assert.equal(child.status,0,child.stderr);
    return child.stdout;
  }finally{
    await fs.rm(dir,{recursive:true,force:true});
  }
}

test('exported ESM function source preserves captured private owner keys',async()=>{
  const source='const owner={secretField:3};export function read(){return owner.secretField;}';
  const files=[{path:'entry.mjs',sourceType:'module',code:source}];
  const output=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'esm-public-callable-source',
    strings:false,identifiers:false
  });
  assert.equal(await observe(output.files[0].code),await observe(source),
    'Function#toString observed by an external ESM importer must retain the original property spelling');
});

test('exported ESM object method source preserves captured private owner keys',async()=>{
  const source='const owner={secretField:5};export const api={read(){return owner.secretField;}};';
  const files=[{path:'entry.mjs',sourceType:'module',code:source}];
  const output=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'esm-public-method-source',
    strings:false,identifiers:false
  });
  const observeApi=async code=>{
    const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-esm-public-method-'));
    try{
      const file=path.join(dir,'entry.mjs');
      await fs.writeFile(file,code,'utf8');
      const url=pathToFileURL(file).href;
      const script=`import(${JSON.stringify(url)}).then(m=>process.stdout.write(JSON.stringify([m.api.read.toString(),m.api.read(3)])))`;
      const child=spawnSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8'});
      assert.equal(child.status,0,child.stderr);
      return child.stdout;
    }finally{
      await fs.rm(dir,{recursive:true,force:true});
    }
  };
  assert.equal(await observeApi(output.files[0].code),await observeApi(source));
});

test('unexported ESM function remains eligible for private owner-key rewriting',async()=>{
  const source='const owner={secretField:7};function localRead(){return owner.secretField;}export const value=localRead();';
  const files=[{path:'entry.mjs',sourceType:'module',code:source}];
  const output=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'esm-private-callable-positive-control',
    strings:false,identifiers:false
  });
  assert.equal(output.files[0].metrics.properties,1,output.files[0].code);
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-esm-private-positive-'));
  try{
    const file=path.join(dir,'entry.mjs');
    await fs.writeFile(file,output.files[0].code,'utf8');
    const url=pathToFileURL(file).href;
    const script=`import(${JSON.stringify(url)}).then(m=>process.stdout.write(String(m.value)))`;
    const child=spawnSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8'});
    assert.equal(child.status,0,child.stderr);
    assert.equal(child.stdout,'7');
  }finally{
    await fs.rm(dir,{recursive:true,force:true});
  }
});

test('exported ESM function source preserves parameter names observable to importers',async()=>{
  const source='export function read(secretParam){return secretParam;}';
  const files=[{path:'entry.mjs',sourceType:'module',code:source}];
  const output=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'esm-exported-identifier-source',
    strings:false,properties:false,controlFlow:false,identifiers:true
  });
  assert.equal(await observe(output.files[0].code),await observe(source),
    'Function#toString observed by an external ESM importer must retain the original parameter spelling');
});

test('exported callable source is preserved without disabling private helper parameter renaming',async()=>{
  const source='function privateHelper(privateParam){return privateParam+1;}export function publicRead(publicParam){return publicParam;}export const privateResult=privateHelper(3);';
  const files=[{path:'entry.mjs',sourceType:'module',code:source}];
  const output=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'esm-exported-source-positive-control',
    strings:false,properties:false,controlFlow:false,identifiers:true
  });
  assert.match(output.files[0].code,/export function publicRead\(publicParam\)/);
  assert.doesNotMatch(output.files[0].code,/privateParam/);
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-esm-exported-positive-'));
  try{
    const file=path.join(dir,'entry.mjs');
    await fs.writeFile(file,output.files[0].code,'utf8');
    const url=pathToFileURL(file).href;
    const script=`import(${JSON.stringify(url)}).then(m=>process.stdout.write(JSON.stringify([m.publicRead.toString(),m.publicRead(9),m.privateResult])))`;
    const child=spawnSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8'});
    assert.equal(child.status,0,child.stderr);
    assert.equal(child.stdout,JSON.stringify(['function publicRead(publicParam){return publicParam;}',9,4]));
  }finally{
    await fs.rm(dir,{recursive:true,force:true});
  }
});


test('string encoding preserves exported callable source but still encodes private helper literals',async()=>{
  const privateText='private-helper-string-0123456789-abcdefghijklmnopqrstuvwxyz-ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const publicText='public-source-string-0123456789-abcdefghijklmnopqrstuvwxyz-ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const source='function privateHelper(){return '+JSON.stringify(privateText)+';}'+
    'export function publicRead(){return '+JSON.stringify(publicText)+';}'+
    'export const privateResult=privateHelper();';
  const files=[{path:'entry.mjs',sourceType:'module',code:source}];
  const output=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'esm-public-source-string-island',
    strings:true,identifiers:false,properties:false,controlFlow:false
  });
  assert.ok(output.files[0].metrics.literals>=1,output.files[0].code);
  assert.ok(output.files[0].code.includes(publicText),output.files[0].code);
  assert.ok(!output.files[0].code.includes(privateText),output.files[0].code);
  const observeBoth=async code=>{
    const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-esm-source-string-'));
    try{
      const file=path.join(dir,'entry.mjs');
      await fs.writeFile(file,code,'utf8');
      const url=pathToFileURL(file).href;
      const script=`import(${JSON.stringify(url)}).then(m=>process.stdout.write(JSON.stringify([m.publicRead.toString(),m.publicRead(),m.privateResult])))`;
      const child=spawnSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8'});
      assert.equal(child.status,0,child.stderr);
      return child.stdout;
    }finally{
      await fs.rm(dir,{recursive:true,force:true});
    }
  };
  assert.equal(await observeBoth(output.files[0].code),await observeBoth(source));
});

test('combined property, identifier, and string passes preserve public source and retain private yield',async()=>{
  const privateText='private-combined-string-0123456789-abcdefghijklmnopqrstuvwxyz-ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const publicText='public-combined-string-0123456789-abcdefghijklmnopqrstuvwxyz-ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const source='const publicOwner={secretField:3};const privateOwner={privateField:4};'+
    'function privateHelper(privateParam){return privateParam+privateOwner.privateField+'+JSON.stringify(privateText)+';}'+
    'export function publicRead(publicParam){return publicOwner.secretField+publicParam+'+JSON.stringify(publicText)+';}'+
    'export const privateResult=privateHelper(5);';
  const output=obfuscateFiles([{path:'entry.mjs',sourceType:'module',code:source}],{
    mode:'coo',closedWorld:true,seed:'esm-public-source-combined',
    strings:true,identifiers:true,properties:true,controlFlow:false
  });
  assert.ok(output.files[0].metrics.properties>=1,output.files[0].code);
  assert.ok(output.files[0].metrics.literals>=1,output.files[0].code);
  assert.ok(output.files[0].code.includes('publicOwner.secretField'),output.files[0].code);
  assert.ok(output.files[0].code.includes('publicParam'),output.files[0].code);
  assert.ok(!output.files[0].code.includes('privateOwner'),output.files[0].code);
  assert.ok(!output.files[0].code.includes('privateParam'),output.files[0].code);
  assert.ok(output.files[0].code.includes(publicText),output.files[0].code);
  assert.ok(!output.files[0].code.includes(privateText),output.files[0].code);
  const observeBoth=async code=>{
    const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-esm-source-combined-'));
    try{
      const file=path.join(dir,'entry.mjs');
      await fs.writeFile(file,code,'utf8');
      const url=pathToFileURL(file).href;
      const script=`import(${JSON.stringify(url)}).then(m=>process.stdout.write(JSON.stringify([m.publicRead.toString(),m.publicRead(9),m.privateResult])))`;
      const child=spawnSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8'});
      assert.equal(child.status,0,child.stderr);
      return child.stdout;
    }finally{
      await fs.rm(dir,{recursive:true,force:true});
    }
  };
  assert.equal(await observeBoth(output.files[0].code),await observeBoth(source));
});

test('advanced control-flow passes reject exported callable source but accept private direct-call-only helpers',async()=>{
  const source='function privateHelper(flag){if(flag){return 4;}else{return 5;}}'+
    'export function publicRead(flag){if(flag){return 1;}else{return 0;}}'+
    'export const privateResult=privateHelper(true);';
  const files=[{path:'entry.mjs',sourceType:'module',code:source}];
  assert.throws(()=>obfuscateFiles(files,{
    mode:'coo',seed:'esm-public-source-control-flow-reject',
    strings:false,identifiers:false,properties:false,
    experimentalBranchBlocks:{'entry.mjs':['publicRead']}
  }),/source-exposed callable/);
  const output=obfuscateFiles(files,{
    mode:'coo',seed:'esm-public-source-control-flow-private',
    strings:false,identifiers:false,properties:false,
    experimentalBranchBlocks:{'entry.mjs':['privateHelper']}
  });
  const observePublic=async code=>{
    const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-esm-source-control-flow-'));
    try{
      const file=path.join(dir,'entry.mjs');
      await fs.writeFile(file,code,'utf8');
      const url=pathToFileURL(file).href;
      const script=`import(${JSON.stringify(url)}).then(m=>process.stdout.write(JSON.stringify([m.publicRead.toString(),m.publicRead(true),m.privateResult])))`;
      const child=spawnSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8'});
      assert.equal(child.status,0,child.stderr);
      return child.stdout;
    }finally{
      await fs.rm(dir,{recursive:true,force:true});
    }
  };
  assert.equal(await observePublic(output.files[0].code),await observePublic(source));
});


test('exported class and method source survive property, identifier, and string passes',async()=>{
  const publicText='public-class-source-0123456789-abcdefghijklmnopqrstuvwxyz-ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const source='const owner={secretField:3};export class PublicApi{read(publicParam){return owner.secretField+publicParam+'+JSON.stringify(publicText)+';}}';
  const output=obfuscateFiles([{path:'entry.mjs',sourceType:'module',code:source}],{
    mode:'coo',closedWorld:true,seed:'esm-public-class-source',
    strings:true,identifiers:true,properties:true,controlFlow:false
  });
  assert.ok(output.files[0].code.includes('owner.secretField'),output.files[0].code);
  assert.ok(output.files[0].code.includes('publicParam'),output.files[0].code);
  assert.ok(output.files[0].code.includes(publicText),output.files[0].code);
  const observeBoth=async code=>{
    const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-esm-public-class-'));
    try{
      const file=path.join(dir,'entry.mjs');
      await fs.writeFile(file,code,'utf8');
      const url=pathToFileURL(file).href;
      const script=`import(${JSON.stringify(url)}).then(m=>process.stdout.write(JSON.stringify([m.PublicApi.toString(),m.PublicApi.prototype.read.toString(),new m.PublicApi().read(4)])))`;
      const child=spawnSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8'});
      assert.equal(child.status,0,child.stderr);
      return child.stdout;
    }finally{
      await fs.rm(dir,{recursive:true,force:true});
    }
  };
  assert.equal(await observeBoth(output.files[0].code),await observeBoth(source));
});

test('cross-file property proof cannot rewrite a key named inside an exported and re-exported callable',async()=>{
  const sourceFiles=[
    {path:'owner.mjs',sourceType:'module',code:'export const owner={secretField:3};'},
    {path:'impl.mjs',sourceType:'module',code:"import {owner} from './owner.mjs';export function read(publicParam){return owner.secretField+publicParam;}"},
    {path:'entry.mjs',sourceType:'module',code:"export {read} from './impl.mjs';"}
  ];
  const output=obfuscateFiles(sourceFiles,{
    mode:'coo',closedWorld:true,seed:'esm-public-reexport-source',
    strings:true,identifiers:true,properties:true,controlFlow:false
  });
  assert.equal(output.metrics.properties,0,JSON.stringify(output.metrics));
  const observeBoth=async files=>{
    const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-esm-public-reexport-'));
    try{
      for(const file of files){
        const target=path.join(dir,file.path);
        await fs.mkdir(path.dirname(target),{recursive:true});
        await fs.writeFile(target,file.code,'utf8');
      }
      const url=pathToFileURL(path.join(dir,'entry.mjs')).href;
      const script=`import(${JSON.stringify(url)}).then(m=>process.stdout.write(JSON.stringify([m.read.toString(),m.read(4)])))`;
      const child=spawnSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8'});
      assert.equal(child.status,0,child.stderr);
      return child.stdout;
    }finally{
      await fs.rm(dir,{recursive:true,force:true});
    }
  };
  assert.equal(await observeBoth(output.files),await observeBoth(sourceFiles));
});


test('exporter-local public callable source blocks a cross-file property map',async()=>{
  const sourceFiles=[
    {path:'owner.mjs',sourceType:'module',code:'export const owner={secretField:3};export function read(publicParam){return owner.secretField+publicParam;}'},
    {path:'entry.mjs',sourceType:'module',code:"export {read} from './owner.mjs';"}
  ];
  const output=obfuscateFiles(sourceFiles,{
    mode:'coo',closedWorld:true,seed:'esm-public-exporter-local-source',
    strings:true,identifiers:true,properties:true,controlFlow:false
  });
  assert.equal(output.metrics.properties,0,JSON.stringify(output.metrics));
  const observeBoth=async files=>{
    const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-esm-public-exporter-'));
    try{
      for(const file of files){
        const target=path.join(dir,file.path);
        await fs.mkdir(path.dirname(target),{recursive:true});
        await fs.writeFile(target,file.code,'utf8');
      }
      const url=pathToFileURL(path.join(dir,'entry.mjs')).href;
      const script=`import(${JSON.stringify(url)}).then(m=>process.stdout.write(JSON.stringify([m.read.toString(),m.read(4)])))`;
      const child=spawnSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8'});
      assert.equal(child.status,0,child.stderr);
      return child.stdout;
    }finally{
      await fs.rm(dir,{recursive:true,force:true});
    }
  };
  assert.equal(await observeBoth(output.files),await observeBoth(sourceFiles));
});
