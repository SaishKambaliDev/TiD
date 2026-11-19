import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, ArrowRight, Check, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import type {
  AvailableCapacityChoice,
  CustomCommitment,
  DailyCalibrationDTO,
  EnergyLevel,
  PreferredSessionStyle,
  RecalibrationProposal,
  TaskDTO,
  WorkloadPerception,
} from '../shared/types';

interface DailyCalibrationModalProps {
  open: boolean;
  date: string;
  existingCalibration: DailyCalibrationDTO | null;
  tasks: TaskDTO[];
  mode: 'initial' | 'recalibrate';
  onClose: () => void;
  onCompleted: (calibration: DailyCalibrationDTO, goToPlanner?: boolean) => void;
}

export function DailyCalibrationModal({
  open,
  date,
  existingCalibration,
  tasks,
  mode,
  onClose,
  onCompleted,
}: DailyCalibrationModalProps) {
  const [step, setStep] = useState(0);
  const [energyLevel, setEnergyLevel] = useState<EnergyLevel>(
    existingCalibration?.energyLevel ?? 'normal'
  );
  const [capacityChoice, setCapacityChoice] = useState<AvailableCapacityChoice>(
    existingCalibration?.availableCapacityChoice ?? 'full_free_time'
  );
  const [customAvailableHours, setCustomAvailableHours] = useState(
    existingCalibration?.customAvailableMinutes
      ? String(Math.round((existingCalibration.customAvailableMinutes / 60) * 10) / 10)
      : '4'
  );
  const [windowStart, setWindowStart] = useState(
    existingCalibration?.availableWindows?.[0]?.start ?? ''
  );
  const [windowEnd, setWindowEnd] = useState(
    existingCalibration?.availableWindows?.[0]?.end ?? ''
  );
  const [hasRoutineChanges, setHasRoutineChanges] = useState(
    Boolean(existingCalibration?.customCommitments?.length)
  );
  const [customCommitments, setCustomCommitments] = useState<CustomCommitment[]>(
    existingCalibration?.customCommitments ?? []
  );
  const [newCommitTitle, setNewCommitTitle] = useState('');
  const [newCommitStart, setNewCommitStart] = useState('14:00');
  const [newCommitEnd, setNewCommitEnd] = useState('15:00');

  const [workloadPerception, setWorkloadPerception] =
    useState<WorkloadPerception>(
      existingCalibration?.workloadPerception ?? 'manageable'
    );
  const [priorityTaskIds, setPriorityTaskIds] = useState<string[]>(
    existingCalibration?.priorityTaskIds ?? []
  );
  const [customPriorityText, setCustomPriorityText] = useState('');
  const [customPriorities, setCustomPriorities] = useState<string[]>(
    existingCalibration?.customPriorities ?? []
  );
  const [sessionStyle, setSessionStyle] = useState<PreferredSessionStyle>(
    existingCalibration?.preferredSessionStyle ?? 'no_preference'
  );
  const [sessionMinutes, setSessionMinutes] = useState(
    existingCalibration?.preferredSessionMinutes ?? 50
  );
  const [breakMinutes, setBreakMinutes] = useState(
    existingCalibration?.preferredBreakMinutes ?? 10
  );
  const [constraintsText, setConstraintsText] = useState(
    existingCalibration?.unexpectedConstraintsText ?? ''
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recalProposal, setRecalProposal] =
    useState<RecalibrationProposal | null>(null);
  const [savedCalibration, setSavedCalibration] =
    useState<DailyCalibrationDTO | null>(null);

  if (!open) return null;

  const openTasks = tasks.filter((t) => t.status !== 'completed');

  const handleSkip = async () => {
    setSaving(true);
    try {
      const res = await api.saveCalibration({
        date,
        status: 'skipped',
      });
      onCompleted(res.calibration, false);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to skip.');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async (goToPlanner: boolean) => {
    setSaving(true);
    setError(null);
    try {
      const availableWindows =
        windowStart && windowEnd
          ? [{ start: windowStart, end: windowEnd }]
          : [];
      const customAvailableMinutes =
        capacityChoice === 'custom'
          ? Math.max(30, Math.round(Number(customAvailableHours || 3) * 60))
          : null;

      const res = await api.saveCalibration({
        date,
        status: 'completed',
        energyLevel,
        availableCapacityChoice: capacityChoice,
        customAvailableMinutes,
        availableWindows,
        routineChangesSummary: hasRoutineChanges
          ? `${customCommitments.length} temporary commitment(s)`
          : 'No changes',
        customCommitments: hasRoutineChanges ? customCommitments : [],
        workloadPerception,
        priorityTaskIds,
        customPriorities,
        preferredSessionStyle: sessionStyle,
        preferredSessionMinutes: sessionMinutes,
        preferredBreakMinutes: breakMinutes,
        unexpectedConstraintsText: constraintsText,
      });

      if (mode === 'recalibrate') {
        const proposalRes = await api.recalibratePlan(date, false);
        setSavedCalibration(res.calibration);
        setRecalProposal(proposalRes.proposal);
        setSaving(false);
        return;
      }

      onCompleted(res.calibration, goToPlanner);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save calibration.');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmRecalibration = async () => {
    if (!savedCalibration) return;
    setSaving(true);
    try {
      await api.recalibratePlan(date, true);
      onCompleted(savedCalibration, true);
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Could not apply recalibrated schedule.'
      );
    } finally {
      setSaving(false);
    }
  };

  if (recalProposal && savedCalibration) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 dark:bg-black/75 backdrop-blur-md dark:backdrop-blur-xl transition-all duration-300">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
          className="w-full max-w-xl paper-card p-6 dark:bg-[#1A1D24] dark:border-[#384050] dark:shadow-[0_25px_60px_rgba(0,0,0,0.85)]"
        >
          <h2 className="font-display text-lg font-bold text-[#394152] dark:text-[#ECEFF4]">
            Proposed schedule update
          </h2>
          <p className="text-xs text-[#778092] dark:text-[#9BA3B4] mt-1">
            Completed work and active sessions are preserved. Review changes before committing a new plan revision.
          </p>

          <div className="mt-4 space-y-2 max-h-60 overflow-y-auto">
            {recalProposal.diffSummary.map((line, i) => (
              <div
                key={i}
                className="px-3.5 py-2.5 rounded-xl bg-[#FBF9F4] dark:bg-[#14171D] border border-[#ECE6DB] dark:border-[#2E3440] text-sm text-[#394152] dark:text-[#ECEFF4]"
              >
                {line}
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between text-xs font-mono tabular-nums text-[#778092] dark:text-[#9BA3B4] px-1">
            <span>
              Available: {recalProposal.proposedCapacity.availableMinutes}m
            </span>
            <span>
              Scheduled: {recalProposal.proposedCapacity.scheduledTaskMinutes}m
            </span>
            <span>
              Unscheduled: {recalProposal.proposedUnscheduled.length}
            </span>
          </div>

          {error && (
            <div className="mt-3 p-2.5 rounded-xl bg-[#FFF1F0] dark:bg-[#321818] text-[#9B3A3A] dark:text-[#F29494] text-xs">
              {error}
            </div>
          )}

          <div className="mt-6 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={() => {
                onCompleted(savedCalibration, false);
                onClose();
              }}
              className="px-4 py-2 rounded-full border border-[#ECE6DB] dark:border-[#384050] text-sm font-semibold text-[#778092] dark:text-[#9BA3B4] hover:bg-[#F6F3EC] dark:hover:bg-[#252A34]"
            >
              Keep current schedule
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleConfirmRecalibration}
              className="px-5 py-2 rounded-full bg-[#4F86DB] hover:bg-[#3C6FC4] text-white text-sm font-semibold shadow-[0_6px_16px_rgba(79,134,219,0.25)]"
            >
              {saving ? 'Applying...' : 'Confirm & apply revision'}
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  const totalSteps = 7;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 dark:bg-black/75 backdrop-blur-md dark:backdrop-blur-xl transition-all duration-300">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        className="w-full max-w-xl paper-card p-6 sm:p-7 dark:bg-[#1A1D24] dark:border-[#384050] dark:shadow-[0_25px_60px_rgba(0,0,0,0.85)]"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-xs font-bold text-[#2F5AA3] dark:text-[#8EB9FF]">
            <Sparkles className="w-3.5 h-3.5 text-[#4F86DB]" />
            <span>
              {mode === 'recalibrate' ? 'Recalibrate my day' : 'Daily check-in'} · Step {step + 1} of {totalSteps}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSkip}
              disabled={saving}
              className="text-xs font-semibold text-[#778092] dark:text-[#9BA3B4] hover:text-[#394152] dark:hover:text-[#ECEFF4] px-2.5 py-1 rounded-full hover:bg-[#F6F3EC] dark:hover:bg-[#252A34]"
            >
              Skip for now
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-[#F6F3EC] dark:hover:bg-[#252A34] text-[#778092] dark:text-[#9BA3B4]"
              aria-label="Close calibration"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Progress track */}
        <div className="h-2 w-full bg-[#EFEAE0] dark:bg-[#282C35] rounded-full overflow-hidden mb-6">
          <div
            className="h-full bg-[#4F86DB] rounded-full transition-all duration-300"
            style={{ width: `${((step + 1) / totalSteps) * 100}%` }}
          />
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-[#FFF1F0] border border-[#F6D5D2] text-[#9B3A3A] text-xs font-medium">
            {error}
          </div>
        )}

        {/* Step 0: Energy */}
        {step === 0 && (
          <div>
            <h2 className="font-display text-xl font-bold text-[#394152]">
              How are you feeling today?
            </h2>
            <p className="text-sm text-[#778092] mt-1">
              This shapes today’s pacing and breaks without changing your permanent behaviour profile.
            </p>
            <div className="mt-5 flex flex-wrap gap-2.5">
              {(
                [
                  ['very_energetic', '⚡ Very energetic'],
                  ['good', '☀️ Good'],
                  ['normal', '⚖️ Normal'],
                  ['a_little_tired', '☕ A little tired'],
                  ['low_energy', '🌿 Low energy'],
                ] as const
              ).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => {
                    setEnergyLevel(val);
                    if (val === 'low_energy' || val === 'a_little_tired') {
                      setSessionStyle('short_frequent_breaks');
                      setSessionMinutes(30);
                      setBreakMinutes(15);
                    }
                  }}
                  className={`mchip px-4 py-2.5 text-sm font-semibold ${
                    energyLevel === val ? 'mchip-on' : 'text-[#394152]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {(energyLevel === 'low_energy' || energyLevel === 'a_little_tired') && (
              <div className="mt-4 q-card px-4 py-3 text-xs font-semibold text-[#6B6450]">
                💛 We’ll suggest shorter sessions, extra buffer time, and focus on essential work first.
              </div>
            )}
          </div>
        )}

        {/* Step 1: Available time */}
        {step === 1 && (
          <div>
            <h2 className="font-display text-xl font-bold text-[#394152]">
              How much time can you realistically dedicate today?
            </h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {(
                [
                  ['full_free_time', 'Almost entire planned free time'],
                  ['less_than_usual', 'Less than usual'],
                  ['few_hours', 'Only a few hours'],
                  ['unusually_busy', 'Unusually busy'],
                  ['custom', 'Specify my available hours'],
                ] as const
              ).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setCapacityChoice(val)}
                  className={`mchip px-4 py-2.5 text-xs font-semibold ${
                    capacityChoice === val ? 'mchip-on' : 'text-[#394152]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {capacityChoice !== 'full_free_time' && (
              <div className="mt-4 p-4 rounded-2xl bg-[#FBF9F4] border border-[#ECE6DB] space-y-3">
                {capacityChoice === 'custom' && (
                  <div>
                    <label className="block text-xs font-semibold text-[#778092] mb-1">
                      Total available work hours today
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      max="16"
                      value={customAvailableHours}
                      onChange={(e) => setCustomAvailableHours(e.target.value)}
                      className="w-32 px-3 py-1.5 text-sm bg-white border border-[#ECE6DB] rounded-xl font-mono tabular-nums"
                    />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#778092] mb-1">
                      Optional window start
                    </label>
                    <input
                      type="time"
                      value={windowStart}
                      onChange={(e) => setWindowStart(e.target.value)}
                      className="w-full px-3 py-1.5 text-sm bg-white border border-[#ECE6DB] rounded-xl font-mono tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#778092] mb-1">
                      Window end
                    </label>
                    <input
                      type="time"
                      value={windowEnd}
                      onChange={(e) => setWindowEnd(e.target.value)}
                      className="w-full px-3 py-1.5 text-sm bg-white border border-[#ECE6DB] rounded-xl font-mono tabular-nums"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Changes in today's routine */}
        {step === 2 && (
          <div>
            <h2 className="font-display text-xl font-bold text-[#394152]">
              Anything different about your day today?
            </h2>
            <p className="text-sm text-[#778092] mt-1">
              One-day changes override today’s schedule without altering your recurring routine.
            </p>

            <div className="mt-4 flex gap-2.5">
              <button
                type="button"
                onClick={() => setHasRoutineChanges(false)}
                className={`flex-1 mchip py-2.5 px-3 text-sm font-semibold ${
                  !hasRoutineChanges ? 'mchip-on' : 'text-[#778092]'
                }`}
              >
                No changes today
              </button>
              <button
                type="button"
                onClick={() => setHasRoutineChanges(true)}
                className={`flex-1 mchip py-2.5 px-3 text-sm font-semibold ${
                  hasRoutineChanges ? 'mchip-on' : 'text-[#778092]'
                }`}
              >
                Add today’s commitments
              </button>
            </div>

            {hasRoutineChanges && (
              <div className="mt-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={newCommitTitle}
                    onChange={(e) => setNewCommitTitle(e.target.value)}
                    placeholder="Meeting, travel, appointment..."
                    className="sm:col-span-3 px-3.5 py-2 text-sm bg-[#FBF9F4] border border-[#ECE6DB] rounded-xl"
                  />
                  <input
                    type="time"
                    value={newCommitStart}
                    onChange={(e) => setNewCommitStart(e.target.value)}
                    className="px-3 py-1.5 text-sm bg-[#FBF9F4] border border-[#ECE6DB] rounded-xl font-mono"
                  />
                  <input
                    type="time"
                    value={newCommitEnd}
                    onChange={(e) => setNewCommitEnd(e.target.value)}
                    className="px-3 py-1.5 text-sm bg-[#FBF9F4] border border-[#ECE6DB] rounded-xl font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!newCommitTitle.trim()) return;
                      setCustomCommitments((prev) => [
                        ...prev,
                        {
                          id: `cc-${Date.now()}`,
                          title: newCommitTitle.trim(),
                          startTime: newCommitStart,
                          endTime: newCommitEnd,
                          isFixed: true,
                        },
                      ]);
                      setNewCommitTitle('');
                    }}
                    className="inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-full bg-[#4F86DB] text-white text-xs font-semibold"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add
                  </button>
                </div>

                {customCommitments.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-[#FBF9F4] border border-[#ECE6DB] text-xs"
                  >
                    <span>
                      <strong className="text-[#394152]">{c.title}</strong> ·{' '}
                      <span className="font-mono tabular-nums text-[#778092]">
                        {c.startTime}–{c.endTime}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setCustomCommitments((prev) =>
                          prev.filter((x) => x.id !== c.id)
                        )
                      }
                      className="text-[#9B3A3A]"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 3: Workload perception */}
        {step === 3 && (
          <div>
            <h2 className="font-display text-xl font-bold text-[#394152]">
              How does today’s workload feel?
            </h2>
            <p className="text-sm text-[#778092] mt-1">
              Subjective signal used to keep buffers realistic.
            </p>
            <div className="mt-5 flex flex-wrap gap-2.5">
              {(
                [
                  ['light', '🌤️ Light'],
                  ['manageable', '👌 Manageable'],
                  ['heavy', '📚 Heavy'],
                  ['overwhelming', '🌊 Overwhelming'],
                ] as const
              ).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setWorkloadPerception(val)}
                  className={`mchip px-4 py-2.5 text-sm font-semibold ${
                    workloadPerception === val ? 'mchip-on' : 'text-[#394152]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 4: Today's main priorities */}
        {step === 4 && (
          <div>
            <h2 className="font-display text-xl font-bold text-[#394152]">
              Anything that absolutely must get done today?
            </h2>
            <p className="text-sm text-[#778092] mt-1">
              Your explicit priorities will always be protected first in the Planner.
            </p>
            <div className="mt-4 space-y-2 max-h-48 overflow-y-auto">
              {openTasks.map((t) => {
                const selected = priorityTaskIds.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() =>
                      setPriorityTaskIds((prev) =>
                        selected
                          ? prev.filter((id) => id !== t.id)
                          : [...prev, t.id]
                      )
                    }
                    className={`w-full text-left px-3.5 py-2.5 rounded-xl border text-sm flex items-center justify-between transition-colors ${
                      selected
                        ? 'bg-[#DDEEFF] border-[#9FC3F0] text-[#2F5AA3] font-semibold'
                        : 'bg-[#FBF9F4] border-[#ECE6DB] text-[#394152] hover:bg-[#F6F3EC]'
                    }`}
                  >
                    <span className="truncate">{t.title}</span>
                    {selected && <Check className="w-4 h-4 shrink-0" />}
                  </button>
                );
              })}
              {openTasks.length === 0 && (
                <p className="text-xs text-[#778092]">
                  No open tasks yet — add a custom priority below if needed.
                </p>
              )}
            </div>
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                value={customPriorityText}
                onChange={(e) => setCustomPriorityText(e.target.value)}
                placeholder="Or type a custom priority..."
                className="flex-1 px-3.5 py-2 text-sm bg-[#FBF9F4] border border-[#ECE6DB] rounded-xl"
              />
              <button
                type="button"
                onClick={() => {
                  if (!customPriorityText.trim()) return;
                  setCustomPriorities((p) => [...p, customPriorityText.trim()]);
                  setCustomPriorityText('');
                }}
                className="px-4 py-2 rounded-full bg-white border border-[#ECE6DB] text-xs font-semibold hover:bg-[#F6F3EC]"
              >
                Add
              </button>
            </div>
            {customPriorities.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-[#2F5AA3]">
                {customPriorities.map((cp, idx) => (
                  <span key={idx} className="bg-[#DDEEFF] px-3 py-1 rounded-full font-semibold">
                    {cp}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 5: Preferred working style */}
        {step === 5 && (
          <div>
            <h2 className="font-display text-xl font-bold text-[#394152]">
              How would you prefer to work today?
            </h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {(
                [
                  ['long_uninterrupted', 'Long, uninterrupted sessions', 75, 15],
                  ['short_frequent_breaks', 'Short sessions + frequent breaks', 30, 10],
                  ['mixed', 'Mixture of both', 50, 10],
                  ['no_preference', 'No preference', 50, 10],
                ] as const
              ).map(([val, label, defSess, defBrk]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => {
                    setSessionStyle(val);
                    setSessionMinutes(defSess);
                    setBreakMinutes(defBrk);
                  }}
                  className={`mchip px-4 py-2.5 text-xs font-semibold ${
                    sessionStyle === val ? 'mchip-on' : 'text-[#394152]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#778092] mb-1">
                  Session length (min)
                </label>
                <input
                  type="number"
                  min={15}
                  max={180}
                  value={sessionMinutes}
                  onChange={(e) => setSessionMinutes(Number(e.target.value) || 45)}
                  className="w-full px-3 py-2 text-sm bg-[#FBF9F4] border border-[#ECE6DB] rounded-xl font-mono tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#778092] mb-1">
                  Break length (min)
                </label>
                <input
                  type="number"
                  min={5}
                  max={45}
                  value={breakMinutes}
                  onChange={(e) => setBreakMinutes(Number(e.target.value) || 10)}
                  className="w-full px-3 py-2 text-sm bg-[#FBF9F4] border border-[#ECE6DB] rounded-xl font-mono tabular-nums"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 6: Unexpected constraints */}
        {step === 6 && (
          <div>
            <h2 className="font-display text-xl font-bold text-[#394152]">
              Anything else we should consider today?
            </h2>
            <p className="text-sm text-[#778092] mt-1">
              Optional note — Groq extracts explicit times or constraints without inventing commitments.
            </p>
            <textarea
              rows={3}
              value={constraintsText}
              onChange={(e) => setConstraintsText(e.target.value)}
              placeholder="e.g., I have to leave early at 16:30, and I need a 30 min rest around 14:00."
              className="mt-4 w-full px-3.5 py-2.5 text-sm bg-[#FBF9F4] border border-[#ECE6DB] rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#4F86DB]/35"
            />
          </div>
        )}

        {/* Footer navigation */}
        <div className="mt-6 pt-4 border-t border-[#ECE6DB] flex items-center justify-between">
          <button
            type="button"
            disabled={step === 0}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-[#ECE6DB] text-xs font-semibold text-[#778092] hover:bg-[#F6F3EC] disabled:opacity-30"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>

          {step < totalSteps - 1 ? (
            <button
              type="button"
              onClick={() => setStep((s) => Math.min(totalSteps - 1, s + 1))}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-[#4F86DB] hover:bg-[#3C6FC4] text-white text-xs font-semibold shadow-[0_6px_16px_rgba(79,134,219,0.25)]"
            >
              Next <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <div className="flex items-center gap-2">
              {mode === 'initial' && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => handleSave(false)}
                  className="px-4 py-2 rounded-full border border-[#ECE6DB] text-xs font-semibold text-[#394152] hover:bg-[#F6F3EC]"
                >
                  Save context
                </button>
              )}
              <button
                type="button"
                disabled={saving}
                onClick={() => handleSave(true)}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-[#4F86DB] hover:bg-[#3C6FC4] text-white text-xs font-semibold shadow-[0_6px_16px_rgba(79,134,219,0.28)] disabled:opacity-60"
              >
                {saving
                  ? 'Calibrating...'
                  : mode === 'recalibrate'
                    ? 'Preview schedule changes'
                    : 'Save & Build Today’s Plan'}
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
