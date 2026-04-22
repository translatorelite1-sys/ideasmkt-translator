/**
 * ============================================================
 *  Ideas MKT Live Translator — server.js
 *  Backend completo: Express + WebSocket + Azure STT/MT/TTS
 * ============================================================
 *
 *  REQUISITOS:
 *    npm install express ws dotenv axios microsoft-cognitiveservices-speech-sdk cors
 *
 *  VARIABLES DE ENTORNO (.env):
 *    AZURE_KEY=tu_clave_azure_speech
 *    AZURE_REGION=eastus
 *    AZURE_TRANSLATE_KEY=tu_clave_azure_translator
 *    AZURE_TRANSLATE_REGION=eastus
 *    AZURE_TRANSLATE_URL=https://api.cognitive.microsofttranslator.com/translate
 *    PORT=4000
 *
 *  EJECUTAR:
 *    node server.js
 */

import 'dotenv/config';
import express     from 'express';
import cors        from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import path        from 'path';
import { fileURLToPath } from 'url';
import axios       from 'axios';
import sdk         from 'microsoft-cognitiveservices-speech-sdk';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ============================================================
//  CONFIG
// ============================================================

const PORT               = process.env.PORT               || 4000;
const AZURE_KEY          = process.env.AZURE_KEY          || '';
const AZURE_REGION       = process.env.AZURE_REGION       || 'eastus';
const AZURE_TRANSLATE_KEY    = process.env.AZURE_TRANSLATE_KEY    || '';
const AZURE_TRANSLATE_REGION = process.env.AZURE_TRANSLATE_REGION || 'eastus';
const AZURE_TRANSLATE_URL    = process.env.AZURE_TRANSLATE_URL
  || 'https://api.cognitive.microsofttranslator.com/translate';

// Idiomas que se traducirán por defecto
let activeTargetLangs = ['es', 'en', 'fr', 'pt'];

// ============================================================
//  EXPRESS
// ============================================================

const app = express();
app.use(cors());
app.use(express.json());

// Servir frontend estático (carpeta /public)
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/ping', (req, res) => {
  res.json({ ok: true, message: 'Ideas MKT Live Translator activo', timestamp: new Date() });
});

app.get('/api/status', (req, res) => {
  res.json({
    clients: clients.filter(c => c.role !== 'admin').length,
    admins:  clients.filter(c => c.role === 'admin').length,
    langs:   activeTargetLangs,
  });
});

// ============================================================
//  HTTP SERVER + WEBSOCKET
// ============================================================

const server = app.listen(PORT, () => {
  console.log(`\n🚀 Ideas MKT Live Translator`);
  console.log(`   HTTP  → http://localhost:${PORT}`);
  console.log(`   Admin → http://localhost:${PORT}/admin.html`);
  console.log(`   Client→ http://localhost:${PORT}/client.html\n`);
});

const wss = new WebSocketServer({ server });

/**
 * clients: Array de { ws, role, language, connectedAt, messages }
 */
let clients = [];

wss.on('connection', (ws) => {
  const client = {
    ws,
    role: 'attendee',
    language: 'es',
    connectedAt: new Date().toLocaleTimeString(),
    messages: 0,
  };
  clients.push(client);
  console.log(`[WS] Cliente conectado. Total: ${clients.length}`);

  ws.on('message', async (raw) => {
    try {
      const data = JSON.parse(raw.toString());
      client.messages++;

      // Registro inicial del cliente con su idioma preferido
      if (data.type === 'register') {
        client.language = data.language || 'es';
        client.role = 'attendee';
        console.log(`[WS] Asistente registrado: idioma=${client.language}`);
        broadcastAdmins({ type: 'clients_update', clients: getClientsSummary() });
      }

      // Registro del panel admin
      if (data.type === 'admin') {
        client.role = 'admin';
        console.log('[WS] Admin conectado');
        broadcastAdmins({ type: 'clients_update', clients: getClientsSummary() });
      }

      // Admin puede cambiar idiomas activos en caliente
      if (data.type === 'set_languages') {
        activeTargetLangs = data.languages || activeTargetLangs;
        console.log(`[WS] Idiomas activos actualizados: ${activeTargetLangs.join(', ')}`);
      }

      // Audio binario enviado desde el orador (si usas input desde browser)
      // data.type === 'audio_chunk' → data.audio (base64)
      if (data.type === 'audio_chunk') {
        const audioBuffer = Buffer.from(data.audio, 'base64');
        await processAudioChunk(audioBuffer);
      }

    } catch (e) {
      console.error('[WS] Error procesando mensaje:', e.message);
    }
  });

  ws.on('close', () => {
    clients = clients.filter(c => c.ws !== ws);
    console.log(`[WS] Cliente desconectado. Total: ${clients.length}`);
    broadcastAdmins({ type: 'clients_update', clients: getClientsSummary() });
  });

  ws.on('error', (err) => {
    console.error('[WS] Error de socket:', err.message);
  });
});

