import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CalendarClock,
  Check,
  CheckCircle2,
  Circle,
  Edit3,
  LayoutGrid,
  List,
  Play,
  Sparkles,
} from 'lucide-react';
import { AddTaskModal } from '../components/AddTaskModal';
import { DailyCalibrationModal } from '../components/DailyCalibrationModal';
import { Layout } from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { api, ApiError } from '../lib/api';
import {
  formatAttentionLabel,
  formatCategoryLabel,
  formatDurationMinutes,
  formatShortDeadline,
  getCategoryPastelTheme,
  getTodayLocalDate,
} from '../lib/format';
import type {
  DailyCalibrationDTO,
  DeadlineRiskAssessment,
  PersonalInsight,
  RecommendationItem,
  TaskDTO,
  WorkSessionDTO,
} from '../shared/types';

const NOTE_ROTATIONS = [-1.4, 1.1, -0.8, 1.3, -1.1, 0.7];

export function DashboardPage() {
  const { user } = useAuth();
  const { theme: appTheme } = useTheme();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'sticky' | 'list'>('sticky');
  const [localDate, setLocalDate] = useState(
    getTodayLocalDate(user?.timezone || 'UTC')
  );
  const [calibration, setCalibration] = useState<DailyCalibrationDTO | null>(
    null
  );
  const [progress, setProgress] = useState({
    completedToday: 0,
    remainingOpen: 0,
    focusMinutesToday: 0,
    dailyProgressPercent: 0,
  });
  const [todaysTasks, setTodaysTasks] = useState<TaskDTO[]>([]);
  const [allTasks, setAllTasks] = useState<TaskDTO[]>([]);
  const [upcomingDeadlines, setUpcomingDeadlines] = useState<TaskDTO[]>([]);
  const [insights, setInsights] = useState<PersonalInsight[]>([]);
  const [risks, setRisks] = useState<DeadlineRiskAssessment[]>([]);
  const [recommendations, setRecommendations] = useState<RecommendationItem[]>(
    []
  );
  const [activeSession, setActiveSession] = useState<WorkSessionDTO | null>(
    null
  );

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskDTO | null>(null);
  const [detailTask, setDetailTask] = useState<TaskDTO | null>(null);
  const [calibrationOpen, setCalibrationOpen] = useState(false);
  const [calibrationCheckedOnce, setCalibrationCheckedOnce] = useState(false);

  const loadDashboard = useCallback(async () => {
    setError(null);
    try {
      const [dash, tasksRes] = await Promise.all([
        api.getDashboard(),
        api.getTasks(),
      ]);
      setLocalDate(dash.localDate);
      setCalibration(dash.calibration);
      setProgress(dash.progress);
      setTodaysTasks(dash.todaysTasks);
      setAllTasks(tasksRes.tasks);
      setUpcomingDeadlines(dash.upcomingDeadlines);
      setInsights(dash.insights);
      setRisks(dash.risks);
      setRecommendations(dash.recommendations);
      setActiveSession(dash.activeSession);

      if (!calibrationCheckedOnce && !dash.calibration) {
        setCalibrationCheckedOnce(true);
        setCalibrationOpen(true);
      } else {
        setCalibrationCheckedOnce(true);
      }
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Unable to load dashboard.'
      );
    } finally {
      setLoading(false);
    }
  }, [calibrationCheckedOnce]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const handleToggleComplete = async (task: TaskDTO) => {
    const nextStatus = task.status === 'completed' ? 'todo' : 'completed';
    await api.updateTask(task.id, { status: nextStatus });
    loadDashboard();
  };

  const handleStartFocus = async (task: TaskDTO) => {
    await api.startSession({ taskId: task.id });
    navigate('/focus');
  };

  const filteredTasks = todaysTasks.filter((t) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      t.title.toLowerCase().includes(q) ||
      t.category.toLowerCase().includes(q) ||
      t.priority.toLowerCase().includes(q)
    );
  });

  const calibrationUnconfirmed =
    !calibration || calibration.status !== 'completed';

  const totalPips = Math.max(
    4,
    Math.min(12, progress.completedToday + progress.remainingOpen)
  );
  const focusMeterPct = Math.min(
    100,
    Math.round((progress.focusMinutesToday / 240) * 100)
  );
  const remainingMeterPct =
    progress.completedToday + progress.remainingOpen > 0
      ? Math.round(
          (progress.remainingOpen /
            (progress.completedToday + progress.remainingOpen)) *
            100
        )
      : 0;

  return (
    <Layout
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      onOpenAddTask={() => {
        setEditingTask(null);
        setAddModalOpen(true);
      }}
      onOpenCalibration={() => setCalibrationOpen(true)}
      calibrationUnconfirmed={calibrationUnconfirmed}
      notifications={risks}
    >
      {error && (
        <div className="mb-5 p-4 rounded-2xl bg-[#FFF1F0] border border-[#F6D5D2] text-[#9B3A3A] text-sm font-medium">
          {error}
        </div>
      )}

      {/* Non-blocking daily calibration banner */}
      {calibrationUnconfirmed && !loading && (
        <div className="mb-5 p-4 q-card flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-[#394152]">
              ☀️ Today’s context has not been confirmed yet
            </div>
            <div className="text-xs text-[#6B6450] mt-0.5">
              {calibration?.status === 'skipped'
                ? 'You skipped calibration—using recurring routines and historical priors.'
                : 'A quick 30-second check-in aligns your schedule with today’s energy and hours.'}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setCalibrationOpen(true)}
              className="px-4 py-2 rounded-full bg-[#4F86DB] hover:bg-[#3C6FC4] text-white text-xs font-semibold shadow-[0_6px_16px_rgba(79,134,219,0.25)] transition-colors"
            >
              Calibrate today
            </button>
          </div>
        </div>
      )}

      {/* Compact 4-Cell Reference HUD Strip */}
      <section className="mb-6 grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="paper-card px-4 py-3.5">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#778092]">
            Tasks completed
          </div>
          <div className="font-mono tabular-nums text-xl font-extrabold text-[#394152] mt-0.5">
            {progress.completedToday}
            <span className="text-xs font-semibold text-[#778092] ml-1.5">
              / {progress.completedToday + progress.remainingOpen}
            </span>
          </div>
          <div className="flex flex-wrap gap-1 mt-2" aria-hidden="true">
            {Array.from({ length: totalPips }).map((_, idx) => (
              <span
                key={idx}
                className={`w-3.5 h-3.5 rounded-[5px] transition-colors ${
                  idx < progress.completedToday ? 'bg-[#8DB7F0]' : 'bg-[#EFEAE0]'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="paper-card px-4 py-3.5">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#778092]">
            Tasks remaining
          </div>
          <div className="font-mono tabular-nums text-xl font-extrabold text-[#394152] mt-0.5">
            {progress.remainingOpen}
          </div>
          <div className="h-2 rounded-full bg-[#EFEAE0] overflow-hidden mt-2.5">
            <div
              className="h-full rounded-full bg-[#8DB7F0] transition-all duration-500"
              style={{ width: `${remainingMeterPct}%` }}
            />
          </div>
        </div>

        <div className="paper-card px-4 py-3.5">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#778092]">
            Focus time today
          </div>
          <div className="font-mono tabular-nums text-xl font-extrabold text-[#394152] mt-0.5">
            {formatDurationMinutes(progress.focusMinutesToday)}
          </div>
          <div className="h-2 rounded-full bg-[#EFEAE0] overflow-hidden mt-2.5">
            <div
              className="h-full rounded-full bg-[#F5B7CF] transition-all duration-500"
              style={{ width: `${focusMeterPct}%` }}
            />
          </div>
        </div>

        <div className="paper-card px-4 py-3.5">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#778092]">
            Daily progress
          </div>
          <div className="font-mono tabular-nums text-xl font-extrabold text-[#394152] mt-0.5">
            {progress.dailyProgressPercent}%
          </div>
          <div className="h-2 rounded-full bg-[#EFEAE0] overflow-hidden mt-2.5">
            <div
              className="h-full rounded-full bg-[#8FD6A9] transition-all duration-500"
              style={{ width: `${progress.dailyProgressPercent}%` }}
            />
          </div>
        </div>
      </section>

      {/* Main 2-Column Task-Centric Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left/Primary: Today's Tasks Sticky Board (8 cols) */}
        <section className="lg:col-span-8 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="font-display text-2xl font-bold text-[#394152] tracking-tight">
                Today’s tasks
              </h1>
              <p className="text-xs text-[#778092] mt-0.5">
                Pick what deserves your attention next. Open Daily Planner when you want to place work on your clock.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="inline-flex items-center p-1 rounded-full bg-white border border-[#ECE6DB] shadow-xs">
                <button
                  type="button"
                  onClick={() => setViewMode('sticky')}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
                    viewMode === 'sticky'
                      ? 'bg-[#DDEEFF] text-[#2F5AA3]'
                      : 'text-[#778092] hover:text-[#394152]'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>Notes</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
                    viewMode === 'list'
                      ? 'bg-[#DDEEFF] text-[#2F5AA3]'
                      : 'text-[#778092] hover:text-[#394152]'
                  }`}
                >
                  <List className="w-3.5 h-3.5" />
                  <span>List</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => navigate('/planner')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-[#DDEEFF] border border-[#9FC3F0] text-[#2F5AA3] text-xs font-bold hover:bg-[#CFE4FC] transition-colors whitespace-nowrap"
              >
                <CalendarClock className="w-3.5 h-3.5" />
                <span>Open Daily Planner</span>
              </button>
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 pt-2">
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  className="h-52 rounded-2xl bg-white/80 border border-[#ECE6DB] animate-pulse"
                />
              ))}
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="paper-card p-10 text-center">
              <div className="text-3xl mb-2">📝</div>
              <p className="text-base font-bold text-[#394152]">
                Your sticky board is clear for today
              </p>
              <p className="text-xs text-[#778092] mt-1">
                Add a task in plain language or inspect your full backlog in My Tasks.
              </p>
              <button
                type="button"
                onClick={() => {
                  setEditingTask(null);
                  setAddModalOpen(true);
                }}
                className="mt-4 px-5 py-2.5 rounded-full bg-[#4F86DB] hover:bg-[#3C6FC4] text-white text-xs font-semibold shadow-[0_6px_16px_rgba(79,134,219,0.28)]"
              >
                Add first task
              </button>
            </div>
          ) : viewMode === 'sticky' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 pt-3">
              {filteredTasks.map((task, idx) => {
                const theme = getCategoryPastelTheme(task.category, appTheme === 'dark');
                const doneMilestones = task.milestones.filter(
                  (m) => m.completed
                ).length;
                const taskRec = recommendations.find(
                  (r) => r.taskId === task.id
                );
                const rot = NOTE_ROTATIONS[idx % NOTE_ROTATIONS.length];
                const isCompleted = task.status === 'completed';

                return (
                  <article
                    key={task.id}
                    className={`sticky-note flex flex-col justify-between p-5 pt-7 min-h-[230px] text-[#394152] ${
                      isCompleted ? 'opacity-75' : ''
                    }`}
                    style={{
                      backgroundColor: theme.bg,
                      transform: `rotate(${rot}deg)`,
                    }}
                  >
                    {/* Top-right index marker */}
                    <span
                      className="absolute top-2.5 right-3 w-6 h-6 rounded-full bg-white/75 flex items-center justify-center text-[11px] font-mono font-bold text-[#5A5A68]"
                      aria-hidden="true"
                    >
                      {idx + 1}
                    </span>

                    <div>
                      <div
                        className="text-[11px] font-extrabold uppercase tracking-wider flex items-center gap-1.5"
                        style={{ color: theme.accentText }}
                      >
                        <span aria-hidden="true">{theme.emoji}</span>
                        <span>{formatCategoryLabel(task.category)}</span>
                      </div>

                      <button
                        type="button"
                        onClick={() => setDetailTask(task)}
                        className={`mt-2 text-left font-display text-lg font-bold leading-snug hover:underline block w-full ${
                          isCompleted ? 'line-through text-[#666C7A]' : ''
                        }`}
                      >
                        {task.title}
                      </button>

                      {/* Clean typographic metadata (no pill clutter) */}
                      <div className="mt-2.5 text-xs text-[#4C5364] space-y-1">
                        <div className="font-mono tabular-nums font-bold text-sm text-[#394152]">
                          ⏱ {formatDurationMinutes(task.recommendedMinutes)}
                          {task.userEstimatedMinutes &&
                          task.aiEstimatedMinutes &&
                          task.userEstimatedMinutes !== task.aiEstimatedMinutes ? (
                            <span className="font-sans font-normal text-[11px] text-[#5B6275] ml-1.5">
                              (You {task.userEstimatedMinutes}m / AI{' '}
                              {task.aiEstimatedMinutes}m)
                            </span>
                          ) : null}
                        </div>

                        <div className="text-[11px] leading-relaxed">
                          <span
                            className={
                              task.priority === 'urgent'
                                ? 'text-[#9B3A3A] font-bold'
                                : task.priority === 'high'
                                  ? 'text-[#7A5C12] font-semibold'
                                  : 'font-medium'
                            }
                          >
                            {task.priority.charAt(0).toUpperCase() +
                              task.priority.slice(1)}
                          </span>
                          {' · '}
                          <span>
                            {formatShortDeadline(task.deadline, user?.timezone)}
                          </span>
                          {' · '}
                          <span>{task.status.replace('_', ' ')}</span>
                        </div>
                      </div>

                      {task.milestones.length > 0 && (
                        <div className="mt-2.5">
                          <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-[#4C5364] mb-1">
                            <span>Milestones</span>
                            <span>
                              {doneMilestones}/{task.milestones.length}
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-white/60 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-[#394152]/65"
                              style={{
                                width: `${Math.round(
                                  (doneMilestones / task.milestones.length) * 100
                                )}%`,
                              }}
                            />
                          </div>
                        </div>
                      )}

                      {taskRec && (
                        <button
                          type="button"
                          onClick={() => navigate('/recommendations')}
                          className="mt-2.5 inline-flex items-center gap-1 text-[11px] font-semibold hover:underline text-left"
                          style={{ color: theme.accentText }}
                        >
                          <Sparkles className="w-3 h-3 shrink-0" />
                          <span className="line-clamp-1">{taskRec.title}</span>
                        </button>
                      )}
                    </div>

                    {/* Tactile action bar on bottom of sticky note */}
                    <div className="mt-4 pt-2.5 border-t border-black/10 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => handleToggleComplete(task)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/80 hover:bg-white text-[11px] font-bold text-[#394152] transition-colors"
                      >
                        <Check className="w-3 h-3" />
                        <span>{isCompleted ? 'Reopen' : 'Done'}</span>
                      </button>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleStartFocus(task)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#394152] hover:bg-[#272D3A] text-white text-[11px] font-semibold transition-colors"
                          title="Start focus session"
                        >
                          <Play className="w-2.5 h-2.5" />
                          <span>Focus</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingTask(task);
                            setAddModalOpen(true);
                          }}
                          className="p-1.5 rounded-full bg-white/70 hover:bg-white text-[#394152]"
                          aria-label="Edit task"
                        >
                          <Edit3 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredTasks.map((task) => {
                const theme = getCategoryPastelTheme(task.category, appTheme === 'dark');
                const doneMilestones = task.milestones.filter(
                  (m) => m.completed
                ).length;
                const taskRec = recommendations.find(
                  (r) => r.taskId === task.id
                );

                return (
                  <div
                    key={task.id}
                    className="paper-card p-4 hover:border-[#4F86DB]/40 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <button
                          type="button"
                          onClick={() => handleToggleComplete(task)}
                          className="mt-0.5 text-[#778092] hover:text-[#23633D] shrink-0"
                          aria-label={`Mark ${task.title} complete`}
                        >
                          {task.status === 'completed' ? (
                            <CheckCircle2 className="w-5 h-5 text-[#23633D]" />
                          ) : (
                            <Circle className="w-5 h-5" />
                          )}
                        </button>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-3 h-3 rounded-[4px] shrink-0 border border-black/10"
                              style={{ backgroundColor: theme.bg }}
                              aria-hidden="true"
                            />
                            <button
                              type="button"
                              onClick={() => setDetailTask(task)}
                              className="text-left font-display text-base font-bold text-[#394152] hover:text-[#4F86DB] transition-colors truncate block max-w-full"
                            >
                              {task.title}
                            </button>
                          </div>

                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#778092]">
                            <span
                              className={
                                task.priority === 'urgent'
                                  ? 'text-[#9B3A3A] font-bold'
                                  : task.priority === 'high'
                                    ? 'text-[#7A5C12] font-semibold'
                                    : ''
                              }
                            >
                              {task.priority.charAt(0).toUpperCase() +
                                task.priority.slice(1)}{' '}
                              priority
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{formatCategoryLabel(task.category)}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">
                              Est {formatDurationMinutes(task.recommendedMinutes)}
                              {task.userEstimatedMinutes &&
                              task.aiEstimatedMinutes &&
                              task.userEstimatedMinutes !==
                                task.aiEstimatedMinutes
                                ? ` (You ${task.userEstimatedMinutes}m / AI ${task.aiEstimatedMinutes}m)`
                                : ''}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>
                              {formatShortDeadline(
                                task.deadline,
                                user?.timezone
                              )}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{task.status.replace('_', ' ')}</span>
                            {task.milestones.length > 0 && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono tabular-nums">
                                  {doneMilestones}/{task.milestones.length} milestones
                                </span>
                              </>
                            )}
                          </div>

                          {taskRec && (
                            <button
                              type="button"
                              onClick={() => navigate('/recommendations')}
                              className="mt-2 inline-flex items-center gap-1.5 text-xs text-[#4F86DB] hover:underline"
                            >
                              <Sparkles className="w-3 h-3" />
                              <span>{taskRec.title}</span>
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleStartFocus(task)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-[#C9F1D6] text-[#23633D] text-xs font-bold hover:opacity-90"
                          title="Start focus session"
                        >
                          <Play className="w-3 h-3" />
                          <span className="hidden sm:inline">Focus</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingTask(task);
                            setAddModalOpen(true);
                          }}
                          className="p-1.5 rounded-full text-[#778092] hover:bg-[#F6F3EC] hover:text-[#394152]"
                          aria-label="Edit task"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Right/Secondary Column: Focus Widget + Personal Insights + Upcoming Deadlines */}
        <aside className="lg:col-span-4 space-y-5">
          {/* Compact Focus Widget */}
          <div className="paper-card p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm font-bold text-[#394152]">
                Focus session
              </h2>
              <button
                type="button"
                onClick={() => navigate('/focus')}
                className="text-xs font-semibold text-[#4F86DB] hover:underline inline-flex items-center gap-1"
              >
                <span>Open Focus Mode</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            {activeSession ? (
              <div className="mt-3">
                <div className="text-sm font-semibold text-[#394152] truncate">
                  {activeSession.taskTitle || 'Active session'}
                </div>
                <div className="text-xs text-[#23633D] mt-1 font-mono tabular-nums font-semibold">
                  {activeSession.status === 'paused' ? 'Paused' : 'Running'} ·{' '}
                  {activeSession.activeMinutes}m logged
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/focus')}
                  className="mt-3 w-full py-2.5 rounded-full bg-[#4F86DB] hover:bg-[#3C6FC4] text-white text-xs font-semibold shadow-[0_6px_16px_rgba(79,134,219,0.22)]"
                >
                  Resume timer
                </button>
              </div>
            ) : (
              <div className="mt-3">
                <p className="text-xs text-[#778092] leading-relaxed">
                  Pick a sticky note on the left or jump straight into Focus Mode with optional background pairing.
                </p>
                <button
                  type="button"
                  onClick={() =>
                    todaysTasks[0]
                      ? handleStartFocus(todaysTasks[0])
                      : navigate('/focus')
                  }
                  className="mt-3 w-full py-2.5 rounded-full bg-[#FBF9F4] border border-[#ECE6DB] text-xs font-semibold text-[#394152] hover:bg-[#F6F3EC] transition-colors"
                >
                  {todaysTasks[0]
                    ? `Start focus on “${todaysTasks[0].title.slice(0, 22)}...”`
                    : 'Enter Focus Mode'}
                </button>
              </div>
            )}
          </div>

          {/* Personal Insight (strictly evidence-backed) */}
          <div className="paper-card p-5">
            <div className="flex items-center justify-between mb-2.5">
              <h2 className="font-display text-sm font-bold text-[#394152]">
                Personal insight
              </h2>
              <button
                type="button"
                onClick={() => navigate('/insights')}
                className="text-xs font-semibold text-[#4F86DB] hover:underline"
              >
                All insights
              </button>
            </div>

            {insights.length === 0 ? (
              <div className="q-card p-3.5 text-xs text-[#6B6450] leading-relaxed">
                Complete at least 2 tasks in a category to unlock evidence-backed observations from your Bayesian profile.
              </div>
            ) : (
              <div className="space-y-3">
                {insights.slice(0, 2).map((ins) => (
                  <div key={ins.id} className="q-card p-3.5 text-[#394152]">
                    <p className="text-xs font-semibold leading-relaxed">
                      💫 {ins.statement}
                    </p>
                    <div className="mt-1.5 text-[11px] text-[#7A6020] font-mono tabular-nums">
                      {ins.observationCount} observations · {ins.uncertaintyLabel}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Upcoming Deadlines */}
          <div className="paper-card p-5">
            <h2 className="font-display text-sm font-bold text-[#394152] mb-3">
              Upcoming deadlines
            </h2>
            {upcomingDeadlines.length === 0 ? (
              <p className="text-xs text-[#778092]">
                No upcoming deadlines scheduled.
              </p>
            ) : (
              <div className="space-y-2.5">
                {upcomingDeadlines.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between gap-2 text-xs pb-2 border-b border-dashed border-[#ECE6DB] last:border-0 last:pb-0"
                  >
                    <span className="font-semibold text-[#394152] truncate">
                      {t.title}
                    </span>
                    <span className="font-mono tabular-nums text-[#9B3A3A] font-semibold shrink-0">
                      {formatShortDeadline(t.deadline, user?.timezone)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Task Details Modal */}
      {detailTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#394152]/35 backdrop-blur-[2px]">
          <div className="w-full max-w-lg paper-card p-6">
            <h3 className="font-display text-lg font-bold text-[#394152]">
              {detailTask.title}
            </h3>
            <p className="text-xs text-[#778092] mt-1">
              {formatCategoryLabel(detailTask.category)} ·{' '}
              {formatAttentionLabel(detailTask.attentionClass)} ·{' '}
              {detailTask.priority} priority
            </p>
            {detailTask.description && (
              <p className="text-sm text-[#394152] mt-3 whitespace-pre-wrap leading-relaxed">
                {detailTask.description}
              </p>
            )}
            <div className="mt-4 grid grid-cols-3 gap-2 p-3.5 rounded-2xl bg-[#FBF9F4] border border-[#ECE6DB] text-xs font-mono tabular-nums">
              <div>
                <div className="text-[#778092]">User est</div>
                <div className="font-bold text-[#394152] mt-0.5">
                  {detailTask.userEstimatedMinutes
                    ? `${detailTask.userEstimatedMinutes}m`
                    : '—'}
                </div>
              </div>
              <div>
                <div className="text-[#778092]">AI est</div>
                <div className="font-bold text-[#4F86DB] mt-0.5">
                  {detailTask.aiEstimatedMinutes
                    ? `${detailTask.aiEstimatedMinutes}m`
                    : '—'}
                </div>
              </div>
              <div>
                <div className="text-[#778092]">Actual</div>
                <div className="font-bold text-[#23633D] mt-0.5">
                  {detailTask.actualMinutes}m
                </div>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDetailTask(null)}
                className="px-4 py-2 rounded-full border border-[#ECE6DB] text-xs font-semibold text-[#778092] hover:bg-[#F6F3EC]"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  setDetailTask(null);
                  navigate('/planner');
                }}
                className="px-4 py-2 rounded-full bg-[#4F86DB] hover:bg-[#3C6FC4] text-white text-xs font-semibold"
              >
                Plan in Daily Planner
              </button>
            </div>
          </div>
        </div>
      )}

      {addModalOpen && (
        <AddTaskModal
          open={addModalOpen}
          onClose={() => setAddModalOpen(false)}
          existingTasks={allTasks}
          initialTask={editingTask}
          onSaved={(_saved, goToPlanner) => {
            loadDashboard();
            if (goToPlanner) navigate('/planner');
          }}
        />
      )}

      {calibrationOpen && (
        <DailyCalibrationModal
          open={calibrationOpen}
          date={localDate}
          existingCalibration={calibration}
          tasks={allTasks}
          mode={calibration?.status === 'completed' ? 'recalibrate' : 'initial'}
          onClose={() => setCalibrationOpen(false)}
          onCompleted={(_cal, goToPlanner) => {
            loadDashboard();
            if (goToPlanner) navigate('/planner');
          }}
        />
      )}
    </Layout>
  );
}
