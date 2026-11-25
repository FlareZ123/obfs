/*
 * Exact m=7 full-path face-set/order optimizer.
 *
 * The query policy chooses the best pair among all ten anchor pairs for each
 * basis vector. Successful-trial extras are processed in ascending cache-cost
 * order, assigning the largest independence probability to the cheapest extra.
 * These choices make the objective invariant under permutations of the seven
 * direction labels, so the 1,044 graph-atlas representatives cover every
 * labeled face set. Each representative is optimized over every face order
 * by subset DP.
 *
 * The model uses the per-trial injective-subset-sum cache assumption and
 * excludes accidental cross-trial query collisions; see the accompanying
 * research report for collision bounds and exact Python verification.
 */
#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <limits>
#include <vector>

static constexpr int N_FACES = 21;
static constexpr int KERNELS = 2667;
static constexpr int KMAX = 20;
static constexpr int GLOBAL_STATES = 1 << N_FACES;

struct Candidate {
    double total = std::numeric_limits<double>::infinity();
    double witness = 0.0;
    double coordinate = 0.0;
    double miss = 0.0;
    int remaining = 0;
    int uncacheable_vertices = 0;
    uint32_t graph_mask = 0;
    std::vector<int> order_edges;
};

static long double a_k[3][KMAX + 1];
static long double b_k[2][KMAX + 1];

static void rank_distribution(int dimension, int vector_count, long double out[28]) {
    long double p[28] = {0};
    p[0] = 1.0L;
    for (int t = 0; t < vector_count; ++t) {
        long double q[28] = {0};
        for (int r = 0; r <= dimension; ++r) {
            if (p[r] == 0.0L) continue;
            long double in_span = std::ldexp(1.0L, r - dimension);
            q[r] += p[r] * in_span;
            if (r < dimension) q[r + 1] += p[r] * (1.0L - in_span);
        }
        std::copy(q, q + 28, p);
    }
    std::copy(p, p + 28, out);
}

static void precompute_rank_coefficients() {
    for (int k = 0; k <= KMAX; ++k) {
        // All prior trial directions determine the span against which the
        // successful-trial extras are tested. Only directions whose singleton
        // value was queried in at least one face can save one coordinate probe.
        long double prior_total[28];
        rank_distribution(27, 7 * k, prior_total);
        long double expected_extra_rank = 0.0L;
        long double b0 = 0.0L, b1 = 0.0L;
        for (int r = 0; r <= 27; ++r) {
            long double mass = prior_total[r];
            if (mass == 0.0L) continue;
            int d = 27 - r;
            long double p1 = 1.0L - std::ldexp(1.0L, -d);
            long double p2 = 0.0L;
            if (d > 0) {
                long double zero_first = std::ldexp(1.0L, -d);
                p2 = zero_first * p1
                   + (1.0L - zero_first)
                     * (1.0L - std::ldexp(1.0L, 1 - d));
            }
            expected_extra_rank += mass * (p1 + p2);
            b0 += mass * p1;
            b1 += mass * p2;
        }

        // A vertex incident to every selected face-complement edge is omitted
        // from every tested face. Its singleton F(v) is therefore not in the
        // cache after a failed trial. There can be at most two such vertices
        // (only when the graph has one edge). Process cached prior directions
        // first: their expected rank is the rank of (7 - uncacheable) * k
        // independent uniform vectors in the 27-dimensional quotient.
        for (int uncacheable = 0; uncacheable <= 2; ++uncacheable) {
            long double cached[28];
            rank_distribution(27, (7 - uncacheable) * k, cached);
            long double expected_cached_rank = 0.0L;
            for (int r = 0; r <= 27; ++r)
                expected_cached_rank += static_cast<long double>(r) * cached[r];
            a_k[uncacheable][k] =
                81.0L - expected_cached_rank - 3.0L * expected_extra_rank;
        }
        b_k[0][k] = b0;
        b_k[1][k] = b1;
    }
}

static inline int popcount128(__uint128_t x) {
    uint64_t lo = static_cast<uint64_t>(x);
    uint64_t hi = static_cast<uint64_t>(x >> 64);
    return __builtin_popcountll(lo) + __builtin_popcountll(hi);
}

