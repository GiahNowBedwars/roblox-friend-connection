const express = require('express');
const fetch = require('node-fetch');
const app = express();

app.use(express.static('public'));
require('dotenv').config();
const ROBLOX_COOKIE = process.env.ROBLOX_COOKIE;

// Get Roblox user ID from username
async function getUserId(username) {
    try {
        const response = await fetch('https://users.roblox.com/v1/usernames/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usernames: [username], excludeBannedUsers: true })
        });
        const data = await response.json();
        return data.data[0]?.id || null;
    } catch (error) {
        return null;
    }
}

// Get friends of a Roblox user by userId
async function getFriends(userId) {
    try {
        const response = await fetch(`https://friends.roblox.com/v1/users/${userId}/friends`, {
            headers: { 'Cookie': `.ROBLOSECURITY=${ROBLOX_COOKIE}` }
        });
        if (response.status !== 200) {
            console.log(`Failed to fetch friends for user ID ${userId}. Status: ${response.status}`);
            return [];
        }
        const data = await response.json();
        return data.data.map(friend => ({ id: friend.id, name: friend.name }));
    } catch (error) {
        console.log(`Error fetching friends for user ID ${userId}: ${error}`);
        return [];
    }
}

// Find shortest friend path between two users using BFS
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

app.get('/friend-path', async (req, res) => {
    const startUser = req.query.start || 'awesomelittleboy9292';
    const endUser = req.query.end || 'Aaron_112s';
    const path = await findFriendPath(startUser, endUser);

    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Roblox Friend Path</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                .friend-path { padding: 15px; border: 1px solid #ddd; border-radius: 5px; background-color: #f9f9f9; max-width: 600px; }
                .friend-path h3 { margin-top: 0; color: #333; }
                .friend-path p { font-size: 16px; color: #555; }
                form label { font-weight: bold; }
                form input { margin-left: 5px; padding: 5px; }
                form button { padding: 5px 10px; margin-left: 10px; }
            </style>
        </head>
        <body>
            <div class="friend-path">
                <h3>Roblox Friend Path</h3>

                <form id="friendPathForm" style="margin-bottom:20px;">
                    <label>
                        Start Username:
                        <input type="text" name="start" id="startInput" required value="${startUser}">
                    </label>
                    <label style="margin-left:10px;">
                        End Username:
                        <input type="text" name="end" id="endInput" required value="${endUser}">
                    </label>
                    <button type="submit">Find Path</button>
                </form>

                ${path ? `<p>${path.join(' → ')}</p>` : `<p style="color:red;">Error: No friend path found. Profiles may be private or rate-limited.</p>`}
            </div>

            <script>
                const form = document.getElementById('friendPathForm');
                form.addEventListener('submit', function(e) {
                    e.preventDefault();
                    const start = document.getElementById('startInput').value.trim();
                    const end = document.getElementById('endInput').value.trim();
                    if (start && end) {
                        window.location.href = \`/friend-path?start=\${encodeURIComponent(start)}&end=\${encodeURIComponent(end)}\`;
                    }
                });
            </script>
        </body>
        </html>
    `);
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));
