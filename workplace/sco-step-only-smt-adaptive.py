"""Experimental no-reset finite-state oracle learner based only on public step responses.

Requires Node 22 and Linux libz3.so.4. Preserves no-reset state alignment,
keeps reference hypotheses only while transcript-consistent, and requests a
predicted distinguishing suffix through its first predicted output mismatch.
"""
import importlib.util
import json
from pathlib import Path
import random
import os
import signal
import re
import subprocess
import sys
from time import perf_counter

HERE=Path(__file__).resolve()
REPO_ROOT=HERE.parents[1]
spec=importlib.util.spec_from_file_location('smt_check',HERE.with_name('sco-step-only-smt-ctypes-check.py'))
checker=importlib.util.module_from_spec(spec)
spec.loader.exec_module(checker)


def query(kind,n,inputs,outputs,reference=None,horizon=None):
    payload=json.dumps({'maxStates':n,'inputs':inputs,'outputs':outputs})
    if kind=='fixed':
        fn='buildFixedReferenceStepOnlySmtQuery'
        statement=f'const q=m.{fn}(JSON.parse(process.argv[1]),JSON.parse(process.argv[2]),process.argv[3]===undefined?undefined:Number(process.argv[3]));'
        args=[payload,json.dumps(reference)]
        if horizon is not None:args.append(str(horizon))
    else:
        statement='const q=m.buildStepOnlySmtQuery(JSON.parse(process.argv[1]),"single");'
        args=[payload]
    source='const m=require("./sims/sco-step-only-smt");'+statement+'process.stdout.write(JSON.stringify(q));'
    r=subprocess.check_output(['node','-e',source,*args],cwd=REPO_ROOT)
    return json.loads(r)


def solve(q,timeout_ms=3000):
    content=q['smt2'].replace('(set-option :produce-models true)',
                               f'(set-option :produce-models true)\n(set-option :timeout {timeout_ms})')
    answer,elapsed=checker.z3(content)
    status=answer.splitlines()[0] if answer else 'unknown'
    assert status in ('sat','unsat','unknown'),answer[:400]
    if status=='sat':
        model_answer,extra=checker.z3(content+q['valuesCommand'])
        elapsed+=extra
        model_status=model_answer.splitlines()[0] if model_answer else 'unknown'
        if model_status=='unknown':
            # A second, independently timed model-retrieval solve may time out
            # even if the preceding decision was SAT. This is inconclusive.
            return 'unknown',model_answer,elapsed
        if model_status!='sat':
            raise RuntimeError('inconsistent SMT model retrieval: '+model_answer[:400])
        answer=model_answer
    return status,answer,elapsed


def parse_values(answer):
    return {name:(val=='true' if val in ('true','false') else int(val))
            for name,val in re.findall(r'\(([AB]_[do]_[0-9]+_[01]|[AB]_q_[0-9]+|future_[0-9]+) (true|false|[0-9]+)\)',answer)}


def model_from_values(prefix,values,n,inputs,outputs):
    next_=[[int(values[f'{prefix}_d_{s}_{x}']) for x in (0,1)] for s in range(n)]
    out=[[int(values[f'{prefix}_o_{s}_{x}']) for x in (0,1)] for s in range(n)]
    state=0
    for x,y in zip(inputs,outputs):
        assert out[state][x]==y
        state=next_[state][x]
    assert state==values[f'{prefix}_q_{len(inputs)}']
    return {'next':next_,'output':out,'state':state}


def minimize_reference(machine):
    """Quotient future-equivalent states, then keep only classes reachable from zero.

    BFS numbering preserves the external initial-state-zero transcript contract.
    The returned current state represents the old current state's continuation.
    """
    transitions=machine['next']
    outputs=machine['output']
    n=len(transitions)
    signatures=[tuple(outputs[state]) for state in range(n)]
    classes={signature:i for i,signature in enumerate(sorted(set(signatures)))}
    colors=[classes[signature] for signature in signatures]
    for _ in range(n):
        signatures=[(outputs[state][0],outputs[state][1],
                     colors[transitions[state][0]],colors[transitions[state][1]])
                    for state in range(n)]
        classes={signature:i for i,signature in enumerate(sorted(set(signatures)))}
        refined=[classes[signature] for signature in signatures]
        if refined==colors:
            break
        colors=refined
    representatives={colors[state]:state for state in range(n)}
    root=colors[0]
    order=[root]
    mapped={root:0}
    next_,out=[],[]
    for cls in order:
        state=representatives[cls]
        edges=[]
        for x in (0,1):
            successor=colors[transitions[state][x]]
            if successor not in mapped:
                mapped[successor]=len(order)
                order.append(successor)
            edges.append(mapped[successor])
        next_.append(edges)
        out.append(outputs[state].copy())
    if colors[machine['state']] not in mapped:
        raise ValueError('current state is unreachable from the declared initial state')
    return {'next':next_,'output':out,'state':mapped[colors[machine['state']]]}

