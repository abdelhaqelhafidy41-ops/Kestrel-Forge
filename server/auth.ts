import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import type { Request, Response, NextFunction } from 'express';
import { db } from './db.ts';

export const ADMIN_COOKIE_NAME = 'kf_admin_session';

const DEV_FALLBACK_SECRET = 'dev-only-kestrel-forge-secret-change-in-production';

function getJwtSecret(): string {
  const configured = process.env.JWT_SECRET?.trim();
  if (configured && configured !== 'replace-with-strong-random-32-byte-secret') {
    return configured;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('FATAL: JWT_SECRET environment variable must be configured to a strong random value in production.');
  }
  return DEV_FALLBACK_SECRET;
}

export interface AdminTokenPayload {
  userId: number;
  email: string;
  role: string;
}

export function verifyAdminCredentials(email: string, password: string): AdminTokenPayload | null {
  const row = db
    .prepare('SELECT id, email, password_hash, role FROM admin_users WHERE email = ?')
    .get(email.trim().toLowerCase()) as
    | { id: number; email: string; password_hash: string; role: string }
    | undefined;

  if (!row) return null;
  const valid = bcrypt.compareSync(password, row.password_hash);
  if (!valid) return null;

  return {
    userId: row.id,
    email: row.email,
    role: row.role,
  };
}

export function signAdminToken(payload: AdminTokenPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '24h' });
}

export function verifyAdminToken(token: string): AdminTokenPayload | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as AdminTokenPayload;
    const exists = db
      .prepare('SELECT id, email, role FROM admin_users WHERE id = ? AND email = ?')
      .get(decoded.userId, decoded.email) as { id: number; email: string; role: string } | undefined;
    if (!exists) return null;
    return {
      userId: exists.id,
      email: exists.email,
      role: exists.role,
    };
  } catch {
    return null;
  }
}

export interface AuthenticatedRequest extends Request {
  admin?: AdminTokenPayload;
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const token = req.cookies?.[ADMIN_COOKIE_NAME];
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const payload = verifyAdminToken(token);
  if (!payload || payload.role !== 'admin') {
    res.status(403).json({ error: 'Admin authorization required' });
    return;
  }

  req.admin = payload;
  next();
}
