// Independent exact-integer verifier for the seven-direction restart DP.
// All policy comparisons and Dinkelbach convergence checks use exact 128-bit integers;
// floating point is used only to format the final decimal display.
// Build: g++ -O3 -std=c++20 -o /tmp/rankfive-witness-restart-dp-exact sims/agent2-rankfive-witness-restart-dp-exact.cpp
// Run:   /tmp/rankfive-witness-restart-dp-exact
#include <array>
#include <bit>
#include <cstdint>
#include <cstdio>
#include <vector>
#include <algorithm>
#include <string>
using namespace std;
using u128 = unsigned __int128;

static string str128(u128 x) {
  if (!x) return "0";
  string s;
  while (x) { s.push_back(char('0' + x % 10)); x /= 10; }
  reverse(s.begin(), s.end());
  return s;
}
static long double ld(u128 x) { return (long double)x; }

int main() {
  constexpr int m=7, face_count=21, state_count=1<<face_count;
  constexpr uint64_t pden=33554432ULL, pnum=26043255ULL;
  constexpr uint64_t kernel_count_expected=2667;
  const uint64_t D=pden*kernel_count_expected;

  vector<array<int,2>> kernels;
  for(int p0=0;p0<m;p0++) for(int p1=p0+1;p1<m;p1++) {
    vector<int> free0,free1;
    for(int j=p0+1;j<m;j++) if(j!=p1) free0.push_back(j);
    for(int j=p1+1;j<m;j++) free1.push_back(j);
    int bits=(int)(free0.size()+free1.size());
    for(int a=0;a<(1<<bits);a++) {
      int r0=1<<p0,r1=1<<p1,b=0;
      for(int j:free0){if((a>>b)&1)r0|=1<<j;++b;}
      for(int j:free1){if((a>>b)&1)r1|=1<<j;++b;}
      kernels.push_back({r0,r1});
    }
  }
  if(kernels.size()!=kernel_count_expected){fprintf(stderr,"kernel count mismatch\n");return 1;}
  const int words=(int)((kernels.size()+63)/64);
  vector<array<int,2>> complements;
  vector<array<uint64_t,2>> face_cover;
  for(int i=0;i<m;i++) for(int j=i+1;j<m;j++) {
    complements.push_back({i,j});
    int face=((1<<m)-1)^(1<<i)^(1<<j);
    array<uint64_t,2> c{0,0};
    for(int sub=face;;sub=(sub-1)&face){
      if(sub<64)c[0]|=1ULL<<sub; else c[1]|=1ULL<<(sub-64);
      if(!sub)break;
    }
    face_cover.push_back(c);
  }
  vector<vector<uint64_t>> fail(face_count,vector<uint64_t>(words,~0ULL));
  for(int f=0;f<face_count;f++){
    auto [i,j]=complements[f];
    for(int q=0;q<(int)kernels.size();q++){
      int a=(kernels[q][0]>>i)&1,b=(kernels[q][0]>>j)&1;
      int c=(kernels[q][1]>>i)&1,d=(kernels[q][1]>>j)&1;
      if((a*d)^(b*c)) fail[f][q/64]&=~(1ULL<<(q%64));
    }
  }
  if(kernels.size()%64){
    uint64_t mask=(1ULL<<(kernels.size()%64))-1;
    for(int f=0;f<face_count;f++)fail[f][words-1]&=mask;
  }

  vector<uint64_t> remaining((size_t)state_count*words,0);
  vector<uint16_t> remaining_count(state_count,0);
  for(int w=0;w<words;w++)remaining[w]=~0ULL;
  if(kernels.size()%64)remaining[words-1]=(1ULL<<(kernels.size()%64))-1;
  remaining_count[0]=(uint16_t)kernels.size();
  for(int state=1;state<state_count;state++){
    int face=countr_zero((unsigned)state),parent=state&(state-1),count=0;
    const uint64_t*src=&remaining[(size_t)parent*words];
    uint64_t*dst=&remaining[(size_t)state*words];
    for(int w=0;w<words;w++){dst[w]=src[w]&fail[face][w];count+=popcount(dst[w]);}
    remaining_count[state]=(uint16_t)count;
  }
  vector<uint64_t>().swap(remaining);
  vector<vector<uint64_t>>().swap(fail);

  vector<array<uint64_t,2>> covered(state_count);
  vector<uint8_t> covered_count(state_count,0),depth(state_count,0);
  for(int state=1;state<state_count;state++){
    int face=countr_zero((unsigned)state),parent=state&(state-1);
    covered[state][0]=covered[parent][0]|face_cover[face][0];
    covered[state][1]=covered[parent][1]|face_cover[face][1];
    covered_count[state]=(uint8_t)(popcount(covered[state][0])+popcount(covered[state][1]));
    depth[state]=(uint8_t)(depth[parent]+1);
  }
  vector<array<uint64_t,2>>().swap(covered);
  vector<uint64_t> reach_num(state_count);
  for(int s=0;s<state_count;s++){
    // r(A) = (1-p) + p * remaining_count/2667, denominator D.
    reach_num[s]=(pden-pnum)*kernel_count_expected+pnum*remaining_count[s];
  }

  vector<u128> dp(state_count);
  vector<uint8_t> best_choice(state_count,255);
  struct Result{int k;u128 nE,nf,qnum,qden;vector<int> order;int iters;};
  vector<Result> results;
  u128 best_num=0,best_den=1; int best_k=-1;
  for(int cutoff=1;cutoff<=face_count;cutoff++){
    // mu = a/b, initially 109. Dinkelbach is performed with exact integers.
    u128 mu_num=109,mu_den=1;
    Result res{}; bool converged=false;
    for(int iter=1;iter<=20;iter++){
      fill(best_choice.begin(),best_choice.end(),255);
      for(int state=state_count-1;state>=0;state--){
        int d=depth[state]; if(d>cutoff)continue;
        if(d==cutoff){dp[state]=mu_num*reach_num[state];continue;}
        u128 best=~(u128)0; int bestf=-1;
        for(int f=0;f<face_count;f++)if(!(state&(1<<f))){
          int child=state|(1<<f);
          int inc=(int)covered_count[child]-(int)covered_count[state];
          u128 cand=mu_den*reach_num[state]*(unsigned)inc+dp[child];
          if(cand<best){best=cand;bestf=f;}
        }
        dp[state]=best; best_choice[state]=(uint8_t)bestf;
      }
      int state=0; u128 nE=0; vector<int> order;
      for(int step=0;step<cutoff;step++){
        int f=best_choice[state]; if(f<0||f>=face_count){fprintf(stderr,"missing choice\n");return 2;}
        int child=state|(1<<f);
        int inc=(int)covered_count[child]-(int)covered_count[state];
        nE+=reach_num[state]*(unsigned)inc;
        order.push_back(f);state=child;
      }
      u128 nf=reach_num[state];
      u128 qnum=nE-nf, qden=(u128)D-nf;
      u128 new_mu_num=nE-D, new_mu_den=qden;
      res={cutoff,nE,nf,qnum,qden,order,iter};
      if(new_mu_num*mu_den==mu_num*new_mu_den){converged=true;break;}
      mu_num=new_mu_num;mu_den=new_mu_den;
    }
    if(!converged){fprintf(stderr,"no convergence cutoff %d\n",cutoff);return 3;}
    if(best_k<0||res.qnum*best_den<best_num*res.qden){best_num=res.qnum;best_den=res.qden;best_k=cutoff;}
    results.push_back(res);
  }
  printf("D=%llu kernels=%zu\n",(unsigned long long)D,kernels.size());
  for(const auto&r:results){
    printf("k=%2d Q=%s/%s = %.12Lf E=%s/%llu f=%s/%llu iters=%d order=",
      r.k,str128(r.qnum).c_str(),str128(r.qden).c_str(),ld(r.qnum)/ld(r.qden),
      str128(r.nE).c_str(),(unsigned long long)D,str128(r.nf).c_str(),(unsigned long long)D,r.iters);
    int state=0;
    for(int f:r.order){auto [i,j]=complements[f];printf("(%d,%d)",i,j);state|=1<<f;}
    printf(" union=%u\n",(unsigned)covered_count[state]);
  }
  printf("BEST k=%d Q=%s/%s = %.12Lf\n",best_k,str128(best_num).c_str(),str128(best_den).c_str(),ld(best_num)/ld(best_den));
}
