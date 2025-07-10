const express = require('express');
const fetch = require('node-fetch');
const app = express();

app.use(express.static('public'));
require('dotenv').config();
const ROBLOX_COOKIE = process.env.ROBLOX_COOKIE;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getUserId(username) {
  try {
    const response = await fetch('https://users.roblox.com/v1/usernames/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernames: [username], excludeBannedUsers: true })
    });
    const data = await response.json();
    return data.data[0]?.id || null;
  } catch {
    return null;
  }
}

async function getFriends(userId) {
  const MAX_RETRIES = 3;
  let retries = 0;

  while (retries < MAX_RETRIES) {
    try {
      const response = await fetch(`https://friends.roblox.com/v1/users/${userId}/friends`, {
        headers: { 'Cookie': `.ROBLOSECURITY=${ROBLOX_COOKIE}` }
      });

      if (response.status === 429) {
        const waitTime = (2 ** retries) * 1000; // 1s, 2s, 4s backoff
        console.log(`Rate limited fetching friends for user ID ${userId}. Waiting ${waitTime}ms before retry.`);
        await sleep(waitTime);
        retries++;
        continue;
      }

      if (!response.ok) {
        console.log(`Failed to fetch friends for user ID ${userId}. Status: ${response.status}`);
        return [];
      }

      const data = await response.json();
      return data.data.map(friend => ({ id: friend.id, name: friend.name }));
    } catch (err) {
      console.log(`Error fetching friends for user ID ${userId}:`, err);
      return [];
    }
  }

  console.log(`Failed to fetch friends for user ID ${userId} after ${MAX_RETRIES} retries.`);
  return [];
}

async function findFriendPath(startUsername, endUsername) {
  const MAX_FRIENDS_PER_USER = 20;
  const MAX_DEPTH = 4;

  const startUserId = await getUserId(startUsername);
  const endUserId = await getUserId(endUsername);
  if (!startUserId || !endUserId) return null;

  const queue = [[startUserId, [startUsername]]];
  const visited = { [startUserId]: true };
  const userIdToName = { [startUserId]: startUsername };

  while (queue.length > 0) {
    const [currentUserId, path] = queue.shift();

    if (path.length > MAX_DEPTH) continue; // Limit search depth

    console.log(`Checking user ID ${currentUserId} (${userIdToName[currentUserId]}) with path length ${path.length}`);

    const friends = (await getFriends(currentUserId)).slice(0, MAX_FRIENDS_PER_USER);
    friends.forEach(f => { userIdToName[f.id] = f.name; });

    for (const friend of friends) {
      if (!visited[friend.id]) {
        const newPath = [...path, friend.name];
        if (friend.id === endUserId) return newPath;
        visited[friend.id] = true;
        queue.push([friend.id, newPath]);
        await sleep(1000); // 1 second delay between friend requests
      }
    }
  }

  return null;
}

app.get('/friend-path', async (req, res) => {
  // Accept usernames from query params, fallback to defaults
  const startUser = req.query.start || 'awesomelittleboy9292';
  const endUser = req.query.end || 'Aaron_112s';

  const path = await findFriendPath(startUser, endUser);

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Roblox Friend Path</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .friend-path { padding: 15px; border: 1px solid #ddd; border-radius: 5px; background-color: #f9f9f9; }
        .friend-path h3 { margin-top: 0; color: #333; }
        .friend-path p { font-size: 16px; color: #555; }
        form { margin-bottom: 20px; }
        input { padding: 8px; margin-right: 10px; width: 200px; }
        button { padding: 8px 12px; }
      </style>
    </head>
    <body>
      <h2>Roblox Friend Path Finder</h2>
      <form method="GET" action="/friend-path">
        <input type="text" name="start" placeholder="Start username" value="${startUser}" required />
        <input type="text" name="end" placeholder="End username" value="${endUser}" required />
        <button type="submit">Find Path</button>
      </form>
      <div class="friend-path">
        <h3>Result:</h3>
        ${path ? `<p>${path.map(name => name).join(' → ')}</p>` : '<p>No friend path found. Try different usernames or check if profiles are public.</p>'}
      </div>
    </body>
    </html>
  `);
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));
