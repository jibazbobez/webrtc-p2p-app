// =================================================================
//                    WebRTC P2P Call - script.js
//                 Version with Improved ICE Config
// =================================================================

// --- 1. Signaling Server Connection ---
const socket = io('https://webrtc-p2p-app.onrender.com');

// --- 2. Constants ---
const ICON_PATHS = {
    micOn: 'assets/icon_micro.svg',
    micOff: 'assets/icon_micro_off.svg',
    videoOn: 'assets/icon_camera.svg',
    videoOff: 'assets/icon_camera_off.svg'
};
const SPEAKING_THRESHOLD = 5; // Volume threshold for speaking indicator
const SPEAKING_TIMEOUT = 200; // ms of silence before the indicator disappears

// --- 3. DOM Element Retrieval ---
const joinSection = document.getElementById('join-section');
const videosSection = document.getElementById('videos-section');
const localVideo = document.getElementById('local-video');
const videosContainer = document.getElementById('videos');
const roomInput = document.getElementById('room-input');
const joinBtn = document.getElementById('join-btn');
const regenerateBtn = document.getElementById('regenerate-btn');
const callControls = document.getElementById('call-controls');
const homeBtnDesktop = document.getElementById('home-btn-desktop');
const homeBtnMobile = document.getElementById('home-btn-mobile');
const muteBtn = document.getElementById('mute-btn');
const videoBtn = document.getElementById('video-btn');
const micTestBtn = document.getElementById('mic-test-btn');
const roomNameContainer = document.getElementById('room-name-container');
const roomNameText = document.getElementById('room-name-text');
const copyLinkBtn = document.getElementById('copy-link-btn');

// --- 4. Global Variables ---
let localStream;
let peerConnections = {};
let roomName;
let audioContext, analyser, microphone, javascriptNode;
let isSpeaking = false;
let speakingTimer;

// MODIFIED: Old stunConfig replaced with new iceConfig
const iceConfig = {
  iceServers: [
    // STUN servers (always available and reliable)
    { 
      urls: [
        'stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302',
        'stun:stun2.l.google.com:19302', 'stun:stun3.l.google.com:19302',
        'stun:stun4.l.google.com:19302', 'stun:stun.sipnet.ru:3478',
        'stun:stun.gmx.net:3478', 'stun:stun.ekiga.net:3478',
        'stun:stun.fwdnet.net:3478', 'stun:stun.ideasip.com:3478',
        'stun:stun.relay.metered.ca:80',
      ] 
    },
    // TURN servers (used automatically when needed)
    { urls: 'turn:global.relay.metered.ca:80', username: 'a8e62e5f4af6433293737a9c', credential: 'jr0+8ph9+zB56Xsy' },
    { urls: 'turn:global.relay.metered.ca:80?transport=tcp', username: 'a8e62e5f4af6433293737a9c', credential: 'jr0+8ph9+zB56Xsy' },
    { urls: 'turn:global.relay.metered.ca:443', username: 'a8e62e5f4af6433293737a9c', credential: 'jr0+8ph9+zB56Xsy' },
    { urls: 'turns:global.relay.metered.ca:443?transport=tcp', username: 'a8e62e5f4af6433293737a9c', credential: 'jr0+8ph9+zB56Xsy' },
    { urls: 'turn:141.144.195.147:8000?transport=tcp', username: '20250908', credential: 'SpehIEurpH573oTvpoHb' },
    { urls: 'turn:185.158.112.58:8000?transport=tcp', username: '20250908', credential: 'SpehIEurpH573oTvpoHb' },
    { urls: 'turn:turn.bistri.com:80', username: 'homeo', credential: 'homeo' }
  ],
  iceCandidatePoolSize: 20,
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
  iceTransportPolicy: 'all',
};

// --- 5. Room Name Generation Logic ---
const ADJECTIVES = [
    "Quick", "Quiet", "Bright", "Dark", "Neon", "Quantum", "Cosmic", 
    "Stellar", "Secret", "Ancient", "Solar", "Lunar", "Icy", "Digital",
    "Silent", "Rapid", "Golden", "Iron", "Crystal", "Arctic", "Ethereal",
    "Hidden", "Lost", "Final", "Prime", "Virtual", "Atomic", "Galactic"
];
const NOUNS = [
    "Photon", "Proton", "Falcon", "Dragon", "Horizon", "Pixel", "Vector",
    "Spectre", "Pulsar", "Module", "Crystal", "Vortex", "Stream", "Matrix",
    "Nebula", "Relay", "Cipher", "Odyssey", "Mirage", "Echo", "Apex",
    "Oracle", "Nexus", "Spire", "Signal", "Fragment", "Core"
];

