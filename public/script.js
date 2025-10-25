// =================================================================
//                    WebRTC P2P Call - script.js
// =================================================================

// --- 1. Signaling Server Connection ---
const socket = io('https://webrtc-p2p-app.onrender.com');

// --- 2. Constants ---
const ICON_PATHS = {
    micOn: 'assets/icon_micro.svg',
    micOff: 'assets/icon_micro_off.svg',
    videoOn: 'assets/icon_camera.svg',
    videoOff: 'assets/icon_camera_off.svg',
    screenShare: 'assets/icon_screen_share.svg',
    switchCamera: 'assets/icon_switch_camera.svg' // New icon path
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
const roomNameContainer = document.getElementById('room-name-container');
const roomNameText = document.getElementById('room-name-text');
const copyLinkBtn = document.getElementById('copy-link-btn');

// --- MODIFICATION: Updated Controls ---
const mainControlsContainer = document.getElementById('main-controls-container');
const micTestBtn = document.getElementById('mic-test-btn');
const featureBtn = document.getElementById('feature-btn'); // Replaces screen-share btn
const leaveBtn = document.getElementById('leave-btn');     // Replaces home btn
const muteBtn = document.getElementById('mute-btn');
const videoBtn = document.getElementById('video-btn');

const resolutionModal = document.getElementById('resolution-modal');
const modalCloseBtn = document.getElementById('modal-close-btn');

// --- 4. Global Variables ---
let localStream;
let peerConnections = {};
let roomName;
let audioContext, analyser, microphone, javascriptNode;
let isSpeaking = false;
let speakingTimer;
let syncInterval;
let screenStream;
let currentSharerId = null;

const iceConfig = {
  iceServers: [
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

// --- 4.5. NEW: Platform Detection ---
const isMobile = () => {
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    return /android|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase());
};

// --- 5. Room Name Generation Logic ---
const ADJECTIVES = ["Quick", "Quiet", "Bright", "Dark", "Neon", "Quantum", "Cosmic", "Stellar", "Secret", "Ancient", "Solar", "Lunar", "Icy", "Digital", "Silent", "Rapid", "Golden", "Iron", "Crystal", "Arctic", "Ethereal", "Hidden", "Lost", "Final", "Prime", "Virtual", "Atomic", "Galactic"];
const NOUNS = ["Photon", "Proton", "Falcon", "Dragon", "Horizon", "Pixel", "Vector", "Spectre", "Pulsar", "Module", "Crystal", "Vortex", "Stream", "Matrix", "Nebula", "Relay", "Cipher", "Odyssey", "Mirage", "Echo", "Apex", "Oracle", "Nexus", "Spire", "Signal", "Fragment", "Core"];

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
    console.log('[SYSTEM] Attempting to join room...');
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
            alert('Could not access camera or microphone. Please check permissions and devices.');
            return;
        }
    }

    joinSection.style.display = 'none';
    videosSection.style.display = 'flex'; // Use flex for the new layout
    mainControlsContainer.style.display = 'flex'; // Show the new global controls
    roomNameContainer.style.display = 'block';
    roomNameText.innerText = roomName;
    muteBtn.title = "Mute microphone";
    videoBtn.title = "Turn off camera";

    // --- MODIFICATION: Platform-specific UI setup ---
    if (isMobile()) {
        console.log('[SYSTEM] Mobile device detected. Setting up mobile UI.');
        document.body.classList.add('mobile-device');
        featureBtn.title = "Switch camera";
        featureBtn.querySelector('img').src = ICON_PATHS.switchCamera;
        featureBtn.dataset.feature = 'switchcamera';
    } else {
        console.log('[SYSTEM] Desktop device detected. Setting up desktop UI.');
        document.body.classList.add('desktop-device');
        featureBtn.title = "Share your screen";
        featureBtn.querySelector('img').src = ICON_PATHS.screenShare;
        featureBtn.dataset.feature = 'screenshare';
    }

    localVideo.srcObject = localStream;
    setupAudioAnalysis(localStream);
    socket.emit('join-room', roomName);
    startRoomSync(); 
}

joinBtn.addEventListener('click', joinRoom);
roomInput.addEventListener('keyup', (event) => {
    if (event.key === 'Enter') joinRoom();
});

