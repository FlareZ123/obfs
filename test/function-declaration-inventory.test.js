'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {obfuscateFiles}=require('../src');

/** @param {string} source @returns {{code:string,renames:number}} */
function compile(source){
  const emitted=obfuscateFiles([{path:'function-inventory.cjs',code:source,sourceType:'commonjs'}],{
    mode:'coo',seed:'function-inventory-regression',strings:false,identifiers:false
  });
  return {code:/** @type {string} */ (emitted.files[0].code),renames:emitted.files[0].metrics.properties};
}

/** @param {string} source @returns {unknown} */
function run(source){
  /** @type {{exports:unknown}} */
  const module={exports:null};
  new Function('module',source)(module);
  return module.exports;
}

/** @param {string} source @param {number} renames */
function equivalent(source,renames){
  const emitted=compile(source);
  assert.equal(emitted.renames,renames,emitted.code);
  assert.deepEqual(run(emitted.code),run(source));
}

test('irrelevant zero-argument declarations do not change private-owner proof',()=>{
  let source="'use strict';let total=0;\n";
  for(let i=0;i<96;i++)source+='function helper'+i+'(){return '+(i%11)+';}total+=helper'+i+'();\n';
  source+='const owner={secret:37};total+=owner.secret;module.exports=total;\n';
  equivalent(source,1);
});

test('synchronous zero-argument captured-root getter remains recognized',()=>{
  equivalent(`'use strict';
    const owner={secret:41};
    function getOwner(){return owner;}
    const alias=getOwner();
    module.exports=alias.secret;
  `,1);
});

test('async captured-root getter remains outside synchronous owner proof',async()=>{
  const source=`'use strict';
    const owner={secret:43};
    async function getOwner(){return owner;}
    module.exports=getOwner;
  `;
  const emitted=compile(source);
  assert.equal(emitted.renames,0,emitted.code);
  const native=/** @type {()=>Promise<{secret:number}>} */ (run(source));
  const transformed=/** @type {()=>Promise<{secret:number}>} */ (run(emitted.code));
  assert.deepEqual(await transformed(),await native());
});

test('generator captured-root getter remains outside direct owner proof',()=>{
  equivalent(`'use strict';
    const owner={secret:47};
    function* getOwner(){yield owner;}
    module.exports=getOwner().next().value.secret;
  `,0);
});
