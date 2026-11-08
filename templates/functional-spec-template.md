# Functional Specification: [Name of the Change]

- **Topic:** [The single feature or capability this specification defines]
- **Status:** Draft | In Review | Approved | Completed
- **Author:** [Author's Name]

---

## 1. Overview and Rationale (The "Why")

_Describe the core purpose of this change. What is the context? What problem are we solving, and what is the desired outcome? How will we measure success? This section may stay qualitative — the requirements below carry the numbers._

---

## 2. Functional Requirements (The "What")

_Describe the required functionality in a clear, non-technical way: what the user sees and does, never how the system works inside. One requirement per `###` subsection; number them `2.1`, `2.2`, … and give each a short name, so that reviews, tests and the Change Log can point at a requirement by number._

_Write each requirement as **one sentence** that names who acts, what triggers it, and what the user then gets. Four shapes cover almost everything:_

- _**Event:** "When the user [does X], [they see / get Y]."_
- _**State:** "While [a condition holds], [the user can / sees Y]."_
- _**Failure:** "If [something goes wrong], then [the user sees Y]."_
- _**Option:** "Where [a setting or plan is enabled], [the user can Y]."_

_Each requirement carries **acceptance criteria**: checkboxes a tester who has never seen the codebase could run by hand. Every criterion is **a single sentence containing both `when` and `then`, in that order** (an opening "Given …" precondition is optional). Quote on-screen text exactly, in quotes. State limits as numbers (file size, count, seconds). Qualities the user perceives — speed, what works on a phone, what a screen reader announces — are requirements too, and get a number and a criterion like any other._

_Before closing a requirement, walk the failure classes and give each one that applies its own criterion: **empty** input, **invalid** input, **over a limit**, **no permission**, **changed by someone else meanwhile**, **offline or timed out**. When three or more cases differ only in their inputs and outcomes, put them in a table and keep a single criterion that points at it._

**Example:**

### 2.1 Request a password reset

When a signed-out user submits the "Forgot password" form with the email address of an existing account, they receive an email containing a reset link that stays valid for 60 minutes.

- **Acceptance Criteria:**
  - [ ] Given the user is signed out, when they click "Forgot password?" on the sign-in page, then they see a page with a single email field and a "Send reset link" button.
  - [ ] When the user submits the email address of an existing account, then they see: "If an account exists for this address, we've sent a reset link." and receive the email within 2 minutes.
  - [ ] When the user submits an email address that matches no account, then they see the same message and no email is sent.
  - [ ] When the user submits the form with the email field empty, then they see: "Enter your email address." and no email is sent.
  - [ ] When the user opens a reset link more than 60 minutes after it was sent, then they see: "This link has expired. Request a new one." with a button that returns them to the "Forgot password" form.

### 2.2 Choose a new password

When the user opens a valid reset link, they can set a new password that meets the rules in the table below, and are signed in once it is saved.

| Password entered                       | Outcome                                                     |
| -------------------------------------- | ----------------------------------------------------------- |
| Fewer than 12 characters               | Not saved; "Use at least 12 characters."                    |
| Same as the current password           | Not saved; "Choose a password you haven't used before."     |
| 12 or more characters, not the current | Saved; the user is signed in and sees the account home page |

- **Acceptance Criteria:**
  - [ ] When the user submits a password from any row of the table above, then they see the outcome in that row.
  - [ ] When the user submits a valid new password, then every other signed-in session of that account is signed out within 1 minute.

---

## 3. Scope and Boundaries

_Define what is and is not included in this work. An out-of-scope entry is not a negated goal: it names something a reasonable reader might expect this change to do, and that it deliberately does not. Tag each one **deferred** (a later spec will cover it) or **never** (and say why)._

### In-Scope

- [A list of what is definitely included.]

### Out-of-Scope

- [Related item that is explicitly NOT included] — **deferred** | **never**: [reason]

---

## 4. Assumptions

_Statements this spec treats as true without anyone having confirmed them — facts taken from research, the product definition or the current behavior. Each one says what changes if it turns out wrong. Open questions do **not** go here: each stays inline as a `[NEEDS CLARIFICATION: …]` marker next to the sentence it affects, so the question and its working assumption are read together._

- [Statement assumed true] — if wrong: [which requirement changes]

---

## 5. Glossary

_Every term a newcomer could misread — product names, roles, states, and any word this spec uses in a narrower sense than everyday language. One canonical term per concept; use it everywhere in the spec instead of synonyms. Teams working in two languages add the translation here, not in the requirements._

| Term   | Meaning                                              |
| ------ | ---------------------------------------------------- |
| [Term] | [One-sentence definition as this spec uses the word] |

---

## Change Log

_Dated amendments made after the spec was first written — typically by `/awos:spec` in Update Mode when a bug fix changed documented behavior. Each entry records the date, the source reference (bug id or fix description), the requirement number it touched, and what behavior changed and why. Leave empty until the first amendment._

- [YYYY-MM-DD] — [source reference] — [requirement 2.N] — [what behavior changed and why]
