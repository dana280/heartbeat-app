// HeartBeat Server for Cloud Deployment (Render, Railway, Glitch, etc.)
// Run with: node server-node.js

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;

// Store connected users
const users = new Map();

// Store FCM tokens for push notifications
const pushTokens = new Map();

// Firebase Service Account credentials from environment variable
const FIREBASE_SERVICE_ACCOUNT = process.env.FIREBASE_SERVICE_ACCOUNT
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    : null;

// Get OAuth2 access token for Firebase
let cachedAccessToken = null;
let tokenExpiry = 0;

async function getAccessToken() {
    if (cachedAccessToken && Date.now() < tokenExpiry) {
        return cachedAccessToken;
    }

    if (!FIREBASE_SERVICE_ACCOUNT) {
        console.log('No Firebase service account configured');
        return null;
    }

    const now = Math.floor(Date.now() / 1000);
    const expiry = now + 3600;

    // Create JWT
    const header = Buffer.from(JSON.stringify({
        alg: 'RS256',
        typ: 'JWT'
    })).toString('base64url');

    const payload = Buffer.from(JSON.stringify({
        iss: FIREBASE_SERVICE_ACCOUNT.client_email,
        sub: FIREBASE_SERVICE_ACCOUNT.client_email,
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: expiry,
        scope: 'https://www.googleapis.com/auth/firebase.messaging'
    })).toString('base64url');

    const signInput = `${header}.${payload}`;

    const sign = crypto.createSign('RSA-SHA256');
    sign.update(signInput);
    const signature = sign.sign(FIREBASE_SERVICE_ACCOUNT.private_key, 'base64url');

    const jwt = `${signInput}.${signature}`;

    // Exchange JWT for access token
    return new Promise((resolve, reject) => {
        const postData = `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`;

        const req = https.request({
            hostname: 'oauth2.googleapis.com',
            port: 443,
            path: '/token',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData)
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    if (response.access_token) {
                        cachedAccessToken = response.access_token;
                        tokenExpiry = Date.now() + (response.expires_in - 60) * 1000;
                        resolve(cachedAccessToken);
                    } else {
                        console.error('Token error:', data);
                        resolve(null);
                    }
                } catch (e) {
                    console.error('Token parse error:', e);
                    resolve(null);
                }
            });
        });

        req.on('error', (e) => {
            console.error('Token request error:', e);
            resolve(null);
        });

        req.write(postData);
        req.end();
    });
}

// Send push notification via FCM V1 API
async function sendPushNotification(token, fromUserId) {
    const accessToken = await getAccessToken();

    if (!accessToken || !token) {
        console.log('Push notification skipped - no access token or FCM token');
        return;
    }

    const projectId = FIREBASE_SERVICE_ACCOUNT.project_id;

    const message = {
        message: {
            token: token,
            notification: {
                title: '💕 HeartBeat',
                body: `קיבלת פעימת לב מ-${fromUserId}!`
            },
            data: {
                from: fromUserId,
                type: 'heartbeat'
            },
            webpush: {
                headers: {
                    Urgency: 'high'
                },
                notification: {
                    icon: '/icon-192.png',
                    vibrate: [200, 100, 200, 100, 300],
                    requireInteraction: true
                }
            }
        }
    };

    const postData = JSON.stringify(message);

    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'fcm.googleapis.com',
            port: 443,
            path: `/v1/projects/${projectId}/messages:send`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
                'Content-Length': Buffer.byteLength(postData)
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                console.log('FCM response:', data);
                if (res.statusCode === 200) {
                    resolve(data);
                } else {
                    reject(new Error(data));
                }
            });
        });

        req.on('error', (e) => {
            console.error('FCM error:', e);
            reject(e);
        });

        req.write(postData);
        req.end();
    });
}

// MIME types
const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.ico': 'image/x-icon'
};

// Create HTTP server
const server = http.createServer((req, res) => {
    // Handle regular HTTP requests (serve static files)
    let filePath = req.url === '/' ? '/index.html' : req.url;
    filePath = path.join(__dirname, filePath);

    const ext = path.extname(filePath);
    const contentType = mimeTypes[ext] || 'text/plain';

    fs.readFile(filePath, (err, content) => {
        if (err) {
            res.writeHead(404);
            res.end('Not Found');
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content);
        }
    });
});

