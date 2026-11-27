// Exact subset-DP objective over the selected face set, then heuristic set search.
// For each candidate set, all 2^k subsets are evaluated and the best ordering
// is found exactly; annealing moves replace one or two faces in the set.
// The outer search is heuristic and does not prove a global optimum.
// Build: g++ -O3 -std=c++20 -march=native agent2-rankfive-eight-direction-set-anneal.cpp -o set-anneal
// Run:   ./set-anneal 14 500 1
#include <algorithm>
#include <array>
#include <bit>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <numeric>
#include <random>
#include <vector>
using namespace std;
using u128=unsigned __int128;

struct Model {
  static constexpr int M=8,F=56;
  int K=0,words=0;
  vector<array<uint8_t,3>> kernels;
  vector<uint64_t> fail;
  array<array<uint64_t,4>,F> cover{};
  vector<uint64_t> all;
  array<array<int,3>,F> triples{};
  static int rank3(array<int,3> a) {
    int piv[3]={0,0,0},rank=0;
    for(int v:a) for(int bit=2;bit>=0;--bit) if((v>>bit)&1) {
      if(piv[bit]) v^=piv[bit];
      else {piv[bit]=v;++rank;break;}
    }
    return rank;
  }
  void build() {
    int face=0;
    for(int i=0;i<M;i++)for(int j=i+1;j<M;j++)for(int k=j+1;k<M;k++)triples[face++]={i,j,k};
    for(int p0=0;p0<M;p0++)for(int p1=p0+1;p1<M;p1++)for(int p2=p1+1;p2<M;p2++){
      array<int,3> pivots={p0,p1,p2};array<vector<int>,3> freecols;int bits=0;
      for(int row=0;row<3;row++)for(int col=pivots[row]+1;col<M;col++)if(col!=p0&&col!=p1&&col!=p2){freecols[row].push_back(col);++bits;}
      for(int a=0;a<(1<<bits);a++){
        array<uint8_t,3> rows={uint8_t(1<<p0),uint8_t(1<<p1),uint8_t(1<<p2)};int bit=0;
        for(int row=0;row<3;row++)for(int col:freecols[row]){if((a>>bit)&1)rows[row]|=uint8_t(1<<col);++bit;}
        kernels.push_back(rows);
      }
    }
    K=(int)kernels.size();words=(K+63)/64;fail.assign((size_t)F*words,~uint64_t(0));
    for(int f=0;f<F;f++){
      auto T=triples[f];int faceMask=255^(1<<T[0])^(1<<T[1])^(1<<T[2]);
      for(int sub=faceMask;;sub=(sub-1)&faceMask){cover[f][sub/64]|=uint64_t(1)<<(sub%64);if(!sub)break;}
      for(int q=0;q<K;q++){
        auto rows=kernels[q];array<int,3> restricted={0,0,0};
        for(int row=0;row<3;row++)for(int pos=0;pos<3;pos++)if((rows[row]>>T[pos])&1)restricted[row]|=1<<pos;
        if(rank3(restricted)==3)fail[(size_t)f*words+q/64]&=~(uint64_t(1)<<(q%64));
      }
    }
    if(K%64){uint64_t mask=(uint64_t(1)<<(K%64))-1;for(int f=0;f<F;f++)fail[(size_t)f*words+words-1]&=mask;}
    all.assign(words,~uint64_t(0));if(K%64)all.back()=(uint64_t(1)<<(K%64))-1;
  }
};
struct Workspace {
  vector<uint64_t> rem;
  vector<uint32_t> remCount,coverCount;
  vector<array<uint64_t,4>> coverUnion;
  vector<uint64_t> reachNum;
  vector<u128> dp;
  vector<int8_t> parent;
  Workspace(int states,int words):rem((size_t)states*words),remCount(states),coverCount(states),coverUnion(states),reachNum(states),dp(states),parent(states){}
};
struct Score {u128 num=0,den=1;double value=0;vector<int> order;uint64_t eNum=0,fNum=0;};
static long double asLD(u128 x){uint64_t hi=(uint64_t)(x>>64),lo=(uint64_t)x;return (long double)hi*18446744073709551616.0L+(long double)lo;}
static Score exactSetDP(const Model&m,const vector<int>&selected,Workspace&w){
  int k=(int)selected.size(),states=1<<k,words=m.words;
  const uint64_t pnum=948718575ULL,pden=1ULL<<30;
  const uint64_t denominator=pden*(uint64_t)m.K;
  for(int i=0;i<words;i++)w.rem[i]=m.all[i];
  w.remCount[0]=m.K;w.coverUnion[0]={0,0,0,0};w.coverCount[0]=0;
  for(int s=1;s<states;s++){
    int bit=__builtin_ctz((unsigned)s),prev=s&(s-1),face=selected[bit];
    const uint64_t* prevRem=&w.rem[(size_t)prev*words];uint64_t* currRem=&w.rem[(size_t)s*words];
    const uint64_t* fail=&m.fail[(size_t)face*words];uint32_t count=0;
    for(int j=0;j<words;j++){currRem[j]=prevRem[j]&fail[j];count+=popcount(currRem[j]);}
    w.remCount[s]=count;
    auto cu=w.coverUnion[prev];for(int j=0;j<4;j++)cu[j]|=m.cover[face][j];w.coverUnion[s]=cu;
    w.coverCount[s]=popcount(cu[0])+popcount(cu[1])+popcount(cu[2])+popcount(cu[3]);
  }
  for(int s=0;s<states;s++)w.reachNum[s]=(pden-pnum)*(uint64_t)m.K+pnum*(uint64_t)w.remCount[s];
  const u128 INF=~(u128)0;fill(w.dp.begin(),w.dp.begin()+states,INF);fill(w.parent.begin(),w.parent.begin()+states,-1);w.dp[0]=0;
  for(int s=0;s<states;s++){
    u128 base=w.dp[s];
    for(int j=0;j<k;j++)if(!(s&(1<<j))){int t=s|(1<<j);uint64_t inc=w.coverCount[t]-w.coverCount[s];u128 cand=base+(u128)w.reachNum[s]*inc;if(cand<w.dp[t]){w.dp[t]=cand;w.parent[t]=j;}}
  }
  int full=states-1;uint64_t fnum=w.reachNum[full];u128 enumv=w.dp[full];u128 qnum=enumv-fnum,qden=(u128)denominator-fnum;
  Score out;out.num=qnum;out.den=(uint64_t)qden;out.value=(double)(asLD(qnum)/asLD(qden));out.eNum=(uint64_t)enumv;out.fNum=fnum;
  int s=full;while(s){int j=w.parent[s];out.order.push_back(selected[j]);s^=1<<j;}reverse(out.order.begin(),out.order.end());
  return out;
}
static bool lessScore(const Score&a,const Score&b){return a.num*b.den < b.num*a.den;}
static vector<int> annealSet(const Model&m,Workspace&w,int k,uint64_t seed,int steps,Score&bestScore,const vector<int>&initial){
  mt19937_64 rng(seed);uniform_real_distribution<double> U(0,1);uniform_int_distribution<int> pos(0,k-1),face(0,Model::F-1);
  vector<int> cur=initial;
  if(cur.empty()){cur.resize(Model::F);iota(cur.begin(),cur.end(),0);shuffle(cur.begin(),cur.end(),rng);cur.resize(k);}
  sort(cur.begin(),cur.end());
  Score curScore=exactSetDP(m,cur,w);bestScore=curScore;vector<int>best=cur;
  for(int it=0;it<steps;it++){
    double frac=(double)it/(steps-1),temp=0.03*pow(1e-4,frac);
    vector<int> cand=cur;double mv=U(rng);
    if(mv<0.8){int i=pos(rng),x=face(rng);bool used=true;while(used){used=false;for(int z:cand)if(z==x){used=true;x=face(rng);break;}}cand[i]=x;}
    else {int i=pos(rng),j=pos(rng);while(j==i)j=pos(rng);int x=face(rng),y=face(rng);bool bad=true;while(bad){bad=false;for(int z:cand)if(z==x||z==y){bad=true;x=face(rng);y=face(rng);break;}if(x==y){bad=true;y=face(rng);}}cand[i]=x;cand[j]=y;}
    sort(cand.begin(),cand.end());
    Score q=exactSetDP(m,cand,w);
    if(lessScore(q,bestScore)){bestScore=q;best=cand;}
    if(q.value<curScore.value||U(rng)<exp((curScore.value-q.value)/temp)){cur=cand;curScore=q;}
  }
  return best;
}
int main(int argc,char**argv){
  int k=argc>1?atoi(argv[1]):14,steps=argc>2?atoi(argv[2]):100,restarts=argc>3?atoi(argv[3]):4;
  if(k<2||k>14||steps<2||restarts<1){fprintf(stderr,"usage: %s [k=2..14] [steps>=2] [restarts>=1]\n",argv[0]);return 2;}
  Model m;m.build();Workspace w(1<<k,m.words);
  fprintf(stderr,"kernels=%d words=%d k=%d states=%d steps=%d restarts=%d\n",m.K,m.words,k,1<<k,steps,restarts);
  Score global;bool haveGlobal=false;vector<int>globalSet;
  vector<int> initial={0,1,2,3,5,9,28,31,33,35,38,41,43,45};
  for(int r=0;r<restarts;r++){
    Score best;auto set=annealSet(m,w,k,55000+r,steps,best,(r==0 && k==14)?initial:vector<int>{});
    printf("restart=%d Q=%.14f fraction=%llu/%llu E_num=%llu f_num=%llu set=",r,best.value,(unsigned long long)best.num,(unsigned long long)best.den,(unsigned long long)best.eNum,(unsigned long long)best.fNum);
    sort(set.begin(),set.end());for(int f:set){auto t=m.triples[f];printf("(%d,%d,%d)",t[0],t[1],t[2]);}printf(" order=");for(int f:best.order){auto t=m.triples[f];printf("(%d,%d,%d)",t[0],t[1],t[2]);}printf("\n");
    if(!haveGlobal||lessScore(best,global)){global=best;globalSet=set;haveGlobal=true;}
  }
  printf("BEST Q=%.14f fraction=%llu/%llu E_num=%llu f_num=%llu set=",global.value,(unsigned long long)global.num,(unsigned long long)global.den,(unsigned long long)global.eNum,(unsigned long long)global.fNum);
  sort(globalSet.begin(),globalSet.end());for(int f:globalSet){auto t=m.triples[f];printf("(%d,%d,%d)",t[0],t[1],t[2]);}printf(" order=");for(int f:global.order){auto t=m.triples[f];printf("(%d,%d,%d)",t[0],t[1],t[2]);}printf("\n");
}
