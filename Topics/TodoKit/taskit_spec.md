# Todo Kit — Product Spec v0.2

> Local to-do tracker built with HTML, CSS, and JavaScript.  
> Formerly named TasKit.  
> Data persisted to `todokit-data.json` through the local Node server. No browser storage dependency.

---

## Stack

| Layer      | Tech                        |
|------------|-----------------------------|
| UI         | HTML5 + CSS3                |
| Logic      | Vanilla JavaScript (ES6+)   |
| Storage    | Local JSON file: `todokit-data.json` via `/api/state` |

---

## Feature Areas

### 1. Projects

- User can create any number of named **Projects**.
- Each project appears as a nav item in the **left sidebar**.
- Clicking a project loads its task list in the main content area.
- Projects are persisted in `todokit-data.json` alongside tasks.

---

### 2. Categories

- Each to-do is assigned exactly **one Category**.
- **Default categories (available to all projects):**
  - Bug
  - New Feature
  - Marketing
- Users can create additional custom categories at the project level.
- Categories are selectable from a dropdown when creating/editing a to-do.

---

### 3. To-Do Items

Each to-do has the following fields:

| Field               | Type / Notes                                                                 |
|---------------------|------------------------------------------------------------------------------|
| `id`                | Auto-generated unique identifier (UUID or timestamp-based)                   |
| `title`             | Short text — required                                                        |
| `priority`          | Enum: `Urgent` \| `High` \| `Med` \| `Low`                                 |
| `planned_start`     | Date picker — planned start date                                             |
| `description`       | Long text / textarea                                                         |
| `responsible`       | Dropdown — selected from the project's **Users List** (see §4)              |
| `comments`          | Array of comments with HTML body, author username, created timestamp, optional updated timestamp |
| `status`            | Enum: `To Do` \| `In Progress` \| `To Test` \| `Completed` \| `Cancelled`       |
| `category`          | Single selection from project categories (see §2)                           |

---

### 4. Project Users List

- Each project has its own **Users List**.
- Users are simple name strings — no accounts, no auth.
- Users can be added directly within the project settings/panel.
- The `responsible` field on any to-do pulls from this list.

---

### 5. Filtering & Search

- **Column filters** on the task list view for:
  - Status
  - Priority
  - Category
  - Responsible
- **Global search** — searches across title and description fields, across all visible tasks in the current project.
- Filters and search are combinable (e.g. filter by Status = In Progress AND search "login bug").

---

## Data Model (local JSON)

`todokit-data.json` stores one JSON object:

```json
{
  "projects": [],
  "tasks": [],
  "updatedAt": "ISO timestamp written by server"
}
```

The browser reads/writes this through `GET /api/state` and `POST /api/state`; opening `index.html` directly will not save to disk.

---

## Out of Scope (v1)

- User authentication
- Cloud storage or sync
- Multi-user collaboration
- Notifications / reminders
- File attachments
- Due dates
- Execution order / sequencing

---

## Notes

- All data lives in `todokit-data.json` in this folder.
- Run with `npm start` or `node server.js`, then open `http://127.0.0.1:8787`.
- No external dependencies required — minimal HTML/CSS/JS plus a dependency-free local Node server.
- Mobile-responsive layout is a nice-to-have, not required for v1.

---

*Spec created: 2026-06-23 | Last updated: 2026-06-23 | Author: Max*
