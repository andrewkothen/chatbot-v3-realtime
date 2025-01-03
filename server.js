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

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('user-audio-chunk', (chunk) => {
        if (socket.ws && socket.ws.readyState === WebSocket.OPEN) {
            socket.ws.send(chunk); // Send audio chunk directly to OpenAI
        }
    });

    socket.on('start-session', (systemMessage) => {
        console.log(`Starting session for ${socket.id}.`);

        const url = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17";
        const ws = new WebSocket(url, {
            headers: {
                "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
                "OpenAI-Beta": "realtime=v1",
            },
        });

        ws.on("open", () => {
            console.log("Connected to OpenAI Realtime API.");
            const event = {
                type: "response.create",
                response: {
                    modalities: ["audio", "text"], // Request audio and text responses
                    instructions: systemMessage || "You are a friendly chatbot.",
                    voice: "alloy", // Valid voice
                },
            };
            ws.send(JSON.stringify(event));
        });

        ws.on("message", (data) => {
            const serverEvent = JSON.parse(data);
            console.log("Received server event:", serverEvent);

            // Forward audio responses
            if (serverEvent.type === "response.audio.delta" && serverEvent.delta) {
                socket.emit('bot-audio', serverEvent.delta);
            }
            if (serverEvent.type === "response.audio.done") {
                socket.emit('bot-audio-end');
            }

            // Handle optional text responses
            if (serverEvent.type === "response.text.delta" && serverEvent.delta) {
                socket.emit('bot-response', serverEvent.delta);
            }
        });

        ws.on("close", (code, reason) => {
            console.log(`WebSocket closed. Code: ${code}, Reason: ${reason?.toString()}`);
            socket.emit('bot-response-end');
        });

        ws.on("error", (error) => {
            console.error("WebSocket error:", error.message);
            socket.emit('bot-response', 'Sorry, there was an error processing your request.');
        });

        socket.ws = ws; // Store WebSocket instance for the user
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        if (socket.ws) {
            socket.ws.close();
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
