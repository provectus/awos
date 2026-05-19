# Functional Specification — Health Check Endpoint

Status: In Progress

## Overview

Expose a tiny health-check entry point so operators and load balancers can confirm the service is alive without exercising any business logic.

## Goals

- A single function in the codebase reports the service is up.
- The function is importable from a stable module path.
- Calling the function returns a predictable string that monitoring tools can match on.

## Acceptance Criteria

- [ ] A file exists at `src/health.py` containing a function named `health_check`.
- [ ] Calling `health_check()` returns the string `'ok'`.
- [ ] A pytest module at `tests/test_health.py` asserts the function's return value, and `pytest tests/test_health.py` passes.

## Out of Scope

- Wiring the function into an HTTP route (that lands in a follow-up slice).
- Dependency checks (database, downstream services).
