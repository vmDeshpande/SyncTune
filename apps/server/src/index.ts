import express from "express";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";

const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? "3000");

const app = express();
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, { cors: { origin: false } });

io.on("connection", (socket) => {
  socket.on("disconnect", () => {
    // connection lifecycle placeholder
  });
});

const server = httpServer.listen(port, host, () => {
  console.log(`SyncTune server listening on ${host}:${port}`);
});

function shutdown(): void {
  io.close();
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
export { app, io };
