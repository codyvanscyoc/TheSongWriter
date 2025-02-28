const WebSocket = require('ws');
const http = require('http');
const url = require('url');

const server = http.createServer();
const wss = new WebSocket.Server({ server });

// Store clients by room
const rooms = new Map();

wss.on('connection', (ws, req) => {
    const params = url.parse(req.url, true).query;
    const room = params.room || 'default';
    
    // Add client to room
    if (!rooms.has(room)) rooms.set(room, new Set());
    rooms.get(room).add(ws);
    console.log(`Client joined room: ${room}`);

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type === 'pdfUpdate') {
                // Broadcast to all clients in the room except sender
                rooms.get(room).forEach(client => {
                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify(data));
                    }
                });
            }
        } catch (err) {
            console.error('Message error:', err);
        }
    });

    ws.on('close', () => {
        rooms.get(room).delete(ws);
        if (rooms.get(room).size === 0) rooms.delete(room);
        console.log(`Client left room: ${room}`);
    });

    ws.on('error', (err) => console.error('WebSocket error:', err));
});

server.listen(8080, () => {
    console.log('WebSocket server running on ws://localhost:8080');
});
