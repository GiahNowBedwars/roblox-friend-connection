const express = require('express');
const fetch = require('node-fetch');
const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
require('dotenv').config();

const ROBLOX_COOKIE = process.env.ROBLOX_COOKIE;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getUserId(username) {
  console.log(`Looking up user ID for username: "${username}"`);
  try {
    const response = await fetch('https://users.roblox.com/v1/usernames/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernames: [username.toLowerCase()], excludeBannedUsers: true }),
    });
    const data = await response.json();
    const id = data.data[0]?.id || null;
    console.log(`User ID for "${username}": ${id}`);
    return id;
  } catch (err) {
    console.log(`Error fetching user ID for "${username}":`, err);
    return null;
  }
}

async function getFriends(userId) {
  console.log(`Fetching friends for user ID: ${userId}`);
  let retries = 0;
  const maxRetries = 5;

  while (retries < maxRetries) {
    try {
      const response = await fetch(`https://friends.roblox.com/v1/users/${userId}/friends`, {
        headers: { 'Cookie': `.ROBLOSECURITY=${ROBLOX_COOKIE}` },
      });

      if (response.status === 429) {
        const waitTime = 1000 * (retries + 1); // 1s, 2s, 3s...
        console.log(`429 Rate Limit hit. Waiting ${waitTime}ms and retrying...`);
        await sleep(waitTime);
        retries++;
        continue;
      }

      if (!response.ok) {
        console.log(`Failed to fetch friends for ${userId}: HTTP ${response.status}`);
        return [];
      }

      const data = await response.json();
      const friends = data.data.slice(0, 1000).map(f => ({ id: f.id, name: f.name }));
      console.log(`Friends of ${userId}:`, friends.map(f => f.name));
      await sleep(1000); // 1 second wait to reduce risk of 429
      return friends;
    } catch (err) {
      console.log(`Error fetching friends for ${userId}:`, err);
      return [];
    }
  }

  console.log(`Exceeded retry limit for user ID ${userId}`);
  return [];
}

async function findFriendPath(startUsername, endUsername) {
  console.log(`Starting search from "${startUsername}" to "${endUsername}"`);

  const startUserId = await getUserId(startUsername.trim());
  const endUserId = await getUserId(endUsername.trim());

  if (!startUserId) {
    console.log(`Start user "${startUsername}" not found.`);
    return null;
  }
  if (!endUserId) {
    console.log(`End user "${endUsername}" not found.`);
    return null;
  }

  console.log(`Start user ID: ${startUserId}, End user ID: ${endUserId}`);

  const queue = [[startUserId, [startUsername]]];
  const visited = { [startUserId]: true };
  const userIdToName = { [startUserId]: startUsername };

  const MAX_DEPTH = 6;

  while (queue.length > 0) {
    const [currentUserId, path] = queue.shift();
    console.log(`Queue length: ${queue.length}. Checking user ID ${currentUserId} (${userIdToName[currentUserId]}) with path length ${path.length}`);

    if (path.length > MAX_DEPTH) {
      console.log(`Reached max depth of ${MAX_DEPTH}, skipping deeper search from here.`);
      continue;
    }

    const friends = await getFriends(currentUserId);
    friends.forEach(f => { userIdToName[f.id] = f.name; });

    for (const friend of friends) {
      if (!visited[friend.id]) {
        const newPath = [...path, friend.name];
        if (friend.id === endUserId) {
          console.log(`Path found! ${newPath.join(' → ')}`);
          return newPath;
        }
        visited[friend.id] = true;
        queue.push([friend.id, newPath]);
      }
    }
  }

  console.log('No friend path found between the given users.');
  return null;
}

function renderForm(path, error, startUser = '', endUser = '') {
  return `
  <!DOCTYPE html>
  <html>
  <head>
      <title>Roblox Friend Path Finder</title>
      <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          .container { max-width: 600px; margin: auto; }
          input[type=text] { width: 100%; padding: 8px; margin: 6px 0; box-sizing: border-box; }
          button { padding: 10px 20px; font-size: 16px; }
          .result { padding: 15px; border: 1px solid #ddd; border-radius: 5px; background: #f9f9f9; margin-top: 20px; }
          .error { color: red; }
      </style>
  </head>
  <body>
      <div class="container">
          <h2>Roblox Friend Path Finder</h2>
          <form method="POST" action="/friend-path">
              <label for="startUser">Start Username:</label>
              <input type="text" id="startUser" name="startUser" value="${startUser}" required />
              <label for="endUser">End Username:</label>
              <input type="text" id="endUser" name="endUser" value="${endUser}" required />
              <button type="submit">Find Path</button>
          </form>
          ${error ? `<p class="error">${error}</p>` : ''}
          ${path ? `<div class="result"><strong>Path:</strong> ${path.join(' → ')}</div>` : ''}
      </div>
  </body>
  </html>
  `;
}

app.get('/friend-path', (req, res) => {
  res.send(renderForm(null, null));
});

app.post('/friend-path', async (req, res) => {
  const { startUser, endUser } = req.body;
  if (!startUser || !endUser) {
    return res.send(renderForm(null, 'Both usernames are required.', startUser, endUser));
  }
  try {
    const path = await findFriendPath(startUser.trim(), endUser.trim());
    if (!path) {
      return res.send(renderForm(null, 'No friend path found. Check usernames or privacy settings.', startUser, endUser));
    }
    res.send(renderForm(path, null, startUser, endUser));
  } catch (err) {
    console.log('Unexpected error:', err);
    res.send(renderForm(null, 'An error occurred. Please try again.', startUser, endUser));
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));
