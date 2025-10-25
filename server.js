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
const io = new Server(server, {
    cors: {
        origin: "*", // IMPORTANT: For production, change this to your specific domain
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

    socket.on('join-room', (roomName) => {
        console.log(`[JOIN] User ${socket.id} is attempting to join room: ${roomName}`);

        // --- Limit users to 2 per room ---
        const clientsInRoom = io.sockets.adapter.rooms.get(roomName);
        const numClients = clientsInRoom ? clientsInRoom.size : 0;
        console.log(`[JOIN] There are already ${numClients} user(s) in room ${roomName}.`);

        // Check if the room is full
        if (numClients >= 2) {
            console.log(`[REJECT] Room ${roomName} is full. Rejecting user ${socket.id}.`);
            // Notify the client that the room is full and stop further execution
            socket.emit('room-full');
            return;
        }

        // If the room is not full, proceed with joining
        const otherUsers = clientsInRoom ? Array.from(clientsInRoom) : [];
        
        socket.join(roomName);
        console.log(`[JOIN] User ${socket.id} successfully joined room: ${roomName}`);

        // Send the list of existing users to the new user
        console.log(`[SIGNAL] Emitting 'all-users' to ${socket.id} with data:`, otherUsers);
        socket.emit('all-users', otherUsers);

        // Announce the new user to others in the room
        console.log(`[SIGNAL] Emitting 'user-joined' to room ${roomName} for new user ${socket.id}`);
        socket.to(roomName).emit('user-joined', socket.id);
    });

    // --- WebRTC Signaling Events (Proxying) ---

    socket.on('offer', (payload) => {
        console.log(`[SIGNAL] Relaying 'offer' from ${socket.id} to ${payload.target}`);
        io.to(payload.target).emit('offer', { sdp: payload.sdp, sender: socket.id });
    });

    socket.on('answer', (payload) => {
        console.log(`[SIGNAL] Relaying 'answer' from ${socket.id} to ${payload.target}`);
        io.to(payload.target).emit('answer', { sdp: payload.sdp, sender: socket.id });
    });
    
    socket.on('ice-candidate', (payload) => {
        // Logging for ICE candidates can be very verbose, so it's commented out by default
        // console.log(`[SIGNAL] Relaying 'ice-candidate' from ${socket.id} to ${payload.target}`);
        io.to(payload.target).emit('ice-candidate', { candidate: payload.candidate, sender: socket.id });
    });

    // --- Speaking Indication Events ---

    socket.on('speaking', (payload) => {
        // console.log(`[ACTIVITY] User ${socket.id} in room ${payload.roomName} started speaking.`);
        socket.to(payload.roomName).emit('user_speaking', { userId: socket.id });
    });

    socket.on('stopped_speaking', (payload) => {
        // console.log(`[ACTIVITY] User ${socket.id} in room ${payload.roomName} stopped speaking.`);
        socket.to(payload.roomName).emit('user_stopped_speaking', { userId: socket.id });
    });

    // --- Self-Healing and Reconnection Events ---

    socket.on('reconnect-request', (payload) => {
        console.log(`[RECONNECT] User ${socket.id} requests reconnect with ${payload.target}`);
        io.to(payload.target).emit('reconnect-with', { target: socket.id });
    });

    socket.on('sync-room', (payload) => {
        const clientsInRoom = io.sockets.adapter.rooms.get(payload.roomName);
        if (!clientsInRoom) return;
        
        const allUserIds = Array.from(clientsInRoom);
        const knownPeers = payload.knownPeers;
        const missingPeers = allUserIds.filter(userId => !knownPeers.includes(userId) && userId !== socket.id);
        
        if (missingPeers.length > 0) {
            console.log(`[SYNC] User ${socket.id} is missing ${missingPeers.length} peers. Sending 'add-peers'.`);
            socket.emit('add-peers', { peers: missingPeers });
        }
    });

    // --- Screen Share Management Events ---
    
    socket.on('screen_share_request', ({ roomName, sharerName }) => {
        console.log(`[SCREEN] User ${socket.id} (${sharerName}) requested to share screen in room ${roomName}.`);
        // We broadcast this request to the entire room. The current sharer's client will handle it.
        socket.to(roomName).emit('screen_share_permission_request', { 
            requesterId: socket.id, 
            requesterName: sharerName 
        });
    });

    socket.on('screen_share_permission_granted', ({ roomName, targetId }) => {
        console.log(`[SCREEN] Permission granted by ${socket.id} to ${targetId}.`);
        // Tell the original requester that they have a "token" to start sharing
        io.to(targetId).emit('screen_share_token_granted');
    });

    socket.on('user_started_sharing', ({ roomName }) => {
        console.log(`[SCREEN] User ${socket.id} is now the active sharer in room ${roomName}.`);
        // Inform everyone in the room (including the sharer) who is now presenting
        io.to(roomName).emit('current_sharer_updated', { sharerId: socket.id });
    });

    socket.on('user_stopped_sharing', ({ roomName }) => {
        console.log(`[SCREEN] User ${socket.id} stopped sharing in room ${roomName}.`);
        // Inform everyone that no one is sharing anymore
        io.to(roomName).emit('current_sharer_updated', { sharerId: null });
    });

    // --- Disconnect Event ---
    
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
