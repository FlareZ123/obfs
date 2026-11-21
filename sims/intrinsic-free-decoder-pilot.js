'use strict';

const assert=require('node:assert/strict');
const vm=require('node:vm');
const {performance}=require('node:perf_hooks');

/** @param {string} value @param {number} key @returns {string} */
function xor(value,key){
  let result='';
  for(let i=0;i<value.length;i++)
    result+=String.fromCharCode(value.charCodeAt(i)^key);
  return result;
}

/**
 * Approximate the currently emitted eager XOR decoder: single-code-unit
 * path for short strings, 4096-unit spread chunks for long strings.
 * This is a component microbenchmark, not a compiled application.
 * @param {string} value
 * @returns {string}
 */
function nativeDecoder(value){
  const key=0x90af;
  return `const raw=${JSON.stringify(xor(value,key))};let output='';`+
    `if(raw.length<1024){for(let i=0;i<raw.length;i++)`+
    `output+=String.fromCharCode(raw.charCodeAt(i)^${key});}`+
    `else{for(let offset=0;offset<raw.length;offset+=4096){`+
    `const units=[];for(let j=offset;j<raw.length&&j<offset+4096;j++)`+
    `units[j-offset]=raw.charCodeAt(j)^${key};`+
    `output+=String.fromCharCode(...units);}}output;`;
}

/**
 * Candidate whose *emitted* code uses only string index own-properties,
 * object-literal own-properties, concatenation, and looping. All code
 * units, including lone UTF-16 surrogates, are preserved.
 * @param {string} value
 * @returns {string}
 */
function indexedDictionaryDecoder(value){
  const symbols='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const characters=[...new Set(value.split(''))].sort();
  let width=1;
  while(symbols.length**width<characters.length)width++;
  /** @type {Record<string,string>} */
  const dictionary={};
  /** @type {Map<string,string>} */
  const codes=new Map();
  for(let i=0;i<characters.length;i++){
    let code='';
    let index=i;
    for(let j=0;j<width;j++){
      code=symbols[index%symbols.length]+code;
      index=Math.floor(index/symbols.length);
    }
    dictionary[code]=characters[i];
    codes.set(characters[i],code);
  }
  let encoded='';
  for(let i=0;i<value.length;i++)encoded+=codes.get(value[i]);
  const index=Array.from({length:width},(_,i)=>`raw[j+${i}]`).join('+');
  return `const dictionary=${JSON.stringify(dictionary)};`+
    `const raw=${JSON.stringify(encoded)};let output='';`+
    `for(let j=0;j<raw.length;j+=${width})output+=dictionary[${index}];output;`;
}

/** @param {string} program @param {string} value @returns {boolean} */
function preservedWhenPatched(program,value){
  const native=new vm.Script(program).runInNewContext({});
  assert.equal(native,value);
  const patched=`String.fromCharCode=()=>'?';`+
    `String.prototype.charCodeAt=()=>0;`+
    `Object.defineProperty(Object.prototype,'AA',`+
    `{get(){throw Error('inherited read')},`+
    `set(){throw Error('inherited write')}});`+
    `Object.defineProperty(String.prototype,'0',`+
    `{get(){throw Error('inherited string read')}});`;
  return new vm.Script(patched+program).runInNewContext({})===value;
}

/**
 * Nine newly created contexts per variant, 100 executions per context.
 * Deliberately includes decoding each invocation. Not application CPU.
 * @param {string} program
 * @returns {number}
 */
function medianExecutionMilliseconds(program){
  const script=new vm.Script('(function(){'+program+'})()');
  /** @type {number[]} */
  const times=[];
  for(let trial=0;trial<9;trial++){
    const context=vm.createContext({});
    const start=performance.now();
    for(let run=0;run<100;run++)script.runInContext(context);
    times.push((performance.now()-start)/100);
  }
  times.sort((a,b)=>a-b);
  return times[4];
}

/** @returns {void} */
function main(){
  /** @type {Array<[string,string]>} */
  const cases=[
    ['ascii-64',('abcdefghijklmnopqrstuvwxyz0123456789ABCD').repeat(2).slice(0,64)],
    ['ascii-2048',('abcdefghijklmnopqrstuvwxyz0123456789ABCD').repeat(52).slice(0,2048)],
    ['diverse-140',Array.from({length:140},(_,i)=>String.fromCharCode(0x370+i)).join('')],
    ['utf16','unicode 💡 雲 '+String.fromCharCode(0xd800,0,0xdfff)+' arc'],
    ['unicode-2048',('☃⛄🦄😊ねこ漢字').repeat(200).slice(0,2048)]
  ];
  for(const [name,value] of cases){
    const programs={
      literal:`const output=${JSON.stringify(value)};output;`,
      xor:nativeDecoder(value),
      dictionary:indexedDictionaryDecoder(value)
    };
    /** @type {Record<string,boolean>} */
    const correct={};
    /** @type {Record<string,number>} */
    const byteLengths={};
    /** @type {Record<string,number>} */
    const medianMs={};
    for(const [kind,program] of Object.entries(programs)){
      correct[kind]=preservedWhenPatched(program,value);
      byteLengths[kind]=Buffer.byteLength(program);
      medianMs[kind]=medianExecutionMilliseconds(program);
    }
    assert.equal(correct.literal,true);
    assert.equal(correct.dictionary,true);
    assert.equal(correct.xor,false);
    console.log(JSON.stringify({
      case:name,utf16Units:value.length,
      mutatedBuiltinsStillCorrect:correct,
      bytes:byteLengths,medianMsPerInvocation:medianMs,
      dictionaryVsLiteral:medianMs.dictionary/medianMs.literal,
      dictionaryVsXor:medianMs.dictionary/medianMs.xor
    }));
  }
}

if(require.main===module)main();
module.exports={nativeDecoder,indexedDictionaryDecoder,main};
