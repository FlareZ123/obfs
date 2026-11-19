'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {transformSync} = require('esbuild');
const {recover} = require('../sims/mba-author-int32-minified-recover');
const {recoverDataflow} = require('../sims/mba-author-int32-dataflow-recover');
const {
  forwardChain32,
  inverseChain32
} = require('../sims/mba-author-int32-component-inverse');

test('dataflow attacker recovers mixed independently parameterized unrolled rounds', () => {
  const rounds = [
    {
      coefficients: [0x91e10da5, 0x6d2b79f5],
      xorShifts: [7, 19],
      cyclicShifts: [3, 11, 23]
    },
    {
      coefficients: [0x243f6a88, 0x9e3779b1],
      xorShifts: [9, 21],
      cyclicShifts: [5, 13, 27]
    }
  ];
  const secret = 47;
  const target = forwardChain32(secret, rounds);
  const splitA = 0x13579bdf;
  const splitB = (rounds[0].coefficients[0] ^ splitA) >>> 0;
  const splitC = 0x2468ace0;
  const splitD = (rounds[1].coefficients[0] ^ splitC) >>> 0;

  const source = [
    "'use strict';",
    "function r(v,s){return (((v<<s)|(v>>>(32-s)))>>>0);}",
    "module.exports=function f(c){",
    "const mul=Math.imul;",
    "let x=c>>>0;",
    `const a=${splitA},b=${splitB};`,
    `const p=(mul(x,${rounds[0].coefficients[1]})^a^b)>>>0;`,
    "const q=p>>>5;",
    "const s=(p^(p>>>19)^q^q^(p>>>7))>>>0;",
    "x=(r(s,23)^r(s,3)^r(s,11))>>>0;",
    `const d=${splitC},e=${splitD};`,
    `const u=(d^mul(${rounds[1].coefficients[1]},x)^e)>>>0;`,
    "const z=u>>>17;",
    "const t=(u^(u>>>21)^z^z^(u>>>9))>>>0;",
    "x=(r(t,13)^r(t,27)^r(t,5))>>>0;",
    `return ${target}===x;`,
    "};"
  ].join('\n');

  const minified = transformSync(source, {
    loader: 'js',
    format: 'cjs',
    target: 'es2022',
    minify: true,
    legalComments: 'none'
  }).code;

  assert.throws(
    () => recover(minified),
    /author-style loop or target not found/,
    'The older syntax recognizer should not understand the unrolled mixed form'
  );

  const recovered = recoverDataflow(minified);
  assert.equal(recovered.inputIndex, 0);
  assert.equal(recovered.target, target);
  assert.deepEqual(recovered.rounds, rounds);

  const recoveredInput = inverseChain32(recovered.target, recovered.rounds);
  assert.equal(recoveredInput, secret);
});


test('dataflow attacker statically executes table-indexed round loop', () => {
  const rounds = [
    {
      coefficients: [0x6a09e667, 0xbb67ae85],
      xorShifts: [6, 17],
      cyclicShifts: [4, 15, 29]
    },
    {
      coefficients: [0x3c6ef372, 0xa54ff53b],
      xorShifts: [9, 22],
      cyclicShifts: [7, 19, 26]
    }
  ];
  const secret = 173;
  const target = forwardChain32(secret, rounds);

  const source = [
    "'use strict';",
    "const rot=(v,s)=>(((v<<s)|(v>>>(32-s)))>>>0);",
    "module.exports=function predicate(input){",
    "const mul=Math.imul;",
    "let x=input>>>0;",
    `const add=[${rounds.map(round => round.coefficients[0]).join(',')}];`,
    `const muls=[${rounds.map(round => round.coefficients[1]).join(',')}];`,
    `const xs0=[${rounds.map(round => round.xorShifts[0]).join(',')}];`,
    `const xs1=[${rounds.map(round => round.xorShifts[1]).join(',')}];`,
    `const r0=[${rounds.map(round => round.cyclicShifts[0]).join(',')}];`,
    `const r1=[${rounds.map(round => round.cyclicShifts[1]).join(',')}];`,
    `const r2=[${rounds.map(round => round.cyclicShifts[2]).join(',')}];`,
    "for(let i=0;i<add.length;i++){",
    "const p=(add[i]^mul(muls[i],x))>>>0;",
    "const q=(p^(p>>>xs1[i])^(p>>>xs0[i]))>>>0;",
    "x=(rot(q,r2[i])^rot(q,r0[i])^rot(q,r1[i]))>>>0;",
    "}",
    `return ${target}===x;`,
    "};"
  ].join('\n');

  const minified = transformSync(source, {
    loader: 'js',
    format: 'cjs',
    target: 'es2022',
    minify: true,
    legalComments: 'none'
  }).code;

  assert.throws(
    () => recover(minified),
    /round bound not found|literal round count not found|round parameters not structurally recoverable/,
    'The older repeated-literal loop recognizer should reject table-indexed rounds'
  );

  const recovered = recoverDataflow(minified);
  assert.equal(recovered.inputIndex, 0);
  assert.equal(recovered.target, target);
  assert.deepEqual(recovered.rounds, rounds);
  assert.equal(inverseChain32(recovered.target, recovered.rounds), secret);
});


