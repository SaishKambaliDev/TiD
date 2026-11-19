import type {
  DailyCalibrationDTO,
  DailyPlanDTO,
  DailyPlanRevisionDTO,
  DailyRoutineDTO,
  DailyRoutineOverrideDTO,
  PersonalBehaviourProfileDTO,
  TaskDTO,
  TaskEventDTO,
  UserProfileDTO,
  WorkSessionDTO,
} from '../../src/shared/types.js';
import { createInitialProfileDTO } from '../engines/bayesianEngine.js';
import type { IDailyCalibration } from '../models/DailyCalibration.js';
import type { IDailyPlan } from '../models/DailyPlan.js';
import type { IDailyPlanRevision } from '../models/DailyPlanRevision.js';
import type { IDailyRoutine } from '../models/DailyRoutine.js';
import type { IDailyRoutineOverride } from '../models/DailyRoutineOverride.js';
import {
  PersonalBehaviourProfileModel,
  type IPersonalBehaviourProfile,
} from '../models/PersonalBehaviourProfile.js';
import type { ITask } from '../models/Task.js';
import type { ITaskEvent } from '../models/TaskEvent.js';
import type { IUser } from '../models/User.js';
import type { IWorkSession } from '../models/WorkSession.js';

export function mapUser(doc: IUser): UserProfileDTO {
  return {
    id: doc._id.toString(),
    email: doc.email,
    name: doc.name,
    timezone: doc.timezone,
    workingHours: {
      start: doc.workingHours?.start ?? '09:00',
      end: doc.workingHours?.end ?? '18:00',
    },
    defaultBreakMinutes: doc.defaultBreakMinutes ?? 15,
    defaultBufferRatio: doc.defaultBufferRatio ?? 0.12,
    defaultSessionMinutes: doc.defaultSessionMinutes ?? 50,
    createdAt: doc.createdAt.toISOString(),
  };
}

