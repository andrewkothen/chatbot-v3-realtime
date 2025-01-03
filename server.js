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

    // Store the system message for this user
    socket.on('set-system-message', (message) => {
        socket.systemMessage = message;
        console.log(`System message set for ${socket.id}: ${message}`);
    });

    // Handle user messages
    socket.on('user-message', (message) => {
        console.log(`User message from ${socket.id}: ${message}`);

        // WebSocket connection to OpenAI Realtime API
        const url = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17";
        const ws = new WebSocket(url, {
            headers: {
                "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
                "OpenAI-Beta": "realtime=v1",
            },
        });

        // When the connection opens
        ws.on("open", () => {
            console.log("Connected to OpenAI Realtime API.");

            // Send request for text and audio response
            const event = {
                type: "response.create",
                response: {
                    modalities: ["audio", "text"], // Request both text and audio
                    instructions: socket.systemMessage || "You are a friendly chatbot.",
                    voice: {
                        name: "verse", // Specify voice (e.g., alloy, breeze, etc.
                    },
                },
            // No turn_detection parameter for now.
            };
            ws.send(JSON.stringify(event));
        });

        // Handle incoming messages from OpenAI API
        ws.on("message", (data) => {
            console.log("Received WebSocket message:", data.toString());
            try {
                const serverEvent = JSON.parse(data);
                console.log("Parsed server event:", serverEvent);
        
                if (serverEvent.type === "response.text.delta" && serverEvent.delta) {
                    console.log("Streaming text delta:", serverEvent.delta);
                    socket.emit('bot-response', serverEvent.delta);
                }
                if (serverEvent.type === "response.text.done") {
                    console.log("Final text response:", serverEvent.text);
                    socket.emit('bot-response-end', serverEvent.text);
                }
                if (serverEvent.type === "response.audio.delta" && serverEvent.delta) {
                    console.log("Streaming audio delta:", serverEvent.delta);
                    socket.emit('bot-audio', serverEvent.delta);
                }
                if (serverEvent.type === "response.audio.done") {
                    console.log("Audio response completed.");
                    socket.emit('bot-audio-end');
                }
            } catch (error) {
                console.error("Error parsing WebSocket message:", error.message, data.toString());
            }
        });
        
        ws.on("close", (code, reason) => {
            console.log(`WebSocket closed. Code: ${code}, Reason: ${reason?.toString()}`);
        });
        
        ws.on("error", (error) => {
            console.error("WebSocket error occurred:", error.message);
        });
        
        // Handle connection close
        ws.on("close", (code, reason) => {
            console.log(`WebSocket closed. Code: ${code}, Reason: ${reason?.toString()}`);
        });

        // Handle errors
        ws.on("error", (error) => {
            console.error("WebSocket error:", error.message);
            socket.emit('bot-response', 'Sorry, there was an error processing your request.');
        });
    });

    // Log disconnection
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
