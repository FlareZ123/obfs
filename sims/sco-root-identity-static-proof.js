'use strict';

const {parse,walk}=require('../src/ast');

/**
 * @typedef {{roots:Set<number>,nested:boolean}} RefProvenance
 * @typedef {{eligible:boolean,reasons:string[]}} RootIdentityProof
 */

/** @returns {RefProvenance} */
function emptyProvenance(){
  return {roots:new Set(),nested:false};
}

/** @param {RefProvenance} value @returns {boolean} */
function hasReference(value){
  return value.nested||value.roots.size>0;
}

/** @param {...RefProvenance} values @returns {RefProvenance} */
function mergeProvenance(...values){
  const roots=new Set();
  let nested=false;
  for(const value of values){
    for(const root of value.roots)roots.add(root);
    if(value.nested)nested=true;
  }
  return {roots,nested};
}

/** @param {RefProvenance} left @param {RefProvenance} right @returns {boolean} */
function addProvenance(left,right){
  let changed=false;
  if(right.nested&&!left.nested){
    left.nested=true;
    changed=true;
  }
  for(const root of right.roots){
    if(!left.roots.has(root)){
      left.roots.add(root);
      changed=true;
    }
  }
  return changed;
}

/** @param {import('../src/ast').AstNode} node @returns {string[]} */
function boundNames(node){
  if(node.type==='Identifier')return [node.name];
  if(node.type==='RestElement')return boundNames(node.argument);
  if(node.type==='AssignmentPattern')return boundNames(node.left);
  if(node.type==='ArrayPattern'){
    return node.elements.flatMap((/** @type {import('../src/ast').AstNode|null} */ item)=>
      item?boundNames(item):[]);
  }
  if(node.type==='ObjectPattern'){
    return node.properties.flatMap((/** @type {import('../src/ast').AstNode} */ property)=>
      property.type==='RestElement'?boundNames(property.argument):boundNames(property.value));
  }
  return [];
}

/**
 * Locate one direct exported async function declaration or single const
 * function expression by name.
 * @param {import('../src/ast').AstNode} ast
 * @param {string} name
 * @returns {import('../src/ast').AstNode}
 */
function findExportedFunction(ast,name){
  for(const statement of ast.body){
    if(statement.type!=='ExportNamedDeclaration'||statement.source||
       statement.specifiers?.length||!statement.declaration)continue;
    const declaration=statement.declaration;
    if(declaration.type==='FunctionDeclaration'&&
       declaration.id?.type==='Identifier'&&declaration.id.name===name){
      if(!declaration.async||declaration.generator)throw new TypeError('Root-identity proof expects an async non-generator function');
      return declaration;
    }
    if(declaration.type==='VariableDeclaration'&&declaration.kind==='const'&&
       declaration.declarations.length===1){
      const item=declaration.declarations[0];
      if(item.id.type==='Identifier'&&item.id.name===name&&item.init&&
         ['FunctionExpression','ArrowFunctionExpression'].includes(item.init.type)){
        if(!item.init.async||item.init.generator)throw new TypeError('Root-identity proof expects an async non-generator function');
        return item.init;
      }
    }
  }
  throw new TypeError('Root-identity proof requires a direct exported async function: '+name);
}

/**
 * Conservative syntax proof for the narrow cbor-x root-identity protocol.
 * This is research infrastructure. Existing SCO partition analysis remains
 * responsible for cross-realm, loader, host-effect and authorization rules.
 *
 * @param {string} source
 * @param {string} [name]
 * @returns {RootIdentityProof}
 */
