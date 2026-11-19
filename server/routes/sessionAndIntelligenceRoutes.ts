import { Router } from 'express';
import { z } from 'zod';
import {
  applyTaskCompletionObservation,
  generateEvidenceBackedInsights,
} from '../engines/bayesianEngine.js';
import { calculateDailyCapacity } from '../engines/capacityEngine.js';
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
import { DailyPlanRevisionModel } from '../models/DailyPlanRevision.js';
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
  mapPlanRevision,
  mapRoutine,
  mapRoutineOverride,
  mapTask,
  mapTaskEvent,
  mapWorkSession,
} from '../services/mappers.js';

export const sessionAndIntelligenceRouter = Router();
sessionAndIntelligenceRouter.use(requireAuth);

sessionAndIntelligenceRouter.get(
  '/sessions',
  async (req: AuthenticatedRequest, res) => {
    const [sessions, tasks] = await Promise.all([
      WorkSessionModel.find({ userId: req.userId })
        .sort({ startedAt: -1 })
        .limit(40),
      TaskModel.find({ userId: req.userId }),
    ]);
    const taskTitleMap = new Map(
      tasks.map((t) => [t._id.toString(), t.title])
    );

    res.json({
      sessions: sessions.map((s) =>
        mapWorkSession(s, taskTitleMap.get(s.taskId.toString()))
      ),
    });
  }
);

const startSessionSchema = z.object({
  taskId: z.string(),
  planBlockId: z.string().nullable().optional(),
  pairedBackgroundTaskId: z.string().nullable().optional(),
});

sessionAndIntelligenceRouter.post(
  '/sessions/start',
  async (req: AuthenticatedRequest, res) => {
    const parsed = startSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'taskId is required.' });
      return;
    }

    const user = req.userDoc!;
    const localDate = getLocalDateString(user.timezone);
    const task = await TaskModel.findOne({
      _id: parsed.data.taskId,
      userId: req.userId,
    });
    if (!task) {
      res.status(404).json({ error: 'Task not found.' });
      return;
    }

    // Pause any other currently active session (and record task switch)
    const activeOther = await WorkSessionModel.findOne({
      userId: req.userId,
      status: 'active',
    });
    if (activeOther) {
      const elapsedMin = Math.max(
        1,
        Math.round((Date.now() - activeOther.startedAt.getTime()) / 60000)
      );
      activeOther.status = 'paused';
      activeOther.pausedAt = new Date();
      activeOther.activeMinutes = elapsedMin;
      await activeOther.save();

      const profileDoc = await getOrCreateBehaviourProfile(req.userId!);
      profileDoc.taskSwitchingCount += 1;
      await profileDoc.save();
    }

    const session = await WorkSessionModel.create({
      userId: req.userId,
      taskId: task._id,
      planDate: localDate,
      planBlockId: parsed.data.planBlockId ?? null,
      pairedBackgroundTaskId: parsed.data.pairedBackgroundTaskId ?? null,
      startedAt: new Date(),
      status: 'active',
    });

    if (task.status === 'todo' || task.status === 'waiting_list') {
      task.status = 'in_progress';
      await task.save();
    }

    if (parsed.data.planBlockId) {
      await DailyPlanModel.updateOne(
        {
          userId: req.userId,
          date: localDate,
          'blocks.id': parsed.data.planBlockId,
        },
        { $set: { 'blocks.$.status': 'in_progress' } }
      );
    }

    await TaskEventModel.create({
      userId: req.userId,
      taskId: task._id,
      eventType: 'task_started',
      occurredAt: new Date(),
      localDate,
      category: task.category,
    });

    res.status(201).json({ session: mapWorkSession(session, task.title) });
  }
);

const updateSessionSchema = z.object({
  action: z.enum([
    'pause',
    'resume',
    'complete',
    'abandon',
    'log_interruption',
  ]),
  activeMinutesOverride: z.number().min(1).max(1440).optional(),
  markTaskCompleted: z.boolean().optional(),
  notes: z.string().max(600).optional(),
});

