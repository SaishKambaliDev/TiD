import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { isDatabaseReady } from '../db/connect.js';
import { UserModel, type IUser } from '../models/User.js';

export interface AuthenticatedRequest extends Request {
  userId?: string;
  userDoc?: IUser;
}

const JWT_COOKIE_NAME = 'tid_session';

function getJwtSecret(): string {
  return process.env.JWT_SECRET || 'tid-dev-secret-change-in-production';
}

export function signAuthToken(userId: string): string {
  return jwt.sign({ sub: userId }, getJwtSecret(), { expiresIn: '14d' });
}

export function setAuthCookie(res: Response, token: string): void {
  res.cookie(JWT_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 14 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie(JWT_COOKIE_NAME, { path: '/' });
}

export function requireDatabase(
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!isDatabaseReady()) {
    res.status(503).json({
      error:
        'MongoDB is not connected. Set the MONGODB_URI environment variable and ensure the database is reachable.',
      code: 'DB_UNAVAILABLE',
    });
    return;
  }
  next();
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!isDatabaseReady()) {
    res.status(503).json({
      error:
        'MongoDB is not connected. Set the MONGODB_URI environment variable and ensure the database is reachable.',
      code: 'DB_UNAVAILABLE',
    });
    return;
  }

  const cookieToken = req.cookies?.[JWT_COOKIE_NAME] as string | undefined;
  const header = req.headers.authorization;
  const bearerToken =
    header && header.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
  const token = bearerToken || cookieToken;

  if (!token) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret()) as { sub?: string };
    if (!decoded.sub) {
      res.status(401).json({ error: 'Invalid session token.' });
      return;
    }

    const user = await UserModel.findById(decoded.sub);
    if (!user) {
      res.status(401).json({ error: 'User account not found.' });
      return;
    }

    req.userId = user._id.toString();
    req.userDoc = user;
    next();
  } catch {
    res.status(401).json({ error: 'Session expired or invalid.' });
  }
}
