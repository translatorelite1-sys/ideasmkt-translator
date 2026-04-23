import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app  = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'client.html'));
});

app.get('/api/ping', (req, res) => {
  res.json({ ok: true, message: 'Ideas MKT Live Translator activo' });
});

const PORT   = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`Ideas MKT Live Translator corriendo en puerto ${PORT}`);
});

const wss = new WebSocketServer({ server });
let clients = [];

wss.on('connection', (ws) => {
  const client = { ws, role: 'attendee', language: 'es', messages: 0 };
  clients.push(client);

  ws.on('message', async (raw) => {
    try {
      const data = JSON.parse(raw.toString());
      client.messages++;

      if (data.type === 'register') {
        client.language = data.language || 'es';
        client.role = data.role || 'attendee';
      }

      if (data.type === 'audio_text' && data.text) {
        const translations = await translateText(data.text);
        broadcastAll({ type: 'original', text: data.text });
        broadcastAll({ type: 'translations', original: data.text, translations });
      }

    } catch (e) {
      console.error('Error WS:', e.message);
    }
  });

  ws.on('close', () => {
    clients = clients.filter(c => c.ws !== ws);
  });
});

async function translateText(text) {
  const key    = process.env.AZURE_TRANSLATE_KEY;
  const url    = process.env.AZURE_TRANSLATE_URL || 'https://api.eur.cognitive.microsofttranslator.com/translate';
  const region = process.env.AZURE_TRANSLATE_REGION || 'westeurope';
  const langs  = ['es', 'en', 'fr', 'pt'];

  if (!key) {
    return langs.map(l => ({ lang: l, text: `[${l}] ${text}` }));
  }

  try {
    const res = await axios.post(url, [{ Text: text }], {
      params: { 'api-version': '3.0', to: langs },
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Ocp-Apim-Subscription-Region': region,
        'Content-Type': 'application/json',
      }
    });
    return res.data[0].translations.map(t => ({ lang: t.to, text: t.text }));
  } catch (e) {
    console.error('Error traducción:', e.message);
    return langs.map(l => ({ lang: l, text: text }));
  }
}

function broadcastAll(payload) {
  const msg = JSON.stringify(payload);
  clients.forEach(c => {
    if (c.ws.readyState === WebSocket.OPEN) c.ws.send(msg);
  });
}