function proveRootIdentityEligibility(source,name='candidate'){
  if(typeof source!=='string'||typeof name!=='string'||!name)throw new TypeError('Expected source and function name');
  const ast=parse(source,'module');
  const fn=findExportedFunction(ast,name);
  if(fn.params.some((/** @type {import('../src/ast').AstNode} */ param)=>param.type!=='Identifier')){
    return {eligible:false,reasons:['parameters must be plain identifiers']};
  }

  const reasons=new Set();
  /** @type {Map<string,RefProvenance>} */
  const bindings=new Map();
  for(let index=0;index<fn.params.length;index++){
    const param=fn.params[index];
    bindings.set(param.name,{roots:new Set([index]),nested:false});
  }

  const builtinRoots=new Set(['Math','Number','Array','Object']);
  const shadowedBuiltins=new Set();
  walk(ast,(node,parent,key)=>{
    if(node.type==='VariableDeclarator'){
      for(const binding of boundNames(node.id))if(builtinRoots.has(binding))shadowedBuiltins.add(binding);
    }
    if((node.type==='FunctionDeclaration'||node.type==='FunctionExpression'||
        node.type==='ArrowFunctionExpression')&&node!==fn){
      if(node.id?.type==='Identifier'&&builtinRoots.has(node.id.name))shadowedBuiltins.add(node.id.name);
      for(const param of node.params){
        for(const binding of boundNames(param))if(builtinRoots.has(binding))shadowedBuiltins.add(binding);
      }
    }
    if(node===fn){
      for(const param of fn.params){
        if(builtinRoots.has(param.name))shadowedBuiltins.add(param.name);
      }
    }
    if(node.type==='ClassDeclaration'&&node.id?.type==='Identifier'&&
       builtinRoots.has(node.id.name))shadowedBuiltins.add(node.id.name);
    if(node.type==='ImportSpecifier'||node.type==='ImportDefaultSpecifier'||
       node.type==='ImportNamespaceSpecifier'){
      if(node.local?.type==='Identifier'&&builtinRoots.has(node.local.name))shadowedBuiltins.add(node.local.name);
    }
    void parent;
    void key;
  });

  const mathPrimitiveMethods=new Set([
    'abs','acos','acosh','asin','asinh','atan','atan2','atanh','cbrt','ceil',
    'clz32','cos','cosh','exp','expm1','floor','fround','hypot','imul','log',
    'log10','log1p','log2','max','min','pow','round','sign','sin','sinh',
    'sqrt','tan','tanh','trunc'
  ]);
  const numberPrimitiveMethods=new Set([
    'isFinite','isInteger','isNaN','isSafeInteger'
  ]);

  /**
   * Source-only proof cannot establish ambient callee identity. A call is
   * reference-safe here only when no argument-derived object crosses it.
   * @param {import('../src/ast').AstNode} node
   * @returns {boolean}
   */
  function isSafePrimitiveCall(node){
    if(node.type!=='CallExpression')return false;
    return node.arguments.every((/** @type {import('../src/ast').AstNode} */ argument)=>{
      const value=argument.type==='SpreadElement'?
        provenance(argument.argument):provenance(argument);
      return !hasReference(value);
    });
  }

  /** @param {import('../src/ast').AstNode|null|undefined} node @returns {RefProvenance} */
  function provenance(node){
    if(!node)return emptyProvenance();
    if(node.type==='Identifier')return bindings.get(node.name)??emptyProvenance();
    if(node.type==='ChainExpression')return provenance(node.expression);
    if(node.type==='MemberExpression'){
      const owner=provenance(node.object);
      return hasReference(owner)?{roots:new Set(),nested:true}:emptyProvenance();
    }
    if(node.type==='ConditionalExpression'){
      return mergeProvenance(provenance(node.consequent),provenance(node.alternate));
    }
    if(node.type==='LogicalExpression'){
      return mergeProvenance(provenance(node.left),provenance(node.right));
    }
    if(node.type==='SequenceExpression'){
      return provenance(node.expressions[node.expressions.length-1]);
    }
    if(node.type==='AssignmentExpression'){
      return node.operator==='='?provenance(node.right):emptyProvenance();
    }
    if(node.type==='AwaitExpression')return provenance(node.argument);
    if(node.type==='ArrayExpression'){
      for(const item of node.elements){
        if(!item)continue;
        const value=item.type==='SpreadElement'?provenance(item.argument):provenance(item);
        if(hasReference(value))return {roots:new Set(),nested:true};
      }
      return emptyProvenance();
    }
    if(node.type==='ObjectExpression'){
      for(const property of node.properties){
        if(property.type==='SpreadElement'){
          if(hasReference(provenance(property.argument)))return {roots:new Set(),nested:true};
          continue;
        }
        if(property.computed&&hasReference(provenance(property.key)))return {roots:new Set(),nested:true};
        if(hasReference(provenance(property.value)))return {roots:new Set(),nested:true};
      }
      return emptyProvenance();
    }
    if(node.type==='UnaryExpression'||node.type==='BinaryExpression'||
       node.type==='TemplateLiteral'||node.type==='UpdateExpression')return emptyProvenance();
    if(node.type==='CallExpression')return emptyProvenance();
    if(node.type==='NewExpression'||node.type==='TaggedTemplateExpression')return emptyProvenance();
    return emptyProvenance();
  }

  // Monotone may-alias propagation. Reassignments never clear provenance.
  let changed=true;
  while(changed){
    changed=false;
    walk(fn.body,node=>{
      if(node.type==='VariableDeclarator'&&node.id.type==='Identifier'&&node.init){
        const value=provenance(node.init);
        let target=bindings.get(node.id.name);
        if(!target){
          target=emptyProvenance();
          bindings.set(node.id.name,target);
        }
        if(addProvenance(target,value))changed=true;
      }
      if(node.type==='AssignmentExpression'&&node.operator==='='&&
         node.left.type==='Identifier'){
        const value=provenance(node.right);
        let target=bindings.get(node.left.name);
        if(!target){
          target=emptyProvenance();
          bindings.set(node.left.name,target);
        }
        if(addProvenance(target,value))changed=true;
      }
      if(node.type==='ForOfStatement'&&hasReference(provenance(node.right))){
        if(node.left.type==='Identifier'){
          let target=bindings.get(node.left.name);
          if(!target){
            target=emptyProvenance();
            bindings.set(node.left.name,target);
          }
          if(!target.nested){
            target.nested=true;
            changed=true;
          }
        }else if(node.left.type==='VariableDeclaration'&&
                 node.left.declarations.length===1&&
                 node.left.declarations[0].id.type==='Identifier'){
          const id=node.left.declarations[0].id.name;
          let target=bindings.get(id);
          if(!target){
            target=emptyProvenance();
            bindings.set(id,target);
          }
          if(!target.nested){
            target.nested=true;
            changed=true;
          }
        }
      }
    });
  }

  /** @param {import('../src/ast').AstNode} node @returns {void} */
  function rejectTaintedContainer(node){
    if(node.type==='ArrayExpression'){
      for(const item of node.elements){
        if(!item)continue;
        const value=item.type==='SpreadElement'?provenance(item.argument):provenance(item);
        if(hasReference(value))reasons.add('argument-derived reference embedded in array');
      }
    }
    if(node.type==='ObjectExpression'){
      for(const property of node.properties){
        if(property.type==='SpreadElement'){
          if(hasReference(provenance(property.argument)))reasons.add('argument-derived reference spread into object');
          continue;
        }
        if(property.computed&&hasReference(provenance(property.key))){
          reasons.add('argument-derived computed object key');
        }
        if(hasReference(provenance(property.value))){
          reasons.add('argument-derived reference embedded in object');
        }
      }
    }
  }

  walk(fn.body,(node,parent,key)=>{
    if(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression',
        'ClassDeclaration','ClassExpression'].includes(node.type)){
      reasons.add('nested function or class is outside root-identity proof');
    }
    if(node.type==='ThisExpression'||node.type==='Super'||node.type==='YieldExpression'||
       node.type==='WithStatement'||node.type==='ImportExpression'){
      reasons.add('dynamic or receiver-sensitive syntax is outside root-identity proof');
    }
    if(node.type==='Identifier'&&!((parent?.type==='Property'||parent?.type==='MemberExpression')&&
       key==='property'&&!parent.computed)&&['eval','Function'].includes(node.name)){
      reasons.add('dynamic source execution is outside root-identity proof');
    }
    if(node.type==='Identifier'&&node.name==='arguments'){
      reasons.add('implicit arguments alias is outside root-identity proof');
    }
    if(node.type==='ForOfStatement'&&node.await){
      reasons.add('async iteration is outside root-identity proof');
    }
    if(node.type==='ForOfStatement'&&hasReference(provenance(node.right))){
      const id=node.left.type==='VariableDeclaration'&&node.left.declarations.length===1?
        node.left.declarations[0].id:node.left;
      if(id.type!=='Identifier')reasons.add('destructuring argument-derived iteration value');
    }
    if(node.type==='VariableDeclarator'&&
       ['ArrayPattern','ObjectPattern'].includes(node.id.type)&&
       hasReference(provenance(node.init))){
      reasons.add('destructuring from argument-derived value');
    }
    if(node.type==='AssignmentExpression'&&
       ['ArrayPattern','ObjectPattern'].includes(node.left.type)&&
       hasReference(provenance(node.right))){
      reasons.add('destructuring assignment from argument-derived value');
    }
    if(node.type==='MemberExpression'&&node.computed&&
       hasReference(provenance(node.property))){
      reasons.add('argument-derived computed member key');
    }
    if(node.type==='AssignmentExpression'){
      if(node.left.type==='MemberExpression'&&hasReference(provenance(node.left.object))){
        reasons.add('mutation of argument-derived member');
      }
      if(node.left.type==='MemberExpression'&&hasReference(provenance(node.right))){
        reasons.add('argument-derived reference escapes through member assignment');
      }
      if(node.operator==='='&&node.left.type==='Identifier'&&
         hasReference(provenance(node.right))){
        reasons.add('assignment of argument-derived reference is outside root-identity proof');
      }
    }
    if(node.type==='ThrowStatement'&&node.argument&&
       hasReference(provenance(node.argument))){
      reasons.add('argument-derived reference thrown across boundary');
    }
    if(node.type==='UpdateExpression'&&node.argument.type==='MemberExpression'&&
       hasReference(provenance(node.argument.object))){
      reasons.add('update of argument-derived member');
    }
    if(node.type==='UnaryExpression'&&node.operator==='delete'&&
       node.argument.type==='MemberExpression'&&
       hasReference(provenance(node.argument.object))){
      reasons.add('delete of argument-derived member');
    }
    if(node.type==='CallExpression'){
      const safePrimitiveCall=isSafePrimitiveCall(node);
      if(node.callee.type==='Identifier'&&hasReference(provenance(node.callee))){
        reasons.add('call through argument-derived callable');
      }
      if(node.callee.type==='MemberExpression'&&
         hasReference(provenance(node.callee.object))){
        reasons.add('method call on argument-derived receiver');
      }
      if(!safePrimitiveCall){
        for(const argument of node.arguments){
          const value=argument.type==='SpreadElement'?
            provenance(argument.argument):provenance(argument);
          if(hasReference(value))reasons.add('argument-derived reference passed to opaque call');
        }
      }
    }
    if(node.type==='NewExpression'){
      if(hasReference(provenance(node.callee))){
        reasons.add('construction through argument-derived callable');
      }
      for(const argument of node.arguments){
        const value=argument.type==='SpreadElement'?
          provenance(argument.argument):provenance(argument);
        if(hasReference(value))reasons.add('argument-derived reference passed to constructor');
      }
    }
    if(node.type==='TaggedTemplateExpression'){
      reasons.add('tagged template is outside root-identity proof');
    }
    if(node.type==='SpreadElement'&&hasReference(provenance(node.argument))){
      reasons.add('argument-derived reference spread or escaped');
    }
    if(node.type==='ArrayExpression'||node.type==='ObjectExpression'){
      rejectTaintedContainer(node);
    }
    if(node.type==='ReturnStatement'&&node.argument){
      const value=provenance(node.argument);
      if(value.nested)reasons.add('nested argument identity may be returned');
    }
  });

  return {eligible:reasons.size===0,reasons:[...reasons].sort()};
}

