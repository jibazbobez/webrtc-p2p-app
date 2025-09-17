/**
 * WebRTC P2P Conference Call Script
 * 
 * Этот скрипт управляет всей клиентской логикой для WebRTC звонка:
 * 1. Подключение к сигнальному серверу через Socket.IO.
 * 2. Генерация и обработка уникальных имен комнат.
 * 3. Получение доступа к медиа-устройствам (камера, микрофон).
 * 4. Управление элементами интерфейса (кнопки, видеоэлементы).
 * 5. Реализация логики WebRTC для установления P2P-соединений (Mesh-архитектура).
 * 6. Управление медиа-потоками (включение/отключение микрофона и камеры).
 */

// --- 1. Константы и начальная настройка ---

// Подключение к нашему сигнальному серверу.
const socket = io('https://webrtc-p2p-app.onrender.com');

const ICON_PATHS = {
    micOn: 'assets/icon_micro.svg',
    micOff: 'assets/icon_micro_off.svg',
    videoOn: 'assets/icon_camera.svg',
    videoOff: 'assets/icon_camera_off.svg'
};

// --- 2. Получение элементов DOM ---
const joinSection = document.getElementById('join-section');
const videosSection = document.getElementById('videos-section');
const localVideo = document.getElementById('local-video');
const videosContainer = document.getElementById('videos');
const roomInput = document.getElementById('room-input');
const joinBtn = document.getElementById('join-btn');
const regenerateBtn = document.getElementById('regenerate-btn');
const roomNameDisplay = document.getElementById('room-name-display');
const callControls = document.getElementById('call-controls');
const muteBtn = document.getElementById('mute-btn');
const videoBtn = document.getElementById('video-btn');
const micTestCheckbox = document.getElementById('mic-test-checkbox');
const roomNameContainer = document.getElementById('room-name-container');
const roomNameText = document.getElementById('room-name-text');
const copyLinkBtn = document.getElementById('copy-link-btn');


// --- 3. Глобальные переменные ---
let localStream;      // Наш локальный медиа-поток (камера и микрофон)
let peerConnections = {}; // Словарь для хранения всех P2P-соединений. Ключ - socketId собеседника.
let roomName;         // Название текущей комнаты

// Конфигурация STUN-серверов. Необходима для определения внешнего IP-адреса
// пользователя, который находится за NAT. Используем публичные серверы Google.
const stunConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};


// --- 4. Логика генерации уникальных имен комнат ---
const ADJECTIVES = [
    "Быстрый", "Тихий", "Яркий", "Темный", "Неоновый", "Квантовый", "Космический", 
    "Звездный", "Тайный", "Древний", "Солнечный", "Лунный", "Ледяной"
];
const NOUNS = [
    "Фотон", "Протон", "Сокол", "Дракон", "Горизонт", "Пиксель", "Вектор",
    "Спектр", "Пульсар", "Модуль", "Кристалл", "Вихрь", "Поток"
];

function generateRoomName() {
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
    const num = Math.floor(100 + Math.random() * 900);
    // Новый формат: Слово-Слово-Число
    return `${adj}-${noun}-${num}`;
}

function setNewRoomName() {
    roomInput.value = generateRoomName();
}

regenerateBtn.addEventListener('click', setNewRoomName);


// --- 5. Логика входа в комнату ---
async function joinRoom() {
    roomName = roomInput.value;
    if (!roomName) {
        alert('Пожалуйста, введите название комнаты');
        return;
    }
    // ИЗМЕНЕНО: Используем encodeURIComponent, чтобы URL был всегда корректным
    window.location.hash = encodeURIComponent(roomName);

    joinSection.style.display = 'none';
    videosSection.style.display = 'block';
    callControls.style.display = 'flex';
    
    // ИЗМЕНЕНО: Отображаем новый блок
    roomNameContainer.style.display = 'block';
    roomNameText.innerText = roomName;

    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
    } catch (error) {
        console.error("Ошибка при получении медиа-доступа:", error);
        alert('Не удалось получить доступ к камере или микрофону.');
        return;
    }

    socket.emit('join-room', roomName);
}

joinBtn.addEventListener('click', joinRoom);
roomInput.addEventListener('keyup', (event) => {
    if (event.key === 'Enter') {
        joinRoom();
    }
});


// --- 6. Авто-вход по ссылке ---
window.addEventListener('load', () => {
    if (window.location.hash) {
        // ИЗМЕНЕНО: Добавлено decodeURIComponent для исправления ошибки с кодировкой
        const decodedRoomName = decodeURIComponent(window.location.hash.substring(1));
        roomInput.value = decodedRoomName;
        joinRoom();
    } else {
        setNewRoomName();
    }
});


// --- 6.5. Логика управления звонком ---
const toggleAudio = () => {
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;

        const micIcon = muteBtn.querySelector('img'); // Находим иконку внутри кнопки

        if (audioTrack.enabled) {
            micIcon.src = ICON_PATHS.micOn; // Меняем путь к файлу
            muteBtn.classList.remove('active');
            console.log('[CONTROL] Микрофон включен');
        } else {
            micIcon.src = ICON_PATHS.micOff; // Меняем путь к файлу
            muteBtn.classList.add('active');
            console.log('[CONTROL] Микрофон выключен');
        }
    }
};

const toggleVideo = () => {
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;

        const videoIcon = videoBtn.querySelector('img'); // Находим иконку внутри кнопки

        if (videoTrack.enabled) {
            videoIcon.src = ICON_PATHS.videoOn; // Меняем путь к файлу
            videoBtn.classList.remove('active');
            console.log('[CONTROL] Камера включена');
        } else {
            videoIcon.src = ICON_PATHS.videoOff; // Меняем путь к файлу
            videoBtn.classList.add('active');
            console.log('[CONTROL] Камера выключена');
        }
    }
};

