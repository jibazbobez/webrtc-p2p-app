// =================================================================
//                    Secure Video Call - script.js
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
    switchCamera: 'assets/icon_switch_camera.svg'
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
const resolutionModal = document.getElementById('resolution-modal');
const modalCloseBtn = document.getElementById('modal-close-btn');
const mainControlsContainer = document.getElementById('main-controls-container');
const micTestBtn = document.getElementById('mic-test-btn');
const featureBtn = document.getElementById('feature-btn'); // Screen share / Switch camera
const leaveBtn = document.getElementById('leave-btn');
const muteBtn = document.getElementById('mute-btn');
const videoBtn = document.getElementById('video-btn');


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
let currentCamera = 'user'; // 'user' for front, 'environment' for back (for mobile)
// Audio mixing resources used while screen sharing (mic + system audio).
// These are torn down in stopScreenShare() to restore the raw mic track.
let screenAudioContext = null;
let screenAudioDestination = null;
let mixedAudioTrack = null;

// --- 4.1. Media Constraints for Optimization ---

// High-quality constraints for desktop devices
const desktopMediaConstraints = {
    audio: true,
    video: {
        width: { ideal: 1280 },  // Request HD resolution
        height: { ideal: 720 },
        frameRate: { ideal: 30 } // Request standard frame rate
    }
};

// Low-power constraints for mobile devices.
// Reduced to 480x360 @ 15fps to prevent camera sensor overheating and
// excessive battery drain during long calls. Combined with bitrate limiting
// (see limitVideoBitrate) this keeps the device cool while remaining clear
// enough for a face-to-face conversation.
const mobileMediaConstraints = {
    audio: true,
    video: {
        width: { ideal: 480 },
        height: { ideal: 360 },
        frameRate: { ideal: 15, max: 20 }
    }
};

// Maximum video bitrate (bps) applied via RTCRtpSender.setParameters().
// Mobile uses a low bitrate to save battery / reduce heat; desktop keeps a
// higher bitrate for HD quality.
const MOBILE_MAX_BITRATE = 300000;   // 300 kbps
const DESKTOP_MAX_BITRATE = 1500000; // 1.5 Mbps


// --- 4.2. Platform Detection ---
// Detects mobile devices (phones, tablets) to apply low-power constraints and
// the mobile UI. Since iPadOS 13+ reports a Mac desktop userAgent, we also
// check for a touch-capable Mac platform as a fallback for iPad detection.
const isMobile = () => {
    const ua = (navigator.userAgent || navigator.vendor || window.opera).toLowerCase();
    const uaMobile = /android|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(ua);
    // iPadOS 13+: userAgent looks like a Mac, but the device has touch input.
    const isMacTouch = /macintosh/i.test(ua) && navigator.maxTouchPoints > 1;
    return uaMobile || isMacTouch;
};

