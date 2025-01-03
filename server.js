const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const dotenv = require('dotenv');
const axios = require('axios');
const { createParser } = require('eventsource-parser'); // Import for streaming

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from 'public' directory
app.use(express.static('public'));

// Handle Socket.IO connections
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('set-system-message', (message) => {
        socket.systemMessage = message;
        console.log(`System message set for ${socket.id}: ${message}`);
    });

    // Handle user messages
    socket.on('user-message', async (message) => {
        console.log(`User message from ${socket.id}: ${message}`);
    
        const messages = [
            { role: 'system', content: socket.systemMessage || 'You are a helpful assistant.' },
            { role: 'user', content: message },
        ];
    
        console.log('Sending request to OpenAI API:', messages); // Log the outgoing messages
    
        try {
            const response = await axios.post(
                'https://api.openai.com/v1/chat/completions',
                {
                    model: 'gpt-4o-realtime-preview-2024-12-17',// Ensure this is the correct model
                    messages: messages,
                    stream: true, // Enable streaming
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                    },
                    responseType: 'stream',
                }
            );
        
            console.log('OpenAI API response streaming started.');
        
            const parser = createParser((event) => {
                if (event.type === 'event') {
                    const data = JSON.parse(event.data);
                    if (data.choices?.[0]?.delta?.content) {
                        socket.emit('bot-response', data.choices[0].delta.content);
                    }
                }
            });
        
            response.data.on('data', (chunk) => {
                parser.feed(chunk.toString());
            });
        
            response.data.on('end', () => {
                console.log('OpenAI API response streaming ended.');
                socket.emit('bot-response-end');
            });
        
        } catch (error) {
            // Log the detailed error message
            console.error('OpenAI API Error:', error.message);
            if (error.response) {
                console.error('Status:', error.response.status); // HTTP status code
                console.error('Headers:', error.response.headers); // Response headers
                console.error('Data:', error.response.data); // Actual error message
            } else {
                console.error('Error details:', error); // Other errors
            }
        
            // Send a friendly message to the frontend
            socket.emit('bot-response', 'Sorry, there was an error processing your request.');
        }
    });
    

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