muteBtn.addEventListener('click', toggleAudio);
videoBtn.addEventListener('click', toggleVideo);


// --- 6.6. Логика теста микрофона ---
const handleMicTest = (event) => {
    localVideo.muted = !event.target.checked;
    console.log(`[CONTROL] Прослушивание микрофона ${event.target.checked ? 'включено' : 'выключено'}`);
};


micTestCheckbox.addEventListener('change', handleMicTest);

// --- 6.7. Логика копирования ссылки ---
const copyRoomLink = () => {
    // Формируем полную ссылку на комнату
    const link = window.location.origin + window.location.pathname + '#' + encodeURIComponent(roomName);
    
    // Используем современный Clipboard API
    navigator.clipboard.writeText(link).then(() => {
        console.log('[CONTROL] Ссылка скопирована:', link);
        
        // Показываем визуальную обратную связь
        copyLinkBtn.classList.add('copied');
        
        // Убираем обратную связь через 2 секунды
        setTimeout(() => {
            copyLinkBtn.classList.remove('copied');
        }, 2000);

    }).catch(err => {
        console.error('Не удалось скопировать ссылку:', err);
        alert('Не удалось скопировать ссылку. Пожалуйста, сделайте это вручную.');
    });
};

copyLinkBtn.addEventListener('click', copyRoomLink);


// --- 7. Логика WebRTC и сигналинга ---

/**
 * Вспомогательная функция для создания и настройки RTCPeerConnection
 * @param {string} targetSocketId - ID сокета пользователя, с которым устанавливается соединение
 * @returns {RTCPeerConnection} - Сконфигурированный объект соединения
 */
function createPeerConnection(targetSocketId) {
    console.log(`[DEBUG] Создание RTCPeerConnection для ${targetSocketId}`);
    const pc = new RTCPeerConnection(stunConfig);

    // Добавляем наши медиа-дорожки в соединение, чтобы они были отправлены собеседнику
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    // При нахождении нового ICE-кандидата, отправляем его через сигнальный сервер
    pc.onicecandidate = event => {
        if (event.candidate) {
            socket.emit('ice-candidate', {
                target: targetSocketId,
                candidate: event.candidate,
            });
        }
    };

    // Когда от собеседника приходит медиа-поток, отображаем его
    pc.ontrack = event => {
        console.log(`[TRACK] Получен медиа-поток от ${targetSocketId}`);
        // Динамически создаем видео элемент для нового участника
        let videoElement = document.getElementById(`video-${targetSocketId}`);
        if (!videoElement) {
            const videoContainer = document.createElement('div');
            videoContainer.id = `video-${targetSocketId}`;
            videoContainer.className = 'video-container';
            
            const newVideo = document.createElement('video');
            newVideo.autoplay = true;
            newVideo.playsInline = true;

            const nameTag = document.createElement('h4');
            nameTag.innerText = `Участник ${targetSocketId.substring(0, 4)}`;

            videoContainer.appendChild(nameTag);
            videoContainer.appendChild(newVideo);
            videosContainer.appendChild(videoContainer);

            newVideo.srcObject = event.streams[0];
        }
    };

    peerConnections[targetSocketId] = pc;
    return pc;
}

// ДОБАВЛЕНО: Мы вошли в комнату и получили список всех, кто уже там.
// Инициируем соединение с каждым из них.
socket.on('all-users', (otherUsers) => {
    console.log('[DEBUG] Получен список участников в комнате:', otherUsers);
    otherUsers.forEach(userId => {
        const pc = createPeerConnection(userId);
        pc.createOffer()
            .then(offer => pc.setLocalDescription(offer))
            .then(() => {
                console.log(`[OFFER] Создаем и отправляем offer для ${userId}`);
                socket.emit('offer', {
                    target: userId,
                    sdp: pc.localDescription,
                });
            });
    });
});

// "Старички" получают это событие. Теперь они просто ждут offer от новичка.
socket.on('user-joined', (newUserId) => {
    console.log(`[DEBUG] Новый пользователь присоединился: ${newUserId}. Ожидаем от него offer.`);
});

// ДОБАВЛЕНО: Пользователь отключился. Закрываем соединение и удаляем его видео.
socket.on('user-disconnected', (userId) => {
    console.log(`[DEBUG] Пользователь ${userId} отключился.`);
    if (peerConnections[userId]) {
        peerConnections[userId].close();
        delete peerConnections[userId];
    }
    const videoElement = document.getElementById(`video-${userId}`);
    if (videoElement) {
        videoElement.remove();
    }
});

// Мы получили offer от другого пользователя.
socket.on('offer', async (payload) => {
    console.log(`[OFFER] Получен offer от ${payload.sender}.`);
    
    const pc = createPeerConnection(payload.sender);
    await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    console.log(`[ANSWER] Отправляем answer для ${payload.sender}.`);
    socket.emit('answer', {
        target: payload.sender,
        sdp: pc.localDescription,
    });
});

// Мы получили answer на наш offer.
socket.on('answer', async (payload) => {
    console.log(`[ANSWER] Получен answer от ${payload.sender}.`);
    const pc = peerConnections[payload.sender];
    if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
    }
});

// Мы получили ICE-кандидата от другого пользователя.
socket.on('ice-candidate', async (payload) => {
    const pc = peerConnections[payload.sender];
    if (pc && payload.candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
    }
});