/** @type {Array<{name:string,source:string}>} */
const ACCEPT_CASES=[
  {name:'direct-root',source:'export async function candidate(payload){return payload;}'},
  {name:'aliased-root',source:'export async function candidate(payload){const same=payload;return same;}'},
  {name:'choose-roots',source:'export async function candidate(left,right,flag){return flag?left:right;}'},
  {name:'root-or-primitive',source:'export async function candidate(payload,flag){return flag?payload:0;}'},
  {name:'nested-arithmetic',source:'export async function candidate(payload){return (payload.record.count|0)+1;}'},
  {name:'loop-return-root',source:'export async function candidate(payload){let sum=0;for(const record of payload.records){sum+=record.quantity|0;}if(sum===-1)return null;return payload;}'},
  {name:'fresh-summary',source:'export async function candidate(payload){return {count:payload.records.length|0,valid:!!payload.ok};}'},
  {name:'pure-primitives-primitiveized',source:'export async function candidate(payload){const x=Math.imul(payload.count|0,31);return Number.isFinite(x)?payload:0;}'}
];

/** @type {Array<{name:string,source:string}>} */
const REFUSE_CASES=[
  {name:'nested-return',source:'export async function candidate(payload){return payload.nested;}'},
  {name:'nested-alias-return',source:'export async function candidate(payload){const nested=payload.nested;return nested;}'},
  {name:'embed-nested',source:'export async function candidate(payload){return {nested:payload.nested};}'},
  {name:'embed-root-array',source:'export async function candidate(payload){return [payload];}'},
  {name:'mutate-root',source:'export async function candidate(payload){payload.x=1;return payload;}'},
  {name:'mutate-nested',source:'export async function candidate(payload){payload.nested.x=1;return payload;}'},
  {name:'update-member',source:'export async function candidate(payload){payload.count++;return payload;}'},
  {name:'delete-member',source:'export async function candidate(payload){delete payload.x;return payload;}'},
  {name:'opaque-root-call',source:'export async function candidate(payload){consume(payload);return payload;}'},
  {name:'opaque-nested-call',source:'export async function candidate(payload){consume(payload.nested);return payload;}'},
  {name:'argument-method',source:'export async function candidate(payload){payload.records.sort();return payload;}'},
  {name:'member-escape',source:'export async function candidate(payload,other){other.saved=payload;return 1;}'},
  {name:'destructure',source:'export async function candidate(payload){const {nested}=payload;return 1;}'},
  {name:'spread',source:'export async function candidate(payload){return {...payload};}'},
  {name:'nested-function',source:'export async function candidate(payload){const read=()=>payload;return 1;}'},
  {name:'computed-key',source:'export async function candidate(payload,other){return (other[payload]|0);}'},
  {name:'eval',source:'export async function candidate(payload){return eval("payload");}'},
  {name:'dynamic-import',source:'export async function candidate(payload){return import(payload);}'}
];

