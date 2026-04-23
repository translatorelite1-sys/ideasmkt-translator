import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'client.html')));
app.get('/api/ping', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT;
const server = app.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));

const wss = new WebSocketServer({ server });
let clients = [];

wss.on('connection', (ws) => {
  const client = { ws, language: 'es' };
  clients.push(client);

  ws.on('message', async (raw) => {
    try {
      const data = JSON.parse(raw.toString());
      if (data.type === 'register') client.language = data.language || 'es';
      if (data.type === 'audio_text' && data.text) {
        const translations = await translate(data.text);
        broadcast({ type: 'original', text: data.text });
        broadcast({ type: 'translations', translations });
      }
    } catch (e) {}
  });

  ws.on('close', () => { clients = clients.filter(c => c.ws !== ws); });
});

async function translate(text) {
  const key = process.env.AZURE_TRANSLATE_KEY;
  const url = process.env.AZURE_TRANSLATE_URL;
  const region = process.env.AZURE_TRANSLATE_REGION;
  const langs = ['es', 'en', 'fr', 'pt'];
  if (!key) return langs.map(l => ({ lang: l, text }));
  try {
    const res = await axios.post(url, [{ Text: text }], {
      params: { 'api-version': '3.0', to: langs },
      headers: { 'Ocp-Apim-Subscription-Key': key, 'Ocp-Apim-Subscription-Region': region, 'Content-Type': 'application/json' }
    });
    return res.data[0].translations.map(t => ({ lang: t.to, text: t.text }));
  } catch (e) {
    return langs.map(l => ({ lang: l, text }));
  }
}

function broadcast(payload) {
  const msg = JSON.stringify(payload);
  clients.forEach(c => { if (c.ws.readyState === WebSocket.OPEN) c.ws.send(msg); });
}
