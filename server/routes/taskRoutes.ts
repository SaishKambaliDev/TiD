import crypto from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import {
  applyPostponementObservation,
  applyTaskCompletionObservation,
  generateEvidenceBackedInsights,
  predictEffortMinutes,
} from '../engines/bayesianEngine.js';
import { calculateDailyCapacity } from '../engines/capacityEngine.js';
import {
  GroqServiceError,
  understandTaskWithGroq,
} from '../engines/groqService.js';
import {
  assessDeadlineRisks,
  generateRecommendations,
} from '../engines/riskAndRecommendationEngine.js';
import {
  getLocalDateString,
  getPreviousDateString,
} from '../engines/timeUtils.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { DailyCalibrationModel } from '../models/DailyCalibration.js';
import { DailyPlanModel } from '../models/DailyPlan.js';
import { DailyRoutineModel } from '../models/DailyRoutine.js';
import { DailyRoutineOverrideModel } from '../models/DailyRoutineOverride.js';
import { TaskModel } from '../models/Task.js';
import { TaskEventModel } from '../models/TaskEvent.js';
import { WorkSessionModel } from '../models/WorkSession.js';
import {
  getOrCreateBehaviourProfile,
  mapBehaviourProfile,
  mapCalibration,
  mapDailyPlan,
  mapRoutine,
  mapRoutineOverride,
  mapTask,
  mapWorkSession,
} from '../services/mappers.js';

export const taskRouter = Router();
taskRouter.use(requireAuth);

const createTaskSchema = z.object({
  title: z.string().trim().min(1, 'Task title is required').max(160),
  description: z.string().max(2000).default(''),
  category: z
    .enum([
      'coding',
      'writing',
      'studying',
      'design',
      'meeting',
      'admin',
      'research',
      'background_job',
      'personal',
      'other',
    ])
    .default('other'),
  priority: z.enum(['urgent', 'high', 'medium', 'low']).default('medium'),
  status: z
    .enum(['todo', 'in_progress', 'completed', 'waiting_list'])
    .default('todo'),
  deadline: z.string().nullable().optional(),
  userEstimatedMinutes: z.number().int().min(5).max(2400).nullable().optional(),
  aiEstimatedMinutes: z.number().int().min(5).max(2400).nullable().optional(),
  attentionClass: z
    .enum(['attention_intensive', 'background', 'partially_attentive'])
    .default('attention_intensive'),
  overlapAllowedWith: z
    .array(
      z.enum(['attention_intensive', 'background', 'partially_attentive'])
    )
    .default([]),
  splittingPreference: z
    .enum(['continuous', 'shorter_sessions', 'ai_suggested'])
    .default('ai_suggested'),
  milestones: z
    .array(
      z.object({
        id: z.string().optional(),
        title: z.string().trim().min(1),
        completed: z.boolean().default(false),
        estimatedMinutes: z.number().int().min(5).default(30),
      })
    )
    .default([]),
  dependencies: z.array(z.string()).default([]),
  groqAnalysis: z
    .object({
      clarifyingQuestions: z.array(z.string()).default([]),
      executionCharacteristics: z.array(z.string()).default([]),
      suggestedOverlapNote: z.string().optional(),
      confidence: z.number().optional(),
      summary: z.string().optional(),
    })
    .optional(),
  scheduledDate: z.string().nullable().optional(),
});

taskRouter.get('/tasks', async (req: AuthenticatedRequest, res) => {
  const docs = await TaskModel.find({ userId: req.userId }).sort({
    createdAt: -1,
  });
  res.json({ tasks: docs.map(mapTask) });
});

