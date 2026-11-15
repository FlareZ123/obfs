'use strict';
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { transform } = require('../lib/transform');

/** @param {number} seed @returns {() => number} */
function rng(seed) {
  let s=seed>>>0;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return (s>>>0);
  };
}
/** @param {string} source @returns {string} */
function run(source) {
  const values = [];
  try {
    vm.runInNewContext(source, {console:{log:(...args)=>values.push(args.map(String).join(' '))}}, {timeout:1000});
    return 'ok:' + values.join('|');
  } catch (error) {
    return 'error:' + error.name + ':' + error.message + ':' + values.join('|');
  }
}
/** @param {string} key @returns {string} */
const q = key => JSON.stringify(key);
/** @param {string} key @returns {string} */
const access = key => /^[a-zA-Z_$][\w$]*$/.test(key) ? '.' + key : '[' + q(key) + ']';
/** @param {string} key @param {number} n @returns {string[]} */
function cases(key,n) {
  const prop=access(key), literal=q(key);
  const initial=`const a={${literal}:${n},other:${n+1}};`;
  return [
    `${initial}console.log(a${prop});`,
    `${initial}const b=a;console.log(b${prop});`,
    `${initial}const b=a;const c=b;c${prop}+=2;console.log(a${prop});`,
    `${initial}function id(x){return x;}const b=id(a);console.log(b${prop});`,
    `${initial}function use(x){console.log(x${prop});}use(a);`,
    `${initial}function use(x){x${prop}++;}use(a);console.log(a${prop});`,
    `${initial}function use(x){return x${prop};}console.log(use(a));`,
    `${initial}function use(x){return x;}console.log(use(a)${prop});`,
    `${initial}function use(x){return x;}const b=use(a);console.log(b${prop});`,
    `${initial}const k=${literal};console.log(a[k],a${prop});`,
    `${initial}console.log(a[${literal}],a${prop});`,
    `${initial}console.log(Object.keys(a).join(','),a${prop});`,
    `${initial}console.log(JSON.stringify(a),a${prop});`,
    `${initial}function f(x){return arguments[0][${literal}];}console.log(f(a));`,
    `${initial}function f(x){return arguments[0][${literal}]+x${prop};}console.log(f(a));`,
    `${initial}function f(...x){return x[0][${literal}];}console.log(f(a));`,
    `${initial}function f({${q(key)}:x}){return x;}console.log(f(a));`,
    `${initial}const b={container:a};console.log(b.container${prop});`,
    `${initial}const b=[a];console.log(b[0]${prop});`,
    `${initial}const b={...a};console.log(b[${literal}]);`,
    `${initial}const b=a${prop};console.log(b);`,
    `${initial}let b=a;if(${n}%2===0)b={${literal}:${n+2}};console.log(b${prop});`,
    `${initial}function f(x){const b=x;return b;}console.log(f(a)${prop});`,
    `${initial}function f(x){return [x];}console.log(f(a)[0][${literal}]);`,
    `${initial}function f(x){return {ref:x};}console.log(f(a).ref[${literal}]);`,
    `${initial}function f(x){return x;}const b=()=>f(a);console.log(b()${prop});`,
    `${initial}function f(x){return x;}const result=f(a);console.log(result${prop});`,
    `${initial}function f(x){return x;}const b=f;console.log(b(a)${prop});`,
    `${initial}function f(x){return x;}console.log(f.call(null,a)[${literal}]);`,
    `${initial}function f(x){return x;}const b=Reflect.apply(f,null,[a]);console.log(b[${literal}]);`,
    `${initial}console.log(${literal} in a,a[${literal}]);`,
    `${initial}console.log(Object.hasOwn(a,${literal}));`,
    `${initial}function f(x){return x?.[${literal}];}console.log(f(a));`,
  ];
}
const seed=Number(process.env.OBFS_FUZZ_SEED ?? 0xC0FFEE);
if(!Number.isSafeInteger(seed) || seed<0 || seed>0xFFFFFFFF)throw new Error('OBFS_FUZZ_SEED must be a uint32');
const rand=rng(seed);
const keys=['secret','alpha','$name','some_key','a-b','constructor','prototype','a space','__proto__','unicode_π'];
let total=0,renamed=0,failures=[];
const rounds=Number(process.env.OBFS_FUZZ_ROUNDS ?? 1);
if(!Number.isInteger(rounds) || rounds<1 || rounds>1000)throw new Error("OBFS_FUZZ_ROUNDS must be an integer from 1 to 1000");
for(let i=0;i<rounds;i++) {
  const name=keys[rand()%keys.length];
  const n=1+(rand()%1000);
  for(const [index,source] of cases(name,n).entries()) {
    total++;
    const result=transform({ 'fuzz.js':source }, {closedWorld:true,seed:'corpus-v1'});
    renamed+=result.renamed;
    const original=run(source),obfuscated=run(result.files['fuzz.js']);
    if(original!==obfuscated) failures.push({key:name,n,index,original,obfuscated,source,code:result.files['fuzz.js']});
  }
}
console.log(JSON.stringify({seed:'0x'+seed.toString(16),cases:total,renamed,failures},null,2));
assert.equal(failures.length,0,'semantic counterexample(s) discovered');
