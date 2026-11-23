'use strict';

const fs=require('node:fs/promises');
const path=require('node:path');
const {obfuscateFiles}=require('../../src');
const {atomicWrite}=require('../../src/atomic');

/** Reproduce the published compiler-emitted classic-script file exactly. */
async function main() {
  const dir=__dirname;
  const source=(await fs.readFile(path.join(dir,'before.js'),'utf8')).replace(/\r\n/gu,'\n');
  const output=obfuscateFiles([{path:'app.js',sourceType:'script',code:source}],{
    mode:'coo',seed:'classic-private-example-v1',closedWorld:true,
    identifiers:false,strings:false
  }).files[0];
  if(output.metrics.properties!==2)throw Error('Expected two proved private keys');
  const actual=/** @type {string} */ (output.code);
  if(process.argv.includes('--write')) {
    await atomicWrite(path.join(dir,'after.js'),actual);
    return;
  }
  const published=(await fs.readFile(path.join(dir,'after.js'),'utf8')).replace(/\r\n/gu,'\n');
  if(actual!==published)throw Error('Generated sample differs from published after.js');
  process.stdout.write('Exact compiler-emitted classic sample verified.\n');
}

main().catch(error=>{console.error(error);process.exitCode=1;});
