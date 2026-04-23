import express from "express";
import { WebSocketServer } from "ws";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Servir carpeta public
app.use(express.static(path.join(__dirname, "public")));

// Ruta principal → client.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "client.html"));
});

// Servidor HTTP
const server = app.listen(process.env.PORT || 3000, () => {
  console.log("Servidor HTTP iniciado");
});

// Servidor WebSocket
const wss = new WebSocketServer({ server, path: "/ws/signal" });

wss.on("connection", (ws) => {
  console.log("Cliente conectado a WebSocket");

  ws.on("message", (msg) => {
    // Reenviar señal a todos los clientes
    wss.clients.forEach((client) => {
      if (client !== ws && client.readyState === 1) {
        client.send(msg);
      }
    });
  });

  ws.on("close", () => {
    console.log("Cliente desconectado");
  });
});
