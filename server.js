
const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

// Twitch's public web Client-ID used by the Twitch website.
// This is intentionally not a developer OAuth client.
const TWITCH_CLIENT_ID =
  process.env.TWITCH_CLIENT_ID || "kimne78kx3ncx6brgo4mv6wki5h1ko";

const GQL_URL = "https://gql.twitch.tv/gql";

const CHANNEL_FOLLOWS_HASH =
  "eecf815273d3d949e5cf0085cc5084cd8a1b5b7b6f7990cf43cb0beadf546907";

app.use(express.static(path.join(__dirname, "public")));

async function twitchGraphQL(body) {
  const response = await fetch(GQL_URL, {
    method: "POST",
    headers: {
      "Client-ID": TWITCH_CLIENT_ID,
      "Content-Type": "application/json",
      "Accept": "application/json",
      "User-Agent": "Mozilla/5.0 TwitchFollowingViewer/1.0"
    },
    body: JSON.stringify(body)
  });

  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Twitch returned non-JSON (${response.status})`);
  }

  // Twitch GQL can return HTTP 200 with GraphQL errors.
  if (!response.ok) {
    throw new Error(`Twitch GraphQL HTTP ${response.status}: ${
      json?.errors?.[0]?.message || text.slice(0, 300)
    }`);
  }

  if (json?.errors?.length) {
    const messages = json.errors.map(e => e.message).join("; ");
    throw new Error(`Twitch GraphQL: ${messages}`);
  }

  return json;
}

async function getFollowing(req, res, usernameFromPath) {
  const username = String(
    usernameFromPath ?? req.query.username ?? ""
  ).trim().replace(/^@/, "");

  if (!/^[A-Za-z0-9_]{1,25}$/.test(username)) {
    return res.status(400).json({ error: "Invalid Twitch username." });
  }

  const limit = Math.min(
    Math.max(parseInt(req.query.limit || "500", 10) || 500, 1),
    1000
  );

  try {
    const follows = [];

    const first = Math.min(100, limit);

    const result = await twitchGraphQL({
      operationName: "ChannelFollows",
      variables: {
        limit: first,
        login: username,
        order: "DESC"
      },
      extensions: {
        persistedQuery: {
          version: 1,
          sha256Hash: CHANNEL_FOLLOWS_HASH
        }
      }
    });

    const user = result?.data?.user;
    if (!user) {
      return res.status(404).json({
        error: `Twitch user "${username}" was not found.`
      });
    }

    const connection = user.follows;
    const totalCount = connection?.totalCount ?? null;
    const edges = connection?.edges || [];

    for (const edge of edges) {
      if (edge?.node) {
        follows.push({
          id: edge.node.id,
          login: edge.node.login,
          displayName: edge.node.displayName,
          profileImageURL: edge.node.profileImageURL,
          profileURL: edge.node.profileURL,
          followedAt: edge.followedAt || null
        });
      }
    }

    const targetUser = {
      id: user.id,
      login: user.login,
      displayName: user.displayName
    };

    return res.json({
      login: targetUser.login,
      displayName: targetUser.displayName,
      totalCount,
      count: follows.length,
      follows
    });
  } catch (error) {
    console.error(error);
    return res.status(502).json({
      error: error.message || "Unable to query Twitch GraphQL.",
      hint: "Twitch's undocumented GraphQL API can change or reject requests."
    });
  }
}

app.get("/api/following/:username", (req, res) =>
  getFollowing(req, res, req.params.username)
);

app.get("/api/following", (req, res) =>
  getFollowing(req, res, null)
);

app.get("/api/health", (req, res) =>
  res.json({ ok: true, service: "twitch-following-graphql" })
);

app.use((req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Twitch Following Viewer listening on ${PORT}`);
});
