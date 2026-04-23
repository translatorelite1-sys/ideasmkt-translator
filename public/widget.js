/**
 * Ideas MKT Live Translator — widget.js
 * Script de una línea para insertar el traductor en cualquier sitio web.
 *
 * USO: Pega esta línea en cualquier sitio web:
 * <script src="https://ideasmkt-translator-production.up.railway.app/widget.js"></script>
 */

(function() {
  'use strict';

  const BACKEND = 'https://ideasmkt-translator-production.up.railway.app';
  const WS_URL  = BACKEND.replace('https://', 'wss://');

  // ── Inject Google Fonts ──────────────────────────────────────────────────
  const font = document.createElement('link');
  font.rel  = 'stylesheet';
  font.href = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300&family=DM+Mono:wght@300;400&display=swap';
  document.head.appendChild(font);

  // ── Inject styles ────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    #imt-widget-btn {
      position: fixed;
      bottom: 24px; right: 24px;
      z-index: 999998;
      width: 56px; height: 56px;
      border-radius: 50%;
      background: linear-gradient(135deg, #c8a84b, #a07828);
      border: none;
      cursor: pointer;
      box-shadow: 0 4px 20px rgba(200,168,75,0.4);
      font-size: 1.4rem;
      display: flex; align-items: center; justify-content: center;
      transition: all 0.3s;
      animation: imt-pulse 2.5s ease infinite;
    }
    #imt-widget-btn:hover { transform: scale(1.1); }
    #imt-widget-btn.active { background: linear-gradient(135deg, #4cffb0, #00c87a); animation: none; }

    @keyframes imt-pulse {
      0%,100% { box-shadow: 0 4px 20px rgba(200,168,75,0.4); }
      50%      { box-shadow: 0 4px 32px rgba(200,168,75,0.7); }
    }

    #imt-widget-panel {
      position: fixed;
      bottom: 92px; right: 24px;
      z-index: 999999;
      width: 340px;
      background: rgba(6,6,14,0.96);
      border: 1px solid rgba(200,168,75,0.25);
      border-radius: 16px;
      backdrop-filter: blur(20px);
      box-shadow: 0 8px 40px rgba(0,0,0,0.5);
      font-family: 'DM Mono', monospace;
      color: #e8e3d5;
      overflow: hidden;
      display: none;
      flex-direction: column;
      animation: imt-slide-up 0.3s ease;
    }
    #imt-widget-panel.open { display: flex; }

    @keyframes imt-slide-up {
      from { opacity: 0; transform: translateY(12px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    .imt-w-header {
      padding: 1rem 1.2rem 0.8rem;
      border-bottom: 1px solid rgba(255,255,255,0.06);
      display: flex; align-items: center; justify-content: space-between;
    }
    .imt-w-logo {
      font-family: 'Cormorant Garamond', serif;
      font-size: 1.05rem; font-weight: 300;
    }
    .imt-w-logo em { color: #c8a84b; font-style: italic; }
    .imt-w-close {
      background: none; border: none; color: #444;
      cursor: pointer; font-size: 0.85rem; padding: 2px 6px;
      border-radius: 4px; transition: color 0.2s;
    }
    .imt-w-close:hover { color: #ff6b6b; }

    .imt-w-body { padding: 1rem 1.2rem; display: flex; flex-direction: column; gap: 0.8rem; }

    .imt-w-label {
      font-size: 0.55rem; letter-spacing: 0.3em;
      color: #555; text-transform: uppercase; margin-bottom: 0.3rem;
      display: block;
    }
    .imt-w-select {
      width: 100%;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 7px; color: #e8e3d5;
      padding: 0.5rem 0.7rem;
      font-family: 'DM Mono', monospace;
      font-size: 0.78rem; cursor: pointer;
    }
    .imt-w-select option { background: #1a1a2e; }

    .imt-w-btn {
      width: 100%; padding: 0.65rem;
      border-radius: 8px; border: 1px solid #c8a84b;
      background: rgba(200,168,75,0.12); color: #c8a84b;
      font-family: 'DM Mono', monospace; font-size: 0.78rem;
      letter-spacing: 0.1em; cursor: pointer; text-transform: uppercase;
      transition: all 0.2s;
    }
    .imt-w-btn:hover { background: rgba(200,168,75,0.22); }
    .imt-w-btn.stop {
      background: rgba(255,80,80,0.1);
      border-color: rgba(255,80,80,0.4); color: #ff7070;
    }

    .imt-w-status {
      font-size: 0.6rem; letter-spacing: 0.15em;
      color: #4cffb0; text-transform: uppercase; text-align: center;
      min-height: 1rem;
    }

    .imt-w-subtitles {
      background: rgba(255,255,255,0.02);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 10px; padding: 0.8rem;
      min-height: 80px;
    }
    .imt-w-partial {
      font-size: 0.7rem; color: #444; font-style: italic;
      min-height: 1rem; margin-bottom: 0.4rem; line-height: 1.5;
    }
    .imt-w-final {
      font-family: 'Cormorant Garamond', serif;
      font-size: 1.05rem; color: #f0ead8; line-height: 1.5;
    }
    .imt-w-final.empty { color: #2a2a3a; font-style: italic; }

    .imt-w-footer {
      padding: 0.5rem 1.2rem 0.7rem;
      border-top: 1px solid rgba(255,255,255,0.04);
      font-size: 0.52rem; color: #1e1e2e;
      letter-spacing: 0.2em; text-align: center; text-transform: uppercase;
    }
  `;
  document.head.appendChild(style);

  // ── Create DOM ───────────────────────────────────────────────────────────
  const btn = document.createElement('button');
  btn.id = 'imt-widget-btn';
  btn.innerHTML = '🌐';
  btn.title = 'Ideas MKT Live Translator';

  const panel = document.createElement('div');
  panel.id = 'imt-widget-panel';
  panel.innerHTML = `
    <div class="imt-w-header">
      <div class="imt-w-logo">Ideas MKT <em>Translator</em></div>
      <button class="imt-w-close" id="imt-close-btn">✕</button>
    </div>
    <div class="imt-w-body">
      <div>
        <label class="imt-w-label">Tu idioma</label>
        <select class="imt-w-select" id="imt-my-lang">
          <option value="es">🇪🇸 Español</option>
          <option value="en">🇺🇸 English</option>
          <option value="fr">🇫🇷 Français</option>
          <option value="pt">🇧🇷 Português</option>
          <option value="de">🇩🇪 Deutsch</option>
          <option value="it">🇮🇹 Italiano</option>
          <option value="zh">🇨🇳 中文</option>
          <option value="ja">🇯🇵 日本語</option>
        </select>
      </div>
      <div class="imt-w-status" id="imt-w-status">Sin conexión</div>
      <button class="imt-w-btn" id="imt-connect-btn">Conectar</button>
      <div class="imt-w-subtitles">
        <div class="imt-w-partial" id="imt-w-partial"></div>
        <div class="imt-w-final empty" id="imt-w-final">La traducción aparecerá aquí...</div>
      </div>
    </div>
    <div class="imt-w-footer">Ideas MKT · Live Translator</div>
  `;

  document.body.appendChild(btn);
  document.body.appendChild(panel);

  // ── Logic ────────────────────────────────────────────────────────────────
  let ws = null;
  let isConnected = false;

  btn.onclick = () => panel.classList.toggle('open');
  document.getElementById('imt-close-btn').onclick = () => panel.classList.remove('open');

  document.getElementById('imt-connect-btn').onclick = () => {
    isConnected ? disconnect() : connect();
  };

  function connect() {
    const lang = document.getElementById('imt-my-lang').value;
    try {
      ws = new WebSocket(WS_URL);
      ws.onopen = () => {
        isConnected = true;
        ws.send(JSON.stringify({ type: 'register', language: lang }));
        setStatus('● Conectado');
        document.getElementById('imt-connect-btn').textContent = 'Desconectar';
        document.getElementById('imt-connect-btn').classList.add('stop');
        btn.classList.add('active');
      };
      ws.onmessage = (evt) => {
        try { handleMsg(JSON.parse(evt.data)); } catch(e) {}
      };
      ws.onclose = () => {
        isConnected = false;
        setStatus('Desconectado');
        document.getElementById('imt-connect-btn').textContent = 'Conectar';
        document.getElementById('imt-connect-btn').classList.remove('stop');
        btn.classList.remove('active');
      };
    } catch(e) { setStatus('Error de conexión'); }
  }

  function disconnect() {
    ws && ws.close();
  }

  function handleMsg(data) {
    if (data.type === 'partial') {
      document.getElementById('imt-w-partial').textContent = data.text;
    }
    if (data.type === 'translations') {
      const lang = document.getElementById('imt-my-lang').value;
      const t = (data.translations || []).find(x => x.lang.startsWith(lang));
      if (t) {
        const el = document.getElementById('imt-w-final');
        el.textContent = t.text;
        el.classList.remove('empty');
        document.getElementById('imt-w-partial').textContent = '';
      }
    }
    if (data.type === 'audio') {
      const lang = document.getElementById('imt-my-lang').value;
      if (data.lang.startsWith(lang)) {
        new Audio('data:audio/wav;base64,' + data.audio).play().catch(()=>{});
      }
    }
  }

  function setStatus(text) {
    document.getElementById('imt-w-status').textContent = text;
  }

  console.log('✓ Ideas MKT Live Translator cargado.');
})();

