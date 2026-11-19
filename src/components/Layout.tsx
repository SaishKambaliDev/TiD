import React, { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Activity,
  Bell,
  CalendarClock,
  CheckSquare,
  Compass,
  LayoutDashboard,
  Lightbulb,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
  Sparkles,
  Timer,
  X,
} from 'lucide-react';
import { DateTime } from 'luxon';
import { useAuth } from '../context/AuthContext';
import { ThemeToggle } from '../context/ThemeContext';
import { formatFriendlyDate, getContextualGreeting, getTodayLocalDate } from '../lib/format';
import type { DeadlineRiskAssessment } from '../shared/types';

interface LayoutProps {
  children: React.ReactNode;
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
  onOpenAddTask?: () => void;
  onOpenCalibration?: () => void;
  calibrationUnconfirmed?: boolean;
  notifications?: DeadlineRiskAssessment[];
}

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/tasks', label: 'My Tasks', icon: CheckSquare },
  { to: '/planner', label: 'Daily Planner', icon: CalendarClock },
  { to: '/focus', label: 'Focus Mode', icon: Timer },
  { to: '/insights', label: 'My Insights', icon: Lightbulb },
  { to: '/recommendations', label: 'Recommendations', icon: Sparkles },
  { to: '/behaviour', label: 'My Behaviour', icon: Activity },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function Layout({
  children,
  searchQuery = '',
  onSearchChange,
  onOpenAddTask,
  onOpenCalibration,
  calibrationUnconfirmed = false,
  notifications = [],
}: LayoutProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [nowClock, setNowClock] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('tid_sidebar_collapsed') === 'true';
  });

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('tid_sidebar_collapsed', String(next));
      return next;
    });
  };

  useEffect(() => {
    const tz = user?.timezone || 'UTC';
    const updateClock = () => {
      const dt = DateTime.now().setZone(tz);
      setNowClock(dt.isValid ? dt.toFormat('h:mm a') : DateTime.utc().toFormat('h:mm a'));
    };
    updateClock();
    const timer = setInterval(updateClock, 30000);
    return () => clearInterval(timer);
  }, [user?.timezone]);

  if (!user) return <>{children}</>;

  const todayStr = getTodayLocalDate(user.timezone);
  const friendlyDate = formatFriendlyDate(todayStr, user.timezone);
  const greeting = getContextualGreeting(user.name, user.timezone);
  const initials = user.name
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const alertCount =
    notifications.filter((n) => n.riskLevel === 'critical' || n.riskLevel === 'high')
      .length + (calibrationUnconfirmed ? 1 : 0);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-transparent text-[#394152] dark:text-[#ECEFF4] flex">
      {/* Desktop Left Sidebar */}
      <aside
        className={`hidden lg:flex ${
          sidebarCollapsed ? 'lg:w-20 px-3' : 'lg:w-64 px-4'
        } lg:flex-col lg:fixed lg:inset-y-0 border-r border-[#ECE6DB] dark:border-[#222938] bg-white/95 dark:bg-[#11151F]/95 backdrop-blur-xs py-6 justify-between shadow-[0_10px_28px_rgba(80,90,120,0.06)] transition-all duration-300 z-40`}
      >
        <div>
          <div className={`flex items-center ${sidebarCollapsed ? 'flex-col gap-3 px-1' : 'justify-between px-2'} mb-7`}>
            <div className={`flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-2.5'}`}>
              <div className="w-9 h-9 rounded-2xl bg-[#EAF2FE] dark:bg-[#1E293B] border border-[#9FC3F0]/60 dark:border-[#38598A] text-[#4F86DB] flex items-center justify-center shadow-xs shrink-0">
                <Compass className="w-4 h-4" />
              </div>
              {!sidebarCollapsed && (
                <div>
                  <span className="font-display text-lg font-bold tracking-tight text-[#394152] dark:text-[#ECEFF4] block leading-tight">
                    Tid
                  </span>
                  <span className="text-[11px] text-[#778092] dark:text-[#9BA3B4] block">
                    Take it Done
                  </span>
                </div>
              )}
            </div>

            {/* Sidebar Collapse Toggle Button */}
            <button
              type="button"
              onClick={toggleSidebar}
              className="p-1.5 rounded-xl border border-transparent hover:border-[#ECE6DB] dark:hover:border-[#2B3547] text-[#778092] dark:text-[#9BA3B4] hover:text-[#394152] dark:hover:text-[#ECEFF4] hover:bg-[#F6F3EC] dark:hover:bg-[#1E2536] transition-colors"
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen className="w-4 h-4" />
              ) : (
                <PanelLeftClose className="w-4 h-4" />
              )}
            </button>
          </div>

          <nav className="space-y-1" aria-label="Primary navigation">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  title={sidebarCollapsed ? item.label : undefined}
                  className={({ isActive }) =>
                    `flex items-center ${
                      sidebarCollapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3.5 py-2.5'
                    } rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
                      isActive
                        ? 'bg-[#DDEEFF] dark:bg-[#1E2C42] text-[#2F5AA3] dark:text-[#8EB9FF] font-semibold border border-[#9FC3F0]/60 dark:border-[#38598A] shadow-[0_3px_10px_rgba(79,134,219,0.14)]'
                        : 'text-[#778092] dark:text-[#9BA3B4] hover:bg-[#F6F3EC] dark:hover:bg-[#222834] hover:text-[#394152] dark:hover:text-[#ECEFF4]'
                    }`
                  }
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                </NavLink>
              );
            })}
          </nav>
        </div>

        {onOpenCalibration && (
          <div className="pt-4 border-t border-[#ECE6DB] dark:border-[#222938]">
            <button
              type="button"
              onClick={onOpenCalibration}
              title={sidebarCollapsed ? (calibrationUnconfirmed ? 'Calibrate today' : 'Recalibrate my day') : undefined}
              className={`w-full text-left rounded-2xl bg-[#FFF8E1] dark:bg-[#152136] border border-[#F4E3A8] dark:border-[#283C60] hover:bg-[#FFF3CC] dark:hover:bg-[#1C2C47] transition-colors shadow-xs ${
                sidebarCollapsed ? 'p-2.5 flex items-center justify-center text-center' : 'px-3.5 py-3'
              }`}
            >
              {sidebarCollapsed ? (
                <span className="text-base" aria-hidden="true">
                  {calibrationUnconfirmed ? '☀️' : '🔄'}
                </span>
              ) : (
                <>
                  <div className="text-xs font-bold text-[#394152] dark:text-[#E2EEFE]">
                    {calibrationUnconfirmed
                      ? '☀️ Calibrate today'
                      : '🔄 Recalibrate my day'}
                  </div>
                  <div className="text-xs text-[#6B6450] dark:text-[#90B4EC] mt-0.5">
                    {calibrationUnconfirmed
                      ? 'Confirm energy & hours'
                      : 'Adjust to new changes'}
                  </div>
                </>
              )}
            </button>
          </div>
        )}
      </aside>

      {/* Mobile Sidebar Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-[#394152]/30 backdrop-blur-[1px]"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-68 max-w-[82vw] bg-white h-full p-5 flex flex-col justify-between z-10 border-r border-[#ECE6DB] shadow-xl">
            <div>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-[#EAF2FE] text-[#4F86DB] flex items-center justify-center">
                    <Compass className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-display text-lg font-bold text-[#394152] block leading-tight">
                      Tid
                    </span>
                    <span className="text-[11px] text-[#778092] block">
                      Take it Done
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-2 rounded-xl text-[#778092] hover:bg-[#F6F3EC]"
                  aria-label="Close navigation"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <nav className="space-y-1">
                {NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      onClick={() => setMobileMenuOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${
                          isActive
                            ? 'bg-[#DDEEFF] text-[#2F5AA3] font-semibold'
                            : 'text-[#778092] hover:bg-[#F6F3EC] hover:text-[#394152]'
                        }`
                      }
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{item.label}</span>
                    </NavLink>
                  );
                })}
              </nav>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm text-[#9B3A3A] hover:bg-[#FFE3E3]"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign out</span>
            </button>
          </aside>
        </div>
      )}

      {/* Main Content Shell */}
      <div
        className={`flex-1 ${
          sidebarCollapsed ? 'lg:pl-20' : 'lg:pl-64'
        } flex flex-col min-w-0 transition-all duration-300`}
      >
        <header className="sticky top-0 z-30 bg-[#FBF9F4]/88 dark:bg-[#11151F]/90 backdrop-blur-md border-b border-[#ECE6DB] dark:border-[#222938] px-4 sm:px-6 py-3.5">
          <div className="w-full flex items-center justify-between gap-4">
            {/* Zone 1: Greeting + Date */}
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className="lg:hidden p-2 rounded-xl border border-[#ECE6DB] dark:border-[#2B313E] bg-white dark:bg-[#1B1E24] text-[#394152] dark:text-[#ECEFF4] shadow-xs"
                aria-label="Open menu"
              >
                <Menu className="w-4 h-4" />
              </button>
              <div className="min-w-0">
                <div className="font-display text-base sm:text-lg font-bold text-[#394152] dark:text-[#ECEFF4] truncate">
                  {greeting}
                </div>
                <div className="text-xs text-[#778092] dark:text-[#9BA3B4] truncate">
                  {friendlyDate} · {user.timezone}
                </div>
              </div>
            </div>

            {/* Zone 2: Search */}
            {onSearchChange ? (
              <div className="hidden md:flex items-center flex-1 max-w-sm relative">
                <Search className="w-4 h-4 text-[#778092] dark:text-[#9BA3B4] absolute left-3.5 pointer-events-none" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder="Search tasks, deadlines, categories..."
                  className="w-full pl-9 pr-4 py-2 text-sm bg-white dark:bg-[#1B1E24] border border-[#ECE6DB] dark:border-[#2E3440] rounded-full text-[#394152] dark:text-[#ECEFF4] placeholder:text-[#778092] dark:placeholder:text-[#6F7788] shadow-[0_4px_14px_rgba(80,90,120,0.05)] focus:outline-none focus:ring-2 focus:ring-[#4F86DB]/35"
                />
              </div>
            ) : (
              <div className="hidden md:block flex-1" />
            )}

            {/* Zone 3: Floating Clock + Theme Toggle + Notifications + Primary Add Task + Profile */}
            <div className="flex items-center gap-2.5 shrink-0 relative">
              {nowClock && (
                <div className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white dark:bg-[#1B1E24] border border-[#ECE6DB] dark:border-[#2E3440] text-xs font-mono font-semibold text-[#394152] dark:text-[#ECEFF4] tabular-nums shadow-[0_4px_12px_rgba(80,90,120,0.06)]">
                  <span aria-hidden="true">🕰️</span>
                  <span>{nowClock}</span>
                </div>
              )}

              {/* Theme Toggle Button in Navbar */}
              <ThemeToggle />

              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setNotifOpen((v) => !v);
                    setProfileOpen(false);
                  }}
                  className="relative p-2.5 rounded-full bg-white dark:bg-[#1B1E24] border border-[#ECE6DB] dark:border-[#2E3440] text-[#778092] dark:text-[#9BA3B4] hover:text-[#394152] dark:hover:text-[#ECEFF4] hover:bg-[#F6F3EC] dark:hover:bg-[#222834] transition-colors shadow-[0_4px_12px_rgba(80,90,120,0.06)]"
                  aria-label="Notifications"
                >
                  <Bell className="w-4 h-4" />
                  {alertCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#E05D5D] text-white text-[10px] font-mono font-bold flex items-center justify-center tabular-nums">
                      {alertCount}
                    </span>
                  )}
                </button>

                {notifOpen && (
                  <div className="absolute right-0 mt-2 w-80 paper-card p-4 z-50">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-display text-sm font-bold text-[#394152] dark:text-[#ECEFF4]">
                        Schedule &amp; Risk Alerts
                      </span>
                      <button
                        type="button"
                        onClick={() => setNotifOpen(false)}
                        className="text-xs text-[#778092] dark:text-[#9BA3B4] hover:text-[#394152] dark:hover:text-[#ECEFF4]"
                      >
                        Close
                      </button>
                    </div>
                    <div className="space-y-2.5 max-h-72 overflow-y-auto">
                      {calibrationUnconfirmed && onOpenCalibration && (
                        <button
                          type="button"
                          onClick={() => {
                            setNotifOpen(false);
                            onOpenCalibration();
                          }}
                          className="w-full text-left p-3 q-card text-[#394152] hover:opacity-95"
                        >
                          <div className="text-xs font-bold">
                            Today’s context not confirmed
                          </div>
                          <div className="text-xs text-[#6B6450] mt-0.5">
                            Take 30s to calibrate energy and available hours.
                          </div>
                        </button>
                      )}
                      {notifications.length === 0 && !calibrationUnconfirmed && (
                        <p className="text-xs text-[#778092]">
                          No active deadline conflicts or alerts right now.
                        </p>
                      )}
                      {notifications.map((r) => (
                        <div
                          key={r.taskId}
                          className="p-2.5 rounded-xl bg-[#FCFAF5] border border-[#ECE6DB]"
                        >
                          <div className="text-xs font-semibold text-[#394152]">
                            {r.title}
                          </div>
                          <div className="text-xs text-[#778092] mt-0.5">
                            {r.riskLevel.toUpperCase()} risk · {r.explanation}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {onOpenAddTask && (
                <button
                  type="button"
                  onClick={onOpenAddTask}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#4F86DB] hover:bg-[#3C6FC4] text-white text-sm font-semibold shadow-[0_6px_16px_rgba(79,134,219,0.28)] transition-all hover:-translate-y-0.5 whitespace-nowrap shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add task</span>
                </button>
              )}

              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setProfileOpen((v) => !v);
                    setNotifOpen(false);
                  }}
                  className="w-9 h-9 rounded-full bg-[#DDEEFF] dark:bg-[#1E2C42] text-[#2F5AA3] dark:text-[#8EB9FF] font-display text-xs font-bold flex items-center justify-center border border-[#9FC3F0] dark:border-[#38598A] shadow-xs"
                  aria-label="User profile menu"
                >
                  {initials}
                </button>
                {profileOpen && (
                  <div className="absolute right-0 mt-2 w-60 paper-card p-3 z-50">
                    <div className="px-2 py-1.5 border-b border-[#ECE6DB] dark:border-[#2B313E] mb-1.5">
                      <div className="text-sm font-bold text-[#394152] dark:text-[#ECEFF4] truncate">
                        {user.name}
                      </div>
                      <div className="text-xs text-[#778092] dark:text-[#9BA3B4] truncate">
                        {user.email}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setProfileOpen(false);
                        navigate('/settings');
                      }}
                      className="w-full text-left px-2.5 py-2 rounded-xl text-sm text-[#394152] dark:text-[#ECEFF4] hover:bg-[#F6F3EC] dark:hover:bg-[#222834]"
                    >
                      Routine &amp; Preferences
                    </button>
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="w-full text-left px-2.5 py-2 rounded-xl text-sm text-[#9B3A3A] dark:text-[#E07A7A] hover:bg-[#FFF1F0] dark:hover:bg-[#321C1C] flex items-center gap-2"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Sign out</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        <main
          className={`flex-1 ${
            sidebarCollapsed ? 'px-6 sm:px-12 lg:px-14' : 'px-4 sm:px-8'
          } py-6 max-w-7xl w-full mx-auto transition-all duration-300`}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
