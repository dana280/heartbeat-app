// HeartBeat Server for Cloud Deployment (Render, Railway, Glitch, etc.)
// Run with: node server-node.js

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;

// Store connected users
const users = new Map();

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

                case 'heartbeat':
                    const targetId = data.to;
                    console.log(`💓 Heartbeat: ${userId} -> ${targetId}`);

                    if (users.has(targetId)) {
                        const target = users.get(targetId);
                        target.send({ type: 'heartbeat', from: userId });
                        send({ type: 'delivered', to: targetId });
                    } else {
                        send({ type: 'partner_offline', partnerId: targetId });
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
║                                                    ║
║  Share the URL with your partner!                  ║
║                                                    ║
╚════════════════════════════════════════════════════╝
    `);
});
