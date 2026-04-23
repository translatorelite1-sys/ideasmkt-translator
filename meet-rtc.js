/**
 * Ideas MKT Live Translator — meet-rtc.js
 * Módulo 2: Captura audio de Google Meet via WebRTC.
 * Incluir en admin.html: <script src="meet-rtc.js"></script>
 */

const SIGNAL_URL = (location.protocol === 'https:' ? 'wss' : 'ws') +
  '://' + location.host + '/meet-rtc-signal';

let pc            = null;
let signalSocket  = null;
let meetStreamRTC = null;
let isMeetRTCActive = false;

// ── UI Button ────────────────────────────────────────────────────────────────

function initMeetRTCButton() {
  const btn = document.getElementById('btnModoMeetRTC');
  if (!btn) return;
  btn.addEventListener('click', () => {
    isMeetRTCActive ? stopMeetModeRTC() : startMeetModeRTC();
  });
}

// ── Start ────────────────────────────────────────────────────────────────────

async function startMeetModeRTC() {
  if (isMeetRTCActive) return;
  setMeetRTCStatus('Conectando señalización...');

  signalSocket = new WebSocket(SIGNAL_URL);

  signalSocket.onopen = async () => {
    try {
      pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ]
      });

      // Capturar audio de Meet (pestaña compartida)
      meetStreamRTC = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        }
      });

      // Agregar tracks de audio al peer connection
      meetStreamRTC.getAudioTracks().forEach(track => {
        pc.addTrack(track, meetStreamRTC);
      });

      // Cuando el usuario deja de compartir
      meetStreamRTC.getAudioTracks()[0].onended = stopMeetModeRTC;

      // Enviar ICE candidates al backend
      pc.onicecandidate = (e) => {
        if (e.candidate && signalSocket.readyState === WebSocket.OPEN) {
          signalSocket.send(JSON.stringify({
            type: 'candidate',
            candidate: e.candidate
          }));
        }
      };

      pc.oniceconnectionstatechange = () => {
        setMeetRTCStatus('ICE: ' + pc.iceConnectionState);
        if (pc.iceConnectionState === 'connected') {
          setMeetRTCStatus('● WebRTC conectado · Transmitiendo');
          isMeetRTCActive = true;
          updateMeetRTCBtn(true);
        }
        if (pc.iceConnectionState === 'disconnected' ||
            pc.iceConnectionState === 'failed') {
          stopMeetModeRTC();
        }
      };

      // Crear oferta SDP
      const offer = await pc.createOffer({ offerToReceiveAudio: false });
      await pc.setLocalDescription(offer);

      signalSocket.send(JSON.stringify({ type: 'offer', offer }));
      setMeetRTCStatus('Oferta SDP enviada...');

    } catch (err) {
      setMeetRTCStatus('Error: ' + (err.message || 'No se pudo iniciar'));
      stopMeetModeRTC();
    }
  };

  signalSocket.onmessage = async (msg) => {
    try {
      const data = JSON.parse(msg.data);
      if (data.type === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        setMeetRTCStatus('Respuesta SDP recibida...');
      }
      if (data.type === 'candidate') {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
      if (data.type === 'error') {
        setMeetRTCStatus('Error del servidor: ' + data.message);
      }
    } catch (e) {
      console.error('[MeetRTC] Error procesando mensaje:', e);
    }
  };

  signalSocket.onclose = () => {
    if (isMeetRTCActive) {
      setMeetRTCStatus('Señalización cerrada');
      stopMeetModeRTC();
    }
  };

  signalSocket.onerror = () => {
    setMeetRTCStatus('Error de señalización WebSocket');
    stopMeetModeRTC();
  };
}

// ── Stop ─────────────────────────────────────────────────────────────────────

function stopMeetModeRTC() {
  isMeetRTCActive = false;

  if (pc) { pc.close(); pc = null; }
  if (signalSocket && signalSocket.readyState === WebSocket.OPEN) {
    signalSocket.close();
  }
  signalSocket = null;
  if (meetStreamRTC) {
    meetStreamRTC.getTracks().forEach(t => t.stop());
    meetStreamRTC = null;
  }

  setMeetRTCStatus('Detenido');
  updateMeetRTCBtn(false);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function setMeetRTCStatus(text) {
  const el = document.getElementById('meetRTCStatus');
  if (el) el.textContent = text;
  console.log('[MeetRTC]', text);
}

function updateMeetRTCBtn(active) {
  const btn = document.getElementById('btnModoMeetRTC');
  if (!btn) return;
  if (active) {
    btn.textContent = '⏹ Detener WebRTC';
    btn.style.background  = 'rgba(255,80,80,0.15)';
    btn.style.borderColor = 'rgba(255,80,80,0.5)';
    btn.style.color       = '#ff7070';
  } else {
    btn.textContent = '▶ Activar modo Meet (WebRTC)';
    btn.style.background  = '';
    btn.style.borderColor = '';
    btn.style.color       = '';
  }
}

// ── Auto-init ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', initMeetRTCButton);

