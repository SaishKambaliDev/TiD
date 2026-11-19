import type {
  DailyCalibrationDTO,
  DailyPlanDTO,
  DailyPlanRevisionDTO,
  DailyRoutineDTO,
  DailyRoutineOverrideDTO,
  DeadlineRiskAssessment,
  ExtractedConstraint,
  PersonalBehaviourProfileDTO,
  PersonalInsight,
  RecalibrationProposal,
  RecommendationItem,
  ResolvedRoutineBlock,
  TaskDTO,
  TaskEventDTO,
  UserProfileDTO,
  WorkSessionDTO,
} from '../shared/types';

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: Record<string, unknown>;
  constructor(
    message: string,
    status: number,
    code?: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const TOKEN_STORAGE_KEY = 'tid_auth_token';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
    else localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // ignore storage restriction
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getStoredToken();
  const res = await fetch(path, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
    ...options,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) {
      setStoredToken(null);
    }
    throw new ApiError(
      data.error || `Request failed (${res.status})`,
      res.status,
      data.code,
      data
    );
  }
  return data as T;
}

export const api = {
  health: () =>
    request<{
      status: string;
      database: { connected: boolean; readyState: number; error: string | null };
      groqConfigured: boolean;
    }>('/api/health'),

  register: (payload: {
    name: string;
    email: string;
    password: string;
    timezone: string;
  }) =>
    request<{ user: UserProfileDTO; token: string }>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  login: (payload: { email: string; password: string }) =>
    request<{ user: UserProfileDTO; token: string }>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  logout: () => request<{ ok: boolean }>('/api/v1/auth/logout', { method: 'POST' }),

  me: () => request<{ user: UserProfileDTO }>('/api/v1/auth/me'),

  updateSettings: (payload: Partial<UserProfileDTO>) =>
    request<{ user: UserProfileDTO }>('/api/v1/settings', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  getDashboard: () =>
    request<{
      localDate: string;
      timezone: string;
      calibration: DailyCalibrationDTO | null;
      progress: {
        completedToday: number;
        remainingOpen: number;
        focusMinutesToday: number;
        dailyProgressPercent: number;
      };
      todaysTasks: TaskDTO[];
      upcomingDeadlines: TaskDTO[];
      insights: PersonalInsight[];
      risks: DeadlineRiskAssessment[];
      recommendations: RecommendationItem[];
      activeSession: WorkSessionDTO | null;
      capacitySummary: {
        totalWakingMinutes: number;
        committedMinutes: number;
        availableMinutes: number;
        scheduledTaskMinutes: number;
        unallocatedMinutes: number;
        bufferMinutes: number;
      };
    }>('/api/v1/dashboard'),

  getTasks: () => request<{ tasks: TaskDTO[] }>('/api/v1/tasks'),

  understandTask: (description: string) =>
    request<{
      analysis: {
        title: string;
        category: TaskDTO['category'];
        priority: TaskDTO['priority'];
        deadlineISO: string | null;
        aiEstimatedMinutes: number;
        attentionClass: TaskDTO['attentionClass'];
        overlapAllowedWith: TaskDTO['overlapAllowedWith'];
        milestones: Array<{ title: string; estimatedMinutes: number }>;
        clarifyingQuestions: string[];
        executionCharacteristics: string[];
        suggestedDependencyTitles: string[];
        suggestedOverlapNote: string;
        summary: string;
        confidence: number;
      };
      bayesianRecommendedMinutes: number;
      matchedDependencies: Array<{ id: string; title: string }>;
      todayCapacity: {
        availableMinutes: number;
        committedMinutes: number;
      };
    }>('/api/v1/tasks/understand', {
      method: 'POST',
      body: JSON.stringify({ description }),
    }),

  createTask: (payload: Record<string, unknown>) =>
    request<{ task: TaskDTO }>('/api/v1/tasks', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateTask: (id: string, payload: Record<string, unknown>) =>
    request<{ task: TaskDTO }>(`/api/v1/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  deleteTask: (id: string) =>
    request<{ ok: boolean }>(`/api/v1/tasks/${id}`, { method: 'DELETE' }),

  getRoutines: () =>
    request<{ routines: DailyRoutineDTO[] }>('/api/v1/routines'),

  createRoutine: (payload: Record<string, unknown>) =>
    request<{ routine: DailyRoutineDTO }>('/api/v1/routines', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateRoutine: (id: string, payload: Record<string, unknown>) =>
    request<{ routine: DailyRoutineDTO }>(`/api/v1/routines/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  deleteRoutine: (id: string) =>
    request<{ ok: boolean }>(`/api/v1/routines/${id}`, { method: 'DELETE' }),

  saveRoutineOverride: (date: string, payload: Record<string, unknown>) =>
    request<{ override: DailyRoutineOverrideDTO }>(
      `/api/v1/routines/overrides/${date}`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      }
    ),

  deleteRoutineOverride: (date: string, overrideId: string) =>
    request<{ ok: boolean }>(
      `/api/v1/routines/overrides/${date}/${overrideId}`,
      { method: 'DELETE' }
    ),

  getCalibration: (date: string) =>
    request<{ calibration: DailyCalibrationDTO | null }>(
      `/api/v1/daily-calibration/${date}`
    ),

  extractCalibrationConstraints: (text: string, date: string) =>
    request<{ extractedConstraints: ExtractedConstraint[] }>(
      '/api/v1/daily-calibration/extract-constraints',
      {
        method: 'POST',
        body: JSON.stringify({ text, date }),
      }
    ),

  saveCalibration: (payload: Record<string, unknown>) =>
    request<{ calibration: DailyCalibrationDTO; groqWarning?: string }>(
      '/api/v1/daily-calibration',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),

  getPlanner: (date: string) =>
    request<{
      plan: DailyPlanDTO;
      calibration: DailyCalibrationDTO | null;
      resolvedRoutines: ResolvedRoutineBlock[];
      overrides: DailyRoutineOverrideDTO[];
      tasks: TaskDTO[];
    }>(`/api/v1/planner/${date}`),

  generatePlan: (date: string) =>
    request<{ plan: DailyPlanDTO }>(`/api/v1/planner/${date}/generate`, {
      method: 'POST',
    }),

  editPlannerBlock: (date: string, payload: Record<string, unknown>) =>
    request<{ plan: DailyPlanDTO }>(`/api/v1/planner/${date}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  recalibratePlan: (date: string, commit = false) =>
    request<{ plan?: DailyPlanDTO; proposal: RecalibrationProposal }>(
      `/api/v1/planner/${date}/recalibrate`,
      {
        method: 'POST',
        body: JSON.stringify({ commit }),
      }
    ),

  getPlanRevisions: (date: string) =>
    request<{ revisions: DailyPlanRevisionDTO[] }>(
      `/api/v1/planner/${date}/revisions`
    ),

  getSessions: () =>
    request<{ sessions: WorkSessionDTO[] }>('/api/v1/sessions'),

  startSession: (payload: {
    taskId: string;
    planBlockId?: string | null;
    pairedBackgroundTaskId?: string | null;
  }) =>
    request<{ session: WorkSessionDTO }>('/api/v1/sessions/start', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateSession: (id: string, payload: Record<string, unknown>) =>
    request<{ session: WorkSessionDTO }>(`/api/v1/sessions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  getInsights: () =>
    request<{
      insights: PersonalInsight[];
      risks: DeadlineRiskAssessment[];
      profile: PersonalBehaviourProfileDTO;
      revisions: DailyPlanRevisionDTO[];
      recentSessions: WorkSessionDTO[];
    }>('/api/v1/insights'),

  getRecommendations: () =>
    request<{
      recommendations: RecommendationItem[];
      risks: DeadlineRiskAssessment[];
    }>('/api/v1/recommendations'),

  applyRecommendation: (id: string, payload: Record<string, unknown>) =>
    request<{ ok: boolean }>(`/api/v1/recommendations/${id}/apply`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  dismissRecommendation: (id: string) =>
    request<{ ok: boolean }>(`/api/v1/recommendations/${id}/dismiss`, {
      method: 'POST',
    }),

  getBehaviour: () =>
    request<{
      profile: PersonalBehaviourProfileDTO;
      events: TaskEventDTO[];
    }>('/api/v1/behaviour'),
};