test('dataflow attacker partially evaluates constant-state switch flattening', () => {
  const rounds = [
    {
      coefficients: [0x510e527f, 0x9b05688d],
      xorShifts: [5, 18],
      cyclicShifts: [2, 14, 25]
    },
    {
      coefficients: [0x1f83d9ab, 0x5be0cd19],
      xorShifts: [8, 23],
      cyclicShifts: [6, 17, 30]
    }
  ];
  const secret = 211;
  const target = forwardChain32(secret, rounds);

  const source = [
    "'use strict';",
    "function rot(v,s){return (((v<<s)|(v>>>(32-s)))>>>0);}",
    "module.exports=function predicate(input){",
    "const mul=Math.imul;",
    "let x=input>>>0,state=17;",
    "while(state!==31){",
    "switch(state){",
    "case 9:",
    `const p1=(mul(${rounds[1].coefficients[1]},x)^${rounds[1].coefficients[0]})>>>0;`,
    `const q1=(p1^(p1>>>${rounds[1].xorShifts[1]})^(p1>>>${rounds[1].xorShifts[0]}))>>>0;`,
    `x=(rot(q1,${rounds[1].cyclicShifts[2]})^rot(q1,${rounds[1].cyclicShifts[0]})^rot(q1,${rounds[1].cyclicShifts[1]}))>>>0;`,
    "state=4;break;",
    "case 4:",
    "state=31;break;",
    "case 17:",
    `const p0=(${rounds[0].coefficients[0]}^mul(x,${rounds[0].coefficients[1]}))>>>0;`,
    `const q0=(p0^(p0>>>${rounds[0].xorShifts[0]})^(p0>>>${rounds[0].xorShifts[1]}))>>>0;`,
    `x=(rot(q0,${rounds[0].cyclicShifts[1]})^rot(q0,${rounds[0].cyclicShifts[2]})^rot(q0,${rounds[0].cyclicShifts[0]}))>>>0;`,
    "state=9;break;",
    "default:",
    "state=31;break;",
    "}",
    "}",
    `return x===${target};`,
    "};"
  ].join('\n');

  const minified = transformSync(source, {
    loader: 'js',
    format: 'cjs',
    target: 'es2022',
    minify: true,
    legalComments: 'none'
  }).code;

  assert.throws(
    () => recover(minified),
    /author-style loop or target not found|round bound not found/,
    'The older loop recognizer should reject switch-flattened control flow'
  );

  const recovered = recoverDataflow(minified);
  assert.equal(recovered.inputIndex, 0);
  assert.equal(recovered.target, target);
  assert.deepEqual(recovered.rounds, rounds);
  assert.equal(inverseChain32(recovered.target, recovered.rounds), secret);
});