static bool read_lines_u32(const std::string& path, std::vector<uint32_t>& out) {
    std::ifstream in(path);
    if (!in) return false;
    uint64_t value;
    while (in >> value) out.push_back(static_cast<uint32_t>(value));
    return true;
}

static bool read_cover(const std::string& path, std::vector<__uint128_t>& out) {
    std::ifstream in(path);
    if (!in) return false;
    uint64_t lo, hi;
    while (in >> lo >> hi) out.push_back((static_cast<__uint128_t>(hi) << 64) | lo);
    return true;
}

static void make_probes(
    const std::vector<int>& edge_indices,
    const int edge_u[N_FACES],
    const int edge_v[N_FACES],
    int probes[21][2][10][3]
) {
    for (size_t j = 0; j < edge_indices.size(); ++j) {
        int face = edge_indices[j];
        int u = edge_u[face], v = edge_v[face];
        int anchors[5], n = 0;
        for (int x = 0; x < 7; ++x) if (x != u && x != v) anchors[n++] = x;
        int extras[2] = {u, v};
        int pair_index = 0;
        for (int a = 0; a < 5; ++a) {
            for (int b = a + 1; b < 5; ++b) {
                for (int e = 0; e < 2; ++e) {
                    probes[j][e][pair_index][0] = 1 << extras[e];
                    probes[j][e][pair_index][1] = (1 << extras[e]) | (1 << anchors[a]);
                    probes[j][e][pair_index][2] = (1 << extras[e]) | (1 << anchors[b]);
                }
                ++pair_index;
            }
        }
    }
}

