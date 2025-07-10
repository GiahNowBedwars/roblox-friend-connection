const express = require('express');
const fetch = require('node-fetch');
const app = express();

app.use(express.static('public'));
app.use(express.urlencoded({ extended: true })); // to parse POST form data
app.use(express.json());
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
    // show form with no result initially
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
        res.send(renderForm(null, 'Error occurred while searching. Please try again.', startUser, endUser));
    }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));
