// Exact restart-aware optimization of rank-five witness-face searches at m=7.
// Enumerates all 2D kernels of full-rank 5x7 binary matrices and all 2^21
// tested-face states. Uses Dinkelbach fractional programming for each cutoff k.
// Build: g++ -O3 -std=c++20 sims/agent2-rankfive-witness-restart-dp.cpp -o /tmp/rank7restartdp
// Run:   /tmp/rank7restartdp
// Peak memory is about 712 MiB; no network or CI is required.
#include <array>
#include <bit>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <limits>
#include <vector>

using namespace std;

int main() {
  constexpr int m = 7;
  constexpr int face_count = 21;
  constexpr int state_count = 1 << face_count;

  // Every 2D subspace of GF(2)^7 has a unique RREF basis.
  vector<array<int, 2>> kernels;
  for (int p0 = 0; p0 < m; p0++) {
    for (int p1 = p0 + 1; p1 < m; p1++) {
      vector<int> free0, free1;
      for (int j = p0 + 1; j < m; j++) if (j != p1) free0.push_back(j);
      for (int j = p1 + 1; j < m; j++) free1.push_back(j);
      const int free_bits = static_cast<int>(free0.size() + free1.size());
      for (int assignment = 0; assignment < (1 << free_bits); assignment++) {
        int row0 = 1 << p0;
        int row1 = 1 << p1;
        int bit = 0;
        for (int j : free0) {
          if ((assignment >> bit) & 1) row0 |= 1 << j;
          ++bit;
        }
        for (int j : free1) {
          if ((assignment >> bit) & 1) row1 |= 1 << j;
          ++bit;
        }
        kernels.push_back({row0, row1});
      }
    }
  }

  const int kernel_count = static_cast<int>(kernels.size());
  const int words = (kernel_count + 63) / 64;
  if (kernel_count != 2667) {
    fprintf(stderr, "unexpected kernel count: %d\n", kernel_count);
    return 1;
  }

  // A face is a 5-subset S; its complement T is a pair of coordinates.
  // S is independent exactly when projection of K onto T has rank 2.
  vector<array<int, 2>> complements;
  vector<array<uint64_t, 2>> face_cover;
  for (int i = 0; i < m; i++) {
    for (int j = i + 1; j < m; j++) {
      complements.push_back({i, j});
      const int face = ((1 << m) - 1) ^ (1 << i) ^ (1 << j);
      array<uint64_t, 2> cover{0, 0};
      for (int subset = face;; subset = (subset - 1) & face) {
        if (subset < 64) cover[0] |= 1ULL << subset;
        else cover[1] |= 1ULL << (subset - 64);
        if (subset == 0) break;
      }
      face_cover.push_back(cover);
    }
  }

  // fail[f] is the set of kernels for which face f has zero fifth derivative.
  vector<vector<uint64_t>> fail(face_count, vector<uint64_t>(words, ~0ULL));
  for (int f = 0; f < face_count; f++) {
    const auto [i, j] = complements[f];
    for (int q = 0; q < kernel_count; q++) {
      const int a = (kernels[q][0] >> i) & 1;
      const int b = (kernels[q][0] >> j) & 1;
      const int c = (kernels[q][1] >> i) & 1;
      const int d = (kernels[q][1] >> j) & 1;
      const int determinant = (a * d) ^ (b * c);
      if (determinant) fail[f][q / 64] &= ~(1ULL << (q % 64));
    }
  }
  if (kernel_count % 64) {
    const uint64_t last_mask = (1ULL << (kernel_count % 64)) - 1;
    for (int f = 0; f < face_count; f++) fail[f][words - 1] &= last_mask;
  }

  // Precompute, for every tested-face subset A:
  //   rc[A] = number of full-rank kernels for which all faces in A failed;
  //   cc[A] = number of distinct subset-sum vertices exposed by A.
  // Rank-deficient 5x7 matrices are added later to the unconditional failure
  // probability: they fail every face, regardless of the kernel subspace.
  vector<uint64_t> remaining(static_cast<size_t>(state_count) * words, 0);
  vector<uint16_t> remaining_count(state_count, 0);
  vector<array<uint64_t, 2>> covered(state_count);
  vector<uint8_t> covered_count(state_count, 0);

  for (int w = 0; w < words; w++) remaining[w] = ~0ULL;
  if (kernel_count % 64) remaining[words - 1] = (1ULL << (kernel_count % 64)) - 1;
  remaining_count[0] = static_cast<uint16_t>(kernel_count);
  covered[0] = {0, 0};

  for (int state = 1; state < state_count; state++) {
    const int face = countr_zero(static_cast<unsigned>(state));
    const int parent = state & (state - 1);
    const uint64_t* src = &remaining[static_cast<size_t>(parent) * words];
    uint64_t* dst = &remaining[static_cast<size_t>(state) * words];
    int count = 0;
    for (int w = 0; w < words; w++) {
      dst[w] = src[w] & fail[face][w];
      count += popcount(dst[w]);
    }
    remaining_count[state] = static_cast<uint16_t>(count);
    covered[state][0] = covered[parent][0] | face_cover[face][0];
    covered[state][1] = covered[parent][1] | face_cover[face][1];
    covered_count[state] = static_cast<uint8_t>(
      popcount(covered[state][0]) + popcount(covered[state][1]));
  }

  // The large bitsets are no longer needed once their cardinalities are known.
  vector<uint64_t>().swap(remaining);
  vector<array<uint64_t, 2>>().swap(covered);

  double rank5_probability = 1.0;
  for (int i = 0; i < 5; i++) rank5_probability *= 1.0 - pow(2.0, i - m);

  vector<double> dp(state_count, 0.0);
  vector<uint8_t> choice(state_count, 255);
  vector<uint8_t> depth(state_count, 0);
  for (int state = 1; state < state_count; state++) {
    depth[state] = static_cast<uint8_t>(depth[state & (state - 1)] + 1);
  }

  printf("rank5_probability=%.12f kernels=%d\n", rank5_probability, kernel_count);
  double global_best = numeric_limits<double>::infinity();
  int global_best_k = -1;

  // For a sequence with per-trial expected cost E and failure probability f,
  // repeated trials with a globally cached zero input cost
  // Q=(E-f)/(1-f). Let mu=Q-1; Dinkelbach minimizes E+mu*f and updates
  // mu <- Q-1. At the optimum, the terminal penalty is mu times reach(A).
  for (int cutoff = 1; cutoff <= face_count; cutoff++) {
    double mu = 109.0;  // Above every feasible Q-1 for these 21 cutoffs.
    double best_trial_cost = 0.0;
    double best_fail_probability = 1.0;
    double best_q = 0.0;
    vector<int> best_order;
    int iterations = 0;
    bool converged = false;

    for (int iteration = 0; iteration < 20; iteration++) {
      iterations = iteration + 1;
      fill(dp.begin(), dp.end(), 0.0);
      fill(choice.begin(), choice.end(), 255);

      // Minimize E + mu*f over all ordered sequences of this length.
      for (int state = state_count - 1; state >= 0; state--) {
        const int d = depth[state];
        if (d > cutoff) continue;
        const double reach_probability =
          (1.0 - rank5_probability) +
          rank5_probability * (static_cast<double>(remaining_count[state]) / kernel_count);

        if (d == cutoff) {
          dp[state] = mu * reach_probability;
          continue;
        }

        double best = numeric_limits<double>::infinity();
        int best_face = 255;
        for (int face = 0; face < face_count; face++) {
          if (state & (1 << face)) continue;
          const int child = state | (1 << face);
          const int new_queries =
            static_cast<int>(covered_count[child]) - static_cast<int>(covered_count[state]);
          const double candidate =
            reach_probability * new_queries + dp[child];
          if (candidate < best - 1e-12) {
            best = candidate;
            best_face = face;
          }
        }
        dp[state] = best;
        choice[state] = static_cast<uint8_t>(best_face);
      }

      // Reconstruct the minimizing sequence and evaluate its true fractional cost.
      int state = 0;
      double trial_cost = 0.0;
      best_order.clear();
      for (int step = 0; step < cutoff; step++) {
        const int face = choice[state];
        if (face == 255) {
          fprintf(stderr, "missing choice at cutoff=%d step=%d\n", cutoff, step);
          return 2;
        }
        const int child = state | (1 << face);
        const double reach_probability =
          (1.0 - rank5_probability) +
          rank5_probability * (static_cast<double>(remaining_count[state]) / kernel_count);
        const int new_queries =
          static_cast<int>(covered_count[child]) - static_cast<int>(covered_count[state]);
        trial_cost += reach_probability * new_queries;
        best_order.push_back(face);
        state = child;
      }

      const double fail_probability =
        (1.0 - rank5_probability) +
        rank5_probability * (static_cast<double>(remaining_count[state]) / kernel_count);
      const double q = (trial_cost - fail_probability) / (1.0 - fail_probability);
      best_trial_cost = trial_cost;
      best_fail_probability = fail_probability;
      best_q = q;

      if (fabs((q - 1.0) - mu) < 1e-11) {
        converged = true;
        break;
      }
      mu = q - 1.0;
    }

    if (!converged) {
      fprintf(stderr, "Dinkelbach did not converge at cutoff=%d\n", cutoff);
      return 3;
    }
    if (best_q < global_best) {
      global_best = best_q;
      global_best_k = cutoff;
    }

    int final_state = 0;
    for (int face : best_order) final_state |= 1 << face;
    printf("k=%2d Q=%.12f Etrial=%.12f fail=%.12f union=%u iterations=%d order=",
      cutoff, best_q, best_trial_cost, best_fail_probability,
      covered_count[final_state], iterations);
    for (int face : best_order) {
      printf("(%d,%d)", complements[face][0], complements[face][1]);
    }
    printf("\n");
  }

  printf("best_cutoff=%d best_expected_witness_queries=%.12f\n",
         global_best_k, global_best);
  return 0;
}
