import crypto from 'crypto';
import type {
  CapacityBreakdown,
  DailyCalibrationDTO,
  DailyPlanDTO,
  DailyRoutineDTO,
  DailyRoutineOverrideDTO,
  PersonalBehaviourProfileDTO,
  RecalibrationProposal,
  ScheduleConflict,
  ScheduledTaskBlockDTO,
  TaskDTO,
  TimeWindow,
  UnscheduledTaskEntry,
} from '../../src/shared/types.js';
import { predictEffortMinutes } from './bayesianEngine.js';
import { calculateDailyCapacity } from './capacityEngine.js';
import { evaluateTaskOverlap } from './overlapEngine.js';
import {
  formatMinutesToHHMM,
  getCurrentMinuteOfDay,
  getLocalDateString,
  subtractIntervals,
  type MinuteInterval,
} from './timeUtils.js';

export interface GeneratePlanInput {
  userId: string;
  localDate: string;
  timezone: string;
  workingHours: TimeWindow;
  defaultBreakMinutes: number;
  defaultBufferRatio: number;
  defaultSessionMinutes: number;
  routines: DailyRoutineDTO[];
  overridesForDate: DailyRoutineOverrideDTO[];
  overridesForPrevDate: DailyRoutineOverrideDTO[];
  calibration: DailyCalibrationDTO | null;
  tasks: TaskDTO[];
  profile: PersonalBehaviourProfileDTO;
  existingPlan?: DailyPlanDTO | null;
  now?: Date;
}

const PRIORITY_WEIGHT: Record<string, number> = {
  urgent: 100,
  high: 70,
  medium: 40,
  low: 15,
};

function topologicalOrderTasks(tasks: TaskDTO[]): {
  ordered: TaskDTO[];
  blockedByIncomplete: Map<string, string[]>;
} {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const blockedByIncomplete = new Map<string, string[]>();

  for (const t of tasks) {
    const incompleteDeps = t.dependencies.filter((depId) => {
      const dep = byId.get(depId);
      return dep && dep.status !== 'completed';
    });
    if (incompleteDeps.length > 0) {
      blockedByIncomplete.set(t.id, incompleteDeps);
    }
  }

  return { ordered: tasks, blockedByIncomplete };
}

function getSessionChunkSize(
  task: TaskDTO,
  calibration: DailyCalibrationDTO | null,
  defaultSessionMinutes: number
): { chunkMinutes: number; breakMinutes: number; allowSplit: boolean } {
  const breakMinutes =
    calibration?.status === 'completed'
      ? calibration.preferredBreakMinutes
      : 10;

  if (task.splittingPreference === 'continuous') {
    return {
      chunkMinutes: Math.max(15, task.recommendedMinutes),
      breakMinutes,
      allowSplit: false,
    };
  }

  let baseChunk = defaultSessionMinutes;
  if (calibration?.status === 'completed') {
    if (calibration.preferredSessionStyle === 'short_frequent_breaks') {
      baseChunk = Math.min(calibration.preferredSessionMinutes || 30, 35);
    } else if (calibration.preferredSessionStyle === 'long_uninterrupted') {
      baseChunk = Math.max(calibration.preferredSessionMinutes || 75, 60);
    } else if (calibration.preferredSessionMinutes) {
      baseChunk = calibration.preferredSessionMinutes;
    }

    if (
      calibration.energyLevel === 'low_energy' ||
      calibration.energyLevel === 'a_little_tired'
    ) {
      baseChunk = Math.min(baseChunk, 35);
    }
  }

  return {
    chunkMinutes: Math.max(20, baseChunk),
    breakMinutes: Math.max(5, breakMinutes),
    allowSplit: true,
  };
}

