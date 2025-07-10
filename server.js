// server.js
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
    return new Promise(resolve => setTimeout(resolve, ms));
}

let activeRequests = 0;
const MAX_PARALLEL = 5;
const CACHE_FILE = './friendCache.json';
const MAX_DEPTH = 1234;
const FRIEND_LIMIT = 1000; // increased from 500
let CACHE = new Map();

// Load cache from disk if available
if (fs.existsSync(CACHE_FILE)) {
    try {
        const raw = fs.readFileSync(CACHE_FILE);
        const parsed = JSON.parse(raw);
        CACHE = new Map(parsed);
    } catch (e) { console.error('Cache load error', e); }
}

// Save cache to disk every 60 seconds
setInterval(() => {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(Array.from(CACHE.entries())));
}, 60000);

async function getUserId(username) {
    const response = await fetch('https://users.roblox.com/v1/usernames/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernames: [username.toLowerCase()], excludeBannedUsers: true })
    });
    const data = await response.json();
    return data.data[0]?.id;
}

async function getFriends(userId) {
    if (CACHE.has(userId)) return CACHE.get(userId);

    while (activeRequests >= MAX_PARALLEL) {
        await delay(200);
    }

    activeRequests++;
    try {
        const response = await fetch(`https://friends.roblox.com/v1/users/${userId}/friends`, {
            headers: { 'Cookie': `.ROBLOSECURITY=${ROBLOX_COOKIE}` }
        });

        if (response.status === 429) {
            await delay(1000); // delay before retrying due to rate limit
            return await getFriends(userId);
        }

        const data = await response.json();
        if (!data?.data) return [];
        const friends = data.data.slice(0, FRIEND_LIMIT).map(friend => ({ id: friend.id, name: friend.name }));
        CACHE.set(userId, friends);
        return friends;
    } catch (error) {
        return [];
    } finally {
        activeRequests--;
    }
}

async function findFriendPath(startUsername, endUsername, progressCallback) {
    const startUserId = await getUserId(startUsername);
    const endUserId = await getUserId(endUsername);
    if (!startUserId || !endUserId) return null;

    const queue = [[startUserId, [startUsername]]];
    const visited = { [startUserId]: true };
    const userIdToName = { [startUserId]: startUsername };

    let checkedUsersCount = 0;
    const maxUsersToCheck = 20000; // safety limit to avoid infinite loop

    const startTime = Date.now();

    while (queue.length > 0) {
        if (checkedUsersCount >= maxUsersToCheck) {
            break;
        }

        const [currentUserId, path] = queue.shift();
        const currentUsername = userIdToName[currentUserId];
        checkedUsersCount++;

        // Calculate ETA and progress
        const elapsed = (Date.now() - startTime) / 1000; // seconds
        const avgTimePerUser = elapsed / checkedUsersCount;
        const usersLeft = maxUsersToCheck - checkedUsersCount;
        const etaSeconds = Math.round(usersLeft * avgTimePerUser);
        const progressPercent = Math.min(100, Math.round((checkedUsersCount / maxUsersToCheck) * 100));

        if (progressCallback) progressCallback({
            username: currentUsername,
            checkedUsersCount,
            maxUsersToCheck,
            etaSeconds,
            progressPercent
        });

        const friends = await getFriends(currentUserId);
        friends.forEach(f => { userIdToName[f.id] = f.name; });

        for (const friend of friends) {
            if (!visited[friend.id]) {
                const newPath = [...path, friend.name];
                if (friend.id === endUserId) return newPath;
                visited[friend.id] = true;
                queue.push([friend.id, newPath]);
            }
        }
    }

    return null;
}

app.get('/friend-path', async (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/html; charset=UTF-8',
        'Transfer-Encoding': 'chunked'
    });

    res.write(`<!DOCTYPE html><html><head><title>Roblox Friend Path</title>
        <style>
            body { font-family:sans-serif; padding:20px; }
            .progress { color:#888; }
            .path { margin-top:10px; }
            #progressBarContainer {
                width: 100%; background-color: #ddd; border-radius: 5px; margin-top: 10px;
            }
            #progressBar {
                width: 0%; height: 20px; background-color: #4caf50; border-radius: 5px;
                transition: width 0.3s ease;
            }
        </style>
        </head><body><h2>Roblox Friend Path</h2>
        <form method='get' action='/friend-path'>
            <input type='text' name='start' placeholder='Start Username' required>
            <input type='text' name='end' placeholder='End Username' required>
            <button type='submit'>Find Path</button>
        </form><hr>`);

    const startUser = req.query.start?.trim() || '';
    const endUser = req.query.end?.trim() || '';
    if (!startUser || !endUser) {
        res.write(`<div class='path'><strong>Error:</strong> Missing usernames.</div>`);
        return res.end('</body></html>');
    }

    res.write(`<div class='progress'>
        Searching...<br>
        <div id="progressBarContainer"><div id="progressBar"></div></div>
        <div id="status">Checked: 0 / 0 | ETA: Calculating...</div>
    </div><div class='path'></div>`);

    const path = await findFriendPath(startUser, endUser, ({ username, checkedUsersCount, maxUsersToCheck, etaSeconds, progressPercent }) => {
        // Escape any HTML in username to avoid injection
        const safeUsername = username.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        res.write(`<script>
            document.getElementById('status').innerText = 'Checking: ${safeUsername} | Checked: ${checkedUsersCount} / ${maxUsersToCheck} | ETA: ${etaSeconds}s';
            document.getElementById('progressBar').style.width = '${progressPercent}%';
        </script>`);
    });

    if (path) {
        res.write(`<script>history.replaceState({}, '', '/friend-path');</script>`);
        res.write(`<div class='path'><strong>Path found:</strong> ${path.join(' → ')}</div>`);
    } else {
        res.write(`<div class='path'><strong>Error:</strong> No friend path found or rate limit reached.</div>`);
    }

    res.end('</body></html>');
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
