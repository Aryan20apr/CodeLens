---
name: concurrency
description: Use this skill when reviewing code changes involving asynchronous race conditions, distributed cache invalidation, idempotency, event consumers, and state synchronization.
---

# Concurrency & Idempotency Audit Skill

## Overview
This skill guides the investigation of concurrent execution flaws, race conditions, distributed cache invalidations, and idempotency vulnerabilities in asynchronous and distributed architectures.

## Investigation Methodology

### 1. Asynchronous Race Conditions
* **Check-Then-Act Flaws:** Identify patterns where code checks a condition (e.g., `if (!userExists)`) and then performs an action asynchronously without transactional isolation or unique constraints.
* **Shared Mutable State:** Look for global, singleton, or module-scoped variables being mutated across concurrent request handlers without synchronization.
* **Promise Handling & Unhandled Rejections:** Check for floating promises (missing `await` or `.catch()`) that can cause unhandled rejections or out-of-order state mutations.

### 2. Idempotency & Queue Processing
* **Duplicate Event / Message Processing:** Verify that background workers (BullMQ, Kafka, RabbitMQ) and webhook handlers can safely process the same event multiple times without duplicate side effects (double charges, duplicate records).
* **Distributed Locking:** Ensure distributed locks (Redlock, DB row locks) have appropriate timeouts, release on failure, and are owned exclusively by the executing process.

### 3. Distributed Cache Invalidation
* **Cache Stampede & Invalidation Timing:** Verify that cache invalidation occurs *after* the authoritative database transaction successfully commits, not before.
* **Consistency under Concurrent Writes:** Check whether concurrent writes to cached entities can result in stale cache overwriting newer database records.

## Output Criteria
When reporting concurrency findings:
* Specify file path and line number.
* Assign severity: `HIGH` (data corruption, double billing, race conditions on financial or auth records), `MEDIUM` (cache inconsistency under high concurrency, missing retry handling), `LOW` (minor lock TTL tuning).
* Clearly describe the concurrent sequence of events that triggers the defect.
* Suggest an atomic operation, unique constraint, or lock-based remediation.
