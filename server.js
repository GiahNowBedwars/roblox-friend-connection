const fetch = require('node-fetch');
const fs = require('fs');

const CACHE_FILE = './friendCache.json';
const CHECKED_USERS_LOG = './checkedUsers.log';
const ROBLOX_COOKIE = process.env.ROBLOX_COOKIE;

const FRIEND_LIMIT = 1000;
const MAX_PARALLEL = 7;
const REQUEST_DELAY = 1000;

let activeRequests = 0;
let CACHE = new Map();
let logCheckedUsers = [];

// Load friend cache from disk
if (fs.existsSync(CACHE_FILE)) {
    try {
        const raw = fs.readFileSync(CACHE_FILE);
        CACHE = new Map(JSON.parse(raw));
    } catch (e) {
        console.error('Error loading cache:', e);
    }
}

// Save cache to disk every 60 seconds
setInterval(() => {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(Array.from(CACHE.entries())));
}, 60000);

// Save checked users to log every 30 seconds
setInterval(() => {
    if (logCheckedUsers.length > 0) {
        fs.appendFileSync(CHECKED_USERS_LOG, logCheckedUsers.join('\n') + '\n');
        logCheckedUsers = [];
    }
}, 30000);

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

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
            await delay(REQUEST_DELAY); // retry after delay
            return await getFriends(userId);
        }

        const data = await response.json();
        if (!data?.data) return [];

        const friends = data.data.slice(0, FRIEND_LIMIT).map(friend => ({
            id: friend.id,
            name: friend.name
        }));

        CACHE.set(userId, friends);
        return friends;
    } catch (err) {
        console.error(`Failed to get friends for user ID ${userId}`, err);
        return [];
    } finally {
        activeRequests--;
    }
}

function logChecked(username) {
    logCheckedUsers.push(username);
}

module.exports = {
    getUserId,
    getFriends,
    logChecked
};
