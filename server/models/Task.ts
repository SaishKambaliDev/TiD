import mongoose, { Schema, type Document } from 'mongoose';
import type {
  AttentionClass,
  MilestoneItem,
  SplittingPreference,
  TaskCategory,
  TaskGroqAnalysis,
  TaskPriority,
  TaskStatus,
} from '../../src/shared/types.js';

export interface ITask extends Document {
  userId: mongoose.Types.ObjectId;
  title: string;
  description: string;
  category: TaskCategory;
  priority: TaskPriority;
  status: TaskStatus;
  deadline: Date | null;
  userEstimatedMinutes: number | null;
  aiEstimatedMinutes: number | null;
  recommendedMinutes: number;
  actualMinutes: number;
  elapsedCalendarMinutes: number;
  attentionClass: AttentionClass;
  overlapAllowedWith: AttentionClass[];
  splittingPreference: SplittingPreference;
  milestones: MilestoneItem[];
  dependencies: mongoose.Types.ObjectId[];
  groqAnalysis: TaskGroqAnalysis;
  scheduledDate: string | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const MilestoneSchema = new Schema<MilestoneItem>(
  {
    id: { type: String, required: true },
    title: { type: String, required: true, trim: true },
    completed: { type: Boolean, default: false },
    estimatedMinutes: { type: Number, default: 30, min: 5 },
  },
  { _id: false }
);

const TaskSchema = new Schema<ITask>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    category: {
      type: String,
      enum: [
        'coding',
        'writing',
        'studying',
        'design',
        'meeting',
        'admin',
        'research',
        'background_job',
        'personal',
        'other',
      ],
      default: 'other',
    },
    priority: {
      type: String,
      enum: ['urgent', 'high', 'medium', 'low'],
      default: 'medium',
    },
    status: {
      type: String,
      enum: ['todo', 'in_progress', 'completed', 'waiting_list'],
      default: 'todo',
    },
    deadline: { type: Date, default: null },
    userEstimatedMinutes: { type: Number, default: null, min: 5 },
    aiEstimatedMinutes: { type: Number, default: null, min: 5 },
    recommendedMinutes: { type: Number, required: true, default: 45, min: 5 },
    actualMinutes: { type: Number, default: 0, min: 0 },
    elapsedCalendarMinutes: { type: Number, default: 0, min: 0 },
    attentionClass: {
      type: String,
      enum: ['attention_intensive', 'background', 'partially_attentive'],
      default: 'attention_intensive',
    },
    overlapAllowedWith: {
      type: [String],
      enum: ['attention_intensive', 'background', 'partially_attentive'],
      default: [],
    },
    splittingPreference: {
      type: String,
      enum: ['continuous', 'shorter_sessions', 'ai_suggested'],
      default: 'ai_suggested',
    },
    milestones: { type: [MilestoneSchema], default: [] },
    dependencies: [{ type: Schema.Types.ObjectId, ref: 'Task' }],
    groqAnalysis: {
      clarifyingQuestions: { type: [String], default: [] },
      executionCharacteristics: { type: [String], default: [] },
      suggestedOverlapNote: { type: String },
      confidence: { type: Number },
      summary: { type: String },
    },
    scheduledDate: { type: String, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

TaskSchema.index({ userId: 1, status: 1, deadline: 1 });
TaskSchema.index({ userId: 1, scheduledDate: 1 });

export const TaskModel =
  mongoose.models.Task || mongoose.model<ITask>('Task', TaskSchema);
