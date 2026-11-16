'use strict';

/**
 * Independent bytecode-only attacker for the public experimental Wasm i32
 * distribution. Uses no compiler imports, original source or seed.
 * This handles the deliberately restricted one-export module layout.
 */

/** @typedef {{type:'parameter',index:number}|{type:'literal',value:number}|{type:'unary',argument:Expr}|{type:'binary',operator:string,left:Expr,right:Expr}|{type:'conditional',test:Expr,consequent:Expr,alternate:Expr}} Expr */

/** @param {string} source @returns {Uint8Array} */
function extractPublicWasm(source) {
  const found=/Uint8Array\.from\s*\(\s*(\[[0-9,\s]+\])\s*\)/u.exec(source);
  if(!found)throw new TypeError('No public embedded WebAssembly module');
  const values=JSON.parse(found[1]);
  if(!Array.isArray(values)||values.some(value=>!Number.isInteger(value)||value<0||value>255)) {
    throw new TypeError('Malformed public byte array');
  }
  const bytes=Uint8Array.from(values);
  if(!WebAssembly.validate(bytes))throw new TypeError('Invalid public WebAssembly module');
  return bytes;
}

/**
 * Strict binary cursor for the supported unsigned and signed LEB128 syntax.
 * @param {Uint8Array} bytes
 */
function cursor(bytes) {
  let position=0;
  const api={
    /** @returns {number} */
    take() {
      if(position>=bytes.length)throw new TypeError('Truncated Wasm binary');
      return bytes[position++];
    },
    /** @returns {number} */
    unsigned() {
      let result=0,scale=1;
      for(let index=0;index<5;index++) {
        const value=api.take();
        result+=(value&127)*scale;
        if(!(value&128))return result;
        scale*=128;
      }
      throw new TypeError('Unsupported ULEB size');
    },
    /** @returns {number} */
    signed() {
      let result=0,shift=0,value=0;
      for(let index=0;index<5;index++) {
        value=api.take();
        result|=(value&127)<<shift;
        shift+=7;
        if(!(value&128)) {
          if(shift<32&&(value&64))result|=(-1<<shift);
          return result|0;
        }
      }
      throw new TypeError('Unsupported SLEB size');
    },
    /** @param {number} offset @returns {void} */
    seek(offset){if(!Number.isInteger(offset)||offset<0||offset>bytes.length)throw new TypeError('Invalid seek');position=offset;},
    /** @returns {number} */
    get position(){return position;},
    /** @returns {number} */
    get length(){return bytes.length;}
  };
  return api;
}

/** @param {Expr} a @param {Expr} b @returns {boolean} */
function same(a,b) {
  if(a.type!==b.type)return false;
  if(a.type==='parameter')return a.index===/** @type {typeof a} */(b).index;
  if(a.type==='literal')return a.value===/** @type {typeof a} */(b).value;
  if(a.type==='unary')return same(a.argument,/** @type {typeof a} */(b).argument);
  if(a.type==='conditional') {
    const other=/** @type {typeof a} */ (b);
    return same(a.test,other.test) &&
      same(a.consequent,other.consequent) &&
      same(a.alternate,other.alternate);
  }
  const rhs=/** @type {typeof a} */(b);
  return a.operator===rhs.operator&&same(a.left,rhs.left)&&same(a.right,rhs.right);
}

/** @param {Expr} node @returns {Expr} */
function normalize(node) {
  if(node.type==='parameter'||node.type==='literal')return node;
  if(node.type==='unary')return {type:'unary',argument:normalize(node.argument)};
  if(node.type==='conditional')return {type:'conditional',
    test:normalize(node.test),consequent:normalize(node.consequent),
    alternate:normalize(node.alternate)};
  const left=normalize(node.left),right=normalize(node.right),operator=node.operator;
  if(operator==='^'&&left.type==='literal'&&right.type==='literal') {
    return {type:'literal',value:left.value^right.value};
  }
  if(operator==='^'&&left.type==='literal'&&left.value===-1)return {type:'unary',argument:right};
  if(operator==='^'&&right.type==='literal'&&right.value===-1)return {type:'unary',argument:left};
  if(operator==='^'&&left.type==='binary'&&right.type==='binary') {
    // Pairwise Boolean identities for the two repeated, pure operands.
    if(same(left.left,right.left)&&same(left.right,right.right)) {
      if((left.operator==='|'&&right.operator==='^')||
         (left.operator==='^'&&right.operator==='|')) {
        return {type:'binary',operator:'&',left:left.left,right:left.right};
      }
      if((left.operator==='&'&&right.operator==='^')||
         (left.operator==='^'&&right.operator==='&')) {
        return {type:'binary',operator:'|',left:left.left,right:left.right};
      }
      if((left.operator==='|'&&right.operator==='&')||
         (left.operator==='&'&&right.operator==='|')) {
        return {type:'binary',operator:'^',left:left.left,right:left.right};
      }
    }
  }
  return {type:'binary',operator,left,right};
}