/** @type {Array<{name:string,source:string}>} */
const ADVERSARIAL_CASES=[
  {name:'outer-root-store',source:'let shared;export async function candidate(payload){shared=payload;return 1;}'},
  {name:'outer-nested-store',source:'let shared;export async function candidate(payload){shared=payload.nested;return 1;}'},
  {name:'throw-root',source:'export async function candidate(payload){throw payload;}'},
  {name:'throw-nested',source:'export async function candidate(payload){throw payload.nested;}'},
  {name:'local-reassignment-conservative',source:'export async function candidate(payload){let same;same=payload;return same;}'},
  {name:'implicit-arguments-return',source:'export async function candidate(payload){return arguments[0];}'},
  {name:'implicit-arguments-mutation',source:'export async function candidate(payload){arguments[0].x=1;return 1;}'},
  {name:'math-direct-nested',source:'export async function candidate(payload){return Math.imul(payload.count,31);}'},
  {name:'math-max-direct-nested',source:'export async function candidate(payload){return Math.max(payload.left,payload.right);}'},
  {name:'hasown-reference-key',source:'export async function candidate(payload,other){return Object.hasOwn(other,payload.key);}'},
  {name:'ambient-array-isarray',source:'export async function candidate(payload){return Array.isArray(payload.records)?payload:0;}'},
  {name:'ambient-number-isfinite',source:'export async function candidate(payload){return Number.isFinite(payload.count)?payload:0;}'},
  {name:'ambient-object-hasown',source:'export async function candidate(payload){return Object.hasOwn(payload,"x");}'},
  {name:'ambient-reflect-get',source:'export async function candidate(payload){return Reflect.get(payload,"x");}'},
  {name:'ambient-constructor',source:'export async function candidate(payload){return new Box(payload);}'}
];

