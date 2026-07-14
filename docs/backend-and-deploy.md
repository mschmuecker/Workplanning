# Backend and Deploy Notes

## Recommendation

Use Netlify for the full account-enabled app.

The app is a Vite React site, so GitHub Pages, Vercel, or Netlify can host the static frontend. However, the current version requires user accounts and uses a Netlify Function plus Netlify Blobs for per-user saved workplans. That makes Netlify the correct host for the full version.

GitHub Pages remains useful as a static deployment example, but it cannot run the Netlify Function or Netlify Identity backend.

## Current Storage Behavior

- Local Vite development can render the UI and uses `localStorage` as fallback storage.
- Netlify deployment uses `netlify/functions/workplan.ts` for shared persistence.
- The function requires a Netlify Identity user session.
- Each authenticated user saves to a separate Blob key.
- If the remote backend is not available, the app falls back to local browser data.

## Netlify Setup

1. Create or import a Netlify site from the GitHub repository.
2. Use `npm run build` as the build command.
3. Use `dist` as the publish directory.
4. Keep functions under `netlify/functions`.
5. Enable Netlify Identity for the site.
6. Choose open signup or invite-only signup.
7. Create a demo user if graders or reviewers need shared credentials.

## Netlify Local Development

```bash
npx netlify login
npx netlify link
npm run netlify:dev
```

Open:

```text
http://127.0.0.1:8888/
```

## GitHub Pages Static Deployment

The repository includes `.github/workflows/deploy.yml`.

1. Push to `main`.
2. Set GitHub Pages source to GitHub Actions.
3. The workflow builds and publishes `dist`.

Expected URL:

```text
https://<github-user-or-org>.github.io/<repo-name>/
```

Use Netlify, not GitHub Pages, when the required deliverable includes account login and backend persistence.