static Candidate optimize_graph(
    uint32_t graph_mask,
    const std::vector<uint16_t>& remaining_count,
    const std::vector<__uint128_t>& cover_masks,
    const int edge_u[N_FACES],
    const int edge_v[N_FACES],
    double rank5_probability
) {
    std::vector<int> edges;
    for (int i = 0; i < N_FACES; ++i)
        if (graph_mask & (1u << i)) edges.push_back(i);
    int k = static_cast<int>(edges.size());
    Candidate result;
    result.graph_mask = graph_mask;
    if (k == 0) return result;

    int degree[7] = {};
    for (int face : edges) {
        ++degree[edge_u[face]];
        ++degree[edge_v[face]];
    }
    int uncacheable_vertices = 0;
    for (int value : degree)
        if (value == k) ++uncacheable_vertices;
    if (uncacheable_vertices > 2)
        throw std::runtime_error("impossible number of universally omitted directions");
    result.uncacheable_vertices = uncacheable_vertices;

    int states = 1 << k;
    std::vector<uint32_t> global_mask(states, 0);
    std::vector<__uint128_t> covered(states, 0);
    std::vector<uint8_t> covered_count(states, 0);
    for (int mask = 1; mask < states; ++mask) {
        int bit = __builtin_ctz(static_cast<unsigned>(mask));
        int prev = mask & (mask - 1);
        global_mask[mask] = global_mask[prev] | (1u << edges[bit]);
        covered[mask] = covered[prev] | cover_masks[edges[bit]];
        covered_count[mask] = static_cast<uint8_t>(popcount128(covered[mask]));
    }

    int final_remaining = remaining_count[global_mask[states - 1]];
    int successful_kernels = KERNELS - final_remaining;
    if (successful_kernels <= 0) return result;
    double miss = 1.0 - rank5_probability
        + rank5_probability * static_cast<double>(final_remaining) / KERNELS;

    long double A = 0.0L, beta[2] = {0.0L, 0.0L};
    long double power = 1.0L;
    for (int kfail = 0; kfail <= KMAX; ++kfail) {
        long double weight = (1.0L - miss) * power;
        A += weight * a_k[uncacheable_vertices][kfail];
        beta[0] += weight * b_k[0][kfail];
        beta[1] += weight * b_k[1][kfail];
        power *= miss;
    }
    A += power * 54.0L; // tail k >= KMAX+1; rank deficiency is bounded by < 2^-120

    int probes[21][2][10][3] = {};
    make_probes(edges, edge_u, edge_v, probes);
    std::vector<double> dp(states, std::numeric_limits<double>::infinity());
    std::vector<uint8_t> parent(states, 255);
    dp[0] = 0.0;

    for (int mask = 0; mask < states; ++mask) {
        double base = dp[mask];
        if (!std::isfinite(base)) continue;
        uint32_t gm = global_mask[mask];
        int rem = remaining_count[gm];
        double reach = 1.0 - rank5_probability
            + rank5_probability * static_cast<double>(rem) / KERNELS;
        for (int j = 0; j < k; ++j) {
            int bit = 1 << j;
            if (mask & bit) continue;
            int next = mask | bit;
            int new_queries = static_cast<int>(covered_count[next])
                - static_cast<int>(covered_count[mask]);
            int newly_succeeded = rem - remaining_count[global_mask[next]];
            __uint128_t cm = covered[next];
            int c0 = 3, c1 = 3;
            for (int pair = 0; pair < 10; ++pair) {
                int cost0 = 0, cost1 = 0;
                for (int q = 0; q < 3; ++q) {
                    if (((cm >> probes[j][0][pair][q]) & 1) == 0) ++cost0;
                    if (((cm >> probes[j][1][pair][q]) & 1) == 0) ++cost1;
                }
                c0 = std::min(c0, cost0);
                c1 = std::min(c1, cost1);
            }
            if (c0 > c1) std::swap(c0, c1);
            long double coordinate_transition =
                (1.0L - miss) / successful_kernels
                * newly_succeeded * (beta[0] * c0 + beta[1] * c1);
            double transition = reach * new_queries
                + static_cast<double>(coordinate_transition);
            double candidate = base + transition;
            if (candidate < dp[next]) {
                dp[next] = candidate;
                parent[next] = static_cast<uint8_t>(j);
            }
        }
    }

    int full = states - 1;
    double total = (
        dp[full] - miss + (1.0 - miss) * static_cast<double>(A)
    ) / (1.0 - miss);

    std::vector<int> reverse_order;
    int mask = full;
    while (mask) {
        int j = parent[mask];
        if (j < 0 || j >= k) break;
        reverse_order.push_back(edges[j]);
        mask ^= (1 << j);
    }
    std::reverse(reverse_order.begin(), reverse_order.end());

    // Re-evaluate the chosen order into witness and coordinate components.
    double witness_E = 0.0;
    double coordinate_variable = 0.0;
    mask = 0;
    for (int face : reverse_order) {
        int local = -1;
        for (int j = 0; j < k; ++j) if (edges[j] == face) { local = j; break; }
        int next = mask | (1 << local);
        int rem = remaining_count[global_mask[mask]];
        int rem_next = remaining_count[global_mask[next]];
        double reach = 1.0 - rank5_probability
            + rank5_probability * static_cast<double>(rem) / KERNELS;
        int new_queries = static_cast<int>(covered_count[next])
            - static_cast<int>(covered_count[mask]);
        int newly_succeeded = rem - rem_next;
        __uint128_t cm = covered[next];
        int c0 = 3, c1 = 3;
        for (int pair = 0; pair < 10; ++pair) {
            int cost0 = 0, cost1 = 0;
            for (int q = 0; q < 3; ++q) {
                if (((cm >> probes[local][0][pair][q]) & 1) == 0) ++cost0;
                if (((cm >> probes[local][1][pair][q]) & 1) == 0) ++cost1;
            }
            c0 = std::min(c0, cost0);
            c1 = std::min(c1, cost1);
        }
        witness_E += reach * new_queries;
        if (c0 > c1) std::swap(c0, c1);
        coordinate_variable += static_cast<double>(
            static_cast<long double>(newly_succeeded) / successful_kernels
            * (beta[0] * c0 + beta[1] * c1)
        );
        mask = next;
    }

    result.total = total;
    result.witness = (witness_E - miss) / (1.0 - miss);
    result.coordinate = static_cast<double>(A) + coordinate_variable;
    result.miss = miss;
    result.remaining = final_remaining;
    result.order_edges = std::move(reverse_order);
    return result;
}