// WebSocket handling (raw implementation - no ws package needed for basic use)
server.on('upgrade', (req, socket) => {
    // Calculate WebSocket accept key
    const key = req.headers['sec-websocket-key'];
    const acceptKey = crypto
        .createHash('sha1')
        .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
        .digest('base64');

    // Send upgrade response
    socket.write(
        'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${acceptKey}\r\n` +
        '\r\n'
    );

    let userId = null;

    // Send WebSocket frame
    function send(data) {
        const json = JSON.stringify(data);
        const buffer = Buffer.from(json);
        const frame = Buffer.alloc(2 + buffer.length);
        frame[0] = 0x81; // text frame
        frame[1] = buffer.length;
        buffer.copy(frame, 2);
        socket.write(frame);
    }

    // Handle incoming data
    socket.on('data', (buffer) => {
        try {
            // Parse WebSocket frame
            const firstByte = buffer[0];
            const opcode = firstByte & 0x0F;

            // Close frame
            if (opcode === 0x08) {
                socket.end();
                return;
            }

            // Ping frame - respond with pong
            if (opcode === 0x09) {
                const pong = Buffer.alloc(2);
                pong[0] = 0x8A; // pong
                pong[1] = 0;
                socket.write(pong);
                return;
            }

            const secondByte = buffer[1];
            const isMasked = (secondByte & 0x80) !== 0;
            let payloadLength = secondByte & 0x7F;
            let offset = 2;

            if (payloadLength === 126) {
                payloadLength = buffer.readUInt16BE(2);
                offset = 4;
            } else if (payloadLength === 127) {
                payloadLength = buffer.readBigUInt64BE(2);
                offset = 10;
            }

            let mask = null;
            if (isMasked) {
                mask = buffer.slice(offset, offset + 4);
                offset += 4;
            }

            let payload = buffer.slice(offset, offset + Number(payloadLength));

            if (isMasked) {
                for (let i = 0; i < payload.length; i++) {
                    payload[i] ^= mask[i % 4];
                }
            }

            const message = payload.toString('utf8');
            const data = JSON.parse(message);

            // Handle message types
            switch (data.type) {
                case 'register':
                    userId = data.userId;
                    users.set(userId, { socket, send, partnerId: data.partnerId });
                    console.log(`User ${userId} registered`);

                    send({ type: 'registered', userId });

                    // Notify partner if online
                    if (data.partnerId && users.has(data.partnerId)) {
                        const partner = users.get(data.partnerId);
                        partner.send({ type: 'partner_online', partnerId: userId });
                        send({ type: 'partner_online', partnerId: data.partnerId });
                    }
                    break;

                case 'register_push':
                    // Store FCM token for push notifications
                    if (data.userId && data.token) {
                        pushTokens.set(data.userId, data.token);
                        console.log(`Push token registered for ${data.userId}`);
                    }
                    break;

                case 'heartbeat':
                    const targetId = data.to;
                    console.log(`💓 Heartbeat: ${userId} -> ${targetId}`);

                    if (users.has(targetId)) {
                        const target = users.get(targetId);
                        target.send({ type: 'heartbeat', from: userId });
                        send({ type: 'delivered', to: targetId });
                    } else {
                        // User offline - try push notification
                        if (pushTokens.has(targetId)) {
                            console.log(`Sending push notification to ${targetId}`);
                            sendPushNotification(pushTokens.get(targetId), userId)
                                .then(() => send({ type: 'delivered', to: targetId, viaPush: true }))
                                .catch(() => send({ type: 'partner_offline', partnerId: targetId }));
                        } else {
                            send({ type: 'partner_offline', partnerId: targetId });
                        }
                    }
                    break;

                case 'update_partner':
                    if (userId && users.has(userId)) {
                        users.get(userId).partnerId = data.partnerId;
                        if (users.has(data.partnerId)) {
                            send({ type: 'partner_online', partnerId: data.partnerId });
                        }
                    }
                    break;
            }
        } catch (e) {
            // Ignore parse errors
        }
    });

    socket.on('close', () => {
        if (userId) {
            console.log(`User ${userId} disconnected`);
            const user = users.get(userId);
            if (user && user.partnerId && users.has(user.partnerId)) {
                const partner = users.get(user.partnerId);
                partner.send({ type: 'partner_offline', partnerId: userId });
            }
            users.delete(userId);
        }
    });

    socket.on('error', () => {});
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔════════════════════════════════════════════════════╗
║        💕 HeartBeat Server Running! 💕             ║
╠════════════════════════════════════════════════════╣
║                                                    ║
║  Server running on port ${PORT}                       ║
║  Push notifications: ${FIREBASE_SERVICE_ACCOUNT ? 'ENABLED' : 'DISABLED'}              ║
║                                                    ║
║  Share the URL with your partner!                  ║
║                                                    ║
╚════════════════════════════════════════════════════╝
    `);
});
