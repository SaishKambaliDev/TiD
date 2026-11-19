import { Router } from 'express';
import { z } from 'zod';
import {
  extractCalibrationConstraintsWithGroq,
  GroqServiceError,
} from '../engines/groqService.js';
import { getLocalDateString } from '../engines/timeUtils.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { DailyCalibrationModel } from '../models/DailyCalibration.js';
import { TaskEventModel } from '../models/TaskEvent.js';
import { mapCalibration } from '../services/mappers.js';

export const calibrationRouter = Router();
calibrationRouter.use(requireAuth);

const calibrationBodySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.enum(['pending', 'completed', 'skipped']).default('completed'),
  energyLevel: z
    .enum(['very_energetic', 'good', 'normal', 'a_little_tired', 'low_energy'])
    .default('normal'),
  availableCapacityChoice: z
    .enum([
      'full_free_time',
      'less_than_usual',
      'few_hours',
      'unusually_busy',
      'custom',
    ])
    .default('full_free_time'),
  customAvailableMinutes: z.number().int().min(0).max(1440).nullable().optional(),
  availableWindows: z
    .array(
      z.object({
        start: z.string().regex(/^\d{2}:\d{2}$/),
        end: z.string().regex(/^\d{2}:\d{2}$/),
      })
    )
    .default([]),
  routineChangesSummary: z.string().max(400).default(''),
  customCommitments: z
    .array(
      z.object({
        id: z.string(),
        title: z.string().trim().min(1).max(100),
        startTime: z.string().regex(/^\d{2}:\d{2}$/),
        endTime: z.string().regex(/^\d{2}:\d{2}$/),
        isFixed: z.boolean().default(true),
      })
    )
    .default([]),
  workloadPerception: z
    .enum(['light', 'manageable', 'heavy', 'overwhelming'])
    .default('manageable'),
  priorityTaskIds: z.array(z.string()).default([]),
  customPriorities: z.array(z.string().trim().min(1)).default([]),
  preferredSessionStyle: z
    .enum([
      'long_uninterrupted',
      'short_frequent_breaks',
      'mixed',
      'no_preference',
    ])
    .default('no_preference'),
  preferredSessionMinutes: z.number().int().min(15).max(180).default(50),
  preferredBreakMinutes: z.number().int().min(5).max(45).default(10),
  unexpectedConstraintsText: z.string().max(800).default(''),
  extractedConstraints: z
    .array(
      z.object({
        type: z.enum([
          'unavailable_window',
          'leave_early',
          'rest',
          'priority_target',
          'commitment',
          'note',
        ]),
        description: z.string(),
        startTime: z.string().optional(),
        endTime: z.string().optional(),
        targetTaskTitle: z.string().optional(),
        effect: z.string(),
      })
    )
    .optional(),
});

calibrationRouter.get(
  '/daily-calibration/:date',
  async (req: AuthenticatedRequest, res) => {
    const date = req.params.date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ error: 'Date must be YYYY-MM-DD.' });
      return;
    }

    const doc = await DailyCalibrationModel.findOne({
      userId: req.userId,
      date,
    });
    res.json({ calibration: doc ? mapCalibration(doc) : null });
  }
);

calibrationRouter.post(
  '/daily-calibration/extract-constraints',
  async (req: AuthenticatedRequest, res) => {
    const text =
      typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    const date =
      typeof req.body?.date === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(req.body.date)
        ? req.body.date
        : getLocalDateString(req.userDoc!.timezone);

    if (!text) {
      res.json({ extractedConstraints: [] });
      return;
    }

    try {
      const extractedConstraints = await extractCalibrationConstraintsWithGroq(
        {
          text,
          localDate: date,
          timezone: req.userDoc!.timezone,
        }
      );
      res.json({ extractedConstraints });
    } catch (err) {
      if (err instanceof GroqServiceError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: 'Failed to analyze constraints.' });
    }
  }
);

calibrationRouter.post(
  '/daily-calibration',
  async (req: AuthenticatedRequest, res) => {
    const parsed = calibrationBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues[0]?.message ?? 'Invalid calibration data',
      });
      return;
    }

    const date =
      parsed.data.date ?? getLocalDateString(req.userDoc!.timezone);
    const existing = await DailyCalibrationModel.findOne({
      userId: req.userId,
      date,
    });

    let extractedConstraints = parsed.data.extractedConstraints ?? [];
    let groqWarning: string | undefined;

    if (
      parsed.data.status === 'completed' &&
      parsed.data.unexpectedConstraintsText.trim() &&
      extractedConstraints.length === 0
    ) {
      try {
        extractedConstraints = await extractCalibrationConstraintsWithGroq({
          text: parsed.data.unexpectedConstraintsText.trim(),
          localDate: date,
          timezone: req.userDoc!.timezone,
        });
      } catch (err) {
        groqWarning =
          err instanceof Error
            ? err.message
            : 'Groq constraint extraction unavailable; saved raw note.';
      }
    }

    const saved = await DailyCalibrationModel.findOneAndUpdate(
      { userId: req.userId, date },
      {
        $set: {
          ...parsed.data,
          userId: req.userId,
          date,
          extractedConstraints,
          calibrationCountToday: (existing?.calibrationCountToday ?? 0) + 1,
          lastUpdatedAt: new Date(),
        },
      },
      { upsert: true, new: true }
    );

    await TaskEventModel.create({
      userId: req.userId,
      taskId: null,
      eventType: 'calibration_recorded',
      occurredAt: new Date(),
      localDate: date,
      calibrationEnergy: parsed.data.energyLevel,
      metadata: {
        status: parsed.data.status,
        workloadPerception: parsed.data.workloadPerception,
      },
    });

    res.status(existing ? 200 : 201).json({
      calibration: mapCalibration(saved),
      groqWarning,
    });
  }
);

calibrationRouter.patch(
  '/daily-calibration/:date',
  async (req: AuthenticatedRequest, res) => {
    const date = req.params.date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ error: 'Date must be YYYY-MM-DD.' });
      return;
    }

    const parsed = calibrationBodySchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues[0]?.message ?? 'Invalid calibration update',
      });
      return;
    }

    const existing = await DailyCalibrationModel.findOne({
      userId: req.userId,
      date,
    });
    if (!existing) {
      res.status(404).json({ error: 'Calibration record not found for date.' });
      return;
    }

    const updated = await DailyCalibrationModel.findOneAndUpdate(
      { userId: req.userId, date },
      {
        $set: {
          ...parsed.data,
          lastUpdatedAt: new Date(),
        },
        $inc: { calibrationCountToday: 1 },
      },
      { new: true }
    );

    res.json({ calibration: mapCalibration(updated!) });
  }
);