function generateRoomName() {
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
    const num = Math.floor(1000 + Math.random() * 9000);
    return `${adj}-${noun}-${num}`;
}

function setNewRoomName() {
    roomInput.value = generateRoomName();
}

regenerateBtn.addEventListener('click', setNewRoomName);

// --- 6. Room Entry and Initialization Logic ---
async function joinRoom() {
    roomName = roomInput.value;
    if (!roomName) {
        alert('Please enter a room name');
        return;
    }
    window.location.hash = encodeURIComponent(roomName);

    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        document.querySelector('#local-video-container .video-placeholder').classList.add('hidden');
    } catch (videoError) {
        console.warn("[MEDIA] Could not get video, trying audio only. Error:", videoError.name);
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
        } catch (audioError) {
            console.error("[MEDIA] Could not get any media device.", audioError.name);
            alert('Could not get access to camera or microphone. Please check permissions and devices.');
            return;
        }
    }

    joinSection.style.display = 'none';
    videosSection.style.display = 'block';
    callControls.style.display = 'flex';
    roomNameContainer.style.display = 'block';
    roomNameText.innerText = roomName;
    muteBtn.title = "Mute microphone";
    videoBtn.title = "Turn off camera";

    localVideo.srcObject = localStream;

    setupAudioAnalysis(localStream);

    socket.emit('join-room', roomName);
    updateVideoGrid(); 
}

joinBtn.addEventListener('click', joinRoom);
roomInput.addEventListener('keyup', (event) => {
    if (event.key === 'Enter') joinRoom();
});

// --- 7. Auto-Join Logic on Page Load ---
window.addEventListener('load', () => {
    // ADDED: Age verification logic
    if (!sessionStorage.getItem('ageVerified')) {
        alert("If you are not 18+ years old, please leave this page.");
        sessionStorage.setItem('ageVerified', 'true');
    }

    if (window.location.hash) {
        const decodedRoomName = decodeURIComponent(window.location.hash.substring(1));
        roomInput.value = decodedRoomName;
        joinRoom();
    } else {
        setNewRoomName();
    }
});

// --- 8. Call Control Logic (Mic, Video, Test) ---
const toggleAudio = () => {
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        const micIcon = muteBtn.querySelector('img');
        micIcon.src = audioTrack.enabled ? ICON_PATHS.micOn : ICON_PATHS.micOff;
        muteBtn.classList.toggle('active', !audioTrack.enabled);
        muteBtn.title = audioTrack.enabled ? "Mute microphone" : "Unmute microphone";
    }
};

const toggleVideo = () => {
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        const videoIcon = videoBtn.querySelector('img');
        videoIcon.src = videoTrack.enabled ? ICON_PATHS.videoOn : ICON_PATHS.videoOff;
        videoBtn.classList.toggle('active', !videoTrack.enabled);
        document.querySelector('#local-video-container .video-placeholder').classList.toggle('hidden', videoTrack.enabled);
        videoBtn.title = videoTrack.enabled ? "Turn off camera" : "Turn on camera";
    }
};

const handleMicTest = () => {
    const isMuted = localVideo.muted;
    localVideo.muted = !isMuted;
    micTestBtn.classList.toggle('active', isMuted); 
    console.log(`[CONTROL] Mic test listening ${isMuted ? 'ENABLED' : 'DISABLED'}`);
};

muteBtn.addEventListener('click', toggleAudio);
videoBtn.addEventListener('click', toggleVideo);
micTestBtn.addEventListener('click', handleMicTest);

// --- 9. Copy Room Link Logic ---
const copyRoomLink = () => {
    const link = `${window.location.origin}${window.location.pathname}#${encodeURIComponent(roomName)}`;
    navigator.clipboard.writeText(link).then(() => {
        copyLinkBtn.classList.add('copied');
        setTimeout(() => copyLinkBtn.classList.remove('copied'), 2000);
    });
};

copyLinkBtn.addEventListener('click', copyRoomLink);

// --- 10. Microphone Volume Analysis ---
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

// --- 11. Core WebRTC Logic ---
function createPeerConnection(targetSocketId) {
    const pc = new RTCPeerConnection(iceConfig);
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    pc.onicecandidate = event => {
        if (event.candidate) {
            socket.emit('ice-candidate', { target: targetSocketId, candidate: event.candidate });
        }
    };

    pc.ontrack = event => {
        handleRemoteStream(event.streams[0], targetSocketId);
    };

    pc.oniceconnectionstatechange = () => {
        if (['failed', 'disconnected', 'closed'].includes(pc.iceConnectionState)) {
            console.warn(`[WebRTC] Connection with ${targetSocketId} lost. Requesting reconnect.`);
            socket.emit('reconnect-request', { target: targetSocketId });
        }
    };
    
    peerConnections[targetSocketId] = pc;
    return pc;
}

