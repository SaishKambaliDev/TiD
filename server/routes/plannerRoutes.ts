import crypto from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import { calculateDailyCapacity } from '../engines/capacityEngine.js';
import { evaluateTaskOverlap } from '../engines/overlapEngine.js';
import {
  buildRecalibrationProposal,
  generateDailySchedule,
} from '../engines/schedulingEngine.js';
import {
  formatMinutesToHHMM,
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
import {
  getOrCreateBehaviourProfile,
  mapBehaviourProfile,
  mapCalibration,
  mapDailyPlan,
  mapPlanRevision,
  mapRoutine,
  mapRoutineOverride,
  mapTask,
} from '../services/mappers.js';
import type { ScheduledTaskBlockDTO } from '../../src/shared/types.js';

export const plannerRouter = Router();
plannerRouter.use(requireAuth);

function validateDateParam(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

async function loadPlannerContext(userId: string, date: string) {
  const prevDate = getPreviousDateString(date);
  const [
    routines,
    overridesToday,
    overridesPrev,
    calibrationDoc,
    tasksDocs,
    planDoc,
    profileDoc,
  ] = await Promise.all([
    DailyRoutineModel.find({ userId, isActive: true }),
    DailyRoutineOverrideModel.find({ userId, date }),
    DailyRoutineOverrideModel.find({ userId, date: prevDate }),
    DailyCalibrationModel.findOne({ userId, date }),
    TaskModel.find({ userId }).sort({ priority: 1, deadline: 1 }),
    DailyPlanModel.findOne({ userId, date }),
    getOrCreateBehaviourProfile(userId),
  ]);

  return {
    routines: routines.map(mapRoutine),
    overridesToday: overridesToday.map(mapRoutineOverride),
    overridesPrev: overridesPrev.map(mapRoutineOverride),
    calibration: calibrationDoc ? mapCalibration(calibrationDoc) : null,
    tasks: tasksDocs.map(mapTask),
    existingPlan: planDoc ? mapDailyPlan(planDoc) : null,
    profile: mapBehaviourProfile(profileDoc),
  };
}

plannerRouter.get('/planner/:date', async (req: AuthenticatedRequest, res) => {
  const date = req.params.date;
  if (!validateDateParam(date)) {
    res.status(400).json({ error: 'Date must be YYYY-MM-DD.' });
    return;
  }

  const user = req.userDoc!;
  const ctx = await loadPlannerContext(req.userId!, date);

  const activeScheduledMinutes = (ctx.existingPlan?.blocks ?? [])
    .filter((b) => b.kind === 'task' && !b.isOverlapping && b.status !== 'skipped')
    .reduce((acc, b) => acc + (b.endMinute - b.startMinute), 0);

  const capacity = calculateDailyCapacity({
    localDate: date,
    timezone: user.timezone,
    workingHours: user.workingHours,
    defaultBufferRatio: user.defaultBufferRatio,
    routines: ctx.routines,
    overridesForDate: ctx.overridesToday,
    overridesForPrevDate: ctx.overridesPrev,
    calibration: ctx.calibration,
    scheduledActiveTaskMinutes: activeScheduledMinutes,
  });

  // If no saved plan yet, build a clean routine-only live view plus open tasks as unscheduled candidates
  const routineBlocks: ScheduledTaskBlockDTO[] = capacity.resolvedRoutines.map(
    (r) => ({
      id: `routine-${r.sourceId}-${r.startMinute}`,
      kind: r.sourceKind === 'calibration_commitment' ? 'commitment' : 'routine',
      taskId: null,
      title: r.activityName,
      startMinute: r.startMinute,
      endMinute: r.endMinute,
      startTime: r.startTime,
      endTime: r.endTime,
      status: 'planned',
      isSplitPart: false,
      splitIndex: 1,
      splitTotal: 1,
      attentionClass: null,
      isOverlapping: false,
      overlapWithBlockId: null,
      overlapConfirmed: false,
      efficiencyNote: r.notes || null,
      isFixed: r.isFixed,
    })
  );

  const plan = ctx.existingPlan
    ? {
        ...ctx.existingPlan,
        capacityBreakdown: capacity.breakdown,
      }
    : {
        userId: req.userId!,
        date,
        timezone: user.timezone,
        revisionNumber: 0,
        calibrationConfirmed: ctx.calibration?.status === 'completed',
        capacityBreakdown: capacity.breakdown,
        blocks: routineBlocks,
        unscheduledTasks: ctx.tasks
          .filter((t) => t.status !== 'completed')
          .map((t) => ({
            taskId: t.id,
            title: t.title,
            priority: t.priority,
            requiredMinutes: t.recommendedMinutes,
            remainingUnscheduledMinutes: t.recommendedMinutes,
            reason: 'Not yet allocated to today’s timeline.',
            alternatives: ['split_across_days' as const, 'waiting_list' as const],
          })),
        conflicts: [],
        updatedAt: new Date().toISOString(),
      };

  res.json({
    plan,
    calibration: ctx.calibration,
    resolvedRoutines: capacity.resolvedRoutines,
    overrides: ctx.overridesToday,
    tasks: ctx.tasks,
  });
});

plannerRouter.post(
  '/planner/:date/generate',
  async (req: AuthenticatedRequest, res) => {
    const date = req.params.date;
    if (!validateDateParam(date)) {
      res.status(400).json({ error: 'Date must be YYYY-MM-DD.' });
      return;
    }

    const user = req.userDoc!;
    const ctx = await loadPlannerContext(req.userId!, date);

    const generated = generateDailySchedule({
      userId: req.userId!,
      localDate: date,
      timezone: user.timezone,
      workingHours: user.workingHours,
      defaultBreakMinutes: user.defaultBreakMinutes,
      defaultBufferRatio: user.defaultBufferRatio,
      defaultSessionMinutes: user.defaultSessionMinutes,
      routines: ctx.routines,
      overridesForDate: ctx.overridesToday,
      overridesForPrevDate: ctx.overridesPrev,
      calibration: ctx.calibration,
      tasks: ctx.tasks,
      profile: ctx.profile,
      existingPlan: ctx.existingPlan,
    });

    const saved = await DailyPlanModel.findOneAndUpdate(
      { userId: req.userId, date },
      {
        $set: {
          userId: req.userId,
          date,
          timezone: generated.timezone,
          revisionNumber: generated.revisionNumber,
          calibrationConfirmed: generated.calibrationConfirmed,
          capacityBreakdown: generated.capacityBreakdown,
          blocks: generated.blocks,
          unscheduledTasks: generated.unscheduledTasks,
          conflicts: generated.conflicts,
        },
      },
      { upsert: true, new: true }
    );

    await DailyPlanRevisionModel.create({
      userId: req.userId,
      date,
      revisionNumber: generated.revisionNumber,
      triggerReason: 'initial_generate',
      blocksSnapshot: generated.blocks,
      capacityBreakdownSnapshot: generated.capacityBreakdown,
      unscheduledSnapshot: generated.unscheduledTasks,
      diffSummary: [
        `Generated schedule with ${generated.blocks.filter((b) => b.kind === 'task').length} task block(s).`,
      ],
    });

    res.json({ plan: mapDailyPlan(saved) });
  }
);

const manualEditSchema = z.object({
  action: z.enum([
    'schedule_task',
    'move_block',
    'resize_block',
    'remove_block',
    'confirm_overlap',
    'update_block_status',
  ]),
  taskId: z.string().optional(),
  blockId: z.string().optional(),
  startMinute: z.number().int().min(0).max(1425).optional(),
  endMinute: z.number().int().min(15).max(1440).optional(),
  allowOverlap: z.boolean().optional(),
  overlapConfirmed: z.boolean().optional(),
  status: z.enum(['planned', 'in_progress', 'completed', 'skipped']).optional(),
});

plannerRouter.patch(
  '/planner/:date',
  async (req: AuthenticatedRequest, res) => {
    const date = req.params.date;
    if (!validateDateParam(date)) {
      res.status(400).json({ error: 'Date must be YYYY-MM-DD.' });
      return;
    }

    const parsed = manualEditSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: parsed.error.issues[0]?.message ?? 'Invalid edit' });
      return;
    }

    const user = req.userDoc!;
    const ctx = await loadPlannerContext(req.userId!, date);
    const capacity = calculateDailyCapacity({
      localDate: date,
      timezone: user.timezone,
      workingHours: user.workingHours,
      defaultBufferRatio: user.defaultBufferRatio,
      routines: ctx.routines,
      overridesForDate: ctx.overridesToday,
      overridesForPrevDate: ctx.overridesPrev,
      calibration: ctx.calibration,
    });

    let blocks: ScheduledTaskBlockDTO[] = ctx.existingPlan
      ? [...ctx.existingPlan.blocks]
      : capacity.resolvedRoutines.map((r) => ({
          id: `routine-${r.sourceId}-${r.startMinute}`,
          kind:
            r.sourceKind === 'calibration_commitment'
              ? ('commitment' as const)
              : ('routine' as const),
          taskId: null,
          title: r.activityName,
          startMinute: r.startMinute,
          endMinute: r.endMinute,
          startTime: r.startTime,
          endTime: r.endTime,
          status: 'planned' as const,
          isSplitPart: false,
          splitIndex: 1,
          splitTotal: 1,
          attentionClass: null,
          isOverlapping: false,
          overlapWithBlockId: null,
          overlapConfirmed: false,
          efficiencyNote: r.notes || null,
          isFixed: r.isFixed,
        }));

    const { action } = parsed.data;
    let diffNote = 'Updated timeline block.';

    if (action === 'schedule_task' || action === 'move_block' || action === 'resize_block') {
      const startMin = parsed.data.startMinute;
      const endMin = parsed.data.endMinute;
      if (startMin === undefined || endMin === undefined || endMin <= startMin) {
        res.status(400).json({ error: 'Valid startMinute and endMinute required.' });
        return;
      }

      // Check fixed routine/commitment conflict
      const fixedConflict = blocks.find(
        (b) =>
          (b.kind === 'routine' || b.kind === 'commitment') &&
          b.isFixed &&
          b.id !== parsed.data.blockId &&
          startMin < b.endMinute &&
          endMin > b.startMinute
      );
      if (fixedConflict) {
        res.status(409).json({
          error: `Cannot schedule over fixed commitment "${fixedConflict.title}" (${fixedConflict.startTime}–${fixedConflict.endTime}).`,
        });
        return;
      }

      let targetTask = ctx.tasks.find((t) => t.id === parsed.data.taskId);
      const existingBlock = parsed.data.blockId
        ? blocks.find((b) => b.id === parsed.data.blockId)
        : undefined;
      if (!targetTask && existingBlock?.taskId) {
        targetTask = ctx.tasks.find((t) => t.id === existingBlock.taskId);
      }

      // Check task-to-task overlap compatibility
      const collidingTaskBlocks = blocks.filter(
        (b) =>
          b.kind === 'task' &&
          b.id !== parsed.data.blockId &&
          b.status !== 'skipped' &&
          startMin < b.endMinute &&
          endMin > b.startMinute
      );

      let isOverlapping = false;
      let overlapWithBlockId: string | null = null;
      let efficiencyNote: string | null = null;
      let overlapConfirmed = Boolean(parsed.data.overlapConfirmed);

      if (collidingTaskBlocks.length > 0 && targetTask) {
        const host = collidingTaskBlocks[0];
        const hostTask = ctx.tasks.find((t) => t.id === host.taskId);
        const check = evaluateTaskOverlap(
          hostTask?.attentionClass ?? 'attention_intensive',
          targetTask.attentionClass,
          hostTask?.overlapAllowedWith ?? [],
          targetTask.overlapAllowedWith,
          overlapConfirmed
        );

        if (!check.allowed) {
          res.status(409).json({
            error: check.reason,
            code: 'INCOMPATIBLE_OVERLAP',
          });
          return;
        }
        if (check.requiresConfirmation && !overlapConfirmed) {
          res.status(409).json({
            error: check.reason,
            efficiencyNote: check.efficiencyNote,
            code: 'OVERLAP_CONFIRMATION_REQUIRED',
          });
          return;
        }
        isOverlapping = true;
        overlapWithBlockId = host.id;
        efficiencyNote = check.efficiencyNote;
      }

      if (action === 'schedule_task' && targetTask) {
        blocks.push({
          id: `blk-${crypto.randomUUID().slice(0, 8)}`,
          kind: 'task',
          taskId: targetTask.id,
          title: targetTask.title,
          category: targetTask.category,
          priority: targetTask.priority,
          startMinute: startMin,
          endMinute: endMin,
          startTime: formatMinutesToHHMM(startMin),
          endTime: formatMinutesToHHMM(endMin),
          status: 'planned',
          isSplitPart: endMin - startMin < targetTask.recommendedMinutes,
          splitIndex: 1,
          splitTotal: 1,
          attentionClass: targetTask.attentionClass,
          isOverlapping,
          overlapWithBlockId,
          overlapConfirmed,
          efficiencyNote,
          isFixed: false,
        });
        diffNote = `Scheduled "${targetTask.title}" at ${formatMinutesToHHMM(startMin)}–${formatMinutesToHHMM(endMin)}.`;
      } else if (existingBlock) {
        blocks = blocks.map((b) =>
          b.id === existingBlock.id
            ? {
                ...b,
                startMinute: startMin,
                endMinute: endMin,
                startTime: formatMinutesToHHMM(startMin),
                endTime: formatMinutesToHHMM(endMin),
                isOverlapping,
                overlapWithBlockId,
                overlapConfirmed,
                efficiencyNote,
              }
            : b
        );
        diffNote = `Adjusted "${existingBlock.title}" to ${formatMinutesToHHMM(startMin)}–${formatMinutesToHHMM(endMin)}.`;
      }
    } else if (action === 'remove_block' && parsed.data.blockId) {
      const target = blocks.find((b) => b.id === parsed.data.blockId);
      blocks = blocks.filter((b) => b.id !== parsed.data.blockId);
      if (target) diffNote = `Removed "${target.title}" from timeline.`;
    } else if (action === 'confirm_overlap' && parsed.data.blockId) {
      blocks = blocks.map((b) =>
        b.id === parsed.data.blockId ? { ...b, overlapConfirmed: true } : b
      );
      diffNote = 'Confirmed compatible overlapping task block.';
    } else if (
      action === 'update_block_status' &&
      parsed.data.blockId &&
      parsed.data.status
    ) {
      blocks = blocks.map((b) =>
        b.id === parsed.data.blockId ? { ...b, status: parsed.data.status! } : b
      );
      diffNote = `Marked block status as ${parsed.data.status}.`;
    }

    blocks.sort((a, b) => a.startMinute - b.startMinute);

    const scheduledActiveMinutes = blocks
      .filter((b) => b.kind === 'task' && !b.isOverlapping && b.status !== 'skipped')
      .reduce((acc, b) => acc + (b.endMinute - b.startMinute), 0);

    const updatedCapacity = {
      ...capacity.breakdown,
      scheduledTaskMinutes: scheduledActiveMinutes,
      unallocatedMinutes: Math.max(
        0,
        capacity.breakdown.availableMinutes - scheduledActiveMinutes
      ),
    };

    const scheduledByTask = new Map<string, number>();
    for (const b of blocks) {
      if (b.kind === 'task' && b.taskId) {
        scheduledByTask.set(
          b.taskId,
          (scheduledByTask.get(b.taskId) ?? 0) + (b.endMinute - b.startMinute)
        );
      }
    }

    const unscheduledTasks = ctx.tasks
      .filter((t) => t.status !== 'completed')
      .map((t) => {
        const alloc = scheduledByTask.get(t.id) ?? 0;
        const rem = Math.max(0, t.recommendedMinutes - alloc);
        return rem > 0
          ? {
              taskId: t.id,
              title: t.title,
              priority: t.priority,
              requiredMinutes: t.recommendedMinutes,
              remainingUnscheduledMinutes: rem,
              reason:
                alloc > 0
                  ? `Partially allocated (${alloc}m scheduled; ${rem}m remaining).`
                  : 'Waiting to be scheduled.',
              alternatives: [
                'split_across_days' as const,
                'waiting_list' as const,
              ],
            }
          : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    const nextRevision = (ctx.existingPlan?.revisionNumber ?? 0) + 1;
    const saved = await DailyPlanModel.findOneAndUpdate(
      { userId: req.userId, date },
      {
        $set: {
          userId: req.userId,
          date,
          timezone: user.timezone,
          revisionNumber: nextRevision,
          calibrationConfirmed: ctx.calibration?.status === 'completed',
          capacityBreakdown: updatedCapacity,
          blocks,
          unscheduledTasks,
        },
      },
      { upsert: true, new: true }
    );

    await DailyPlanRevisionModel.create({
      userId: req.userId,
      date,
      revisionNumber: nextRevision,
      triggerReason: 'manual_edit',
      blocksSnapshot: blocks,
      capacityBreakdownSnapshot: updatedCapacity,
      unscheduledSnapshot: unscheduledTasks,
      diffSummary: [diffNote],
    });

    res.json({ plan: mapDailyPlan(saved) });
  }
);

plannerRouter.post(
  '/planner/:date/recalibrate',
  async (req: AuthenticatedRequest, res) => {
    const date = req.params.date;
    if (!validateDateParam(date)) {
      res.status(400).json({ error: 'Date must be YYYY-MM-DD.' });
      return;
    }

    const commit = Boolean(req.body?.commit);
    const user = req.userDoc!;
    const ctx = await loadPlannerContext(req.userId!, date);

    const proposal = buildRecalibrationProposal({
      userId: req.userId!,
      localDate: date,
      timezone: user.timezone,
      workingHours: user.workingHours,
      defaultBreakMinutes: user.defaultBreakMinutes,
      defaultBufferRatio: user.defaultBufferRatio,
      defaultSessionMinutes: user.defaultSessionMinutes,
      routines: ctx.routines,
      overridesForDate: ctx.overridesToday,
      overridesForPrevDate: ctx.overridesPrev,
      calibration: ctx.calibration,
      tasks: ctx.tasks,
      profile: ctx.profile,
      existingPlan: ctx.existingPlan,
    });

    if (!commit) {
      res.json({ proposal });
      return;
    }

    const nextRevision = (ctx.existingPlan?.revisionNumber ?? 0) + 1;
    const saved = await DailyPlanModel.findOneAndUpdate(
      { userId: req.userId, date },
      {
        $set: {
          userId: req.userId,
          date,
          timezone: user.timezone,
          revisionNumber: nextRevision,
          calibrationConfirmed: ctx.calibration?.status === 'completed',
          capacityBreakdown: proposal.proposedCapacity,
          blocks: proposal.proposedBlocks,
          unscheduledTasks: proposal.proposedUnscheduled,
          conflicts: proposal.proposedConflicts,
        },
      },
      { upsert: true, new: true }
    );

    await DailyPlanRevisionModel.create({
      userId: req.userId,
      date,
      revisionNumber: nextRevision,
      triggerReason: 'recalibration',
      blocksSnapshot: proposal.proposedBlocks,
      capacityBreakdownSnapshot: proposal.proposedCapacity,
      unscheduledSnapshot: proposal.proposedUnscheduled,
      diffSummary: proposal.diffSummary,
    });

    await TaskEventModel.create({
      userId: req.userId,
      taskId: null,
      eventType: 'recalibrated',
      occurredAt: new Date(),
      localDate: date,
      calibrationEnergy: ctx.calibration?.energyLevel ?? null,
      metadata: { revisionNumber: nextRevision, diffSummary: proposal.diffSummary },
    });

    res.json({ plan: mapDailyPlan(saved), proposal });
  }
);

plannerRouter.get(
  '/planner/:date/revisions',
  async (req: AuthenticatedRequest, res) => {
    const date = req.params.date;
    if (!validateDateParam(date)) {
      res.status(400).json({ error: 'Date must be YYYY-MM-DD.' });
      return;
    }

    const docs = await DailyPlanRevisionModel.find({
      userId: req.userId,
      date,
    }).sort({ revisionNumber: -1 });

    res.json({ revisions: docs.map(mapPlanRevision) });
  }
);
