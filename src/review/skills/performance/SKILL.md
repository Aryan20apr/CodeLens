---
name: performance
description: Use this skill when reviewing code changes for N+1 database queries, unindexed lookups, unbounded in-memory allocations, memory leaks, and inefficient algorithms.
---

# Performance Audit Skill

## Overview
This skill guides the detection of performance regressions, resource exhaustion risks, and scalability bottlenecks in pull requests.

## Investigation Methodology

### 1. Database & ORM Query Efficiency
* **N+1 Query Detection:** Inspect loops (`for`, `map`, `forEach`) that execute database queries or repository calls per iteration. Ensure relational data is eagerly fetched or batch-queried (`include`, `select`, `IN (...)`).
* **Unbounded Query Results:** Check for queries lacking pagination or `limit`/`take` clauses on potentially unbounded collections.
* **Unindexed Filters & Joins:** Check `WHERE` clauses and join conditions against common database indexing patterns. Avoid filtering on non-indexed text or JSON columns in high-throughput query paths.
* **Connection Pool Contention:** Ensure database transactions are kept short. Avoid long network calls or third-party API fetches inside active transactions.

### 2. Memory & Event Loop Saturation
* **Unbounded In-Memory Buffers:** Check for reading entire large files or streams into memory arrays at once instead of streaming or chunking.
* **Event Listener / Subscription Leaks:** Ensure subscriptions, timers (`setInterval`), or event emitters are properly cleaned up upon lifecycle teardown.
* **Synchronous CPU Blocking:** Check for heavy synchronous calculations, cryptographic operations, or large JSON stringifications blocking the single-threaded Node.js event loop.

### 3. Caching & Reuse
* **Cache Key Correctness:** Ensure cache keys include all parameter variants to prevent cross-tenant or cross-user cache contamination.
* **TTL & Eviction:** Verify that cache entries have appropriate TTLs and do not grow unboundedly in memory stores.

## Output Criteria
When reporting performance findings:
* Cite the exact file path and line number.
* Assign severity: `HIGH` (N+1 queries in hot paths, event loop blocking), `MEDIUM` (missing pagination, unindexed queries on large tables), `LOW` (minor allocations, sub-optimal loops).
* Explain the performance impact at scale.
* Suggest a concrete batching or caching alternative.