// ============================================================
//  PIPELINE PRINCIPAL
//  Audio → STT → Texto → Traducción → TTS → Broadcast
// ============================================================

/**
 * Punto de entrada principal.
 * Llama esta función cuando recibas audio desde tu consola,
 * micrófono físico, OBS, o cualquier fuente externa.
 *
 * @param {Buffer} audioBuffer  — PCM 16-bit, 16 kHz, mono
 */
export async function processAudioChunk(audioBuffer) {
  try {
    // ── 1) Speech to Text ──────────────────────────────────
    const originalText = await sttAzure(audioBuffer);
    if (!originalText || !originalText.trim()) {
      console.log('[STT] Fragmento vacío, omitido.');
      return;
    }
    console.log(`[STT] Reconocido: "${originalText}"`);

    // Emitir texto original a todos (asistentes y admins)
    broadcastAll({ type: 'original', text: originalText });

    // ── 2) Machine Translation ─────────────────────────────
    const translations = await translateAzure(originalText, activeTargetLangs);
    console.log(`[MT] Traducido a ${translations.length} idiomas`);

    // Emitir traducciones de texto
    broadcastAll({ type: 'translations', original: originalText, translations });

    // ── 3) Text to Speech (por idioma) ────────────────────
    for (const t of translations) {
      try {
        const langCode = langToAzureCode(t.lang);
        const audioData = await ttsAzure(t.text, langCode);
        if (audioData && audioData.byteLength > 0) {
          await broadcastAudioToLang(t.lang, audioData);
          console.log(`[TTS] Audio generado para [${t.lang}]`);
        }
      } catch (err) {
        console.error(`[TTS] Error para idioma ${t.lang}:`, err.message);
      }
    }

  } catch (err) {
    console.error('[PIPELINE] Error:', err.message);
  }
}

// ============================================================
//  STT — Azure Speech to Text
// ============================================================

function sttAzure(audioBuffer) {
  return new Promise((resolve, reject) => {
    if (!AZURE_KEY) {
      console.warn('[STT] Sin AZURE_KEY — usando texto simulado');
      return resolve('Texto de ejemplo reconocido (configura AZURE_KEY)');
    }

    const speechConfig = sdk.SpeechConfig.fromSubscription(AZURE_KEY, AZURE_REGION);
    speechConfig.speechRecognitionLanguage = 'es-MX'; // idioma del orador

    const pushStream  = sdk.AudioInputStream.createPushStream();
    pushStream.write(audioBuffer);
    pushStream.close();

    const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);
    const recognizer  = new sdk.SpeechRecognizer(speechConfig, audioConfig);

    // Resultados parciales (mientras habla)
    recognizer.recognizing = (s, e) => {
      broadcastAll({ type: 'partial', text: e.result.text });
    };

    // Resultado final confirmado
    recognizer.recognized = (s, e) => {
      recognizer.close();
      if (e.result.reason === sdk.ResultReason.RecognizedSpeech) {
        resolve(e.result.text);
      } else {
        resolve('');
      }
    };

    recognizer.canceled = (s, e) => {
      recognizer.close();
      reject(new Error(e.errorDetails || 'STT cancelado'));
    };

    recognizer.startContinuousRecognitionAsync(
      () => {},
      (err) => reject(new Error(err))
    );
  });
}

// ============================================================
//  MT — Azure Translator
// ============================================================