int main(int argc, char** argv) {
    std::string base = argc > 1 ? argv[1] : "sims/data/m7-fullpath";
    std::vector<uint32_t> graph_masks, fail_patterns;
    std::vector<__uint128_t> cover_masks;
    if (!read_lines_u32(base + "/m7_graph_masks.txt", graph_masks)
        || !read_lines_u32(base + "/m7_kernel_fail_patterns.txt", fail_patterns)
        || !read_cover(base + "/m7_cover_masks.txt", cover_masks)) {
        std::cerr << "failed to read m7 data files from " << base << "\n";
        return 2;
    }
    if (graph_masks.size() != 1044 || fail_patterns.size() != KERNELS
        || cover_masks.size() != N_FACES) {
        std::cerr << "unexpected data dimensions\n";
        return 3;
    }

    std::vector<uint16_t> remaining_count(GLOBAL_STATES, 0);
    for (uint32_t pattern : fail_patterns) ++remaining_count[pattern];
    for (int bit = 0; bit < N_FACES; ++bit) {
        uint32_t b = 1u << bit;
        for (uint32_t mask = 0; mask < GLOBAL_STATES; ++mask) {
            if ((mask & b) == 0)
                remaining_count[mask] += remaining_count[mask | b];
        }
    }
    if (remaining_count[0] != KERNELS) {
        std::cerr << "superset zeta transform check failed\n";
        return 4;
    }

    int edge_u[N_FACES], edge_v[N_FACES], edge = 0;
    for (int u = 0; u < 7; ++u)
        for (int v = u + 1; v < 7; ++v) {
            edge_u[edge] = u;
            edge_v[edge] = v;
            ++edge;
        }

    precompute_rank_coefficients();
    const double p = 26043255.0 / 33554432.0;

    Candidate best_global;
    std::array<Candidate, 22> best_by_k;
    std::array<Candidate, 22> second_by_k;
    std::array<int, 22> graphs_by_k = {};
    uint64_t total_states = 0;
    uint64_t total_transitions = 0;
    for (uint32_t graph_mask : graph_masks) {
        int k = __builtin_popcount(graph_mask);
        ++graphs_by_k[k];
        total_states += (1ULL << k);
        if (k > 0) total_transitions += static_cast<uint64_t>(k) * (1ULL << (k - 1));
        Candidate candidate = optimize_graph(
            graph_mask, remaining_count, cover_masks, edge_u, edge_v, p
        );
        if (candidate.total < best_by_k[k].total) {
            second_by_k[k] = best_by_k[k];
            best_by_k[k] = candidate;
        } else if (candidate.total < second_by_k[k].total) {
            second_by_k[k] = candidate;
        }
        if (candidate.total < best_global.total)
            best_global = candidate;
    }

    std::cout << std::setprecision(15);
    std::cout << "graphs=" << graph_masks.size()
              << " states=" << total_states
              << " transitions=" << total_transitions
              << " rank5_probability=" << p << "\n";
    for (int k = 1; k <= 21; ++k) {
        if (graphs_by_k[k] == 0) continue;
        const Candidate& c = best_by_k[k];
        std::cout << "k=" << k << " graph_reps=" << graphs_by_k[k]
                  << " total=" << c.total << " witness=" << c.witness
                  << " coordinate=" << c.coordinate << " miss=" << c.miss
                  << " remaining=" << c.remaining
                  << " uncacheable_vertices=" << c.uncacheable_vertices
                  << " graph_mask=" << c.graph_mask << " order=";
        for (size_t i = 0; i < c.order_edges.size(); ++i) {
            if (i) std::cout << ",";
            std::cout << c.order_edges[i];
        }
        std::cout << "\n";
        const Candidate& s = second_by_k[k];
        if (std::isfinite(s.total)) {
            std::cout << "  second total=" << s.total
                      << " witness=" << s.witness
                      << " coordinate=" << s.coordinate
                      << " graph_mask=" << s.graph_mask << "\n";
        }
    }
    std::cout << "GLOBAL total=" << best_global.total
              << " witness=" << best_global.witness
              << " coordinate=" << best_global.coordinate
              << " miss=" << best_global.miss
              << " remaining=" << best_global.remaining
              << " k=" << best_global.order_edges.size()
              << " graph_mask=" << best_global.graph_mask
              << " order=";
    for (size_t i = 0; i < best_global.order_edges.size(); ++i) {
        if (i) std::cout << ",";
        std::cout << best_global.order_edges[i];
    }
    std::cout << "\n";
    return 0;
}
