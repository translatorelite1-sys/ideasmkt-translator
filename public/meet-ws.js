/**
 * Ideas MKT Live Translator — meet-ws.js
 * Módulo 1: Captura audio de Google Meet y lo envía al backend por WebSocket.
 * Incluir en admin.html: <script src="meet-ws.js"></script>
 */

const MEET_WS_URL = (location.protocol === 'https:' ? 'wss' : 'ws') +
  '://' + location.host;

let meetStream   = null;
let audioContext = null;
let mediaSource  = null;
let processor    = null;
let meetWs       = null;
let isMeetActive = false;

// ── UI Button ────────────────────────────────────────────────────────────────

function initMeetWSButton() {
  const btn = document.getElementById('btnModoMeetWS');
  if (!btn) return;

  btn.addEventListener('click', () => {
    isMeetActive ? stopMeetModeWS() : startMeetModeWS();
  });
}

// ── Start ────────────────────────────────────────────────────────────────────

async function startMeetModeWS() {
  if (meetWs && meetWs.readyState === WebSocket.OPEN) return;

  setMeetStatus('Conectando...');

  meetWs = new WebSocket(MEET_WS_URL);

  meetWs.binaryType = 'arraybuffer';

  meetWs.onopen = async () => {
    try {
      // Registrar como fuente de audio (no como asistente)
      meetWs.send(JSON.stringify({ type: 'meet_source', role: 'audio_input' }));

      // Solicitar captura de pestaña con audio
      meetStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        }
      });

      audioContext = new AudioContext({ sampleRate: 16000 });
      mediaSource  = audioContext.createMediaStreamSource(meetStream);
      processor    = audioContext.createScriptProcessor(4096, 1, 1);

      mediaSource.connect(processor);
      processor.connect(audioContext.destination);

      processor.onaudioprocess = (e) => {
        if (meetWs && meetWs.readyState === WebSocket.OPEN) {
          const input  = e.inputBuffer.getChannelData(0);
          const pcm16  = floatTo16BitPCM(input);
          meetWs.send(pcm16);
        }
      };

      // Handle stream stop (user closes share)
      meetStream.getAudioTracks()[0].onended = stopMeetModeWS;

      isMeetActive = true;
      setMeetStatus('● Capturando audio de Meet');
      updateMeetBtn(true);

    } catch (err) {
      setMeetStatus('Error: ' + (err.message || 'No se pudo capturar'));
      stopMeetModeWS();
    }
  };

  meetWs.onclose = () => {
    if (isMeetActive) {
      setMeetStatus('Reconectando...');
      setTimeout(startMeetModeWS, 3000);
    }
  };

  meetWs.onerror = () => {
    setMeetStatus('Error de WebSocket');
    stopMeetModeWS();
  };
}

// ── Stop ─────────────────────────────────────────────────────────────────────

function stopMeetModeWS() {
  isMeetActive = false;

  if (processor)    { processor.disconnect();   processor    = null; }
  if (mediaSource)  { mediaSource.disconnect(); mediaSource  = null; }
  if (audioContext) { audioContext.close();      audioContext = null; }
  if (meetStream)   {
    meetStream.getTracks().forEach(t => t.stop());
    meetStream = null;
  }
  if (meetWs && meetWs.readyState === WebSocket.OPEN) {
    meetWs.close();
  }
  meetWs = null;

  setMeetStatus('Detenido');
  updateMeetBtn(false);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function floatTo16BitPCM(float32Array) {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view   = new DataView(buffer);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

function setMeetStatus(text) {
  const el = document.getElementById('meetWSStatus');
  if (el) el.textContent = text;
  console.log('[MeetWS]', text);
}

function updateMeetBtn(active) {
  const btn = document.getElementById('btnModoMeetWS');
  if (!btn) return;
  if (active) {
    btn.textContent = '⏹ Detener captura Meet';
    btn.style.background = 'rgba(255,80,80,0.15)';
    btn.style.borderColor = 'rgba(255,80,80,0.5)';
    btn.style.color = '#ff7070';
  } else {
    btn.textContent = '▶ Activar modo Google Meet';
    btn.style.background = '';
    btn.style.borderColor = '';
    btn.style.color = '';
  }
}

// ── Auto-init ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', initMeetWSButton);