function scoreTaskForScheduling(
  task: TaskDTO,
  calibration: DailyCalibrationDTO | null,
  nowMs: number
): number {
  let score = PRIORITY_WEIGHT[task.priority] ?? 30;

  // Explicit calibration priorities take highest precedence
  if (calibration?.priorityTaskIds?.includes(task.id)) {
    score += 250;
  }
  if (
    calibration?.customPriorities?.some((cp) =>
      task.title.toLowerCase().includes(cp.toLowerCase())
    )
  ) {
    score += 180;
  }

  // Deadline proximity boost
  if (task.deadline) {
    const hoursLeft = (new Date(task.deadline).getTime() - nowMs) / 3_600_000;
    if (hoursLeft <= 0) score += 160;
    else if (hoursLeft <= 12) score += 130;
    else if (hoursLeft <= 24) score += 95;
    else if (hoursLeft <= 72) score += 55;
    else if (hoursLeft <= 168) score += 25;
  }

  // Low energy calibration prefers essential/short tasks over optional low-priority heavy tasks
  if (
    calibration?.status === 'completed' &&
    (calibration.energyLevel === 'low_energy' ||
      calibration.workloadPerception === 'overwhelming')
  ) {
    if (task.priority === 'low') score -= 35;
  }

  return score;
}

