// =================================================================
//                    WebRTC P2P Call - script.js
//                  Полная версия со всеми правками
// =================================================================

// --- 1. Подключение к сигнальному серверу ---
// ИСПОЛЬЗУЕТСЯ ЛОКАЛЬНЫЙ СЕРВЕР ДЛЯ РАЗРАБОТКИ
// ПЕРЕД ДЕПЛОЕМ ЗАМЕНИТЬ НА 'https://webrtc-p2p-app.onrender.com'
const socket = io('https://webrtc-p2p-app.onrender.com');

// --- 2. Константы ---
const ICON_PATHS = {
    micOn: 'assets/icon_micro.svg',
    micOff: 'assets/icon_micro_off.svg',
    videoOn: 'assets/icon_camera.svg',
    videoOff: 'assets/icon_camera_off.svg'
};
const SPEAKING_THRESHOLD = 5; // Порог громкости для индикации
const SPEAKING_TIMEOUT = 200; // мс тишины, после которых индикация пропадает

// --- 3. Получение элементов DOM ---
const joinSection = document.getElementById('join-section');
const videosSection = document.getElementById('videos-section');
const localVideo = document.getElementById('local-video');
const videosContainer = document.getElementById('videos');
const roomInput = document.getElementById('room-input');
const joinBtn = document.getElementById('join-btn');
const regenerateBtn = document.getElementById('regenerate-btn');
const callControls = document.getElementById('call-controls');
const muteBtn = document.getElementById('mute-btn');
const videoBtn = document.getElementById('video-btn');
const micTestCheckbox = document.getElementById('mic-test-checkbox');
const roomNameContainer = document.getElementById('room-name-container');
const roomNameText = document.getElementById('room-name-text');
const copyLinkBtn = document.getElementById('copy-link-btn');

// --- 4. Глобальные переменные ---
let localStream;
let peerConnections = {};
let roomName;
let audioContext, analyser, microphone, javascriptNode;
let isSpeaking = false;
let speakingTimer;

const stunConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// --- 5. Логика генерации уникальных имен комнат ---
const ADJECTIVES = [
    "Quick", "Quiet", "Bright", "Dark", "Neon", "Quantum", "Cosmic", 
    "Stellar", "Secret", "Ancient", "Solar", "Lunar", "Icy", "Digital"
];
const NOUNS = [
    "Photon", "Proton", "Falcon", "Dragon", "Horizon", "Pixel", "Vector",
    "Spectre", "Pulsar", "Module", "Crystal", "Vortex", "Stream", "Matrix"
];

function generateRoomName() {
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
    const num = Math.floor(100 + Math.random() * 900);
    return `${adj}-${noun}-${num}`;
}

function setNewRoomName() {
    roomInput.value = generateRoomName();
}

regenerateBtn.addEventListener('click', setNewRoomName);

// --- 6. Логика входа в комнату и инициализации ---
async function joinRoom() {
    roomName = roomInput.value;
    if (!roomName) {
        alert('Please enter a room name');
        return;
    }
    window.location.hash = encodeURIComponent(roomName);

    try {
        // Этап 1: Пытаемся получить видео и аудио
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        document.querySelector('#local-video-container .video-placeholder').classList.add('hidden');
    } catch (videoError) {
        console.warn("[MEDIA] Could not get video, trying audio only. Error:", videoError.name);
        try {
            // Этап 2: Если видео не удалось, пытаемся получить только аудио
            localStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
        } catch (audioError) {
            // Этап 3: Если и аудио не удалось, показываем ошибку
            console.error("[MEDIA] Could not get any media device.", audioError.name);
            alert('Could not get access to camera or microphone. Please check permissions and devices.');
            return;
        }
    }

    // Если мы здесь, у нас есть хотя бы аудиопоток.
    joinSection.style.display = 'none';
    videosSection.style.display = 'block';
    callControls.style.display = 'flex';
    roomNameContainer.style.display = 'block';
    roomNameText.innerText = roomName;

    localVideo.srcObject = localStream;

    setupAudioAnalysis(localStream); // Запускаем анализ громкости

    socket.emit('join-room', roomName);
    updateVideoGrid();
}

joinBtn.addEventListener('click', joinRoom);
roomInput.addEventListener('keyup', (event) => {
    if (event.key === 'Enter') joinRoom();
});

// --- 7. Авто-вход по ссылке при загрузке страницы ---
window.addEventListener('load', () => {
    if (window.location.hash) {
        const decodedRoomName = decodeURIComponent(window.location.hash.substring(1));
        roomInput.value = decodedRoomName;
        joinRoom();
    } else {
        setNewRoomName();
    }
});

// --- 8. Логика управления звонком (микрофон, видео, тест) ---
const toggleAudio = () => {
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        const micIcon = muteBtn.querySelector('img');
        micIcon.src = audioTrack.enabled ? ICON_PATHS.micOn : ICON_PATHS.micOff;
        muteBtn.classList.toggle('active', !audioTrack.enabled);
    }
};

const toggleVideo = () => {
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        const videoIcon = videoBtn.querySelector('img');
        videoIcon.src = videoTrack.enabled ? ICON_PATHS.videoOn : ICON_PATHS.videoOff;
        videoBtn.classList.toggle('active', !videoTrack.enabled);
        // Показываем или скрываем плейсхолдер в зависимости от состояния видео
        document.querySelector('#local-video-container .video-placeholder').classList.toggle('hidden', videoTrack.enabled);
    }
};

const handleMicTest = (event) => {
    localVideo.muted = !event.target.checked;
};

