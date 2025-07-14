// server.js
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
  try {
    const response = await fetch('https://users.roblox.com/v1/usernames/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernames: [username], excludeBannedUsers: true }),
    });
    const data = await response.json();
    return data.data[0]?.id || null;
  } catch (err) {
    console.log(`Error fetching user ID for "${username}":`, err);
    return null;
  }
}

async function getFriends(userId) {
  try {
    const response = await fetch(`https://friends.roblox.com/v1/users/${userId}/friends`, {
      headers: { 'Cookie': `.ROBLOSECURITY=${ROBLOX_COOKIE}` },
    });
    if (!response.ok) {
      console.log(`Failed to fetch friends for ${userId}: HTTP ${response.status}`);
      return [];
    }
    const data = await response.json();
    return data.data.map(f => ({ id: f.id, name: f.name }));
  } catch (err) {
    console.log(`Error fetching friends for ${userId}:`, err);
    return [];
  }
}

async function findFriendPath(startUsername, endUsername) {
  console.log(`Looking for path from "${startUsername}" to "${endUsername}"`);

  const startUserId = await getUserId(startUsername);
  const endUserId = await getUserId(endUsername);

  if (!startUserId || !endUserId) return null;

  const directFriends = await getFriends(startUserId);
  await sleep(1000); // delay to avoid 429

  const directIds = directFriends.map(f => f.id);
  if (directIds.includes(endUserId)) {
    return [startUsername, endUsername];
  }

  for (const friend of directFriends) {
    console.log(`Checking ${friend.name}'s friends...`);
    const secondLevel = await getFriends(friend.id);
    await sleep(1000); // delay to avoid 429

    if (secondLevel.some(f => f.id === endUserId)) {
      return [startUsername, friend.name, endUsername];
    }
  }

  return null;
}

function renderForm(path, error, startUser = '', endUser = '') {
  return `
  <!DOCTYPE html>
  <html>
  <head>
    <title>Roblox Friend Path</title>
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
      return res.send(renderForm(null, 'No path found. Check privacy settings or spelling.', startUser, endUser));
    }
    res.send(renderForm(path, null, startUser, endUser));
  } catch (err) {
    console.log('Unexpected error:', err);
    res.send(renderForm(null, 'Something went wrong. Try again later.', startUser, endUser));
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));