// --- 4.3. WebRTC ICE Configuration ---
// NOTE: Removed unreliable/abandoned public servers (turn.bistri.com,
// stun.fwdnet.net, stun.ideasip.com) that were frequently offline and only
// added connection latency. The remaining set is verified-working:
//   - Google STUN (reliable, public)
//   - Metered STUN+TURN (primary, authenticated, multi-transport)
//   - Two dedicated TURN/TCP relays (fallback behind strict NATs)
const iceConfig = {
  iceServers: [
    {
      urls: [
        'stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302',
        'stun:stun2.l.google.com:19302', 'stun:stun3.l.google.com:19302',
        'stun:stun4.l.google.com:19302', 'stun:stun.sipnet.ru:3478',
        'stun:stun.gmx.net:3478', 'stun:stun.ekiga.net:3478',
        'stun:stun.relay.metered.ca:80',
      ]
    },
    { urls: 'turn:global.relay.metered.ca:80', username: 'a8e62e5f4af6433293737a9c', credential: 'jr0+8ph9+zB56Xsy' },
    { urls: 'turn:global.relay.metered.ca:80?transport=tcp', username: 'a8e62e5f4af6433293737a9c', credential: 'jr0+8ph9+zB56Xsy' },
    { urls: 'turn:global.relay.metered.ca:443', username: 'a8e62e5f4af6433293737a9c', credential: 'jr0+8ph9+zB56Xsy' },
    { urls: 'turns:global.relay.metered.ca:443?transport=tcp', username: 'a8e62e5f4af6433293737a9c', credential: 'jr0+8ph9+zB56Xsy' },
    { urls: 'turn:141.144.195.147:8000?transport=tcp', username: '20250908', credential: 'SpehIEurpH573oTvpoHb' },
    { urls: 'turn:185.158.112.58:8000?transport=tcp', username: '20250908', credential: 'SpehIEurpH573oTvpoHb' }
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
    console.log('[SYSTEM] Attempting to join room...');
    roomName = roomInput.value;
    if (!roomName) {
        alert('Please enter a room name');
        return;
    }
    window.location.hash = encodeURIComponent(roomName);

    // 1. Select media constraints based on the detected platform (Desktop vs. Mobile)
    const activeConstraints = isMobile() ? mobileMediaConstraints : desktopMediaConstraints;
    console.log(`[MEDIA] Applying ${isMobile() ? 'MOBILE' : 'DESKTOP'} media constraints:`, activeConstraints.video);

    // 2. Try to get the user's media stream with the selected constraints
    try {
        localStream = await navigator.mediaDevices.getUserMedia(activeConstraints);
        document.querySelector('#local-video-container .video-placeholder').classList.add('hidden');
    } catch (videoError) {
        console.warn(`[MEDIA] Could not get media with preferred constraints. Error: ${videoError.name}. Trying audio only.`);
        try {
            // Fallback to audio-only if the initial request fails
            localStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
        } catch (audioError) {
            console.error("[MEDIA] Could not get any media device.", audioError.name);
            alert('Could not access camera or microphone. Please check permissions and devices.');
            return;
        }
    }

    // 3. Update the UI to show the video call section
    joinSection.style.display = 'none';
    videosSection.style.display = 'flex';
    mainControlsContainer.style.display = 'flex';
    roomNameContainer.style.display = 'block';
    roomNameText.innerText = roomName;
    muteBtn.title = "Mute microphone";
    videoBtn.title = "Turn off camera";

    // 4. Configure the UI elements based on the platform
    if (isMobile()) {
        console.log('[SYSTEM] Mobile device detected. Setting up mobile UI.');
        document.body.classList.add('mobile-device');
        featureBtn.title = "Switch camera";
        featureBtn.querySelector('img').src = 'assets/icon_switch_camera.svg';
        featureBtn.dataset.feature = 'switchcamera';
    } else {
        console.log('[SYSTEM] Desktop device detected. Setting up desktop UI.');
        document.body.classList.add('desktop-device');
        featureBtn.title = "Share your screen";
        featureBtn.querySelector('img').src = 'assets/icon_screen_share.svg';
        featureBtn.dataset.feature = 'screenshare';
    }

    // 5. Set the initial state for the feature button (disabled on desktop until a peer joins)
    updateFeatureButtonState();

    // 6. Assign the local media stream to the video element and optimize it
    localVideo.srcObject = localStream;
    setVideoContentHint(localStream, 'motion'); // Optimize for webcam motion

    // 7. Initialize audio analysis for the speaking indicator
    setupAudioAnalysis(localStream);

    // 8. Connect to the signaling server and start the connection process
    socket.emit('join-room', roomName);
    startRoomSync();
}

joinBtn.addEventListener('click', joinRoom);
roomInput.addEventListener('keyup', (event) => {
    if (event.key === 'Enter') joinRoom();
});

// --- 7. Auto-Join Logic on Page Load ---
window.addEventListener('load', () => {
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

    // Start the randomized keep-alive pings to keep the Render.com free-tier
    // signaling server awake (it sleeps after 1 hour of inactivity).
    scheduleKeepAlive();
});

// --- 7.1 Keep-Alive Pings (Render.com free-tier anti-sleep) ---
// Sends a lightweight HTTP GET /health request at a randomized interval that
// always falls within one hour (25-55 minutes). The interval is re-rolled on
// every iteration so the requests are not strictly periodic, which avoids
// being flagged as bot traffic by Render.com.
function scheduleKeepAlive() {
    const minMs = 25 * 60 * 1000; // 25 minutes
    const maxMs = 55 * 60 * 1000; // 55 minutes
    const delay = minMs + Math.random() * (maxMs - minMs);
    console.log(`[KEEP-ALIVE] Next ping scheduled in ${Math.round(delay / 60000)} minutes.`);
    setTimeout(async () => {
        try {
            const res = await fetch(`${window.location.origin}/health`, { cache: 'no-store' });
            console.log(`[KEEP-ALIVE] Ping sent. Server responded with status ${res.status}.`);
        } catch (err) {
            console.warn('[KEEP-ALIVE] Ping failed:', err);
        }
        // Re-schedule with a fresh random delay.
        scheduleKeepAlive();
    }, delay);
}

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

    // Apply a per-platform bitrate cap on the outgoing video track to reduce
    // mobile heat / battery usage and keep desktop quality high.
    limitVideoBitrate(pc, isMobile() ? MOBILE_MAX_BITRATE : DESKTOP_MAX_BITRATE);

    pc.onicecandidate = event => {
        if (event.candidate) {
            // Log relay (TURN) candidates so we can verify which TURN servers
            // are actually reachable from this client. Useful for monitoring
            // the health of the free TURN relays configured in iceConfig.
            const c = event.candidate.candidate || '';
            if (c.includes('relay')) {
                console.log(`[ICE] RELAY candidate for ${targetSocketId}: ${c}`);
            }
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
    // First, check if a container for this user already exists.
    let videoContainer = document.getElementById(`video-${targetSocketId}`);

    // If the video container doesn't exist, create it from scratch.
    if (!videoContainer) {
        console.log(`[UI] Creating video container for new peer: ${targetSocketId}`);
        
        // 1. Create the main container div
        videoContainer = document.createElement('div');
        videoContainer.id = `video-${targetSocketId}`;
        videoContainer.className = 'video-container';
        
        // 2. Create the video element
        const newVideo = document.createElement('video');
        newVideo.autoplay = true;
        newVideo.playsInline = true; // Essential for mobile browsers

        // 3. Create the name tag
        const nameTag = document.createElement('h4');
        nameTag.innerText = `User ${targetSocketId.substring(0, 4)}`;
        
        // 4. Create the fullscreen button
        const fullscreenBtn = document.createElement('button');
        fullscreenBtn.className = 'control-button fullscreen-btn';
        fullscreenBtn.title = 'Go Fullscreen';
        fullscreenBtn.innerHTML = `<img src="assets/icon_fullscreen.svg" alt="Toggle Fullscreen">`;
        fullscreenBtn.addEventListener('click', toggleFullscreen); // Attach the universal handler
        
        // 5. Create the placeholder for when the camera is off
        const placeholder = document.createElement('div');
        placeholder.className = 'video-placeholder';
        const placeholderIcon = document.createElement('img');
        placeholderIcon.src = 'assets/icon_camera_off.svg';
        placeholder.appendChild(placeholderIcon);

        // 6. Create the canvas for the freeze-frame effect (for connection lags)
        const freezeFrameCanvas = document.createElement('canvas');
        freezeFrameCanvas.className = 'freeze-frame';

        // 7. Append all created elements into the container in the correct order
        videoContainer.append(nameTag, fullscreenBtn, newVideo, placeholder, freezeFrameCanvas);
        
        // 8. Add the fully constructed container to the main videos grid
        videosContainer.appendChild(videoContainer);

        // 9. Attach tap-to-reveal interaction for the fullscreen button
        attachContainerInteraction(videoContainer);

        // --- Logic for the freeze-frame effect ---
        const canvasContext = freezeFrameCanvas.getContext('2d');
        
        // When the video is buffering or lagging, show the last good frame
        newVideo.addEventListener('waiting', () => {
            // Set canvas dimensions to match the video element's display size
            freezeFrameCanvas.width = newVideo.clientWidth;
            freezeFrameCanvas.height = newVideo.clientHeight;
            // Only draw if there's an actual video frame to draw from
            if (newVideo.videoWidth > 0) {
                canvasContext.drawImage(newVideo, 0, 0, freezeFrameCanvas.width, freezeFrameCanvas.height);
                freezeFrameCanvas.style.display = 'block';
            }
        });

        // When the video resumes playing, hide the freeze-frame
        newVideo.addEventListener('playing', () => {
            freezeFrameCanvas.style.display = 'none';
        });
    }

    // --- Stream handling (runs for both new and existing containers) ---

    // Get the video and placeholder elements from the container
    const videoElement = videoContainer.querySelector('video');
    const placeholderElement = videoContainer.querySelector('.video-placeholder');
    
    // Assign the incoming stream to the video element
    videoElement.srcObject = stream;
    
    // Check if the stream has a video track to decide if we show the video or the placeholder
    if (stream.getVideoTracks().length > 0) {
        // If there is a video track, wait for its metadata to load, then hide the placeholder
        videoElement.onloadedmetadata = () => {
            placeholderElement.classList.add('hidden');
        };
    } else {
        // If there's no video track, make sure the placeholder is visible
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

    // If we joined a room that already has users, enable the feature button
    if (otherUsers.length > 0) {
        updateFeatureButtonState();
    }
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

    // A peer is connecting, so enable the feature button
    updateFeatureButtonState();
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

socket.on('room-full', () => {
    console.warn('[SYSTEM] Room is full. Disconnecting.');
    alert('This room is full (2 participants max). Please try another room.');
    leaveCall();
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
        // Smart reset: if we're in expanded mode and the disconnected user
        // was either the expanded or the PiP container, tear down the whole
        // expanded layout and return both containers to their default
        // positions. This prevents broken/orphaned PiP states.
        if (expandedContainer) {
            const videos = document.getElementById('videos');
            const wasInvolved = (expandedContainer === videoElement) ||
                videos.querySelector('.video-container.pip') === videoElement;
            if (wasInvolved) {
                exitExpandedMode();
            }
        }
        videoElement.remove();
    }

    // Check if we are alone now and update the feature button state
    updateFeatureButtonState();
});

socket.on('current_sharer_updated', ({ sharerId }) => {
    console.log(`[SCREEN] Current sharer is now: ${sharerId}`);
    updateUIAfterScreenShare(sharerId);
});

socket.on('screen_share_permission_request', ({ requesterId, requesterName }) => {
    if (screenStream) { // Only the current sharer should see this
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

    // Reload the page to go back to the home screen
    window.location.href = window.location.pathname;
};

// --- 14. Screen Sharing Logic ---
const handleScreenShareClick = () => {
    if (screenStream) {
        stopScreenShare();
    } else {
        if (currentSharerId === null || currentSharerId === socket.id) {
            resolutionModal.style.display = 'flex';
        } else {
            const sharerName = `${currentSharerId.substring(0, 4)}`;
            if (confirm(`User ${sharerName} is already sharing. Ask for permission to take over.`)) {
                socket.emit('screen_share_request', { 
                    roomName, 
                    sharerName: `${socket.id.substring(0, 4)}` 
                });
            }
        }
    }
};

const startScreenShare = async (resolution) => {
    resolutionModal.style.display = 'none';

    // NOTE: audio is requested as a plain `true` (no echoCancellation /
    // noiseSuppression / sampleRate constraints). System-audio tracks returned
    // by getDisplayMedia do NOT support those processing options, and supplying
    // them can cause Chrome to silently drop the audio track even when the
    // user checks "Share audio". A plain `true` maximises the chance that
    // desktop/tab audio is captured.
    const constraints = {
        'original': { video: { cursor: "always" }, audio: true },
        '1080p': { video: { width: 1920, height: 1080, cursor: "always" }, audio: true },
        '720p': { video: { width: 1280, height: 720, cursor: "always" }, audio: true }
    };

    try {
        screenStream = await navigator.mediaDevices.getDisplayMedia(constraints[resolution]);
        setVideoContentHint(screenStream, 'detail'); // Optimize for screen sharing
        const screenTrack = screenStream.getVideoTracks()[0];

        // --- System audio + microphone mixing ---
        // getDisplayMedia() returns a system-audio track when the user checks
        // "Share audio" (Chrome/Edge desktop) or shares a tab (Chrome). We
        // ALWAYS mix it with the live microphone track so the peer hears both
        // the presenter's voice and all desktop sound. If no system audio is
        // present, we still build a mix from the microphone alone so that the
        // audio path is consistent and the mic keeps flowing to peers.
        const systemAudioTrack = screenStream.getAudioTracks()[0];
        const micTrack = localStream.getAudioTracks()[0];

        if (micTrack || systemAudioTrack) {
            try {
                screenAudioContext = new (window.AudioContext || window.webkitAudioContext)();
                screenAudioDestination = screenAudioContext.createMediaStreamDestination();

                // Gain nodes allow independent level control; both at 1.0 by default.
                const micGain = screenAudioContext.createGain();
                const systemGain = screenAudioContext.createGain();
                micGain.gain.value = 1.0;
                systemGain.gain.value = 1.0;

                if (micTrack) {
                    const micSource = screenAudioContext.createMediaStreamSource(new MediaStream([micTrack]));
                    micSource.connect(micGain).connect(screenAudioDestination);
                    console.log('[SCREEN] Microphone added to screen-share audio mix.');
                }
                if (systemAudioTrack) {
                    const systemSource = screenAudioContext.createMediaStreamSource(new MediaStream([systemAudioTrack]));
                    systemSource.connect(systemGain).connect(screenAudioDestination);
                    console.log('[SCREEN] System/desktop audio added to screen-share audio mix.');
                } else {
                    console.warn('[SCREEN] No system audio track. To share desktop sound, tick "Share audio" in the picker. Microphone will still be sent.');
                }

                mixedAudioTrack = screenAudioDestination.stream.getAudioTracks()[0];
                console.log('[SCREEN] Mixed audio track created.');
            } catch (mixErr) {
                console.warn('[SCREEN] Could not create audio mix. Falling back to mic/system only.', mixErr);
                cleanupScreenAudioMix();
                // Fallback: prefer system audio if present, otherwise mic
                mixedAudioTrack = systemAudioTrack || micTrack || null;
            }
        } else {
            console.log('[SCREEN] No audio tracks available at all.');
        }

        // Replace the video track sent to all peers with the screen track.
        // IMPORTANT: await each replaceTrack to guarantee the peer receives the
        // screen frame instead of the camera frame (fixes the bug where the
        // camera image was transmitted instead of the screen).
        for (const peerId in peerConnections) {
            const videoSender = peerConnections[peerId].getSenders().find(s => s.track && s.track.kind === 'video');
            if (videoSender) {
                await videoSender.replaceTrack(screenTrack);
                console.log(`[SCREEN] Replaced video track for peer ${peerId} with screen track.`);
            }
            // Replace the audio track with the mixed track (mic + system) when
            // available, so the peer receives desktop sound together with the
            // presenter's voice.
            if (mixedAudioTrack) {
                const audioSender = peerConnections[peerId].getSenders().find(s => s.track && s.track.kind === 'audio');
                if (audioSender) {
                    await audioSender.replaceTrack(mixedAudioTrack);
                    console.log(`[SCREEN] Replaced audio track for peer ${peerId} with mixed audio.`);
                }
            }
        }

        screenTrack.onended = () => {
            stopScreenShare();
        };

        // Instead of creating a separate "local-screen-share" window (which
        // conflicted with the 2-window room layout and broke the presenter
        // mode), we reuse the existing local video container: swap its source
        // to the screen stream so the local user sees what they are sharing,
        // and mark the container so the UI can show a "sharing" indicator.
        localVideo.srcObject = screenStream;
        document.getElementById('local-video-container').classList.add('screen-sharing');

        socket.emit('user_started_sharing', { roomName });
        updateUIAfterScreenShare(socket.id); // Pass our own ID as the sharer
        featureBtn.classList.add('active');
        featureBtn.title = 'Stop sharing';

    } catch (err) {
        console.error("Error starting screen share:", err);
        // If the user cancels the screen picker, make sure the modal is closed
        // and no half-applied state remains.
        resolutionModal.style.display = 'none';
    }
};

// Tears down the Web Audio mixing graph created during screen sharing and
// releases the mixed audio track. Safe to call even if no mix was set up.
function cleanupScreenAudioMix() {
    if (screenAudioContext) {
        try { screenAudioContext.close(); } catch (e) { /* ignore */ }
        screenAudioContext = null;
    }
    screenAudioDestination = null;
    mixedAudioTrack = null;
}

const stopScreenShare = async () => {
    if (!screenStream) return;

    screenStream.getTracks().forEach(track => track.stop());
    screenStream = null;

    // Restore the camera track for all peers.
    const cameraTrack = localStream.getVideoTracks()[0];
    // Restore the original microphone track (the mixed/system audio track is
    // discarded together with the screen stream).
    const micTrack = localStream.getAudioTracks()[0];
    for (const peerId in peerConnections) {
        const videoSender = peerConnections[peerId].getSenders().find(s => s.track && s.track.kind === 'video');
        if (videoSender) {
            await videoSender.replaceTrack(cameraTrack);
            console.log(`[SCREEN] Restored camera track for peer ${peerId}.`);
        }
        if (mixedAudioTrack && micTrack) {
            const audioSender = peerConnections[peerId].getSenders().find(s => s.track && s.track.kind === 'audio');
            if (audioSender) {
                await audioSender.replaceTrack(micTrack);
                console.log(`[SCREEN] Restored microphone track for peer ${peerId}.`);
            }
        }
    }

    // Tear down the Web Audio mixing graph and release the mixed track.
    cleanupScreenAudioMix();

    // Restore the local video preview to the camera stream.
    localVideo.srcObject = localStream;
    document.getElementById('local-video-container').classList.remove('screen-sharing');

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

    // Reset: move every video container back under #videos so we can re-layout.
    const allContainers = document.querySelectorAll('.video-container');
    allContainers.forEach(container => {
        if (container.parentElement !== videosEl) {
            videosEl.appendChild(container);
        }
    });

    if (sharerId) {
        console.log('[UI] Entering presenter mode.');
        videosEl.classList.add('presenter-mode');
        presenterArea.style.display = 'flex';
        sidebar.style.display = 'flex';

        // The sharer's main screen is the local video container when sharing
        // locally (we reuse it instead of a separate "local-screen-share"
        // window), or the remote peer's container when someone else shares.
        const mainScreenContainerId = sharerId === socket.id
            ? 'local-video-container'
            : `video-${sharerId}`;
        const mainScreenContainer = document.getElementById(mainScreenContainerId);
        
        if (mainScreenContainer) {
            presenterArea.appendChild(mainScreenContainer);
        } else {
             console.warn(`[UI] Main container for sharer ${mainScreenContainerId} not found.`);
        }

        // All remaining containers go to the sidebar as participants.
        document.querySelectorAll('#videos > .video-container').forEach(container => {
            sidebar.appendChild(container);
        });

    } else {
        console.log('[UI] Exiting presenter mode.');
        videosEl.classList.remove('presenter-mode');
        presenterArea.style.display = 'none';
        sidebar.style.display = 'none';
    }
};

// --- 14.5. Mobile Camera Switch Logic ---
// Switches between the front and back cameras on mobile devices.
//
// Implementation notes (Android reliability):
//  - `facingMode: { exact: ... }` is unreliable on many Android devices: some
//    phones expose both cameras but ignore the constraint, return a black
//    frame, or throw an OverconstrainedError. We therefore prefer selecting
//    the next camera by its explicit `deviceId` (enumerated up front) and only
//    fall back to `facingMode` constraints if deviceId selection fails.
//  - We also keep the audio track from the existing localStream instead of
//    requesting audio again, which avoids mic glitches during the switch.
async function switchCamera() {
    console.log('[CONTROL] Attempting to switch camera.');
    if (!localStream || !isMobile()) return;

    const oldVideoTrack = localStream.getVideoTracks()[0];
    if (!oldVideoTrack) {
        console.warn('[CONTROL] No active video track to switch from.');
        return;
    }

    // Enumerate cameras and pick the next one that is NOT the current track's
    // device. This is the most reliable cross-device strategy.
    let cameras = [];
    try {
        const videoDevices = await navigator.mediaDevices.enumerateDevices();
        cameras = videoDevices.filter(device => device.kind === 'videoinput');
    } catch (enumErr) {
        console.error('[CONTROL] enumerateDevices failed:', enumErr);
    }

    if (cameras.length < 2) {
        console.warn('[CONTROL] Not enough cameras to switch.');
        return;
    }

    const currentDeviceId = oldVideoTrack.getSettings().deviceId;
    // Prefer a camera with a different deviceId; if labels are unavailable
    // (permissions not granted yet) deviceIds may still differ, so this is a
    // safe heuristic.
    const nextCamera =
        cameras.find(c => c.deviceId && c.deviceId !== currentDeviceId) ||
        cameras.find(c => c !== cameras.find(x => x.deviceId === currentDeviceId));

    const targetDeviceId = nextCamera && nextCamera.deviceId ? nextCamera.deviceId : null;
    const targetFacing = (currentCamera === 'user') ? 'environment' : 'user';

    // Build a list of constraint candidates, from most to least specific.
    // We try them in order until one succeeds.
    const constraintCandidates = [];
    if (targetDeviceId) {
        constraintCandidates.push({ video: { deviceId: { exact: targetDeviceId } } });
    }
    constraintCandidates.push({ video: { facingMode: { exact: targetFacing } } });
    constraintCandidates.push({ video: { facingMode: targetFacing } });
    // Last-resort: just any other camera.
    constraintCandidates.push({ video: true });

    let newStream = null;
    let lastError = null;
    for (const constraints of constraintCandidates) {
        try {
            console.log('[CONTROL] Trying camera constraints:', constraints);
            newStream = await navigator.mediaDevices.getUserMedia(constraints);
            break;
        } catch (err) {
            console.warn(`[CONTROL] Constraints failed (${err.name}):`, constraints);
            lastError = err;
            if (newStream) { newStream.getTracks().forEach(t => t.stop()); newStream = null; }
        }
    }

    if (!newStream) {
        console.error('[ERROR] Failed to switch camera with all constraint candidates:', lastError);
        // Do not flip currentCamera state since the switch failed.
        return;
    }

    const newVideoTrack = newStream.getVideoTracks()[0];

    // Sanity check: if the new track is the same deviceId as the old one and
    // we had more than one camera, the device ignored our constraints. In that
    // case we still proceed (better to show something than nothing), but log it.
    const newDeviceId = newVideoTrack.getSettings().deviceId;
    if (currentDeviceId && newDeviceId && currentDeviceId === newDeviceId) {
        console.warn('[CONTROL] New track has the same deviceId as the old track. Device may have ignored constraints.');
    }

    // Swap the video track inside localStream (keep the existing audio track).
    localStream.removeTrack(oldVideoTrack);
    oldVideoTrack.stop();
    localStream.addTrack(newVideoTrack);

    // Update the local preview. Re-assign the whole localStream so the audio
    // track stays wired to the same element.
    localVideo.srcObject = localStream;

    // Replace the track sent to every peer.
    for (const peerId in peerConnections) {
        const sender = peerConnections[peerId].getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) {
            console.log(`[WebRTC] Replacing track for peer ${peerId}`);
            await sender.replaceTrack(newVideoTrack);
        }
    }

    // Flip the recorded facing state to match the new track's reported facing
    // mode when available; otherwise assume the switch succeeded.
    const newFacing = newVideoTrack.getSettings().facingMode;
    if (newFacing) {
        currentCamera = newFacing;
    } else {
        currentCamera = targetFacing;
    }
    console.log(`[CONTROL] Camera switched successfully to: ${currentCamera} (deviceId: ${newDeviceId || 'unknown'})`);
}

// --- 14.6 Video Content Hint Optimization ---
function setVideoContentHint(stream, hint) {
    const videoTracks = stream.getVideoTracks();
    if (videoTracks.length > 0) {
        console.log(`[OPTIMIZATION] Setting contentHint to: '${hint}'`);
        videoTracks[0].contentHint = hint;
    }
}

// --- 14.6b Video Bitrate Limiting ---
// Caps the outgoing video bitrate via RTCRtpSender.setParameters(). This is the
// most effective way to reduce mobile camera heat and battery drain: even if
// the camera captures at a given resolution/framerate, the encoder will not
// produce more bits than maxBitrate, lowering CPU/GPU and sensor load.
async function limitVideoBitrate(pc, maxBitrate) {
    try {
        const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
        if (!sender) return;
        const params = sender.getParameters();
        if (!params.encodings || params.encodings.length === 0) {
            params.encodings = [{}];
        }
        params.encodings[0].maxBitrate = maxBitrate;
        await sender.setParameters(params);
        console.log(`[OPTIMIZATION] Video bitrate capped to ${maxBitrate} bps.`);
    } catch (err) {
        console.warn('[OPTIMIZATION] Could not set video bitrate:', err);
    }
}

// --- 14.7 UI State Management ---
function updateFeatureButtonState() {
    if (isMobile()) {
        return; // On mobile, this button is for switching camera and should always be active
    }
    const peerCount = Object.keys(peerConnections).length;
    const isEnabled = peerCount > 0;
    featureBtn.disabled = !isEnabled;
    if (isEnabled) {
        featureBtn.title = 'Share your screen';
    } else {
        featureBtn.title = 'Wait for another user to share your screen.';
    }
    console.log(`[UI] Updating feature button state. Peer count: ${peerCount}. Button disabled: ${!isEnabled}`);
}

// --- 14.8 UI Interaction ---
// CSS-based "expanded" (Picture-in-Picture) mode.
// Instead of using the browser Fullscreen API (which hides everything else
// and would require duplicating streams), we simply restyle the existing
// <video> containers: the chosen one fills the area, the other one shrinks
// into the top-right corner. The same two streams are reused — no cloning,
// no state races.
let expandedContainer = null;
let controlsHideTimer = null;

function showControlsTemporarily() {
    document.body.classList.add('show-controls');
    if (controlsHideTimer) clearTimeout(controlsHideTimer);
    controlsHideTimer = setTimeout(() => {
        document.body.classList.remove('show-controls');
    }, 3000);
}

function enterExpandedMode(container) {
    if (!container) return;
    const videos = document.getElementById('videos');
    expandedContainer = container;

    videos.classList.add('expanded-mode');
    document.body.classList.add('expanded-mode');

    videos.querySelectorAll('.video-container').forEach(c => {
        if (c === container) {
            c.classList.add('expanded');
        } else {
            c.classList.add('pip');
        }
    });

    // Swap the active container's button to the "exit" icon
    const btn = container.querySelector('.fullscreen-btn');
    if (btn) {
        btn.querySelector('img').src = 'assets/icon_fullscreen_exit.svg';
        btn.title = 'Exit Fullscreen';
    }

    showControlsTemporarily();

    // Request real device fullscreen so the layout covers the entire screen
    // (like YouTube), not just the browser window.
    // On iOS Safari, only <video> elements can enter real fullscreen, so we
    // target the video inside the expanded container there. On Android/Chrome
    // we can fullscreen the whole #videos container (preserving the PiP).
    requestDeviceFullscreen(container);

    console.log('[UI] Entered expanded (PiP) mode for:', container.id);
}

// Cross-platform device fullscreen request.
// - iOS Safari: only <video> supports real fullscreen (webkitEnterFullscreen).
// - Android/Chrome/Firefox: standard Element.requestFullscreen() on any element.
function requestDeviceFullscreen(container) {
    if (document.fullscreenElement) return;

    const videoEl = container.querySelector('video');

    // iOS Safari path
    if (videoEl && typeof videoEl.webkitEnterFullscreen === 'function' &&
        !document.fullscreenEnabled) {
        try {
            videoEl.webkitEnterFullscreen();
            console.log('[UI] iOS video fullscreen requested.');
            return;
        } catch (err) {
            console.warn('[UI] iOS fullscreen failed, falling back:', err);
        }
    }

    // Standard path — fullscreen the #videos container so the PiP layout
    // is preserved on the same screen.
    const videos = document.getElementById('videos');
    const el = (videoEl && isMobile() && !document.fullscreenEnabled)
        ? videoEl : videos;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (req) {
        req.call(el).catch(err => {
            console.error(`[ERROR] Failed to enter fullscreen: ${err.message}`);
        });
    }
}

function exitExpandedMode() {
    if (!expandedContainer) return;
    const videos = document.getElementById('videos');

    videos.classList.remove('expanded-mode');
    document.body.classList.remove('expanded-mode', 'show-controls');

    videos.querySelectorAll('.video-container').forEach(c => {
        c.classList.remove('expanded', 'pip', 'dragging', 'reveal-controls');
        // Clear any inline position set while dragging the PiP container
        c.style.left = '';
        c.style.top = '';
        c.style.right = '';
        const btn = c.querySelector('.fullscreen-btn');
        if (btn) {
            btn.querySelector('img').src = 'assets/icon_fullscreen.svg';
            btn.title = 'Go Fullscreen';
        }
    });

    expandedContainer = null;
    if (controlsHideTimer) {
        clearTimeout(controlsHideTimer);
        controlsHideTimer = null;
    }

    // Exit real device fullscreen if active (standard + iOS webkit)
    if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
    }
    const fsVideo = videos.querySelector('video');
    if (fsVideo && typeof fsVideo.webkitExitFullscreen === 'function' &&
        document.webkitFullscreenElement) {
        fsVideo.webkitExitFullscreen();
    }

    console.log('[UI] Exited expanded (PiP) mode.');
}

function toggleFullscreen(event) {
    if (event) event.stopPropagation();
    const button = event ? event.currentTarget : null;
    const container = button ? button.closest('.video-container') : null;

    if (expandedContainer) {
        exitExpandedMode();
    } else {
        enterExpandedMode(container);
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
        const startYear = 2025;
        const currentYear = new Date().getFullYear();
        copyrightYearSpan.textContent = (currentYear > startYear) ? `${startYear}–${currentYear}` : startYear.toString();
    }

    const localFullscreenBtn = document.querySelector('#local-video-container .fullscreen-btn');
    if (localFullscreenBtn) {
        localFullscreenBtn.addEventListener('click', toggleFullscreen);
    }

    // Attach tap-to-reveal interaction to the local container too
    attachContainerInteraction(document.getElementById('local-video-container'));
});

// --- 17. Top-Level Event Listeners ---
if (featureBtn) {
    featureBtn.addEventListener('click', () => {
        if (isMobile()) {
            switchCamera();
        } else {
            handleScreenShareClick();
        }
    });
}

// Attach listener to the new Leave button
if (leaveBtn) {
    leaveBtn.addEventListener('click', leaveCall);
}

// Attach event listener for the modal close button
if (modalCloseBtn) {
    modalCloseBtn.addEventListener('click', () => resolutionModal.style.display = 'none');
}

// Attach event listener for the resolution selection buttons inside the modal
if (resolutionModal) {
    resolutionModal.addEventListener('click', (e) => {
        const button = e.target.closest('button[data-resolution]');
        if (button) {
            startScreenShare(button.dataset.resolution);
        }
    });
}

// ESC key exits expanded mode
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && expandedContainer) {
        exitExpandedMode();
    }
});

