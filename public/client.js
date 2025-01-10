// Initialize global variables
let peerConnection = null;
let dataChannel = null;
let audioTrack = null;

console.log("[STARTUP] Client script loaded");

// Bot settings
let chatbotSettings = {
    instructions: "You are a friendly assistant."
};

// Set up event listeners when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById("setSystemMessage").addEventListener("click", () => {
        const systemMessageInput = document.getElementById("systemMessage").value.trim();
        if (systemMessageInput) {
            chatbotSettings.instructions = systemMessageInput;
            console.log("[CONFIG] Updated instructions:", chatbotSettings.instructions);
            addToStatus(`Updated assistant personality`, "system");
        }
    });

    document.getElementById("floatingOrb").addEventListener("click", async () => {
        console.log("[UI] Microphone clicked");
        try {
            if (!peerConnection || peerConnection.connectionState === 'closed') {
                console.log("[UI] Starting new connection");
                setMicrophoneState('active');  // This will set background to #3700b3
                await initializeWebRTC();
                addToStatus("Connected and ready to chat", "system");
            } else {
                console.log("[UI] Disconnecting existing connection");
                setMicrophoneState('inactive');  // This will reset the background
                await disconnectWebRTC();
                addToStatus("Disconnected from assistant", "system");
            }
        } catch (error) {
            console.error("[ERROR] WebRTC operation failed:", error);
            setMicrophoneState('inactive');
            addToStatus("Connection failed. Please try again.", "error");
        }
    });
});

function setMicrophoneState(state) {
    const micButton = document.getElementById("floatingOrb");
    const micIcon = document.getElementById("micIcon");

    if (!micButton) return;

    switch (state) {
        case 'active':
            micButton.style.backgroundColor = '#3700b3';  // Active/listening state
            micIcon.src = "mic-active.png";
            break;
        case 'inactive':
            micButton.style.backgroundColor = '#03DAC6';  // Reset to default
            micIcon.src = "mic-icon.png";
            break;
        case 'processing':
            micButton.style.backgroundColor = '#3700b3';  // Keep purple while processing
            micIcon.src = "mic-active.png";
            break;
    }
}

function handleRealtimeEvent(event) {
    if (!event || !event.type) {
        console.error("[ERROR] Invalid event received");
        return;
    }

    console.log("[EVENT] Received:", event.type);

    switch (event.type) {
        case "response.text.delta":
            // Handle incremental text responses
            if (event.delta && event.delta.text) {
                setMicrophoneState('processing');
                addToTranscription(event.delta.text, "assistant");
            }
            break;

        case "response.audio_transcript.delta":
            // Handle transcribed user speech
            if (event.delta && event.delta.text) {
                setMicrophoneState('active');
                addToTranscription(event.delta.text, "user");
            }
            break;

        case "input_audio_buffer.speech_started":
            console.log("[AUDIO] Speech detected");
            setMicrophoneState('active');
            break;

        case "input_audio_buffer.speech_stopped":
            console.log("[AUDIO] Speech ended");
            setMicrophoneState('processing');
            break;

        case "session.created":
        case "session.updated":
            addToStatus("Connected to assistant", "system");
            break;

        case "response.done":
            // AI has finished responding
            setMicrophoneState('active');
            break;

        case "response.error":
            console.error("[ERROR] Response error:", event.message);
            setMicrophoneState('inactive');
            addToStatus(`Error: ${event.message}`, "error");
            break;
    }
}

// Function to add messages to the status history
function addToStatus(message, type) {
    const statusContainer = document.getElementById("statusHistory");
    if (!statusContainer) {
        console.error("[ERROR] Status container not found");
        return;
    }

    // Create new message element
    const messageDiv = document.createElement("div");
    messageDiv.className = `${type}-message mb-2`;
    messageDiv.textContent = message;
    statusContainer.appendChild(messageDiv);

    statusContainer.scrollTop = statusContainer.scrollHeight;
}