/** @type {Array<{name:string,expected:boolean,source:string}>} */
const FIXTURES=[
  {
    name:'record-accumulator-root',
    expected:true,
    source:'export async function candidate(payload){let total=0;for(const record of payload.records){total=Math.imul(total^record.quantity,33)|0;}return total===2147483647?null:payload;}'
  },
  {
    name:'record-validator-primitive',
    expected:true,
    source:'export async function candidate(payload){let valid=true;for(const record of payload.records){valid=valid&&Number.isSafeInteger(record.quantity|0);}return !!valid;}'
  },
  {
    name:'nested-record-lookup',
    expected:false,
    source:'export async function candidate(payload,index){return payload.records[index|0];}'
  }
];

/**
 * @returns {{
 *   accepts:Array<{name:string,proof:RootIdentityProof}>,
 *   refuses:Array<{name:string,proof:RootIdentityProof}>,
 *   adversarial:Array<{name:string,proof:RootIdentityProof}>,
 *   fixtures:Array<{name:string,expected:boolean,proof:RootIdentityProof}>,
 *   passed:boolean
 * }}
 */
function runFrozenCorpus(){
  const accepts=ACCEPT_CASES.map(item=>({
    name:item.name,
    proof:proveRootIdentityEligibility(item.source)
  }));
  const refuses=REFUSE_CASES.map(item=>({
    name:item.name,
    proof:proveRootIdentityEligibility(item.source)
  }));
  const adversarial=ADVERSARIAL_CASES.map(item=>({
    name:item.name,
    proof:proveRootIdentityEligibility(item.source)
  }));
  const fixtures=FIXTURES.map(item=>({
    name:item.name,
    expected:item.expected,
    proof:proveRootIdentityEligibility(item.source)
  }));
  return {
    accepts,
    refuses,
    adversarial,
    fixtures,
    passed:accepts.every(item=>item.proof.eligible)&&
      refuses.every(item=>!item.proof.eligible)&&
      adversarial.every(item=>!item.proof.eligible)&&
      fixtures.every(item=>item.proof.eligible===item.expected)
  };
}

if(require.main===module){
  const result=runFrozenCorpus();
  process.stdout.write('SCO_ROOT_IDENTITY_STATIC_PROOF '+JSON.stringify(result)+'\n');
  if(!result.passed)process.exitCode=1;
}

module.exports={
  proveRootIdentityEligibility,
  runFrozenCorpus,
  ACCEPT_CASES,
  REFUSE_CASES,
  ADVERSARIAL_CASES,
  FIXTURES
};
