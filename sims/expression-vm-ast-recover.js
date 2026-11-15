'use strict';

const acorn=require('acorn');

/** @typedef {{[key:string]:any,type:string}} Node */
/** @typedef {{name:string,parameter:string,expression:string,instructions:number}} RecoveredGraph */

/**
 * Visit ESTree children without relying on compiler source or generated names.
 * @param {Node} root
 * @param {(node:Node)=>void} visit
 */
function walk(root,visit) {
  visit(root);
  for(const value of Object.values(root)) {
    if(Array.isArray(value)) {
      for(const node of value) {
        if(node&&typeof node==='object'&&typeof node.type==='string')walk(node,visit);
      }
    } else if(value&&typeof value==='object'&&typeof value.type==='string') {
      walk(value,visit);
    }
  }
}

/**
 * Read a compile-time integer or XOR-masked literal using published AST only.
 * @param {Node|null} node
 * @returns {number|null}
 */
function integer(node) {
  if(!node)return null;
  if(node.type==='Literal'&&typeof node.value==='number'&&Number.isInteger(node.value))return node.value;
  if(node.type==='BinaryExpression'&&node.operator==='^') {
    const left=integer(node.left),right=integer(node.right);
    return left===null||right===null?null:left^right;
  }
  return null;
}

/**
 * Find an array literal assigned to the helper's lazy bytecode cache.
 * @param {Node} helper
 * @returns {{name:string,bytes:number[]}|null}
 */
function findTape(helper) {
  /** @type {{name:string,bytes:number[]}[]} */
  const candidates=[];
  walk(helper.body,node=>{
    if(node.type!=='VariableDeclarator'||node.id.type!=='Identifier')return;
    const value=node.init;
    if(value?.type!=='LogicalExpression'||value.operator!=='||')return;
    const assigned=value.right;
    if(assigned.type!=='AssignmentExpression'||assigned.operator!=='='||
        assigned.right.type!=='ArrayExpression')return;
    const bytes=assigned.right.elements.map((/** @type {Node|null} */ part)=>integer(part));
    if(bytes.length<6||bytes.some((/** @type {number|null} */ value)=>value===null))return;
    candidates.push({name:node.id.name,bytes:/** @type {number[]} */ (bytes)});
  });
  return candidates.length===1?candidates[0]:null;
}

/**
 * The register array has the VM input as its first element and public masked
 * immediate literals in the remaining own slots.
 * @param {Node} helper
 * @returns {{name:string,initial:(string|null)[]}|null}
 */
function findRegisters(helper) {
  const input=helper.params[0]?.name;
  if(typeof input!=='string')return null;
  /** @type {{name:string,initial:(string|null)[]}[]} */
  const candidates=[];
  walk(helper.body,node=>{
    if(node.type!=='VariableDeclarator'||node.id.type!=='Identifier'||
       node.init?.type!=='ArrayExpression')return;
    const elements=node.init.elements;
    if(elements.length<4||elements[0]?.type!=='Identifier'||
       elements[0].name!==input)return;
    /** @type {(string|null)[]} */
    const values=[input];
    for(const element of elements.slice(1)) {
      if(element?.type==='Literal'&&element.value===null) {
        values.push(null);
        continue;
      }
      const number=integer(element);
      if(number===null||number<0||number>255)return;
      values.push(String(number));
    }
    candidates.push({name:node.id.name,initial:values});
  });
  return candidates.length===1?candidates[0]:null;
}

/**
 * Recover the exposed byte-tape XOR key and rotation from the dispatch
 * expression. All recognized values must be literal constants.
 * @param {Node} helper
 * @param {string} tapeName
 * @returns {{key:number,rotation:number}|null}
 */
function findDispatch(helper,tapeName) {
  /** @type {{key:number,rotation:number}[]} */
  const candidates=[];
  walk(helper.body,node=>{
    if(node.type!=='VariableDeclarator'||node.init?.type!=='BinaryExpression'||
       node.init.operator!=='&'||integer(node.init.right)!==255)return;
    const shifted=node.init.left;
    if(shifted.type!=='BinaryExpression'||shifted.operator!=='-')return;
    const rotation=integer(shifted.right);
    const decoded=shifted.left;
    if(decoded.type!=='BinaryExpression'||decoded.operator!=='^')return;
    const key=integer(decoded.right);
    const tapeRead=decoded.left;
    if(rotation===null||key===null||rotation<0||rotation>255||key<0||key>255||
       tapeRead.type!=='MemberExpression'||tapeRead.object.type!=='Identifier'||
       tapeRead.object.name!==tapeName)return;
    candidates.push({key,rotation});
  });
  return candidates.length===1?candidates[0]:null;
}

/**
 * Decode published switch-case binary operators by their AST rather than by
 * fixed variable spellings or textual layout.
 * @param {Node} helper
 * @param {string} registersName
 * @returns {Map<number,string>|null}
 */
