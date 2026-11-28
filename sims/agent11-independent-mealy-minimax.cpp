#include <algorithm>
#include <array>
#include <cassert>
#include <cstdint>
#include <iostream>
#include <numeric>
#include <string>
#include <unordered_map>
#include <vector>

#ifdef NDEBUG
#error "Compile this verifier with assertions enabled (do not define NDEBUG)."
#endif

namespace {
constexpr int kModels = 46656;
constexpr int kStates = kModels * 3;
constexpr int kMaxBudget = 24;

struct Corpus {
  std::vector<uint8_t> next0, next1, out0, out1;
};
struct Quotient {
  int count = 0;
  std::vector<uint16_t> state_class, roots, next0, next1;
  std::vector<uint8_t> out0, out1;
};

Corpus enumerate_models() {
  Corpus c;
  c.next0.resize(kStates); c.next1.resize(kStates);
  c.out0.resize(kStates); c.out1.resize(kStates);
  for (int model = 0; model < kModels; ++model) {
    int code = model;
    for (int state = 0; state < 3; ++state) {
      const int i = model * 3 + state;
      const int d0 = code % 6; code /= 6;
      const int d1 = code % 6; code /= 6;
      c.next0[i] = static_cast<uint8_t>(d0 / 2);
      c.out0[i] = static_cast<uint8_t>(d0 % 2);
      c.next1[i] = static_cast<uint8_t>(d1 / 2);
      c.out1[i] = static_cast<uint8_t>(d1 % 2);
    }
  }
  return c;
}

Quotient refine(const Corpus& c) {
  std::vector<uint16_t> cls(kStates), refined(kStates);
  for (int i = 0; i < kStates; ++i)
    cls[i] = static_cast<uint16_t>(c.out0[i] + 2 * c.out1[i]);
  int class_count = 4;
  struct Signature { uint32_t value; int state; };
  std::vector<Signature> signatures(kStates);
  bool stable = false;
  for (int round = 0; round < 20; ++round) {
    for (int i = 0; i < kStates; ++i) {
      const int base = (i / 3) * 3;
      const uint16_t n0 = cls[base + c.next0[i]];
      const uint16_t n1 = cls[base + c.next1[i]];
      const uint32_t sig = static_cast<uint32_t>(c.out0[i]) |
        (static_cast<uint32_t>(n0) << 1) |
        (static_cast<uint32_t>(c.out1[i]) << 15) |
        (static_cast<uint32_t>(n1) << 16);
      signatures[i] = {sig, i};
    }
    std::sort(signatures.begin(), signatures.end(),
      [](const Signature& a, const Signature& b) {
        return a.value != b.value ? a.value < b.value : a.state < b.state;
      });
    int next_count = 0;
    uint32_t prior = UINT32_MAX;
    for (const auto& item : signatures) {
      if (next_count == 0 || item.value != prior) {
        prior = item.value;
        ++next_count;
      }
      refined[item.state] = static_cast<uint16_t>(next_count - 1);
    }
    // Sorted signatures may split old classes but must never merge them.
    std::vector<int32_t> old_to_new(class_count, -1);
    std::vector<int32_t> new_to_old(next_count, -1);
    bool split = false;
    for (int i = 0; i < kStates; ++i) {
      const int old_id = cls[i], new_id = refined[i];
      if (old_to_new[old_id] == -1) old_to_new[old_id] = new_id;
      else if (old_to_new[old_id] != new_id) split = true;
      if (new_to_old[new_id] == -1) new_to_old[new_id] = old_id;
      else assert(new_to_old[new_id] == old_id);
    }
    cls.swap(refined);
    if (next_count == class_count) {
      assert(!split);
      stable = true;
      class_count = next_count;
      break;
    }
    class_count = next_count;
  }
  assert(stable);

  Quotient q;
  q.count = class_count;
  q.state_class = std::move(cls);
  q.out0.resize(class_count); q.out1.resize(class_count);
  q.next0.resize(class_count); q.next1.resize(class_count);
  std::vector<uint8_t> seen(class_count, 0);
  for (int i = 0; i < kStates; ++i) {
    const int base = (i / 3) * 3;
    const uint16_t id = q.state_class[i];
    const uint16_t n0 = q.state_class[base + c.next0[i]];
    const uint16_t n1 = q.state_class[base + c.next1[i]];
    if (!seen[id]) {
      seen[id] = 1;
      q.out0[id] = c.out0[i]; q.out1[id] = c.out1[i];
      q.next0[id] = n0; q.next1[id] = n1;
    } else {
      assert(q.out0[id] == c.out0[i] && q.out1[id] == c.out1[i]);
      assert(q.next0[id] == n0 && q.next1[id] == n1);
    }
  }
  for (int model = 0; model < kModels; ++model)
    q.roots.push_back(q.state_class[model * 3]);
  std::sort(q.roots.begin(), q.roots.end());
  q.roots.erase(std::unique(q.roots.begin(), q.roots.end()), q.roots.end());
  return q;
}

// Exact byte string; unordered_map resolves hash collisions with string equality.
std::string encode(const std::vector<uint16_t>& belief) {
  std::string key(belief.size() * 2, '\\0');
  for (size_t i = 0; i < belief.size(); ++i) {
    key[2 * i] = static_cast<char>(belief[i] & 0xff);
    key[2 * i + 1] = static_cast<char>(belief[i] >> 8);
  }
  return key;
}

std::vector<uint16_t> successor(const Quotient& q,
    const std::vector<uint16_t>& belief, int input, int observed) {
  std::vector<uint16_t> child;
  child.reserve(belief.size());
  for (uint16_t id : belief) {
    const uint8_t out = input == 0 ? q.out0[id] : q.out1[id];
    if (out == observed)
      child.push_back(input == 0 ? q.next0[id] : q.next1[id]);
  }
  std::sort(child.begin(), child.end());
  child.erase(std::unique(child.begin(), child.end()), child.end());
  return child;
}

struct PolicyNode { uint8_t budget, input; int32_t children[2] = {-1, -1}; };
struct Counters { uint64_t visited = 0, hits = 0; };

class Solver {
 public:
  explicit Solver(const Quotient& q) : q_(q) {
    for (auto& m : memo_) m.max_load_factor(0.8f);
  }
  bool can_win(const std::vector<uint16_t>& belief, int budget) {
    if (belief.size() == 1) return true;
    if (budget == 0) return false;
    std::string key = encode(belief);
    auto& table = memo_[budget];
    auto it = table.find(key);
    if (it != table.end()) { ++counters_.hits; return it->second >= 0; }
    ++counters_.visited;
    for (int input = 0; input < 2; ++input) {
      auto zero = successor(q_, belief, input, 0);
      auto one = successor(q_, belief, input, 1);
      if (!zero.empty() && !can_win(zero, budget - 1)) continue;
      if (!one.empty() && !can_win(one, budget - 1)) continue;
      table.emplace(std::move(key), static_cast<int8_t>(input));
      return true;
    }
    table.emplace(std::move(key), static_cast<int8_t>(-1));
    return false;
  }
  Counters counters() const { return counters_; }
  size_t memo_entries() const {
    size_t total = 0;
    for (const auto& m : memo_) total += m.size();
    return total;
  }
  int8_t action(const std::vector<uint16_t>& belief, int budget) const {
    const auto key = encode(belief);
    auto it = memo_[budget].find(key);
    assert(it != memo_[budget].end());
    return it->second;
  }
  int verify_policy(const std::vector<uint16_t>& belief, int budget, int depth,
      int& leaves, int& max_depth, std::vector<PolicyNode>& policy,
      std::unordered_map<std::string, int>& index) {
    if (belief.size() == 1) {
      ++leaves; max_depth = std::max(max_depth, depth);
      return -static_cast<int>(belief[0]) - 2;
    }
    const int8_t input = action(belief, budget);
    assert(input == 0 || input == 1);
    std::string state_key(1, static_cast<char>(budget));
    state_key += encode(belief);
    auto found = index.find(state_key);
    if (found != index.end()) return found->second;
    const int id = static_cast<int>(policy.size());
    index.emplace(std::move(state_key), id);
    policy.push_back(PolicyNode{static_cast<uint8_t>(budget),
                                static_cast<uint8_t>(input), {-1, -1}});
    for (int observed = 0; observed < 2; ++observed) {
      auto child = successor(q_, belief, input, observed);
      if (!child.empty()) {
        assert(can_win(child, budget - 1));
        const int child_id = verify_policy(child, budget - 1, depth + 1,
          leaves, max_depth, policy, index);
        policy[id].children[observed] = child_id;
      }
    }
    return id;
  }
 private:
  const Quotient& q_;
  std::array<std::unordered_map<std::string, int8_t>, kMaxBudget + 1> memo_;
  Counters counters_;
};

void replay(const Corpus& c, const Quotient& q,
    const std::vector<PolicyNode>& policy, int root,
    int& min_queries, int& max_queries, uint64_t& total_queries,
    std::array<uint64_t, 25>& histogram) {
  min_queries = 25; max_queries = 0; total_queries = 0;
  for (int model = 0; model < kModels; ++model) {
    int state = 0, node = root, queries = 0;
    while (node >= 0) {
      const PolicyNode& p = policy[node];
      const int i = model * 3 + state;
      const int observed = p.input == 0 ? c.out0[i] : c.out1[i];
      state = p.input == 0 ? c.next0[i] : c.next1[i];
      const int child = p.children[observed];
      ++queries;
      if (child <= -2) {
        assert(q.state_class[model * 3 + state] == -child - 2);
        break;
      }
      assert(child >= 0);
      node = child;
    }
    assert(queries <= 24);
    ++histogram[queries];
    min_queries = std::min(min_queries, queries);
    max_queries = std::max(max_queries, queries);
    total_queries += static_cast<uint64_t>(queries);
  }
}
} // namespace