/** @param {Uint8Array} bytes @returns {Expr} */
function symbolicDecode(bytes) {
  const reader=cursor(bytes);
  const magic=[0,97,115,109,1,0,0,0];
  for(const expected of magic)if(reader.take()!==expected)throw new TypeError('Unexpected Wasm header');
  /** @type {Expr|null} */
  let expression=null;
  while(reader.position<reader.length) {
    const section=reader.take(),length=reader.unsigned(),end=reader.position+length;
    if(end>reader.length)throw new TypeError('Invalid section extent');
    if(section===10) {
      if(reader.unsigned()!==1)throw new TypeError('Expected one Wasm function');
      const length=reader.unsigned(),bodyEnd=reader.position+length;
      if(reader.unsigned()!==0)throw new TypeError('Expected zero local variables');
      /** @type {Expr[]} */
      const stack=[];
      while(reader.position<bodyEnd) {
        const opcode=reader.take();
        if(opcode===0x0b)break;
        if(opcode===0x20) {
          const index=reader.unsigned();
          if(index>3)throw new TypeError('Unsupported parameter index');
          stack.push({type:'parameter',index});
        } else if(opcode===0x41)stack.push({type:'literal',value:reader.signed()});
        else if(opcode===0x1b) {
          const test=stack.pop(),alternate=stack.pop(),consequent=stack.pop();
          if(!test||!alternate||!consequent)throw new TypeError('Invalid select operands');
          stack.push({type:'conditional',test,consequent,alternate});
        } else if(opcode>=0x71&&opcode<=0x76) {
          const right=stack.pop(),left=stack.pop();
          if(!left||!right)throw new TypeError('Invalid stack expression');
          const operator=['&','|','^','<<','>>','>>>'][opcode-0x71];
          stack.push({type:'binary',operator,left,right});
        } else throw new TypeError('Unsupported Wasm opcode '+opcode);
      }
      if(reader.position!==bodyEnd||stack.length!==1)throw new TypeError('Invalid function body');
      expression=normalize(stack[0]);
    }
    reader.seek(end);
  }
  if(!expression)throw new TypeError('Missing code section');
  return expression;
}

/** @param {Expr} expr @param {string[]} parameters @returns {string} */
function printExpression(expr,parameters) {
  if(expr.type==='parameter') {
    const name=parameters[expr.index];
    if(name===undefined)throw new TypeError('Missing parameter spelling for local index '+expr.index);
    return name;
  }
  if(expr.type==='literal')return String(expr.value);
  if(expr.type==='unary')return '(~'+printExpression(expr.argument,parameters)+')';
  if(expr.type==='conditional')return '('+
    printExpression(expr.test,parameters)+'?'+
    printExpression(expr.consequent,parameters)+':'+
    printExpression(expr.alternate,parameters)+')';
  return '('+printExpression(expr.left,parameters)+expr.operator+
    printExpression(expr.right,parameters)+')';
}

/**
 * Extract a standalone equivalent native JavaScript bitwise expression solely
 * from the delivered binary. No compiler module or seed required.
 * @param {string} publicJavaScript
 * @param {string|string[]} [parameter]
 * @returns {{expression:string,bytes:number}}
 */
function recoverPublicWasmExpression(publicJavaScript,parameter='x') {
  const bytes=extractPublicWasm(publicJavaScript);
  const expression=symbolicDecode(bytes);
  return {expression:printExpression(expression,Array.isArray(parameter)?parameter:[parameter]),bytes:bytes.length};
}

module.exports={recoverPublicWasmExpression,extractPublicWasm};
