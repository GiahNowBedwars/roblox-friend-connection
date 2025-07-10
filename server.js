const express = require('express');
const fetch = require('node-fetch');
const app = express();

app.use(express.static('public'));
require('dotenv').config();
const ROBLOX_COOKIE = process.env.ROBLOX_COOKIE;

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
        return null;
    }
}

async function getFriends(userId) {
    try {
        const response = await fetch(`https://friends.roblox.com/v1/users/${userId}/friends`, {
            headers: { 'Cookie': `.ROBLOSECURITY=${ROBLOX_COOKIE}` }
        });
        const data = await response.json();
        if (response.status !== 200) return [];
        return data.data.map(friend => ({ id: friend.id, name: friend.name }));
    } catch (error) {
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
    const startUser = 'awesomelittleboy9292';
    const endUser = 'Aaron_112s';
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
            </style>
        </head>
        <body>
            <div class="friend-path">
                <h3>Roblox Friend Path</h3>
                ${path ? `<p>${path.map(name => name).join(' → ')}</p>` : `<p>Error: No friend path found. Check if profiles are private or try again later.</p>`}
            </div>
        </body>
        </html>
    `);
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));
