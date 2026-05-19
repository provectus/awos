# Technical Considerations — Health Check Endpoint

Status: In Progress

## Tech Stack

- **Language:** Python 3.12.
- **Test runner:** `pytest`.

## File Layout

- `src/health.py` — module exposing the `health_check` function.
- `tests/test_health.py` — pytest module covering the function.

## API

- `health_check() -> str` — pure function, returns `'ok'`. No arguments, no side effects.

## Testing Approach

- One pytest module with a single assertion: `assert health_check() == 'ok'`.
- Run via `pytest tests/test_health.py` from the project root.
