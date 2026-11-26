#!/usr/bin/env node
"use strict";

/**
 * Local lower-bound microbenchmark for a stateful Mealy step over JavaScript
 * versus loopback HTTP RPC. This is a synthetic harness, not a production
 * SCO benchmark; it isolates the per-operation transport/serialization cost.
 */
const http = require("node:http");
const os = require("node:os");
const { performance } = require("node:perf_hooks");

const TRANSITIONS = [
  [1, 2],
  [3, 0],
  [0, 3],
  [2, 1],
];
const OUTPUTS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [0, 0],
];

function transition(state, symbol) {
  const output = OUTPUTS[state][symbol];
  const nextState = TRANSITIONS[state][symbol];
  return { nextState, output };
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
}

function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((a, b) => a + b, 0);
  return {
    count: values.length,
    mean_ms: sum / values.length,
    p50_ms: percentile(sorted, 0.50),
    p95_ms: percentile(sorted, 0.95),
    max_ms: sorted[sorted.length - 1],
  };
}

function runLocal(iterations) {
  let state = 0;
  let checksum = 0;
  const start = performance.now();
  for (let i = 0; i < iterations; i += 1) {
    const result = transition(state, i & 1);
    state = result.nextState;
    checksum ^= result.output;
  }
  const elapsedMs = performance.now() - start;
  return {
    iterations,
    elapsed_ms: elapsedMs,
    ns_per_step: (elapsedMs * 1e6) / iterations,
    checksum,
  };
}

async function main() {
  const localIterations = 10_000_000;
  const warmupIterations = 2_000_000;
  const singleStepsPerTrial = 1000;
  const trials = 5;

  for (let i = 0; i < 3; i += 1) runLocal(warmupIterations);
  const localSamples = Array.from({ length: 7 }, () => runLocal(localIterations));
  const localNs = percentile(localSamples.map((x) => x.ns_per_step), 0.50);

  let serverState = 0;
  const server = http.createServer((request, response) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      try {
        const payload = body ? JSON.parse(body) : {};
        response.setHeader("Content-Type", "application/json");
        if (request.url === "/reset") {
          serverState = 0;
          response.writeHead(200);
          response.end(JSON.stringify({ ok: true }));
          return;
        }
        if (request.url === "/step") {
          const result = transition(serverState, payload.symbol);
          serverState = result.nextState;
          response.writeHead(200);
          response.end(JSON.stringify({ output: result.output }));
          return;
        }
        if (request.url === "/batch") {
          const outputs = [];
          for (const symbol of payload.symbols) {
            const result = transition(serverState, symbol);
            serverState = result.nextState;
            outputs.push(result.output);
          }
          response.writeHead(200);
          response.end(JSON.stringify({ outputs }));
          return;
        }
        response.writeHead(404);
        response.end(JSON.stringify({ error: "not_found" }));
      } catch (error) {
        response.writeHead(400);
        response.end(JSON.stringify({ error: String(error) }));
      }
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  async function post(path, payload) {
    const response = await fetch(base + path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    return response.json();
  }

  const singleLatencies = [];
  for (let trial = 0; trial < trials; trial += 1) {
    await post("/reset", {});
    for (let i = 0; i < singleStepsPerTrial; i += 1) {
      const start = performance.now();
      await post("/step", { symbol: i & 1 });
      singleLatencies.push(performance.now() - start);
    }
  }

  const batchSizes = [10, 100, 1000];
  const batchResults = [];
  for (const batchSize of batchSizes) {
    const symbols = Array.from({ length: batchSize }, (_, i) => i & 1);
    const requestLatencies = [];
    for (let trial = 0; trial < trials; trial += 1) {
      await post("/reset", {});
      const start = performance.now();
      const result = await post("/batch", { symbols });
      const elapsedMs = performance.now() - start;
      if (result.outputs.length !== batchSize) {
        throw new Error(`batch output length mismatch for ${batchSize}`);
      }
      requestLatencies.push(elapsedMs);
    }
    const requestStats = summarize(requestLatencies);
    const meanPerStepNs = (requestStats.mean_ms * 1e6) / batchSize;
    batchResults.push({
      batch_size: batchSize,
      request_latency: requestStats,
      mean_ns_per_step: meanPerStepNs,
      ratio_vs_local_step: meanPerStepNs / localNs,
    });
  }

  const singleStats = summarize(singleLatencies);
  const singleMeanNs = singleStats.mean_ms * 1e6;
  const result = {
    benchmark: "stateful-mealy-step-local-vs-loopback-http",
    note: "Synthetic lower-bound microbenchmark; same-process loopback HTTP, no TLS, no cookies, no production SCO code.",
    runtime: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      cpu_model: os.cpus()[0]?.model || "unknown",
    },
    local_step: {
      iterations_per_trial: localIterations,
      trials: localSamples.length,
      ns_per_step_median: localNs,
      ns_per_step_min: Math.min(...localSamples.map((x) => x.ns_per_step)),
      ns_per_step_max: Math.max(...localSamples.map((x) => x.ns_per_step)),
    },
    loopback_http_single_step: {
      steps_per_trial: singleStepsPerTrial,
      trials,
      latency_ms: singleStats,
      mean_ns_per_step: singleMeanNs,
      ratio_vs_local_step: singleMeanNs / localNs,
    },
    loopback_http_batch: batchResults,
  };

  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

main().catch((error) => {
  process.stderr.write(String(error && error.stack ? error.stack : error) + "\n");
  process.exitCode = 1;
});
