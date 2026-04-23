/**
 * ============================================================
 *  Ideas MKT Live Translator — meet-ws.js
 *  Conexión WebSocket para admin y asistentes
 * ============================================================
 */

let ws = null;
let reconnectTimer = null;

// Detectar URL automáticamente según hosting
const WS_URL =
  (location.protocol === "https:" ? "wss://" : "ws://") +
  location.host;

// ------------------------------------------------------------
//  Conectar WebSocket
// ------------------------------------------------------------
function connectBackend() {
  if (ws && ws.readyState === WebSocket.OPEN) return;

  console.log("[WS] Conectando a:", WS_URL);
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    console.log("[WS] Conectado");
    updateSidebarStatus(true);

    // Registrar admin
    ws.send(JSON.stringify({ type: "admin" }));
  };

  ws.onclose = () => {
    console.log("[WS] Desconectado");
    updateSidebarStatus(false);

    // Reintentar cada 3s
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connectBackend, 3000);
  };

  ws.onerror = (err) => {
    console.error("[WS] Error:", err);
  };

  ws.onmessage = (msg) => {
    const data = JSON.parse(msg.data);

    if (data.type === "clients_update") {
      updateClientsTable(data.clients);
    }

    if (data.type === "original") {
      updateLastOriginal(data.text);
    }

    if (data.type === "translations") {
      updateLastTranslation(data.translations);
    }

    if (data.type === "audio") {
      playAudioForLang(data.lang, data.audio);
    }
  };
}

// ------------------------------------------------------------
//  Enviar audio desde navegador (si se usa micrófono)
// ------------------------------------------------------------
function sendAudioChunk(base64Audio) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  ws.send(
    JSON.stringify({
      type: "audio_chunk",
      audio: base64Audio,
    })
  );
}

// ------------------------------------------------------------
//  Helpers UI
// ------------------------------------------------------------
function updateSidebarStatus(isOnline) {
  const el = document.getElementById("sidebarStatus");
  if (!el) return;

  if (isOnline) {
    el.classList.add("live");
    el.innerHTML = `<span class="dot"></span> Backend conectado`;
  } else {
    el.classList.remove("live");
    el.innerHTML = `<span class="dot"></span> Backend desconectado`;
  }
}

function updateClientsTable(clients) {
  const tbody = document.getElementById("clientsTable");
  if (!tbody) return;

  tbody.innerHTML = "";

  clients.forEach((c, i) => {
    const row = `
      <tr>
        <td>${i + 1}</td>
        <td>${c.role}</td>
        <td>${c.language}</td>
        <td>${c.connectedAt}</td>
        <td>${c.messages}</td>
      </tr>
    `;
    tbody.innerHTML += row;
  });
}

function updateLastOriginal(text) {
  const el = document.getElementById("lastOriginal");
  if (el) el.innerText = text;
}

function updateLastTranslation(translations) {
  const el = document.getElementById("lastTranslation");
  if (!el) return;

  el.innerHTML = translations
    .map((t) => `<div><b>[${t.lang}]</b> ${t.text}</div>`)
    .join("");
}

// ------------------------------------------------------------
//  Reproducir audio TTS
// ------------------------------------------------------------
function playAudioForLang(lang, base64Audio) {
  const audio = new Audio("data:audio/wav;base64," + base64Audio);
  audio.play();
}

// Auto conectar
setTimeout(connectBackend, 500);
