import type {
  CapacityBreakdown,
  DailyCalibrationDTO,
  DailyRoutineDTO,
  DailyRoutineOverrideDTO,
  ResolvedRoutineBlock,
  TimeWindow,
} from '../../src/shared/types.js';
import {
  expandWindowForDay,
  formatMinutesToHHMM,
  getIsoWeekday,
  getPreviousDateString,
  intersectIntervals,
  mergeIntervals,
  parseHHMM,
  subtractIntervals,
  sumIntervalMinutes,
  type MinuteInterval,
} from './timeUtils.js';

export interface CapacityCalculationInput {
  localDate: string;
  timezone: string;
  workingHours: TimeWindow;
  defaultBufferRatio: number;
  routines: DailyRoutineDTO[];
  overridesForDate: DailyRoutineOverrideDTO[];
  overridesForPrevDate: DailyRoutineOverrideDTO[];
  calibration: DailyCalibrationDTO | null;
  scheduledActiveTaskMinutes?: number;
}

export interface CapacityCalculationResult {
  resolvedRoutines: ResolvedRoutineBlock[];
  workableIntervals: MinuteInterval[];
  sleepIntervals: MinuteInterval[];
  breakdown: CapacityBreakdown;
  effectiveBufferRatio: number;
}

function resolveRoutinesForSingleDay(
  targetDate: string,
  timezone: string,
  routines: DailyRoutineDTO[],
  overrides: DailyRoutineOverrideDTO[],
  belongsTo: 'today' | 'yesterday_spillover'
): ResolvedRoutineBlock[] {
  const weekday = getIsoWeekday(targetDate, timezone);
  const disabledIds = new Set(
    overrides
      .filter((o) => o.action === 'disable' && o.routineId)
      .map((o) => o.routineId!)
  );
  const modifyMap = new Map(
    overrides
      .filter((o) => o.action === 'modify' && o.routineId)
      .map((o) => [o.routineId!, o])
  );

  const blocks: ResolvedRoutineBlock[] = [];

  for (const routine of routines) {
    if (!routine.isActive) continue;
    if (!routine.daysOfWeek.includes(weekday)) continue;
    if (disabledIds.has(routine.id)) continue;

    const mod = modifyMap.get(routine.id);
    const name = mod ? mod.activityName : routine.activityName;
    const startTime = mod ? mod.startTime : routine.startTime;
    const endTime = mod ? mod.endTime : routine.endTime;
    const activityType = mod ? mod.activityType : routine.activityType;
    const isFixed = mod ? mod.isFixed : routine.isFixed;
    const isMovable = mod ? mod.isMovable : routine.isMovable;
    const notes = mod ? mod.notes : routine.notes;

    const interval = expandWindowForDay(startTime, endTime, belongsTo);
    if (!interval) continue;

    blocks.push({
      sourceId: mod ? mod.id : routine.id,
      sourceKind: mod ? 'override' : 'routine',
      activityName: name,
      startMinute: interval.start,
      endMinute: interval.end,
      startTime: formatMinutesToHHMM(interval.start),
      endTime: formatMinutesToHHMM(interval.end),
      activityType,
      isFixed,
      isMovable,
      crossesMidnight: parseHHMM(startTime) > parseHHMM(endTime),
      notes,
    });
  }

  for (const ov of overrides) {
    if (ov.action !== 'add') continue;
    const interval = expandWindowForDay(ov.startTime, ov.endTime, belongsTo);
    if (!interval) continue;
    blocks.push({
      sourceId: ov.id,
      sourceKind: 'override',
      activityName: ov.activityName,
      startMinute: interval.start,
      endMinute: interval.end,
      startTime: formatMinutesToHHMM(interval.start),
      endTime: formatMinutesToHHMM(interval.end),
      activityType: ov.activityType,
      isFixed: ov.isFixed,
      isMovable: ov.isMovable,
      crossesMidnight: parseHHMM(ov.startTime) > parseHHMM(ov.endTime),
      notes: ov.notes,
    });
  }

  return blocks;
}

