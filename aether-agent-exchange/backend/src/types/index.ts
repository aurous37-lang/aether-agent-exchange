import { Request } from 'express';

export interface AuthPayload {
  userId: string;
  walletAddress: string;
  role: string;
}

export interface AuthRequest extends Request {
  auth?: AuthPayload;
}

export interface WsMessage {
  type: string;
  data: unknown;
}
