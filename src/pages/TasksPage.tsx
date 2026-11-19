import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Circle, Edit3, Play, Trash2 } from 'lucide-react';
import { AddTaskModal } from '../components/AddTaskModal';
import { Layout } from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import {
  formatAttentionLabel,
  formatCategoryLabel,
  formatDurationMinutes,
  formatShortDeadline,
} from '../lib/format';
import type { TaskDTO, TaskStatus } from '../shared/types';

export function TasksPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<TaskDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | TaskStatus>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TaskDTO | null>(null);

  const loadTasks = useCallback(async () => {
    const res = await api.getTasks();
    setTasks(res.tasks);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const filtered = tasks.filter((t) => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      t.title.toLowerCase().includes(q) ||
      t.category.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q)
    );
  });

  const handleToggle = async (task: TaskDTO) => {
    await api.updateTask(task.id, {
      status: task.status === 'completed' ? 'todo' : 'completed',
    });
    loadTasks();
  };

  const handleDelete = async (task: TaskDTO) => {
    await api.deleteTask(task.id);
    loadTasks();
  };

  return (
    <Layout
      searchQuery={search}
      onSearchChange={setSearch}
      onOpenAddTask={() => {
        setEditing(null);
        setModalOpen(true);
      }}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-2xl font-semibold text-[#1F2421]">
            My Tasks
          </h1>
          <p className="text-sm text-[#5C645E]">
            Complete task inventory with separate User, Groq AI, Bayesian recommended, and Actual effort tracking.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-[#F3EFE8] rounded-xl self-start">
          {(
            [
              ['all', 'All'],
              ['todo', 'To do'],
              ['in_progress', 'In progress'],
              ['waiting_list', 'Waiting list'],
              ['completed', 'Completed'],
            ] as const
          ).map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => setStatusFilter(val)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                statusFilter === val
                  ? 'bg-white text-[#1F2421] shadow-xs'
                  : 'text-[#5C645E] hover:text-[#1F2421]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="h-48 bg-white rounded-2xl border border-[#1F2421]/10 animate-pulse" />
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#1F2421]/10 p-10 text-center">
          <p className="text-sm font-medium text-[#1F2421]">
            No tasks match your current filter.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-[#1F2421]/10 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#1F2421]/10 text-xs text-[#5C645E]">
                <th className="py-3 px-4 font-medium">Task</th>
                <th className="py-3 px-3 font-medium">Category & Attention</th>
                <th className="py-3 px-3 font-medium">Deadline</th>
                <th className="py-3 px-3 font-medium text-right">User Est</th>
                <th className="py-3 px-3 font-medium text-right">AI Est</th>
                <th className="py-3 px-3 font-medium text-right">Recommended</th>
                <th className="py-3 px-3 font-medium text-right">Actual</th>
                <th className="py-3 px-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1F2421]/5 text-sm">
              {filtered.map((t) => (
                <tr key={t.id} className="hover:bg-[#FAF8F5]/70">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => handleToggle(t)}
                        className="text-[#5C645E] hover:text-[#296345]"
                      >
                        {t.status === 'completed' ? (
                          <CheckCircle2 className="w-4 h-4 text-[#296345]" />
                        ) : (
                          <Circle className="w-4 h-4" />
                        )}
                      </button>
                      <div>
                        <div
                          className={`font-medium ${
                            t.status === 'completed'
                              ? 'line-through text-[#838A84]'
                              : 'text-[#1F2421]'
                          }`}
                        >
                          {t.title}
                        </div>
                        <div className="text-xs text-[#5C645E]">
                          {t.priority} · {t.status.replace('_', ' ')}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-3 text-xs text-[#5C645E]">
                    <div>{formatCategoryLabel(t.category)}</div>
                    <div className="text-[11px] text-[#838A84]">
                      {formatAttentionLabel(t.attentionClass)}
                    </div>
                  </td>
                  <td className="py-3 px-3 text-xs font-mono tabular-nums text-[#5C645E]">
                    {formatShortDeadline(t.deadline, user?.timezone)}
                  </td>
                  <td className="py-3 px-3 text-xs font-mono tabular-nums text-right">
                    {t.userEstimatedMinutes
                      ? formatDurationMinutes(t.userEstimatedMinutes)
                      : '—'}
                  </td>
                  <td className="py-3 px-3 text-xs font-mono tabular-nums text-right text-[#58438A]">
                    {t.aiEstimatedMinutes
                      ? formatDurationMinutes(t.aiEstimatedMinutes)
                      : '—'}
                  </td>
                  <td className="py-3 px-3 text-xs font-mono tabular-nums text-right font-semibold text-[#1F2421]">
                    {formatDurationMinutes(t.recommendedMinutes)}
                  </td>
                  <td className="py-3 px-3 text-xs font-mono tabular-nums text-right text-[#296345]">
                    {t.actualMinutes > 0
                      ? formatDurationMinutes(t.actualMinutes)
                      : '—'}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="inline-flex items-center gap-1">
                      {t.status !== 'completed' && (
                        <button
                          type="button"
                          onClick={async () => {
                            await api.startSession({ taskId: t.id });
                            navigate('/focus');
                          }}
                          className="p-1.5 rounded-lg text-[#296345] hover:bg-[#E5F1E9]"
                          title="Start focus"
                        >
                          <Play className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(t);
                          setModalOpen(true);
                        }}
                        className="p-1.5 rounded-lg text-[#5C645E] hover:bg-[#F3EFE8]"
                        title="Edit task"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(t)}
                        className="p-1.5 rounded-lg text-[#AD5134] hover:bg-[#FCECE5]"
                        title="Delete task"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <AddTaskModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          existingTasks={tasks}
          initialTask={editing}
          onSaved={(_saved, goToPlanner) => {
            loadTasks();
            if (goToPlanner) navigate('/planner');
          }}
        />
      )}
    </Layout>
  );
}
