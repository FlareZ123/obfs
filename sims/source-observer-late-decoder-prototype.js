'use strict';

const assert=require('node:assert/strict');

/** @param {string} value @param {number} key @returns {string} */
function encode(value,key) {
  let output='';
  for(let index=0;index<value.length;index++) {
    output+=String.fromCharCode(value.charCodeAt(index)^key);
  }
  return output;
}

/** @param {string} code @param {string} label @returns {Promise<Record<string,unknown>>} */
function importModule(code,label) {
  const url='data:text/javascript;base64,'+Buffer.from(code,'utf8').toString('base64')+'#'+label;
  return import(url);
}

/**
 * Prototype a hoisted decoder declaration appended after all original source.
 * The original reader callsite and all preceding source positions stay fixed.
 * This is not yet integrated into encodeStrings or the validated plan schema.
 * @returns {Promise<{nativeSourceText:string,emittedSourceText:string,nativeCallsite:string,emittedCallsite:string,helperAtEnd:boolean,sourceReaderOffset:number,emittedReaderOffset:number,labelsEqual:boolean,valuesEqual:boolean}>}
 */
async function main() {
  const helperName='__lateDecode';
  const key=0x45;
  const encoded=encode('safe-literal',key);
  const sourceLines=[
    '// CRLF and astral coordinate prefix 😀',
    "const before = 'before-reader-literal';",
    'const privateRecord = { privateField: 7 };',
    'function observed() { return 29; }',
    'const observedSource = Function.prototype.toString.call(observed);',
    "const label = 'safe-literal';",
    "const labelAgain = 'safe-literal';",
    'export const beforeText = before;',
    'export const result = privateRecord.privateField;',
    'export const sourceText = observedSource;',
    'export const labelText = label;',
    'export const labelAgainText = labelAgain;'
  ];
  const source=sourceLines.join('\r\n')+'\r\n';
  const emittedLines=[...sourceLines];
  emittedLines[5]='const label = '+helperName+'(0);';
  emittedLines[6]='const labelAgain = '+helperName+'(0);';
  const helper=[
    'function '+helperName+'(index) {',
    '  const cache = '+helperName+'.cache || ('+helperName+'.cache = []);',
    '  if (cache[index] !== undefined) return cache[index];',
    '  const data = '+helperName+'.data || ('+helperName+'.data = ['+JSON.stringify(encoded)+']);',
    '  const raw = data[index];',
    "  let value = '';",
    '  for (let i = 0; i < raw.length; i++) value += String.fromCharCode(raw.charCodeAt(i) ^ '+key+');',
    '  return cache[index] = value;',
    '}',
    ''
  ].join('\r\n');
  const emitted=emittedLines.join('\r\n')+'\r\n'+helper;
  const sourceReaderOffset=source.indexOf('Function.prototype.toString.call');
  const emittedReaderOffset=emitted.indexOf('Function.prototype.toString.call');
  assert.ok(sourceReaderOffset>=0);
  assert.equal(emittedReaderOffset,sourceReaderOffset,
    'the reader call expression must retain its original source offset');
  assert.ok(emitted.indexOf('function '+helperName)>source.length,
    'the lazy decoder declaration must be appended after the original source');

  const original=Function.prototype.toString;
  let native,transformed;
  try {
    Function.prototype.toString=function() {
      const stack=(new Error().stack||'');
      const frame=stack.split('\n').find(line=>line.includes('data:text/javascript'))||'';
      const match=frame.match(/:(\d+):(\d+)\)?$/u);
      const callsite=match?match[1]+':'+match[2]:'missing';
      return original.call(this)+'|callsite='+callsite;
    };
    native=await importModule(source,'late-decoder-native');
    transformed=await importModule(emitted,'late-decoder-emitted');
  } finally {
    Function.prototype.toString=original;
  }
  assert.equal(transformed.sourceText,native.sourceText,
    'appending a hoisted decoder must preserve the host-visible reader callsite');
  assert.equal(transformed.beforeText,native.beforeText,
    'a literal before the reader remains unchanged');
  assert.equal(transformed.labelText,native.labelText,
    'the post-reader literal decodes to the original value');
  assert.equal(transformed.labelAgainText,native.labelAgainText,
    'the cached decoder returns the same value for repeated use');
  assert.equal(transformed.result,native.result,
    'unrelated module behavior remains unchanged');
  const nativeCallsite=native.sourceText.split('|callsite=')[1]||'missing';
  const emittedCallsite=transformed.sourceText.split('|callsite=')[1]||'missing';
  const report={
    nativeSourceText:native.sourceText,
    emittedSourceText:transformed.sourceText,
    nativeCallsite,
    emittedCallsite,
    helperAtEnd:emitted.indexOf('function '+helperName)>source.length,
    sourceReaderOffset,
    emittedReaderOffset,
    labelsEqual:transformed.labelText===native.labelText&&transformed.labelAgainText===native.labelAgainText,
    valuesEqual:transformed.beforeText===native.beforeText&&transformed.result===native.result
  };
  process.stdout.write('LATE_DECODER_FRAME_POSITION_PROTOTYPE '+JSON.stringify(report)+'\n');
  return report;
}

if(require.main===module)main().catch(error=>{
  process.stderr.write(String(error.stack||error)+'\n');
  process.exitCode=1;
});
module.exports={main};
