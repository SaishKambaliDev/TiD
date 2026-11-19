import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Sparkles, X, Plus, Trash2, CalendarClock } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { formatDurationMinutes } from '../lib/format';
import type {
  AttentionClass,
  SplittingPreference,
  TaskCategory,
  TaskDTO,
  TaskPriority,
} from '../shared/types';

interface AddTaskModalProps {
  open: boolean;
  onClose: () => void;
  existingTasks: TaskDTO[];
  initialTask?: TaskDTO | null;
  onSaved: (task: TaskDTO, goToPlanner?: boolean) => void;
}

export function AddTaskModal({
  open,
  onClose,
  existingTasks,
  initialTask,
  onSaved,
}: AddTaskModalProps) {
  const isEditing = Boolean(initialTask);

  const [nlPrompt, setNlPrompt] = useState(initialTask?.description ?? '');
  const [title, setTitle] = useState(initialTask?.title ?? '');
  const [description, setDescription] = useState(
    initialTask?.description ?? ''
  );
  const [category, setCategory] = useState<TaskCategory>(
    initialTask?.category ?? 'coding'
  );
  const [priority, setPriority] = useState<TaskPriority>(
    initialTask?.priority ?? 'medium'
  );
  const [deadlineLocal, setDeadlineLocal] = useState(
    initialTask?.deadline
      ? new Date(initialTask.deadline).toISOString().slice(0, 16)
      : ''
  );
  const [userEstimatedMinutes, setUserEstimatedMinutes] = useState<string>(
    initialTask?.userEstimatedMinutes
      ? String(initialTask.userEstimatedMinutes)
      : ''
  );
  const [aiEstimatedMinutes, setAiEstimatedMinutes] = useState<number | null>(
    initialTask?.aiEstimatedMinutes ?? null
  );
  const [bayesianRecommended, setBayesianRecommended] = useState<number | null>(
    initialTask?.recommendedMinutes ?? null
  );
  const [attentionClass, setAttentionClass] = useState<AttentionClass>(
    initialTask?.attentionClass ?? 'attention_intensive'
  );
  const [splittingPreference, setSplittingPreference] =
    useState<SplittingPreference>(
      initialTask?.splittingPreference ?? 'ai_suggested'
    );
  const [milestones, setMilestones] = useState<
    Array<{ id?: string; title: string; estimatedMinutes: number; completed: boolean }>
  >(initialTask?.milestones ?? []);
  const [dependencies, setDependencies] = useState<string[]>(
    initialTask?.dependencies ?? []
  );
  const [clarifyingQuestions, setClarifyingQuestions] = useState<string[]>(
    initialTask?.groqAnalysis?.clarifyingQuestions ?? []
  );
  const [executionCharacteristics, setExecutionCharacteristics] = useState<
    string[]
  >(initialTask?.groqAnalysis?.executionCharacteristics ?? []);
  const [overlapNote, setOverlapNote] = useState<string>(
    initialTask?.groqAnalysis?.suggestedOverlapNote ?? ''
  );
  const [capacityHint, setCapacityHint] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleAnalyzeWithGroq = async () => {
    const sourceText = (nlPrompt || title || description).trim();
    if (!sourceText) {
      setError('Describe the task in plain language first.');
      return;
    }
    setAnalyzing(true);
    setError(null);
    try {
      const res = await api.understandTask(sourceText);
      const a = res.analysis;
      setTitle(a.title);
      setDescription(sourceText);
      setCategory(a.category);
      setPriority(a.priority);
      if (a.deadlineISO) {
        setDeadlineLocal(new Date(a.deadlineISO).toISOString().slice(0, 16));
      }
      // Store AI estimate independently without overwriting user's estimate!
      setAiEstimatedMinutes(a.aiEstimatedMinutes);
      setBayesianRecommended(res.bayesianRecommendedMinutes);
      setAttentionClass(a.attentionClass);
      setMilestones(
        a.milestones.map((m) => ({
          title: m.title,
          estimatedMinutes: m.estimatedMinutes,
          completed: false,
        }))
      );
      setClarifyingQuestions(a.clarifyingQuestions);
      setExecutionCharacteristics(a.executionCharacteristics);
      setOverlapNote(a.suggestedOverlapNote);
      if (res.matchedDependencies.length > 0) {
        setDependencies(res.matchedDependencies.map((d) => d.id));
      }
      setCapacityHint(
        `Today's available capacity: ${formatDurationMinutes(res.todayCapacity.availableMinutes)}`
      );
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Could not reach Groq task analyzer.'
      );
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSubmit = async (goToPlanner: boolean) => {
    if (!title.trim()) {
      setError('Task title is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const parsedUserEst = userEstimatedMinutes.trim()
        ? Math.max(5, Number(userEstimatedMinutes))
        : null;

      const payload = {
        title: title.trim(),
        description: description.trim() || nlPrompt.trim(),
        category,
        priority,
        deadline: deadlineLocal
          ? new Date(deadlineLocal).toISOString()
          : null,
        userEstimatedMinutes: parsedUserEst,
        aiEstimatedMinutes,
        attentionClass,
        overlapAllowedWith:
          attentionClass === 'background'
            ? ['attention_intensive', 'partially_attentive']
            : [],
        splittingPreference,
        milestones,
        dependencies,
        groqAnalysis: {
          clarifyingQuestions,
          executionCharacteristics,
          suggestedOverlapNote: overlapNote || undefined,
        },
      };

      const res = isEditing && initialTask
        ? await api.updateTask(initialTask.id, payload)
        : await api.createTask(payload);
      onSaved(res.task, goToPlanner);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save task.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 dark:bg-black/75 backdrop-blur-md dark:backdrop-blur-xl transition-all duration-300">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-[#1A1D24] rounded-2xl border border-[#1F2421]/10 dark:border-[#384050] shadow-xl dark:shadow-[0_25px_60px_rgba(0,0,0,0.85)] p-6"
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-display text-lg font-semibold text-[#1F2421]">
              {isEditing ? 'Edit task' : 'New task'}
            </h2>
            <p className="text-xs text-[#5C645E] mt-0.5">
              Describe naturally for Groq extraction or enter details directly. Your own estimate is always preserved separately.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-[#FAF8F5] text-[#5C645E]"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!isEditing && (
          <div className="mb-5 p-4 rounded-xl bg-[#FAF8F5] border border-[#1F2421]/10">
            <label className="block text-xs font-medium text-[#1F2421] mb-1.5">
              Natural-language task description
            </label>
            <textarea
              rows={2}
              value={nlPrompt}
              onChange={(e) => setNlPrompt(e.target.value)}
              placeholder="e.g., Implement OAuth token refresh tests before Thursday 5pm, about 2 hours of deep coding"
              className="w-full px-3 py-2 text-sm bg-white border border-[#1F2421]/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#58438A]/30"
            />
            <div className="mt-2.5 flex items-center justify-between gap-3 flex-wrap">
              <button
                type="button"
                onClick={handleAnalyzeWithGroq}
                disabled={analyzing}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#EFEBF8] text-[#58438A] text-xs font-semibold hover:bg-[#E4DCF5] transition-colors disabled:opacity-60"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{analyzing ? 'Analyzing with Groq...' : 'Analyze with Groq'}</span>
              </button>
              {capacityHint && (
                <span className="text-xs font-mono tabular-nums text-[#296345]">
                  {capacityHint}
                </span>
              )}
            </div>
          </div>
        )}

        {clarifyingQuestions.length > 0 && (
          <div className="mb-4 p-3.5 rounded-xl bg-[#FBF2CE] text-[#1F2421]">
            <div className="text-xs font-semibold mb-1">
              Clarifying considerations
            </div>
            <ul className="text-xs text-[#5C645E] space-y-1 list-disc pl-4">
              {clarifyingQuestions.map((q, idx) => (
                <li key={idx}>{q}</li>
              ))}
            </ul>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-[#FCECE5] text-[#AD5134] text-xs font-medium">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#5C645E] mb-1">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title"
              className="w-full px-3 py-2 text-sm bg-[#FAF8F5] border border-[#1F2421]/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#58438A]/30"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#5C645E] mb-1">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as TaskCategory)}
                className="w-full px-3 py-2 text-sm bg-[#FAF8F5] border border-[#1F2421]/10 rounded-xl"
              >
                <option value="coding">Coding</option>
                <option value="writing">Writing</option>
                <option value="studying">Studying</option>
                <option value="design">Design</option>
                <option value="research">Research</option>
                <option value="meeting">Meeting</option>
                <option value="admin">Admin</option>
                <option value="background_job">Background job</option>
                <option value="personal">Personal</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#5C645E] mb-1">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full px-3 py-2 text-sm bg-[#FAF8F5] border border-[#1F2421]/10 rounded-xl"
              >
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#5C645E] mb-1">
                Deadline
              </label>
              <input
                type="datetime-local"
                value={deadlineLocal}
                onChange={(e) => setDeadlineLocal(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-[#FAF8F5] border border-[#1F2421]/10 rounded-xl font-mono tabular-nums"
              />
            </div>
          </div>

          {/* Separate User vs AI vs Bayesian Estimates */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-xl bg-[#FAF8F5] border border-[#1F2421]/10">
            <div>
              <label className="block text-xs font-medium text-[#1F2421] mb-1">
                Your effort estimate (min)
              </label>
              <input
                type="number"
                min={5}
                max={2400}
                value={userEstimatedMinutes}
                onChange={(e) => setUserEstimatedMinutes(e.target.value)}
                placeholder="e.g. 90"
                className="w-full px-3 py-2 text-sm bg-white border border-[#1F2421]/10 rounded-xl font-mono tabular-nums"
              />
            </div>
            <div>
              <div className="text-xs font-medium text-[#5C645E] mb-1">
                Groq AI estimate
              </div>
              <div className="px-3 py-2 text-sm bg-white border border-[#1F2421]/10 rounded-xl font-mono tabular-nums text-[#58438A]">
                {aiEstimatedMinutes ? `${aiEstimatedMinutes}m` : 'Not analyzed'}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-[#5C645E] mb-1">
                Bayesian recommended
              </div>
              <div className="px-3 py-2 text-sm bg-white border border-[#1F2421]/10 rounded-xl font-mono tabular-nums text-[#296345]">
                {bayesianRecommended ? `${bayesianRecommended}m` : 'Auto on save'}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#5C645E] mb-1">
                Execution attention class
              </label>
              <select
                value={attentionClass}
                onChange={(e) =>
                  setAttentionClass(e.target.value as AttentionClass)
                }
                className="w-full px-3 py-2 text-sm bg-[#FAF8F5] border border-[#1F2421]/10 rounded-xl"
              >
                <option value="attention_intensive">
                  Attention-intensive (no overlap)
                </option>
                <option value="background">
                  Background activity (can overlap)
                </option>
                <option value="partially_attentive">
                  Partially attentive (conditional)
                </option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#5C645E] mb-1">
                Session splitting preference
              </label>
              <select
                value={splittingPreference}
                onChange={(e) =>
                  setSplittingPreference(e.target.value as SplittingPreference)
                }
                className="w-full px-3 py-2 text-sm bg-[#FAF8F5] border border-[#1F2421]/10 rounded-xl"
              >
                <option value="ai_suggested">Suggested AI allocation</option>
                <option value="shorter_sessions">Multiple shorter sessions</option>
                <option value="continuous">Continuous uninterrupted block</option>
              </select>
            </div>
          </div>

          {overlapNote && (
            <p className="text-xs text-[#265D8A] bg-[#E4F0F8] px-3 py-2 rounded-xl">
              {overlapNote}
            </p>
          )}

          {/* Milestones */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-[#5C645E]">
                Milestones ({milestones.length})
              </label>
              <button
                type="button"
                onClick={() =>
                  setMilestones((prev) => [
                    ...prev,
                    { title: '', estimatedMinutes: 25, completed: false },
                  ])
                }
                className="inline-flex items-center gap-1 text-xs font-medium text-[#58438A] hover:underline"
              >
                <Plus className="w-3 h-3" /> Add milestone
              </button>
            </div>
            {milestones.length > 0 && (
              <div className="space-y-2">
                {milestones.map((m, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={m.title}
                      onChange={(e) => {
                        const copy = [...milestones];
                        copy[idx].title = e.target.value;
                        setMilestones(copy);
                      }}
                      placeholder={`Milestone ${idx + 1}`}
                      className="flex-1 px-3 py-1.5 text-xs bg-[#FAF8F5] border border-[#1F2421]/10 rounded-lg"
                    />
                    <input
                      type="number"
                      min={5}
                      value={m.estimatedMinutes}
                      onChange={(e) => {
                        const copy = [...milestones];
                        copy[idx].estimatedMinutes = Number(e.target.value) || 20;
                        setMilestones(copy);
                      }}
                      className="w-20 px-2 py-1.5 text-xs bg-[#FAF8F5] border border-[#1F2421]/10 rounded-lg font-mono tabular-nums"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setMilestones(milestones.filter((_, i) => i !== idx))
                      }
                      className="p-1.5 text-[#AD5134] hover:bg-[#FCECE5] rounded-lg"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Dependencies */}
          {existingTasks.filter((t) => t.id !== initialTask?.id && t.status !== 'completed').length > 0 && (
            <div>
              <label className="block text-xs font-medium text-[#5C645E] mb-1.5">
                Depends on prerequisite tasks
              </label>
              <div className="flex flex-wrap gap-2">
                {existingTasks
                  .filter((t) => t.id !== initialTask?.id && t.status !== 'completed')
                  .slice(0, 10)
                  .map((t) => {
                    const selected = dependencies.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() =>
                          setDependencies((prev) =>
                            selected
                              ? prev.filter((id) => id !== t.id)
                              : [...prev, t.id]
                          )
                        }
                        className={`px-2.5 py-1 rounded-lg text-xs border transition-colors ${
                          selected
                            ? 'bg-[#EFEBF8] border-[#58438A]/30 text-[#58438A] font-medium'
                            : 'bg-[#FAF8F5] border-[#1F2421]/10 text-[#5C645E]'
                        }`}
                      >
                        {t.title}
                      </button>
                    );
                  })}
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 pt-4 border-t border-[#1F2421]/10 flex items-center justify-end gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm text-[#5C645E] hover:bg-[#FAF8F5]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => handleSubmit(false)}
            className="px-4 py-2 rounded-xl bg-[#FAF8F5] border border-[#1F2421]/15 text-sm font-medium text-[#1F2421] hover:bg-[#F3EFE8] disabled:opacity-60"
          >
            {saving ? 'Saving...' : isEditing ? 'Save changes' : 'Save task'}
          </button>
          {!isEditing && (
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSubmit(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#1F2421] text-white text-sm font-medium hover:bg-[#333A36] disabled:opacity-60"
            >
              <CalendarClock className="w-4 h-4" />
              <span>Save & Plan in Planner</span>
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