test('dataflow attacker evaluates deterministically encoded public parameter tables', () => {
  const rounds = [
    {
      coefficients: [0x428a2f98, 0x71374491],
      xorShifts: [7, 20],
      cyclicShifts: [3, 16, 27]
    },
    {
      coefficients: [0xb5c0fbcf, 0xe9b5dba5],
      xorShifts: [11, 24],
      cyclicShifts: [6, 18, 29]
    }
  ];
  const secret = 239;
  const target = forwardChain32(secret, rounds);
  const addKey = 0x10203040;
  const mulKey = 0x55667788;
  const shiftKey = 37;
  const rotateKey = 0x1b;

  const source = [
    "'use strict';",
    "const rot=(v,s)=>(((v<<s)|(v>>>(32-s)))>>>0);",
    "module.exports=function predicate(input){",
    "const mul=Math.imul;",
    "let x=input>>>0;",
    `const add=[${rounds.map(round => (round.coefficients[0] + addKey) >>> 0).join(',')}];`,
    `const muls=[${rounds.map(round => (round.coefficients[1] ^ mulKey) >>> 0).join(',')}];`,
    `const s0=[${rounds.map(round => round.xorShifts[0] + shiftKey).join(',')}];`,
    `const s1=[${rounds.map(round => round.xorShifts[1] + shiftKey).join(',')}];`,
    `const r0=[${rounds.map(round => round.cyclicShifts[0] ^ rotateKey).join(',')}];`,
    `const r1=[${rounds.map(round => round.cyclicShifts[1] ^ rotateKey).join(',')}];`,
    `const r2=[${rounds.map(round => round.cyclicShifts[2] ^ rotateKey).join(',')}];`,
    `const ak=${addKey},mk=${mulKey},sk=${shiftKey},rk=${rotateKey};`,
    "for(let i=0;i<add.length;i++){",
    "const p=(((add[i]-ak)^mul((muls[i]^mk),x)))>>>0;",
    "const q=(p^(p>>>(s1[i]-sk))^(p>>>(s0[i]-sk)))>>>0;",
    "x=(rot(q,(r2[i]^rk))^rot(q,(r0[i]^rk))^rot(q,(r1[i]^rk)))>>>0;",
    "}",
    `return ${target}===x;`,
    "};"
  ].join('\n');

  const minified = transformSync(source, {
    loader: 'js',
    format: 'cjs',
    target: 'es2022',
    minify: true,
    legalComments: 'none'
  }).code;

  assert.throws(
    () => recover(minified),
    /literal round count not found|round parameters not structurally recoverable/,
    'The older extractor should reject encoded table parameters'
  );

  const recovered = recoverDataflow(minified);
  assert.equal(recovered.inputIndex, 0);
  assert.equal(recovered.target, target);
  assert.deepEqual(recovered.rounds, rounds);
  assert.equal(inverseChain32(recovered.target, recovered.rounds), secret);
});


test('dataflow attacker merges equivalent input-dependent branch forms', () => {
  const rounds = [
    {
      coefficients: [0x3956c25b, 0x59f111f1],
      xorShifts: [8, 21],
      cyclicShifts: [5, 17, 28]
    }
  ];
  const secret = 251;
  const target = forwardChain32(secret, rounds);
  const round = rounds[0];

  const source = [
    "'use strict';",
    "const rot=(v,s)=>(((v<<s)|(v>>>(32-s)))>>>0);",
    "module.exports=function predicate(input){",
    "const imul=Math.imul;",
    "let x=input>>>0;",
    `const p=(${round.coefficients[0]}^imul(x,${round.coefficients[1]}))>>>0;`,
    "let q;",
    `if(x===0){q=(p^(p>>>${round.xorShifts[0]})^(p>>>${round.xorShifts[1]}))>>>0;}`,
    `else{q=((p>>>${round.xorShifts[1]})^p^(p>>>${round.xorShifts[0]}))>>>0;}`,
    `x=(rot(q,${round.cyclicShifts[2]})^rot(q,${round.cyclicShifts[0]})^rot(q,${round.cyclicShifts[1]}))>>>0;`,
    `return x===${target};`,
    "};"
  ].join('\n');

  const minified = transformSync(source, {
    loader:'js',
    format:'cjs',
    target:'es2022',
    minify:true,
    legalComments:'none'
  }).code;

  assert.throws(
    () => recover(minified),
    /author-style loop or target not found/,
    'The older loop recognizer should reject input-dependent branch mixing'
  );

  const recovered = recoverDataflow(minified);
  assert.equal(recovered.inputIndex, 0);
  assert.equal(recovered.target, target);
  assert.deepEqual(recovered.rounds, rounds);
  assert.equal(inverseChain32(recovered.target, recovered.rounds), secret);
});

test('dataflow attacker refuses divergent input-dependent branch forms', () => {
  const source = [
    "'use strict';",
    "const rot=(v,s)=>(((v<<s)|(v>>>(32-s)))>>>0);",
    "module.exports=function predicate(input){",
    "const imul=Math.imul;",
    "let x=input>>>0;",
    "const p=(123456789^imul(x,2654435761))>>>0;",
    "let q;",
    "if(x===0){q=(p^(p>>>7)^(p>>>19))>>>0;}",
    "else{q=(p^(p>>>8)^(p>>>19))>>>0;}",
    "x=(rot(q,3)^rot(q,11)^rot(q,23))>>>0;",
    "return x===123456789;",
    "};"
  ].join('\n');

  const minified = transformSync(source, {
    loader:'js',
    format:'cjs',
    target:'es2022',
    minify:true,
    legalComments:'none'
  }).code;

  assert.throws(
    () => recoverDataflow(minified),
    /dataflow-normalized author-style predicate not found/
  );
});
