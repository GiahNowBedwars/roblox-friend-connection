const express = require('express');
const fetch = require('node-fetch');
require('dotenv').config();
const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const COOKIE = process.env.ROBLOX_COOKIE;
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function getUserId(username) {
  const res = await fetch('https://users.roblox.com/v1/usernames/users', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({usernames:[username.toLowerCase()], excludeBannedUsers:true})
  });
  const d = await res.json();
  return d.data[0]?.id || null;
}

async function getUserProfile(userId) {
  try {
    const [avatarRes, profileRes] = await Promise.all([
      fetch(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${userId}&size=100x100&format=Png&isCircular=false`),
      fetch(`https://users.roblox.com/v1/users/${userId}`)
    ]);
    const avatar = await avatarRes.json();
    const profile = await profileRes.json();
    return {
      id: userId,
      username: profile.name,
      displayName: profile.displayName || profile.name,
      avatar: avatar?.data?.[0]?.imageUrl || ''
    };
  } catch (e) {
    return { id: userId, username: 'Unknown', displayName: 'Unknown', avatar: '' };
  }
}

async function getFriends(userId) {
  await sleep(1000);
  const res = await fetch(`https://friends.roblox.com/v1/users/${userId}/friends`, {
    headers: { Cookie: `.ROBLOSECURITY=${COOKIE}` }
  });
  if (res.status === 429) {
    console.log("Rate-limited, waiting...");
    await sleep(2000);
    return getFriends(userId);
  }
  const d = await res.json();
  return (d.data || []).map(x => ({ id: x.id, name: x.name }));
}

app.get('/', (req, res) => {
  res.send(`
    <form method="POST" action="/">
      <input name="s" placeholder="Start username" required>
      <input name="e" placeholder="End username" required>
      <button>Find path</button>
    </form>
  `);
});

app.post('/', async (req, res) => {
  const s = req.body.s.trim(), e = req.body.e.trim();
  const sid = await getUserId(s), eid = await getUserId(e);
  if (!sid || !eid) return res.send("Invalid usernames");

  const q1 = [[sid, [sid]]], q2 = [[eid, [eid]]];
  const v1 = { [sid]: [sid] }, v2 = { [eid]: [eid] };

  while (q1.length && q2.length) {
    async function expand(q, me, other) {
      const [uid, path] = q.shift();
      const friends = await getFriends(uid);
      for (const f of friends) {
        if (!me[f.id]) {
          me[f.id] = [...path, f.id];
          q.push([f.id, me[f.id]]);
          if (other[f.id]) return [f.id, me[f.id], other[f.id]];
        }
      }
    }
    const res1 = await expand(q1, v1, v2);
    if (res1) {
      const [mid, p1, p2] = res1;
      const fullPath = [...p1, ...p2.reverse().slice(1)];
      return showPath(res, fullPath);
    }
    const res2 = await expand(q2, v2, q1);
    if (res2) {
      const [mid, p2, p1] = res2;
      const fullPath = [...p1.reverse().slice(1), ...p2];
      return showPath(res, fullPath);
    }
  }

  res.send("No path found");
});

async function showPath(res, userIds) {
  const profiles = await Promise.all(userIds.map(id => getUserProfile(id)));
  const html = profiles.map(p => `
    <div style="display:inline-block;text-align:center;margin:10px;">
      <img src="${p.avatar}" width="100" height="100" style="border-radius:8px"><br>
      <strong>${p.displayName}</strong><br>
      <small>@${p.username}</small>
    </div>
  `).join('→');
  res.send(`<h2>Friend Path</h2>${html}<br><br><a href="/">Find another path</a>`);
}

app.listen(process.env.PORT || 3000, () => console.log("Listening"));
