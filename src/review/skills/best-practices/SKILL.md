---
name: best-practices
description: Use this skill when reviewing code changes for error handling, API contract compatibility, architectural patterns, input validation, and typing integrity.
---

# Best Practices & Code Quality Skill

## Overview
This skill guides the evaluation of software design, error resilience, contract backward compatibility, type safety, and framework conventions.

## Investigation Methodology

### 1. Error Handling & Resilience
* **Swallowed Exceptions:** Detect empty `catch` blocks or catches that log but fail to rethrow or return appropriate error responses, hiding fatal failures.
* **Granular HTTP Status Codes:** Ensure web controllers return meaningful HTTP status codes (400 for bad input, 401 for unauthenticated, 403 for unauthorized, 404 for missing resources) instead of generic 500 errors.
* **Resource Cleanup in Failure Paths:** Ensure open file handles, database connections, or socket streams are closed in `finally` blocks when exceptions occur.

### 2. Contract & API Backward Compatibility
* **Breaking API Changes:** Check if existing API response fields were renamed, types changed, or required request fields added without versioning or fallback handling.
* **Schema Evolution:** For database entities and events, ensure newly added fields are optional or have sensible default values so existing records and consumers do not fail deserialization.

### 3. Type Safety & Validation
* **Runtime Validation:** Ensure DTOs and external inputs (webhooks, query parameters, payloads) are validated at runtime using schemas (Zod, class-validator) rather than trusting compile-time types alone.
* **Type Assertions & `any` Leaks:** Flag unjustified uses of `any`, `@ts-ignore`, or dangerous type assertions (`as unknown as T`) that bypass TypeScript's type checker.

## Output Criteria
When reporting code quality findings:
* Specify exact file path and line number.
* Assign severity: `MEDIUM` (breaking API contract, swallowed critical error), `LOW` (loose typing, missing DTO validation, convention inconsistency).
* Provide clear rationale explaining maintainability or reliability impact.
* Provide the idiomatic refactored code.