def future_first_mismatch(a,b,word):
    qa,qb=a['state'],b['state']
    for i,x in enumerate(word):
        if a['output'][qa][x]!=b['output'][qb][x]:return i
        qa=a['next'][qa][x]
        qb=b['next'][qb][x]
    raise AssertionError('SAT model provided no distinguishing continuation')


def private_trace(private,start,word):
    state=start
    output=[]
    for x in word:
        output.append(private['output'][state][x]); state=private['next'][state][x]
    return output,state


def equivalent(a,b):
    """Independent finite product-BFS, no trust in SMT engine."""
    seen={(a['state'],b['state'])};todo=[(a['state'],b['state'])]
    for qa,qb in todo:
        for x in (0,1):
            if a['output'][qa][x]!=b['output'][qb][x]:return False
            pair=(a['next'][qa][x],b['next'][qb][x])
            if pair not in seen:seen.add(pair);todo.append(pair)
    return True


def learn(step,n,max_queries=100,max_solves=100,timeout_ms=3000,policy="full",minimize=False):
    """Learn through a one-bit step callback without private-state access or reset."""
    start=perf_counter()
    transcript_inputs=[]; transcript_outputs=[]
    reference=None
    calls=0
    timings=[]
    while len(transcript_inputs)<max_queries and calls<max_solves:
        if reference is None:
            q=query('single',n,transcript_inputs,transcript_outputs)
            status,answer,elapsed=solve(q,timeout_ms)
            timings.append(elapsed);calls+=1
            if status!='sat':
                return {'status':'model_violation' if status=='unsat' else 'unknown','calls':calls,'queries':len(transcript_inputs),
                        'wall_s':round(perf_counter()-start,3),'solver_s':round(sum(timings),3)}
            reference=model_from_values('A',parse_values(answer),n,transcript_inputs,transcript_outputs)
            if minimize:
                reference=minimize_reference(reference)
        q=query('fixed',n,transcript_inputs,transcript_outputs,reference)
        status,answer,elapsed=solve(q,timeout_ms)
        timings.append(elapsed);calls+=1
        if status=='unsat':
            return {'status':'certified','clone':reference,'calls':calls,'queries':len(transcript_inputs),
                    'wall_s':round(perf_counter()-start,3),'solver_s':round(sum(timings),3),
                    'active_states':len(reference['next'])}
        if policy=='shortest':
            if status=='unknown':
                depth=1
                while depth<q['horizon'] and calls<max_solves:
                    trial=query('fixed',n,transcript_inputs,transcript_outputs,reference,depth)
                    outcome,trial_answer,spent=solve(trial,timeout_ms)
                    calls+=1;timings.append(spent)
                    if outcome=='sat':
                        q,answer,status=trial,trial_answer,'sat'
                        break
                    depth*=2
            if status=='sat':
                low,high=1,q['horizon']
                while low<high and calls<max_solves:
                    mid=(low+high)//2
                    trial=query('fixed',n,transcript_inputs,transcript_outputs,reference,mid)
                    outcome,trial_answer,spent=solve(trial,timeout_ms)
                    calls+=1;timings.append(spent)
                    if outcome=='sat':
                        high=mid
                        q,answer=trial,trial_answer
                    elif outcome=='unsat':
                        low=mid+1
                    else:
                        break
        if status=='unknown':
            return {'status':'unknown','calls':calls,'queries':len(transcript_inputs),
                    'wall_s':round(perf_counter()-start,3),'solver_s':round(sum(timings),3)}
        values=parse_values(answer)
        alternative=model_from_values('B',values,n,transcript_inputs,transcript_outputs)
        future=[int(values[name]) for name in q['futureInputNames']]
        mismatch=future_first_mismatch(reference,alternative,future)
        assert mismatch<len(future)
        for x in future[:mismatch+1]:
            expected=reference['output'][reference['state']][x]
            y=step(x)
            assert y in (0,1),'oracle returned a non-binary output'
            transcript_inputs.append(x); transcript_outputs.append(y)
            if y!=expected:
                reference=None
                break
            reference['state']=reference['next'][reference['state']][x]
            if len(transcript_inputs)>=max_queries:break
    return {'status':'budget','calls':calls,'queries':len(transcript_inputs),
            'wall_s':round(perf_counter()-start,3),'solver_s':round(sum(timings),3)}


