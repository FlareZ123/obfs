'use strict';

const fs=require('node:fs/promises');
const path=require('node:path');
const {createHash}=require('node:crypto');
const acorn=require('acorn');
const {atomicWrite}=require('../src/atomic');

/** @typedef {import('acorn').Node & Record<string,any>} AstNode */
/** @typedef {{start:number,end:number,text:string}} Edit */
/** @typedef {'script'|'commonjs'|'module'} SourceType */

/**
 * Walk a public Acorn AST without using the obfuscator's AST/proof library.
 * @param {AstNode} root
 * @param {(node:AstNode,parent:AstNode|null,key:string,ancestors:AstNode[])=>void} visit
 */
function walk(root,visit) {
  /** @param {AstNode} node @param {AstNode|null} parent @param {string} key @param {AstNode[]} ancestors */
  function descend(node,parent,key,ancestors) {
    visit(node,parent,key,ancestors);
    const parents=ancestors.concat(node);
    for(const [field,value] of Object.entries(node)) {
      if(field==='start'||field==='end'||field==='loc'||field==='range')continue;
      if(value&&typeof value==='object') {
        const children=Array.isArray(value)?value:[value];
        for(const child of children) {
          if(child&&typeof child==='object'&&typeof child.type==='string') {
            descend(/** @type {AstNode} */(child),node,field,parents);
          }
        }
      }
    }
  }
  descend(root,null,'',[]);
}

/**
 * Source-only attacker: decode the literal table of a recognized public XOR
 * loop. The distributed source is parsed but never run, imported or evaluated.
 * No original source, compiler seed or compiler source is an input.
 *
 * @param {string} source
 * @param {SourceType} sourceType
 * @returns {{code:string,tables:number,literals:number,unrecognized:number}}
 */
function recoverPublicStrings(source,sourceType='script') {
  const ast=/** @type {AstNode} */(/** @type {unknown} */(acorn.parse(source,{
    ecmaVersion:'latest',sourceType:sourceType==='module'?'module':'script',allowHashBang:true,
    allowReturnOutsideFunction:sourceType==='commonjs'
  })));
  /** @type {Edit[]} */
  const edits=[];
  let tables=0;
  let literals=0;
  let unrecognized=0;
  /** @type {AstNode[]} */
  const statements=ast.body;
  for(let index=0;index+1<statements.length;index++) {
    const decl=statements[index];
    const decoder=statements[index+1];
    if(decl.type!=='VariableDeclaration'||decl.kind!=='const'||
       decl.declarations.length!==1||decoder.type!=='ForStatement')continue;
    const binding=decl.declarations[0];
    const name=binding.id?.name;
    if(typeof name!=='string'||!/^_o[a-f0-9]{12}$/.test(name)||
       binding.init?.type!=='ArrayExpression')continue;
    /** @type {AstNode[]} */
    const elements=binding.init.elements;
    if(!elements.length||elements.some(entry=>
      entry?.type!=='Literal'||typeof entry.value!=='string'))continue;
    /** @type {Set<number>} */
    const candidates=new Set();
    let hasNativeDecoder=false;
    let hasTableWrite=false;
    walk(decoder,node=>{
      if(node.type==='CallExpression'&&node.callee?.type==='MemberExpression'&&
         node.callee.object?.name==='String'&&node.callee.property?.name==='fromCharCode') {
        hasNativeDecoder=true;
      }
      if(node.type==='AssignmentExpression'&&node.left?.type==='MemberExpression'&&
         node.left.object?.name===name)hasTableWrite=true;
      if(node.type==='BinaryExpression'&&node.operator==='^'&&
         node.left?.type==='CallExpression'&&
         node.left.callee?.type==='MemberExpression'&&
         node.left.callee.property?.name==='charCodeAt'&&
         node.right?.type==='Literal'&&Number.isInteger(node.right.value)&&
         node.right.value>=0&&node.right.value<=65535) {
        candidates.add(node.right.value);
      }
    });
    if(!hasNativeDecoder||!hasTableWrite||candidates.size!==1) {
      unrecognized++;
      continue;
    }
    const key=[...candidates][0];
    const decoded=elements.map(entry=>{
      /** @type {string} */
      const encoded=entry.value;
      let original='';
      for(let offset=0;offset<encoded.length;offset++) {
        original+=String.fromCharCode(encoded.charCodeAt(offset)^key);
      }
      return original;
    });
    /** @type {Edit[]} */
    const references=[];
    let hasUnsupportedReference=false;
    walk(ast,(node,parent,parentKey,ancestors)=>{
      if(node.type!=='Identifier'||node.name!==name||
         ancestors.includes(decl)||ancestors.includes(decoder))return;
      if(parent?.type!=='MemberExpression'||parentKey!=='object'||
         !parent.computed||parent.property?.type!=='Literal'||
         !Number.isInteger(parent.property.value)||parent.property.value<0||
         parent.property.value>=decoded.length) {
        hasUnsupportedReference=true;
        return;
      }
      references.push({start:parent.start,end:parent.end,
        text:JSON.stringify(decoded[parent.property.value])});
    });
    if(hasUnsupportedReference) {
      unrecognized++;
      continue;
    }
    edits.push(...references);
    tables++;
    literals+=references.length;
    index++;
  }
  let code=source;
  for(const edit of edits.sort((a,b)=>b.start-a.start)) {
    code=code.slice(0,edit.start)+edit.text+code.slice(edit.end);
  }
  return {code,tables,literals,unrecognized};
}

