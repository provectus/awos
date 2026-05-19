# Product Roadmap: Snippet Vault

_This roadmap outlines our strategic direction based on customer needs and business goals. It focuses on the "what" and "why," not the technical "how."_

---

### Phase 1

_Walking skeleton — a single user can sign in, save one snippet, list snippets, and view one back. Establishes both halves of the stack (Python backend + React frontend) in a runnable state._

- [ ] **User Account Essentials**
  - [ ] **Email + Password Sign-In:** Allow a user to register and sign in with an email and password. No SSO yet.
  - [ ] **Single Session Per User:** Persist a sign-in across page reloads via a session cookie.

- [ ] **Snippet Capture**
  - [ ] **Paste & Save:** Provide a form where the user can paste snippet text and save it under their account.
  - [ ] **List Mine:** Show the signed-in user's saved snippets, newest first.
  - [ ] **View One:** Open a single snippet's full content in a dedicated view.

---

### Phase 2

_Tags and search — exercises the data path and demonstrates the search experience._

- [ ] **Tagging**
  - [ ] **Tag on Create:** Allow the user to attach one or more tags when saving a snippet.
  - [ ] **Tag on Edit:** Allow the user to add or remove tags on an existing snippet.
  - [ ] **Filter by Tag:** In the snippets list, let the user narrow results to a chosen tag.

- [ ] **Search**
  - [ ] **Full-Text Search:** Let the user search across the content of all their snippets and surface the matches in the list view.

---

### Phase 3

_Polish — quality-of-life features on top of a working application. Priority may be refined based on Phase 1/2 feedback._

- [ ] **Editor Quality**
  - [ ] **Syntax Highlighting:** Render snippets with per-language syntax highlighting in the view.
  - [ ] **Keyboard Shortcuts:** Provide common keyboard shortcuts for navigating between snippets and triggering save.

- [ ] **Portability**
  - [ ] **Export Archive:** Let the user download all their snippets as a single archive (e.g. zip of markdown files).