function handleRemoteStream(stream, targetSocketId) {
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

        const freezeFrameCanvas = document.createElement('canvas');
        freezeFrameCanvas.className = 'freeze-frame';

        videoContainer.append(nameTag, newVideo, placeholder, freezeFrameCanvas);
        videosContainer.appendChild(videoContainer);

        const canvasContext = freezeFrameCanvas.getContext('2d');
        newVideo.addEventListener('waiting', () => {
            freezeFrameCanvas.width = newVideo.clientWidth;
            freezeFrameCanvas.height = newVideo.clientHeight;
            if (newVideo.videoWidth > 0) {
                canvasContext.drawImage(newVideo, 0, 0, freezeFrameCanvas.width, freezeFrameCanvas.height);
                freezeFrameCanvas.style.display = 'block';
            }
        });
        newVideo.addEventListener('playing', () => {
            freezeFrameCanvas.style.display = 'none';
        });

        updateVideoGrid();
    }

    const videoElement = videoContainer.querySelector('video');
    const placeholderElement = videoContainer.querySelector('.video-placeholder');
    videoElement.srcObject = stream;
    
    if (stream.getVideoTracks().length > 0) {
        videoElement.onloadedmetadata = () => {
            placeholderElement.classList.add('hidden');
        };
    } else {
        placeholderElement.classList.remove('hidden');
    }
}

// --- 12. Signaling Server Event Handlers ---
socket.on('all-users', (otherUsers) => {
    console.log('[SIGNAL] Received list of existing users:', otherUsers);
    otherUsers.forEach(userId => {
        const pc = createPeerConnection(userId);
        pc.createOffer()
            .then(offer => pc.setLocalDescription(offer))
            .then(() => {
                console.log(`[SIGNAL] Sending Offer to existing user ${userId}`);
                socket.emit('offer', { target: userId, sdp: pc.localDescription });
            })
            .catch(error => console.error(`[ERROR] Failed to create Offer for ${userId}:`, error));
    });
});

socket.on('user-joined', (newUserId) => {
    console.log(`[SIGNAL] New user ${newUserId} has joined. Awaiting their Offer.`);
});

socket.on('offer', async (payload) => {
    console.log(`[SIGNAL] Received Offer from ${payload.sender}. Creating Answer...`);
    const pc = createPeerConnection(payload.sender);
    await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    console.log(`[SIGNAL] Sending Answer to user ${payload.sender}`);
    socket.emit('answer', { target: payload.sender, sdp: pc.localDescription });
});

socket.on('answer', async (payload) => {
    console.log(`[SIGNAL] Received Answer from ${payload.sender}.`);
    const pc = peerConnections[payload.sender];
    if (pc) await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
});

socket.on('ice-candidate', async (payload) => {
    const pc = peerConnections[payload.sender];
    if (pc && payload.candidate) {
        try {
            await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
        } catch (error) {
            console.error(`[ERROR] Failed to add ICE candidate from ${payload.sender}:`, error);
        }
    }
});

socket.on('reconnect-with', (payload) => {
    console.log(`[RECONNECT] Received reconnect request from ${payload.target}. Initiating new Offer.`);
    if (peerConnections[payload.target]) {
        peerConnections[payload.target].close();
        delete peerConnections[payload.target];
    }
    const pc = createPeerConnection(payload.target);
    pc.createOffer()
        .then(offer => pc.setLocalDescription(offer))
        .then(() => socket.emit('offer', { target: payload.target, sdp: pc.localDescription }))
        .catch(error => console.error(`[ERROR] Failed to create Offer for reconnect to ${payload.target}:`, error));
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
    console.log(`[SIGNAL] User ${userId} has disconnected.`);
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

// --- 13. UI and Layout Management ---
const goHome = () => {
    window.location.href = '/p2p/'; 
};

if (homeBtnDesktop) homeBtnDesktop.addEventListener('click', goHome);
if (homeBtnMobile) homeBtnMobile.addEventListener('click', goHome);

function updateVideoGrid() {
    const participantCount = document.querySelectorAll('.video-container').length;
    const videosEl = document.getElementById('videos');
    videosEl.classList.toggle('single-user', participantCount <= 1);
}

// --- 14. Automatic Copyright Year Update ---
document.addEventListener('DOMContentLoaded', () => {
    const copyrightYearSpan = document.getElementById('copyright-year');
    if (copyrightYearSpan) {
        const startYear = 2025;
        const currentYear = new Date().getFullYear();
        copyrightYearSpan.textContent = (currentYear > startYear) ? `${startYear}–${currentYear}` : startYear.toString();
    }
});