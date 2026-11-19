import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Clock,
  History,
  Layers,
  RefreshCw,
  Sparkles,
  Trash2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { DateTime } from 'luxon';
import { AddTaskModal } from '../components/AddTaskModal';
import { DailyCalibrationModal } from '../components/DailyCalibrationModal';
import { Layout } from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { api, ApiError } from '../lib/api';
import {
  formatDurationMinutes,
  formatFriendlyDate,
  getCategoryPastelTheme,
  getTodayLocalDate,
  shiftLocalDate,
} from '../lib/format';
import type {
  DailyCalibrationDTO,
  DailyPlanDTO,
  DailyPlanRevisionDTO,
  DailyRoutineOverrideDTO,
  ScheduledTaskBlockDTO,
  TaskDTO,
  UnscheduledTaskEntry,
} from '../shared/types';

export function PlannerPage() {
  const { user } = useAuth();
  const todayLocal = getTodayLocalDate(user?.timezone || 'UTC');
  const [selectedDate, setSelectedDate] = useState(todayLocal);
  const [zoomPxPerHour, setZoomPxPerHour] = useState<number>(64);
  const [plan, setPlan] = useState<DailyPlanDTO | null>(null);
  const [calibration, setCalibration] = useState<DailyCalibrationDTO | null>(
    null
  );
  const [tasks, setTasks] = useState<TaskDTO[]>([]);
  const [overrides, setOverrides] = useState<DailyRoutineOverrideDTO[]>([]);
  const [revisions, setRevisions] = useState<DailyPlanRevisionDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedBlock, setSelectedBlock] =
    useState<ScheduledTaskBlockDTO | null>(null);
  const [revisionsOpen, setRevisionsOpen] = useState(false);
  const [calModalOpen, setCalModalOpen] = useState(false);
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [overrideTitle, setOverrideTitle] = useState('');
  const [overrideStart, setOverrideStart] = useState('13:00');
  const [overrideEnd, setOverrideEnd] = useState('14:00');
  const [insufficientTask, setInsufficientTask] =
    useState<UnscheduledTaskEntry | null>(null);
  const [overlapPrompt, setOverlapPrompt] = useState<{
    taskId: string;
    startMinute: number;
    endMinute: number;
    message: string;
    efficiencyNote?: string;
  } | null>(null);

  const loadPlanner = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getPlanner(selectedDate);
      setPlan(res.plan);
      setCalibration(res.calibration);
      setTasks(res.tasks);
      setOverrides(res.overrides);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Could not load Daily Planner.'
      );
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    loadPlanner();
  }, [loadPlanner]);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await api.generatePlan(selectedDate);
      setPlan(res.plan);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to generate plan.'
      );
    } finally {
      setGenerating(false);
    }
  };

  const handleDropOnTimeline = async (
    e: React.DragEvent<HTMLDivElement>,
    hour: number
  ) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/task-id');
    const blockId = e.dataTransfer.getData('text/block-id');
    const blockDuration = Number(
      e.dataTransfer.getData('text/block-duration') || 60
    );

    const startMinute = hour * 60;
    const endMinute = Math.min(1440, startMinute + blockDuration);

    try {
      const res = await api.editPlannerBlock(selectedDate, {
        action: blockId ? 'move_block' : 'schedule_task',
        taskId: taskId || undefined,
        blockId: blockId || undefined,
        startMinute,
        endMinute,
      });
      setPlan(res.plan);
      setError(null);
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.code === 'OVERLAP_CONFIRMATION_REQUIRED'
      ) {
        setOverlapPrompt({
          taskId,
          startMinute,
          endMinute,
          message: err.message,
          efficiencyNote: err.details?.efficiencyNote as string | undefined,
        });
      } else {
        setError(
          err instanceof ApiError ? err.message : 'Could not place block here.'
        );
      }
    }
  };

  const handleResizeBlock = async (
    block: ScheduledTaskBlockDTO,
    deltaMinutes: number
  ) => {
    const nextEnd = Math.min(
      1440,
      Math.max(block.startMinute + 15, block.endMinute + deltaMinutes)
    );
    try {
      const res = await api.editPlannerBlock(selectedDate, {
        action: 'resize_block',
        blockId: block.id,
        startMinute: block.startMinute,
        endMinute: nextEnd,
      });
      setPlan(res.plan);
      setSelectedBlock(res.plan.blocks.find((b) => b.id === block.id) ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Resize blocked.');
    }
  };

  const handleRemoveBlock = async (blockId: string) => {
    const res = await api.editPlannerBlock(selectedDate, {
      action: 'remove_block',
      blockId,
    });
    setPlan(res.plan);
    setSelectedBlock(null);
  };

  const handleAddOneDayOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!overrideTitle.trim()) return;
    await api.saveRoutineOverride(selectedDate, {
      action: 'add',
      activityName: overrideTitle.trim(),
      startTime: overrideStart,
      endTime: overrideEnd,
      activityType: 'personal',
      isFixed: true,
      isMovable: false,
    });
    setOverrideTitle('');
    setOverrideModalOpen(false);
    loadPlanner();
  };

  const handleOpenRevisions = async () => {
    const res = await api.getPlanRevisions(selectedDate);
    setRevisions(res.revisions);
    setRevisionsOpen(true);
  };

  const cap = plan?.capacityBreakdown;
  const hours = Array.from({ length: 24 }, (_, i) => i);

  // 24h stacked proportion bar math (1440 total minutes)
  const sleepMinutes = cap ? Math.max(0, 1440 - cap.totalWakingMinutes) : 480;
  const committedMinutes = cap?.committedMinutes ?? 0;
  const scheduledMinutes = cap?.scheduledTaskMinutes ?? 0;
  const bufferMinutes = cap?.bufferMinutes ?? 0;
  const unallocatedMinutes = cap?.unallocatedMinutes ?? 0;

  const taskMap = new Map(tasks.map((t) => [t.id, t]));

  // Current time line position in minutes when viewing today
  const nowDt = DateTime.now().setZone(user?.timezone || 'UTC');
  const nowMinutes =
    selectedDate === todayLocal && nowDt.isValid
      ? nowDt.hour * 60 + nowDt.minute
      : null;

  return (
    <Layout
      onOpenAddTask={() => setAddTaskOpen(true)}
      onOpenCalibration={() => setCalModalOpen(true)}
      calibrationUnconfirmed={!calibration || calibration.status !== 'completed'}
    >
      {/* Top Planner Toolbar */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 mb-5">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="font-display text-2xl font-bold text-[#394152] tracking-tight">
            Daily Planner
          </h1>
          <div className="inline-flex items-center gap-1 bg-white border border-[#ECE6DB] rounded-full px-1.5 py-1 shadow-xs">
            <button
              type="button"
              onClick={() => setSelectedDate((d) => shiftLocalDate(d, -1))}
              className="p-1.5 rounded-full hover:bg-[#F6F3EC]"
              aria-label="Previous day"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-2 py-0.5 text-xs font-mono tabular-nums bg-transparent focus:outline-none text-[#394152]"
            />
            <button
              type="button"
              onClick={() => setSelectedDate((d) => shiftLocalDate(d, 1))}
              className="p-1.5 rounded-full hover:bg-[#F6F3EC]"
              aria-label="Next day"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <span className="text-xs font-medium text-[#778092]">
            {formatFriendlyDate(selectedDate, user?.timezone)}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex items-center bg-white border border-[#ECE6DB] rounded-full px-1.5 py-1 shadow-xs">
            <button
              type="button"
              onClick={() => setZoomPxPerHour((z) => Math.max(44, z - 16))}
              className="p-1.5 rounded-full hover:bg-[#F6F3EC]"
              title="Zoom out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-2 text-[11px] font-mono text-[#778092]">
              {zoomPxPerHour}px/h
            </span>
            <button
              type="button"
              onClick={() => setZoomPxPerHour((z) => Math.min(112, z + 16))}
              className="p-1.5 rounded-full hover:bg-[#F6F3EC]"
              title="Zoom in"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setOverrideModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white border border-[#ECE6DB] text-xs font-semibold text-[#394152] hover:bg-[#F6F3EC] shadow-xs"
          >
            <CalendarPlus className="w-3.5 h-3.5" />
            <span>Add today commitment</span>
          </button>

          <button
            type="button"
            onClick={handleOpenRevisions}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white border border-[#ECE6DB] text-xs font-semibold text-[#394152] hover:bg-[#F6F3EC] shadow-xs"
          >
            <History className="w-3.5 h-3.5" />
            <span>Revisions</span>
          </button>

          <button
            type="button"
            onClick={() => setCalModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-[#DDEEFF] border border-[#9FC3F0] text-[#2F5AA3] text-xs font-bold hover:bg-[#CFE4FC]"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Recalibrate my day</span>
          </button>

          <button
            type="button"
            disabled={generating}
            onClick={handleGenerate}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#4F86DB] hover:bg-[#3C6FC4] text-white text-xs font-semibold shadow-[0_6px_16px_rgba(79,134,219,0.28)] disabled:opacity-60"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{generating ? 'Generating...' : 'Generate schedule'}</span>
          </button>
        </div>
      </div>

      {/* 24-Hour Capacity Proportion Bar + 6-Part Breakdown */}
      {cap && (
        <section className="mb-5 paper-card p-5 space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#778092]">
                24-hour capacity proportion
              </span>
              <span className="text-xs font-mono tabular-nums text-[#778092]">
                {formatDurationMinutes(cap.availableMinutes)} usable work capacity
              </span>
            </div>

            <div className="flex h-10 rounded-xl overflow-hidden border border-[#ECE6DB]">
              {sleepMinutes > 0 && (
                <div
                  style={{ width: `${(sleepMinutes / 1440) * 100}%` }}
                  className="bg-[#DCD6F5] flex items-center justify-center text-[11px] font-bold text-[#4A4F5C] overflow-hidden whitespace-nowrap px-1"
                  title={`Sleep & rest: ${formatDurationMinutes(sleepMinutes)}`}
                >
                  {sleepMinutes >= 90 ? `Sleep ${formatDurationMinutes(sleepMinutes)}` : ''}
                </div>
              )}
              {committedMinutes > 0 && (
                <div
                  style={{ width: `${(committedMinutes / 1440) * 100}%` }}
                  className="bg-[#F7E1C9] flex items-center justify-center text-[11px] font-bold text-[#6E4F2C] overflow-hidden whitespace-nowrap px-1"
                  title={`Committed routine: ${formatDurationMinutes(committedMinutes)}`}
                >
                  {committedMinutes >= 90 ? `Routine ${formatDurationMinutes(committedMinutes)}` : ''}
                </div>
              )}
              {scheduledMinutes > 0 && (
                <div
                  style={{ width: `${(scheduledMinutes / 1440) * 100}%` }}
                  className="bg-[#CDEBD9] flex items-center justify-center text-[11px] font-bold text-[#23633D] overflow-hidden whitespace-nowrap px-1"
                  title={`Scheduled tasks: ${formatDurationMinutes(scheduledMinutes)}`}
                >
                  {scheduledMinutes >= 90 ? `Tasks ${formatDurationMinutes(scheduledMinutes)}` : ''}
                </div>
              )}
              {bufferMinutes > 0 && (
                <div
                  style={{ width: `${(bufferMinutes / 1440) * 100}%` }}
                  className="bg-[#FFF0A8] flex items-center justify-center text-[11px] font-bold text-[#6F5812] overflow-hidden whitespace-nowrap px-1"
                  title={`Buffer reserve: ${formatDurationMinutes(bufferMinutes)}`}
                />
              )}
              {unallocatedMinutes > 0 && (
                <div
                  style={{ width: `${(unallocatedMinutes / 1440) * 100}%` }}
                  className="bg-[#E6EDF7] flex items-center justify-center text-[11px] font-bold text-[#3A4F73] overflow-hidden whitespace-nowrap px-1"
                  title={`Unallocated free: ${formatDurationMinutes(unallocatedMinutes)}`}
                >
                  {unallocatedMinutes >= 90 ? `Open ${formatDurationMinutes(unallocatedMinutes)}` : ''}
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-2.5 text-xs text-[#778092]">
              <span className="inline-flex items-center gap-1.5">
                <i className="w-2.5 h-2.5 rounded-[3px] bg-[#DCD6F5] inline-block" />
                Sleep ({formatDurationMinutes(sleepMinutes)})
              </span>
              <span className="inline-flex items-center gap-1.5">
                <i className="w-2.5 h-2.5 rounded-[3px] bg-[#F7E1C9] inline-block" />
                Fixed routine ({formatDurationMinutes(committedMinutes)})
              </span>
              <span className="inline-flex items-center gap-1.5">
                <i className="w-2.5 h-2.5 rounded-[3px] bg-[#CDEBD9] inline-block" />
                Scheduled tasks ({formatDurationMinutes(scheduledMinutes)})
              </span>
              <span className="inline-flex items-center gap-1.5">
                <i className="w-2.5 h-2.5 rounded-[3px] bg-[#FFF0A8] inline-block" />
                Buffer ({formatDurationMinutes(bufferMinutes)})
              </span>
              <span className="inline-flex items-center gap-1.5">
                <i className="w-2.5 h-2.5 rounded-[3px] bg-[#E6EDF7] inline-block" />
                Unallocated ({formatDurationMinutes(unallocatedMinutes)})
              </span>
            </div>
          </div>

          <div className="pt-3 border-t border-dashed border-[#ECE6DB] grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <div>
              <div className="text-[11px] text-[#778092]">Total waking</div>
              <div className="font-mono tabular-nums text-sm font-bold text-[#394152]">
                {formatDurationMinutes(cap.totalWakingMinutes)}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-[#778092]">Committed routine</div>
              <div className="font-mono tabular-nums text-sm font-bold text-[#82461C]">
                {formatDurationMinutes(cap.committedMinutes)}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-[#778092]">Available capacity</div>
              <div className="font-mono tabular-nums text-sm font-bold text-[#23633D]">
                {formatDurationMinutes(cap.availableMinutes)}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-[#778092]">Scheduled tasks</div>
              <div className="font-mono tabular-nums text-sm font-bold text-[#4F86DB]">
                {formatDurationMinutes(cap.scheduledTaskMinutes)}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-[#778092]">Unallocated free</div>
              <div className="font-mono tabular-nums text-sm font-bold text-[#394152]">
                {formatDurationMinutes(cap.unallocatedMinutes)}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-[#778092]">Buffer reserve</div>
              <div className="font-mono tabular-nums text-sm font-bold text-[#6F5812]">
                {formatDurationMinutes(cap.bufferMinutes)}
              </div>
            </div>
          </div>
        </section>
      )}

      {error && (
        <div className="mb-4 p-3.5 rounded-2xl bg-[#FFF1F0] border border-[#F6D5D2] text-[#9B3A3A] text-xs font-medium">
          {error}
        </div>
      )}

      {/* Conflicts Banner */}
      {plan && plan.conflicts.length > 0 && (
        <div className="mb-4 p-4 rounded-2xl bg-[#FFF1F0] border border-[#F6D5D2] space-y-1.5">
          {plan.conflicts.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-2 text-xs font-semibold text-[#9B3A3A]"
            >
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{c.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Main Split: Visual Timeline + Unscheduled Waiting List */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Interactive Timeline (8 cols) */}
        <section className="lg:col-span-8 paper-card p-5 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <span className="text-xs font-medium text-[#778092]">
              Hatched = fixed routines · Coloured = your tasks · Blue line = now · Drag tasks onto any slot
            </span>
            {overrides.length > 0 && (
              <span className="text-xs font-semibold text-[#4F86DB]">
                {overrides.length} one-day routine override(s) active
              </span>
            )}
          </div>

          {loading ? (
            <div className="h-[520px] bg-[#FBF9F4] rounded-xl animate-pulse" />
          ) : (
            <div className="relative overflow-y-auto max-h-[680px] pr-2">
              <div
                className="relative"
                style={{ height: `${24 * zoomPxPerHour}px` }}
              >
                {/* Hour Grid & Drop Targets */}
                {hours.map((hour) => (
                  <div
                    key={hour}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => handleDropOnTimeline(e, hour)}
                    style={{
                      top: `${hour * zoomPxPerHour}px`,
                      height: `${zoomPxPerHour}px`,
                    }}
                    className="absolute inset-x-0 border-t border-[#ECE6DB] flex items-start"
                  >
                    <span className="w-14 pr-2 pt-1 text-[11px] font-mono tabular-nums text-[#778092] text-right shrink-0">
                      {String(hour).padStart(2, '0')}:00
                    </span>
                    <div className="flex-1 h-full hover:bg-[#FFF8E1]/40 transition-colors" />
                  </div>
                ))}

                {/* Current time indicator line */}
                {nowMinutes !== null && (
                  <div
                    className="absolute left-16 right-1 h-[3px] bg-[#4F86DB] rounded-full z-20 pointer-events-none shadow-[0_0_8px_rgba(79,134,219,0.5)]"
                    style={{ top: `${(nowMinutes / 60) * zoomPxPerHour}px` }}
                  />
                )}

                {/* Scheduled & Routine Blocks */}
                {(plan?.blocks ?? []).map((block) => {
                  const topPx = (block.startMinute / 60) * zoomPxPerHour;
                  const heightPx = Math.max(
                    26,
                    ((block.endMinute - block.startMinute) / 60) * zoomPxPerHour
                  );

                  const linkedTask = block.taskId
                    ? taskMap.get(block.taskId)
                    : undefined;
                  const taskPastel = linkedTask
                    ? getCategoryPastelTheme(linkedTask.category)
                    : null;

                  let blockStyle: React.CSSProperties = {
                    top: `${topPx}px`,
                    height: `${heightPx}px`,
                    left: block.isOverlapping ? '54%' : '4rem',
                    right: '0.25rem',
                  };
                  let extraClass = '';

                  if (block.kind === 'routine') {
                    extraClass = block.isFixed
                      ? 'routine-hatch text-[#5B6275] border-[#E3DDD0]'
                      : 'bg-[#F6F3EC] border-[#ECE6DB] text-[#5B6275]';
                  } else if (block.kind === 'commitment') {
                    blockStyle.backgroundColor = '#F7E1C9';
                    extraClass = 'border-[#E6C7A3] text-[#5F4120]';
                  } else if (block.kind === 'break') {
                    blockStyle.backgroundColor = '#FFF8E1';
                    extraClass = 'border-[#F4E3A8] text-[#7A6020]';
                  } else if (block.status === 'completed') {
                    blockStyle.backgroundColor = '#C9F1D6';
                    extraClass = 'border-[#94DBAC] text-[#23633D]';
                  } else if (taskPastel) {
                    blockStyle.backgroundColor = taskPastel.bg;
                    extraClass = block.isOverlapping
                      ? 'border-dashed border-black/25 text-[#394152]'
                      : 'border-black/10 text-[#394152] shadow-[0_3px_8px_rgba(60,60,80,0.09)]';
                  } else {
                    blockStyle.backgroundColor = '#CAE5FF';
                    extraClass = 'border-[#9FC8F5] text-[#2B558A]';
                  }

                  return (
                    <div
                      key={block.id}
                      draggable={block.kind === 'task'}
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/block-id', block.id);
                        e.dataTransfer.setData(
                          'text/block-duration',
                          String(block.endMinute - block.startMinute)
                        );
                      }}
                      onClick={() => setSelectedBlock(block)}
                      style={blockStyle}
                      className={`absolute rounded-xl border px-3 py-1.5 cursor-pointer overflow-hidden transition-transform hover:-translate-y-0.5 ${extraClass}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold truncate">
                          {taskPastel ? `${taskPastel.emoji} ` : ''}
                          {block.title}
                          {block.isSplitPart && block.splitTotal > 1
                            ? ` (${block.splitIndex}/${block.splitTotal})`
                            : ''}
                        </span>
                        <span className="text-[11px] font-mono tabular-nums shrink-0 opacity-85">
                          {block.startTime}–{block.endTime}
                        </span>
                      </div>
                      {heightPx >= 42 && (
                        <div className="text-[11px] opacity-80 truncate mt-0.5">
                          {block.kind === 'routine'
                            ? block.isFixed
                              ? 'Fixed routine'
                              : 'Flexible routine'
                            : block.isOverlapping
                              ? block.overlapConfirmed
                                ? 'Confirmed background overlap'
                                : 'Overlap needs confirmation'
                              : block.status}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* Right Side: Block Inspector + Unscheduled Queue (4 cols) */}
        <aside className="lg:col-span-4 space-y-5">
          {selectedBlock && (
            <div className="paper-card p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-sm font-bold text-[#394152]">
                  Block details
                </h2>
                <button
                  type="button"
                  onClick={() => setSelectedBlock(null)}
                  className="text-xs text-[#778092] hover:text-[#394152]"
                >
                  Close
                </button>
              </div>
              <div className="mt-2 text-sm font-bold text-[#394152]">
                {selectedBlock.title}
              </div>
              <div className="text-xs font-mono tabular-nums text-[#778092] mt-1">
                {selectedBlock.startTime} – {selectedBlock.endTime} (
                {selectedBlock.endMinute - selectedBlock.startMinute}m)
              </div>

              {selectedBlock.efficiencyNote && (
                <p className="mt-2.5 text-xs text-[#2F5AA3] bg-[#DDEEFF] p-3 rounded-xl">
                  {selectedBlock.efficiencyNote}
                </p>
              )}

              {selectedBlock.kind === 'task' && (
                <div className="mt-4 space-y-2">
                  {selectedBlock.isOverlapping && !selectedBlock.overlapConfirmed && (
                    <button
                      type="button"
                      onClick={async () => {
                        const res = await api.editPlannerBlock(selectedDate, {
                          action: 'confirm_overlap',
                          blockId: selectedBlock.id,
                        });
                        setPlan(res.plan);
                        setSelectedBlock(
                          res.plan.blocks.find((b) => b.id === selectedBlock.id) ??
                            null
                        );
                      }}
                      className="w-full py-2 rounded-full bg-[#4F86DB] text-white text-xs font-semibold"
                    >
                      Confirm compatible overlap
                    </button>
                  )}

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleResizeBlock(selectedBlock, -15)}
                      className="flex-1 py-1.5 rounded-full bg-[#FBF9F4] border border-[#ECE6DB] text-xs font-mono font-semibold hover:bg-[#F6F3EC]"
                    >
                      -15m
                    </button>
                    <button
                      type="button"
                      onClick={() => handleResizeBlock(selectedBlock, 15)}
                      className="flex-1 py-1.5 rounded-full bg-[#FBF9F4] border border-[#ECE6DB] text-xs font-mono font-semibold hover:bg-[#F6F3EC]"
                    >
                      +15m
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveBlock(selectedBlock.id)}
                    className="w-full py-2 rounded-full bg-[#FFF1F0] border border-[#F6D5D2] text-[#9B3A3A] text-xs font-semibold flex items-center justify-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Move back to unscheduled queue</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Unscheduled & Partially Allocated Queue */}
          <div className="paper-card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-sm font-bold text-[#394152]">
                Unscheduled &amp; waiting list
              </h2>
              <span className="text-xs font-mono tabular-nums text-[#778092]">
                {plan?.unscheduledTasks.length ?? 0}
              </span>
            </div>

            {(plan?.unscheduledTasks ?? []).length === 0 ? (
              <p className="text-xs text-[#23633D] bg-[#EFFAF3] border border-[#D2EEDB] p-3.5 rounded-xl font-medium">
                All active tasks fit cleanly within today’s available capacity.
              </p>
            ) : (
              <div className="space-y-2.5">
                {plan!.unscheduledTasks.map((u) => {
                  const t = taskMap.get(u.taskId);
                  const theme = t ? getCategoryPastelTheme(t.category) : null;
                  return (
                    <div
                      key={u.taskId}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/task-id', u.taskId);
                        e.dataTransfer.setData(
                          'text/block-duration',
                          String(Math.min(60, u.remainingUnscheduledMinutes))
                        );
                      }}
                      className="p-3.5 rounded-2xl border border-[#ECE6DB] cursor-grab active:cursor-grabbing transition-transform hover:-translate-y-0.5"
                      style={{ backgroundColor: theme ? `${theme.bg}66` : '#FCFAF5' }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-[#394152] truncate">
                          {theme ? `${theme.emoji} ` : ''}
                          {u.title}
                        </span>
                        <span className="text-[11px] font-mono tabular-nums text-[#2F5AA3] font-bold shrink-0">
                          {formatDurationMinutes(u.remainingUnscheduledMinutes)}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#5B6275] mt-1">{u.reason}</p>
                      <div className="mt-2.5 flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => setInsufficientTask(u)}
                          className="text-[11px] font-bold text-[#4F86DB] hover:underline inline-flex items-center gap-1"
                        >
                          <Layers className="w-3 h-3" />
                          <span>Resolve alternatives</span>
                        </button>
                        <span className="text-[11px] text-[#778092] inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" /> Drag to slot
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Overlap Confirmation Modal */}
      {overlapPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#394152]/35 backdrop-blur-[2px]">
          <div className="w-full max-w-md paper-card p-6">
            <h3 className="font-display text-base font-bold text-[#394152]">
              Confirm overlapping task execution
            </h3>
            <p className="text-xs text-[#778092] mt-2">{overlapPrompt.message}</p>
            {overlapPrompt.efficiencyNote && (
              <p className="text-xs text-[#2F5AA3] bg-[#DDEEFF] p-3 rounded-xl mt-3">
                {overlapPrompt.efficiencyNote}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOverlapPrompt(null)}
                className="px-4 py-2 rounded-full border border-[#ECE6DB] text-xs font-semibold text-[#778092]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const res = await api.editPlannerBlock(selectedDate, {
                    action: 'schedule_task',
                    taskId: overlapPrompt.taskId,
                    startMinute: overlapPrompt.startMinute,
                    endMinute: overlapPrompt.endMinute,
                    overlapConfirmed: true,
                  });
                  setPlan(res.plan);
                  setOverlapPrompt(null);
                }}
                className="px-4 py-2 rounded-full bg-[#4F86DB] text-white text-xs font-semibold"
              >
                Confirm overlap
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Insufficient Capacity Alternatives Modal */}
      {insufficientTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#394152]/35 backdrop-blur-[2px]">
          <div className="w-full max-w-md paper-card p-6">
            <h3 className="font-display text-base font-bold text-[#394152]">
              Resolve capacity for “{insufficientTask.title}”
            </h3>
            <p className="text-xs text-[#778092] mt-1">
              {insufficientTask.reason} Choose how to handle it without losing work:
            </p>
            <div className="mt-4 space-y-2">
              <button
                type="button"
                onClick={async () => {
                  await api.updateTask(insufficientTask.taskId, {
                    status: 'waiting_list',
                  });
                  setInsufficientTask(null);
                  loadPlanner();
                }}
                className="w-full text-left px-3.5 py-2.5 rounded-xl bg-[#FBF9F4] border border-[#ECE6DB] text-xs font-semibold text-[#394152] hover:bg-[#DDEEFF]"
              >
                1. Move to waiting list for later capacity
              </button>
              <button
                type="button"
                onClick={async () => {
                  await api.updateTask(insufficientTask.taskId, {
                    priority: 'urgent',
                    splittingPreference: 'shorter_sessions',
                  });
                  setInsufficientTask(null);
                  handleGenerate();
                }}
                className="w-full text-left px-3.5 py-2.5 rounded-xl bg-[#FBF9F4] border border-[#ECE6DB] text-xs font-semibold text-[#394152] hover:bg-[#DDEEFF]"
              >
                2. Boost priority to Urgent &amp; split into shorter sessions
              </button>
              <button
                type="button"
                onClick={async () => {
                  await api.updateTask(insufficientTask.taskId, {
                    userEstimatedMinutes: Math.max(
                      20,
                      Math.round(insufficientTask.requiredMinutes * 0.65)
                    ),
                  });
                  setInsufficientTask(null);
                  handleGenerate();
                }}
                className="w-full text-left px-3.5 py-2.5 rounded-xl bg-[#FBF9F4] border border-[#ECE6DB] text-xs font-semibold text-[#394152] hover:bg-[#DDEEFF]"
              >
                3. Reduce scope for today (65% milestone target)
              </button>
              <button
                type="button"
                onClick={async () => {
                  const nextDay = shiftLocalDate(selectedDate, 2);
                  await api.updateTask(insufficientTask.taskId, {
                    deadline: new Date(`${nextDay}T18:00:00Z`).toISOString(),
                  });
                  setInsufficientTask(null);
                  loadPlanner();
                }}
                className="w-full text-left px-3.5 py-2.5 rounded-xl bg-[#FBF9F4] border border-[#ECE6DB] text-xs font-semibold text-[#394152] hover:bg-[#DDEEFF]"
              >
                4. Extend deadline by 2 days &amp; allocate across days
              </button>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setInsufficientTask(null)}
                className="px-4 py-2 rounded-full border border-[#ECE6DB] text-xs font-semibold text-[#778092]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* One-Day Commitment Override Modal */}
      {overrideModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#394152]/35 backdrop-blur-[2px]">
          <form
            onSubmit={handleAddOneDayOverride}
            className="w-full max-w-md paper-card p-6 space-y-4"
          >
            <h3 className="font-display text-base font-bold text-[#394152]">
              One-day schedule commitment ({selectedDate})
            </h3>
            <p className="text-xs text-[#778092]">
              Applies only to {selectedDate}. Your recurring weekly routine remains unchanged.
            </p>
            <input
              type="text"
              required
              value={overrideTitle}
              onChange={(e) => setOverrideTitle(e.target.value)}
              placeholder="Appointment, lab session, travel..."
              className="w-full px-3.5 py-2.5 text-sm bg-[#FBF9F4] border border-[#ECE6DB] rounded-xl"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                type="time"
                value={overrideStart}
                onChange={(e) => setOverrideStart(e.target.value)}
                className="px-3 py-2 text-sm bg-[#FBF9F4] border border-[#ECE6DB] rounded-xl font-mono"
              />
              <input
                type="time"
                value={overrideEnd}
                onChange={(e) => setOverrideEnd(e.target.value)}
                className="px-3 py-2 text-sm bg-[#FBF9F4] border border-[#ECE6DB] rounded-xl font-mono"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOverrideModalOpen(false)}
                className="px-4 py-2 rounded-full border border-[#ECE6DB] text-xs font-semibold text-[#778092]"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-full bg-[#4F86DB] text-white text-xs font-semibold"
              >
                Save for {selectedDate}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Plan Revisions Drawer */}
      {revisionsOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-[#394152]/30 backdrop-blur-[1px]">
          <div className="w-full max-w-md bg-white h-full p-6 overflow-y-auto border-l border-[#ECE6DB] shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-lg font-bold text-[#394152]">
                Plan revisions ({selectedDate})
              </h3>
              <button
                type="button"
                onClick={() => setRevisionsOpen(false)}
                className="text-xs font-semibold text-[#778092]"
              >
                Close
              </button>
            </div>
            {revisions.length === 0 ? (
              <p className="text-xs text-[#778092]">
                No saved revisions yet for this date. Generate or recalibrate a plan to snapshot revisions.
              </p>
            ) : (
              <div className="space-y-3">
                {revisions.map((rev) => (
                  <div
                    key={rev.id}
                    className="p-3.5 rounded-2xl bg-[#FBF9F4] border border-[#ECE6DB]"
                  >
                    <div className="flex items-center justify-between text-xs font-bold text-[#394152]">
                      <span>
                        Revision #{rev.revisionNumber} ·{' '}
                        {rev.triggerReason.replace('_', ' ')}
                      </span>
                      <span className="font-mono tabular-nums text-[#778092]">
                        {new Date(rev.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <ul className="mt-2 text-xs text-[#778092] space-y-1">
                      {rev.diffSummary.map((d, i) => (
                        <li key={i}>• {d}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {calModalOpen && (
        <DailyCalibrationModal
          open={calModalOpen}
          date={selectedDate}
          existingCalibration={calibration}
          tasks={tasks}
          mode={plan && plan.revisionNumber > 0 ? 'recalibrate' : 'initial'}
          onClose={() => setCalModalOpen(false)}
          onCompleted={() => loadPlanner()}
        />
      )}

      {addTaskOpen && (
        <AddTaskModal
          open={addTaskOpen}
          onClose={() => setAddTaskOpen(false)}
          existingTasks={tasks}
          onSaved={() => loadPlanner()}
        />
      )}
    </Layout>
  );
}
