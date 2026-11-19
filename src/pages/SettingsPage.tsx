import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Layout } from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { api, ApiError } from '../lib/api';
import type { DailyRoutineDTO, RoutineActivityType } from '../shared/types';

const TIMEZONES = [
  'UTC',
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
];

const WEEKDAYS = [
  [1, 'Mon'],
  [2, 'Tue'],
  [3, 'Wed'],
  [4, 'Thu'],
  [5, 'Fri'],
  [6, 'Sat'],
  [7, 'Sun'],
] as const;

export function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [timezone, setTimezone] = useState(user?.timezone ?? 'UTC');
  const [workStart, setWorkStart] = useState(
    user?.workingHours?.start ?? '09:00'
  );
  const [workEnd, setWorkEnd] = useState(user?.workingHours?.end ?? '18:00');
  const [breakMin, setBreakMin] = useState(user?.defaultBreakMinutes ?? 15);
  const [sessionMin, setSessionMin] = useState(
    user?.defaultSessionMinutes ?? 50
  );
  const [bufferPct, setBufferPct] = useState(
    Math.round((user?.defaultBufferRatio ?? 0.12) * 100)
  );
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [routines, setRoutines] = useState<DailyRoutineDTO[]>([]);
  const [activityName, setActivityName] = useState('');
  const [startTime, setStartTime] = useState('23:00');
  const [endTime, setEndTime] = useState('07:00');
  const [activityType, setActivityType] =
    useState<RoutineActivityType>('sleep');
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([1, 2, 3, 4, 5, 6, 7]);
  const [isFixed, setIsFixed] = useState(true);
  const [isMovable, setIsMovable] = useState(false);
  const [notes, setNotes] = useState('');

  const loadRoutines = useCallback(async () => {
    const res = await api.getRoutines();
    setRoutines(res.routines);
  }, []);

  useEffect(() => {
    loadRoutines();
  }, [loadRoutines]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavedMsg(null);
    setErrorMsg(null);
    try {
      await api.updateSettings({
        name,
        timezone,
        workingHours: { start: workStart, end: workEnd },
        defaultBreakMinutes: breakMin,
        defaultSessionMinutes: sessionMin,
        defaultBufferRatio: Math.min(0.4, Math.max(0, bufferPct / 100)),
      });
      await refreshUser();
      setSavedMsg('Preferences saved.');
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Save failed.');
    }
  };

  const handleAddRoutine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activityName.trim() || daysOfWeek.length === 0) return;
    await api.createRoutine({
      activityName: activityName.trim(),
      startTime,
      endTime,
      daysOfWeek,
      activityType,
      isFixed,
      isMovable,
      isActive: true,
      notes,
    });
    setActivityName('');
    setNotes('');
    loadRoutines();
  };

  return (
    <Layout>
      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="font-display text-2xl font-semibold text-[#1F2421]">
            Settings & Daily Routine
          </h1>
          <p className="text-sm text-[#5C645E]">
            Configure your timezone, working hours (including cross-midnight schedules), and recurring weekly commitments.
          </p>
        </div>

        {/* User Preferences */}
        <form
          onSubmit={handleSaveSettings}
          className="bg-white rounded-2xl border border-[#1F2421]/10 p-6 space-y-4"
        >
          <h2 className="font-display text-base font-semibold text-[#1F2421]">
            Profile & Capacity Defaults
          </h2>

          {savedMsg && (
            <div className="p-3 rounded-xl bg-[#E5F1E9] text-[#296345] text-xs font-medium">
              {savedMsg}
            </div>
          )}
          {errorMsg && (
            <div className="p-3 rounded-xl bg-[#FCECE5] text-[#AD5134] text-xs font-medium">
              {errorMsg}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#5C645E] mb-1">
                Display name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-[#FAF8F5] border border-[#1F2421]/10 rounded-xl"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#5C645E] mb-1">
                IANA Timezone
              </label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-[#FAF8F5] border border-[#1F2421]/10 rounded-xl"
              >
                {!TIMEZONES.includes(timezone) && (
                  <option value={timezone}>{timezone}</option>
                )}
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#5C645E] mb-1">
                Working hours start
              </label>
              <input
                type="time"
                value={workStart}
                onChange={(e) => setWorkStart(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-[#FAF8F5] border border-[#1F2421]/10 rounded-xl font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#5C645E] mb-1">
                Working hours end (supports cross-midnight)
              </label>
              <input
                type="time"
                value={workEnd}
                onChange={(e) => setWorkEnd(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-[#FAF8F5] border border-[#1F2421]/10 rounded-xl font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#5C645E] mb-1">
                Default session length (min)
              </label>
              <input
                type="number"
                min={15}
                max={180}
                value={sessionMin}
                onChange={(e) => setSessionMin(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm bg-[#FAF8F5] border border-[#1F2421]/10 rounded-xl font-mono tabular-nums"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#5C645E] mb-1">
                Default break (min) & buffer (%)
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  min={5}
                  max={60}
                  value={breakMin}
                  onChange={(e) => setBreakMin(Number(e.target.value))}
                  className="px-3 py-2 text-sm bg-[#FAF8F5] border border-[#1F2421]/10 rounded-xl font-mono tabular-nums"
                />
                <input
                  type="number"
                  min={0}
                  max={40}
                  value={bufferPct}
                  onChange={(e) => setBufferPct(Number(e.target.value))}
                  className="px-3 py-2 text-sm bg-[#FAF8F5] border border-[#1F2421]/10 rounded-xl font-mono tabular-nums"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="px-4 py-2 rounded-xl bg-[#1F2421] text-white text-xs font-medium hover:bg-[#333A36]"
          >
            Save preferences
          </button>
        </form>

        {/* Recurring Daily Routine Configuration */}
        <section className="bg-white rounded-2xl border border-[#1F2421]/10 p-6 space-y-5">
          <div>
            <h2 className="font-display text-base font-semibold text-[#1F2421]">
              Recurring Daily Routine
            </h2>
            <p className="text-xs text-[#5C645E] mt-0.5">
              Define sleep, meals, college/office hours, or exercise. Sleep crossing midnight (e.g. 23:00–07:00) is automatically split across days.
            </p>
          </div>

          <form
            onSubmit={handleAddRoutine}
            className="p-4 rounded-xl bg-[#FAF8F5] border border-[#1F2421]/10 space-y-3"
          >
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <input
                type="text"
                required
                value={activityName}
                onChange={(e) => setActivityName(e.target.value)}
                placeholder="Sleep, Lunch, Office hours..."
                className="sm:col-span-2 px-3 py-2 text-sm bg-white border border-[#1F2421]/10 rounded-xl"
              />
              <select
                value={activityType}
                onChange={(e) =>
                  setActivityType(e.target.value as RoutineActivityType)
                }
                className="px-3 py-2 text-sm bg-white border border-[#1F2421]/10 rounded-xl"
              >
                <option value="sleep">Sleep</option>
                <option value="meal">Meal</option>
                <option value="work_office">Office hours</option>
                <option value="college">College / Class</option>
                <option value="exercise">Exercise</option>
                <option value="commute">Commute</option>
                <option value="personal">Personal</option>
                <option value="break">Break</option>
              </select>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="px-2 py-2 text-xs bg-white border border-[#1F2421]/10 rounded-xl font-mono"
                />
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="px-2 py-2 text-xs bg-white border border-[#1F2421]/10 rounded-xl font-mono"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                {WEEKDAYS.map(([num, label]) => {
                  const active = daysOfWeek.includes(num);
                  return (
                    <button
                      key={num}
                      type="button"
                      onClick={() =>
                        setDaysOfWeek((prev) =>
                          active
                            ? prev.filter((d) => d !== num)
                            : [...prev, num].sort()
                        )
                      }
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium ${
                        active
                          ? 'bg-[#EFEBF8] text-[#58438A]'
                          : 'bg-white border border-[#1F2421]/10 text-[#5C645E]'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-4 text-xs text-[#5C645E]">
                <label className="inline-flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={isFixed}
                    onChange={(e) => setIsFixed(e.target.checked)}
                  />
                  Fixed
                </label>
                <label className="inline-flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={isMovable}
                    onChange={(e) => setIsMovable(e.target.checked)}
                  />
                  Movable
                </label>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1 px-3.5 py-2 rounded-xl bg-[#1F2421] text-white text-xs font-medium"
                >
                  <Plus className="w-3.5 h-3.5" /> Add routine
                </button>
              </div>
            </div>
          </form>

          {routines.length === 0 ? (
            <p className="text-xs text-[#5C645E]">
              No recurring routine blocks defined yet.
            </p>
          ) : (
            <div className="divide-y divide-[#1F2421]/5">
              {routines.map((r) => (
                <div
                  key={r.id}
                  className="py-3 flex items-center justify-between gap-3 text-sm"
                >
                  <div>
                    <div className="font-medium text-[#1F2421]">
                      {r.activityName}
                    </div>
                    <div className="text-xs text-[#5C645E] font-mono tabular-nums">
                      {r.startTime}–{r.endTime} · {r.activityType} ·{' '}
                      {r.isFixed ? 'Fixed' : 'Flexible'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        await api.updateRoutine(r.id, {
                          isActive: !r.isActive,
                        });
                        loadRoutines();
                      }}
                      className={`px-2.5 py-1 rounded-lg text-xs ${
                        r.isActive
                          ? 'bg-[#E5F1E9] text-[#296345]'
                          : 'bg-[#F3EFE8] text-[#5C645E]'
                      }`}
                    >
                      {r.isActive ? 'Active' : 'Paused'}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await api.deleteRoutine(r.id);
                        loadRoutines();
                      }}
                      className="p-1.5 rounded-lg text-[#AD5134] hover:bg-[#FCECE5]"
                      aria-label="Delete routine"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
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