function findOperators(helper,registersName) {
  /** @type {Map<number,string>[]} */
  const candidates=[];
  /** @param {Node} node @returns {boolean} */
  const isRegisterRead=node=>node.type==='MemberExpression'&&node.computed&&
    node.object.type==='Identifier'&&node.object.name===registersName;
  walk(helper.body,node=>{
    if(node.type!=='SwitchStatement')return;
    /** @type {Map<number,string>} */
    const operators=new Map();
    for(const branch of node.cases) {
      const opcode=integer(branch.test);
      if(opcode===null||opcode<1||opcode>254)continue;
      const statement=branch.consequent[0];
      if(statement?.type!=='ExpressionStatement')continue;
      const assignment=statement.expression;
      if(assignment.type!=='AssignmentExpression'||assignment.operator!=='='||
         !isRegisterRead(assignment.left))continue;
      const binary=assignment.right;
      if(binary.type!=='BinaryExpression'||!isRegisterRead(binary.left)||
         !isRegisterRead(binary.right))continue;
      operators.set(opcode,binary.operator);
    }
    if(operators.size>=2)candidates.push(operators);
  });
  return candidates.length===1?candidates[0]:null;
}

/**
 * Identify the single-return public wrapper calling the decoded interpreter.
 * @param {Node} program
 * @param {string} helperName
 * @returns {{name:string,parameter:string}|null}
 */
function findWrapper(program,helperName) {
  /** @type {{name:string,parameter:string}[]} */
  const matches=[];
  for(const statement of program.body) {
    const fn=statement.type==='ExportNamedDeclaration'&&statement.declaration?
      statement.declaration:statement;
    if(fn.type!=='FunctionDeclaration'||fn.id?.type!=='Identifier'||
       fn.params.length!==1||fn.params[0].type!=='Identifier'||
       fn.body.body.length!==1)continue;
    const argument=fn.body.body[0];
    if(argument.type!=='ReturnStatement'||argument.argument?.type!=='CallExpression')continue;
    const call=argument.argument;
    if(call.callee.type==='Identifier'&&call.callee.name===helperName&&
       call.arguments.length===1&&call.arguments[0].type==='Identifier'&&
       call.arguments[0].name===fn.params[0].name) {
      matches.push({name:fn.id.name,parameter:fn.params[0].name});
    }
  }
  return matches.length===1?matches[0]:null;
}

/**
 * Independently reconstruct the transformed program using only the publicly
 * distributed JavaScript, without invoking the obfuscator or knowing its seed.
 *
 * Unlike the text-pattern attacker, this one survives ordinary lexical
 * renaming of interpreter variables and insertion of string decoder helpers.
 *
 * @param {string} code
 * @returns {RecoveredGraph}
 */
function recoverBundledExpressionVm(code) {
  const ast=/** @type {Node} */ (acorn.parse(code,{
    ecmaVersion:'latest',sourceType:'module',allowReturnOutsideFunction:true
  }));
  /** @type {RecoveredGraph[]} */
  const recovered=[];
  for(const statement of ast.body) {
    const helper=statement.type==='ExportNamedDeclaration'&&statement.declaration?
      statement.declaration:statement;
    if(helper.type!=='FunctionDeclaration'||helper.id?.type!=='Identifier'||
       helper.params.length!==1||helper.params[0].type!=='Identifier')continue;
    const tape=findTape(helper);
    const registers=findRegisters(helper);
    if(!tape||!registers)continue;
    const dispatch=findDispatch(helper,tape.name);
    const operators=findOperators(helper,registers.name);
    const wrapper=findWrapper(ast,helper.id.name);
    if(!dispatch||!operators||!wrapper)continue;
    const values=[...registers.initial];
    // The public wrapper and private helper have independent parameter names.
    // Both pass the same value through the exact call, so substitute the
    // wrapper's binding when synthesizing the executable recovered function.
    values[0]=wrapper.parameter;
    let pc=0,instructions=0,invalid=false;
    while(pc<tape.bytes.length) {
      const opcode=((tape.bytes[pc++]^dispatch.key)-dispatch.rotation)&255;
      if(opcode===255) {
        if(pc>=tape.bytes.length){invalid=true;break;}
        const result=tape.bytes[pc++]^dispatch.key;
        if(pc===tape.bytes.length&&typeof values[result]==='string') {
          recovered.push({...wrapper,expression:/** @type {string} */ (values[result]),instructions});
        } else invalid=true;
        break;
      }
      if(pc+3>tape.bytes.length){invalid=true;break;}
      const destination=tape.bytes[pc++]^dispatch.key;
      const left=tape.bytes[pc++]^dispatch.key;
      const right=tape.bytes[pc++]^dispatch.key;
      const operator=operators.get(opcode);
      if(!operator||destination>=values.length||
         typeof values[left]!=='string'||typeof values[right]!=='string') {
        invalid=true;
        break;
      }
      values[destination]='('+values[left]+operator+values[right]+')';
      instructions++;
    }
    if(invalid)continue;
  }
  if(recovered.length!==1)throw new TypeError('Expected exactly one supported published expression VM');
  return recovered[0];
}

module.exports={recoverBundledExpressionVm};
