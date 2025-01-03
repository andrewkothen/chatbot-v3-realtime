const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const WebSocket = require('ws');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// State to manage response locks per client
const sessionLocks = new Map();

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Initialize lock state for this client
    sessionLocks.set(socket.id, { isResponseInProgress: false });

    socket.on('user-audio-chunk', (base64Chunk) => {
        const clientState = sessionLocks.get(socket.id);
        if (!socket.ws || socket.ws.readyState !== WebSocket.OPEN) {
            console.warn('WebSocket not ready for audio chunks.');
            return;
        }

        const event = {
            type: "input_audio_buffer.append",
            audio: base64Chunk,
        };
        socket.ws.send(JSON.stringify(event));
    });

    socket.on('commit-audio', () => {
        const clientState = sessionLocks.get(socket.id);

        // If a response is already in progress, reject the commit
        if (clientState.isResponseInProgress) {
            console.log('Response in progress. Ignoring commit-audio event.');
            return;
        }

        if (!socket.ws || socket.ws.readyState !== WebSocket.OPEN) {
            console.warn('WebSocket not ready for audio commit.');
            return;
        }

        // Mark the session as busy
        clientState.isResponseInProgress = true;

        const commitEvent = {
            type: "input_audio_buffer.commit",
        };
        socket.ws.send(JSON.stringify(commitEvent));

        const responseEvent = {
            type: "response.create",
            response: {
                modalities: ["audio", "text"],
            },
        };
        socket.ws.send(JSON.stringify(responseEvent));

        console.log('Response created for client:', socket.id);
    });

    socket.on('start-session', (systemMessage) => {
        const url = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17";
        const ws = new WebSocket(url, {
            headers: {
                "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
                "OpenAI-Beta": "realtime=v1",
            },
        });

        ws.on("open", () => {
            console.log("WebSocket connection established for client:", socket.id);
        });
        
        ws.on("message", (data) => {
            const serverEvent = JSON.parse(data);
            const clientState = sessionLocks.get(socket.id);
        
            if (serverEvent.type === "response.audio.delta") {
                socket.emit('bot-audio', serverEvent.delta);
            }
        
            if (serverEvent.type === "response.text.delta") {
                // Emit text delta as partial response
                socket.emit('bot-response', { type: 'text', data: serverEvent.delta });
            }
        
            if (serverEvent.type === "response.done") {
                // Emit the final text response
                const fullResponse = serverEvent.response.output[0].text;
                socket.emit('bot-response-final', fullResponse);
        
                // Mark the response as complete
                clientState.isResponseInProgress = false;
                console.log('Response completed for client:', socket.id);
            }
        });
        

        ws.on("close", () => {
            console.log('WebSocket connection closed for client:', socket.id);
        });

        ws.on("error", (err) => {
            console.error('WebSocket error for client:', socket.id, err);
        });

        socket.ws = ws; // Store WebSocket instance
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        if (socket.ws) {
            socket.ws.close();
        }
        sessionLocks.delete(socket.id); // Remove state for this client
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