// If the user exits device fullscreen via browser controls (ESC, swipe),
// also tear down the expanded/PiP layout. Listen to both standard and
// webkit-prefixed events (iOS Safari).
function handleFullscreenExit() {
    const stillFs = document.fullscreenElement || document.webkitFullscreenElement;
    if (!stillFs && expandedContainer) {
        exitExpandedMode();
    }
}
document.addEventListener('fullscreenchange', handleFullscreenExit);
document.addEventListener('webkitfullscreenchange', handleFullscreenExit);

// --- Orientation change: keep the PiP container on-screen ---
// When the device rotates, a manually-positioned PiP could end up off-screen.
// Re-clamp its position into the new viewport bounds.
let orientationTimer = null;
function handleOrientationChange() {
    if (!expandedContainer) return;
    const pip = document.querySelector('#videos.expanded-mode .video-container.pip');
    if (!pip) return;
    // Defer until the resize/orientation transition settles
    clearTimeout(orientationTimer);
    orientationTimer = setTimeout(() => {
        const videos = document.getElementById('videos');
        const vRect = videos.getBoundingClientRect();
        let left = parseFloat(pip.style.left);
        let top = parseFloat(pip.style.top);
        // If no inline position was set, leave default (top-left) alone
        if (isNaN(left) || isNaN(top)) return;
        const maxLeft = vRect.width - pip.offsetWidth;
        const maxTop = vRect.height - pip.offsetHeight;
        left = Math.max(0, Math.min(left, maxLeft));
        top = Math.max(0, Math.min(top, maxTop));
        pip.style.left = left + 'px';
        pip.style.top = top + 'px';
    }, 150);
}
window.addEventListener('orientationchange', handleOrientationChange);
window.addEventListener('resize', handleOrientationChange);

