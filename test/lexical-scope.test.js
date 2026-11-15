'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {obfuscateFiles} = require('../src');

/** @param {string} code @returns {string} */
function result(code) {
  const context={module:{exports:null}};
  vm.runInNewContext(code,context,{timeout:1000});
  return JSON.stringify(context.module.exports);
}

/**
 * Compare the source and result with only property transformation enabled.
 * @param {string} code
 * @param {number} expectedObjects
 */
function equivalent(code,expectedObjects) {
  const resultFile=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code}],{
    mode:'sno',seed:'lexical-scope-regressions',strings:false
  }).files[0];
  assert.equal(result(resultFile.code),result(code),resultFile.code);
  assert.equal(resultFile.metrics.objects,expectedObjects,resultFile.code);
}

test('block-local const alias cannot authorize a free global reference',()=>{
  equivalent(`'use strict';globalThis["alias"]={secretKey:200};
    const local={secretKey:1};{const alias=local;}
    module.exports=[alias.secretKey,Object.keys(globalThis["alias"])[0]];`,0);
});

test('function parameter scope cannot authorize a same-named global',()=>{
  equivalent(`'use strict';globalThis["p"]={secretKey:300};
    const local={secretKey:2};function read(p){return p.secretKey;}
    module.exports=[read(local),p.secretKey];`,0);
});

test('function-local root cannot authorize a same-named global',()=>{
  equivalent(`'use strict';globalThis["local"]={secretKey:400};
    function read(){const local={secretKey:3};return local.secretKey;}
    module.exports=[read(),local.secretKey];`,0);
});

test('block-local function cannot certify a global callee with the same name',()=>{
  equivalent(`'use strict';globalThis["reader"]=(o)=>Object.keys(o)[0];
    const local={secretKey:4};{function reader(p){return p.secretKey;}}
    module.exports=[reader(local),local.secretKey];`,0);
});

test('a genuine nested-block alias retains local transformation',()=>{
  equivalent(`'use strict';function run(){const local={secretKey:5};
    {const alias=local;return alias.secretKey;}}
    module.exports=run();`,1);
});

test('a trusted function and parameter within one lexical region still transform',()=>{
  equivalent(`'use strict';function run(){const local={secretKey:6};
    function read(p){return p.secretKey;}return read(local);}
    module.exports=run();`,1);
});
