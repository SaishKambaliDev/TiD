import type {
  CategoryPosterior,
  EnergyLevel,
  PersonalBehaviourProfileDTO,
  PersonalInsight,
  TaskCategory,
  TaskDTO,
} from '../../src/shared/types.js';

export const DEFAULT_POPULATION_PRIORS = {
  defaultEffortMultiplier: 1.15,
  priorStrength: 4,
  baselinePostponementRate: 0.22,
  baselineOnTimeRate: 0.78,
};

export function createInitialProfileDTO(
  userId: string
): PersonalBehaviourProfileDTO {
  return {
    userId,
    populationPriors: { ...DEFAULT_POPULATION_PRIORS },
    categoryPosteriors: [],
    calibrationCorrelations: [],
    initiationBehaviour: {
      avgHoursBeforeDeadlineStarted: 24,
      observationCount: 0,
    },
    workloadTolerance: {
      optimalDailyActiveMinutes: 240,
      maxObservedSustainableMinutes: 360,
      overloadEventCount: 0,
      observationCount: 0,
    },
    deadlineSensitivity: {
      onTimeCount: 0,
      lateCount: 0,
      lastMinuteRushRate: 0,
    },
    taskSwitchingCount: 0,
    recommendationAcceptedCount: 0,
    recommendationDismissedCount: 0,
    updatedAt: new Date().toISOString(),
  };
}

export function getCategoryPosterior(
  profile: PersonalBehaviourProfileDTO,
  category: TaskCategory
): CategoryPosterior {
  const existing = profile.categoryPosteriors.find(
    (c) => c.category === category
  );
  if (existing) return existing;

  return {
    category,
    observationCount: 0,
    alpha: profile.populationPriors.priorStrength,
    beta:
      profile.populationPriors.priorStrength *
      profile.populationPriors.defaultEffortMultiplier,
    posteriorMeanMultiplier: profile.populationPriors.defaultEffortMultiplier,
    posteriorVariance: 0.16,
    uncertaintyScore: 1,
    avgInitiationDelayMinutes: 0,
    postponementCount: 0,
    completionCount: 0,
  };
}

/**
 * Predicts realistic task duration by blending baseline estimate with personal Bayesian category posterior,
 * keeping user/AI estimates untouched.
 */
export function predictEffortMinutes(
  baselineEstimate: number,
  category: TaskCategory,
  profile: PersonalBehaviourProfileDTO
): number {
  const posterior = getCategoryPosterior(profile, category);
  // Blend between population prior and personal posterior based on observation count
  const personalWeight =
    posterior.observationCount /
    (posterior.observationCount + profile.populationPriors.priorStrength);
  const effectiveMultiplier =
    personalWeight * posterior.posteriorMeanMultiplier +
    (1 - personalWeight) * profile.populationPriors.defaultEffortMultiplier;

  return Math.max(10, Math.round((baselineEstimate * effectiveMultiplier) / 5) * 5);
}

/**
 * Updates personal Bayesian posterior ONLY from actual observed task completion events.
 * Does NOT convert self-reported low energy into permanent effort traits.
 */