taskRouter.post(
  '/tasks/understand',
  async (req: AuthenticatedRequest, res) => {
    const prompt =
      typeof req.body?.description === 'string'
        ? req.body.description.trim()
        : '';
    if (!prompt) {
      res
        .status(400)
        .json({ error: 'Please enter a natural-language task description.' });
      return;
    }

    const user = req.userDoc!;
    const localDate = getLocalDateString(user.timezone);
    const prevDate = getPreviousDateString(localDate);

    const [openTasks, routines, overridesToday, overridesPrev, calibration, profileDoc] =
      await Promise.all([
        TaskModel.find({ userId: req.userId, status: { $ne: 'completed' } }),
        DailyRoutineModel.find({ userId: req.userId, isActive: true }),
        DailyRoutineOverrideModel.find({ userId: req.userId, date: localDate }),
        DailyRoutineOverrideModel.find({ userId: req.userId, date: prevDate }),
        DailyCalibrationModel.findOne({ userId: req.userId, date: localDate }),
        getOrCreateBehaviourProfile(req.userId!),
      ]);

    try {
      const analysis = await understandTaskWithGroq({
        naturalLanguageInput: prompt,
        userTimezone: user.timezone,
        localDate,
        existingTaskTitles: openTasks.map((t) => t.title),
      });

      const capacity = calculateDailyCapacity({
        localDate,
        timezone: user.timezone,
        workingHours: user.workingHours,
        defaultBufferRatio: user.defaultBufferRatio,
        routines: routines.map(mapRoutine),
        overridesForDate: overridesToday.map(mapRoutineOverride),
        overridesForPrevDate: overridesPrev.map(mapRoutineOverride),
        calibration: calibration ? mapCalibration(calibration) : null,
      });

      const profile = mapBehaviourProfile(profileDoc);
      const bayesianRecommendedMinutes = predictEffortMinutes(
        analysis.aiEstimatedMinutes,
        analysis.category,
        profile
      );

      const matchedDependencies = openTasks
        .filter((t) =>
          analysis.suggestedDependencyTitles.some(
            (title) => title.toLowerCase() === t.title.toLowerCase()
          )
        )
        .map((t) => ({ id: t._id.toString(), title: t.title }));

      res.json({
        analysis,
        bayesianRecommendedMinutes,
        matchedDependencies,
        todayCapacity: capacity.breakdown,
      });
    } catch (err) {
      if (err instanceof GroqServiceError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: 'Task analysis failed.' });
    }
  }
);

taskRouter.post('/tasks', async (req: AuthenticatedRequest, res) => {
  const parsed = createTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: parsed.error.issues[0]?.message ?? 'Invalid task input' });
    return;
  }

  const user = req.userDoc!;
  const localDate = getLocalDateString(user.timezone);
  const profileDoc = await getOrCreateBehaviourProfile(req.userId!);
  const profile = mapBehaviourProfile(profileDoc);

  // Never overwrite user's estimate with AI estimate — store both separately
  const userEst = parsed.data.userEstimatedMinutes ?? null;
  const aiEst = parsed.data.aiEstimatedMinutes ?? null;
  const baselineForPrediction = userEst ?? aiEst ?? 45;
  const recommendedMinutes = predictEffortMinutes(
    baselineForPrediction,
    parsed.data.category,
    profile
  );

  const created = await TaskModel.create({
    userId: req.userId,
    title: parsed.data.title,
    description: parsed.data.description,
    category: parsed.data.category,
    priority: parsed.data.priority,
    status: parsed.data.status,
    deadline: parsed.data.deadline ? new Date(parsed.data.deadline) : null,
    userEstimatedMinutes: userEst,
    aiEstimatedMinutes: aiEst,
    recommendedMinutes,
    attentionClass: parsed.data.attentionClass,
    overlapAllowedWith: parsed.data.overlapAllowedWith,
    splittingPreference: parsed.data.splittingPreference,
    milestones: parsed.data.milestones.map((m) => ({
      id: m.id ?? `ms-${crypto.randomUUID().slice(0, 8)}`,
      title: m.title,
      completed: m.completed,
      estimatedMinutes: m.estimatedMinutes,
    })),
    dependencies: parsed.data.dependencies,
    groqAnalysis: parsed.data.groqAnalysis ?? {
      clarifyingQuestions: [],
      executionCharacteristics: [],
    },
    scheduledDate: parsed.data.scheduledDate ?? null,
  });

  await TaskEventModel.create({
    userId: req.userId,
    taskId: created._id,
    eventType: 'task_created',
    occurredAt: new Date(),
    localDate,
    category: created.category,
    userEstimatedMinutes: created.userEstimatedMinutes,
    aiEstimatedMinutes: created.aiEstimatedMinutes,
    metadata: { priority: created.priority },
  });

  res.status(201).json({ task: mapTask(created) });
});

