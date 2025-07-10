const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
require('dotenv').config();

const app = express();
const ROBLOX_COOKIE = process.env.ROBLOX_COOKIE;

app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// Helper function: sleep for rate limiting
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Fetch user ID from username
async function getUserId(username) {
    try {
        const res = await fetch('https://users.roblox.com/v1/usernames/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usernames: [username], excludeBannedUsers: true })
        });
        const data = await res.json();
        return data.data[0]?.id || null;
    } catch (e) {
        console.error('getUserId error:', e);
        return null;
    }
}

// Fetch friend list of a user ID
async function getFriends(userId) {
    try {
        const res = await fetch(`https://friends.roblox.com/v1/users/${userId}/friends`, {
            headers: { 'Cookie': `.ROBLOSECURITY=${ROBLOX_COOKIE}` }
        });
        if (res.status === 429) {
            console.warn(`Rate limit hit while fetching ${userId}`);
            await delay(1000); // wait 1s if rate limited
            return await getFriends(userId); // retry once
        }
        if (res.status !== 200) return [];
        const data = await res.json();
        return data.data.map(friend => ({ id: friend.id, name: friend.name }));
    } catch (e) {
        console.error(`Failed to get friends of ${userId}`, e);
        return [];
    }
}

// Breadth-first search to find friend path
async function findFriendPath(startUsername, endUsername, maxUsers = 1234) {
    const startId = await getUserId(startUsername);
    const endId = await getUserId(endUsername);
    if (!startId || !endId) return null;

    const queue = [[startId, [startUsername]]];
    const visited = new Set([startId]);
    const idToName = { [startId]: startUsername };
    let processed = 0;

    while (queue.length > 0 && processed < maxUsers) {
        const [userId, path] = queue.shift();
        console.log(`Checking user ID ${userId} (${idToName[userId]}) with path length ${path.length}`);
        const friends = await getFriends(userId);
        processed++;
        await delay(1000); // 1 second between requests

        for (const friend of friends) {
            const friendId = friend.id;
            const friendName = friend.name;
            idToName[friendId] = friendName;

            if (!visited.has(friendId)) {
                const newPath = [...path, friendName];
                if (friendId === endId || friendName.toLowerCase() === endUsername.toLowerCase()) {
                    return newPath;
                }
                visited.add(friendId);
                queue.push([friendId, newPath]);
            }
        }
    }

    return null;
}

// Web form to input usernames
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Roblox Friend Path Finder</title>
            <style>
                body { font-family: sans-serif; padding: 20px; }
                input, button { padding: 10px; font-size: 16px; }
                .result { margin-top: 20px; background: #f0f0f0; padding: 15px; border-radius: 5px; }
            </style>
        </head>
        <body>
            <h2>Find Roblox Friend Path</h2>
            <form action="/friend-path" method="GET">
                <label>Start Username: <input type="text" name="start" required></label><br><br>
                <label>End Username: <input type="text" name="end" required></label><br><br>
                <button type="submit">Find Path</button>
            </form>
        </body>
        </html>
    `);
});

// Handle input and show result
app.get('/friend-path', async (req, res) => {
    const startUser = req.query.start;
    const endUser = req.query.end;
    const path = await findFriendPath(startUser, endUser);

    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Roblox Friend Path Result</title>
            <style>
                body { font-family: sans-serif; padding: 20px; }
                .path { background: #f9f9f9; padding: 15px; border-radius: 5px; border: 1px solid #ccc; }
                a { text-decoration: none; color: blue; }
            </style>
        </head>
        <body>
            <a href="/">← Back</a>
            <div class="path">
                <h3>Roblox Friend Path</h3>
                ${
                  path
                    ? `<p>${path.join(' → ')}</p>`
                    : `<p>No path found between <strong>${startUser}</strong> and <strong>${endUser}</strong>. Try again or check privacy settings.</p>`
                }
            </div>
        </body>
        </html>
    `);
});

// Start server
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
