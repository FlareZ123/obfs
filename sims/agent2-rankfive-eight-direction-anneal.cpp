// Heuristic search only. Final candidate claims must be checked by
// agent2-rankfive-eight-direction-witness.py, which uses exact Fractions.
// Build: g++ -O3 -std=c++20 -march=native agent2-rankfive-eight-direction-anneal.cpp -o anneal
// Run:   ./anneal 14 100000 8
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

struct Model {
  static constexpr int M=8, R=3, F=56;
  int K=0, words=0;
  double p=0;
  vector<array<uint8_t,3>> kernels;
  vector<uint64_t> fail;
  array<array<uint64_t,4>,F> cover{};
  vector<uint64_t> all;
  vector<double> reach;
  array<array<int,3>,F> triples{};

  static int rank3(array<int,3> a) {
    int piv[3]={0,0,0}, rank=0;
    for(int v:a) {
      for(int bit=2;bit>=0;--bit) if((v>>bit)&1) {
        if(piv[bit]) v^=piv[bit];
        else { piv[bit]=v; ++rank; break; }
      }
    }
    return rank;
  }
  void build() {
    int face=0;
    for(int i=0;i<M;i++) for(int j=i+1;j<M;j++) for(int k=j+1;k<M;k++)
      triples[face++]={i,j,k};
    for(int p0=0;p0<M;p0++) for(int p1=p0+1;p1<M;p1++) for(int p2=p1+1;p2<M;p2++) {
      array<int,3> pivots={p0,p1,p2};
      array<vector<int>,3> freecols;
      int bits=0;
      for(int row=0;row<3;row++)
        for(int col=pivots[row]+1;col<M;col++)
          if(col!=p0&&col!=p1&&col!=p2) { freecols[row].push_back(col); ++bits; }
      for(int assignment=0;assignment<(1<<bits);assignment++) {
        array<uint8_t,3> rows={uint8_t(1<<p0),uint8_t(1<<p1),uint8_t(1<<p2)};
        int bit=0;
        for(int row=0;row<3;row++) for(int col:freecols[row]) {
          if((assignment>>bit)&1) rows[row]|=uint8_t(1<<col);
          ++bit;
        }
        kernels.push_back(rows);
      }
    }
    K=(int)kernels.size(); words=(K+63)/64;
    fail.assign((size_t)F*words,~uint64_t(0));
    for(int f=0;f<F;f++) {
      auto T=triples[f];
      int faceMask=255 ^ (1<<T[0]) ^ (1<<T[1]) ^ (1<<T[2]);
      for(int sub=faceMask;;sub=(sub-1)&faceMask) {
        cover[f][sub/64] |= uint64_t(1)<<(sub%64);
        if(sub==0) break;
      }
      for(int q=0;q<K;q++) {
        auto rows=kernels[q];
        array<int,3> restricted={0,0,0};
        for(int row=0;row<3;row++) for(int pos=0;pos<3;pos++)
          if((rows[row]>>T[pos])&1) restricted[row]|=1<<pos;
        if(rank3(restricted)==3) fail[(size_t)f*words+q/64] &= ~(uint64_t(1)<<(q%64));
      }
    }
    if(K%64) {
      uint64_t mask=(uint64_t(1)<<(K%64))-1;
      for(int f=0;f<F;f++) fail[(size_t)f*words+words-1]&=mask;
    }
    all.assign(words,~uint64_t(0));
    if(K%64) all.back()=(uint64_t(1)<<(K%64))-1;
    p=1.0;
    for(int i=0;i<5;i++) p*=1.0-pow(2.0,i-M);
    reach.resize(K+1);
    for(int c=0;c<=K;c++) reach[c]=1.0-p+p*(double)c/K;
  }
  double eval(const vector<int>& seq) const {
    vector<uint64_t> rem=all;
    int remCount=K;
    array<uint64_t,4> covered={0,0,0,0};
    int coveredCount=0;
    double E=0;
    for(int f:seq) {
      double r=reach[remCount];
      int newCovered=0;
      for(int w=0;w<4;w++) {
        covered[w]|=cover[f][w];
        newCovered+=popcount(covered[w]);
      }
      int inc=newCovered-coveredCount;
      E+=r*inc;
      coveredCount=newCovered;
      int after=0;
      const uint64_t* ff=&fail[(size_t)f*words];
      for(int w=0;w<words;w++) { rem[w]&=ff[w]; after+=popcount(rem[w]); }
      remCount=after;
    }
    double failure=reach[remCount];
    return (E-failure)/(1.0-failure);
  }
};

static vector<int> anneal(const Model& model,int k,uint64_t seed,int steps) {
  mt19937_64 rng(seed);
  uniform_real_distribution<double> U(0.0,1.0);
  uniform_int_distribution<int> pos(0,k-1), face(0,Model::F-1);
  vector<int> cur(Model::F); iota(cur.begin(),cur.end(),0); shuffle(cur.begin(),cur.end(),rng); cur.resize(k);
  double curQ=model.eval(cur),bestQ=curQ;
  vector<int> best=cur;
  for(int it=0;it<steps;it++) {
    double frac=(double)it/(steps-1);
    double temp=0.1*pow(1e-4,frac); // 0.1 -> 1e-5
    vector<int> cand=cur;
    double moveProb=U(rng);
    if(moveProb<0.45) {
      int i=pos(rng),j=pos(rng); while(j==i)j=pos(rng);
      swap(cand[i],cand[j]);
    } else if(moveProb<0.9 && k<Model::F) {
      int i=pos(rng),x=face(rng);
      bool used=true;
      while(used) { used=false; for(int z:cand) if(z==x){used=true;x=face(rng);break;} }
      cand[i]=x;
    } else {
      int i=pos(rng),j=pos(rng); if(i>j)swap(i,j);
      reverse(cand.begin()+i,cand.begin()+j+1);
    }
    double q=model.eval(cand);
    if(q<bestQ) { bestQ=q;best=cand; }
    if(q<curQ || U(rng)<exp((curQ-q)/temp)) { cur=cand;curQ=q; }
  }
  return best;
}

int main(int argc,char**argv) {
  int k=argc>1?atoi(argv[1]):14;
  int steps=argc>2?atoi(argv[2]):100000;
  int restarts=argc>3?atoi(argv[3]):8;
  if(k<2 || k>Model::F || steps<2 || restarts<1) {
    fprintf(stderr,"usage: %s [faces-per-trial 2..56] [steps>=2] [restarts>=1]\n",argv[0]);
    return 2;
  }
  Model m;m.build();
  fprintf(stderr,"kernels=%d faces=%d p=%.15f k=%d steps=%d restarts=%d\n",m.K,Model::F,m.p,k,steps,restarts);
  double bestQ=1e99;vector<int> best;
  for(int r=0;r<restarts;r++) {
    auto seq=anneal(m,k,44000+r,steps);
    double q=m.eval(seq);
    printf("restart=%d Q=%.14f sequence=",r,q);
    for(int f:seq){auto t=m.triples[f];printf("(%d,%d,%d)",t[0],t[1],t[2]);}
    printf("\n");
    if(q<bestQ){bestQ=q;best=seq;}
  }
  printf("BEST Q=%.14f sequence=",bestQ);
  for(int f:best){auto t=m.triples[f];printf("(%d,%d,%d)",t[0],t[1],t[2]);}
  printf("\n");
}
