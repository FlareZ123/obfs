'use strict';

/**
 * Small, independent monotone may-capability flow engine for research.
 *
 * A frontend must supply the typed edges and validate its host/builtin
 * summaries. This module neither parses JavaScript nor proves that an
 * arbitrary cross-module property rename is safe. The unit of provenance is
 * one abstract capability fact at one explicit graph node.
 *
 * The fixed-point solver forwards each (node,fact) pair at most once per run.
 * Cycles and repeated aliases therefore terminate under the finite input
 * node/fact universe. Edges model possibility, not chronological order.
 *
 * @module sims/callback-capability-worklist
 */

/** @typedef {'host-callable'|'returned-holder'|'opaque-host'|'owner-reflection'|'dynamic-import'} CapabilityFact */
/** @typedef {'assignment'|'heap-field-read'|'heap-field-write'|'esm-import'|'return'|'callback-schedule'|'promise-fulfillment'|'opaque-call'|'other'} TransferKind */
/** @typedef {{from:string,to:string,kind:TransferKind}} FlowEdge */
/** @typedef {{at:string,fact:CapabilityFact,via:FlowEdge|null}} WitnessStep */
/** @typedef {{node:string,fact:CapabilityFact}} PendingFact */

/** @type {ReadonlySet<CapabilityFact>} */
const FACTS=new Set([
  'host-callable','returned-holder','opaque-host','owner-reflection','dynamic-import'
]);

/**
 * A finite event graph, not a JavaScript interpreter or a points-to analysis.
 * The caller should use stable lexical/heap/module IDs for node names and add
 * edges only for conservative source- or host-contract-proven transfer rules.
 * A missing edge can make its answer unsound for code transformation.
 * Queries fail closed until solve() has completed and after any graph mutation.
 * An interrupted, capped solve must not expose partial negative reachability.
 */
class CapabilityFlowGraph {
  constructor(){
    /** @type {Map<string,FlowEdge[]>} */
    this.edges=new Map();
    /** @type {Map<string,Set<CapabilityFact>>} */
    this.initial=new Map();
    /** @type {Map<string,Set<CapabilityFact>>} */
    this.reached=new Map();
    /** @type {Map<string,Map<CapabilityFact,FlowEdge|null>>} */
    this.predecessors=new Map();
    /** True only after a complete successful solve of the current graph. */
    this.solutionValid=false;
    /** @type {{nodes:number,edges:number,propagations:number,facts:number}} */
    this.stats={nodes:0,edges:0,propagations:0,facts:0};
  }

  /**
   * @param {string} id
   * @returns {void}
   */
  addNode(id){
    if(typeof id!=='string'||id.length===0)throw new TypeError('Nonempty node ID required');
    if(!this.edges.has(id)){
      this.edges.set(id,[]);
      this.solutionValid=false;
    }
  }

  /**
   * @param {string} from
   * @param {string} to
   * @param {TransferKind} kind
   * @returns {void}
   */
  addEdge(from,to,kind){
    if(!['assignment','heap-field-read','heap-field-write','esm-import',
      'return','callback-schedule','promise-fulfillment','opaque-call','other'].includes(kind))
      throw new TypeError('Unknown transfer kind: '+kind);
    this.addNode(from);
    this.addNode(to);
    /** @type {FlowEdge} */
    const edge={from,to,kind};
    this.edges.get(from)?.push(edge);
    this.solutionValid=false;
  }

  /**
   * @param {string} at
   * @param {CapabilityFact} fact
   * @returns {void}
   */
  seed(at,fact){
    if(!FACTS.has(fact))throw new TypeError('Unknown capability fact: '+fact);
    this.addNode(at);
    const set=this.initial.get(at)??new Set();
    set.add(fact);
    this.initial.set(at,set);
    this.solutionValid=false;
  }

  /**
   * Recompute the monotone fixed point from persistent seed facts and edges.
   * A finite cap is an explicit error rather than an unsafe false-negative.
   *
   * @param {{maxSteps?:number}} [options]
   * @returns {{nodes:number,edges:number,propagations:number,facts:number}}
   */
  solve(options={}){
    const maxSteps=options.maxSteps??1000000;
    if(!Number.isSafeInteger(maxSteps)||maxSteps<1)
      throw new RangeError('maxSteps must be a positive safe integer');

    // Failed bounded solves must never expose a partial fixed point as a
    // valid negative result. A fresh successful solve is required.
    this.solutionValid=false;
    this.reached=new Map();
    this.predecessors=new Map();
    /** @type {PendingFact[]} */
    const queue=[];
    for(const [at,facts] of this.initial)for(const fact of facts) {
      queue.push({node:at,fact});
      this.reached.set(at,new Set([...(this.reached.get(at)??[]),fact]));
      const pred=this.predecessors.get(at)??new Map();
      pred.set(fact,null);
      this.predecessors.set(at,pred);
    }
    let propagations=0;
    for(let head=0;head<queue.length;head++){
      const event=queue[head];
      for(const edge of this.edges.get(event.node)??[]) {
        propagations++;
        if(propagations>maxSteps)
          throw new RangeError('May-flow step limit exceeded; increase or conservatively refuse rewrite');
        const found=this.reached.get(edge.to)??new Set();
        if(found.has(event.fact))continue;
        found.add(event.fact);
        this.reached.set(edge.to,found);
        const pred=this.predecessors.get(edge.to)??new Map();
        pred.set(event.fact,edge);
        this.predecessors.set(edge.to,pred);
        queue.push({node:edge.to,fact:event.fact});
      }
    }
    this.stats={
      nodes:this.edges.size,
      edges:[...this.edges.values()].reduce((sum,row)=>sum+row.length,0),
      propagations,
      facts:queue.length
    };
    this.solutionValid=true;
    return {...this.stats};
  }

  /**
   * @param {string} at
   * @param {CapabilityFact} fact
   * @returns {boolean}
   */
  has(at,fact){
    if(!this.solutionValid)
      throw new Error('Capability graph changed or solve() did not complete');
    return this.reached.get(at)?.has(fact)??false;
  }

  /**
   * Recover one finite root-to-observation transfer path. This is a *witness*
   * of modeled reachability, not a JS runtime trace or a soundness proof.
   *
   * @param {string} at
   * @param {CapabilityFact} fact
   * @returns {WitnessStep[]|null}
   */
  explain(at,fact){
    if(!this.has(at,fact))return null;
    /** @type {WitnessStep[]} */
    const steps=[];
    let current=at;
    const seen=new Set();
    while(true){
      if(seen.has(current))throw new Error('Invalid fixed-point predecessor cycle');
      seen.add(current);
      const edge=this.predecessors.get(current)?.get(fact)??null;
      steps.push({at:current,fact,via:edge});
      if(edge===null)break;
      current=edge.from;
    }
    return steps.reverse();
  }
}

module.exports={CapabilityFlowGraph,FACTS};
