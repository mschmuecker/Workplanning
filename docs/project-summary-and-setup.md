# Personal Workplanner Summary and Setup

## Work Completed

- Created a Vite, React, and TypeScript workplanning app.
- Built weekly planning by sections, estimates, and scheduled days.
- Built a daily execution view with start and stop timers.
- Added unplanned work tracking so unexpected tasks stay visible separately from the original plan.
- Added a review view comparing planned work, completed planned work, unexpected work, and time gaps.
- Added a manager summary view for read-only status visibility.
- Added local browser persistence with `localStorage` as a fallback.
- Added a Netlify Function at `netlify/functions/workplan.ts` for shared persistence.
- Added Netlify Blob storage usage so plans can be saved on the hosted backend.
- Added Netlify Identity account gating so users must sign in or create an account before using the tool.
- Updated the Netlify backend so each authenticated user gets a separate saved workplan.
- Added GitHub Pages workflow support for static deployment, though the account-enabled version should be hosted on Netlify.
- Added deployment configuration in `netlify.toml`.

## Current Hosting Recommendation

Use Netlify for the submitted website link if account login is required.

GitHub Pages can host the static React files, but it cannot run the Netlify Function or Netlify Identity backend. Because the app now requires user accounts, Netlify is the correct public host for the full version.

Use GitHub for the public code repository and Netlify for the public website.

Example submission shape:

```text
Code Link: https://github.com/<user-or-org>/<repo>
Website Link: https://<site-name>.netlify.app/
```

## Local Setup

Install dependencies:

```bash
npm install
```

Start the Vite-only local dev server:

```bash
npm run dev
```

Open:

```text
http://127.0.0.1:5173/
```

The Vite-only server is best for UI smoke testing. Full account login and backend persistence should be tested through Netlify Dev or a deployed Netlify site.

## Full Local Netlify Test

Use this when you want to test the function route and Identity behavior locally.

1. Log in to Netlify:

```bash
npx netlify login
```

2. Link this folder to the Netlify site:

```bash
npx netlify link
```

3. Start Netlify Dev:

```bash
npm run netlify:dev
```

4. Open:

```text
http://127.0.0.1:8888/
```

Netlify Dev proxies the Vite app and exposes the function route at:

```text
/.netlify/functions/workplan
```

## Build Test

Run this before pushing or deploying:

```bash
npm run build
```

This runs TypeScript and creates the production `dist` build.

Optional production preview after building:

```bash
npm run preview
```

## Deploy to Netlify

1. Push the project to a public GitHub repository.
2. In Netlify, choose **Add new project** and import the GitHub repo.
3. Use these build settings:

```text
Build command: npm run build
Publish directory: dist
Functions directory: netlify/functions
```

4. Deploy the site.
5. After deployment, enable Netlify Identity for the site.
6. Configure registration based on the desired access model:
   - Open registration: anyone can create their own account.
   - Invite-only registration: only invited users can create accounts.
7. Create at least one demo user for grading or review.

## Demo Account Setup

For a class/demo submission, create a shared demo account in Netlify Identity.

Suggested credentials:

```text
Demo Email: demo@example.com
Demo Password: WorkplanDemo123!
```

Use a real email address you control if Netlify requires confirmation emails. If email confirmation is enabled, confirm the demo account before submitting the website link.

Important: everyone using the same demo account will share the same saved workplan. For normal use, each person should create their own account.

## Deploy to GitHub Pages

The repository includes `.github/workflows/deploy.yml` for GitHub Pages.

1. Push to the `main` branch of a public GitHub repository.
2. In GitHub, go to **Settings > Pages**.
3. Set **Source** to **GitHub Actions**.
4. Push to `main` or manually run the workflow.

Expected URL:

```text
https://<user-or-org>.github.io/<repo>/
```

Caution: the current account-required app is intended for Netlify. GitHub Pages cannot run the Netlify function or Identity backend, so use Netlify for the full submitted app.

## Useful Files

- `src/App.tsx`: main React app, auth gate, planner views, timers, review, and manager view.
- `src/storage.ts`: local fallback and remote persistence calls.
- `src/plannerData.ts`: default plan data and date helpers.
- `src/styles.css`: app styling.
- `netlify/functions/workplan.ts`: authenticated per-user workplan persistence.
- `netlify.toml`: Netlify build, publish, function, and redirect settings.
- `.github/workflows/deploy.yml`: GitHub Pages deployment workflow.

## Improvement Ideas

- Add team-level plans so a manager can switch between users.
- Add manager-only read access with user roles.
- Add weekly archive/history instead of only saving the current plan.
- Add charts for planned versus actual hours by section and day.
- Add export to CSV or PDF for weekly reviews.
- Add recurring tasks and templates for common weekly plans.
- Add drag-and-drop scheduling from weekly backlog to daily plan.
- Add task notes, blockers, and carryover reason fields.
- Add calendar integration for meetings and focus blocks.
- Add notifications for over-capacity days or long-running timers.
- Add stronger test coverage with component tests and function tests.
- Replace Blob document storage with a relational database if team reporting needs filtering, joins, or historical analytics.
