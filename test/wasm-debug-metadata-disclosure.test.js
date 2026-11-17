'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {obfuscateFiles,createScoHandler}=require('../src');
const {hasWasmDebugMetadata}=require('../src/source-maps');

const header=Buffer.from([0,0x61,0x73,0x6d,1,0,0,0]);
const entry={path:'entry.mjs',sourceType:/** @type {const} */ ('module'),code:'export const answer=42;'};

/** @param {number} number @returns {Buffer} */
function leb(number) {
  /** @type {number[]} */
  const result=[];
  do {
    const rest=number>>>7;
    result.push((number&127)|(rest?128:0));
    number=rest;
  }while(number);
  return Buffer.from(result);
}

/** @param {string} name @param {Buffer} payload @returns {Buffer} */
function customSection(name,payload) {
  const bytes=Buffer.from(name,'utf8');
  const section=Buffer.concat([leb(bytes.length),bytes,payload]);
  return Buffer.concat([header,Buffer.from([0]),leb(section.length),section]);
}

const privateName='OriginalPrivateFunctionCanary_672381';

/** @returns {Buffer} */
function functionNameSection() {
  const name=Buffer.from(privateName);
  const mapping=Buffer.concat([leb(1),leb(0),leb(name.length),name]);
  return Buffer.concat([Buffer.from([1]),leb(mapping.length),mapping]);
}

test('Wasm name section exposes exact original function name to a public-byte attacker',()=>{
  const wasm=customSection('name',functionNameSection());
  const module=new WebAssembly.Module(wasm);
  const found=WebAssembly.Module.customSections(module,'name');
  assert.equal(found.length,1);
  const published=Buffer.from(found[0]);
  assert.equal(published.includes(Buffer.from(privateName)),true);
  assert.equal(hasWasmDebugMetadata(wasm),true);
  // This fixture uses ASCII-only binary bytes and survives UTF-8 emission.
  const textBacked=wasm.toString('utf8');
  assert.deepEqual(Buffer.from(textBacked,'utf8'),wasm);
  assert.equal(hasWasmDebugMetadata(textBacked),true);
  for(const mode of /** @type {const} */ (['coo','sno','sco'])) {
    assert.throws(()=>obfuscateFiles([
      entry,{path:'text-backed.wasm',sourceType:'asset',code:textBacked}
    ],{mode}),/WebAssembly debug metadata/,mode+' string-backed');
  }
  for(const path of ['module.wasm','module.bin','module.dat']) {
    for(const mode of /** @type {const} */ (['coo','sco','sno'])) {
      assert.throws(()=>obfuscateFiles([
        entry,{path,sourceType:'asset',code:wasm}
      ],{mode}),/WebAssembly debug metadata/,mode+' '+path);
    }
    assert.throws(()=>createScoHandler([
      {path,sourceType:'asset',code:wasm}
    ]),/WebAssembly debug metadata/,'SCO '+path);
  }
});

test('Wasm DWARF and external debug reference custom sections are refused',()=>{
  for(const name of [
    '.debug_str','.debug_info','.debug_line','.debug_abbrev',
    '.debug_str_offsets','.debug_loclists','.debug_rnglists',
    '.zdebug_info','.zdebug_str','external_debug_info'
  ]) {
    const wasm=customSection(name,Buffer.from('original/private_source.js\0'+privateName));
    assert.doesNotThrow(()=>new WebAssembly.Module(wasm),name);
    assert.equal(hasWasmDebugMetadata(wasm),true,name);
    for(const mode of /** @type {const} */ (['coo','sno','sco'])) {
      assert.throws(()=>obfuscateFiles([
        entry,{path:'debug.wasm',sourceType:'asset',code:wasm}
      ],{mode}),/WebAssembly debug metadata/,name+' '+mode);
    }
    assert.throws(()=>createScoHandler([
      {path:'debug.wasm',sourceType:'asset',code:wasm}
    ]),/WebAssembly debug metadata/,'SCO '+name);
  }
});

test('a harmless Wasm custom section may mention debug names in its payload',()=>{
  const payload=Buffer.from('name .debug_str external_debug_info sourceMappingURL');
  const wasm=customSection('application-metadata',payload);
  assert.equal(hasWasmDebugMetadata(wasm),false);
  assert.doesNotThrow(()=>new WebAssembly.Module(wasm));
  for(const mode of /** @type {const} */ (['coo','sno','sco'])) {
    const output=obfuscateFiles([
      entry,{path:'ordinary.wasm',sourceType:'asset',code:wasm}
    ],{mode}).files.find(file=>file.path==='ordinary.wasm');
    assert.ok(output);
    assert.deepEqual(output.code,wasm);
  }
  assert.equal(typeof createScoHandler([
    {path:'ordinary.wasm',sourceType:'asset',code:wasm}
  ]),'function');
});

test('Wasm debug name checks read section identities rather than mistaken payload patterns',()=>{
  assert.equal(hasWasmDebugMetadata(Buffer.from('name .debug_str')),false);
  assert.equal(hasWasmDebugMetadata('not wasm'),false);
  const wasm=customSection('arbitrary',Buffer.from([1,2,3,4]));
  assert.equal(hasWasmDebugMetadata(wasm),false);
  const invalid=Buffer.concat([header,Buffer.from([0,2,10])]);
  assert.throws(()=>hasWasmDebugMetadata(invalid),/Truncated Wasm/);
});


test('seeded multi-section Wasm header fuzz preserves exact-name classification',()=>{
  let state=0x0b5f5a25;
  /** @returns {number} */
  function next() {
    state^=state<<13;
    state^=state>>>17;
    state^=state<<5;
    return state>>>0;
  }
  const names=[
    'name','.debug_str','.debug_loclists','.zdebug_info','external_debug_info',
    'application-metadata','nameless','.debug','debug_str','producers'
  ];
  for(let trial=0;trial<128;trial++){
    /** @type {Buffer[]} */
    const sections=[header];
    let expected=false;
    const count=1+(next()%6);
    for(let index=0;index<count;index++){
      const name=names[next()%names.length];
      const bytes=Buffer.from(name);
      const size=next()%5===0?128+next()%900:next()%80;
      const data=Buffer.alloc(size,(next()%256));
      if(data.length>=4)Buffer.from('name').copy(data,0);
      const body=Buffer.concat([leb(bytes.length),bytes,data]);
      sections.push(Buffer.concat([Buffer.from([0]),leb(body.length),body]));
      if(name==='name'||name==='external_debug_info'||
          name.startsWith('.debug_')||name.startsWith('.zdebug_'))expected=true;
    }
    const wasm=Buffer.concat(sections);
    assert.equal(WebAssembly.validate(wasm),true,'Wasm fixture '+trial);
    assert.equal(hasWasmDebugMetadata(wasm),expected,'Wasm scanner trial '+trial);
  }
});
