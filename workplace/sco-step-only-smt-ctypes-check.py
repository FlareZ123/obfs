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
    print(f'PASS {len(cases)} transcript cases x 2 queries; {totals}; all SAT pair witnesses independently simulated')

if __name__=='__main__': main()
