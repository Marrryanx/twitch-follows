
const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

// Twitch's public web Client-ID used by the Twitch website.
// This is intentionally not a developer OAuth client.
const TWITCH_CLIENT_ID =
  process.env.TWITCH_CLIENT_ID || "kimne78kx3ncx6brgo4mv6wki5h1ko";

const GQL_URL = "https://gql.twitch.tv/gql";

const USER_FOLLOWS_QUERY = `
query UserFollows($login: String!, $first: Int!, $after: Cursor) {
  user(login: $login) {
    id
    login
    displayName
    follows(first: $first, after: $after) {
      totalCount
      edges {
        cursor
        followedAt
        node {
          id
          login
          displayName
          profileImageURL(width: 150)
          profileURL
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
}`;

app.use(express.static(path.join(__dirname, "public")));

async function twitchGraphQL(body) {
  // Match the current public Twitch web GQL request shape, but deliberately
  // do NOT send an Authorization/OAuth header. This keeps the service
  // unauthenticated while giving the undocumented endpoint the same browser
  // context as Twitch's own web client.
  const crypto = require("crypto");
  const sessionId = crypto.randomUUID().replace(/-/g, "");
  const deviceId = crypto.randomUUID().replace(/-/g, "");

  const response = await fetch(GQL_URL, {
    method: "POST",
    headers: {
      "Accept": "*/*",
      "Accept-Language": "en-US,en;q=0.9",
      "Client-ID": TWITCH_CLIENT_ID,
      "Client-Session-ID": sessionId,
      "Client-Version": process.env.TWITCH_CLIENT_VERSION || "566da16f-80fe-4689-a9bc-d66a2a63a819",
      "Content-Type": "text/plain;charset=UTF-8",
      "Origin": "https://www.twitch.tv",
      "Referer": "https://www.twitch.tv/",
      "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
      "X-Device-ID": deviceId
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

app.get("/api/following/:username", async (req, res) => {
  const username = String(req.params.username || "")
    .trim()
    .replace(/^@/, "");

  if (!/^[A-Za-z0-9_]{1,25}$/.test(username)) {
    return res.status(400).json({ error: "Invalid Twitch username." });
  }

  const limit = Math.min(
    Math.max(parseInt(req.query.limit || "500", 10) || 500, 1),
    1000
  );

  try {
    const follows = [];
    let after = null;
    let targetUser = null;
    let totalCount = null;

    while (follows.length < limit) {
      const first = Math.min(100, limit - follows.length);

      const result = await twitchGraphQL({
        operationName: "UserFollows",
        variables: { login: username, first, after },
        query: USER_FOLLOWS_QUERY
      });

      const user = result?.data?.user;
      if (!user) {
        return res.status(404).json({
          error: `Twitch user "${username}" was not found.`
        });
      }

      targetUser = {
        id: user.id,
        login: user.login,
        displayName: user.displayName
      };

      const connection = user.follows;
      totalCount = connection?.totalCount ?? totalCount;
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

      if (!connection?.pageInfo?.hasNextPage || !edges.length) break;
      after = connection.pageInfo.endCursor;
      if (!after) break;
    }

    res.json({
      login: targetUser.login,
      displayName: targetUser.displayName,
      totalCount: totalCount,
      count: follows.length,
      follows
    });
  } catch (error) {
    console.error(error);
    res.status(502).json({
      error: error.message || "Unable to query Twitch GraphQL.",
      hint: "Twitch's undocumented GraphQL API can change or reject requests."
    });
  }
});

app.use((req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Twitch Following Viewer listening on ${PORT}`);
});
