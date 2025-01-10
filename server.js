// server.js
import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import path from "path";
import cors from "cors";
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Endpoint to create a session and get ephemeral token
app.get("/session", async (req, res) => {
    console.log("[SESSION] Creating new session");

    try {
        const response = await fetch("https://api.openai.com/v1/realtime/sessions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: "gpt-4o-realtime-preview-2024-12-17",
                voice: "verse",
            }),
        });

        const data = await response.json();
        console.log("[SESSION] Response:", data);

        if (!response.ok) {
            console.error("[ERROR] Failed to create session:", data);
            return res.status(response.status).json(data);
        }

        res.json(data);
    } catch (error) {
        console.error("[ERROR] Server error:", error);
        res.status(500).json({
            error: "Internal server error",
            message: error.message
        });
    }
});

app.listen(PORT, () => {
    console.log(`[STARTUP] Server running on http://localhost:${PORT}`);
});