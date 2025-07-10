const express = require('express');
const fetch = require('node-fetch');
const app = express();

app.use(express.static('public'));
require('dotenv').config();
const ROBLOX_COOKIE = process.env.ROBLOX_COOKIE;

function wait(ms) {
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
        return data.data[0]?.id;
    } catch (error) {
        console.log(`Error fetching user ID for ${username}: ${error}`);
        return null;
    }
}

async function getFriends(userId) {
    const maxFriends = 1234;
    let allFriends = [];
    let cursor = null;

    try {
        do {
            const url = new URL(`https://friends.roblox.com/v1/users/${userId}/friends`);
            if (cursor) url.searchParams.append('cursor', cursor);

            const response = await fetch(url.toString(), {
                headers: { 'Cookie': `.ROBLOSECURITY=${ROBLOX_COOKIE}` }
            });

            if (response.status !== 200) {
                console.log(`Failed to fetch friends for user ID ${userId}. Status: ${response.status}`);
                break;
            }

            const data = await response.json();
            allFriends = allFriends.concat(data.data);

            if (allFriends.length >= maxFriends) {
                allFriends = allFriends.slice(0, maxFriends);
                break;
            }

            cursor = data.nextPageCursor || null;

            if (cursor) await wait(650); // wait 650ms before next page fetch
        } while (cursor);

        return allFriends.map(friend => ({ id: friend.id, name: friend.name }));

    } catch (error) {
        console.log(`Error fetching friends for user ID ${userId}: ${error}`);
        return [];
    }
}

async function findFriendPath(startUsername, endUsername) {
    const startUserId = await getUserId(startUsername);
    const endUserId = await getUserId(endUsername);
    if (!startUserId || !endUserId) return null;

    const queue = [[startUserId, [startUsername]]];
    const visited = { [startUserId]: true };
    const userIdToName = { [startUserId]: startUsername };

    while (queue.length > 0) {
        const [currentUserId, path] = queue.shift();
        const currentUsername = userIdToName[currentUserId];

        console.log(`Checking user ID ${currentUserId} (${currentUsername}) with path length ${path.length}`);

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

app.get('/', (req, res) => {
    res.redirect('/friend-path');
});

app.get('/friend-path', async (req, res) => {
    const { start, end } = req.query;

    if (!start || !end) {
        return res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Roblox Friend Path Finder</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 20px; }
                    input, button { padding: 10px; font-size: 16px; margin: 5px 0; width: 300px; }
                    .friend-path { padding: 15px; border: 1px solid #ddd; border-radius: 5px; background-color: #f9f9f9; max-width: 600px; }
                    .friend-path h3 { margin-top: 0; color: #333; }
                    .friend-path p { font-size: 16px; color: #555; }
                </style>
            </head>
            <body>
                <h2>Roblox Friend Path Finder</h2>
                <form method="GET" action="/friend-path">
                    <label for="start">Start Username:</label><br>
                    <input type="text" id="start" name="start" placeholder="e.g. awesomelittleboy9292" required><br>
                    <label for="end">End Username:</label><br>
                    <input type="text" id="end" name="end" placeholder="e.g. Aaron_112s" required><br>
                    <button type="submit">Find Path</button>
                </form>
            </body>
            </html>
        `);
    }

    const path = await findFriendPath(start, end);

    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Roblox Friend Path Result</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                .friend-path { padding: 15px; border: 1px solid #ddd; border-radius: 5px; background-color: #f9f9f9; max-width: 600px; }
                .friend-path h3 { margin-top: 0; color: #333; }
                .friend-path p { font-size: 16px; color: #555; }
                a { text-decoration: none; color: #0073e6; }
            </style>
        </head>
        <body>
            <h2>Roblox Friend Path Finder</h2>
            <form method="GET" action="/friend-path">
                <label for="start">Start Username:</label><br>
                <input type="text" id="start" name="start" value="${start}" required><br>
                <label for="end">End Username:</label><br>
                <input type="text" id="end" name="end" value="${end}" required><br>
                <button type="submit">Find Path</button>
            </form>
            <div class="friend-path">
                <h3>Result:</h3>
                ${path ? `<p>${path.map(name => name).join(' → ')}</p>` : `<p>Error: No friend path found. Check if profiles are private or try again later.</p>`}
            </div>
        </body>
        </html>
    `);
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));
