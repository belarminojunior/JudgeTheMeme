// Custom server: Next.js + Socket.IO for online rooms on the same port.
import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import next from "next";
import { Server } from "socket.io";
import type { ClientToServer, ServerToClient } from "./src/lib/online";
import { getMemePool, MEME_CATALOG } from "./src/server/memes";
import { attachRooms } from "./src/server/rooms";

const port = parseInt(process.env.PORT || "3000", 10);
const dev = !process.argv.includes("--prod");
const app = next({ dev });
const handle = app.getRequestHandler();

/** LAN addresses, so the host's QR code points at an address other phones can reach. */
function lanAddresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) if (a.family === "IPv4" && !a.internal) out.push(a.address);
  }
  // Prefer typical home Wi-Fi ranges first.
  const rank = (ip: string) => (ip.startsWith("192.168.") && !ip.startsWith("192.168.137.") ? 0 : ip.startsWith("10.") ? 1 : 2);
  return out.sort((a, b) => rank(a) - rank(b));
}

function json(res: import("node:http").ServerResponse, body: unknown) {
  res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

app.prepare().then(() => {
  const httpServer = createServer(async (req, res) => {
    const url = req.url ?? "/";
    if (url === "/api/memes") return json(res, await getMemePool());
    if (url === "/api/memes/catalog") return json(res, MEME_CATALOG);
    if (url === "/api/lan") return json(res, { port, addresses: lanAddresses() });
    return handle(req, res);
  });

  const io = new Server<ClientToServer, ServerToClient>(httpServer);
  attachRooms(io);

  httpServer.listen(port, "0.0.0.0", () => {
    console.log(`> Judge The Meme on http://localhost:${port} (${dev ? "dev" : "production"})`);
    for (const ip of lanAddresses()) console.log(`> On your network: http://${ip}:${port}`);
  });
});