// --- 7. Auto-Join Logic on Page Load ---
window.addEventListener('load', () => {
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

socket.on('add-peers', (payload) => {
    console.log(`[SYNC] Received command to add ${payload.peers.length} peers.`);
    payload.peers.forEach(userId => {
        if (!peerConnections[userId]) {
            console.log(`[SYNC] Initiating connection with missing peer ${userId}.`);
            const pc = createPeerConnection(userId);
            pc.createOffer()
                .then(offer => pc.setLocalDescription(offer))
                .then(() => {
                    socket.emit('offer', { target: userId, sdp: pc.localDescription });
                })
                .catch(error => console.error(`[ERROR] Failed to create Offer during sync for ${userId}:`, error));
        }
    });
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
    }
    clearTimeout(speakingTimer);
});

socket.on('current_sharer_updated', ({ sharerId }) => {
    console.log(`[SCREEN] Current sharer is now: ${sharerId}`);
    updateUIAfterScreenShare(sharerId);
});

socket.on('screen_share_permission_request', ({ requesterId, requesterName }) => {
    if (screenStream) { 
        if (confirm(`User ${requesterName} wants to share their screen. Allow?`)) {
            stopScreenShare();
            socket.emit('screen_share_permission_granted', { roomName, targetId: requesterId });
        }
    }
});

socket.on('screen_share_token_granted', () => {
    console.log('[SCREEN] Permission to share has been granted.');
    resolutionModal.style.display = 'flex';
});

// --- NEW: Handle room full event from server ---
socket.on('room-full', () => {
    console.warn('[SYSTEM] Room is full. Disconnecting.');
    alert('This room is full (2 participants max). Please try another room.');
    leaveCall();
});

// --- 13. UI and Layout Management ---
const leaveCall = () => {
    console.log('[SYSTEM] Leaving call and cleaning up.');
    if (syncInterval) clearInterval(syncInterval);
    if (screenStream) stopScreenShare();
    
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }

    for (const userId in peerConnections) {
        if (peerConnections[userId]) {
            peerConnections[userId].close();
        }
    }
    peerConnections = {};
    window.location.href = window.location.pathname; // Go to base URL, clearing the room hash
};

// --- 14. Screen Sharing Logic (Desktop Only) ---
const handleScreenShareClick = () => {
    if (screenStream) {
        stopScreenShare();
    } else {
        if (currentSharerId === null || currentSharerId === socket.id) {
            resolutionModal.style.display = 'flex';
        } else {
            const sharerName = `User ${currentSharerId.substring(0, 4)}`;
            if (confirm(`User ${sharerName} is already sharing. Do you want to ask for permission to take over?`)) {
                socket.emit('screen_share_request', { 
                    roomName, 
                    sharerName: `User ${socket.id.substring(0, 4)}` 
                });
            }
        }
    }
};

const startScreenShare = async (resolution) => {
    resolutionModal.style.display = 'none';
    const constraints = {
        'original': { video: { cursor: "always" }, audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 44100 } },
        '1080p': { video: { width: 1920, height: 1080, cursor: "always" }, audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 44100 } },
        '720p': { video: { width: 1280, height: 720, cursor: "always" }, audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 44100 } }
    };

    try {
        screenStream = await navigator.mediaDevices.getDisplayMedia(constraints[resolution]);
        const screenTrack = screenStream.getVideoTracks()[0];

        for (const peerId in peerConnections) {
            const sender = peerConnections[peerId].getSenders().find(s => s.track && s.track.kind === 'video');
            if (sender) sender.replaceTrack(screenTrack);
        }
        
        screenTrack.onended = () => stopScreenShare();

        const screenShareContainer = document.createElement('div');
        screenShareContainer.id = 'local-screen-share';
        screenShareContainer.className = 'video-container';

        const screenVideo = document.createElement('video');
        screenVideo.autoplay = true;
        screenVideo.muted = true;
        screenVideo.playsInline = true;
        screenVideo.srcObject = screenStream;

        const nameTag = document.createElement('h4');
        nameTag.innerText = 'Your Screen';

        screenShareContainer.append(nameTag, screenVideo);
        videosContainer.appendChild(screenShareContainer);

        socket.emit('user_started_sharing', { roomName });
        updateUIAfterScreenShare(socket.id); 
        featureBtn.classList.add('active');
        featureBtn.title = 'Stop sharing';

    } catch (err) {
        console.error("Error starting screen share:", err);
    }
};

const stopScreenShare = () => {
    if (!screenStream) return;

    screenStream.getTracks().forEach(track => track.stop());
    screenStream = null;

    const cameraTrack = localStream.getVideoTracks()[0];
    for (const peerId in peerConnections) {
        const sender = peerConnections[peerId].getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) sender.replaceTrack(cameraTrack);
    }

    const screenShareContainer = document.getElementById('local-screen-share');
    if (screenShareContainer) screenShareContainer.remove();

    socket.emit('user_stopped_sharing', { roomName });
    updateUIAfterScreenShare(null);
    featureBtn.classList.remove('active');
    featureBtn.title = 'Share your screen';
};