def fixture(n,seed):
    rng=random.Random(seed)
    return {'next':[[rng.randrange(n) for _ in (0,1)] for _ in range(n)],
            'output':[[rng.randrange(2) for _ in (0,1)] for _ in range(n)]}


def observable_states(private):
    """Independently count reachable future-distinct states in the hidden fixture."""
    transitions=private['next']
    outputs=private['output']
    n=len(transitions)
    reached={0}
    frontier=[0]
    for state in frontier:
        for successor in transitions[state]:
            if successor not in reached:
                reached.add(successor)
                frontier.append(successor)
    signatures=[tuple(outputs[state]) for state in range(n)]
    classes={signature:i for i,signature in enumerate(sorted(set(signatures)))}
    colors=[classes[signature] for signature in signatures]
    for _ in range(n):
        signatures=[(outputs[state][0],outputs[state][1],
                     colors[transitions[state][0]],colors[transitions[state][1]])
                    for state in range(n)]
        classes={signature:i for i,signature in enumerate(sorted(set(signatures)))}
        refined=[classes[signature] for signature in signatures]
        if len(set(refined))==len(set(colors)):
            break
        colors=refined
    return len(reached),len({colors[state] for state in reached})


def evaluate(private,n,policy='full',minimize=False):
    state=[0]
    step_count=[0]

    def step(bit):
        # The learner receives this function alone. Only the evaluator owns
        # the machine table and current private state in its closure.
        q=state[0]
        output=private['output'][q][bit]
        state[0]=private['next'][q][bit]
        step_count[0]+=1
        return output

    result=learn(step,n,max_queries=100,max_solves=100,timeout_ms=3000,policy=policy,minimize=minimize)
    assert step_count[0]==result['queries']
    result['reachable_states'],result['observable_states']=observable_states(private)
    clone=result.pop('clone',None)
    if clone is not None:
        truth={'next':private['next'],'output':private['output'],'state':state[0]}
        result['verified']=equivalent(clone,truth)
        rng=random.Random(0x4ea923+n)
        heldout_matches=0
        for _ in range(128):
            word=[rng.randrange(2) for _ in range(1+rng.randrange(60))]
            observed,_=private_trace(private,state[0],word)
            predicted,_=private_trace(clone,clone['state'],word)
            heldout_matches+=observed==predicted
        result['heldout_matches']=heldout_matches
        result['heldout_total']=128
    return result


def main():
    # Each case gets an OS process boundary as well as a best-effort Z3 timeout.
    # The SMT-LIB timeout does not reliably bound model extraction by the C API.
    if len(sys.argv)>1 and sys.argv[1]=='--worker':
        n,seed=int(sys.argv[2]),int(sys.argv[3])
        result=evaluate(fixture(n,seed),n,
                        policy=sys.argv[4] if len(sys.argv)>4 else 'full',
                        minimize='--minimize' in sys.argv[5:])
        print(json.dumps({'bound':n,'seed':seed,'policy':sys.argv[4] if len(sys.argv)>4 else 'full',
                          'minimize': '--minimize' in sys.argv[5:],**result}),flush=True)
        assert result.get('verified',True),(n,seed,result)
        assert result.get('heldout_matches',128)==128,(n,seed,result)
        return
    # Six-state cases are separately opt-in because some solver runs exceed
    # an entire fixed benchmark budget. The default suite is bounded to N<=5.
    for n in range(1,6):
        for seed in (0x14525a7+n,0xabcdef+n):
            process=subprocess.Popen([sys.executable,str(HERE),'--worker',str(n),str(seed),
                                      sys.argv[1] if len(sys.argv)>1 else 'full'],
                                     stdout=subprocess.PIPE,stderr=subprocess.PIPE,
                                     text=True,start_new_session=True)
            try:
                stdout,stderr=process.communicate(timeout=20)
                if process.returncode!=0:
                    raise RuntimeError(f'case {n}/{seed} failed: {stderr[-500:]}')
                print(stdout.strip(),flush=True)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid,signal.SIGKILL)
                process.communicate(timeout=5)
                print(json.dumps({'bound':n,'seed':seed,'status':'external_timeout',
                                  'wall_limit_s':20}),flush=True)

if __name__=='__main__':main()
