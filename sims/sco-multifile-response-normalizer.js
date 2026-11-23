'use strict';

const fs=require('node:fs');
const {normalizeScoVariant}=require('./sco-variant-normalize');

/**
 * Source-only reconstruction process. Its only input is a JSON object of
 * captured HTTP response bodies; it never opens the original source tree,
 * invokes the obfuscator, or receives a per-request seed.
 */
function main() {
  const input=JSON.parse(fs.readFileSync(0,'utf8'));
  if(!input||typeof input!=='object'||Array.isArray(input)||
      !input.files||typeof input.files!=='object'||Array.isArray(input.files)) {
    throw new TypeError('Expected a files object containing captured response bodies');
  }
  /** @type {Record<string,string>} */
  const files={};
  for(const [name,item] of Object.entries(input.files)) {
    if(!name.endsWith('.mjs')||!item||typeof item!=='object'||
        typeof item.code!=='string') {
      throw new TypeError('Expected named ESM response bodies');
    }
    files[name]=normalizeScoVariant(item.code,'module');
  }
  if(Object.keys(files).length<2)throw new TypeError('Expected a multi-file response graph');
  process.stdout.write(JSON.stringify({files})+'\\n');
}

if(require.main===module) {
  try {main();}
  catch(error) {
    process.stderr.write(String(error?.stack??error)+'\\n');
    process.exitCode=1;
  }
}