// Function to add messages to the transcription (conversation)
function addToTranscription(message, type) {
    const transcriptionContainer = document.getElementById("conversationHistory");  // Updated to use conversationHistory
    if (!transcriptionContainer) {
        console.error("[ERROR] Conversation container not found");
        return;
    }

    // Try to append to existing message if it's the same type and recent
    const lastMessage = transcriptionContainer.lastElementChild;
    const isRecent = lastMessage && (Date.now() - (lastMessage.dataset.timestamp || 0) < 1000);

    if (lastMessage && lastMessage.className === `${type}-message` && isRecent) {
        // Add a line break before the new content
        const lineBreak = document.createElement('br');
        lastMessage.appendChild(lineBreak);
        lastMessage.appendChild(document.createTextNode(message));
    } else {
        // Create new message element
        const messageDiv = document.createElement("div");
        messageDiv.className = `${type}-message p-2`;
        messageDiv.dataset.timestamp = Date.now();

        // Add appropriate prefix and styling
        switch (type) {
            case "user":
                messageDiv.innerHTML = `<strong>You:</strong> ${message}`;
                break;
            case "assistant":
                messageDiv.innerHTML = `<strong>Assistant:</strong> ${message}`;
                break;
            case "system":
                messageDiv.innerHTML = `💬 ${message}`;
                break;
            default:
                messageDiv.textContent = message;
        }

        transcriptionContainer.appendChild(messageDiv);
    }

    transcriptionContainer.scrollTop = transcriptionContainer.scrollHeight;
} 

async function disconnectWebRTC() {
    if (disconnectWebRTC.isRunning) {
        console.log("[CLEANUP] Cleanup already in progress, skipping");
        return;
    }

    try {
        disconnectWebRTC.isRunning = true;
        console.log("[CLEANUP] Starting cleanup");

        setMicrophoneState('inactive');

        if (audioTrack) {
            console.log("[CLEANUP] Stopping audio track");
            audioTrack.stop();
            audioTrack = null;
        }

        if (dataChannel) {
            console.log("[CLEANUP] Closing data channel");
            if (dataChannel.readyState !== "closed") {
                dataChannel.close();
            }
            dataChannel = null;
        }

        if (peerConnection) {
            console.log("[CLEANUP] Closing peer connection");
            peerConnection.close();
            peerConnection = null;
        }

        const audioEl = document.getElementById("assistantAudio");
        if (audioEl) {
            console.log("[CLEANUP] Removing audio element");
            audioEl.remove();
        }

        addToStatus("Disconnected from assistant", "system");

        console.log("[CLEANUP] Cleanup complete");
    } finally {
        disconnectWebRTC.isRunning = false;
    }
}

