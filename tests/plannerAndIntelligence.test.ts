import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyTaskCompletionObservation,
  createInitialProfileDTO,
  generateEvidenceBackedInsights,
} from '../server/engines/bayesianEngine.js';
import { calculateDailyCapacity } from '../server/engines/capacityEngine.js';
import { evaluateTaskOverlap } from '../server/engines/overlapEngine.js';
import { assessDeadlineRisks } from '../server/engines/riskAndRecommendationEngine.js';
import {
  buildRecalibrationProposal,
  generateDailySchedule,
} from '../server/engines/schedulingEngine.js';
import { getLocalDateString } from '../server/engines/timeUtils.js';
import type {
  DailyCalibrationDTO,
  DailyRoutineDTO,
  DailyRoutineOverrideDTO,
  TaskDTO,
} from '../src/shared/types.js';

function makeTask(overrides: Partial<TaskDTO> = {}): TaskDTO {
  return {
    id: overrides.id ?? 'task-1',
    userId: overrides.userId ?? 'user-a',
    title: overrides.title ?? 'Build parser module',
    description: '',
    category: overrides.category ?? 'coding',
    priority: overrides.priority ?? 'high',
    status: overrides.status ?? 'todo',
    deadline: overrides.deadline ?? null,
    userEstimatedMinutes: overrides.userEstimatedMinutes ?? 60,
    aiEstimatedMinutes: overrides.aiEstimatedMinutes ?? 60,
    recommendedMinutes: overrides.recommendedMinutes ?? 60,
    actualMinutes: overrides.actualMinutes ?? 0,
    elapsedCalendarMinutes: overrides.elapsedCalendarMinutes ?? 0,
    attentionClass: overrides.attentionClass ?? 'attention_intensive',
    overlapAllowedWith: overrides.overlapAllowedWith ?? [],
    splittingPreference: overrides.splittingPreference ?? 'ai_suggested',
    milestones: [],
    dependencies: overrides.dependencies ?? [],
    groqAnalysis: {
      clarifyingQuestions: [],
      executionCharacteristics: [],
    },
    scheduledDate: null,
    completedAt: null,
    createdAt: '2026-11-18T08:00:00.000Z',
    updatedAt: '2026-11-18T08:00:00.000Z',
  };
}

function makeRoutine(overrides: Partial<DailyRoutineDTO> = {}): DailyRoutineDTO {
  return {
    id: overrides.id ?? 'routine-1',
    userId: overrides.userId ?? 'user-a',
    activityName: overrides.activityName ?? 'Sleep',
    startTime: overrides.startTime ?? '23:00',
    endTime: overrides.endTime ?? '07:00',
    daysOfWeek: overrides.daysOfWeek ?? [1, 2, 3, 4, 5, 6, 7],
    activityType: overrides.activityType ?? 'sleep',
    isFixed: overrides.isFixed ?? true,
    isMovable: overrides.isMovable ?? false,
    isActive: overrides.isActive ?? true,
    notes: '',
    createdAt: '2026-11-18T00:00:00.000Z',
    updatedAt: '2026-11-18T00:00:00.000Z',
  };
}

test('1. New user with no routine gets realistic working capacity, not 24h', () => {
  const cap = calculateDailyCapacity({
    localDate: '2026-11-18',
    timezone: 'UTC',
    workingHours: { start: '09:00', end: '18:00' },
    defaultBufferRatio: 0.12,
    routines: [],
    overridesForDate: [],
    overridesForPrevDate: [],
    calibration: null,
  });

  assert.equal(cap.breakdown.totalWakingMinutes, 960);
  assert.ok(cap.breakdown.availableMinutes <= 540);
  assert.ok(cap.breakdown.availableMinutes > 400);
});