export function calculateDailyCapacity(
  input: CapacityCalculationInput
): CapacityCalculationResult {
  const prevDate = getPreviousDateString(input.localDate);

  const todayBlocks = resolveRoutinesForSingleDay(
    input.localDate,
    input.timezone,
    input.routines,
    input.overridesForDate,
    'today'
  );
  const spilloverBlocks = resolveRoutinesForSingleDay(
    prevDate,
    input.timezone,
    input.routines,
    input.overridesForPrevDate,
    'yesterday_spillover'
  );

  const resolvedRoutines: ResolvedRoutineBlock[] = [
    ...spilloverBlocks,
    ...todayBlocks,
  ];

  // Add calibration custom commitments & Groq-extracted unavailable windows
  if (input.calibration && input.calibration.status === 'completed') {
    for (const c of input.calibration.customCommitments ?? []) {
      const interval = expandWindowForDay(c.startTime, c.endTime, 'today');
      if (interval) {
        resolvedRoutines.push({
          sourceId: c.id,
          sourceKind: 'calibration_commitment',
          activityName: c.title,
          startMinute: interval.start,
          endMinute: interval.end,
          startTime: formatMinutesToHHMM(interval.start),
          endTime: formatMinutesToHHMM(interval.end),
          activityType: 'commitment',
          isFixed: c.isFixed,
          isMovable: !c.isFixed,
          crossesMidnight: false,
          notes: 'Added during daily calibration',
        });
      }
    }

    for (let idx = 0; idx < (input.calibration.extractedConstraints ?? []).length; idx++) {
      const ec = input.calibration.extractedConstraints[idx];
      if (
        (ec.type === 'unavailable_window' ||
          ec.type === 'commitment' ||
          ec.type === 'rest' ||
          ec.type === 'leave_early') &&
        ec.startTime &&
        ec.endTime
      ) {
        const interval = expandWindowForDay(ec.startTime, ec.endTime, 'today');
        if (interval) {
          resolvedRoutines.push({
            sourceId: `cal-constraint-${idx}`,
            sourceKind: 'calibration_commitment',
            activityName: ec.description,
            startMinute: interval.start,
            endMinute: interval.end,
            startTime: formatMinutesToHHMM(interval.start),
            endTime: formatMinutesToHHMM(interval.end),
            activityType: 'commitment',
            isFixed: true,
            isMovable: false,
            crossesMidnight: false,
            notes: ec.effect,
          });
        }
      }
    }
  }

  resolvedRoutines.sort((a, b) => a.startMinute - b.startMinute);

  // Determine sleep intervals (if none configured, default physiological rest 00:00-07:00 and 23:00-24:00 unless workingHours covers it)
  const configuredSleep = resolvedRoutines
    .filter((b) => b.activityType === 'sleep')
    .map((b) => ({ start: b.startMinute, end: b.endMinute }));

  // Build working hours intervals (supports cross-midnight workingHours like 20:00->04:00)
  const workToday = expandWindowForDay(
    input.workingHours.start,
    input.workingHours.end,
    'today'
  );
  const workSpill = expandWindowForDay(
    input.workingHours.start,
    input.workingHours.end,
    'yesterday_spillover'
  );
  let baseWorkingIntervals: MinuteInterval[] = [
    ...(workSpill ? [workSpill] : []),
    ...(workToday ? [workToday] : []),
  ];
  if (baseWorkingIntervals.length === 0) {
    baseWorkingIntervals = [{ start: 9 * 60, end: 18 * 60 }];
  }

  let sleepIntervals: MinuteInterval[];
  if (configuredSleep.length > 0) {
    sleepIntervals = mergeIntervals(configuredSleep);
  } else {
    // Default sleep outside working hours (00:00-07:00 and 23:00-24:00 minus working hours)
    sleepIntervals = subtractIntervals(
      [
        { start: 0, end: 7 * 60 },
        { start: 23 * 60, end: 24 * 60 },
      ],
      baseWorkingIntervals
    );
  }

  const wakingIntervals = subtractIntervals(
    [{ start: 0, end: 1440 }],
    sleepIntervals
  );
  const totalWakingMinutes = sumIntervalMinutes(wakingIntervals);

  // If user specified custom available windows in DailyCalibration, intersect with waking hours
  if (
    input.calibration?.status === 'completed' &&
    input.calibration.availableWindows &&
    input.calibration.availableWindows.length > 0
  ) {
    const customWins: MinuteInterval[] = [];
    for (const w of input.calibration.availableWindows) {
      const segA = expandWindowForDay(w.start, w.end, 'today');
      const segB = expandWindowForDay(w.start, w.end, 'yesterday_spillover');
      if (segA) customWins.push(segA);
      if (segB) customWins.push(segB);
    }
    if (customWins.length > 0) {
      baseWorkingIntervals = intersectIntervals(wakingIntervals, customWins);
    }
  } else {
    baseWorkingIntervals = intersectIntervals(
      wakingIntervals,
      baseWorkingIntervals
    );
  }

  // Non-sleep commitments / routines block workable windows
  const nonSleepRoutines = resolvedRoutines
    .filter((b) => b.activityType !== 'sleep')
    .map((b) => ({ start: b.startMinute, end: b.endMinute }));

  // Committed minutes = non-sleep commitments inside waking hours
  const committedMinutes = sumIntervalMinutes(
    intersectIntervals(wakingIntervals, nonSleepRoutines)
  );

  // Subtract routines/commitments from working hours
  const workableIntervals = subtractIntervals(
    baseWorkingIntervals,
    nonSleepRoutines
  );
  const rawFreeMinutes = sumIntervalMinutes(workableIntervals);

  // Adjust buffer ratio based on calibration energy & workload
  let effectiveBufferRatio = input.defaultBufferRatio;
  if (input.calibration?.status === 'completed') {
    if (input.calibration.energyLevel === 'low_energy') {
      effectiveBufferRatio = Math.max(effectiveBufferRatio, 0.25);
    } else if (input.calibration.energyLevel === 'a_little_tired') {
      effectiveBufferRatio = Math.max(effectiveBufferRatio, 0.18);
    }
    if (input.calibration.workloadPerception === 'overwhelming') {
      effectiveBufferRatio = Math.max(effectiveBufferRatio, 0.22);
    }
  }

  let bufferMinutes = Math.round(rawFreeMinutes * effectiveBufferRatio);
  let availableMinutes = Math.max(0, rawFreeMinutes - bufferMinutes);

  // Apply realistic capacity cap from calibration choice when no exact windows were given
  if (input.calibration?.status === 'completed') {
    if (
      input.calibration.availableCapacityChoice === 'custom' &&
      typeof input.calibration.customAvailableMinutes === 'number'
    ) {
      availableMinutes = Math.min(
        availableMinutes,
        Math.max(0, input.calibration.customAvailableMinutes)
      );
      bufferMinutes = Math.max(0, rawFreeMinutes - availableMinutes);
    } else if (
      (!input.calibration.availableWindows ||
        input.calibration.availableWindows.length === 0) &&
      input.calibration.availableCapacityChoice !== 'full_free_time'
    ) {
      const capFactorMap: Record<string, number> = {
        less_than_usual: 0.72,
        few_hours: 0.5,
        unusually_busy: 0.35,
      };
      const factor =
        capFactorMap[input.calibration.availableCapacityChoice] ?? 1;
      const capped =
        input.calibration.availableCapacityChoice === 'few_hours'
          ? Math.min(availableMinutes, 180)
          : input.calibration.availableCapacityChoice === 'unusually_busy'
            ? Math.min(availableMinutes, 120)
            : Math.round(availableMinutes * factor);
      availableMinutes = Math.max(0, capped);
    }
  }

  const scheduledTaskMinutes = Math.max(0, input.scheduledActiveTaskMinutes ?? 0);
  const unallocatedMinutes = Math.max(0, availableMinutes - scheduledTaskMinutes);

  return {
    resolvedRoutines,
    workableIntervals,
    sleepIntervals,
    effectiveBufferRatio,
    breakdown: {
      totalWakingMinutes,
      committedMinutes,
      availableMinutes,
      scheduledTaskMinutes,
      unallocatedMinutes,
      bufferMinutes,
    },
  };
}
