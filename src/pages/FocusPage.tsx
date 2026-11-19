import React, { useCallback, useEffect, useState } from 'react';
import { Check, Pause, Play, PlusCircle, Square } from 'lucide-react';
import { Layout } from '../components/Layout';
import { api } from '../lib/api';
import { formatDurationMinutes } from '../lib/format';
import type { TaskDTO, WorkSessionDTO } from '../shared/types';

export function FocusPage() {
  const [tasks, setTasks] = useState<TaskDTO[]>([]);
  const [sessions, setSessions] = useState<WorkSessionDTO[]>([]);
  const [activeSession, setActiveSession] = useState<WorkSessionDTO | null>(
    null
  );
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [pairedBgId, setPairedBgId] = useState('');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [notes, setNotes] = useState('');

  const loadData = useCallback(async () => {
    const [tRes, sRes] = await Promise.all([api.getTasks(), api.getSessions()]);
    setTasks(tRes.tasks);
    setSessions(sRes.sessions);
    const active =
      sRes.sessions.find(
        (s) => s.status === 'active' || s.status === 'paused'
      ) ?? null;
    setActiveSession(active);
    if (!selectedTaskId) {
      const firstOpen = tRes.tasks.find((t) => t.status !== 'completed');
      if (firstOpen) setSelectedTaskId(firstOpen.id);
    }
  }, [selectedTaskId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!activeSession) {
      setElapsedSeconds(0);
      return;
    }
    const updateTick = () => {
      if (activeSession.status === 'paused') {
        setElapsedSeconds(activeSession.activeMinutes * 60);
        return;
      }
      const diffSec = Math.max(
        0,
        Math.floor(
          (Date.now() - new Date(activeSession.startedAt).getTime()) / 1000
        ) -
          activeSession.pausedMinutes * 60
      );
      setElapsedSeconds(diffSec);
    };
    updateTick();
    const timer = setInterval(updateTick, 1000);
    return () => clearInterval(timer);
  }, [activeSession]);

  const openFocusTasks = tasks.filter(
    (t) => t.status !== 'completed' && t.attentionClass !== 'background'
  );
  const backgroundTasks = tasks.filter(
    (t) => t.status !== 'completed' && t.attentionClass === 'background'
  );

  const mm = String(Math.floor(elapsedSeconds / 60)).padStart(2, '0');
  const ss = String(elapsedSeconds % 60).padStart(2, '0');

  const handleStart = async () => {
    if (!selectedTaskId) return;
    await api.startSession({
      taskId: selectedTaskId,
      pairedBackgroundTaskId: pairedBgId || null,
    });
    loadData();
  };

  const handleAction = async (
    action: 'pause' | 'resume' | 'complete' | 'abandon' | 'log_interruption',
    markTaskCompleted = false
  ) => {
    if (!activeSession) return;
    await api.updateSession(activeSession.id, {
      action,
      markTaskCompleted,
      notes,
    });
    if (action === 'complete' || action === 'abandon') {
      setNotes('');
    }
    loadData();
  };

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="font-display text-2xl font-semibold text-[#1F2421]">
            Focus Mode
          </h1>
          <p className="text-sm text-[#5C645E]">
            Track active working effort separately from elapsed calendar time, and optionally pair a compatible background task.
          </p>
        </div>

        {/* Active Timer Card */}
        <section className="bg-white rounded-3xl border border-[#1F2421]/10 p-8 text-center">
          {activeSession ? (
            <div>
              <div className="text-xs font-medium text-[#58438A]">
                {activeSession.status === 'paused'
                  ? 'Session paused'
                  : 'Active focus session'}
              </div>
              <h2 className="font-display text-xl font-semibold text-[#1F2421] mt-1">
                {activeSession.taskTitle || 'Focused work'}
              </h2>
              {activeSession.pairedBackgroundTaskId && (
                <div className="text-xs text-[#265D8A] mt-1">
                  Paired background activity running alongside
                </div>
              )}

              <div className="my-8 font-mono tabular-nums text-6xl font-semibold tracking-tight text-[#1F2421]">
                {mm}:{ss}
              </div>

              <div className="max-w-md mx-auto mb-5">
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional session notes or blockers..."
                  className="w-full px-3.5 py-2 text-xs bg-[#FAF8F5] border border-[#1F2421]/10 rounded-xl"
                />
              </div>

              <div className="flex items-center justify-center gap-2.5 flex-wrap">
                {activeSession.status === 'active' ? (
                  <button
                    type="button"
                    onClick={() => handleAction('pause')}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#FBF2CE] text-[#7A5C12] text-sm font-medium"
                  >
                    <Pause className="w-4 h-4" /> Pause
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleAction('resume')}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#E5F1E9] text-[#296345] text-sm font-medium"
                  >
                    <Play className="w-4 h-4" /> Resume
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handleAction('log_interruption')}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#FAF8F5] border border-[#1F2421]/10 text-sm text-[#5C645E]"
                >
                  <PlusCircle className="w-4 h-4" /> Interruption (
                  {activeSession.interruptionCount})
                </button>

                <button
                  type="button"
                  onClick={() => handleAction('complete', false)}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#1F2421] text-white text-sm font-medium"
                >
                  <Square className="w-4 h-4" /> End session
                </button>

                <button
                  type="button"
                  onClick={() => handleAction('complete', true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#296345] text-white text-sm font-medium"
                >
                  <Check className="w-4 h-4" /> End & Complete Task
                </button>
              </div>
            </div>
          ) : (
            <div className="max-w-md mx-auto space-y-4 text-left">
              <div>
                <label className="block text-xs font-medium text-[#5C645E] mb-1">
                  Select task to focus on
                </label>
                <select
                  value={selectedTaskId}
                  onChange={(e) => setSelectedTaskId(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-[#FAF8F5] border border-[#1F2421]/10 rounded-xl"
                >
                  {openFocusTasks.length === 0 && (
                    <option value="">No open tasks available</option>
                  )}
                  {openFocusTasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title} ({formatDurationMinutes(t.recommendedMinutes)})
                    </option>
                  ))}
                </select>
              </div>

              {backgroundTasks.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-[#5C645E] mb-1">
                    Optional compatible background task
                  </label>
                  <select
                    value={pairedBgId}
                    onChange={(e) => setPairedBgId(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-[#FAF8F5] border border-[#1F2421]/10 rounded-xl"
                  >
                    <option value="">None</option>
                    {backgroundTasks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <button
                type="button"
                disabled={!selectedTaskId}
                onClick={handleStart}
                className="w-full py-3 rounded-xl bg-[#1F2421] text-white text-sm font-medium hover:bg-[#333A36] disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                <Play className="w-4 h-4" />
                <span>Start focus session</span>
              </button>
            </div>
          )}
        </section>

        {/* Recent Work Sessions */}
        <section className="bg-white rounded-2xl border border-[#1F2421]/10 p-5">
          <h2 className="font-display text-sm font-semibold text-[#1F2421] mb-3">
            Recent sessions
          </h2>
          {sessions.length === 0 ? (
            <p className="text-xs text-[#5C645E]">
              No work sessions recorded yet.
            </p>
          ) : (
            <div className="divide-y divide-[#1F2421]/5">
              {sessions.slice(0, 8).map((s) => (
                <div
                  key={s.id}
                  className="py-2.5 flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-medium text-[#1F2421]">
                      {s.taskTitle || 'Task session'}
                    </div>
                    <div className="text-[#5C645E]">
                      {s.planDate} · {s.status} · {s.interruptionCount} interruption(s)
                    </div>
                  </div>
                  <div className="font-mono tabular-nums font-semibold text-[#296345]">
                    {s.activeMinutes}m active
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </Layout>
  );
}
