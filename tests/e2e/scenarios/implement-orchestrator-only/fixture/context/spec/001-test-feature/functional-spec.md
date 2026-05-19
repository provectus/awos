# Functional Specification — Health Check Endpoint

Status: In Progress

## Overview

Expose a tiny health-check entry point so operators and load balancers can confirm the service is alive without exercising any business logic. This is the smallest meaningful slice we can ship to validate the deployment pipeline.

## Goals

- A single function in the codebase reports the service is up.
- The function is importable from a stable module path.
- Calling the function returns a predictable string that monitoring tools can match on.

## User Stories

1. **As an operator**, I want a quick way to confirm the service is alive so I can wire it into uptime monitors without touching real endpoints.

## Acceptance Criteria

- A file exists at `src/health.py` containing a function named `health_check`.
- Calling `health_check()` returns the string `'ok'`.
- The function is callable with no arguments and has no side effects.

## Out of Scope

- Wiring the function into an HTTP route (that lands in a follow-up slice).
- Dependency checks (database, downstream services).
- Authentication, rate-limiting, or metrics.
