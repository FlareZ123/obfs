"""Offline independent bounded-Mealy SMT oracle check. Linux libz3 required.

Reproduce with: python workplace/sco-step-only-smt-ctypes-check.py
No network, original source access, or live server is used by the checker.
"""
import ctypes
from pathlib import Path
from time import perf_counter
lib=ctypes.CDLL('libz3.so.4')
lib.Z3_mk_config.restype=ctypes.c_void_p
lib.Z3_mk_context.argtypes=[ctypes.c_void_p]
lib.Z3_mk_context.restype=ctypes.c_void_p
lib.Z3_eval_smtlib2_string.argtypes=[ctypes.c_void_p,ctypes.c_char_p]
lib.Z3_eval_smtlib2_string.restype=ctypes.c_char_p
lib.Z3_del_context.argtypes=[ctypes.c_void_p]
lib.Z3_del_config.argtypes=[ctypes.c_void_p]

def z3(script):
    conf=lib.Z3_mk_config()
    ctx=lib.Z3_mk_context(conf)
    try:
        before=perf_counter()
        response=lib.Z3_eval_smtlib2_string(ctx,script.encode())
        return (response.decode() if response else '',perf_counter()-before)
    finally:
        lib.Z3_del_context(ctx)
        lib.Z3_del_config(conf)


import json, random, re, subprocess