async function initializeWebRTC() {
    console.log("[INIT] Starting WebRTC initialization");

    try {
        // Get ephemeral key from server
        console.log("[TOKEN] Requesting session token");
        const tokenResponse = await fetch("/session");
        const data = await tokenResponse.json();
        console.log("[TOKEN] Session data:", data);

        if (!data.client_secret?.value) {
            throw new Error("No client secret in session response");
        }
        const EPHEMERAL_KEY = data.client_secret.value;
        console.log("[TOKEN] Got ephemeral key");

        // Create peer connection
        console.log("[WEBRTC] Creating peer connection");
        peerConnection = new RTCPeerConnection({
            iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
        });

        // Add error handlers
        peerConnection.onerror = (error) => {
            console.error("[ERROR] PeerConnection error:", error);
        };

        peerConnection.oniceconnectionstatechange = () => {
            console.log("[WEBRTC] ICE Connection State:", peerConnection.iceConnectionState);
        };

        peerConnection.onconnectionstatechange = async (event) => {
            console.log("[WEBRTC] Connection state change:", peerConnection.connectionState);
            if (peerConnection.connectionState === 'failed') {
                console.error("[ERROR] Connection failed:", event);
                await disconnectWebRTC();
            }
        };

        peerConnection.onicecandidateerror = (event) => {
            console.error("[ERROR] ICE candidate error:", event);
        };

        // Set up audio element
        console.log("[AUDIO] Setting up audio element");
        const audioEl = document.createElement("audio");
        audioEl.autoplay = true;
        audioEl.id = "assistantAudio";
        document.body.appendChild(audioEl);

        peerConnection.ontrack = (e) => {
            console.log("[AUDIO] Received remote track");
            audioEl.srcObject = e.streams[0];
        };

        // Get and add local audio
        console.log("[MEDIA] Requesting microphone access");
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                sampleSize: 16,
                channelCount: 1
            }
        });

        audioTrack = stream.getAudioTracks()[0];
        peerConnection.addTrack(audioTrack, stream);
        console.log("[MEDIA] Added audio track");

        // Create data channel
        dataChannel = peerConnection.createDataChannel("oai-events", {
            ordered: true
        });
        setupDataChannelHandlers();
        console.log("[DATA] Created data channel");

        // Create and set local description
        console.log("[SDP] Creating offer");
        const offer = await peerConnection.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: false
        });

        await peerConnection.setLocalDescription(offer);
        console.log("[SDP] Set local description");

        // Wait for ICE gathering
        console.log("[ICE] Starting ICE gathering wait...");
        await new Promise((resolve) => {
            if (peerConnection.iceGatheringState === "complete") {
                resolve();
            } else {
                peerConnection.addEventListener("icegatheringstatechange", () => {
                    if (peerConnection.iceGatheringState === "complete") {
                        resolve();
                    }
                });
            }
        });

        // Exchange SDP with OpenAI
        console.log("[SDP] Preparing to send offer to OpenAI");
        const sdp = peerConnection.localDescription.sdp;

        const baseUrl = "https://api.openai.com/v1/realtime";
        const model = "gpt-4o-realtime-preview-2024-12-17";

        console.log("[SDP] Sending request to OpenAI...");
        const sdpResponse = await fetch(`${baseUrl}?model=${model}`, {
            method: "POST",
            body: sdp,
            headers: {
                Authorization: `Bearer ${EPHEMERAL_KEY}`,
                "Content-Type": "application/sdp"
            },
        });

        console.log("[SDP] Got response:", sdpResponse.status, sdpResponse.statusText);

        if (!sdpResponse.ok) {
            const errorText = await sdpResponse.text();
            console.error("[ERROR] SDP exchange failed:", errorText);
            throw new Error(`SDP exchange failed: ${sdpResponse.status} - ${errorText}`);
        }

        const answerSdp = await sdpResponse.text();
        console.log("[SDP] Received answer of length:", answerSdp.length);
        console.log("[SDP] Setting remote description...");

        if (!peerConnection) {
            throw new Error("PeerConnection was closed before setting remote description");
        }

        await peerConnection.setRemoteDescription({
            type: "answer",
            sdp: answerSdp
        });

        console.log("[WEBRTC] Remote description set successfully");
        console.log("[INIT] WebRTC initialization complete");

    } catch (error) {
        console.error("[ERROR] Failed during connection setup:", error);
        await disconnectWebRTC();
        throw error;
    }
}

function setupDataChannelHandlers() {
    console.log("[DATA] Setting up handlers. Current state:", dataChannel.readyState);

    dataChannel.onopen = async () => {
        console.log("[DATA] Channel opened");
        try {
            await sendInstructions();
        } catch (error) {
            console.error("[ERROR] Failed to send initial instructions:", error);
        }
    };

    dataChannel.onclose = () => {
        console.log("[DATA] Channel closed");
    };

    dataChannel.onmessage = (e) => {
        try {
            const realtimeEvent = JSON.parse(e.data);
            console.log("[DATA] Received event:", realtimeEvent);
            handleRealtimeEvent(realtimeEvent);
        } catch (error) {
            console.error("[ERROR] Failed to parse message:", error);
        }
    };

    dataChannel.onerror = (error) => {
        console.error("[ERROR] Data channel error:", error);
    };
}

async function sendInstructions() {
    if (!dataChannel || dataChannel.readyState !== "open") {
        console.error("[ERROR] Data channel not ready");
        return;
    }

    const event = {
        type: "response.create",
        response: {
            modalities: ["text", "audio"],
            instructions: chatbotSettings.instructions
        }
    };

    try {
        dataChannel.send(JSON.stringify(event));
        console.log("[DATA] Sent instructions:", event);
    } catch (error) {
        console.error("[ERROR] Failed to send instructions:", error);
        throw error;
    }
}

// Clean up on page unload
window.addEventListener('beforeunload', disconnectWebRTC);
