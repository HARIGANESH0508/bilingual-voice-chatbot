# Bilingual Voice Chatbot (Tamil + English)

Voice-first AI chatbot that speaks Tamil and English naturally.

## Architecture

```
Frontend (Vercel)           Backend (Render)
┌──────────────────┐        ┌─────────────────────────┐
│ React + TypeScript│──WSS──│ FastAPI + WebSocket      │
│ VAD (Web Audio)   │        │ Groq Whisper STT         │
│ Audio Playback    │        │ Groq LLM (streaming)     │
│ Browser STT/TTS   │◄──────│ edge-tts (sentence-level)│
│ Cold-start detect │        │ Language detection        │
└──────────────────┘        └─────────────────────────┘
```

## How Language Detection Works

1. **Unicode analysis** — Tamil characters (U+0B80–U+0BFF) counted; if ≥15% of alphabetic chars are Tamil → classified as Tamil
2. **langdetect fallback** — for Latin-script Tamil (Tanglish)
3. **Code-switching** — Tamil+English mixed text classified as Tamil so the reply comes back in Tamil

## Free-Tier Limits

| Service         | Limit                                    |
|-----------------|------------------------------------------|
| **Groq LLM**    | ~30 RPM, ~1000 RPD (llama-3.3-70b)      |
| **Groq Whisper** | ~30 RPM, ~1000 RPD (whisper-large-v3)  |
| **edge-tts**    | Unlimited (no API key, Microsoft Edge)   |
| **Browser STT/TTS** | Unlimited (browser-native)          |

## Setup

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt
cp .env.example .env
# Add your GROQ_API_KEY to .env (get from console.groq.com)
python main.py
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

### Deploy to Vercel + Render
1. Push to GitHub
2. **Render**: New Web Service → Python → start command: `cd backend && pip install -r requirements.txt && python main.py`
3. **Vercel**: Import repo → Framework: Vite → Root: `frontend` → Add env var: `VITE_BACKEND_WS_URL=wss://your-app.onrender.com`
4. On Render: Add env var `FRONTEND_URL=https://your-app.vercel.app`

## Cold Start Behavior

Render free tier spins down after ~15 min idle. On page load:
1. Frontend pings `/api/health` before opening WebSocket
2. If response takes >3s → shows "Waking up server..."
3. Polls every 3s until server responds
4. Mic button disabled until backend is awake

## Whisper Model Tradeoff

Groq Whisper uses `whisper-large-v3-turbo` by default. No local model to configure — Groq handles it server-side with fast inference.
