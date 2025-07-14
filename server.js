// server.js
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

async function getFriends(userId) {
  await sleep(1000);
  const res = await fetch(`https://friends.roblox.com/v1/users/${userId}/friends`, {
    headers: { Cookie: `.ROBLOSECURITY=${COOKIE}` }
  });
  if (res.status === 429) { console.log("Rate-limited, waiting..."); await sleep(2000); return getFriends(userId); }
  const d = await res.json();
  return (d.data||[]).map(x => ({id:x.id, name:x.name}));
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
  if (!sid||!eid) return res.send("Invalid usernames");

  const q1 = [[sid, [s]]], q2 = [[eid, [e]]];
  const v1 = { [sid]: [s] }, v2 = { [eid]: [e] };

  while (q1.length && q2.length) {
    async function expand(q, me, other) {
      const [uid, path] = q.shift();
      const friends = await getFriends(uid);
      for (const f of friends) {
        if (!me[f.id]) {
          me[f.id] = [...path, f.name];
          q.push([f.id, me[f.id]]);
          if (other[f.id]) return [f.id, me[f.id], other[f.id]];
        }
      }
    }
    const res1 = await expand(q1, v1, v2);
    if (res1) {
      const [fid, p1, p2] = res1;
      const p2rev = v2[fid].slice().reverse().slice(1);
      return res.send("Found path: " + [...p1, ...p2rev].join(' → '));
    }
    const res2 = await expand(q2, v2, v1);
    if (res2) {
      const [fid, p2, p1] = res2;
      const p1rev = v1[fid].slice().reverse().slice(1);
      return res.send("Found path: " + [...p1rev, ...p2].join(' → '));
    }
  }

  res.send("No path found");
});

app.listen(process.env.PORT||3000, () => console.log("Listening"));
