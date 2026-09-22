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

## Deploy

This is a static site. After reviewing the Supabase database permissions, publish the `main` branch from `/(root)` in the repository's **Settings → Pages**. The expected project URL is `https://f-thirawat-m.github.io/studyflow-student-planner/`.

Before enabling Pages, verify in Supabase that Row Level Security is enabled and restricts `profiles`, `tasks`, and `task_dependencies` to the signed-in owner. Check that the `save_task` function cannot be executed by guests or used to change another user's tasks. These database policies are managed outside this repository, so the client code alone cannot establish that they are safe.

In Supabase **Authentication → URL Configuration**, set the Site URL to the published Pages URL so email confirmation returns to this app. Keep the publishable key in the browser; never put a secret or service role key in this repository.
