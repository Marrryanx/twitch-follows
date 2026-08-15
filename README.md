# Twitch Following Viewer — no OAuth

A small Express website that accepts any Twitch username and queries Twitch's
undocumented GraphQL endpoint directly for `User.follows`.

## Run locally

```bash
npm install
npm start
```

Then open http://localhost:10000

## Render

- Build command: `npm install`
- Start command: `npm start`
- No environment variables are required.
- Optional `TWITCH_CLIENT_ID` can override the default Twitch web Client-ID.

## Important

This uses Twitch's undocumented/private GraphQL endpoint rather than the official
Helix API. Twitch can change or block it without notice.

The server paginates in batches of 100 and currently requests up to 1,000 follows.

\n## Quick deployment check

After deploying, open `/api/health`. It should display:

```json
{"ok":true,"service":"twitch-following-graphql"}
```

The viewer now calls `/api/following?username=ninja`, which avoids routing issues
with path parameters on some hosting/proxy configurations.

\n## Persisted operation

This version uses the discovered Twitch web operation:

- Operation: `ChannelFollows`
- Persisted-query hash: `eecf815273d3d949e5cf0085cc5084cd8a1b5b7b6f7990cf43cb0beadf546907`
- Variables: `limit`, `login`, `order`

The operation is publicly documented in community examples of Twitch's GQL
traffic. Twitch can rotate persisted-query hashes at any time.

\n## v5 fix

The persisted `ChannelFollows` operation is requested once per API call.
The previous version accidentally reused the same page in a pagination loop,
which caused requests to hang indefinitely.

\n## v6 fix

Persisted Twitch GQL operations are sent in a JSON array envelope by the Twitch
web client. This version sends the operation in that envelope and unwraps the
first result, while also matching Twitch's browser Origin/Referer headers.
