import { Request } from 'express';

export function paramId(req: Request): string {
  const id = req.params.id;
  if (Array.isArray(id)) return id[0];
  return id;
}