export function mapTask(doc: ITask): TaskDTO {
  return {
    id: doc._id.toString(),
    userId: doc.userId.toString(),
    title: doc.title,
    description: doc.description ?? '',
    category: doc.category,
    priority: doc.priority,
    status: doc.status,
    deadline: doc.deadline ? doc.deadline.toISOString() : null,
    userEstimatedMinutes: doc.userEstimatedMinutes ?? null,
    aiEstimatedMinutes: doc.aiEstimatedMinutes ?? null,
    recommendedMinutes: doc.recommendedMinutes,
    actualMinutes: doc.actualMinutes ?? 0,
    elapsedCalendarMinutes: doc.elapsedCalendarMinutes ?? 0,
    attentionClass: doc.attentionClass,
    overlapAllowedWith: doc.overlapAllowedWith ?? [],
    splittingPreference: doc.splittingPreference,
    milestones: (doc.milestones ?? []).map((m) => ({
      id: m.id,
      title: m.title,
      completed: Boolean(m.completed),
      estimatedMinutes: m.estimatedMinutes,
    })),
    dependencies: (doc.dependencies ?? []).map((d) => d.toString()),
    groqAnalysis: {
      clarifyingQuestions: doc.groqAnalysis?.clarifyingQuestions ?? [],
      executionCharacteristics:
        doc.groqAnalysis?.executionCharacteristics ?? [],
      suggestedOverlapNote: doc.groqAnalysis?.suggestedOverlapNote,
      confidence: doc.groqAnalysis?.confidence,
      summary: doc.groqAnalysis?.summary,
    },
    scheduledDate: doc.scheduledDate ?? null,
    completedAt: doc.completedAt ? doc.completedAt.toISOString() : null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export function mapRoutine(doc: IDailyRoutine): DailyRoutineDTO {
  return {
    id: doc._id.toString(),
    userId: doc.userId.toString(),
    activityName: doc.activityName,
    startTime: doc.startTime,
    endTime: doc.endTime,
    daysOfWeek: doc.daysOfWeek ?? [1, 2, 3, 4, 5, 6, 7],
    activityType: doc.activityType,
    isFixed: doc.isFixed,
    isMovable: doc.isMovable,
    isActive: doc.isActive,
    notes: doc.notes ?? '',
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export function mapRoutineOverride(
  doc: IDailyRoutineOverride
): DailyRoutineOverrideDTO {
  return {
    id: doc._id.toString(),
    userId: doc.userId.toString(),
    date: doc.date,
    routineId: doc.routineId ? doc.routineId.toString() : null,
    action: doc.action,
    activityName: doc.activityName,
    startTime: doc.startTime,
    endTime: doc.endTime,
    activityType: doc.activityType,
    isFixed: doc.isFixed,
    isMovable: doc.isMovable,
    notes: doc.notes ?? '',
  };
}

export function mapCalibration(doc: IDailyCalibration): DailyCalibrationDTO {
  return {
    id: doc._id.toString(),
    userId: doc.userId.toString(),
    date: doc.date,
    status: doc.status,
    energyLevel: doc.energyLevel,
    availableCapacityChoice: doc.availableCapacityChoice,
    customAvailableMinutes: doc.customAvailableMinutes ?? null,
    availableWindows: (doc.availableWindows ?? []).map((w) => ({
      start: w.start,
      end: w.end,
    })),
    routineChangesSummary: doc.routineChangesSummary ?? '',
    customCommitments: (doc.customCommitments ?? []).map((c) => ({
      id: c.id,
      title: c.title,
      startTime: c.startTime,
      endTime: c.endTime,
      isFixed: c.isFixed,
    })),
    workloadPerception: doc.workloadPerception,
    priorityTaskIds: (doc.priorityTaskIds ?? []).map((id) => id.toString()),
    customPriorities: doc.customPriorities ?? [],
    preferredSessionStyle: doc.preferredSessionStyle,
    preferredSessionMinutes: doc.preferredSessionMinutes,
    preferredBreakMinutes: doc.preferredBreakMinutes,
    unexpectedConstraintsText: doc.unexpectedConstraintsText ?? '',
    extractedConstraints: doc.extractedConstraints ?? [],
    calibrationCountToday: doc.calibrationCountToday ?? 1,
    lastUpdatedAt: doc.lastUpdatedAt.toISOString(),
  };
}

export function mapDailyPlan(doc: IDailyPlan): DailyPlanDTO {
  return {
    id: doc._id.toString(),
    userId: doc.userId.toString(),
    date: doc.date,
    timezone: doc.timezone,
    revisionNumber: doc.revisionNumber,
    calibrationConfirmed: doc.calibrationConfirmed,
    capacityBreakdown: doc.capacityBreakdown,
    blocks: doc.blocks ?? [],
    unscheduledTasks: doc.unscheduledTasks ?? [],
    conflicts: doc.conflicts ?? [],
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export function mapPlanRevision(
  doc: IDailyPlanRevision
): DailyPlanRevisionDTO {
  return {
    id: doc._id.toString(),
    userId: doc.userId.toString(),
    date: doc.date,
    revisionNumber: doc.revisionNumber,
    triggerReason: doc.triggerReason,
    blocksSnapshot: doc.blocksSnapshot ?? [],
    capacityBreakdownSnapshot: doc.capacityBreakdownSnapshot,
    unscheduledSnapshot: doc.unscheduledSnapshot ?? [],
    diffSummary: doc.diffSummary ?? [],
    createdAt: doc.createdAt.toISOString(),
  };
}

export function mapWorkSession(
  doc: IWorkSession,
  taskTitle?: string
): WorkSessionDTO {
  return {
    id: doc._id.toString(),
    userId: doc.userId.toString(),
    taskId: doc.taskId.toString(),
    taskTitle,
    planDate: doc.planDate,
    planBlockId: doc.planBlockId ?? null,
    startedAt: doc.startedAt.toISOString(),
    pausedAt: doc.pausedAt ? doc.pausedAt.toISOString() : null,
    endedAt: doc.endedAt ? doc.endedAt.toISOString() : null,
    status: doc.status,
    activeMinutes: doc.activeMinutes ?? 0,
    pausedMinutes: doc.pausedMinutes ?? 0,
    pairedBackgroundTaskId: doc.pairedBackgroundTaskId
      ? doc.pairedBackgroundTaskId.toString()
      : null,
    interruptionCount: doc.interruptionCount ?? 0,
    notes: doc.notes ?? '',
  };
}

export function mapBehaviourProfile(
  doc: IPersonalBehaviourProfile
): PersonalBehaviourProfileDTO {
  return {
    userId: doc.userId.toString(),
    populationPriors: doc.populationPriors,
    categoryPosteriors: doc.categoryPosteriors ?? [],
    calibrationCorrelations: doc.calibrationCorrelations ?? [],
    initiationBehaviour: doc.initiationBehaviour,
    workloadTolerance: doc.workloadTolerance,
    deadlineSensitivity: doc.deadlineSensitivity,
    taskSwitchingCount: doc.taskSwitchingCount ?? 0,
    recommendationAcceptedCount: doc.recommendationAcceptedCount ?? 0,
    recommendationDismissedCount: doc.recommendationDismissedCount ?? 0,
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export function mapTaskEvent(doc: ITaskEvent): TaskEventDTO {
  return {
    id: doc._id.toString(),
    userId: doc.userId.toString(),
    taskId: doc.taskId ? doc.taskId.toString() : null,
    eventType: doc.eventType,
    occurredAt: doc.occurredAt.toISOString(),
    localDate: doc.localDate,
    category: doc.category,
    userEstimatedMinutes: doc.userEstimatedMinutes ?? null,
    aiEstimatedMinutes: doc.aiEstimatedMinutes ?? null,
    actualMinutes: doc.actualMinutes ?? null,
    deadlineSlackMinutes: doc.deadlineSlackMinutes ?? null,
    calibrationEnergy: doc.calibrationEnergy ?? null,
    metadata: doc.metadata ?? {},
  };
}

export async function getOrCreateBehaviourProfile(
  userId: string
): Promise<IPersonalBehaviourProfile> {
  let profile = await PersonalBehaviourProfileModel.findOne({ userId });
  if (!profile) {
    const initial = createInitialProfileDTO(userId);
    profile = await PersonalBehaviourProfileModel.create({
      userId,
      populationPriors: initial.populationPriors,
      categoryPosteriors: initial.categoryPosteriors,
      calibrationCorrelations: initial.calibrationCorrelations,
      initiationBehaviour: initial.initiationBehaviour,
      workloadTolerance: initial.workloadTolerance,
      deadlineSensitivity: initial.deadlineSensitivity,
    });
  }
  return profile;
}