// --- Auto-show/hide fullscreen button on container tap ---
// On mobile there is no hover, so tapping the container briefly reveals the
// fullscreen button (and controls). On desktop the same handler works as a
// click anywhere on the video.
function attachContainerInteraction(container) {
    if (!container || container.dataset.fsInteraction === '1') return;
    container.dataset.fsInteraction = '1';

    // --- Draggable PiP (pointer events: works for mouse + touch) ---
    let dragState = null;

    container.addEventListener('pointerdown', (e) => {
        if (!expandedContainer || !container.classList.contains('pip')) return;
        if (e.target.closest('.fullscreen-btn')) return;

        const rect = container.getBoundingClientRect();
        dragState = {
            startX: e.clientX,
            startY: e.clientY,
            origLeft: rect.left,
            origTop: rect.top,
            offsetX: e.clientX - rect.left,
            offsetY: e.clientY - rect.top,
            moved: false,
            pointerId: e.pointerId,
        };
        container.setPointerCapture(e.pointerId);
        e.preventDefault();
    });

    container.addEventListener('pointermove', (e) => {
        if (!dragState || e.pointerId !== dragState.pointerId) return;
        const dx = e.clientX - dragState.startX;
        const dy = e.clientY - dragState.startY;
        if (!dragState.moved && Math.hypot(dx, dy) > 6) {
            dragState.moved = true;
            container.classList.add('dragging');
        }
        if (!dragState.moved) return;

        // Position relative to the #videos (fullscreen) container
        const videos = document.getElementById('videos');
        const vRect = videos.getBoundingClientRect();
        let newLeft = e.clientX - vRect.left - dragState.offsetX;
        let newTop = e.clientY - vRect.top - dragState.offsetY;

        // Clamp inside the visible area
        const maxLeft = vRect.width - container.offsetWidth;
        const maxTop = vRect.height - container.offsetHeight;
        newLeft = Math.max(0, Math.min(newLeft, maxLeft));
        newTop = Math.max(0, Math.min(newTop, maxTop));

        container.style.left = newLeft + 'px';
        container.style.top = newTop + 'px';
        container.style.right = 'auto';
    });

    const endDrag = (e) => {
        if (!dragState || e.pointerId !== dragState.pointerId) return;
        const wasMoved = dragState.moved;
        container.classList.remove('dragging');
        if (container.hasPointerCapture(e.pointerId)) {
            container.releasePointerCapture(e.pointerId);
        }
        dragState = null;
        // If it was a drag, suppress the click (which would swap)
        if (wasMoved) {
            container._suppressClick = true;
        }
    };

    container.addEventListener('pointerup', endDrag);
    container.addEventListener('pointercancel', endDrag);

    container.addEventListener('click', (e) => {
        // Ignore clicks on the button itself — it has its own handler
        if (e.target.closest('.fullscreen-btn')) return;

        // Suppress click right after a drag
        if (container._suppressClick) {
            container._suppressClick = false;
            return;
        }

        // In expanded mode: tapping the PiP (small) container swaps it
        // with the main one — same streams, just restyled.
        if (expandedContainer && container.classList.contains('pip')) {
            exitExpandedMode();
            enterExpandedMode(container);
            return;
        }

        // In expanded mode: tapping the main container reveals controls
        if (expandedContainer && container.classList.contains('expanded')) {
            showControlsTemporarily();
            return;
        }

        // Briefly reveal the fullscreen button on this container
        container.classList.add('reveal-controls');
        clearTimeout(container._revealTimer);
        container._revealTimer = setTimeout(() => {
            container.classList.remove('reveal-controls');
        }, 3000);
    });
}

// Attach to existing containers (local + any future remote ones)
document.querySelectorAll('.video-container').forEach(attachContainerInteraction);

// Reveal controls on mouse move while in expanded mode (desktop)
document.addEventListener('mousemove', () => {
    if (expandedContainer) showControlsTemporarily();
});