test('2. User with recurring routine subtracts fixed commitments from available capacity', () => {
  const routines: DailyRoutineDTO[] = [
    makeRoutine({ id: 'r-sleep', activityName: 'Sleep', startTime: '23:00', endTime: '07:00', activityType: 'sleep' }),
    makeRoutine({ id: 'r-office', activityName: 'Office', startTime: '09:00', endTime: '13:00', activityType: 'work_office' }),
    makeRoutine({ id: 'r-lunch', activityName: 'Lunch', startTime: '13:00', endTime: '14:00', activityType: 'meal' }),
  ];

  const cap = calculateDailyCapacity({
    localDate: '2026-11-18',
    timezone: 'UTC',
    workingHours: { start: '09:00', end: '18:00' },
    defaultBufferRatio: 0.1,
    routines,
    overridesForDate: [],
    overridesForPrevDate: [],
    calibration: null,
  });

  // 09:00-18:00 (540m) minus 09:00-14:00 (300m) = 240m raw - 24m buffer = 216m
  assert.equal(cap.breakdown.committedMinutes, 300);
  assert.equal(cap.breakdown.availableMinutes, 216);
});

test('3. One-day routine override alters only target date without mutating recurring template', () => {
  const routines = [
    makeRoutine({ id: 'r-class', activityName: 'Morning Lecture', startTime: '10:00', endTime: '12:00', activityType: 'college' }),
  ];
  const overridesToday: DailyRoutineOverrideDTO[] = [
    {
      id: 'ov-1',
      userId: 'user-a',
      date: '2026-11-18',
      routineId: 'r-class',
      action: 'disable',
      activityName: 'Morning Lecture',
      startTime: '10:00',
      endTime: '12:00',
      activityType: 'college',
      isFixed: true,
      isMovable: false,
      notes: 'Cancelled today',
    },
  ];

  const capToday = calculateDailyCapacity({
    localDate: '2026-11-18',
    timezone: 'UTC',
    workingHours: { start: '09:00', end: '18:00' },
    defaultBufferRatio: 0,
    routines,
    overridesForDate: overridesToday,
    overridesForPrevDate: [],
    calibration: null,
  });

  const capTomorrow = calculateDailyCapacity({
    localDate: '2026-11-19',
    timezone: 'UTC',
    workingHours: { start: '09:00', end: '18:00' },
    defaultBufferRatio: 0,
    routines,
    overridesForDate: [],
    overridesForPrevDate: overridesToday,
    calibration: null,
  });

  assert.equal(capToday.breakdown.committedMinutes, 0);
  assert.equal(capTomorrow.breakdown.committedMinutes, 120);
});

test('4. User who skips calibration gets unconfirmed flag but full scheduling still works', () => {
  const skippedCal: DailyCalibrationDTO = {
    userId: 'user-a',
    date: '2026-11-18',
    status: 'skipped',
    energyLevel: 'normal',
    availableCapacityChoice: 'full_free_time',
    customAvailableMinutes: null,
    availableWindows: [],
    routineChangesSummary: '',
    customCommitments: [],
    workloadPerception: 'manageable',
    priorityTaskIds: [],
    customPriorities: [],
    preferredSessionStyle: 'no_preference',
    preferredSessionMinutes: 50,
    preferredBreakMinutes: 10,
    unexpectedConstraintsText: '',
    extractedConstraints: [],
    calibrationCountToday: 1,
    lastUpdatedAt: '2026-11-18T08:00:00.000Z',
  };

  const plan = generateDailySchedule({
    userId: 'user-a',
    localDate: '2026-11-18',
    timezone: 'UTC',
    workingHours: { start: '09:00', end: '18:00' },
    defaultBreakMinutes: 10,
    defaultBufferRatio: 0.1,
    defaultSessionMinutes: 50,
    routines: [],
    overridesForDate: [],
    overridesForPrevDate: [],
    calibration: skippedCal,
    tasks: [makeTask({ id: 't1', recommendedMinutes: 50 })],
    profile: createInitialProfileDTO('user-a'),
    now: new Date('2026-11-18T08:00:00.000Z'),
  });

  assert.equal(plan.calibrationConfirmed, false);
  assert.ok(plan.blocks.some((b) => b.taskId === 't1'));
});

