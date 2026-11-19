'use strict';

const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const vm = require('node:vm');
const {classifyInt32Binary} = require('./a2mba-hybrid-opcode-classifier');

const ATTACKER_COMMIT = 'a529fb903a2116efe1c195ea9a2c181769711686';
const SEED = 'heldout-after-a529fb9:2026-11-19:agent38:a2mba-hybrid-opcode:v1';
const OPS = ['add','sub','mul','and','or','xor'];

class HashStream {
  /** @param {string} seed */
  constructor(seed) {
    this.seed = seed;
    this.counter = 0;
  }

  /** @returns {number} */
  word() {
    return createHash('sha256')
      .update(this.seed)
      .update(':')
      .update(String(this.counter++))
      .digest()
      .readUInt32LE(0);
  }

  /** @param {number} maximum @returns {number} */
  below(maximum) {
    return this.word() % maximum;
  }

  /** @returns {boolean} */
  bit() {
    return (this.word() & 1) === 1;
  }

  /** @param {string} prefix @returns {string} */
  name(prefix) {
    return prefix + this.word().toString(16).padStart(8, '0');
  }
}

/**
 * @param {string} left
 * @param {string} right
 * @param {boolean} swap
 * @returns {[string,string]}
 */
function maybeSwap(left,right,swap) {
  return swap ? [right,left] : [left,right];
}

/**
 * @param {string} op
 * @param {string} left
 * @param {string} right
 * @param {HashStream} stream
 * @returns {string}
 */
function baseExpression(op,left,right,stream) {
  switch(op) {
    case 'add': {
      const [a,b]=maybeSwap(left,right,stream.bit());
      return stream.bit()
        ? '((' + a + '^' + b + ')+Math.imul(2,(' + a + '&' + b + ')))'
        : '((' + a + '|' + b + ')+(' + a + '&' + b + '))';
    }
    case 'sub':
      return '(' + left + '+((~' + right + ')+1))';
    case 'mul': {
      const [a,b]=maybeSwap(left,right,stream.bit());
      return stream.bit()
        ? 'Math.imul(' + a + ',' + b + ')'
        : 'Math.imul(-' + a + ',-' + b + ')';
    }
    case 'and': {
      const [a,b]=maybeSwap(left,right,stream.bit());
      return stream.bit()
        ? '~((~' + a + ')|(~' + b + '))'
        : '(((' + a + '+' + b + ')|0)-(' + a + '|' + b + '))';
    }
    case 'or': {
      const [a,b]=maybeSwap(left,right,stream.bit());
      return stream.bit()
        ? '~((~' + a + ')&(~' + b + '))'
        : '(((' + a + '+' + b + ')|0)-(' + a + '&' + b + '))';
    }
    case 'xor': {
      const [a,b]=maybeSwap(left,right,stream.bit());
      return stream.bit()
        ? '(((' + a + '+' + b + ')|0)-Math.imul(2,(' + a + '&' + b + ')))'
        : '((' + a + '|' + b + ')-(' + a + '&' + b + '))';
    }
    default:
      throw new Error('unknown operation');
  }
}

/**
 * @param {string} expression
 * @param {HashStream} stream
 * @returns {string}
 */
function wrapExpression(expression,stream) {
  let value='(' + expression + ')|0';
  const count=3+stream.below(6);
  for(let index=0;index<count;index++) {
    switch(stream.below(5)) {
      case 0: value='((' + value + ')^0)'; break;
      case 1: value='((' + value + ')+0)|0'; break;
      case 2: value='((' + value + ')&-1)'; break;
      case 3: value='~(~(' + value + '))'; break;
      case 4: value='-(-(' + value + '))|0'; break;
    }
  }
  return value;
}

/**
 * Emit a held-out source function after the classifier freeze.
 *
 * @param {string} op
 * @param {HashStream} stream
 * @returns {string}
 */
function emitHeldout(op,stream) {
  const fn=stream.name('f');
  const left=stream.name('x');
  const right=stream.name('y');
  const expression=wrapExpression(baseExpression(op,left,right,stream),stream);
  return '(function ' + fn + '(' + left + ',' + right + '){return ' + expression + ';})';
}

/** @param {string} op @param {number} left @param {number} right @returns {number} */
function nativeOp(op,left,right) {
  switch(op) {
    case 'add': return (left+right)|0;
    case 'sub': return (left-right)|0;
    case 'mul': return Math.imul(left,right);
    case 'and': return left&right;
    case 'or': return left|right;
    case 'xor': return left^right;
    default: throw new Error('unknown operation');
  }
}

/** @returns {{cases:number,exactRecoveries:number,totalCandidateCalls:number,attackerCommit:string,seed:string}} */
function runHeldout() {
  const stream=new HashStream(SEED);
  let exactRecoveries=0;
  let totalCandidateCalls=0;
  const cases=96;
  for(let index=0;index<cases;index++) {
    const op=OPS[index%OPS.length];
    const source=emitHeldout(op,stream);
    /** @type {(left:number,right:number)=>number} */
    const candidate=vm.runInNewContext(source,{Math});
    let calls=0;
    /** @type {(left:number,right:number)=>number} */
    const observed=(left,right)=>{
      calls++;
      return candidate(left,right);
    };
    assert.equal(classifyInt32Binary(observed),op);
    assert.equal(calls,1,'attacker must use exactly one candidate execution');
    totalCandidateCalls+=calls;

    let state=stream.word()|0;
    for(let sample=0;sample<256;sample++) {
      state=(Math.imul(state,1664525)+1013904223)|0;
      const left=state;
      const right=(state^Math.imul(sample,0x45d9f3b))|0;
      assert.equal(candidate(left,right)|0,nativeOp(op,left,right));
    }
    exactRecoveries++;
  }
  return {cases,exactRecoveries,totalCandidateCalls,attackerCommit:ATTACKER_COMMIT,seed:SEED};
}

function main() {
  console.log(JSON.stringify(runHeldout(),null,2));
}

if(require.main===module)main();

module.exports={ATTACKER_COMMIT,SEED,HashStream,emitHeldout,runHeldout};
