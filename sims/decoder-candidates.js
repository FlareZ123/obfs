'use strict';

const assert = require('node:assert/strict');
const {Script} = require('node:vm');
const {performance} = require('node:perf_hooks');

/** @typedef {'concatenate'|'character-array'|'chunked-fromCharCode'} DecoderName */
/** @typedef {{name:string,values:string[]}} Scenario */

/** @param {string} input @param {number} key @returns {string} */
function xorUnits(input,key) {
  let encoded='';
  for(let index=0;index<input.length;index++) {
    encoded+=String.fromCharCode(input.charCodeAt(index)^key);
  }
  return encoded;
}

/** @param {DecoderName} method @returns {string} */
function decoderBody(method) {
  switch(method) {
    case 'concatenate':
      return 'let decoded="";for(let j=0;j<raw.length;j++)decoded+=String.fromCharCode(raw.charCodeAt(j)^key);';
    case 'character-array':
      return 'const chars=new Array(raw.length);for(let j=0;j<raw.length;j++)chars[j]=String.fromCharCode(raw.charCodeAt(j)^key);const decoded=chars.join("");';
    case 'chunked-fromCharCode':
      // Blocks of 4096 JS arguments are comfortably below implementation
      // argument limits. Preserve every UTF-16 code unit, including lone surrogates.
      return 'const chunks=[];for(let start=0;start<raw.length;start+=4096){const count=Math.min(4096,raw.length-start);const units=new Array(count);for(let j=0;j<count;j++)units[j]=raw.charCodeAt(start+j)^key;chunks.push(String.fromCharCode(...units));}const decoded=chunks.join("");';
  }
}

/**
 * Prepare an executable script that decodes a set of seeded, XOR encoded
 * strings using the selected runtime implementation.
 * @param {Scenario} scenario
 * @param {DecoderName} method
 * @returns {Script}
 */
function compile(scenario,method) {
  const key=33709;
  const payload=scenario.values.map(value=>xorUnits(value,key));
  const script=`'use strict';const data=${JSON.stringify(payload)};const key=${key};const output=[];for(const raw of data){${decoderBody(method)}output.push(decoded);}globalThis.payload=output;`;
  return new Script(script);
}

/** @param {Script} script @param {number} trials @returns {{times:number[],output:string}} */
function sample(script,trials) {
  /** @type {number[]} */
  const times=[];
  let output='';
  for(let index=0;index<trials+5;index++) {
    /** @type {{payload?:string[]}} */
    const context={};
    const start=performance.now();
    script.runInNewContext(context,{timeout:5000});
    const elapsed=performance.now()-start;
    output=JSON.stringify(context.payload);
    if(index>=5)times.push(elapsed);
  }
  return {times,output};
}

/** @param {number[]} times @returns {number} */
function median(times) {
  const sorted=[...times].sort((left,right)=>left-right);
  return sorted[Math.floor(sorted.length/2)];
}

/** @returns {Scenario[]} */
function scenarios() {
  const seed='A😀Z\uD800\uDC00\uDC00\uD800\0\uFFFF-';
  const long=seed.repeat(4000).slice(0,65536);
  return [
    {name:'64KiB-codeunits-with-surrogates',values:[long]},
    {name:'256-distinct-strings',values:Array.from({length:256},(_,index)=>
      seed.repeat(17).slice(0,256)+String(index).padStart(3,'0'))},
    {name:'edge-case-UTF16',values:['','\uD800','\uDC00','\uD800a\uDC00','\0\n\r\u2028\u2029','😀']}
  ];
}

const methods=/** @type {DecoderName[]} */ (['concatenate','character-array','chunked-fromCharCode']);
const output=[];
for(const scenario of scenarios()) {
  const expected=JSON.stringify(scenario.values);
  /** @type {Record<string,{median_ms:number,ratio_to_concat:number|null,output_matches:boolean}>} */
  const times={};
  for(const method of methods) {
    const first=sample(compile(scenario,method),11);
    const second=sample(compile(scenario,method),11);
    assert.equal(first.output,expected,`Incorrect decoder: ${scenario.name} / ${method}`);
    assert.equal(second.output,expected,`Incorrect decoder on second run: ${scenario.name} / ${method}`);
    times[method]={median_ms:median([...first.times,...second.times]),
      ratio_to_concat:null,output_matches:true};
  }
  for(const method of methods) times[method].ratio_to_concat=
    times[method].median_ms/times.concatenate.median_ms;
  output.push({scenario:scenario.name,count:scenario.values.length,
    total_utf16_units:scenario.values.reduce((sum,item)=>sum+item.length,0),
    results:times});
}
process.stdout.write(JSON.stringify({node:process.version,platform:process.platform,
  note:'illustrative cold fresh-realm decoder comparison; JS compilation excluded',
  measurements:output},null,2)+'\n');
