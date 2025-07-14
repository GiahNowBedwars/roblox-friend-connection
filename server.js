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
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernames: [username.toLowerCase()], excludeBannedUsers: true })
  });
  const d = await res.json();
  return d.data[0]?.id || null;
}

async function getUserInfo(userId) {
  try {
    const res = await fetch(`https://users.roblox.com/v1/users/${userId}`);
    const data = await res.json();
    const avatar = await fetch(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${userId}&size=100x100&format=Png&isCircular=true`);
    const avatarData = await avatar.json();
    const imageUrl = avatarData?.data?.[0]?.imageUrl || '';
    return { id: userId, name: data.name, displayName: data.displayName, avatar: imageUrl };
  } catch {
    return { id: userId, name: '', displayName: '', avatar: '' };
  }
}

async function getFriends(userId, retry = 0) {
  await sleep(1200); // Wait 1.2s to avoid 429
  const res = await fetch(`https://friends.roblox.com/v1/users/${userId}/friends`, {
    headers: { Cookie: `.ROBLOSECURITY=${COOKIE}` }
  });

  if (res.status === 429) {
    if (retry >= 3) {
      console.log(`Too many retries for ${userId}`);
      return [];
    }
    const wait = 2000 + retry * 1000;
    console.log(`429 received. Retrying in ${wait}ms...`);
    await sleep(wait);
    return getFriends(userId, retry + 1);
  }

  try {
    const d = await res.json();
    return (d.data || []).map(x => ({ id: x.id, name: x.name }));
  } catch {
    return [];
  }
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
  const s = req.body.s.trim();
  const e = req.body.e.trim();
  const sid = await getUserId(s);
  const eid = await getUserId(e);

  if (!sid || !eid) return res.send("Invalid usernames.");

  const q1 = [[sid, [sid]]];
  const q2 = [[eid, [eid]]];
  const v1 = { [sid]: [sid] };
  const v2 = { [eid]: [eid] };

  while (q1.length && q2.length) {
    async function expand(q, visited, otherSide) {
      const [uid, path] = q.shift();
      const friends = await getFriends(uid);

      for (const f of friends) {
        if (!visited[f.id]) {
          visited[f.id] = [...path, f.id];
          q.push([f.id, visited[f.id]]);
          if (otherSide[f.id]) return f.id;
        }
      }
    }

    const m1 = await expand(q1, v1, v2);
    if (m1) {
      const full = [...v1[m1], ...v2[m1].slice().reverse().slice(1)];
      const infos = await Promise.all(full.map(id => getUserInfo(id)));

      const pathHtml = infos.map(info => `
        <div style="display:inline-block;text-align:center;margin:10px;">
          <img src="${info.avatar}" width="70" height="70" style="border-radius:50%"><br>
          <strong>${info.displayName}</strong><br>
          <small>@${info.name}</small>
        </div>
      `).join('<span style="font-size:30px;">→</span>');

      return res.send(`
        <h2>Friend Path Found</h2>
        <div style="font-family:sans-serif;">${pathHtml}</div>
        <br><a href="/">🔙 Back</a>
      `);
    }

    const m2 = await expand(q2, v2, v1);
    if (m2) {
      const full = [...v1[m2], ...v2[m2].slice().reverse().slice(1)];
      const infos = await Promise.all(full.map(id => getUserInfo(id)));

      const pathHtml = infos.map(info => `
        <div style="display:inline-block;text-align:center;margin:10px;">
          <img src="${info.avatar}" width="70" height="70" style="border-radius:50%"><br>
          <strong>${info.displayName}</strong><br>
          <small>@${info.name}</small>
        </div>
      `).join('<span style="font-size:30px;">→</span>');

      return res.send(`
        <h2>Friend Path Found</h2>
        <div style="font-family:sans-serif;">${pathHtml}</div>
        <br><a href="/">🔙 Back</a>
      `);
    }
  }

  res.send("❌ No friend path found.");
});

app.listen(process.env.PORT || 3000, () => console.log("Listening"));
