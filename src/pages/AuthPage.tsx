import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ThemeToggle } from '../context/ThemeContext';
import { ApiError } from '../lib/api';

const COMMON_TIMEZONES = [
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

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const navigate = useNavigate();
  const { login, register, health } = useAuth();
  const detectedTz =
    Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [timezone, setTimezone] = useState(
    COMMON_TIMEZONES.includes(detectedTz) ? detectedTz : 'UTC'
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? 'Good morning ☀️' : hour < 17 ? 'Good afternoon 🌤️' : 'Good evening 🌙';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (mode === 'register') {
        await register({ name, email, password, timezone });
      } else {
        await login(email, password);
      }
      navigate('/dashboard');
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Authentication failed.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 relative overflow-hidden">
      {/* Background ambient accents positioned safely with zero overlap */}
      <div
        aria-hidden="true"
        className="fixed inset-0 pointer-events-none select-none overflow-hidden -z-10"
      >
        <div
          className="float-bob absolute top-12 left-10 text-4xl opacity-20 dark:opacity-10 hidden xl:block"
          style={{ animationDuration: '8s' }}
        >
          📝
        </div>
        <div
          className="float-bob absolute top-16 right-14 text-4xl opacity-20 dark:opacity-10 hidden xl:block"
          style={{ animationDelay: '-3s', animationDuration: '9s' }}
        >
          ☕
        </div>
        <div
          className="float-bob absolute bottom-12 left-16 text-4xl opacity-20 dark:opacity-10 hidden xl:block"
          style={{ animationDelay: '-5s', animationDuration: '10s' }}
        >
          🌿
        </div>
      </div>

      {/* Top right Theme Toggle */}
      <div className="absolute top-5 right-6 z-20">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-5xl relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          {/* Left Story / Welcome Column */}
          <div className="lg:col-span-7 flex flex-col justify-between py-2 pr-0 lg:pr-4">
            <div>
              {/* Application Name & Full Form */}
              <div className="mb-5">
                <div className="font-display text-4xl sm:text-5xl font-extrabold tracking-tight text-[#394152] dark:text-[#ECEFF4]">
                  Tid
                </div>
                <div className="text-xs sm:text-sm text-[#778092] dark:text-[#9BA3B4] font-medium tracking-wide mt-0.5">
                  take it done
                </div>
              </div>

              <p className="text-sm font-semibold text-[#B07A3A] dark:text-[#60A5FA] mt-2">
                {greeting}
              </p>
              <h1 className="font-display text-3xl sm:text-4xl font-bold text-[#394152] dark:text-[#F1F5F9] mt-1 tracking-tight leading-snug">
                The Choice of Today
              </h1>

              {/* 3 colorful step cards with concise, punchy text (no long sentences) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mt-8">
                <div className="rounded-[20px] border border-[#ECE6DB] dark:border-[#283850] bg-[#FFF6CC] dark:bg-[#161D2B] p-4 shadow-sm transition-all hover:-translate-y-0.5">
                  <div className="text-2xl mb-1.5" aria-hidden="true">📝</div>
                  <div className="font-display text-sm font-bold text-[#394152] dark:text-[#E2EEFE]">
                    Calibrate Energy
                  </div>
                  <div className="text-xs text-[#6B6450] dark:text-[#88A6D3] mt-0.5">
                    Daily check-in
                  </div>
                </div>

                <div className="rounded-[20px] border border-[#ECE6DB] dark:border-[#283850] bg-[#DDEEFF] dark:bg-[#142034] p-4 shadow-sm transition-all hover:-translate-y-0.5">
                  <div className="text-2xl mb-1.5" aria-hidden="true">🕰️</div>
                  <div className="font-display text-sm font-bold text-[#394152] dark:text-[#BBD7FF]">
                    Plan Routines
                  </div>
                  <div className="text-xs text-[#4C5C74] dark:text-[#8AA4C4] mt-0.5">
                    Adaptive timeline
                  </div>
                </div>

                <div className="rounded-[20px] border border-[#ECE6DB] dark:border-[#38263E] bg-[#FFE2EE] dark:bg-[#20162A] p-4 shadow-sm transition-all hover:-translate-y-0.5">
                  <div className="text-2xl mb-1.5" aria-hidden="true">💫</div>
                  <div className="font-display text-sm font-bold text-[#394152] dark:text-[#E4B8F5]">
                    Smart Learning
                  </div>
                  <div className="text-xs text-[#6E495A] dark:text-[#B385C7] mt-0.5">
                    Habit insights
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 text-xs text-[#778092] dark:text-[#9BA3B4]">
              Tid — Take it Done · Personal Task &amp; Daily Planning Workspace
            </div>
          </div>

          {/* Right Form Paper Card */}
          <div className="lg:col-span-5 paper-card p-7 sm:p-8 flex flex-col justify-center">
            <h2 className="font-display text-2xl font-bold text-[#394152] dark:text-[#ECEFF4]">
              {mode === 'register' ? 'Begin your workspace' : 'Welcome back'}
            </h2>
            <p className="text-sm text-[#778092] dark:text-[#9BA3B4] mt-1">
              {mode === 'register'
                ? 'Your routines, calibrations, and personal model stay private.'
                : 'Sign in to open your Dashboard and Daily Planner.'}
            </p>

            {health && !health.databaseConnected && (
              <div className="mt-4 p-3 rounded-xl bg-[#FFF8E1] dark:bg-[#1C2330] border border-[#F4E3A8] dark:border-[#2C3B52] text-[#7A5C12] dark:text-[#90B8F0] text-xs">
                MongoDB is currently disconnected ({health.databaseError || 'MONGODB_URI not set'}).
              </div>
            )}

            {error && (
              <div className="mt-4 p-3 rounded-xl bg-[#FFF1F0] dark:bg-[#2D1616] border border-[#F6D5D2] dark:border-[#4F2626] text-[#AD5134] dark:text-[#F08888] text-xs font-medium">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              {mode === 'register' && (
                <div>
                  <label className="block text-xs font-semibold text-[#778092] dark:text-[#9BA3B4] mb-1">
                    Full name
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Alex Rivera"
                    className="w-full px-3.5 py-2.5 text-sm bg-[#FBF9F4] dark:bg-[#16191F] border border-[#ECE6DB] dark:border-[#2E3440] text-[#394152] dark:text-[#ECEFF4] placeholder:text-[#778092] dark:placeholder:text-[#656E80] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#4F86DB]/35"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-[#778092] dark:text-[#9BA3B4] mb-1">
                  Email address
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-3.5 py-2.5 text-sm bg-[#FBF9F4] dark:bg-[#16191F] border border-[#ECE6DB] dark:border-[#2E3440] text-[#394152] dark:text-[#ECEFF4] placeholder:text-[#778092] dark:placeholder:text-[#656E80] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#4F86DB]/35"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#778092] dark:text-[#9BA3B4] mb-1">
                  Password
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full px-3.5 py-2.5 text-sm bg-[#FBF9F4] dark:bg-[#16191F] border border-[#ECE6DB] dark:border-[#2E3440] text-[#394152] dark:text-[#ECEFF4] placeholder:text-[#778092] dark:placeholder:text-[#656E80] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#4F86DB]/35"
                />
              </div>

              {mode === 'register' && (
                <div>
                  <label className="block text-xs font-semibold text-[#778092] dark:text-[#9BA3B4] mb-1">
                    Local timezone
                  </label>
                  <select
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-[#FBF9F4] dark:bg-[#16191F] border border-[#ECE6DB] dark:border-[#2E3440] text-[#394152] dark:text-[#ECEFF4] rounded-xl"
                  >
                    {!COMMON_TIMEZONES.includes(detectedTz) && (
                      <option value={detectedTz}>{detectedTz}</option>
                    )}
                    {COMMON_TIMEZONES.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 px-6 rounded-full bg-[#4F86DB] hover:bg-[#3C6FC4] text-white text-sm font-semibold shadow-[0_6px_16px_rgba(79,134,219,0.28)] transition-all hover:-translate-y-0.5 disabled:opacity-60 cursor-pointer"
              >
                {submitting
                  ? 'Please wait...'
                  : mode === 'register'
                    ? 'Begin my day'
                    : 'Sign in to workspace'}
              </button>
            </form>

            <div className="mt-5 text-xs text-[#778092] dark:text-[#9BA3B4] text-center">
              {mode === 'register' ? (
                <>
                  Already have an account?{' '}
                  <Link
                    to="/login"
                    className="font-semibold text-[#4F86DB] hover:underline"
                  >
                    Sign in
                  </Link>
                </>
              ) : (
                <>
                  New to Tid · Take it Done?{' '}
                  <Link
                    to="/register"
                    className="font-semibold text-[#4F86DB] hover:underline"
                  >
                    Create an account
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
