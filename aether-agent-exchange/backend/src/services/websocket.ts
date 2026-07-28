import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';

interface Client {
  ws: WebSocket;
  userId?: string;
  subscriptions: Set<string>;
}

class WebSocketService {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, Client> = new Map();
  private clientCounter = 0;

  init(server: Server) {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws) => {
      const clientId = `client-${++this.clientCounter}`;
      const client: Client = { ws, subscriptions: new Set() };
      this.clients.set(clientId, client);

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === 'auth' && typeof msg.userId === 'string') {
            client.userId = msg.userId;
          }
          if (msg.type === 'subscribe' && typeof msg.channel === 'string') {
            client.subscriptions.add(msg.channel);
          }
          if (msg.type === 'unsubscribe' && typeof msg.channel === 'string') {
            client.subscriptions.delete(msg.channel);
          }
        } catch {
          // ignore malformed messages
        }
      });

      ws.on('close', () => {
        this.clients.delete(clientId);
      });

      ws.send(JSON.stringify({ type: 'connected', clientId }));
    });
  }

  broadcast(channel: string, type: string, data: unknown) {
    const message = JSON.stringify({ type, channel, data, timestamp: Date.now() });
    for (const client of this.clients.values()) {
      if (client.ws.readyState === WebSocket.OPEN && client.subscriptions.has(channel)) {
        client.ws.send(message);
      }
    }
  }

  sendToUser(userId: string, type: string, data: unknown) {
    const message = JSON.stringify({ type, data, timestamp: Date.now() });
    for (const client of this.clients.values()) {
      if (client.userId === userId && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(message);
      }
    }
  }

  broadcastAll(type: string, data: unknown) {
    const message = JSON.stringify({ type, data, timestamp: Date.now() });
    for (const client of this.clients.values()) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(message);
      }
    }
  }
}

export const wsService = new WebSocketService();