test('5. Recalibration preserves completed & active blocks and produces clear diff summary', () => {
  const profile = createInitialProfileDTO('user-a');
  const t1 = makeTask({ id: 't1', title: 'Morning API design', recommendedMinutes: 60 });
  const t2 = makeTask({ id: 't2', title: 'Afternoon docs', recommendedMinutes: 120, priority: 'medium' });

  const initial = generateDailySchedule({
    userId: 'user-a',
    localDate: '2026-11-18',
    timezone: 'UTC',
    workingHours: { start: '09:00', end: '17:00' },
    defaultBreakMinutes: 10,
    defaultBufferRatio: 0.1,
    defaultSessionMinutes: 60,
    routines: [],
    overridesForDate: [],
    overridesForPrevDate: [],
    calibration: null,
    tasks: [t1, t2],
    profile,
    now: new Date('2026-11-18T08:00:00.000Z'),
  });

  // Mark t1 block completed
  initial.blocks = initial.blocks.map((b) =>
    b.taskId === 't1' ? { ...b, status: 'completed' } : b
  );

  // Midday recalibration reduces capacity to 90 minutes
  const recalCal: DailyCalibrationDTO = {
    userId: 'user-a',
    date: '2026-11-18',
    status: 'completed',
    energyLevel: 'low_energy',
    availableCapacityChoice: 'custom',
    customAvailableMinutes: 90,
    availableWindows: [{ start: '13:00', end: '15:00' }],
    routineChangesSummary: 'Unexpected meeting',
    customCommitments: [],
    workloadPerception: 'heavy',
    priorityTaskIds: [],
    customPriorities: [],
    preferredSessionStyle: 'short_frequent_breaks',
    preferredSessionMinutes: 30,
    preferredBreakMinutes: 10,
    unexpectedConstraintsText: '',
    extractedConstraints: [],
    calibrationCountToday: 2,
    lastUpdatedAt: '2026-11-18T12:30:00.000Z',
  };

  const proposal = buildRecalibrationProposal({
    userId: 'user-a',
    localDate: '2026-11-18',
    timezone: 'UTC',
    workingHours: { start: '09:00', end: '17:00' },
    defaultBreakMinutes: 10,
    defaultBufferRatio: 0.1,
    defaultSessionMinutes: 50,
    routines: [],
    overridesForDate: [],
    overridesForPrevDate: [],
    calibration: recalCal,
    tasks: [{ ...t1, status: 'completed' }, t2],
    profile,
    existingPlan: initial,
    now: new Date('2026-11-18T12:30:00.000Z'),
  });

  assert.equal(proposal.preservedBlocks.length, 1);
  assert.equal(proposal.preservedBlocks[0].taskId, 't1');
  assert.ok(proposal.diffSummary.length > 0);
});

test('6. Low available capacity calibration caps active scheduling and increases buffer', () => {
  const cal: DailyCalibrationDTO = {
    userId: 'user-a',
    date: '2026-11-18',
    status: 'completed',
    energyLevel: 'low_energy',
    availableCapacityChoice: 'few_hours',
    customAvailableMinutes: null,
    availableWindows: [],
    routineChangesSummary: '',
    customCommitments: [],
    workloadPerception: 'overwhelming',
    priorityTaskIds: [],
    customPriorities: [],
    preferredSessionStyle: 'short_frequent_breaks',
    preferredSessionMinutes: 30,
    preferredBreakMinutes: 15,
    unexpectedConstraintsText: '',
    extractedConstraints: [],
    calibrationCountToday: 1,
    lastUpdatedAt: '2026-11-18T08:00:00.000Z',
  };

  const cap = calculateDailyCapacity({
    localDate: '2026-11-18',
    timezone: 'UTC',
    workingHours: { start: '09:00', end: '18:00' },
    defaultBufferRatio: 0.1,
    routines: [],
    overridesForDate: [],
    overridesForPrevDate: [],
    calibration: cal,
  });

  assert.ok(cap.effectiveBufferRatio >= 0.25);
  assert.ok(cap.breakdown.availableMinutes <= 180);
});

test('7. Conflicting deadlines are detected and surfaced clearly', () => {
  const now = new Date('2026-11-18T08:00:00.000Z');
  const tasks = [
    makeTask({
      id: 't1',
      title: 'Lab 1',
      priority: 'urgent',
      userEstimatedMinutes: 240,
      recommendedMinutes: 240,
      deadline: '2026-11-18T20:00:00.000Z',
    }),
    makeTask({
      id: 't2',
      title: 'Lab 2',
      priority: 'urgent',
      userEstimatedMinutes: 240,
      recommendedMinutes: 240,
      deadline: '2026-11-18T22:00:00.000Z',
    }),
  ];

  const plan = generateDailySchedule({
    userId: 'user-a',
    localDate: '2026-11-18',
    timezone: 'UTC',
    workingHours: { start: '09:00', end: '13:00' },
    defaultBreakMinutes: 10,
    defaultBufferRatio: 0.1,
    defaultSessionMinutes: 60,
    routines: [],
    overridesForDate: [],
    overridesForPrevDate: [],
    calibration: null,
    tasks,
    profile: createInitialProfileDTO('user-a'),
    now,
  });

  assert.ok(plan.conflicts.length >= 1);
  const risks = assessDeadlineRisks(
    tasks,
    createInitialProfileDTO('user-a'),
    plan.capacityBreakdown.availableMinutes,
    now
  );
  assert.ok(risks.some((r) => r.riskLevel === 'critical'));
});

