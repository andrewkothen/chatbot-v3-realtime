const socket = io();

// Elements from the HTML
const systemMessageInput = document.getElementById('systemMessage');
const setSystemMessageButton = document.getElementById('setSystemMessage');
const transcriptionContainer = document.getElementById('transcription');
const floatingOrb = document.getElementById('floatingOrb');
const micIcon = document.getElementById('micIcon');

let isRecording = false;
let mediaRecorder;
let isResponseInProgress = false;
const audioQueue = [];
let isPlaying = false;

// Set System Message
setSystemMessageButton.addEventListener('click', () => {
    const systemMessage = systemMessageInput.value.trim();
    if (systemMessage) {
        socket.emit('start-session', systemMessage);
        console.log(`System message set: "${systemMessage}"`);
    } else {
        console.error('System message cannot be empty.');
    }
});

// Floating Orb Click Handler for Voice Interaction
floatingOrb.addEventListener('click', async () => {
    if (!isRecording) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=pcm' });

        mediaRecorder.ondataavailable = async (event) => {
            if (event.data.size > 0) {
                const audioBuffer = await event.data.arrayBuffer();
                const float32Array = new Float32Array(audioBuffer);
                const base64Audio = btoa(
                    String.fromCharCode(...new Uint8Array(float32Array.buffer))
                );
                socket.emit('user-audio-chunk', base64Audio);
            }
        };

        mediaRecorder.start(100); // Send chunks every 100ms
        floatingOrb.classList.add('active');
        micIcon.src = 'mic-active.png';
        console.log('Recording started.');
    } else {
        mediaRecorder.stop();
        floatingOrb.classList.remove('active');
        micIcon.src = 'mic-icon.png';
        console.log('Recording stopped.');

        if (!isResponseInProgress) {
            isResponseInProgress = true;
            socket.emit('commit-audio');
        } else {
            console.warn('Response in progress. Ignoring commit-audio request.');
        }
    }

    isRecording = !isRecording;
});

// Handle Bot Audio Responses
socket.on('bot-audio', (audioChunk) => {
    const audioData = Uint8Array.from(atob(audioChunk), (c) => c.charCodeAt(0));
    queueAudioChunk(new Int16Array(audioData.buffer));
});

// Handle Bot Text Responses (Partial Deltas)
socket.on('bot-response', (data) => {
    if (data.type === 'text') {
        updatePartialTranscription(data.data); // Update text deltas dynamically
    }
});

// Handle Final Text Responses
socket.on('bot-response-final', (finalResponse) => {
    console.log('Final response:', finalResponse);
    displayFinalResponse(finalResponse);
    isResponseInProgress = false; // Unlock after response completes
});

// Update Partial Transcription Dynamically
function updatePartialTranscription(text) {
    let partialDiv = document.getElementById('partialResponse');
    if (!partialDiv) {
        partialDiv = document.createElement('div');
        partialDiv.id = 'partialResponse';
        transcriptionContainer.appendChild(partialDiv);
    }
    partialDiv.textContent = text; // Update partial response dynamically
    transcriptionContainer.scrollTop = transcriptionContainer.scrollHeight; // Auto-scroll
}

// Display Final Response and Clear Partial Transcription
function displayFinalResponse(finalText) {
    // Clear previous partial response
    const partialDiv = document.getElementById('partialResponse');
    if (partialDiv) {
        partialDiv.remove();
    }

    // Append final response
    const finalDiv = document.createElement('div');
    finalDiv.className = 'final-response mb-2';
    finalDiv.textContent = finalText;
    transcriptionContainer.appendChild(finalDiv);
    transcriptionContainer.scrollTop = transcriptionContainer.scrollHeight; // Auto-scroll
}

// Playback Queue for Audio Responses
function queueAudioChunk(chunk) {
    audioQueue.push(chunk);
    if (!isPlaying) {
        isPlaying = true;
        playAudioChunk(audioQueue.shift());
    }
}

function playAudioChunk(chunk) {
    const audioContext = new AudioContext();
    const audioBuffer = audioContext.createBuffer(1, chunk.length, audioContext.sampleRate);
    const channelData = audioBuffer.getChannelData(0);
    for (let i = 0; i < chunk.length; i++) {
        channelData[i] = chunk[i] / 32768; // Convert PCM16 to Float32
    }

    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    source.start();

    source.onended = () => {
        isPlaying = false;
        if (audioQueue.length > 0) {
            playAudioChunk(audioQueue.shift());
        }
    };
}
