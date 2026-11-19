import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { isValidTimezone } from '../engines/timeUtils.js';
import {
  clearAuthCookie,
  requireAuth,
  requireDatabase,
  setAuthCookie,
  signAuthToken,
  type AuthenticatedRequest,
} from '../middleware/auth.js';
import { UserModel } from '../models/User.js';
import { getOrCreateBehaviourProfile, mapUser } from '../services/mappers.js';

export const authRouter = Router();

const registerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  email: z.string().trim().email('Valid email is required'),
  password: z.string().min(6, 'Password must be at least 6 characters').max(128),
  timezone: z.string().trim().optional(),
});

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

const settingsSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  timezone: z.string().trim().optional(),
  workingHours: z
    .object({
      start: z.string().regex(/^\d{2}:\d{2}$/),
      end: z.string().regex(/^\d{2}:\d{2}$/),
    })
    .optional(),
  defaultBreakMinutes: z.number().int().min(5).max(60).optional(),
  defaultBufferRatio: z.number().min(0).max(0.4).optional(),
  defaultSessionMinutes: z.number().int().min(15).max(180).optional(),
});

authRouter.post('/auth/register', requireDatabase, async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }

  const { name, email, password } = parsed.data;
  const tz =
    parsed.data.timezone && isValidTimezone(parsed.data.timezone)
      ? parsed.data.timezone
      : 'UTC';

  const existing = await UserModel.findOne({ email: email.toLowerCase() });
  if (existing) {
    res.status(409).json({ error: 'An account with this email already exists.' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await UserModel.create({
    name,
    email: email.toLowerCase(),
    passwordHash,
    timezone: tz,
  });

  await getOrCreateBehaviourProfile(user._id.toString());

  const token = signAuthToken(user._id.toString());
  setAuthCookie(res, token);
  res.status(201).json({ user: mapUser(user), token });
});

authRouter.post('/auth/login', requireDatabase, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Valid email and password are required.' });
    return;
  }

  const user = await UserModel.findOne({
    email: parsed.data.email.toLowerCase(),
  });
  if (!user) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  const token = signAuthToken(user._id.toString());
  setAuthCookie(res, token);
  res.json({ user: mapUser(user), token });
});

authRouter.post('/auth/logout', (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

authRouter.get('/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
  res.json({ user: mapUser(req.userDoc!) });
});

authRouter.patch(
  '/settings',
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: parsed.error.issues[0]?.message ?? 'Invalid settings' });
      return;
    }

    const user = req.userDoc!;
    if (parsed.data.name) user.name = parsed.data.name;
    if (parsed.data.timezone) {
      if (!isValidTimezone(parsed.data.timezone)) {
        res.status(400).json({ error: 'Invalid IANA timezone identifier.' });
        return;
      }
      user.timezone = parsed.data.timezone;
    }
    if (parsed.data.workingHours) user.workingHours = parsed.data.workingHours;
    if (parsed.data.defaultBreakMinutes !== undefined) {
      user.defaultBreakMinutes = parsed.data.defaultBreakMinutes;
    }
    if (parsed.data.defaultBufferRatio !== undefined) {
      user.defaultBufferRatio = parsed.data.defaultBufferRatio;
    }
    if (parsed.data.defaultSessionMinutes !== undefined) {
      user.defaultSessionMinutes = parsed.data.defaultSessionMinutes;
    }

    await user.save();
    res.json({ user: mapUser(user) });
  }
);
