# StudyFlow Student Planner

A dependency-aware student planner built with plain HTML, CSS, and JavaScript. No build step or third-party JavaScript framework is required.

## Run locally

Open `index.html` in a browser, or serve the folder with any static web server.

## Project structure

```text
index.html                 Page structure and accessible markup
assets/css/base.css        Design tokens, typography, and global layout
assets/css/components.css  Header, buttons, modal, and shared components
assets/css/views.css       Dashboard, timeline, and calendar views
assets/css/theme-playful.css Playful hand-drawn visual theme
assets/css/auth.css        Login and registration screens
assets/js/core.js          Shared configuration, dates, and utilities
assets/js/auth.js          Local account registration and sign-in
assets/js/store.js         Local storage and task data operations
assets/js/scheduler.js     Dependency and critical-path calculations
assets/js/dashboard.js     Overview rendering
assets/js/chart.js         Timeline rendering
assets/js/calendar.js      Calendar rendering
assets/js/summary.js       Progress summary and completed/pending lists
assets/js/modal.js         Task editor behavior
assets/js/app.js           App startup and event coordination
```

## Accounts and data

Accounts and tasks are stored locally in the current browser. Passwords are salted and hashed before storage, and each account receives a separate task list. Existing tasks from the original app are migrated to the first account created in that browser.

This local account system is intended for demos and coursework. A production deployment that needs cross-device login, password recovery, or shared data should use a server-side authentication provider and database.
