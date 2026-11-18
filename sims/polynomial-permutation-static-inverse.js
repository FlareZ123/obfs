'use strict';

const {createHash}=require('node:crypto');
const {performance}=require('node:perf_hooks');
const {transformSync}=require('esbuild');
const {parse,walk}=require('../src/ast');

/** @typedef {{source:string,secret:number,target:number,coefficients:number[]}} Sample */
/** @typedef {{secret:number,evaluations:number,coefficients:number[],target:number}} Recovery */

/** @param {string} label @param {number} count @returns {number[]} */
function hashWords(label,count) {
  const words=[];
  for(let counter=0;words.length<count;counter++) {
    const digest=createHash('sha256').update(label+'\0'+counter).digest();
    for(let offset=0;offset+4<=digest.length&&words.length<count;offset+=4)
      words.push(digest.readUInt32LE(offset));
  }
  return words;
}

/** @param {number[]} coefficients @returns {boolean} */
function isRivestPermutation(coefficients) {
  if(coefficients.length<2 || (coefficients[1]&1)!==1)return false;
  let evenParity=0,oddParity=0;
  for(let i=2;i<coefficients.length;i+=2)evenParity^=coefficients[i]&1;
  for(let i=3;i<coefficients.length;i+=2)oddParity^=coefficients[i]&1;
  return evenParity===0&&oddParity===0;
}

/** @param {string} seed @returns {number[]} */
function makeCoefficients(seed) {
  const coefficients=hashWords(seed+':coefficients',8);
  coefficients[1]=(coefficients[1]|1)>>>0;
  let evenParity=0;
  for(let i=2;i<6;i+=2)evenParity^=coefficients[i]&1;
  coefficients[6]=((coefficients[6]&0xfffffffe)|evenParity)>>>0;
  let oddParity=0;
  for(let i=3;i<7;i+=2)oddParity^=coefficients[i]&1;
  coefficients[7]=((coefficients[7]&0xfffffffe)|oddParity)>>>0;
  if(coefficients[7]===0)coefficients[7]=oddParity===0?2:1;
  if(!isRivestPermutation(coefficients))throw new Error('Generated invalid permutation coefficients');
  return coefficients;
}

/** @param {number[]} coefficients @param {number} value @returns {number} */
function evaluatePolynomial32(coefficients,value) {
  const x=value>>>0;
  let accumulator=0;
  for(let i=coefficients.length-1;i>=0;i--)
    accumulator=(Math.imul(accumulator,x)+coefficients[i])>>>0;
  return accumulator;
}

/** @param {number[]} coefficients @param {bigint} value @param {number} bits @returns {bigint} */
function evaluatePolynomialBits(coefficients,value,bits) {
  const mask=(1n<<BigInt(bits))-1n;
  let accumulator=0n;
  for(let i=coefficients.length-1;i>=0;i--)
    accumulator=(accumulator*value+BigInt(coefficients[i]))&mask;
  return accumulator;
}

/**
 * Invert a Rivest permutation polynomial one bit at a time. The same
 * coefficient parity conditions make P a permutation modulo every 2^k, so
 * exactly one extension of the already-recovered low bits matches each step.
 * @param {number[]} coefficients
 * @param {number} target
 * @returns {{value:number,evaluations:number}}
 */
function invertPolynomial32(coefficients,target) {
  if(!isRivestPermutation(coefficients))throw new Error('Polynomial is not in the proved permutation family');
  let value=0n,evaluations=0;
  const wanted=BigInt(target>>>0);
  for(let bit=0;bit<32;bit++) {
    const highBit=1n<<BigInt(bit);
    const bits=bit+1;
    const mask=(highBit<<1n)-1n;
    const reducedTarget=wanted&mask;
    const low=evaluatePolynomialBits(coefficients,value,bits);
    evaluations++;
    if(low===reducedTarget)continue;
    const high=value|highBit;
    const highValue=evaluatePolynomialBits(coefficients,high,bits);
    evaluations++;
    if(highValue!==reducedTarget)throw new Error('No unique bit lift for permutation target');
    value=high;
  }
  return {value:Number(value),evaluations};
}

/** @param {number} value @returns {string} */
function identifierSuffix(value) {
  return (value>>>0).toString(36);
}

/** @param {number[]} coefficients @param {string} valueName @returns {string} */
function hornerSource(coefficients,valueName) {
  let expression=String(coefficients[coefficients.length-1]);
  for(let i=coefficients.length-2;i>=0;i--)
    expression=`(Math.imul(${expression},${valueName})+${coefficients[i]})>>>0`;
  return expression;
}

