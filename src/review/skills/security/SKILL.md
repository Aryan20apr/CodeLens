---
name: security
description: Use this skill when reviewing code changes for authentication, authorization bypass, token handling, input sanitization, injection vulnerabilities, and secret leakage.
---

# Security Audit Skill

## Overview
This skill guides the investigation of security-critical code changes in pull requests. Focus on identifying exploitable vulnerabilities, privilege escalation, authentication/authorization bypasses, and data exposure.

## Investigation Methodology

### 1. Authentication & Authorization Boundaries
* **Route & Endpoint Exposure:** Check if newly added or modified endpoints are missing authentication guards (e.g., `@UseGuards(JwtAuthGuard)` or framework equivalents) or if `@Public()` is inappropriately applied.
* **Role & Permission Enforcements:** Trace whether role-based access control (RBAC) or tenant-scoping is enforced at the service/database layer, not just the presentation layer.
* **IDOR (Insecure Direct Object Reference):** Verify that entity lookups by ID (e.g. `userId`, `organizationId`, `documentId`) validate that the authenticated caller owns or has rights to access that entity.

### 2. Token & Credential Handling
* **Signature & Expiry Verification:** Verify that JWTs or session tokens strictly validate expiration (`exp`), algorithm (`alg`), and signature integrity. Never accept unverified decodes for authentication decisions.
* **Hardcoded Secrets & Sensitive Data:** Check for hardcoded API keys, tokens, passwords, or credentials in diffs or configuration files.
* **PII & Credential Logging:** Ensure passwords, tokens, API secrets, and sensitive personal data are never printed to console logs or error messages.

### 3. Input Sanitization & Injection
* **SQL / NoSQL Injection:** Ensure all database queries use parameterized statements, ORM query builders, or safe escape mechanisms. Check raw queries (`$queryRaw`, SQL template strings) for unsanitized interpolations.
* **Command Injection & SSRF:** Validate and sanitize any user-controlled input passed to system commands, process execution, or outbound HTTP fetch calls.
* **Path Traversal:** Ensure file paths derived from user input are strictly resolved and validated against an allowed base directory.

## Output Criteria
When reporting security findings:
* Specify the exact file path and line number.
* Assign severity: `CRITICAL` (remote execution, auth bypass, secret leak), `HIGH` (IDOR, injection), `MEDIUM` (missing rate limit, overly permissive CORS), `LOW` (minor header hardening).
* Provide a concrete attack scenario or failure mode.
* Provide an actionable, minimal remediation snippet.
