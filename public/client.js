const socket = io();

// DOM Elements
const transcriptionDiv = document.getElementById('transcription');
const floatingOrb = document.getElementById('floatingOrb');
const micIcon = document.getElementById('micIcon');
const systemMessageTextarea = document.getElementById('systemMessage');
const setSystemMessageBtn = document.getElementById('setSystemMessage');

let isRecording = false;
let recognition;
let botResponseBuffer = ''; // Buffer for incremental responses

// Append messages to the transcription div
function appendTranscription(text) {
    const p = document.createElement('p');
    p.innerHTML = text;
    transcriptionDiv.appendChild(p);
    transcriptionDiv.scrollTop = transcriptionDiv.scrollHeight;
}

// Handle incoming bot responses
socket.on('bot-response', (data) => {
    console.log('Appending bot response:', data);
    botResponseBuffer += data; // Append token to buffer
    appendTranscription(`<strong>Bot:</strong> ${botResponseBuffer}`); // Update UI incrementally
});

// Handle end of bot responses
socket.on('bot-response-end', () => {
    console.log('Bot response ended.');
    botResponseBuffer = ''; // Reset buffer
});

// Optional: Handle received system message
socket.on('set-system-message', (message) => {
    console.log(`System message received from server: ${message}`);
});

// Log connection status
socket.on('connect', () => console.log('Connected to server via Socket.io'));
socket.on('disconnect', () => console.log('Disconnected from server'));

// Set system message
setSystemMessageBtn.addEventListener('click', () => {
    const systemMessage = systemMessageTextarea.value.trim();
    if (systemMessage) {
        socket.emit('set-system-message', systemMessage);
        appendTranscription(`<strong>System:</strong> ${systemMessage}`);
        systemMessageTextarea.value = '';
    } else {
        alert('Please enter a system message to define the bot\'s personality.');
    }
});

// Initialize Speech Recognition
function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        alert('Your browser does not support Speech Recognition. Please use Chrome or Edge.');
        return;
    }

    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
        const transcript = event.results[event.results.length - 1][0].transcript.trim();
        if (transcript) {
            appendTranscription(`<strong>You:</strong> ${transcript}`);
            socket.emit('user-message', transcript);
        }
    };

    recognition.onerror = (event) => {
        appendTranscription('<span class="text-danger">Error: Speech recognition failed.</span>');
    };

    recognition.onend = () => {
        if (isRecording) recognition.start();
    };
}

// Toggle recording
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
