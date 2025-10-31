# Testing Strategies in AWOS

The **AWOS** framework does not prescribe a single testing methodology. Instead, it provides a flexible structure where teams can adopt the testing approach that best fits their project, culture, and goals.

## Principles

- **Non-prescriptive**: AWOS does not mandate TDD, BDD, or any specific testing strategy
- **Team choice**: Select the approach that works for your project and team
- **Lightweight adoption**: Keep testing strategies simple and easy to follow
- **Integration-friendly**: Testing fits naturally into the AWOS workflow

## Common Testing Approaches

Teams using AWOS typically adopt one or more of these strategies:

- **Test-Driven Development (TDD)**: Write tests before implementation code
- **Behavior-Driven Development (BDD)**: Define behavior through scenarios and examples
- **Integration Testing**: Verify components work correctly together
- **End-to-End Testing**: Test complete user workflows
- **Unit Testing**: Test individual functions and modules in isolation
- **Manual Testing**: QA review and exploratory testing

**Mix and match**: Most teams combine approaches (e.g., unit tests for critical logic, E2E tests for user flows, manual QA for final validation).

## Testing in the AWOS Workflow

Testing primarily fits into two stages of the AWOS process:

### 1. `/awos:tasks` - Define Testing Requirements

When breaking down specs into tasks, include testing expectations:

```markdown
- [ ] **Slice 1: Display user avatar on profile page**
  - [ ] Add ProfileAvatar component with placeholder
  - [ ] Write unit tests for ProfileAvatar component
  - [ ] Add component to profile page
  - [ ] Verify avatar displays correctly (manual QA)
```

### 2. `/awos:implement` - Execute Tests During Implementation

The implementation agent delegates coding to subagents, who should follow your team's testing conventions.

## Customizing Commands for Your Testing Strategy

AWOS commands are markdown files you can customize. Add testing instructions to `.claude/commands/awos/implement.md`:

### Example: Adding TDD Instructions

Edit `.claude/commands/awos/implement.md` and add to the **PROCESS** section:

```markdown
### Step 3.5: Ensure Test-First Development

Before delegating to the subagent, include these testing requirements:

1. **Test First**: The subagent must write failing tests before implementation code
2. **Test Coverage**: All new functions must have corresponding unit tests
3. **Run Tests**: Tests must pass before marking the task complete
4. **Test Location**: Follow the project convention (e.g., `__tests__/` or `*.test.js`)

Update your delegation prompt to include:
"This task follows TDD. Write failing tests first, then implement code to make them pass."
```

### Example: Adding E2E Test Requirements

```markdown
### Step 3.5: Include E2E Testing

For tasks involving user-facing features:

1. **E2E Scenarios**: Subagent must add Playwright/Cypress tests for user workflows
2. **Test Data**: Create necessary test fixtures and seed data
3. **CI Integration**: Tests must run in the CI pipeline

Include in delegation prompt:
"Add E2E tests for this feature using Playwright, covering the happy path and error cases."
```

## Team Documentation Hook

Document your testing strategy in your project's AI agent configuration file (e.g., `claude.md`, `.github/copilot-instructions.md`, or `.cursor/instructions.md`).

### Ready-to-Copy Template

Add this section to your agent configuration file:

```markdown
## Testing Strategy

Our project follows these testing practices:

### Testing Approach
- [ ] TDD (write tests first)
- [ ] BDD (behavior-driven scenarios)  
- [ ] Unit tests for business logic
- [ ] Integration tests for APIs
- [ ] E2E tests for critical user flows
- [ ] Manual QA before releases

### Test Requirements
- **Coverage target**: [e.g., 80% for new code]
- **Test frameworks**: [e.g., Jest, Playwright, pytest]
- **Test location**: [e.g., `__tests__/` directory, co-located `*.test.js`]
- **Naming convention**: [e.g., `describe()` blocks per component/function]

### When to Write Tests
- [ ] Before implementation (TDD)
- [ ] After implementation (TAD)
- [ ] For bug fixes (regression tests)
- [ ] For critical business logic only
- [ ] For all public APIs

### CI/CD Integration
- Tests run on: [e.g., every commit, PR only, nightly]
- Required pass rate: [e.g., 100%, allows failures in experimental features]
- Performance benchmarks: [e.g., E2E tests must complete in <5 minutes]

### Notes
[Add any project-specific testing context, exceptions, or guidelines here]
```

**Keep this updated** as your testing strategy evolves with the project.

## CI/CD Integration

Your testing strategy should align with your CI/CD pipeline:

- **Automation**: Tests defined in tasks should run automatically in CI
- **Gates**: Decide which test failures block merges (e.g., unit tests must pass, E2E can be flaky)
- **Feedback loops**: Fast tests run on every commit, slower E2E tests run on PRs or nightly
- **Coverage reporting**: Integrate coverage tools if you track metrics

The `/awos:tasks` command creates runnable, testable increments. Ensure your CI pipeline validates these increments as they're completed.

---

**Remember**: The best testing strategy is the one your team will actually follow. Start simple, document your approach, and evolve it as you learn what works for your project.