taskRouter.patch('/tasks/:id', async (req: AuthenticatedRequest, res) => {
  const existing = await TaskModel.findOne({
    _id: req.params.id,
    userId: req.userId,
  });
  if (!existing) {
    res.status(404).json({ error: 'Task not found.' });
    return;
  }

  const parsed = createTaskSchema
    .extend({
      actualMinutes: z.number().min(0).max(5000).optional(),
      elapsedCalendarMinutes: z.number().min(0).max(5000).optional(),
    })
    .partial()
    .safeParse(req.body);

  if (!parsed.success) {
    res
      .status(400)
      .json({ error: parsed.error.issues[0]?.message ?? 'Invalid update' });
    return;
  }

  const user = req.userDoc!;
  const localDate = getLocalDateString(user.timezone);
  const wasCompleted = existing.status === 'completed';
  const prevDeadline = existing.deadline?.getTime() ?? null;

  if (parsed.data.title !== undefined) existing.title = parsed.data.title;
  if (parsed.data.description !== undefined)
    existing.description = parsed.data.description;
  if (parsed.data.category !== undefined)
    existing.category = parsed.data.category;
  if (parsed.data.priority !== undefined)
    existing.priority = parsed.data.priority;
  if (parsed.data.status !== undefined) existing.status = parsed.data.status;
  if (parsed.data.deadline !== undefined) {
    existing.deadline = parsed.data.deadline
      ? new Date(parsed.data.deadline)
      : null;
  }
  if (parsed.data.userEstimatedMinutes !== undefined) {
    existing.userEstimatedMinutes = parsed.data.userEstimatedMinutes;
  }
  if (parsed.data.aiEstimatedMinutes !== undefined) {
    existing.aiEstimatedMinutes = parsed.data.aiEstimatedMinutes;
  }
  if (parsed.data.actualMinutes !== undefined) {
    existing.actualMinutes = parsed.data.actualMinutes;
  }
  if (parsed.data.elapsedCalendarMinutes !== undefined) {
    existing.elapsedCalendarMinutes = parsed.data.elapsedCalendarMinutes;
  }
  if (parsed.data.attentionClass !== undefined) {
    existing.attentionClass = parsed.data.attentionClass;
  }
  if (parsed.data.overlapAllowedWith !== undefined) {
    existing.overlapAllowedWith = parsed.data.overlapAllowedWith;
  }
  if (parsed.data.splittingPreference !== undefined) {
    existing.splittingPreference = parsed.data.splittingPreference;
  }
  if (parsed.data.milestones !== undefined) {
    existing.milestones = parsed.data.milestones.map((m) => ({
      id: m.id ?? `ms-${crypto.randomUUID().slice(0, 8)}`,
      title: m.title,
      completed: m.completed,
      estimatedMinutes: m.estimatedMinutes,
    }));
  }
  if (parsed.data.dependencies !== undefined) {
    existing.dependencies =
      parsed.data.dependencies as unknown as typeof existing.dependencies;
  }
  if (parsed.data.scheduledDate !== undefined) {
    existing.scheduledDate = parsed.data.scheduledDate;
  }

  // Recompute recommendedMinutes if estimates changed while open
  if (
    (parsed.data.userEstimatedMinutes !== undefined ||
      parsed.data.category !== undefined) &&
    existing.status !== 'completed'
  ) {
    const profileDoc = await getOrCreateBehaviourProfile(req.userId!);
    const baseline =
      existing.userEstimatedMinutes ??
      existing.aiEstimatedMinutes ??
      existing.recommendedMinutes;
    existing.recommendedMinutes = predictEffortMinutes(
      baseline,
      existing.category,
      mapBehaviourProfile(profileDoc)
    );
  }

  const now = new Date();

  // Detect postponement
  const movedToWaiting = parsed.data.status === 'waiting_list';
  const deadlineExtended =
    prevDeadline !== null &&
    existing.deadline !== null &&
    existing.deadline.getTime() > prevDeadline;

  if (movedToWaiting || deadlineExtended) {
    const profileDoc = await getOrCreateBehaviourProfile(req.userId!);
    const updatedProfile = applyPostponementObservation(
      mapBehaviourProfile(profileDoc),
      existing.category
    );
    profileDoc.categoryPosteriors = updatedProfile.categoryPosteriors;
    profileDoc.markModified('categoryPosteriors');
    await profileDoc.save();

    await TaskEventModel.create({
      userId: req.userId,
      taskId: existing._id,
      eventType: 'task_postponed',
      occurredAt: now,
      localDate,
      category: existing.category,
    });
  }

  // Handle task completion -> update Bayesian profile + active DailyPlan block status
  if (!wasCompleted && existing.status === 'completed') {
    existing.completedAt = now;
    if (existing.actualMinutes === 0) {
      existing.actualMinutes =
        existing.userEstimatedMinutes ??
        existing.aiEstimatedMinutes ??
        existing.recommendedMinutes;
    }

    const [profileDoc, calibrationDoc, activePlan] = await Promise.all([
      getOrCreateBehaviourProfile(req.userId!),
      DailyCalibrationModel.findOne({ userId: req.userId, date: localDate }),
      DailyPlanModel.findOne({ userId: req.userId, date: localDate }),
    ]);

    const taskDto = mapTask(existing);
    const updatedProfile = applyTaskCompletionObservation(
      mapBehaviourProfile(profileDoc),
      {
        task: taskDto,
        actualMinutes: existing.actualMinutes,
        completedAt: now,
        calibrationEnergy: calibrationDoc?.energyLevel ?? null,
      }
    );

    profileDoc.categoryPosteriors = updatedProfile.categoryPosteriors;
    profileDoc.calibrationCorrelations = updatedProfile.calibrationCorrelations;
    profileDoc.deadlineSensitivity = updatedProfile.deadlineSensitivity;
    profileDoc.markModified('categoryPosteriors');
    profileDoc.markModified('calibrationCorrelations');
    await profileDoc.save();

    if (activePlan) {
      let changed = false;
      activePlan.blocks = activePlan.blocks.map(
        (b: { taskId: string | null; status: string }) => {
          if (b.taskId === existing._id.toString() && b.status !== 'completed') {
            changed = true;
            return { ...b, status: 'completed' as const };
          }
          return b;
        }
      );
      if (changed) {
        activePlan.markModified('blocks');
        await activePlan.save();
      }
    }

    const slackMinutes = existing.deadline
      ? Math.round((existing.deadline.getTime() - now.getTime()) / 60000)
      : null;

    await TaskEventModel.create({
      userId: req.userId,
      taskId: existing._id,
      eventType: 'task_completed',
      occurredAt: now,
      localDate,
      category: existing.category,
      userEstimatedMinutes: existing.userEstimatedMinutes,
      aiEstimatedMinutes: existing.aiEstimatedMinutes,
      actualMinutes: existing.actualMinutes,
      deadlineSlackMinutes: slackMinutes,
      calibrationEnergy: calibrationDoc?.energyLevel ?? null,
    });
  } else if (wasCompleted && existing.status !== 'completed') {
    existing.completedAt = null;
  }

  await existing.save();
  res.json({ task: mapTask(existing) });
});

