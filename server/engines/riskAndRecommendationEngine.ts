import type {
  DailyCalibrationDTO,
  DailyPlanDTO,
  DeadlineRiskAssessment,
  PersonalBehaviourProfileDTO,
  RecommendationItem,
  TaskDTO,
} from '../../src/shared/types.js';
import { predictEffortMinutes } from './bayesianEngine.js';

export function assessDeadlineRisks(
  tasks: TaskDTO[],
  profile: PersonalBehaviourProfileDTO,
  dailyAvailableMinutes: number,
  now = new Date()
): DeadlineRiskAssessment[] {
  const assessments: DeadlineRiskAssessment[] = [];

  for (const task of tasks) {
    if (task.status === 'completed' || !task.deadline) continue;
    const deadlineMs = new Date(task.deadline).getTime();
    const hoursUntil = (deadlineMs - now.getTime()) / 3_600_000;
    const baseEst =
      task.recommendedMinutes ||
      task.userEstimatedMinutes ||
      task.aiEstimatedMinutes ||
      45;
    const posteriorRequired = Math.max(
      10,
      predictEffortMinutes(baseEst, task.category, profile) - task.actualMinutes
    );

    const daysLeft = Math.max(0.25, hoursUntil / 24);
    const estAvailableBeforeDeadline = Math.max(
      0,
      Math.round(daysLeft * Math.max(60, dailyAvailableMinutes * 0.7))
    );
    const slackMinutes = estAvailableBeforeDeadline - posteriorRequired;

    let riskLevel: DeadlineRiskAssessment['riskLevel'] = 'low';
    let completionProbability = 0.92;

    if (hoursUntil <= 0) {
      riskLevel = 'critical';
      completionProbability = 0.12;
    } else if (slackMinutes < 0 || hoursUntil < posteriorRequired / 60) {
      riskLevel = 'critical';
      completionProbability = 0.28;
    } else if (slackMinutes < 90 || hoursUntil < 24) {
      riskLevel = 'high';
      completionProbability = 0.54;
    } else if (slackMinutes < 240) {
      riskLevel = 'moderate';
      completionProbability = 0.74;
    }

    assessments.push({
      taskId: task.id,
      title: task.title,
      deadline: task.deadline,
      riskLevel,
      completionProbability,
      requiredMinutesPosterior: posteriorRequired,
      availableMinutesBeforeDeadline: estAvailableBeforeDeadline,
      slackMinutes,
      explanation:
        hoursUntil <= 0
          ? 'Deadline has passed; reschedule or complete immediately.'
          : slackMinutes < 0
            ? `Needs ~${posteriorRequired}m (Bayesian estimate) vs ~${estAvailableBeforeDeadline}m realistic capacity before deadline.`
            : `${Math.round(slackMinutes)}m of capacity slack before deadline.`,
    });
  }

  return assessments.sort(
    (a, b) => a.completionProbability - b.completionProbability
  );
}

