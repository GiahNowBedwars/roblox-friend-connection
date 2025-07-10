const express = require('express');
const fetch = require('node-fetch');
const dotenv = require('dotenv');
const fs = require('fs');
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const ROBLOX_COOKIE = process.env.ROBLOX_COOKIE;

app.use(express.static('public'));

function delay(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

let activeRequests = 0;
const MAX_PARALLEL = 10;
const CACHE_FILE = './friendCache.json';
const MAX_DEPTH = 1234;
const FRIEND_LIMIT = 500;
let CACHE = new Map();

// Load cache from disk if available
if (fs.existsSync(CACHE_FILE)) {
  try {
    const raw = fs.readFileSync(CACHE_FILE);
    const parsed = JSON.parse(raw);
    CACHE = new Map(parsed);
  } catch (e) {
    console.error('Cache load error', e);
  }
}

// Save cache to disk every 30 seconds
setInterval(() => {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(Array.from(CACHE.entries())));
}, 30000);

// Get Roblox user ID from username (case insensitive)
async function getUserId(username) {
  const response = await fetch('https://users.roblox.com/v1/usernames/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernames: [username.toLowerCase()], excludeBannedUsers: true }),
  });
  const data = await response.json();
  return data.data[0]?.id;
}

// Fetch friends with caching, concurrency and exponential backoff on 429
async function getFriends(userId, retryDelay = 500, retries = 5) {
  if (CACHE.has(userId)) return CACHE.get(userId);

  while (activeRequests >= MAX_PARALLEL) {
    await delay(100);
  }

  activeRequests++;
  try {
    const response = await fetch(`https://friends.roblox.com/v1/users/${userId}/friends`, {
      headers: { Cookie: `.ROBLOSECURITY=${ROBLOX_COOKIE}` },
    });

    if (response.status === 429) {
      if (retries <= 0) return [];
      await delay(retryDelay);
      return getFriends(userId, retryDelay * 2, retries - 1);
    }

    if (!response.ok) return [];

    const data = await response.json();
    if (!data?.data) return [];

    const friends = data.data.slice(0, FRIEND_LIMIT).map((f) => ({ id: f.id, name: f.name }));
    CACHE.set(userId, friends);
    return friends;
  } catch {
    return [];
  } finally {
    activeRequests--;
  }
}

// Bidirectional BFS to find friend path
async function findFriendPath(startUsername, endUsername, progressCallback) {
  const startUserId = await getUserId(startUsername);
  const endUserId = await getUserId(endUsername);
  if (!startUserId || !endUserId) return null;
  if (startUserId === endUserId) return [startUsername];

  const queueStart = [[startUserId, [startUsername]]];
  const queueEnd = [[endUserId, [endUsername]]];

  const visitedStart = new Map([[startUserId, [startUsername]]]);
  const visitedEnd = new Map([[endUserId, [endUsername]]]);

  let checkedCount = 0;

  while (queueStart.length && queueEnd.length) {
    // Expand from start side
    const [currentStartId, pathStart] = queueStart.shift();
    const friendsStart = await getFriends(currentStartId);
    checkedCount++;
    if (progressCallback && checkedCount % 10 === 0) {
      progressCallback(`Checked ${checkedCount} users so far...`);
    }
    for (const friend of friendsStart) {
      if (visitedStart.has(friend.id)) continue;

      const newPathStart = [...pathStart, friend.name];
      visitedStart.set(friend.id, newPathStart);

      if (visitedEnd.has(friend.id)) {
        // Path found, merge paths
        const pathEnd = visitedEnd.get(friend.id);
        pathEnd.shift(); // remove duplicate friend
        return [...newPathStart, ...pathEnd.reverse()];
      }

      if (newPathStart.length <= MAX_DEPTH) {
        queueStart.push([friend.id, newPathStart]);
      }
    }

    // Expand from end side
    const [currentEndId, pathEnd] = queueEnd.shift();
    const friendsEnd = await getFriends(currentEndId);
    for (const friend of friendsEnd) {
      if (visitedEnd.has(friend.id)) continue;

      const newPathEnd = [...pathEnd, friend.name];
      visitedEnd.set(friend.id, newPathEnd);

      if (visitedStart.has(friend.id)) {
        // Path found, merge paths
        const pathStart = visitedStart.get(friend.id);
        pathStart.shift(); // remove duplicate friend
        return [...pathStart, ...newPathEnd.reverse()];
      }

      if (newPathEnd.length <= MAX_DEPTH) {
        queueEnd.push([friend.id, newPathEnd]);
      }
    }
  }

  return null;
}

app.get('/friend-path', async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=UTF-8',
    'Transfer-Encoding': 'chunked',
  });

  res.write(`<!DOCTYPE html><html><head><title>Roblox Friend Path</title>
      <style>body{font-family:sans-serif;padding:20px} .progress{color:#888} .path{margin-top:10px}</style>
      </head><body><h2>Roblox Friend Path</h2>
      <form method='get' action='/friend-path'>
          <input type='text' name='start' placeholder='Start Username' required>
          <input type='text' name='end' placeholder='End Username' required>
          <button type='submit'>Find Path</button>
      </form><hr>`);

  const startUser = req.query.start?.trim();
  const endUser = req.query.end?.trim();

  if (!startUser || !endUser) {
    res.write(`<div class='path'><strong>Error:</strong> Missing usernames.</div>`);
    return res.end('</body></html>');
  }

  res.write(`<div class='progress'>Starting search...</div><div class='path'></div>`);

  const path = await findFriendPath(startUser, endUser, (progress) => {
    res.write(`<p class='progress'>${progress}</p>`);
  });

  if (path) {
    res.write(`<script>history.replaceState({}, '', '/friend-path');</script>`);
    res.write(`<div class='path'><strong>Path found:</strong> ${path.join(' → ')}</div>`);
  } else {
    res.write(`<div class='path'><strong>Error:</strong> No friend path found. Profiles may be private or rate limit reached.</div>`);
  }

  res.end('</body></html>');
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
