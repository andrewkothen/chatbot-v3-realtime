const socket = io();

const transcriptionDiv = document.getElementById('transcription');
const floatingOrb = document.getElementById('floatingOrb');
const micIcon = document.getElementById('micIcon');
const systemMessageTextarea = document.getElementById('systemMessage');
const setSystemMessageBtn = document.getElementById('setSystemMessage');

let isRecording = false;
let recognition;

// Audio context and queue for streaming audio responses
const audioContext = new (window.AudioContext || window.webkitAudioContext)();
const audioQueue = [];
let isPlaying = false;

// Function to play audio chunks
function playAudioChunk(chunk) {
    try {
        const audioBuffer = audioContext.createBuffer(1, chunk.length, audioContext.sampleRate);
        const channelData = audioBuffer.getChannelData(0);

        for (let i = 0; i < chunk.length; i++) {
            channelData[i] = chunk[i] / 32768; // Convert pcm16 to Float32
        }

        const bufferSource = audioContext.createBufferSource();
        bufferSource.buffer = audioBuffer;
        bufferSource.connect(audioContext.destination);
        bufferSource.start();

        bufferSource.onended = () => {
            isPlaying = false;
            if (audioQueue.length > 0) {
                playAudioChunk(audioQueue.shift());
            }
        };
    } catch (error) {
        console.error("Error playing audio chunk:", error);
    }
}

function queueAudioChunk(chunk) {
    audioQueue.push(chunk);
    if (!isPlaying) {
        isPlaying = true;
        playAudioChunk(audioQueue.shift());
    }
}

// Append messages to the chat transcription
function appendTranscription(text) {
    const p = document.createElement('p');
    p.innerHTML = text;
    transcriptionDiv.appendChild(p);
    transcriptionDiv.scrollTo({
        top: transcriptionDiv.scrollHeight,
        behavior: 'smooth',
    });
}

// Handle bot text responses
socket.on('bot-response', (data) => {
    if (!document.getElementById('loading-indicator')) {
        const loading = document.createElement('div');
        loading.id = 'loading-indicator';
        loading.innerText = 'Bot is typing...';
        transcriptionDiv.appendChild(loading);
    }
    appendTranscription(`<strong>Bot:</strong> ${data}`);
});

socket.on('bot-response-end', (finalText) => {
    const loading = document.getElementById('loading-indicator');
    if (loading) loading.remove();
    appendTranscription(`<strong>Final Bot Response:</strong> ${finalText}`);
});

// Handle bot audio responses
socket.on('bot-audio', (chunk) => {
    const audioData = Uint8Array.from(atob(chunk), c => c.charCodeAt(0));
    queueAudioChunk(new Int16Array(audioData.buffer));
});

socket.on('bot-audio-end', () => {
    console.log('Audio response completed.');
});

// Connection logs
socket.on('connect', () => console.log('Connected to server'));
socket.on('disconnect', () => console.log('Disconnected from server'));

// Set system message
setSystemMessageBtn.addEventListener('click', () => {
    const systemMessage = systemMessageTextarea.value.trim();
    if (systemMessage) {
        socket.emit('set-system-message', systemMessage);
        appendTranscription(`<strong>System:</strong> ${systemMessage}`);
        systemMessageTextarea.value = '';
    } else {
        alert('Please enter a system message.');
    }
});

// Initialize speech recognition
function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        alert('Speech recognition is not supported in this browser. Please use the latest version of Chrome or Edge.');
        return;
    }

    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
        const transcript = event.results[event.results.length - 1][0].transcript.trim();
        if (transcript) {
            appendTranscription(`<strong>You:</strong> ${transcript}`);
            socket.emit('user-message', transcript);
        }
    };

    recognition.onerror = (event) => {
        appendTranscription('<span class="text-danger">Speech recognition error occurred.</span>');
    };

    recognition.onend = () => {
        if (isRecording) recognition.start();
    };
}

// Toggle speech recognition on mic click
floatingOrb.addEventListener('click', () => {
    if (!recognition) initSpeechRecognition();

    if (isRecording) {
        recognition.stop();
        floatingOrb.classList.remove('active');
        micIcon.src = 'mic-icon.png';
    } else {
        recognition.start();
        floatingOrb.classList.add('active');
        micIcon.src = 'mic-active.png';
    }
    isRecording = !isRecording;
});
