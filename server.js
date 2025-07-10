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
        if (data.data.length === 0) return null;
        return data.data[0].id;
    } catch (error) {
        console.error('Error getting userId:', error);
        return null;
    }
}

async function getFriends(userId) {
    try {
        const response = await fetch(`https://friends.roblox.com/v1/users/${userId}/friends`, {
            headers: { 'Cookie': `.ROBLOSECURITY=${ROBLOX_COOKIE}` }
        });
        if (!response.ok) {
            console.warn(`Failed to fetch friends for user ID ${userId}. Status: ${response.status}`);
            return [];
        }
        const data = await response.json();
        return data.data.map(friend => ({ id: friend.id, name: friend.name }));
    } catch (error) {
        console.error(`Error fetching friends for user ID ${userId}:`, error);
        return [];
    }
}

// Try quick mutual friend check first
async function findMutualFriendPath(startUserId, endUserId) {
    console.log(`Checking mutual friends between ${startUserId} and ${endUserId}`);
    const startFriends = await getFriends(startUserId);
    const endFriends = await getFriends(endUserId);

    const startFriendIds = new Set(startFriends.map(f => f.id));
    const endFriendIds = new Set(endFriends.map(f => f.id));

    for (const friend of startFriends) {
        if (endFriendIds.has(friend.id)) {
            console.log(`Mutual friend found: ${friend.name} (${friend.id})`);
            return [startUserId, friend.id, endUserId];
        }
    }
    return null;
}

async function findFriendPath(startUsername, endUsername) {
    const startUserId = await getUserId(startUsername);
    const endUserId = await getUserId(endUsername);
    if (!startUserId || !endUserId) return null;

    // Quick mutual friend check
    const mutualPath = await findMutualFriendPath(startUserId, endUserId);
    if (mutualPath) {
        // Convert IDs back to names for output
        const startName = startUsername;
        const endName = endUsername;
        const mutualFriendId = mutualPath[1];
        // Find mutual friend name from friends list
        const startFriends = await getFriends(startUserId);
        const mutualFriendName = startFriends.find(f => f.id === mutualFriendId)?.name || 'MutualFriend';
        return [startName, mutualFriendName, endName];
    }

    // BFS for longer paths
    const queue = [[startUserId, [startUsername]]];
    const visited = { [startUserId]: true };
    const userIdToName = { [startUserId]: startUsername };

    while (queue.length > 0) {
        const [currentUserId, path] = queue.shift();

        console.log(`Checking user ID ${currentUserId} with path length ${path.length}`);

        const friends = await getFriends(currentUserId);
        friends.forEach(f => { userIdToName[f.id] = f.name; });

        for (const friend of friends) {
            if (!visited[friend.id]) {
                const newPath = [...path, friend.name];
                if (friend.id === endUserId) {
                    return newPath;
                }
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
    console.log(`Finding path from ${startUser} to ${endUser}`);

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
                ${path ? `<p>${path.join(' → ')}</p>` : `<p>Error: No friend path found. Profiles may be private or rate-limited.</p>`}
            </div>
        </body>
        </html>
    `);
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));