/**
 * Auditable external-corpus static attack. It verifies every delivered source
 * SHA before parsing, and preserves all test cases for separate Docker checks.
 * @param {string} inputFile
 * @param {string|null} outputFile
 * @param {boolean} requireProgress
 * @returns {Promise<{programs:number,recoveredLiterals:number,
 *   tables:number,unrecognizedTables:number,sourceOnly:boolean}>}
 */
async function attackCorpus(inputFile,outputFile=null,requireProgress=false) {
  if(outputFile!==null&&path.resolve(inputFile)===path.resolve(outputFile)) {
    throw new TypeError('Attack output must differ from input');
  }
  const lines=(await fs.readFile(inputFile,'utf8')).split(/\r?\n/u).filter(Boolean);
  if(!lines.length)throw new TypeError('Empty benchmark dataset');
  const report={programs:0,recoveredLiterals:0,
    tables:0,unrecognizedTables:0,sourceOnly:true};
  /** @type {string[]} */
  const output=[];
  for(const line of lines) {
    const row=JSON.parse(line);
    const publishedKeys=['filename','obfuscated','obfs_source_type','obfs_output_sha256'];
    if(!row||typeof row!=='object'||Array.isArray(row)||
       Object.keys(row).length!==publishedKeys.length||
       publishedKeys.some(key=>!Object.hasOwn(row,key))||
       typeof row.filename!=='string'||!row.filename||
       typeof row.obfuscated!=='string'||typeof row.obfs_output_sha256!=='string'||
       row.original!==undefined||row.test_cases!==undefined||row.obfs_metrics!==undefined||
       !['script','commonjs'].includes(row.obfs_source_type)) {
      throw new TypeError('Public attack input must contain only delivered source and identity');
    }
    const hash=createHash('sha256').update(row.obfuscated).digest('hex');
    if(hash!==row.obfs_output_sha256)throw new Error('Distributed source hash mismatch');
    const attempt=recoverPublicStrings(row.obfuscated,row.obfs_source_type);
    report.programs++;
    report.recoveredLiterals+=attempt.literals;
    report.tables+=attempt.tables;
    report.unrecognizedTables+=attempt.unrecognized;
    if(outputFile!==null)output.push(JSON.stringify({
      ...row,obfuscated:attempt.code,
      attack_input_sha256:row.obfs_output_sha256,
      obfs_output_sha256:createHash('sha256').update(attempt.code).digest('hex'),
      attack_kind:'public-static-xor-table',attack_recovered_literals:attempt.literals,
      attack_recovered_tables:attempt.tables
    }));
  }
  if(requireProgress && (report.recoveredLiterals===0||report.unrecognizedTables!==0)) {
    throw new Error('No proven full public-table recovery: '+JSON.stringify(report));
  }
  if(outputFile!==null)await atomicWrite(outputFile,output.join('\n')+'\n');
  return report;
}

/** @param {string[]} args @returns {{input:string,output:string|null,requireProgress:boolean}} */
function parseArgs(args) {
  /** @type {Record<string,string>} */
  const values={};
  for(let i=0;i<args.length;i++) {
    if(args[i]==='--require-progress') {
      if(Object.hasOwn(values,args[i]))throw new TypeError('Duplicate argument');
      values[args[i]]='true';
    }else{
      const key=args[i];
      if(!['--input','--output'].includes(key)||!args[i+1]||Object.hasOwn(values,key)) {
        throw new TypeError('Required: --input JSONL [--output JSONL] [--require-progress]');
      }
      values[key]=args[++i];
    }
  }
  if(!values['--input'])throw new TypeError('Required --input JSONL');
  return {input:values['--input'],output:values['--output']??null,
    requireProgress:values['--require-progress']==='true'};
}

if(require.main===module) {
  const config=parseArgs(process.argv.slice(2));
  attackCorpus(config.input,config.output,config.requireProgress).then(result=>{
    process.stdout.write('PUBLIC_STATIC_ATTACK '+JSON.stringify(result)+'\n');
  }).catch(error=>{
    process.stderr.write(String(error?.stack??error)+'\n');
    process.exitCode=1;
  });
}

module.exports={recoverPublicStrings,attackCorpus,parseArgs};