export function applyTaskCompletionObservation(
  profile: PersonalBehaviourProfileDTO,
  params: {
    task: TaskDTO;
    actualMinutes: number;
    completedAt: Date;
    calibrationEnergy?: EnergyLevel | null;
  }
): PersonalBehaviourProfileDTO {
  const { task, actualMinutes, completedAt, calibrationEnergy } = params;
  const baseline =
    task.userEstimatedMinutes ??
    task.aiEstimatedMinutes ??
    task.recommendedMinutes ??
    45;
  const clampedRatio = Math.min(
    3.0,
    Math.max(0.35, actualMinutes / Math.max(5, baseline))
  );

  const next: PersonalBehaviourProfileDTO = {
    ...profile,
    categoryPosteriors: profile.categoryPosteriors.map((c) => ({ ...c })),
    calibrationCorrelations: profile.calibrationCorrelations.map((c) => ({
      ...c,
    })),
    deadlineSensitivity: { ...profile.deadlineSensitivity },
    workloadTolerance: { ...profile.workloadTolerance },
    initiationBehaviour: { ...profile.initiationBehaviour },
    updatedAt: new Date().toISOString(),
  };

  let cat = next.categoryPosteriors.find((c) => c.category === task.category);
  if (!cat) {
    cat = getCategoryPosterior(next, task.category);
    next.categoryPosteriors.push(cat);
  }

  const prevN = cat.observationCount;
  const newN = prevN + 1;
  const priorStrength = next.populationPriors.priorStrength;
  const priorMean = next.populationPriors.defaultEffortMultiplier;

  // Conjugate Normal-like mean update with prior pseudocounts
  const totalWeightedSum =
    priorStrength * priorMean + prevN * cat.posteriorMeanMultiplier + clampedRatio;
  // Wait: avoid double-counting prior! Extract observed sum from prevMean:
  const prevObservedMean =
    prevN === 0
      ? 0
      : (cat.posteriorMeanMultiplier * (priorStrength + prevN) -
          priorStrength * priorMean) /
        prevN;
  const newObservedSum = prevObservedMean * prevN + clampedRatio;
  const updatedPosteriorMean = Number(
    ((priorStrength * priorMean + newObservedSum) / (priorStrength + newN)).toFixed(
      3
    )
  );

  const delta = clampedRatio - cat.posteriorMeanMultiplier;
  const updatedVariance = Number(
    Math.max(
      0.015,
      (cat.posteriorVariance * (priorStrength + prevN) + delta * delta * 0.5) /
        (priorStrength + newN)
    ).toFixed(4)
  );

  cat.observationCount = newN;
  cat.completionCount += 1;
  cat.alpha = priorStrength + newN;
  cat.beta = Number((cat.alpha * updatedPosteriorMean).toFixed(3));
  cat.posteriorMeanMultiplier = updatedPosteriorMean;
  cat.posteriorVariance = updatedVariance;
  cat.uncertaintyScore = Number((1 / Math.sqrt(1 + newN)).toFixed(3));

  // Deadline sensitivity update
  if (task.deadline) {
    const deadlineMs = new Date(task.deadline).getTime();
    if (completedAt.getTime() <= deadlineMs) {
      next.deadlineSensitivity.onTimeCount += 1;
    } else {
      next.deadlineSensitivity.lateCount += 1;
    }
    const hoursRemaining = (deadlineMs - completedAt.getTime()) / 3_600_000;
    const totalDL =
      next.deadlineSensitivity.onTimeCount + next.deadlineSensitivity.lateCount;
    if (hoursRemaining >= 0 && hoursRemaining < 4) {
      next.deadlineSensitivity.lastMinuteRushRate = Number(
        (
          (next.deadlineSensitivity.lastMinuteRushRate * (totalDL - 1) + 1) /
          totalDL
        ).toFixed(3)
      );
    } else {
      next.deadlineSensitivity.lastMinuteRushRate = Number(
        (
          (next.deadlineSensitivity.lastMinuteRushRate * (totalDL - 1)) /
          totalDL
        ).toFixed(3)
      );
    }
  }

  // Track temporary calibration correlation separately without polluting permanent effort traits
  if (calibrationEnergy) {
    let corr = next.calibrationCorrelations.find(
      (c) => c.energyLevel === calibrationEnergy
    );
    if (!corr) {
      corr = {
        energyLevel: calibrationEnergy,
        observationCount: 0,
        avgActualVsEstRatio: 1,
        completionRate: 1,
      };
      next.calibrationCorrelations.push(corr);
    }
    const cN = corr.observationCount;
    corr.avgActualVsEstRatio = Number(
      ((corr.avgActualVsEstRatio * cN + clampedRatio) / (cN + 1)).toFixed(3)
    );
    corr.observationCount = cN + 1;
  }

  return next;
}