export function generateRecommendations(params: {
  tasks: TaskDTO[];
  plan: DailyPlanDTO | null;
  calibration: DailyCalibrationDTO | null;
  profile: PersonalBehaviourProfileDTO;
  risks: DeadlineRiskAssessment[];
}): RecommendationItem[] {
  const { tasks, plan, calibration, profile, risks } = params;
  const items: RecommendationItem[] = [];

  // 1. Critical or high deadline warnings
  for (const risk of risks) {
    if (risk.riskLevel === 'critical' || risk.riskLevel === 'high') {
      items.push({
        id: `rec-risk-${risk.taskId}`,
        taskId: risk.taskId,
        kind: 'deadline_warning',
        title: `Protect time for "${risk.title}"`,
        rationale: risk.explanation,
        evidenceSummary: `Completion probability estimated at ${Math.round(risk.completionProbability * 100)}%.`,
        actionLabel: 'Prioritize today',
        payload: { taskId: risk.taskId, priority: 'urgent' },
      });
    }
  }

  // 2. Suggest splitting long continuous tasks when energy is low or capacity fragmented
  for (const t of tasks) {
    if (t.status === 'completed') continue;
    const est = t.recommendedMinutes || t.userEstimatedMinutes || 45;
    if (
      est >= 120 &&
      t.splittingPreference === 'continuous' &&
      (calibration?.energyLevel === 'low_energy' ||
        calibration?.energyLevel === 'a_little_tired')
    ) {
      items.push({
        id: `rec-split-${t.id}`,
        taskId: t.id,
        kind: 'split_task',
        title: `Split "${t.title}" into focused sessions`,
        rationale:
          'You reported lower energy today; breaking a 2h+ continuous block into shorter 35m sessions improves completion consistency.',
        evidenceSummary: `Task estimate ${est}m vs today's low-energy calibration.`,
        actionLabel: 'Allow shorter sessions',
        payload: { taskId: t.id, splittingPreference: 'shorter_sessions' },
      });
    }
  }

  // 3. Compatible background overlap opportunities
  const bgTasks = tasks.filter(
    (t) => t.status !== 'completed' && t.attentionClass === 'background'
  );
  const focusTasks = tasks.filter(
    (t) => t.status !== 'completed' && t.attentionClass === 'attention_intensive'
  );
  if (bgTasks.length > 0 && focusTasks.length > 0) {
    items.push({
      id: `rec-overlap-${bgTasks[0].id}`,
      taskId: bgTasks[0].id,
      kind: 'compatible_overlap',
      title: `Run "${bgTasks[0].title}" alongside "${focusTasks[0].title}"`,
      rationale:
        'Background activities require zero active focus and can safely run during your attention-intensive work block.',
      evidenceSummary: 'Attention class: background + attention_intensive.',
      actionLabel: 'Open Planner to pair',
      payload: {
        backgroundTaskId: bgTasks[0].id,
        hostTaskId: focusTasks[0].id,
      },
    });
  }

  // 4. Unscheduled tasks on active plan -> suggest Planner review
  if (plan && plan.unscheduledTasks.length > 0) {
    items.push({
      id: 'rec-unscheduled-review',
      kind: 'move_to_planner',
      title: `Resolve ${plan.unscheduledTasks.length} unscheduled task(s)`,
      rationale:
        'Your current capacity cannot fit every queued item cleanly. Deferring optional work or splitting across days keeps today realistic.',
      evidenceSummary: `${plan.capacityBreakdown.availableMinutes}m available vs ${plan.unscheduledTasks.reduce((a, b) => a + b.remainingUnscheduledMinutes, 0)}m unscheduled.`,
      actionLabel: 'Review in Planner',
      payload: { route: '/planner' },
    });
  }

  // 5. Bayesian buffer recommendation when category overrun observed >= 2 times
  for (const cat of profile.categoryPosteriors) {
    if (cat.observationCount >= 2 && cat.posteriorMeanMultiplier >= 1.25) {
      const matchingTask = tasks.find(
        (t) => t.status !== 'completed' && t.category === cat.category
      );
      if (matchingTask) {
        const suggested = predictEffortMinutes(
          matchingTask.userEstimatedMinutes ??
            matchingTask.recommendedMinutes,
          cat.category,
          profile
        );
        if (suggested > matchingTask.recommendedMinutes + 10) {
          items.push({
            id: `rec-buffer-${matchingTask.id}`,
            taskId: matchingTask.id,
            kind: 'buffer_adjust',
            title: `Add realistic buffer to "${matchingTask.title}"`,
            rationale: `Based on ${cat.observationCount} completed ${cat.category} tasks, your actual duration averages ${cat.posteriorMeanMultiplier}x initial estimates.`,
            evidenceSummary: `Bayesian posterior multiplier ${cat.posteriorMeanMultiplier}x (uncertainty ${cat.uncertaintyScore}).`,
            actionLabel: `Adjust plan to ${suggested}m`,
            payload: {
              taskId: matchingTask.id,
              recommendedMinutes: suggested,
            },
          });
        }
      }
    }
  }

  return items;
}
