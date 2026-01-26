# Test Plan: [Feature Name]

- **Spec:** [spec directory name]
- **Functional Spec:** [Link to functional-spec.md]
- **Status:** Draft | In Progress | Completed
- **Author:** [Name]
- **Created:** [Date]
- **Last Executed:** [Date]

---

## 1. Test Scope

### 1.1 In Scope

_List what will be tested in this test plan._

- [Feature/functionality to test]
- [Feature/functionality to test]

### 1.2 Out of Scope

_List what will NOT be tested (tested elsewhere or deferred)._

- [Feature/functionality not tested]
- [Feature/functionality not tested]

### 1.3 Acceptance Criteria Coverage

_Map each acceptance criterion to test cases._

| Acceptance Criterion | Test Cases |
|---------------------|------------|
| [Criterion from functional-spec] | TC-001, TC-002 |
| [Criterion from functional-spec] | TC-003 |

---

## 2. Test Cases

### 2.1 Functional Tests

#### TC-001: [Test Case Name]

- **Category:** Functional
- **Priority:** P0 | P1 | P2 | P3
- **Description:** [What is being tested]
- **Preconditions:**
  - [Required setup]
- **Test Steps:**
  1. [Step one]
  2. [Step two]
  3. [Step three]
- **Expected Result:** [What should happen]
- **Status:** [ ] Not Run
- **Actual Result:** _[Fill after execution]_
- **Notes:** _[Any observations]_

---

#### TC-002: [Test Case Name]

- **Category:** Functional
- **Priority:** P1
- **Description:** [What is being tested]
- **Preconditions:**
  - [Required setup]
- **Test Steps:**
  1. [Step one]
  2. [Step two]
- **Expected Result:** [What should happen]
- **Status:** [ ] Not Run
- **Actual Result:** _[Fill after execution]_
- **Notes:** _[Any observations]_

---

### 2.2 Edge Case Tests

#### TC-010: [Edge Case Name]

- **Category:** Edge Case
- **Priority:** P1
- **Description:** [What edge case is being tested]
- **Preconditions:**
  - [Required setup]
- **Test Steps:**
  1. [Step to trigger edge case]
- **Expected Result:** [How system should handle it]
- **Status:** [ ] Not Run
- **Actual Result:** _[Fill after execution]_
- **Notes:** _[Any observations]_

---

### 2.3 Error Handling Tests

#### TC-020: [Error Scenario Name]

- **Category:** Error Handling
- **Priority:** P1
- **Description:** [What error scenario is being tested]
- **Preconditions:**
  - [Required setup]
- **Test Steps:**
  1. [Step to trigger error]
- **Expected Result:** [Expected error message/behavior]
- **Status:** [ ] Not Run
- **Actual Result:** _[Fill after execution]_
- **Notes:** _[Any observations]_

---

### 2.4 Security Tests

#### TC-030: [Security Test Name]

- **Category:** Security
- **Priority:** P0
- **Description:** [What security aspect is being tested]
- **Preconditions:**
  - [Required setup]
- **Test Steps:**
  1. [Step to test security]
- **Expected Result:** [Expected secure behavior]
- **Status:** [ ] Not Run
- **Actual Result:** _[Fill after execution]_
- **Notes:** _[Any observations]_

---

## 3. Test Execution Summary

_Update this section after test execution._

| Metric | Count | Percentage |
|--------|-------|------------|
| **Total Tests** | 0 | 100% |
| **Passed** | 0 | 0% |
| **Failed** | 0 | 0% |
| **Blocked** | 0 | 0% |
| **Skipped** | 0 | 0% |

### 3.1 Failed Tests

_List failed tests with details._

| Test ID | Description | Severity | Actual Result |
|---------|-------------|----------|---------------|
| TC-XXX | [Brief description] | Critical/Major/Minor | [What happened] |

### 3.2 Blocked Tests

_List blocked tests and reasons._

| Test ID | Description | Blocked By |
|---------|-------------|------------|
| TC-XXX | [Brief description] | [Reason/dependency] |

---

## 4. Issues Found

_Document bugs and issues discovered during testing._

### Issue #1: [Issue Title]

- **Severity:** Critical | Major | Minor | Cosmetic
- **Found in:** TC-XXX
- **Description:** [Detailed description of the issue]
- **Steps to Reproduce:**
  1. [Step one]
  2. [Step two]
- **Expected:** [What should happen]
- **Actual:** [What actually happens]
- **Suggested Fix:** [How to resolve, if known]
- **Status:** Open | In Progress | Fixed | Won't Fix

---

## 5. Recommendation

_Final assessment after test execution._

- [ ] **Ready for Release** — All P0/P1 tests pass, no critical issues
- [ ] **Conditional Release** — Minor issues exist, can release with known limitations
- [ ] **Needs Fixes** — Critical/major issues found, must be resolved before release
- [ ] **Not Ready** — Significant failures, major rework required

### Notes

_Any additional observations, risks, or recommendations._