const updateUIAfterScreenShare = (sharerId) => {
    console.log(`[UI] Updating layout for sharer: ${sharerId}`);
    currentSharerId = sharerId;
    const videosEl = document.getElementById('videos');
    const presenterArea = document.getElementById('presenter-area');
    const sidebar = document.getElementById('participant-sidebar');

    // First, move all video containers back to the main grid to reset the state
    const allVideoContainers = document.querySelectorAll('.video-container');
    allVideoContainers.forEach(container => videosEl.appendChild(container));

    if (sharerId) {
        // --- Enter Presenter Mode ---
        console.log('[UI] Entering presenter mode.');
        videosEl.classList.add('presenter-mode');
        presenterArea.style.display = 'flex';
        sidebar.style.display = 'flex';

        let mainScreenContainerId = sharerId === socket.id ? 'local-screen-share' : `video-${sharerId}`;
        const mainScreenContainer = document.getElementById(mainScreenContainerId);
        
        if (mainScreenContainer) {
            presenterArea.appendChild(mainScreenContainer);
        } else {
             console.warn(`[UI] Main container for sharer ${mainScreenContainerId} not found.`);
        }

        // Move all remaining containers to the sidebar
        document.querySelectorAll('#videos > .video-container').forEach(container => {
            sidebar.appendChild(container);
        });

    } else {
        // --- Exit Presenter Mode ---
        console.log('[UI] Exiting presenter mode.');
        videosEl.classList.remove('presenter-mode');
        presenterArea.style.display = 'none';
        sidebar.style.display = 'none';
        // Cleanup at the start of the function already moved containers back.
    }
};

// --- 14.5. NEW: Mobile Camera Switch Logic ---
let currentCamera = 'user'; // 'user' for front, 'environment' for back

async function switchCamera() {
    console.log('[CONTROL] Attempting to switch camera.');
    if (!localStream || !isMobile()) return;

    const videoDevices = await navigator.mediaDevices.enumerateDevices();
    const cameras = videoDevices.filter(device => device.kind === 'videoinput');
    
    if (cameras.length < 2) {
        console.warn('[CONTROL] Not enough cameras to switch.');
        alert('No other camera found to switch to.');
        return;
    }

    currentCamera = (currentCamera === 'user') ? 'environment' : 'user';
    const newConstraints = {
        video: { facingMode: { exact: currentCamera } },
        audio: true
    };

    try {
        // Stop the old track before getting the new one
        localStream.getVideoTracks().forEach(track => track.stop());

        const newStream = await navigator.mediaDevices.getUserMedia(newConstraints);
        const newVideoTrack = newStream.getVideoTracks()[0];
        
        // Update the local stream object with the new track
        const oldVideoTrack = localStream.getVideoTracks()[0];
        localStream.removeTrack(oldVideoTrack);
        localStream.addTrack(newVideoTrack);

        localVideo.srcObject = newStream; // Directly assign the new stream to the video element

        // Update the track for all existing peer connections
        for (const peerId in peerConnections) {
            const sender = peerConnections[peerId].getSenders().find(s => s.track && s.track.kind === 'video');
            if (sender) {
                console.log(`[WebRTC] Replacing track for peer ${peerId}`);
                await sender.replaceTrack(newVideoTrack);
            }
        }
        console.log(`[CONTROL] Camera switched successfully to: ${currentCamera}`);
    } catch (err) {
        console.error('[ERROR] Failed to switch camera:', err);
        alert('Could not switch camera. Please check permissions.');
        currentCamera = (currentCamera === 'user') ? 'environment' : 'user'; // Revert choice on error
    }
}

// --- 15. Periodic Synchronization ---
function startRoomSync() {
    if (syncInterval) clearInterval(syncInterval);
    syncInterval = setInterval(() => {
        if (socket.connected) {
            console.log("[SYNC] Sending room synchronization request...");
            const knownPeers = Object.keys(peerConnections);
            socket.emit('sync-room', {
                roomName: roomName,
                knownPeers: knownPeers
            });
        }
    }, 15000);
}

// --- 16. Automatic Copyright Year Update ---
document.addEventListener('DOMContentLoaded', () => {
    const copyrightYearSpan = document.getElementById('copyright-year');
    if (copyrightYearSpan) {
        copyrightYearSpan.textContent = new Date().getFullYear().toString();
    }
});

// --- 17. Top-Level Event Listeners (Updated) ---
if (featureBtn) {
    featureBtn.addEventListener('click', () => {
        const action = featureBtn.dataset.feature;
        console.log(`[CONTROL] Feature button clicked, action: ${action}`);
        if (action === 'switchcamera') {
            switchCamera();
        } else if (action === 'screenshare') {
            handleScreenShareClick();
        }
    });
}

if (leaveBtn) {
    leaveBtn.addEventListener('click', leaveCall);
}

if (modalCloseBtn) {
    modalCloseBtn.addEventListener('click', () => resolutionModal.style.display = 'none');
}

if (resolutionModal) {
    resolutionModal.addEventListener('click', (e) => {
        const button = e.target.closest('button[data-resolution]');
        if (button) {
            startScreenShare(button.dataset.resolution);
        }
    });
}
