// server.js
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
// Инициализируем Socket.IO, разрешая запросы с любого источника (для разработки)
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

// Позволяем серверу раздавать статические файлы (наш HTML и JS)
app.use(express.static('public'));

// Обработка подключений WebSocket
io.on('connection', (socket) => {
    console.log(`[INFO] Пользователь подключился: ${socket.id}`);

    socket.on('join-room', (roomName) => {
        console.log(`[JOIN] Пользователь ${socket.id} пытается войти в комнату ${roomName}`);

        // ИЗМЕНЕНО: Сначала получаем список всех клиентов в комнате.
        // io.sockets.adapter.rooms.get(roomName) возвращает Set с ID всех сокетов в комнате.
        const clientsInRoom = io.sockets.adapter.rooms.get(roomName);
        const numClients = clientsInRoom ? clientsInRoom.size : 0;
        
        // Превращаем Set в массив для удобства
        const otherUsers = clientsInRoom ? [...clientsInRoom] : [];
        
        console.log(`[JOIN] В комнате ${roomName} уже ${numClients} участников.`);

        socket.join(roomName);

        // ДОБАВЛЕНО: Сообщаем новому участнику обо всех, кто уже был в комнате.
        // Он будет инициатором P2P-соединений с ними.
        socket.emit('all-users', otherUsers);

        // ИЗМЕНЕНО: Оповещаем ДРУГИХ участников, что к ним присоединился новый пользователь (с его ID).
        socket.to(roomName).emit('user-joined', socket.id);
    });

    // Этот блок остается без изменений, но я добавил маркеры для отладки
    socket.on('offer', (payload) => {
        console.log(`[OFFER] От ${socket.id} к ${payload.target}`);
        io.to(payload.target).emit('offer', {
            sdp: payload.sdp,
            sender: socket.id // Явно указываем, кто отправитель
        });
    });

    // Этот блок остается без изменений, но я добавил маркеры для отладки
    socket.on('answer', (payload) => {
        console.log(`[ANSWER] От ${socket.id} к ${payload.target}`);
        io.to(payload.target).emit('answer', {
            sdp: payload.sdp,
            sender: socket.id // Явно указываем, кто отправитель
        });
    });
    
    // Этот блок остается без изменений, но я добавил маркеры для отладки
    socket.on('ice-candidate', (payload) => {
        // console.log(`[ICE] От ${socket.id} к ${payload.target}`); // Это будет спамить консоль, можно включать при отладке
        io.to(payload.target).emit('ice-candidate', {
            candidate: payload.candidate,
            sender: socket.id // Явно указываем, кто отправитель
        });
    });

    socket.on('disconnect', () => {
        console.log(`[INFO] Пользователь отключился: ${socket.id}`);
        // ДОБАВЛЕНО: Оповещаем всех в комнате, что пользователь ушел
        io.emit('user-disconnected', socket.id);
    });

    socket.on('speaking', (payload) => {
        // Просто пересылаем сообщение всем в комнате, кроме отправителя
        socket.to(payload.roomName).emit('user_speaking', { userId: socket.id });
    });

    socket.on('stopped_speaking', (payload) => {
        // Аналогично для остановки разговора
        socket.to(payload.roomName).emit('user_stopped_speaking', { userId: socket.id });
    });
});

server.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});