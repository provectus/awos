# Product Roadmap: Todo CLI

_This roadmap outlines our strategic direction based on customer needs and business goals. It focuses on the "what" and "why," not the technical "how."_

---

### Phase 1

_The highest priority features that form the core foundation of the product — a usable todo list from the command line._

- [x] **Manage Todos**
  - [x] **Add a Task:** Let the user record a new task from the command line and get immediate confirmation with an id.
  - [x] **List Tasks:** Show every task with its completion status and id so the user can see what is outstanding.
  - [x] **Complete a Task:** Let the user mark a task done by its id.
  - [x] **Remove a Task:** Let the user delete a task by its id.
  - [x] **Automatic Persistence:** Save tasks locally between commands with no setup, so the list survives across sessions.

---

### Phase 2

_Once the core list works, we make individual tasks richer._

- [ ] **Richer Tasks**
  - [ ] **Due Dates:** Allow the user to attach an optional due date to a task and see overdue items highlighted in the list.
  - [ ] **Priorities:** Allow the user to flag a task's priority and sort the list so the most important work surfaces first.

---

### Phase 3

_Features planned for future consideration. Their priority and scope may be refined based on user feedback from earlier phases._

- [ ] **Beyond a Single List**
  - [ ] **Named Lists / Projects:** Let the user keep separate lists (e.g. "work" vs "home") and switch between them.
  - [ ] **Export / Import:** Let the user move their tasks between machines by exporting and importing the list.
