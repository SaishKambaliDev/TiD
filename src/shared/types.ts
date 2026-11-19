export type TaskCategory =
  | 'coding'
  | 'writing'
  | 'studying'
  | 'design'
  | 'meeting'
  | 'admin'
  | 'research'
  | 'background_job'
  | 'personal'
  | 'other';

export type TaskPriority = 'urgent' | 'high' | 'medium' | 'low';

export type TaskStatus = 'todo' | 'in_progress' | 'completed' | 'waiting_list';

export type AttentionClass =
  | 'attention_intensive'
  | 'background'
  | 'partially_attentive';

export type SplittingPreference =
  | 'continuous'
  | 'shorter_sessions'
  | 'ai_suggested';

export interface MilestoneItem {
  id: string;
  title: string;
  completed: boolean;
  estimatedMinutes: number;
}

export interface TaskGroqAnalysis {
  clarifyingQuestions: string[];
  executionCharacteristics: string[];
  suggestedOverlapNote?: string;
  confidence?: number;
  summary?: string;
}

export interface TaskDTO {
  id: string;
  userId: string;
  title: string;
  description: string;
  category: TaskCategory;
  priority: TaskPriority;
  status: TaskStatus;
  deadline: string | null;
  userEstimatedMinutes: number | null;
  aiEstimatedMinutes: number | null;
  recommendedMinutes: number;
  actualMinutes: number;
  elapsedCalendarMinutes: number;
  attentionClass: AttentionClass;
  overlapAllowedWith: AttentionClass[];
  splittingPreference: SplittingPreference;
  milestones: MilestoneItem[];
  dependencies: string[];
  groqAnalysis: TaskGroqAnalysis;
  scheduledDate: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type RoutineActivityType =
  | 'sleep'
  | 'meal'
  | 'work_office'
  | 'college'
  | 'exercise'
  | 'commute'
  | 'personal'
  | 'break';

export interface DailyRoutineDTO {
  id: string;
  userId: string;
  activityName: string;
  startTime: string; // HH:mm
  endTime: string; // HH:mm (may be < startTime for cross-midnight e.g. 23:00 -> 07:00)
  daysOfWeek: number[]; // ISO weekdays 1 (Mon) .. 7 (Sun)
  activityType: RoutineActivityType;
  isFixed: boolean;
  isMovable: boolean;
  isActive: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export type RoutineOverrideAction = 'modify' | 'disable' | 'add';

export interface DailyRoutineOverrideDTO {
  id: string;
  userId: string;
  date: string; // YYYY-MM-DD in user timezone
  routineId: string | null;
  action: RoutineOverrideAction;
  activityName: string;
  startTime: string;
  endTime: string;
  activityType: RoutineActivityType;
  isFixed: boolean;
  isMovable: boolean;
  notes: string;
}

export interface ResolvedRoutineBlock {
  sourceId: string;
  sourceKind: 'routine' | 'override' | 'calibration_commitment';
  activityName: string;
  startMinute: number; // 0..1440 within local day
  endMinute: number; // 0..1440 within local day
  startTime: string;
  endTime: string;
  activityType: RoutineActivityType | 'commitment';
  isFixed: boolean;
  isMovable: boolean;
  crossesMidnight: boolean;
  notes: string;
}

export type EnergyLevel =
  | 'very_energetic'
  | 'good'
  | 'normal'
  | 'a_little_tired'
  | 'low_energy';

export type AvailableCapacityChoice =
  | 'full_free_time'
  | 'less_than_usual'
  | 'few_hours'
  | 'unusually_busy'
  | 'custom';

export type WorkloadPerception =
  | 'light'
  | 'manageable'
  | 'heavy'
  | 'overwhelming';

export type PreferredSessionStyle =
  | 'long_uninterrupted'
  | 'short_frequent_breaks'
  | 'mixed'
  | 'no_preference';

export interface TimeWindow {
  start: string; // HH:mm
  end: string; // HH:mm
}

export interface CustomCommitment {
  id: string;
  title: string;
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  isFixed: boolean;
}

export interface ExtractedConstraint {
  type: 'unavailable_window' | 'leave_early' | 'rest' | 'priority_target' | 'commitment' | 'note';
  description: string;
  startTime?: string;
  endTime?: string;
  targetTaskTitle?: string;
  effect: string;
}

export interface DailyCalibrationDTO {
  id?: string;
  userId: string;
  date: string; // YYYY-MM-DD in user timezone
  status: 'pending' | 'completed' | 'skipped';
  energyLevel: EnergyLevel;
  availableCapacityChoice: AvailableCapacityChoice;
  customAvailableMinutes: number | null;
  availableWindows: TimeWindow[];
  routineChangesSummary: string;
  customCommitments: CustomCommitment[];
  workloadPerception: WorkloadPerception;
  priorityTaskIds: string[];
  customPriorities: string[];
  preferredSessionStyle: PreferredSessionStyle;
  preferredSessionMinutes: number;
  preferredBreakMinutes: number;
  unexpectedConstraintsText: string;
  extractedConstraints: ExtractedConstraint[];
  calibrationCountToday: number;
  lastUpdatedAt: string;
}

export type ScheduleBlockKind = 'task' | 'break' | 'routine' | 'commitment';

export type ScheduleBlockStatus = 'planned' | 'in_progress' | 'completed' | 'skipped';

export interface ScheduledTaskBlockDTO {
  id: string;
  kind: ScheduleBlockKind;
  taskId: string | null;
  title: string;
  category?: TaskCategory;
  priority?: TaskPriority;
  startMinute: number;
  endMinute: number;
  startTime: string;
  endTime: string;
  status: ScheduleBlockStatus;
  isSplitPart: boolean;
  splitIndex: number;
  splitTotal: number;
  attentionClass: AttentionClass | null;
  isOverlapping: boolean;
  overlapWithBlockId: string | null;
  overlapConfirmed: boolean;
  efficiencyNote: string | null;
  isFixed: boolean;
}

export interface CapacityBreakdown {
  totalWakingMinutes: number;
  committedMinutes: number;
  availableMinutes: number;
  scheduledTaskMinutes: number;
  unallocatedMinutes: number;
  bufferMinutes: number;
}

export interface UnscheduledTaskEntry {
  taskId: string;
  title: string;
  priority: TaskPriority;
  requiredMinutes: number;
  remainingUnscheduledMinutes: number;
  reason: string;
  alternatives: Array<
    | 'reschedule_other'
    | 'waiting_list'
    | 'change_priority'
    | 'reduce_scope'
    | 'extend_deadline'
    | 'split_across_days'
  >;
}

export interface ScheduleConflict {
  id: string;
  message: string;
  severity: 'warning' | 'critical';
  taskIds: string[];
}

export interface DailyPlanDTO {
  id?: string;
  userId: string;
  date: string;
  timezone: string;
  revisionNumber: number;
  calibrationConfirmed: boolean;
  capacityBreakdown: CapacityBreakdown;
  blocks: ScheduledTaskBlockDTO[];
  unscheduledTasks: UnscheduledTaskEntry[];
  conflicts: ScheduleConflict[];
  updatedAt: string;
}

export interface DailyPlanRevisionDTO {
  id: string;
  userId: string;
  date: string;
  revisionNumber: number;
  triggerReason: 'initial_generate' | 'manual_edit' | 'recalibration' | 'task_completed';
  blocksSnapshot: ScheduledTaskBlockDTO[];
  capacityBreakdownSnapshot: CapacityBreakdown;
  unscheduledSnapshot: UnscheduledTaskEntry[];
  diffSummary: string[];
  createdAt: string;
}

export interface RecalibrationProposal {
  date: string;
  preservedBlocks: ScheduledTaskBlockDTO[];
  proposedBlocks: ScheduledTaskBlockDTO[];
  proposedCapacity: CapacityBreakdown;
  proposedUnscheduled: UnscheduledTaskEntry[];
  proposedConflicts: ScheduleConflict[];
  diffSummary: string[];
  requiresConfirmation: boolean;
}

export interface WorkSessionDTO {
  id: string;
  userId: string;
  taskId: string;
  taskTitle?: string;
  planDate: string;
  planBlockId: string | null;
  startedAt: string;
  pausedAt: string | null;
  endedAt: string | null;
  status: 'active' | 'paused' | 'completed' | 'abandoned';
  activeMinutes: number;
  pausedMinutes: number;
  pairedBackgroundTaskId: string | null;
  interruptionCount: number;
  notes: string;
}

export interface CategoryPosterior {
  category: TaskCategory;
  observationCount: number;
  alpha: number;
  beta: number;
  posteriorMeanMultiplier: number;
  posteriorVariance: number;
  uncertaintyScore: number; // 0..1 where 1 = highest uncertainty
  avgInitiationDelayMinutes: number;
  postponementCount: number;
  completionCount: number;
}

export interface CalibrationCorrelation {
  energyLevel: EnergyLevel;
  observationCount: number;
  avgActualVsEstRatio: number;
  completionRate: number;
}

export interface PersonalBehaviourProfileDTO {
  userId: string;
  populationPriors: {
    defaultEffortMultiplier: number;
    priorStrength: number;
    baselinePostponementRate: number;
    baselineOnTimeRate: number;
  };
  categoryPosteriors: CategoryPosterior[];
  calibrationCorrelations: CalibrationCorrelation[];
  initiationBehaviour: {
    avgHoursBeforeDeadlineStarted: number;
    observationCount: number;
  };
  workloadTolerance: {
    optimalDailyActiveMinutes: number;
    maxObservedSustainableMinutes: number;
    overloadEventCount: number;
    observationCount: number;
  };
  deadlineSensitivity: {
    onTimeCount: number;
    lateCount: number;
    lastMinuteRushRate: number;
  };
  taskSwitchingCount: number;
  recommendationAcceptedCount: number;
  recommendationDismissedCount: number;
  updatedAt: string;
}

export interface TaskEventDTO {
  id: string;
  userId: string;
  taskId: string | null;
  eventType: string;
  occurredAt: string;
  localDate: string;
  category?: TaskCategory;
  userEstimatedMinutes?: number | null;
  aiEstimatedMinutes?: number | null;
  actualMinutes?: number | null;
  deadlineSlackMinutes?: number | null;
  calibrationEnergy?: EnergyLevel | null;
  metadata?: Record<string, unknown>;
}

export interface DeadlineRiskAssessment {
  taskId: string;
  title: string;
  deadline: string;
  riskLevel: 'low' | 'moderate' | 'high' | 'critical';
  completionProbability: number;
  requiredMinutesPosterior: number;
  availableMinutesBeforeDeadline: number;
  slackMinutes: number;
  explanation: string;
}

export interface RecommendationItem {
  id: string;
  taskId?: string;
  kind:
    | 'split_task'
    | 'reprioritize'
    | 'move_to_planner'
    | 'compatible_overlap'
    | 'lighten_schedule'
    | 'deadline_warning'
    | 'buffer_adjust';
  title: string;
  rationale: string;
  evidenceSummary: string;
  actionLabel: string;
  payload: Record<string, unknown>;
}

export interface PersonalInsight {
  id: string;
  title: string;
  statement: string;
  category?: TaskCategory;
  observationCount: number;
  uncertaintyLabel: 'Low uncertainty' | 'Moderate uncertainty' | 'Early signal';
  tone: 'lavender' | 'sage' | 'peach' | 'sky';
}

export interface UserProfileDTO {
  id: string;
  email: string;
  name: string;
  timezone: string;
  workingHours: TimeWindow;
  defaultBreakMinutes: number;
  defaultBufferRatio: number;
  defaultSessionMinutes: number;
  createdAt: string;
}