sessionAndIntelligenceRouter.patch(
  '/sessions/:id',
  async (req: AuthenticatedRequest, res) => {
    const parsed = updateSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid session action.' });
      return;
    }

    const session = await WorkSessionModel.findOne({
      _id: req.params.id,
      userId: req.userId,
    });
    if (!session) {
      res.status(404).json({ error: 'Work session not found.' });
      return;
    }

    const user = req.userDoc!;
    const localDate = getLocalDateString(user.timezone);
    const now = new Date();
    const task = await TaskModel.findOne({
      _id: session.taskId,
      userId: req.userId,
    });

    if (parsed.data.notes !== undefined) session.notes = parsed.data.notes;

    if (parsed.data.action === 'log_interruption') {
      session.interruptionCount += 1;
    } else if (parsed.data.action === 'pause' && session.status === 'active') {
      const deltaMin = Math.max(
        1,
        Math.round(
          (now.getTime() -
            (session.pausedAt?.getTime() ?? session.startedAt.getTime())) /
            60000
        )
      );
      session.activeMinutes = Math.max(session.activeMinutes, deltaMin);
      session.pausedAt = now;
      session.status = 'paused';
      await TaskEventModel.create({
        userId: req.userId,
        taskId: session.taskId,
        eventType: 'task_paused',
        occurredAt: now,
        localDate,
        category: task?.category,
      });
    } else if (parsed.data.action === 'resume' && session.status === 'paused') {
      if (session.pausedAt) {
        session.pausedMinutes += Math.max(
          1,
          Math.round((now.getTime() - session.pausedAt.getTime()) / 60000)
        );
      }
      session.pausedAt = null;
      session.status = 'active';
    } else if (
      parsed.data.action === 'complete' ||
      parsed.data.action === 'abandon'
    ) {
      const elapsedTotal = Math.max(
        1,
        Math.round((now.getTime() - session.startedAt.getTime()) / 60000)
      );
      const activeLogged =
        parsed.data.activeMinutesOverride ??
        Math.max(1, elapsedTotal - session.pausedMinutes);

      session.activeMinutes = activeLogged;
      session.endedAt = now;
      session.status =
        parsed.data.action === 'complete' ? 'completed' : 'abandoned';

      if (task) {
        task.actualMinutes += activeLogged;
        task.elapsedCalendarMinutes += elapsedTotal;

        if (parsed.data.markTaskCompleted) {
          task.status = 'completed';
          task.completedAt = now;

          const [profileDoc, calibrationDoc] = await Promise.all([
            getOrCreateBehaviourProfile(req.userId!),
            DailyCalibrationModel.findOne({
              userId: req.userId,
              date: localDate,
            }),
          ]);

          const updated = applyTaskCompletionObservation(
            mapBehaviourProfile(profileDoc),
            {
              task: mapTask(task),
              actualMinutes: task.actualMinutes,
              completedAt: now,
              calibrationEnergy: calibrationDoc?.energyLevel ?? null,
            }
          );
          profileDoc.categoryPosteriors = updated.categoryPosteriors;
          profileDoc.calibrationCorrelations = updated.calibrationCorrelations;
          profileDoc.deadlineSensitivity = updated.deadlineSensitivity;
          profileDoc.markModified('categoryPosteriors');
          profileDoc.markModified('calibrationCorrelations');
          await profileDoc.save();

          await TaskEventModel.create({
            userId: req.userId,
            taskId: task._id,
            eventType: 'task_completed',
            occurredAt: now,
            localDate,
            category: task.category,
            userEstimatedMinutes: task.userEstimatedMinutes,
            aiEstimatedMinutes: task.aiEstimatedMinutes,
            actualMinutes: task.actualMinutes,
            calibrationEnergy: calibrationDoc?.energyLevel ?? null,
          });
        }
        await task.save();
      }

      if (session.planBlockId) {
        await DailyPlanModel.updateOne(
          {
            userId: req.userId,
            date: session.planDate,
            'blocks.id': session.planBlockId,
          },
          {
            $set: {
              'blocks.$.status':
                parsed.data.action === 'complete' ? 'completed' : 'skipped',
            },
          }
        );
      }
    }

    await session.save();
    res.json({ session: mapWorkSession(session, task?.title) });
  }
);

