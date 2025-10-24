// =================================================================
//              WebRTC P2P Call - Signaling Server
// =================================================================

// --- 1. DEPENDENCIES ---
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

// --- 2. INITIALIZATION ---
const app = express();
const server = http.createServer(app);

// Initialize Socket.IO with CORS settings.
// IMPORTANT: For production, change origin to your specific domain (e.g., "https://p2p.andrewr.online")
// For development, "*" is fine.
const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

// --- 3. MIDDLEWARE ---
// Serve static files from the 'public' directory (for local testing)
app.use(express.static('public'));

// --- 4. SOCKET.IO CONNECTION HANDLING ---
io.on('connection', (socket) => {
    console.log(`[CONNECTION] User connected: ${socket.id}`);

    // --- Room Management Events ---

    // Event: A user wants to join a specific room
    socket.on('join-room', (roomName) => {
        console.log(`[JOIN] User ${socket.id} is attempting to join room: ${roomName}`);

        // Get the list of clients already in the room
        const clientsInRoom = io.sockets.adapter.rooms.get(roomName);
        const otherUsers = clientsInRoom ? Array.from(clientsInRoom) : [];
        console.log(`[JOIN] There are already ${otherUsers.length} user(s) in room ${roomName}.`);
        
        // The user joins the room
        socket.join(roomName);
        console.log(`[JOIN] User ${socket.id} successfully joined room: ${roomName}`);

        // Inform the new user about all other users already in the room.
        // The new user will be the one to initiate the connection offers.
        console.log(`[SIGNAL] Emitting 'all-users' to ${socket.id} with data:`, otherUsers);
        socket.emit('all-users', otherUsers);

        // Inform all other users in the room that a new user has joined.
        // They will wait for an offer from the new user.
        console.log(`[SIGNAL] Emitting 'user-joined' to room ${roomName} for new user ${socket.id}`);
        socket.to(roomName).emit('user-joined', socket.id);
    });

    // --- WebRTC Signaling Events (Proxying) ---

    // Event: Forward an offer from a sender to a target user
    socket.on('offer', (payload) => {
        console.log(`[SIGNAL] Relaying 'offer' from ${socket.id} to ${payload.target}`);
        io.to(payload.target).emit('offer', {
            sdp: payload.sdp,
            sender: socket.id
        });
    });

    // Event: Forward an answer from a sender to a target user
    socket.on('answer', (payload) => {
        console.log(`[SIGNAL] Relaying 'answer' from ${socket.id} to ${payload.target}`);
        io.to(payload.target).emit('answer', {
            sdp: payload.sdp,
            sender: socket.id
        });
    });
    
    // Event: Forward an ICE candidate from a sender to a target user
    socket.on('ice-candidate', (payload) => {
        // This can be very noisy, so it's often commented out in production.
        // console.log(`[SIGNAL] Relaying 'ice-candidate' from ${socket.id} to ${payload.target}`);
        io.to(payload.target).emit('ice-candidate', {
            candidate: payload.candidate,
            sender: socket.id
        });
    });

    // --- Speaking Indication Events ---

    // Event: A user has started speaking
    socket.on('speaking', (payload) => {
        // console.log(`[ACTIVITY] User ${socket.id} in room ${payload.roomName} started speaking.`);
        socket.to(payload.roomName).emit('user_speaking', { userId: socket.id });
    });

    // Event: A user has stopped speaking
    socket.on('stopped_speaking', (payload) => {
        // console.log(`[ACTIVITY] User ${socket.id} in room ${payload.roomName} stopped speaking.`);
        socket.to(payload.roomName).emit('user_stopped_speaking', { userId: socket.id });
    });

    // --- Self-Healing and Reconnection Events ---

    // Event: A client's connection failed, and they are requesting a reconnect
    socket.on('reconnect-request', (payload) => {
        console.log(`[RECONNECT] User ${socket.id} requests reconnect with ${payload.target}`);
        // Instruct the other user to initiate a new connection with the requester
        io.to(payload.target).emit('reconnect-with', { target: socket.id });
    });

    // Event: A client is periodically sending its list of known peers for synchronization
    socket.on('sync-room', (payload) => {
        const clientsInRoom = io.sockets.adapter.rooms.get(payload.roomName);
        if (!clientsInRoom) return;

        const allUserIds = Array.from(clientsInRoom);
        const knownPeers = payload.knownPeers;
        
        // Find peers that the client doesn't know about
        const missingPeers = allUserIds.filter(userId => !knownPeers.includes(userId) && userId !== socket.id);

        if (missingPeers.length > 0) {
            console.log(`[SYNC] User ${socket.id} is missing ${missingPeers.length} peers. Sending 'add-peers'.`);
            socket.emit('add-peers', { peers: missingPeers });
        }
    });

    // --- Disconnect Event ---
    
    // Event: A user has disconnected from the server
    socket.on('disconnect', () => {
        console.log(`[CONNECTION] User disconnected: ${socket.id}`);
        // Inform all other connected clients that this user has left
        io.emit('user-disconnected', socket.id);
    });
});

// --- 5. START SERVER ---
server.listen(PORT, () => {
    console.log(`[SERVER] Signaling server is running on port ${PORT}`);
});