/** @param {string} seed @returns {Sample} */
function makeSample(seed) {
  const coefficients=makeCoefficients(seed);
  const words=hashWords(seed+':sample',5);
  const secret=words[0]|0;
  const target=evaluatePolynomial32(coefficients,secret);
  const permutationName='p'+identifierSuffix(words[1]);
  const valueName='v'+identifierSuffix(words[2]);
  const exportedName='q'+identifierSuffix(words[3]);
  const raw=`'use strict';function ${permutationName}(${valueName}){${valueName}>>>=0;return ${hornerSource(coefficients,valueName)}}const ${exportedName}=value=>${permutationName}(value|0)===${target};module.exports=${exportedName};`;
  const source=transformSync(raw,{loader:'js',format:'cjs',minify:true,target:'node22'}).code;
  return {source,secret,target,coefficients};
}

/** @param {import('../src/ast').AstNode} node @returns {number|null} */
function uint32Literal(node) {
  return node.type==='Literal'&&typeof node.value==='number'&&Number.isInteger(node.value)&&
    node.value>=0&&node.value<=0xffffffff?node.value>>>0:null;
}

/** @param {import('../src/ast').AstNode} node @returns {import('../src/ast').AstNode} */
function unwrapUint32(node) {
  let current=node;
  for(;;) {
    if(current.type==='SequenceExpression'&&current.expressions.length) {
      current=current.expressions[current.expressions.length-1];
      continue;
    }
    if(current.type==='BinaryExpression'&&current.operator==='>>>'&&
       current.right?.type==='Literal'&&current.right.value===0) {
      current=current.left;
      continue;
    }
    return current;
  }
}

/** @param {import('../src/ast').AstNode} node @param {string} valueName @returns {number[]|null} */
function recoverHornerHighToLow(node,valueName) {
  const current=unwrapUint32(node);
  const literal=uint32Literal(current);
  if(literal!==null)return [literal];
  if(current.type!=='BinaryExpression'||current.operator!=='+')return null;
  const leftLiteral=uint32Literal(current.left);
  const rightLiteral=uint32Literal(current.right);
  const coefficient=rightLiteral!==null?rightLiteral:leftLiteral;
  const product=rightLiteral!==null?current.left:leftLiteral!==null?current.right:null;
  if(coefficient===null||!product||product.type!=='CallExpression'||product.arguments.length!==2)return null;
  const callee=product.callee;
  if(callee.type!=='MemberExpression'||callee.computed||callee.object.type!=='Identifier'||
     callee.object.name!=='Math'||callee.property.type!=='Identifier'||callee.property.name!=='imul')return null;
  const multiplier=product.arguments[1];
  if(multiplier?.type!=='Identifier'||multiplier.name!==valueName)return null;
  const prior=product.arguments[0]&&recoverHornerHighToLow(product.arguments[0],valueName);
  return prior?[...prior,coefficient]:null;
}

/**
 * Recover the hidden equality constant from the minified public source only.
 * No generator seed, original source, runtime trace, or oracle response is used.
 * @param {string} source
 * @returns {Recovery}
 */
function recoverSecretFromSource(source) {
  const ast=parse(source,'commonjs');
  /** @type {Map<string,number>} */
  const numericBindings=new Map();
  /** @type {Map<string,number[]>} */
  const polynomialFunctions=new Map();
  walk(ast,node=>{
    if(node.type==='VariableDeclarator'&&node.id.type==='Identifier'&&node.init) {
      const value=uint32Literal(node.init);
      if(value!==null)numericBindings.set(node.id.name,value);
    }
    if(node.type!=='FunctionDeclaration'||node.id?.type!=='Identifier'||
       node.params.length!==1||node.params[0].type!=='Identifier')return;
    let returnArgument=null,returnCount=0;
    for(const statement of node.body.body) {
      if(statement.type!=='ReturnStatement')continue;
      returnCount++;
      returnArgument=statement.argument??null;
    }
    if(returnCount!==1||returnArgument===null)return;
    const highToLow=recoverHornerHighToLow(returnArgument,node.params[0].name);
    if(!highToLow||highToLow.length<2)return;
    const coefficients=[...highToLow].reverse();
    if(isRivestPermutation(coefficients))polynomialFunctions.set(node.id.name,coefficients);
  });
  /** @type {{coefficients:number[],target:number}[]} */
  const candidates=[];
  walk(ast,node=>{
    if(node.type!=='BinaryExpression'||node.operator!=='===')return;
    for(const [callSide,targetSide] of [[node.left,node.right],[node.right,node.left]]) {
      if(callSide.type!=='CallExpression'||callSide.callee.type!=='Identifier')continue;
      const coefficients=polynomialFunctions.get(callSide.callee.name);
      if(!coefficients)continue;
      const literal=uint32Literal(targetSide);
      const target=literal!==null?literal:
        targetSide.type==='Identifier'?numericBindings.get(targetSide.name)??null:null;
      if(target!==null)candidates.push({coefficients,target});
    }
  });
  if(candidates.length!==1)throw new Error(`Expected one public polynomial equality, found ${candidates.length}`);
  const {coefficients,target}=candidates[0];
  const inverse=invertPolynomial32(coefficients,target);
  return {secret:inverse.value|0,evaluations:inverse.evaluations,coefficients,target};
}