int main() {
  const Corpus corpus = enumerate_models();
  const Quotient q = refine(corpus);
  std::cout << "quotient classes=" << q.count
            << " initial classes=" << q.roots.size() << "\\n";
  assert(q.count == 11500);
  assert(q.roots.size() == static_cast<size_t>(q.count));

  Solver solver(q);
  const bool win23 = solver.can_win(q.roots, 23);
  const Counters c23 = solver.counters();
  std::cout << "budget23 win=" << win23 << " visited=" << c23.visited
            << " hits=" << c23.hits << " memo=" << solver.memo_entries() << "\\n";
  assert(!win23);
  const bool win24 = solver.can_win(q.roots, 24);
  const Counters c24 = solver.counters();
  std::cout << "budget24 win=" << win24 << " visited=" << c24.visited
            << " hits=" << c24.hits << " memo=" << solver.memo_entries() << "\\n";
  assert(win24);
  assert(c23.visited == 2488929 && c23.hits == 914343);
  assert(c24.visited == 4443360 && c24.hits == 1578390);

  std::vector<PolicyNode> policy;
  std::unordered_map<std::string, int> policy_index;
  int leaves = 0, max_depth = 0;
  const int root = solver.verify_policy(q.roots, 24, 0, leaves,
    max_depth, policy, policy_index);
  assert(root == 0 && policy.size() == 13329);
  assert(leaves == 6628 && max_depth == 24);

  std::array<uint64_t, 25> histogram{};
  int min_queries = 0, max_queries = 0;
  uint64_t total_queries = 0;
  replay(corpus, q, policy, root, min_queries, max_queries,
    total_queries, histogram);
  assert(max_queries == 24);
  assert(std::accumulate(histogram.begin(), histogram.end(), uint64_t{0}) == kModels);
  std::cout << "policy nodes=" << policy.size() << " terminal leaves=" << leaves
            << " max path=" << max_depth << "\\n";
  std::cout << "replay models=" << kModels << " min=" << min_queries
            << " max=" << max_queries << " mean="
            << static_cast<double>(total_queries) / kModels << "\\n";
  std::cout << "histogram=";
  for (int i = 0; i <= 24; ++i)
    if (histogram[i]) std::cout << i << ':' << histogram[i] << ' ';
  std::cout << "\\n";
}