async function translateAzure(text, targetLangs = ['en']) {
  if (!AZURE_TRANSLATE_KEY) {
    console.warn('[MT] Sin AZURE_TRANSLATE_KEY — usando simulación');
    return targetLangs.map(l => ({ lang: l, text: `[${l}] ${text}` }));
  }

  try {
    const response = await axios({
      method: 'post',
      url: AZURE_TRANSLATE_URL,
      params: {
        'api-version': '3.0',
        to: targetLangs,
      },
      headers: {
        'Ocp-Apim-Subscription-Key': AZURE_TRANSLATE_KEY,
        'Ocp-Apim-Subscription-Region': AZURE_TRANSLATE_REGION,
        'Content-Type': 'application/json',
      },
      data: [{ Text: text }],
    });

    // Mapear respuesta de Azure a formato { lang, text }
    const translations = response.data[0]?.translations || [];
    return translations.map(t => ({ lang: t.to, text: t.text }));

  } catch (err) {
    console.error('[MT] Error:', err.response?.data || err.message);
    return targetLangs.map(l => ({ lang: l, text: text }));
  }
}

// ============================================================
//  TTS — Azure Neural Voices
// ============================================================

function ttsAzure(text, langCode = 'en-US') {
  return new Promise((resolve, reject) => {
    if (!AZURE_KEY) {
      console.warn('[TTS] Sin AZURE_KEY — devolviendo buffer vacío');
      return resolve(Buffer.from(''));
    }

    const speechConfig = sdk.SpeechConfig.fromSubscription(AZURE_KEY, AZURE_REGION);
    speechConfig.speechSynthesisLanguage  = langCode;
    speechConfig.speechSynthesisVoiceName = voiceForLang(langCode);

    const pullStream  = sdk.AudioOutputStream.createPullStream();
    const audioConfig = sdk.AudioConfig.fromStreamOutput(pullStream);
    const synthesizer = new sdk.SpeechSynthesizer(speechConfig, audioConfig);

    synthesizer.speakTextAsync(
      text,
      (result) => {
        synthesizer.close();
        if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
          resolve(Buffer.from(result.audioData));
        } else {
          reject(new Error(result.errorDetails || 'TTS falló'));
        }
      },
      (error) => {
        synthesizer.close();
        reject(new Error(error));
      }
    );
  });
}

// ============================================================
//  MAPAS DE IDIOMA / VOZ
// ============================================================

function voiceForLang(langCode) {
  const map = {
    'en-US': 'en-US-AriaNeural',
    'en-GB': 'en-GB-SoniaNeural',
    'es-MX': 'es-MX-DaliaNeural',
    'es-ES': 'es-ES-ElviraNeural',
    'fr-FR': 'fr-FR-DeniseNeural',
    'pt-BR': 'pt-BR-FranciscaNeural',
    'de-DE': 'de-DE-KatjaNeural',
    'it-IT': 'it-IT-ElsaNeural',
    'zh-CN': 'zh-CN-XiaoxiaoNeural',
    'ja-JP': 'ja-JP-NanamiNeural',
    'ko-KR': 'ko-KR-SunHiNeural',
    'ar-SA': 'ar-SA-ZariyahNeural',
  };
  return map[langCode] || 'en-US-AriaNeural';
}

function langToAzureCode(lang) {
  const map = {
    es: 'es-MX',
    en: 'en-US',
    fr: 'fr-FR',
    pt: 'pt-BR',
    de: 'de-DE',
    it: 'it-IT',
    zh: 'zh-CN',
    ja: 'ja-JP',
    ko: 'ko-KR',
    ar: 'ar-SA',
    ru: 'ru-RU',
  };
  return map[lang] || 'en-US';
}

// ============================================================
//  BROADCAST HELPERS
// ============================================================

function send(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

/** Envía a todos los clientes (asistentes y admins) */
function broadcastAll(payload) {
  clients.forEach(c => send(c.ws, payload));
}

/** Envía solo a los paneles admin */
function broadcastAdmins(payload) {
  clients.filter(c => c.role === 'admin').forEach(c => send(c.ws, payload));
}

/** Envía audio solo a los asistentes que hablan ese idioma */
async function broadcastAudioToLang(lang, audioBuffer) {
  const base64 = Buffer.from(audioBuffer).toString('base64');
  const payload = JSON.stringify({ type: 'audio', lang, audio: base64 });

  clients
    .filter(c => c.role === 'attendee' && c.language.startsWith(lang))
    .forEach(c => {
      if (c.ws.readyState === WebSocket.OPEN) {
        c.ws.send(payload);
      }
    });
}

/** Resumen de clientes para el panel admin */
function getClientsSummary() {
  return clients.map(c => ({
    role:        c.role,
    language:    c.language,
    connectedAt: c.connectedAt,
    messages:    c.messages,
  }));
}