/** @param {number[]} values @returns {number} */
function median(values) {
  const sorted=[...values].sort((a,b)=>a-b);
  const middle=Math.floor(sorted.length/2);
  return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;
}

/** @param {(value:number)=>boolean} predicate @param {Int32Array} inputs @param {number} iterations @returns {{elapsedMs:number,hits:number}} */
function measurePredicate(predicate,inputs,iterations) {
  let hits=0;
  const start=performance.now();
  for(let i=0;i<iterations;i++)if(predicate(inputs[i&(inputs.length-1)]))hits++;
  return {elapsedMs:performance.now()-start,hits};
}

/** @param {string} source @returns {(value:number)=>boolean} */
function compilePredicate(source) {
  /** @type {{exports:unknown}} */
  const moduleRecord={exports:null};
  Function('module',source)(moduleRecord);
  if(typeof moduleRecord.exports!=='function')throw new Error('Generated source did not export a predicate');
  return /** @type {(value:number)=>boolean} */(moduleRecord.exports);
}

/** @param {number} [sampleCount] @returns {{samples:number,recovered:number,medianAttackMs:number,maxEvaluations:number}} */
function runRecoveryMatrix(sampleCount=64) {
  const times=[];
  let recovered=0,maxEvaluations=0;
  for(let i=0;i<sampleCount;i++) {
    const sample=makeSample('agent1-polynomial-heldout-'+i);
    const start=performance.now();
    const attack=recoverSecretFromSource(sample.source);
    times.push(performance.now()-start);
    maxEvaluations=Math.max(maxEvaluations,attack.evaluations);
    if(attack.secret!==sample.secret)throw new Error(`Recovery mismatch for sample ${i}`);
    recovered++;
  }
  return {samples:sampleCount,recovered,medianAttackMs:median(times),maxEvaluations};
}

/** @returns {{iterations:number,nativeMedianMs:number,candidateMedianMs:number,medianRatio:number,maxPairRatio:number,overBudgetPairs:number,pairs:number}} */
function runRuntimeProfile() {
  const sample=makeSample('agent1-polynomial-runtime-profile');
  const candidate=compilePredicate(sample.source);
  /** @type {(value:number)=>boolean} */
  const native=value=>(value|0)===sample.secret;
  const inputWords=hashWords('agent1-polynomial-runtime-inputs',4096);
  const inputs=new Int32Array(4096);
  for(let i=0;i<inputs.length;i++)inputs[i]=inputWords[i]|0;
  inputs[0]=sample.secret;
  const warmupIterations=500000;
  measurePredicate(native,inputs,warmupIterations);
  measurePredicate(candidate,inputs,warmupIterations);
  const iterations=4000000;
  const nativeTimes=[],candidateTimes=[],ratios=[];
  for(let trial=0;trial<9;trial++) {
    const first=trial%2===0?native:candidate;
    const second=trial%2===0?candidate:native;
    const firstResult=measurePredicate(first,inputs,iterations);
    const secondResult=measurePredicate(second,inputs,iterations);
    if(firstResult.hits!==secondResult.hits)throw new Error('Runtime profile semantic mismatch');
    const nativeMs=trial%2===0?firstResult.elapsedMs:secondResult.elapsedMs;
    const candidateMs=trial%2===0?secondResult.elapsedMs:firstResult.elapsedMs;
    nativeTimes.push(nativeMs);
    candidateTimes.push(candidateMs);
    ratios.push(candidateMs/nativeMs);
  }
  return {
    iterations,
    nativeMedianMs:median(nativeTimes),
    candidateMedianMs:median(candidateTimes),
    medianRatio:median(ratios),
    maxPairRatio:Math.max(...ratios),
    overBudgetPairs:ratios.filter(ratio=>ratio>2.5).length,
    pairs:ratios.length
  };
}

if(require.main===module) {
  const result={recovery:runRecoveryMatrix(),runtime:runRuntimeProfile()};
  console.log('POLYNOMIAL_PERMUTATION_INVERSE '+JSON.stringify(result));
}

module.exports={
  evaluatePolynomial32,
  invertPolynomial32,
  isRivestPermutation,
  makeSample,
  recoverSecretFromSource,
  runRecoveryMatrix,
  runRuntimeProfile
};