def models(n):
    for size in range(1,n+1):
        options = 2*size
        for idx in range(options**(2*size)):
            k=idx
            transition=[]; output=[]
            for _ in range(2*size):
                v=k%options
                k//=options
                transition.append(v//2); output.append(v%2)
            yield transition,output,size


def advance(m,inputs):
    delta,output,n=m
    q=0
    observed=[]
    for bit in inputs:
        observed.append(output[2*q+bit]); q=delta[2*q+bit]
    return observed,q


def distinguishes(m,ma,q,qa):
    a,o,an=m
    b,p,bn=ma
    seen={(q,qa)}; frontier=[(q,qa)]
    for qa,qb in frontier:
        for x in (0,1):
            if o[2*qa+x]!=p[2*qb+x]:return True
            pair=(a[2*qa+x],b[2*qb+x])
            if pair not in seen:seen.add(pair);frontier.append(pair)
    return False


def expected(n,inputs,outputs):
    ref=None; count=0; inequivalent=False
    for m in models(n):
        obs,q=advance(m,inputs)
        if obs!=outputs:continue
        count+=1
        if ref is None:ref=m,q;continue
        if distinguishes(ref[0],m,ref[1],q):inequivalent=True;break
    return count>0,inequivalent


def get_query(n,inputs,outputs,kind):
    payload=json.dumps({'maxStates':n,'inputs':inputs,'outputs':outputs})
    src=("const g=require('./sims/sco-step-only-smt'); "
         "const r=g.buildStepOnlySmtQuery(JSON.parse(process.argv[1]),process.argv[2]); "
         "process.stdout.write(JSON.stringify(r));")
    out=subprocess.check_output(['node','-e',src,payload,kind],cwd=str(REPO_ROOT))
    return json.loads(out)


def first_reference(n,inputs,outputs):
    for m in models(n):
        observed,current=advance(m,inputs)
        if observed==outputs:
            delta,bits,size=m
            return {'next':[[delta[2*s+x] for x in (0,1)] for s in range(size)],
                    'output':[[bits[2*s+x] for x in (0,1)] for s in range(size)],
                    'state':current}
    return None


def get_fixed_query(n,inputs,outputs,reference,horizon=None):
    payload=json.dumps({'maxStates':n,'inputs':inputs,'outputs':outputs})
    src=("const g=require('./sims/sco-step-only-smt'); "
         "const r=g.buildFixedReferenceStepOnlySmtQuery(JSON.parse(process.argv[1]),JSON.parse(process.argv[2]),process.argv[3]===undefined?undefined:Number(process.argv[3])); "
         "process.stdout.write(JSON.stringify(r));")
    args=['node','-e',src,payload,json.dumps(reference)]
    if horizon is not None:args.append(str(horizon))
    out=subprocess.check_output(args,cwd=str(REPO_ROOT))
    return json.loads(out)


def mismatch_within(a,b,qa,qb,limit):
    # Independent product BFS, with the first output disagreement at depth < limit.
    seen={(qa,qb)}
    frontier=[(qa,qb,0)]
    for state_a,state_b,depth in frontier:
        if depth>=limit:continue
        for x in (0,1):
            if a[1][2*state_a+x]!=b[1][2*state_b+x]:return True
            pair=(a[0][2*state_a+x],b[0][2*state_b+x])
            if pair not in seen:seen.add(pair);frontier.append((pair[0],pair[1],depth+1))
    return False


def expected_within(n,inputs,outputs,reference,limit):
    a=(sum(reference['next'],[]),sum(reference['output'],[]),len(reference['next']))
    for m in models(n):
        observed,state=advance(m,inputs)
        if observed==outputs and mismatch_within(a,m,reference['state'],state,limit):return True
    return False


def validate_fixed_witness(query,answer,inputs,outputs,n,reference):
    parsed=dict((name,int(val) if val not in ('true','false') else (val=='true'))
                for name,val in re.findall(r'\((B_[do]_[0-9]+_[01]|B_q_[0-9]+|future_[0-9]+) (true|false|[0-9]+)\)',answer))
    assert len(parsed)==len(query['modelNames']),(len(parsed),len(query['modelNames']))
    bnext=[[int(parsed[f'B_d_{s}_{x}']) for x in (0,1)] for s in range(n)]
    bout=[[int(parsed[f'B_o_{s}_{x}']) for x in (0,1)] for s in range(n)]
    q=0
    for x,y in zip(inputs,outputs):
        assert bout[q][x]==y
        q=bnext[q][x]
    assert q==parsed[f'B_q_{len(inputs)}']
    qa,qb=reference['state'],q
    divergent=False
    for i in range(query['horizon']):
        x=int(parsed[f'future_{i}'])
        if reference['output'][qa][x]!=bout[qb][x]:divergent=True
        qa=reference['next'][qa][x]
        qb=bnext[qb][x]
    assert divergent, 'fixed-reference SAT model did not predict a real future mismatch'


def validate_witness(query,answer,inputs,outputs,n):
    # Z3's get-value returns ground values for all named Bool/Int declarations.
    parsed=dict((name,int(val) if val not in ('true','false') else (val=='true'))
                for name,val in re.findall(r'\(([AB]_[do]_[0-9]+_[01]|[AB]_q_[0-9]+|future_[0-9]+) (true|false|[0-9]+)\)',answer))
    assert len(parsed)==len(query['modelNames']), (len(parsed),len(query['modelNames']),answer[:200])
    machines=[]
    for prefix in ('A','B'):
        delta=[[int(parsed[f'{prefix}_d_{s}_{x}']) for x in (0,1)] for s in range(n)]
        out=[[int(parsed[f'{prefix}_o_{s}_{x}']) for x in (0,1)] for s in range(n)]
        q=0
        for x,y in zip(inputs,outputs):
            assert out[q][x]==y
            q=delta[q][x]
        assert q==parsed[f'{prefix}_q_{len(inputs)}']
        machines.append((delta,out,q))
    qa,qb=machines[0][2],machines[1][2]
    difference=False
    for i in range(query['horizon']):
        x=int(parsed[f'future_{i}'])
        if machines[0][1][qa][x]!=machines[1][1][qb][x]:difference=True
        qa=machines[0][0][qa][x]
        qb=machines[1][0][qb][x]
    assert difference, 'SAT model did not give a real future distinguishing suffix'


REPO_ROOT = Path(__file__).resolve().parents[1]

def main():
    rng=random.Random(0x14525A7)
    cases=[]
    cases += [(1,[],[]),(1,[0,1],[0,1]),(1,[0,0],[0,1]),(1,[0,1,0,1],[1,0,1,0])]
    for n in (2,3):
        all_models=list(models(n))
        for length in ([0,1,3,8,20] if n==2 else [0,1,5,11,24]):
            for i in range(3):
                m=all_models[rng.randrange(len(all_models))]
                inputs=[rng.randrange(2) for _ in range(length)]
                outputs,_=advance(m,inputs)
                cases.append((n,inputs,outputs))
    totals={'pair_sat':0,'pair_unsat':0,'single_sat':0,'single_unsat':0}
    fixed_totals={'fixed_sat':0,'fixed_unsat':0}
    shallow_totals={'sat':0,'unsat':0}
    for index,(n,inputs,outputs) in enumerate(cases):
        consistent,inequivalent=expected(n,inputs,outputs)
        for kind in ('single','pair'):
            query=get_query(n,inputs,outputs,kind)
            result,elapsed=z3(query['smt2'])
            result=result.strip()
            want=('sat' if consistent else 'unsat') if kind=='single' else ('sat' if inequivalent else 'unsat')
            assert result==want,(index,n,kind,want,result)
            totals[kind+'_'+result]+=1
            if kind=='pair' and result=='sat':
                extracted,t=z3(query['smt2']+query['valuesCommand'])
                assert extracted.startswith('sat\n'),(index,extracted[:200])
                validate_witness(query,extracted,inputs,outputs,n)
        if consistent:
            reference=first_reference(n,inputs,outputs)
            assert reference is not None
            fixed=get_fixed_query(n,inputs,outputs,reference)
            result,_=z3(fixed['smt2'])
            result=result.strip()
            want='sat' if inequivalent else 'unsat'
            assert result==want,(index,n,'fixed',want,result)
            fixed_totals['fixed_'+result]+=1
            if result=='sat':
                answer,_=z3(fixed['smt2']+fixed['valuesCommand'])
                assert answer.startswith('sat\n'),(index,answer[:200])
                validate_fixed_witness(fixed,answer,inputs,outputs,n,reference)
            if fixed['fullHorizon']>1:
                horizon=min(2,fixed['fullHorizon']-1)
                shallow=get_fixed_query(n,inputs,outputs,reference,horizon)
                assert shallow['complete'] is False
                actual,_=z3(shallow['smt2'])
                actual=actual.strip()
                want='sat' if expected_within(n,inputs,outputs,reference,horizon) else 'unsat'
                assert actual==want,(index,n,'shallow',horizon,want,actual)
                shallow_totals[actual]+=1
                if actual=='sat':
                    answer,_=z3(shallow['smt2']+shallow['valuesCommand'])
                    assert answer.startswith('sat\n'),(index,answer[:200])
                    validate_fixed_witness(shallow,answer,inputs,outputs,n,reference)
    print(f'PASS {len(cases)} transcript cases x 2 queries; {totals}; all SAT pair witnesses independently simulated')
    print(f'PASS {sum(fixed_totals.values())} consistent transcript cases x fixed-reference query; {fixed_totals}; all SAT fixed witnesses independently simulated')
    print(f'PASS {sum(shallow_totals.values())} shallow fixed-reference queries; {shallow_totals}; independent bounded-depth BFS and SAT witnesses checked')

if __name__=='__main__': main()
