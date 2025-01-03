const socket = io();

let isRecording = false;
let mediaRecorder;

const floatingOrb = document.getElementById('floatingOrb');
const micIcon = document.getElementById('micIcon');

const audioContext = new (window.AudioContext || window.webkitAudioContext)();
const audioQueue = [];
let isPlaying = false;

function playAudioChunk(chunk) {
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
}

function queueAudioChunk(chunk) {
    audioQueue.push(chunk);
    if (!isPlaying) {
        isPlaying = true;
        playAudioChunk(audioQueue.shift());
    }
}

// Handle bot audio response
socket.on('bot-audio', (chunk) => {
    const audioData = Uint8Array.from(atob(chunk), c => c.charCodeAt(0));
    queueAudioChunk(new Int16Array(audioData.buffer));
});

socket.on('bot-audio-end', () => {
    console.log('Audio response completed.');
});

// Start recording and session
floatingOrb.addEventListener('click', async () => {
    if (!isRecording) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=pcm' });

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                socket.emit('user-audio-chunk', event.data);
            }
        };

        mediaRecorder.start(100); // Send chunks every 100ms
        floatingOrb.classList.add('active');
        micIcon.src = 'mic-active.png';

        socket.emit('start-session', "You are a friendly chatbot.");
    } else {
        mediaRecorder.stop();
        floatingOrb.classList.remove('active');
        micIcon.src = 'mic-icon.png';
    }

    isRecording = !isRecording;
});
