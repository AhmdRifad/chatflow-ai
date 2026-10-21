import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import Groq from 'groq-sdk'; // Import Groq SDK

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Initialize Groq
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

app.post('/api/chat', async (req, res) => {
    try {
        const { message, model } = req.body;

        // Check which model was requested
        if (model && model.startsWith('groq-')) {
            // Handle Groq Models (e.g., groq-llama3, groq-mixtral)
            let groqModelName = 'llama3-8b-8192'; // default fallback
            if (model === 'groq-llama3-70b') groqModelName = 'llama3-70b-8192';
            if (model === 'groq-mixtral') groqModelName = 'mixtral-8x7b-32768';

            const chatCompletion = await groq.chat.completions.create({
                messages: [{ role: 'user', content: message }],
                model: groqModelName,
            });

            const reply = chatCompletion.choices[0]?.message?.content || "No response from Groq.";
            return res.json({ reply });
        } else {
            // Default Gemini handling
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: message,
            });
            return res.json({ reply: response.text });
        }
    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ error: error.message || 'Something went wrong.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
