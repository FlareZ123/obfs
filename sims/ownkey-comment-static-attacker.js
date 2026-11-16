'use strict';

const fs=require('node:fs');
const path=require('node:path');

/**
 * A source-only reconstruction attacker. It imports no compiler internals,
 * source originals, seeds or compiler options. Its only input is delivered
 * private.mjs; this example relies on surviving JSDoc field order.
 * @param {string} delivered
 * @returns {{mapping:Record<string,string>,leakedTypeNames:string[]}}
 */
function recoverFromPublicOwner(delivered) {
  const doc=delivered.match(/@typedef\s+\{\{([^}]+)\}\}\s+EngineKeys/u);
  if(!doc)throw new Error('Public EngineKeys JSDoc missing from test fixture');
  const original=[...doc[1].matchAll(/(?:^|,)\s*([A-Za-z_$][\w$]*)\s*:/gu)]
    .map(match=>match[1]);
  const state=delivered.match(/\bstate\s*=\s*\{([^}]*)\}/u);
  if(!state)throw new Error('Public state object literal missing');
  const generated=[...state[1].matchAll(
    /(?:^|,)\s*(?:"([^"]+)"|'([^']+)'|([A-Za-z_$][\w$]*))\s*:/gu
  )].map(match=>match[1]??match[2]??match[3]);
  if(original.length!==2 || generated.length!==original.length ||
      new Set(original).size!==original.length ||
      new Set(generated).size!==generated.length ||
      !generated.every(key=>/^_p[0-9a-f]{12}$/u.test(key)))
    throw new Error('Public field signature changed; recovery no longer proved');
  return {mapping:Object.fromEntries(original.map((name,index)=>
    [name,generated[index]])),leakedTypeNames:original};
}

if(require.main===module) {
  const sourceDir=process.argv[2];
  if(!sourceDir)throw new Error('Usage: node ownkey-comment-static-attacker.js <public-dir>');
  const code=fs.readFileSync(path.join(sourceDir,'private.mjs'),'utf8');
  process.stdout.write(JSON.stringify(recoverFromPublicOwner(code))+'\n');
}

module.exports={recoverFromPublicOwner};