taskRouter.delete('/tasks/:id', async (req: AuthenticatedRequest, res) => {
  const deleted = await TaskModel.findOneAndDelete({
    _id: req.params.id,
    userId: req.userId,
  });
  if (!deleted) {
    res.status(404).json({ error: 'Task not found.' });
    return;
  }
  res.json({ ok: true });
});

taskRouter.get('/dashboard', async (req: AuthenticatedRequest, res) => {
  const user = req.userDoc!;
  const localDate = getLocalDateString(user.timezone);
  const prevDate = getPreviousDateString(localDate);

  const [
    allTasksDocs,
    calibrationDoc,
    planDoc,
    profileDoc,
    routines,
    overridesToday,
    overridesPrev,
    activeSessionDoc,
    todaySessions,
  ] = await Promise.all([
    TaskModel.find({ userId: req.userId }).sort({ priority: 1, deadline: 1 }),
    DailyCalibrationModel.findOne({ userId: req.userId, date: localDate }),
    DailyPlanModel.findOne({ userId: req.userId, date: localDate }),
    getOrCreateBehaviourProfile(req.userId!),
    DailyRoutineModel.find({ userId: req.userId, isActive: true }),
    DailyRoutineOverrideModel.find({ userId: req.userId, date: localDate }),
    DailyRoutineOverrideModel.find({ userId: req.userId, date: prevDate }),
    WorkSessionModel.findOne({
      userId: req.userId,
      status: { $in: ['active', 'paused'] },
    }).sort({ startedAt: -1 }),
    WorkSessionModel.find({ userId: req.userId, planDate: localDate }),
  ]);

  const tasks = allTasksDocs.map(mapTask);
  const calibration = calibrationDoc ? mapCalibration(calibrationDoc) : null;
  const profile = mapBehaviourProfile(profileDoc);
  const plan = planDoc ? mapDailyPlan(planDoc) : null;

  const capacity = calculateDailyCapacity({
    localDate,
    timezone: user.timezone,
    workingHours: user.workingHours,
    defaultBufferRatio: user.defaultBufferRatio,
    routines: routines.map(mapRoutine),
    overridesForDate: overridesToday.map(mapRoutineOverride),
    overridesForPrevDate: overridesPrev.map(mapRoutineOverride),
    calibration,
  });

  const completedTodayCount = tasks.filter(
    (t) =>
      t.status === 'completed' &&
      t.completedAt &&
      getLocalDateString(user.timezone, new Date(t.completedAt)) === localDate
  ).length;

  const openTasks = tasks.filter((t) => t.status !== 'completed');
  const scheduledTaskIds = new Set(
    (plan?.blocks ?? [])
      .filter((b) => b.kind === 'task' && b.taskId)
      .map((b) => b.taskId!)
  );

  // Prioritized today's tasks: scheduled today, explicitly prioritized in calibration, or due soon/high priority
  const priorityOrder: Record<string, number> = {
    urgent: 0,
    high: 1,
    medium: 2,
    low: 3,
  };
  const todaysTasks = [...openTasks]
    .sort((a, b) => {
      const aCal = calibration?.priorityTaskIds.includes(a.id) ? -1 : 0;
      const bCal = calibration?.priorityTaskIds.includes(b.id) ? -1 : 0;
      if (aCal !== bCal) return aCal - bCal;

      const aSched = scheduledTaskIds.has(a.id) ? -1 : 0;
      const bSched = scheduledTaskIds.has(b.id) ? -1 : 0;
      if (aSched !== bSched) return aSched - bSched;

      return priorityOrder[a.priority] - priorityOrder[b.priority];
    })
    .slice(0, 8);

  const focusMinutesToday = todaySessions.reduce(
    (acc, s) => acc + (s.activeMinutes ?? 0),
    0
  );

  const upcomingDeadlines = openTasks
    .filter((t) => t.deadline)
    .sort(
      (a, b) =>
        new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime()
    )
    .slice(0, 5);

  const insights = generateEvidenceBackedInsights(profile).slice(0, 2);
  const risks = assessDeadlineRisks(
    tasks,
    profile,
    capacity.breakdown.availableMinutes
  );
  const recommendations = generateRecommendations({
    tasks,
    plan,
    calibration,
    profile,
    risks,
  }).slice(0, 4);

  const activeSessionTask = activeSessionDoc
    ? tasks.find((t) => t.id === activeSessionDoc.taskId.toString())
    : undefined;

  res.json({
    localDate,
    timezone: user.timezone,
    calibration,
    progress: {
      completedToday: completedTodayCount,
      remainingOpen: openTasks.length,
      focusMinutesToday,
      dailyProgressPercent:
        completedTodayCount + openTasks.length === 0
          ? 0
          : Math.round(
              (completedTodayCount /
                (completedTodayCount + Math.min(openTasks.length, 8))) *
                100
            ),
    },
    todaysTasks,
    upcomingDeadlines,
    insights,
    risks: risks.slice(0, 4),
    recommendations,
    activeSession: activeSessionDoc
      ? mapWorkSession(activeSessionDoc, activeSessionTask?.title)
      : null,
    capacitySummary: capacity.breakdown,
  });
});