muteBtn.addEventListener('click', toggleAudio);
videoBtn.addEventListener('click', toggleVideo);
micTestCheckbox.addEventListener('change', handleMicTest);

// --- 9. Логика копирования ссылки на комнату ---
const copyRoomLink = () => {
    const link = `${window.location.origin}${window.location.pathname}#${encodeURIComponent(roomName)}`;
    navigator.clipboard.writeText(link).then(() => {
        copyLinkBtn.classList.add('copied');
        setTimeout(() => copyLinkBtn.classList.remove('copied'), 2000);
    });
};

copyLinkBtn.addEventListener('click', copyRoomLink);

// --- 10. Анализ громкости микрофона ---
function setupAudioAnalysis(stream) {
    if (!stream.getAudioTracks().length) return;
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    microphone = audioContext.createMediaStreamSource(stream);
    javascriptNode = audioContext.createScriptProcessor(2048, 1, 1);
    analyser.smoothingTimeConstant = 0.8;
    analyser.fftSize = 1024;
    microphone.connect(analyser);
    analyser.connect(javascriptNode);
    javascriptNode.connect(audioContext.destination);

    javascriptNode.onaudioprocess = () => {
        const array = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(array);
        let values = 0;
        array.forEach(value => values += value);
        const average = values / array.length;

        if (average > SPEAKING_THRESHOLD) {
            if (!isSpeaking) {
                isSpeaking = true;
                socket.emit('speaking', { roomName });
                document.getElementById('local-video-container').classList.add('speaking');
            }
            clearTimeout(speakingTimer);
            speakingTimer = setTimeout(() => {
                isSpeaking = false;
                socket.emit('stopped_speaking', { roomName });
                document.getElementById('local-video-container').classList.remove('speaking');
            }, SPEAKING_TIMEOUT);
        }
    };
}

// --- 11. Основная WebRTC-логика ---
function createPeerConnection(targetSocketId) {
    const pc = new RTCPeerConnection(stunConfig);
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    pc.onicecandidate = event => {
        if (event.candidate) {
            socket.emit('ice-candidate', { target: targetSocketId, candidate: event.candidate });
        }
    };

    pc.ontrack = event => {
        let videoContainer = document.getElementById(`video-${targetSocketId}`);
        if (!videoContainer) {
            videoContainer = document.createElement('div');
            videoContainer.id = `video-${targetSocketId}`;
            videoContainer.className = 'video-container';
            const newVideo = document.createElement('video');
            newVideo.autoplay = true;
            newVideo.playsInline = true;
            const nameTag = document.createElement('h4');
            nameTag.innerText = `User ${targetSocketId.substring(0, 4)}`;
            const placeholder = document.createElement('div');
            placeholder.className = 'video-placeholder';
            const placeholderIcon = document.createElement('img');
            placeholderIcon.src = 'assets/icon_camera_off.svg';
            placeholder.appendChild(placeholderIcon);
            videoContainer.append(nameTag, newVideo, placeholder);
            videosContainer.appendChild(videoContainer);

            newVideo.srcObject = event.streams[0];
            const remoteStream = event.streams[0];
            if (remoteStream.getVideoTracks().length > 0) {
                newVideo.onloadedmetadata = () => placeholder.classList.add('hidden');
            }
            updateVideoGrid();
        }
    };
    peerConnections[targetSocketId] = pc;
    return pc;
}

// --- 12. Обработка событий от сигнального сервера ---
socket.on('all-users', (otherUsers) => {
    otherUsers.forEach(userId => {
        const pc = createPeerConnection(userId);
        pc.createOffer()
            .then(offer => pc.setLocalDescription(offer))
            .then(() => socket.emit('offer', { target: userId, sdp: pc.localDescription }));
    });
});

socket.on('user-joined', (newUserId) => { /* Новичок инициирует offer, мы просто ждем */ });

socket.on('offer', async (payload) => {
    const pc = createPeerConnection(payload.sender);
    await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit('answer', { target: payload.sender, sdp: pc.localDescription });
});

socket.on('answer', async (payload) => {
    const pc = peerConnections[payload.sender];
    if (pc) await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
});

socket.on('ice-candidate', async (payload) => {
    const pc = peerConnections[payload.sender];
    if (pc && payload.candidate) await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
});

socket.on('user_speaking', (payload) => {
    const userContainer = document.getElementById(`video-${payload.userId}`);
    if (userContainer) userContainer.classList.add('speaking');
});

socket.on('user_stopped_speaking', (payload) => {
    const userContainer = document.getElementById(`video-${payload.userId}`);
    if (userContainer) userContainer.classList.remove('speaking');
});

socket.on('user-disconnected', (userId) => {
    if (peerConnections[userId]) {
        peerConnections[userId].close();
        delete peerConnections[userId];
    }
    const videoElement = document.getElementById(`video-${userId}`);
    if (videoElement) {
        videoElement.remove();
        updateVideoGrid();
    }
    clearTimeout(speakingTimer);
});

// --- 13. Логика управления видео-сеткой ---
function updateVideoGrid() {
    const participantCount = Object.keys(peerConnections).length + 1;
    if (participantCount === 1) {
        videosContainer.classList.add('single-user-layout');
        videosContainer.style.gridTemplateColumns = '';
    } else {
        videosContainer.classList.remove('single-user-layout');
        let columns;
        if (participantCount <= 3) {
            columns = participantCount;
        } else {
            columns = Math.ceil(Math.sqrt(participantCount));
        }
        videosContainer.style.gridTemplateColumns = `repeat(${columns}, 1fr)`;
    }
}