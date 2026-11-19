import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { DailyRoutineModel } from '../models/DailyRoutine.js';
import { DailyRoutineOverrideModel } from '../models/DailyRoutineOverride.js';
import { mapRoutine, mapRoutineOverride } from '../services/mappers.js';

export const routineRouter = Router();
routineRouter.use(requireAuth);

const routineSchema = z.object({
  activityName: z.string().trim().min(1).max(80),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  daysOfWeek: z.array(z.number().int().min(1).max(7)).min(1),
  activityType: z.enum([
    'sleep',
    'meal',
    'work_office',
    'college',
    'exercise',
    'commute',
    'personal',
    'break',
  ]),
  isFixed: z.boolean().default(true),
  isMovable: z.boolean().default(false),
  isActive: z.boolean().default(true),
  notes: z.string().max(400).optional(),
});

const overrideSchema = z.object({
  routineId: z.string().nullable().optional(),
  action: z.enum(['modify', 'disable', 'add']),
  activityName: z.string().trim().min(1).max(80),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).default('09:00'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).default('10:00'),
  activityType: z
    .enum([
      'sleep',
      'meal',
      'work_office',
      'college',
      'exercise',
      'commute',
      'personal',
      'break',
    ])
    .default('personal'),
  isFixed: z.boolean().default(true),
  isMovable: z.boolean().default(false),
  notes: z.string().max(400).optional(),
});

routineRouter.get('/routines', async (req: AuthenticatedRequest, res) => {
  const docs = await DailyRoutineModel.find({ userId: req.userId }).sort({
    startTime: 1,
  });
  res.json({ routines: docs.map(mapRoutine) });
});

routineRouter.post('/routines', async (req: AuthenticatedRequest, res) => {
  const parsed = routineSchema.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: parsed.error.issues[0]?.message ?? 'Invalid routine' });
    return;
  }

  const created = await DailyRoutineModel.create({
    userId: req.userId,
    ...parsed.data,
    notes: parsed.data.notes ?? '',
  });
  res.status(201).json({ routine: mapRoutine(created) });
});

routineRouter.patch('/routines/:id', async (req: AuthenticatedRequest, res) => {
  const parsed = routineSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: parsed.error.issues[0]?.message ?? 'Invalid routine' });
    return;
  }

  const updated = await DailyRoutineModel.findOneAndUpdate(
    { _id: req.params.id, userId: req.userId },
    { $set: parsed.data },
    { new: true }
  );
  if (!updated) {
    res.status(404).json({ error: 'Routine not found.' });
    return;
  }
  res.json({ routine: mapRoutine(updated) });
});

routineRouter.delete(
  '/routines/:id',
  async (req: AuthenticatedRequest, res) => {
    const deleted = await DailyRoutineModel.findOneAndDelete({
      _id: req.params.id,
      userId: req.userId,
    });
    if (!deleted) {
      res.status(404).json({ error: 'Routine not found.' });
      return;
    }
    res.json({ ok: true });
  }
);

routineRouter.get(
  '/routines/overrides/:date',
  async (req: AuthenticatedRequest, res) => {
    const date = req.params.date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ error: 'Date must be YYYY-MM-DD.' });
      return;
    }
    const docs = await DailyRoutineOverrideModel.find({
      userId: req.userId,
      date,
    });
    res.json({ overrides: docs.map(mapRoutineOverride) });
  }
);

routineRouter.put(
  '/routines/overrides/:date',
  async (req: AuthenticatedRequest, res) => {
    const date = req.params.date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ error: 'Date must be YYYY-MM-DD.' });
      return;
    }

    const parsed = overrideSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: parsed.error.issues[0]?.message ?? 'Invalid override' });
      return;
    }

    if (parsed.data.routineId) {
      const updated = await DailyRoutineOverrideModel.findOneAndUpdate(
        {
          userId: req.userId,
          date,
          routineId: parsed.data.routineId,
        },
        {
          $set: {
            ...parsed.data,
            userId: req.userId,
            date,
            notes: parsed.data.notes ?? '',
          },
        },
        { upsert: true, new: true }
      );
      res.json({ override: mapRoutineOverride(updated) });
      return;
    }

    const created = await DailyRoutineOverrideModel.create({
      userId: req.userId,
      date,
      ...parsed.data,
      routineId: null,
      notes: parsed.data.notes ?? '',
    });
    res.status(201).json({ override: mapRoutineOverride(created) });
  }
);

routineRouter.delete(
  '/routines/overrides/:date/:overrideId',
  async (req: AuthenticatedRequest, res) => {
    const deleted = await DailyRoutineOverrideModel.findOneAndDelete({
      _id: req.params.overrideId,
      userId: req.userId,
      date: req.params.date,
    });
    if (!deleted) {
      res.status(404).json({ error: 'Routine override not found.' });
      return;
    }
    res.json({ ok: true });
  }
);
