# Personal Workplanner

A React and TypeScript weekly workplanning tool for comparing planned work, actual time, and unplanned interruptions.

## Features

- Weekly planning by section and estimate
- Daily task view with start and stop timers
- Unplanned work flagging
- Friday review of planned, completed, unexpected, and over-estimate work
- Manager view for status visibility
- Netlify Identity account gate
- Authenticated per-user persistence through a Netlify Function and Netlify Blobs
- Local browser-storage fallback for development

## Local Development

```bash
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:5173/
```

For full Netlify Function and Identity testing:

```bash
npx netlify login
npx netlify link
npm run netlify:dev
```

Open:

```text
http://127.0.0.1:8888/
```

## Build

```bash
npm run build
```

## Deployment

Use GitHub for the public code repository and Netlify for the account-enabled public website.

See `docs/project-summary-and-setup.md` for complete testing, deployment, demo-account, and improvement notes.