sessionAndIntelligenceRouter.get(
  '/insights',
  async (req: AuthenticatedRequest, res) => {
    const user = req.userDoc!;
    const localDate = getLocalDateString(user.timezone);
    const prevDate = getPreviousDateString(localDate);

    const [
      profileDoc,
      tasksDocs,
      routines,
      overridesToday,
      overridesPrev,
      calibrationDoc,
      revisions,
      sessions,
    ] = await Promise.all([
      getOrCreateBehaviourProfile(req.userId!),
      TaskModel.find({ userId: req.userId }),
      DailyRoutineModel.find({ userId: req.userId, isActive: true }),
      DailyRoutineOverrideModel.find({ userId: req.userId, date: localDate }),
      DailyRoutineOverrideModel.find({ userId: req.userId, date: prevDate }),
      DailyCalibrationModel.findOne({ userId: req.userId, date: localDate }),
      DailyPlanRevisionModel.find({ userId: req.userId })
        .sort({ createdAt: -1 })
        .limit(14),
      WorkSessionModel.find({ userId: req.userId })
        .sort({ startedAt: -1 })
        .limit(20),
    ]);

    const profile = mapBehaviourProfile(profileDoc);
    const tasks = tasksDocs.map(mapTask);
    const capacity = calculateDailyCapacity({
      localDate,
      timezone: user.timezone,
      workingHours: user.workingHours,
      defaultBufferRatio: user.defaultBufferRatio,
      routines: routines.map(mapRoutine),
      overridesForDate: overridesToday.map(mapRoutineOverride),
      overridesForPrevDate: overridesPrev.map(mapRoutineOverride),
      calibration: calibrationDoc ? mapCalibration(calibrationDoc) : null,
    });

    const insights = generateEvidenceBackedInsights(profile);
    const risks = assessDeadlineRisks(
      tasks,
      profile,
      capacity.breakdown.availableMinutes
    );

    res.json({
      insights,
      risks,
      profile,
      revisions: revisions.map(mapPlanRevision),
      recentSessions: sessions.map((s) =>
        mapWorkSession(
          s,
          tasks.find((t) => t.id === s.taskId.toString())?.title
        )
      ),
    });
  }
);

sessionAndIntelligenceRouter.get(
  '/recommendations',
  async (req: AuthenticatedRequest, res) => {
    const user = req.userDoc!;
    const localDate = getLocalDateString(user.timezone);
    const prevDate = getPreviousDateString(localDate);

    const [
      profileDoc,
      tasksDocs,
      planDoc,
      calibrationDoc,
      routines,
      overridesToday,
      overridesPrev,
    ] = await Promise.all([
      getOrCreateBehaviourProfile(req.userId!),
      TaskModel.find({ userId: req.userId }),
      DailyPlanModel.findOne({ userId: req.userId, date: localDate }),
      DailyCalibrationModel.findOne({ userId: req.userId, date: localDate }),
      DailyRoutineModel.find({ userId: req.userId, isActive: true }),
      DailyRoutineOverrideModel.find({ userId: req.userId, date: localDate }),
      DailyRoutineOverrideModel.find({ userId: req.userId, date: prevDate }),
    ]);

    const profile = mapBehaviourProfile(profileDoc);
    const tasks = tasksDocs.map(mapTask);
    const calibration = calibrationDoc ? mapCalibration(calibrationDoc) : null;
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
    });

    res.json({ recommendations, risks });
  }
);

sessionAndIntelligenceRouter.post(
  '/recommendations/:id/apply',
  async (req: AuthenticatedRequest, res) => {
    const user = req.userDoc!;
    const localDate = getLocalDateString(user.timezone);
    const { taskId, priority, splittingPreference, recommendedMinutes } =
      req.body ?? {};

    if (taskId) {
      const task = await TaskModel.findOne({ _id: taskId, userId: req.userId });
      if (task) {
        if (priority) task.priority = priority;
        if (splittingPreference) task.splittingPreference = splittingPreference;
        if (typeof recommendedMinutes === 'number') {
          task.recommendedMinutes = recommendedMinutes;
        }
        await task.save();
      }
    }

    const profileDoc = await getOrCreateBehaviourProfile(req.userId!);
    profileDoc.recommendationAcceptedCount += 1;
    await profileDoc.save();

    await TaskEventModel.create({
      userId: req.userId,
      taskId: taskId ?? null,
      eventType: 'recommendation_applied',
      occurredAt: new Date(),
      localDate,
      metadata: { recommendationId: req.params.id },
    });

    res.json({ ok: true });
  }
);

sessionAndIntelligenceRouter.post(
  '/recommendations/:id/dismiss',
  async (req: AuthenticatedRequest, res) => {
    const user = req.userDoc!;
    const localDate = getLocalDateString(user.timezone);
    const profileDoc = await getOrCreateBehaviourProfile(req.userId!);
    profileDoc.recommendationDismissedCount += 1;
    await profileDoc.save();

    await TaskEventModel.create({
      userId: req.userId,
      taskId: null,
      eventType: 'recommendation_dismissed',
      occurredAt: new Date(),
      localDate,
      metadata: { recommendationId: req.params.id },
    });

    res.json({ ok: true });
  }
);

sessionAndIntelligenceRouter.get(
  '/behaviour',
  async (req: AuthenticatedRequest, res) => {
    const [profileDoc, eventsDocs] = await Promise.all([
      getOrCreateBehaviourProfile(req.userId!),
      TaskEventModel.find({ userId: req.userId })
        .sort({ occurredAt: -1 })
        .limit(60),
    ]);

    res.json({
      profile: mapBehaviourProfile(profileDoc),
      events: eventsDocs.map(mapTaskEvent),
    });
  }
);
