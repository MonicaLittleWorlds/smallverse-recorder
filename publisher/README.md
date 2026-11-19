# Automatic community publishing

Implementation is prepared, but **not live until the owner deploys and configures this service**. It targets Cloudflare Workers; use the Free plan initially and test its 10 ms CPU limit with actual recordings. Automatic uploads are limited to 1 MB; larger recordings remain exportable. Do not enable a paid plan automatically.

Visitors sign in with GitHub using an OAuth app with no requested scopes. The app reads their public GitHub identity, not repository access. A separate owner-provided fine-grained publishing token stays in Worker secrets and is limited to Contents read/write for `MonicaLittleWorlds/smallverse-recorder`. It is never shipped in the extension, returned to visitors or committed to GitHub. Do not paste secrets into chat.

## Owner setup (once)

1. Create a Cloudflare account and enable Workers Free. Deploy from this repo using Wrangler: `npx wrangler deploy --config publisher/wrangler.jsonc`. The initial service returns setup-incomplete until its secrets are set. Set `PUBLIC_URL` in that config to the assigned HTTPS workers.dev origin and deploy again.
2. Register a GitHub OAuth app under Settings → Developer settings → OAuth Apps. Homepage: the service origin. Callback: `https://YOUR-SERVICE.workers.dev/auth/callback`.
3. Enter secrets through Wrangler's hidden prompts (`npx wrangler secret put NAME --config publisher/wrangler.jsonc`) or the Cloudflare dashboard:
   - `OAUTH_CLIENT_ID` and `OAUTH_CLIENT_SECRET`: from that OAuth app.
   - `PUBLISH_TOKEN`: fine-grained GitHub token for only this repository, Contents read/write. Set an expiry and rotate it before it expires.
   - `SESSION_SECRET`: randomly generated secret of at least 32 characters. Rotating it signs everyone out.
4. Run `npm run configure-publisher -- https://YOUR-SERVICE.workers.dev`. This sets the public endpoint and grants the extension access only to that host. Commit the public configuration and distribute the updated extension. Users reload/update and accept its identity permission.
5. Connect GitHub in the library. Validate sharing with a deliberately reviewed recording, verify both the recording JSON and catalog appear in the same commit, then test sync on a second installation. Do not publish private test chat. No live end-to-end upload has yet been verified.

GitHub's app registration and Cloudflare account authorization must be completed by the owner. A GitHub session in Chrome or this development chat is not a credential for the distributed extension.

## Behavior

Share validates schema, reviewed timing and the sharing checkbox; it publishes JSON plus catalog in one atomic commit. Non-fast-forward writes retry against the latest catalog without force-pushing. The filename includes the authenticated GitHub user ID and full content hash: another user cannot overwrite it, exact retry uploads do not duplicate it, and changed versions are separate contributions. A lost response can be retried safely. No uploaded code is run.

Each GitHub account can publish five new recordings per UTC day. A 500-entry catalog cap prevents unlimited growth; this is a small-community starting point, not a general public upload platform. Set `BLOCKED_USERS` to comma-separated numeric GitHub IDs to block abusive contributors. Remove unwanted entries/files using normal repository maintenance. New accounts can bypass per-account quotas, so monitor the catalog and GitHub API usage. GitHub API limits and branch protection can reject publishing; never disable protection automatically.

OAuth state is signed, expires after ten minutes and is bound to a browser cookie. Extension return URLs are restricted to Chrome identity redirects. Publishing session tokens expire after seven days and are kept in Chrome session storage, which is not exposed to content scripts by default. Browser restart/disconnect requires sign-in again. GitHub user OAuth tokens are used only for the public identity request and not persisted. The server's publishing credential is never sent to the client.

All users receive shared entries through the existing automatic sync. They must review each downloaded version before replay. GitHub raw-content caching can delay visibility. Successful upload is not proof of a successful gameplay replay.