export function generateDailySchedule(input: GeneratePlanInput): DailyPlanDTO {
  const now = input.now ?? new Date();
  const todayLocal = getLocalDateString(input.timezone, now);
  const isToday = input.localDate === todayLocal;
  const currentMinute = isToday
    ? getCurrentMinuteOfDay(input.timezone, now)
    : 0;

  const capacity = calculateDailyCapacity({
    localDate: input.localDate,
    timezone: input.timezone,
    workingHours: input.workingHours,
    defaultBufferRatio: input.defaultBufferRatio,
    routines: input.routines,
    overridesForDate: input.overridesForDate,
    overridesForPrevDate: input.overridesForPrevDate,
    calibration: input.calibration,
  });

  // Preserve completed & active task blocks if regenerating/recalibrating
  const preservedTaskBlocks: ScheduledTaskBlockDTO[] = (
    input.existingPlan?.blocks ?? []
  ).filter(
    (b) =>
      b.kind === 'task' &&
      (b.status === 'completed' ||
        b.status === 'in_progress' ||
        (isToday && b.endMinute <= currentMinute && b.status !== 'skipped'))
  );

  // Convert resolved routines & calibration commitments into display blocks
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

  // Remaining workable intervals: subtract past time (if today) & preserved blocks
  const occupiedIntervals: MinuteInterval[] = preservedTaskBlocks.map((b) => ({
    start: b.startMinute,
    end: b.endMinute,
  }));
  if (isToday && currentMinute > 0) {
    occupiedIntervals.push({ start: 0, end: currentMinute });
  }

  let freeIntervals = subtractIntervals(
    capacity.workableIntervals,
    occupiedIntervals
  );

  // Enforce availableMinutes cap from capacityEngine (including buffer & calibration cap)
  const alreadyPreservedMinutes = preservedTaskBlocks
    .filter((b) => !b.isOverlapping)
    .reduce((acc, b) => acc + (b.endMinute - b.startMinute), 0);
  let remainingCapacityBudget = Math.max(
    0,
    capacity.breakdown.availableMinutes - alreadyPreservedMinutes
  );

  // Candidate active tasks
  const activeTasks = input.tasks.filter((t) => t.status !== 'completed');
  const { blockedByIncomplete } = topologicalOrderTasks(input.tasks);

  // Determine how many minutes are already completed/preserved for each task
  const preservedMinutesByTask = new Map<string, number>();
  for (const pb of preservedTaskBlocks) {
    if (!pb.taskId) continue;
    preservedMinutesByTask.set(
      pb.taskId,
      (preservedMinutesByTask.get(pb.taskId) ?? 0) +
        (pb.endMinute - pb.startMinute)
    );
  }

  // Sort candidate tasks (dependencies first, then priority/calibration/deadline score)
  const scoredTasks = [...activeTasks].sort((a, b) => {
    const aDependsOnB = a.dependencies.includes(b.id);
    const bDependsOnA = b.dependencies.includes(a.id);
    if (aDependsOnB && !bDependsOnA) return 1;
    if (bDependsOnA && !aDependsOnB) return -1;
    return (
      scoreTaskForScheduling(b, input.calibration, now.getTime()) -
      scoreTaskForScheduling(a, input.calibration, now.getTime())
    );
  });

  const newTaskBlocks: ScheduledTaskBlockDTO[] = [];
  const breakBlocks: ScheduledTaskBlockDTO[] = [];
  const unscheduledTasks: UnscheduledTaskEntry[] = [];
  const conflicts: ScheduleConflict[] = [];

  // Track earliest allowed minute per task due to dependency completion within today
  const taskFinishMinuteMap = new Map<string, number>();
  for (const pb of preservedTaskBlocks) {
    if (pb.taskId) {
      taskFinishMinuteMap.set(
        pb.taskId,
        Math.max(taskFinishMinuteMap.get(pb.taskId) ?? 0, pb.endMinute)
      );
    }
  }

  // Detect conflicting deadlines among high/urgent tasks
  const urgentWithDeadlines = scoredTasks.filter(
    (t) =>
      t.deadline &&
      new Date(t.deadline).getTime() - now.getTime() < 36 * 3_600_000
  );
  const totalUrgentMinutes = urgentWithDeadlines.reduce((acc, t) => {
    const base =
      t.recommendedMinutes ||
      t.userEstimatedMinutes ||
      t.aiEstimatedMinutes ||
      45;
    return acc + Math.max(10, predictEffortMinutes(base, t.category, input.profile) - t.actualMinutes);
  }, 0);
  if (
    urgentWithDeadlines.length >= 2 &&
    totalUrgentMinutes > remainingCapacityBudget + alreadyPreservedMinutes
  ) {
    conflicts.push({
      id: `conflict-deadlines-${input.localDate}`,
      severity: 'critical',
      message: `${urgentWithDeadlines.length} urgent deadline tasks require ~${Math.round(totalUrgentMinutes / 60)}h, exceeding today's ${Math.round(capacity.breakdown.availableMinutes / 60)}h available capacity.`,
      taskIds: urgentWithDeadlines.map((t) => t.id),
    });
  }

  for (const task of scoredTasks) {
    const baseEst =
      task.recommendedMinutes ||
      task.userEstimatedMinutes ||
      task.aiEstimatedMinutes ||
      45;
    const predictedTotal = predictEffortMinutes(
      baseEst,
      task.category,
      input.profile
    );
    const alreadyDone =
      task.actualMinutes + (preservedMinutesByTask.get(task.id) ?? 0);
    const neededMinutes = Math.max(0, predictedTotal - alreadyDone);

    if (neededMinutes === 0) continue;

    // Check if background activity can overlap an existing attention_intensive block
    if (task.attentionClass === 'background') {
      const candidateHost = newTaskBlocks.find(
        (b) =>
          b.kind === 'task' &&
          b.attentionClass === 'attention_intensive' &&
          b.endMinute - b.startMinute >= Math.min(neededMinutes, 20)
      );
      if (candidateHost) {
        const overlapCheck = evaluateTaskOverlap(
          'attention_intensive',
          'background',
          [],
          task.overlapAllowedWith,
          true
        );
        if (overlapCheck.allowed) {
          const overlapEnd = Math.min(
            candidateHost.endMinute,
            candidateHost.startMinute + neededMinutes
          );
          newTaskBlocks.push({
            id: `blk-${crypto.randomUUID().slice(0, 8)}`,
            kind: 'task',
            taskId: task.id,
            title: task.title,
            category: task.category,
            priority: task.priority,
            startMinute: candidateHost.startMinute,
            endMinute: overlapEnd,
            startTime: formatMinutesToHHMM(candidateHost.startMinute),
            endTime: formatMinutesToHHMM(overlapEnd),
            status: 'planned',
            isSplitPart: overlapEnd - candidateHost.startMinute < neededMinutes,
            splitIndex: 1,
            splitTotal: 1,
            attentionClass: task.attentionClass,
            isOverlapping: true,
            overlapWithBlockId: candidateHost.id,
            overlapConfirmed: false, // requires explicit user confirmation in UI
            efficiencyNote: overlapCheck.efficiencyNote,
            isFixed: false,
          });
          const rem =
            neededMinutes - (overlapEnd - candidateHost.startMinute);
          if (rem > 0) {
            unscheduledTasks.push({
              taskId: task.id,
              title: task.title,
              priority: task.priority,
              requiredMinutes: neededMinutes,
              remainingUnscheduledMinutes: rem,
              reason:
                'Partially paired as background activity; remaining duration exceeds host block.',
              alternatives: ['split_across_days', 'waiting_list'],
            });
          }
          continue;
        }
      }
    }

    // Check unresolved external dependencies
    const depIds = blockedByIncomplete.get(task.id) ?? [];
    let earliestAllowedMinute = 0;
    let blockedByUnscheduledDep = false;
    for (const depId of depIds) {
      const depFinish = taskFinishMinuteMap.get(depId);
      if (depFinish === undefined) {
        blockedByUnscheduledDep = true;
      } else {
        earliestAllowedMinute = Math.max(earliestAllowedMinute, depFinish);
      }
    }

    if (blockedByUnscheduledDep) {
      unscheduledTasks.push({
        taskId: task.id,
        title: task.title,
        priority: task.priority,
        requiredMinutes: neededMinutes,
        remainingUnscheduledMinutes: neededMinutes,
        reason: 'Waiting on prerequisite dependency task to be scheduled first.',
        alternatives: ['reschedule_other', 'waiting_list', 'extend_deadline'],
      });
      continue;
    }

    if (remainingCapacityBudget < 15) {
      unscheduledTasks.push({
        taskId: task.id,
        title: task.title,
        priority: task.priority,
        requiredMinutes: neededMinutes,
        remainingUnscheduledMinutes: neededMinutes,
        reason: 'Daily working capacity is full after higher-priority commitments.',
        alternatives: [
          'reschedule_other',
          'waiting_list',
          'change_priority',
          'reduce_scope',
          'extend_deadline',
          'split_across_days',
        ],
      });
      continue;
    }

    const { chunkMinutes, breakMinutes, allowSplit } = getSessionChunkSize(
      { ...task, recommendedMinutes: neededMinutes },
      input.calibration,
      input.defaultSessionMinutes
    );

    if (!allowSplit) {
      // Must fit in a single contiguous free interval
      const slotIndex = freeIntervals.findIndex(
        (iv) =>
          Math.max(iv.start, earliestAllowedMinute) + neededMinutes <= iv.end
      );
      if (slotIndex === -1 || neededMinutes > remainingCapacityBudget) {
        unscheduledTasks.push({
          taskId: task.id,
          title: task.title,
          priority: task.priority,
          requiredMinutes: neededMinutes,
          remainingUnscheduledMinutes: neededMinutes,
          reason:
            neededMinutes > remainingCapacityBudget
              ? 'Insufficient remaining capacity for continuous execution.'
              : 'No uninterrupted time block long enough for continuous execution.',
          alternatives: [
            'split_across_days',
            'reschedule_other',
            'waiting_list',
            'reduce_scope',
            'extend_deadline',
          ],
        });
        continue;
      }

      const slot = freeIntervals[slotIndex];
      const startMin = Math.max(slot.start, earliestAllowedMinute);
      const endMin = startMin + neededMinutes;

      newTaskBlocks.push({
        id: `blk-${crypto.randomUUID().slice(0, 8)}`,
        kind: 'task',
        taskId: task.id,
        title: task.title,
        category: task.category,
        priority: task.priority,
        startMinute: startMin,
        endMinute: endMin,
        startTime: formatMinutesToHHMM(startMin),
        endTime: formatMinutesToHHMM(endMin),
        status: 'planned',
        isSplitPart: false,
        splitIndex: 1,
        splitTotal: 1,
        attentionClass: task.attentionClass,
        isOverlapping: false,
        overlapWithBlockId: null,
        overlapConfirmed: false,
        efficiencyNote: null,
        isFixed: false,
      });

      remainingCapacityBudget -= neededMinutes;
      taskFinishMinuteMap.set(task.id, endMin);
      freeIntervals = subtractIntervals(freeIntervals, [
        { start: startMin, end: Math.min(1440, endMin + breakMinutes) },
      ]);
      if (endMin + breakMinutes <= slot.end) {
        breakBlocks.push({
          id: `brk-${crypto.randomUUID().slice(0, 8)}`,
          kind: 'break',
          taskId: null,
          title: 'Recovery break',
          startMinute: endMin,
          endMinute: endMin + breakMinutes,
          startTime: formatMinutesToHHMM(endMin),
          endTime: formatMinutesToHHMM(endMin + breakMinutes),
          status: 'planned',
          isSplitPart: false,
          splitIndex: 1,
          splitTotal: 1,
          attentionClass: null,
          isOverlapping: false,
          overlapWithBlockId: null,
          overlapConfirmed: false,
          efficiencyNote: null,
          isFixed: false,
        });
      }
      continue;
    }

    // Splittable allocation across available chunks
    let remainingForTask = Math.min(neededMinutes, remainingCapacityBudget);
    const allocatedParts: ScheduledTaskBlockDTO[] = [];

    for (const iv of [...freeIntervals]) {
      if (remainingForTask < 15) break;
      const startCandidate = Math.max(iv.start, earliestAllowedMinute);
      const availInSlot = iv.end - startCandidate;
      if (availInSlot < 15) continue;

      const alloc = Math.min(remainingForTask, chunkMinutes, availInSlot);
      if (alloc < 15) continue;

      const endMin = startCandidate + alloc;
      allocatedParts.push({
        id: `blk-${crypto.randomUUID().slice(0, 8)}`,
        kind: 'task',
        taskId: task.id,
        title: task.title,
        category: task.category,
        priority: task.priority,
        startMinute: startCandidate,
        endMinute: endMin,
        startTime: formatMinutesToHHMM(startCandidate),
        endTime: formatMinutesToHHMM(endMin),
        status: 'planned',
        isSplitPart: true,
        splitIndex: allocatedParts.length + 1,
        splitTotal: 1,
        attentionClass: task.attentionClass,
        isOverlapping: false,
        overlapWithBlockId: null,
        overlapConfirmed: false,
        efficiencyNote: null,
        isFixed: false,
      });

      remainingForTask -= alloc;
      remainingCapacityBudget -= alloc;
      taskFinishMinuteMap.set(
        task.id,
        Math.max(taskFinishMinuteMap.get(task.id) ?? 0, endMin)
      );

      freeIntervals = subtractIntervals(freeIntervals, [
        { start: startCandidate, end: Math.min(1440, endMin + breakMinutes) },
      ]);

      if (endMin + breakMinutes <= iv.end && remainingForTask >= 15) {
        breakBlocks.push({
          id: `brk-${crypto.randomUUID().slice(0, 8)}`,
          kind: 'break',
          taskId: null,
          title: 'Short break',
          startMinute: endMin,
          endMinute: endMin + breakMinutes,
          startTime: formatMinutesToHHMM(endMin),
          endTime: formatMinutesToHHMM(endMin + breakMinutes),
          status: 'planned',
          isSplitPart: false,
          splitIndex: 1,
          splitTotal: 1,
          attentionClass: null,
          isOverlapping: false,
          overlapWithBlockId: null,
          overlapConfirmed: false,
          efficiencyNote: null,
          isFixed: false,
        });
      }
    }

    const totalScheduledForTask = allocatedParts.reduce(
      (acc, p) => acc + (p.endMinute - p.startMinute),
      0
    );

    if (allocatedParts.length > 0) {
      const isPartialToday = totalScheduledForTask < neededMinutes;
      for (let idx = 0; idx < allocatedParts.length; idx++) {
        allocatedParts[idx].splitIndex = idx + 1;
        allocatedParts[idx].splitTotal = allocatedParts.length;
        allocatedParts[idx].isSplitPart =
          allocatedParts.length > 1 || isPartialToday;
      }
      newTaskBlocks.push(...allocatedParts);
    }

    if (totalScheduledForTask < neededMinutes) {
      const rem = neededMinutes - totalScheduledForTask;
      unscheduledTasks.push({
        taskId: task.id,
        title: task.title,
        priority: task.priority,
        requiredMinutes: neededMinutes,
        remainingUnscheduledMinutes: rem,
        reason:
          totalScheduledForTask > 0
            ? `Partially allocated (${totalScheduledForTask}m scheduled today; ${rem}m remaining).`
            : 'Insufficient capacity available today.',
        alternatives: [
          'split_across_days',
          'reschedule_other',
          'waiting_list',
          'change_priority',
          'reduce_scope',
          'extend_deadline',
        ],
      });
    }
  }

  const allBlocks = [
    ...routineBlocks,
    ...preservedTaskBlocks,
    ...newTaskBlocks,
    ...breakBlocks,
  ].sort((a, b) => a.startMinute - b.startMinute);

  // Overlapping calendar blocks do NOT add independent active work capacity
  const scheduledActiveTaskMinutes = allBlocks
    .filter((b) => b.kind === 'task' && !b.isOverlapping && b.status !== 'skipped')
    .reduce((acc, b) => acc + (b.endMinute - b.startMinute), 0);

  const finalBreakdown: CapacityBreakdown = {
    ...capacity.breakdown,
    scheduledTaskMinutes: scheduledActiveTaskMinutes,
    unallocatedMinutes: Math.max(
      0,
      capacity.breakdown.availableMinutes - scheduledActiveTaskMinutes
    ),
  };

  return {
    userId: input.userId,
    date: input.localDate,
    timezone: input.timezone,
    revisionNumber: (input.existingPlan?.revisionNumber ?? 0) + 1,
    calibrationConfirmed: input.calibration?.status === 'completed',
    capacityBreakdown: finalBreakdown,
    blocks: allBlocks,
    unscheduledTasks,
    conflicts,
    updatedAt: now.toISOString(),
  };
}