export function applyPostponementObservation(
  profile: PersonalBehaviourProfileDTO,
  category: TaskCategory
): PersonalBehaviourProfileDTO {
  const next: PersonalBehaviourProfileDTO = {
    ...profile,
    categoryPosteriors: profile.categoryPosteriors.map((c) => ({ ...c })),
    updatedAt: new Date().toISOString(),
  };
  let cat = next.categoryPosteriors.find((c) => c.category === category);
  if (!cat) {
    cat = getCategoryPosterior(next, category);
    next.categoryPosteriors.push(cat);
  }
  cat.postponementCount += 1;
  return next;
}

/**
 * Generates evidence-backed insights ONLY from real user observations (never fabricated).
 */
export function generateEvidenceBackedInsights(
  profile: PersonalBehaviourProfileDTO
): PersonalInsight[] {
  const insights: PersonalInsight[] = [];

  for (const cat of profile.categoryPosteriors) {
    if (cat.observationCount < 2) continue;

    const uncertaintyLabel: PersonalInsight['uncertaintyLabel'] =
      cat.observationCount >= 6
        ? 'Low uncertainty'
        : cat.observationCount >= 3
          ? 'Moderate uncertainty'
          : 'Early signal';

    const pctDiff = Math.round((cat.posteriorMeanMultiplier - 1) * 100);
    if (pctDiff >= 12) {
      insights.push({
        id: `effort-overrun-${cat.category}`,
        category: cat.category,
        title: `${formatCategoryName(cat.category)} effort buffer`,
        statement: `You usually need about ${pctDiff}% more time for ${formatCategoryName(cat.category).toLowerCase()} tasks.`,
        observationCount: cat.observationCount,
        uncertaintyLabel,
        tone: 'lavender',
      });
    } else if (pctDiff <= -10) {
      insights.push({
        id: `effort-fast-${cat.category}`,
        category: cat.category,
        title: `${formatCategoryName(cat.category)} pace`,
        statement: `You tend to finish ${formatCategoryName(cat.category).toLowerCase()} tasks ${Math.abs(pctDiff)}% faster than initial estimates.`,
        observationCount: cat.observationCount,
        uncertaintyLabel,
        tone: 'sage',
      });
    } else {
      insights.push({
        id: `effort-calibrated-${cat.category}`,
        category: cat.category,
        title: `${formatCategoryName(cat.category)} estimation accuracy`,
        statement: `Your estimates for ${formatCategoryName(cat.category).toLowerCase()} tasks closely match your actual pace.`,
        observationCount: cat.observationCount,
        uncertaintyLabel,
        tone: 'sky',
      });
    }

    if (cat.postponementCount >= 2) {
      insights.push({
        id: `postpone-${cat.category}`,
        category: cat.category,
        title: `${formatCategoryName(cat.category)} initiation friction`,
        statement: `${formatCategoryName(cat.category)} tasks were postponed ${cat.postponementCount} times—shorter starter blocks may help.`,
        observationCount: cat.observationCount + cat.postponementCount,
        uncertaintyLabel,
        tone: 'peach',
      });
    }
  }

  const totalDL =
    profile.deadlineSensitivity.onTimeCount +
    profile.deadlineSensitivity.lateCount;
  if (totalDL >= 3 && profile.deadlineSensitivity.onTimeCount / totalDL >= 0.8) {
    insights.push({
      id: 'deadline-consistency',
      title: 'Reliable deadline pacing',
      statement: `${profile.deadlineSensitivity.onTimeCount} of ${totalDL} deadline tasks were completed on schedule.`,
      observationCount: totalDL,
      uncertaintyLabel: totalDL >= 6 ? 'Low uncertainty' : 'Moderate uncertainty',
      tone: 'sage',
    });
  }

  return insights.slice(0, 6);
}

function formatCategoryName(category: TaskCategory): string {
  return category.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}
