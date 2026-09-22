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
assets/js/auth.js          Supabase registration, sign-in, and guest home
assets/js/store.js         Task data operations through Supabase
assets/js/scheduler.js     Dependency and critical-path calculations
assets/js/dashboard.js     Overview rendering
assets/js/chart.js         Timeline rendering
assets/js/calendar.js      Calendar rendering
assets/js/summary.js       Progress summary and completed/pending lists
assets/js/modal.js         Task editor behavior
assets/js/app.js           App startup and event coordination
```

## Accounts and data

The home page is available without signing in. Guests can browse the planner views; adding and saving tasks requires an account. Accounts and task data are managed through Supabase, so signed-in users can access their tasks across devices. The Supabase project URL and public key are configured in `assets/js/supabase-config.js`.