export function buildRecalibrationProposal(
  input: GeneratePlanInput
): RecalibrationProposal {
  const existingPlan = input.existingPlan;
  const proposed = generateDailySchedule(input);

  const preservedBlocks = (existingPlan?.blocks ?? []).filter(
    (b) =>
      b.kind === 'task' &&
      (b.status === 'completed' || b.status === 'in_progress')
  );

  const oldTaskBlockMap = new Map<string, ScheduledTaskBlockDTO[]>();
  for (const b of existingPlan?.blocks ?? []) {
    if (b.kind === 'task' && b.taskId) {
      const list = oldTaskBlockMap.get(b.taskId) ?? [];
      list.push(b);
      oldTaskBlockMap.set(b.taskId, list);
    }
  }

  const newTaskBlockMap = new Map<string, ScheduledTaskBlockDTO[]>();
  for (const b of proposed.blocks) {
    if (b.kind === 'task' && b.taskId) {
      const list = newTaskBlockMap.get(b.taskId) ?? [];
      list.push(b);
      newTaskBlockMap.set(b.taskId, list);
    }
  }

  const diffSummary: string[] = [];
  if (preservedBlocks.length > 0) {
    diffSummary.push(
      `Preserved ${preservedBlocks.length} completed or active work session block(s).`
    );
  }

  for (const [taskId, oldList] of oldTaskBlockMap.entries()) {
    const newList = newTaskBlockMap.get(taskId);
    const title = oldList[0]?.title ?? 'Task';
    if (!newList || newList.length === 0) {
      diffSummary.push(`Moved "${title}" out of today's schedule.`);
    } else if (
      oldList[0].startTime !== newList[0].startTime ||
      oldList.length !== newList.length
    ) {
      diffSummary.push(
        `Rescheduled "${title}" to ${newList.map((n) => `${n.startTime}–${n.endTime}`).join(', ')}.`
      );
    }
  }

  for (const [taskId, newList] of newTaskBlockMap.entries()) {
    if (!oldTaskBlockMap.has(taskId)) {
      const title = newList[0]?.title ?? 'Task';
      diffSummary.push(
        `Added "${title}" at ${newList.map((n) => `${n.startTime}–${n.endTime}`).join(', ')}.`
      );
    }
  }

  if (diffSummary.length === 0) {
    diffSummary.push('Schedule remains aligned with your updated daily context.');
  }

  const requiresConfirmation =
    Boolean(existingPlan) &&
    diffSummary.some(
      (d) => d.startsWith('Moved') || d.startsWith('Rescheduled')
    );

  return {
    date: input.localDate,
    preservedBlocks,
    proposedBlocks: proposed.blocks,
    proposedCapacity: proposed.capacityBreakdown,
    proposedUnscheduled: proposed.unscheduledTasks,
    proposedConflicts: proposed.conflicts,
    diffSummary,
    requiresConfirmation,
  };
}
