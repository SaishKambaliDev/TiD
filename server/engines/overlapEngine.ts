import type { AttentionClass } from '../../src/shared/types.js';

export interface OverlapCheckResult {
  allowed: boolean;
  requiresConfirmation: boolean;
  efficiencyNote: string | null;
  reason: string;
}

export function evaluateTaskOverlap(
  primaryClass: AttentionClass,
  secondaryClass: AttentionClass,
  primaryAllowedWith: AttentionClass[] = [],
  secondaryAllowedWith: AttentionClass[] = [],
  userConfirmed = false
): OverlapCheckResult {
  // Two attention-intensive tasks cannot overlap safely
  if (
    primaryClass === 'attention_intensive' &&
    secondaryClass === 'attention_intensive'
  ) {
    return {
      allowed: false,
      requiresConfirmation: false,
      efficiencyNote: null,
      reason:
        'Two attention-intensive tasks (e.g. coding, writing, studying) cannot run simultaneously without severe cognitive switching loss.',
    };
  }

  // Background activity alongside anything is compatible when user confirms
  if (primaryClass === 'background' || secondaryClass === 'background') {
    const efficiencyNote =
      'Background activity does not require continuous active attention; overlapping calendar minutes are not counted as extra active work capacity.';
    return {
      allowed: true,
      requiresConfirmation: !userConfirmed,
      efficiencyNote,
      reason: 'Compatible background activity overlap.',
    };
  }

  // Partially attentive + attention_intensive or partially_attentive + partially_attentive
  const explicitMatch =
    primaryAllowedWith.includes(secondaryClass) ||
    secondaryAllowedWith.includes(primaryClass);

  if (explicitMatch && userConfirmed) {
    return {
      allowed: true,
      requiresConfirmation: false,
      efficiencyNote:
        'Combined partially attentive work may reduce comprehension or throughput by 20–35%.',
      reason: 'User-confirmed partially attentive overlap.',
    };
  }

  return {
    allowed: explicitMatch,
    requiresConfirmation: true,
    efficiencyNote:
      'Overlapping partially attentive work (e.g., meeting or lecture) with another active task can reduce retention and output quality.',
    reason: explicitMatch
      ? 'Requires explicit user confirmation before scheduling as an overlap.'
      : 'Incompatible by default: meetings or lectures should not silently overlap active focus work without explicit compatibility and confirmation.',
  };
}