test('8. Overlapping compatible background activity pairs safely without double-counting capacity', () => {
  const check = evaluateTaskOverlap(
    'attention_intensive',
    'background',
    [],
    ['attention_intensive'],
    true
  );
  assert.equal(check.allowed, true);

  const plan = generateDailySchedule({
    userId: 'user-a',
    localDate: '2026-11-18',
    timezone: 'UTC',
    workingHours: { start: '09:00', end: '11:00' },
    defaultBreakMinutes: 10,
    defaultBufferRatio: 0,
    defaultSessionMinutes: 60,
    routines: [],
    overridesForDate: [],
    overridesForPrevDate: [],
    calibration: null,
    tasks: [
      makeTask({
        id: 'focus-1',
        title: 'Write report',
        priority: 'high',
        recommendedMinutes: 60,
        attentionClass: 'attention_intensive',
      }),
      makeTask({
        id: 'bg-1',
        title: 'Render export video',
        category: 'background_job',
        priority: 'medium',
        recommendedMinutes: 45,
        attentionClass: 'background',
        overlapAllowedWith: ['attention_intensive'],
      }),
    ],
    profile: createInitialProfileDTO('user-a'),
    now: new Date('2026-11-18T08:00:00.000Z'),
  });

  const bgBlock = plan.blocks.find((b) => b.taskId === 'bg-1');
  assert.ok(bgBlock);
  assert.equal(bgBlock!.isOverlapping, true);
  // Active scheduled task minutes should NOT double-count the 45m background overlap
  assert.ok(plan.capacityBreakdown.scheduledTaskMinutes < 100);
});

test('9. Overlapping incompatible attention-intensive activities are rejected', () => {
  const check = evaluateTaskOverlap(
    'attention_intensive',
    'attention_intensive',
    [],
    [],
    true
  );
  assert.equal(check.allowed, false);
});

test('10. Insufficient capacity leaves remaining tasks unscheduled with clear alternatives', () => {
  const plan = generateDailySchedule({
    userId: 'user-a',
    localDate: '2026-11-18',
    timezone: 'UTC',
    workingHours: { start: '09:00', end: '11:00' },
    defaultBreakMinutes: 10,
    defaultBufferRatio: 0.1,
    defaultSessionMinutes: 50,
    routines: [],
    overridesForDate: [],
    overridesForPrevDate: [],
    calibration: null,
    tasks: [
      makeTask({
        id: 'big-1',
        title: 'Deep refactor',
        recommendedMinutes: 240,
        splittingPreference: 'continuous',
      }),
    ],
    profile: createInitialProfileDTO('user-a'),
    now: new Date('2026-11-18T08:00:00.000Z'),
  });

  assert.equal(plan.unscheduledTasks.length, 1);
  assert.ok(plan.unscheduledTasks[0].alternatives.includes('split_across_days'));
  assert.ok(plan.unscheduledTasks[0].alternatives.includes('waiting_list'));
});

test('11. Completing tasks updates Bayesian posterior & keeps population prior separate', () => {
  let profile = createInitialProfileDTO('user-a');
  const initialPrior = profile.populationPriors.defaultEffortMultiplier;

  // 1 observation -> no fabricated insight yet
  profile = applyTaskCompletionObservation(profile, {
    task: makeTask({ category: 'coding', userEstimatedMinutes: 60 }),
    actualMinutes: 90,
    completedAt: new Date('2026-11-18T12:00:00.000Z'),
    calibrationEnergy: 'low_energy',
  });
  assert.equal(generateEvidenceBackedInsights(profile).length, 0);

  // 2nd observation -> grounded insight emerges
  profile = applyTaskCompletionObservation(profile, {
    task: makeTask({ id: 't2', category: 'coding', userEstimatedMinutes: 60 }),
    actualMinutes: 90,
    completedAt: new Date('2026-11-18T15:00:00.000Z'),
  });

  assert.equal(profile.populationPriors.defaultEffortMultiplier, initialPrior);
  const codingPost = profile.categoryPosteriors.find((c) => c.category === 'coding');
  assert.ok(codingPost && codingPost.observationCount === 2);
  assert.ok(codingPost!.posteriorMeanMultiplier > 1.2);
  const insights = generateEvidenceBackedInsights(profile);
  assert.ok(insights.length >= 1);
});

test('12. Cross-midnight sleep and night-shift working hours resolve accurately across days', () => {
  const routines = [
    makeRoutine({
      id: 'r-night-sleep',
      activityName: 'Daytime Sleep',
      startTime: '06:00',
      endTime: '14:00',
      activityType: 'sleep',
    }),
    makeRoutine({
      id: 'r-midnight-break',
      activityName: 'Midnight Supper',
      startTime: '23:30',
      endTime: '00:30',
      activityType: 'meal',
    }),
  ];

  const cap = calculateDailyCapacity({
    localDate: '2026-11-18',
    timezone: 'UTC',
    workingHours: { start: '20:00', end: '04:00' },
    defaultBufferRatio: 0,
    routines,
    overridesForDate: [],
    overridesForPrevDate: [],
    calibration: null,
  });

  // Working 00:00-04:00 (240m) + 20:00-24:00 (240m) = 480m minus 00:00-00:30 (30m) & 23:30-24:00 (30m) = 420m
  assert.equal(cap.breakdown.availableMinutes, 420);
});

test('13. Different timezones resolve distinct local dates from the same UTC instant', () => {
  const instant = new Date('2026-11-19T02:30:00.000Z');
  const laDate = getLocalDateString('America/Los_Angeles', instant);
  const tokyoDate = getLocalDateString('Asia/Tokyo', instant);

  assert.equal(laDate, '2026-11-18');
  assert.equal(tokyoDate, '2026-11-19');
});

test('14. Two users maintain strictly separate routines, capacities, and daily plans', () => {
  const planUserA = generateDailySchedule({
    userId: 'user-a',
    localDate: '2026-11-18',
    timezone: 'America/New_York',
    workingHours: { start: '09:00', end: '12:00' },
    defaultBreakMinutes: 10,
    defaultBufferRatio: 0,
    defaultSessionMinutes: 60,
    routines: [makeRoutine({ userId: 'user-a', activityName: 'Gym', startTime: '09:00', endTime: '10:00', activityType: 'exercise' })],
    overridesForDate: [],
    overridesForPrevDate: [],
    calibration: null,
    tasks: [makeTask({ id: 'a1', userId: 'user-a', title: 'User A Task', recommendedMinutes: 60 })],
    profile: createInitialProfileDTO('user-a'),
    now: new Date('2026-11-18T12:00:00.000Z'),
  });

  const planUserB = generateDailySchedule({
    userId: 'user-b',
    localDate: '2026-11-18',
    timezone: 'Europe/London',
    workingHours: { start: '13:00', end: '18:00' },
    defaultBreakMinutes: 10,
    defaultBufferRatio: 0,
    defaultSessionMinutes: 60,
    routines: [],
    overridesForDate: [],
    overridesForPrevDate: [],
    calibration: null,
    tasks: [makeTask({ id: 'b1', userId: 'user-b', title: 'User B Task', recommendedMinutes: 90 })],
    profile: createInitialProfileDTO('user-b'),
    now: new Date('2026-11-18T08:00:00.000Z'),
  });

  assert.equal(planUserA.userId, 'user-a');
  assert.equal(planUserB.userId, 'user-b');
  assert.equal(planUserA.capacityBreakdown.availableMinutes, 120);
  assert.equal(planUserB.capacityBreakdown.availableMinutes, 300);
  assert.ok(planUserA.blocks.some((b) => b.taskId === 'a1'));
  assert.ok(!planUserA.blocks.some((b) => b.taskId === 'b1'));
  assert.ok(planUserB.blocks.some((b) => b.taskId === 'b1'));
});
