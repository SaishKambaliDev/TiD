import mongoose, { Schema, type Document } from 'mongoose';
import type { EnergyLevel, TaskCategory } from '../../src/shared/types.js';

export interface ITaskEvent extends Document {
  userId: mongoose.Types.ObjectId;
  taskId: mongoose.Types.ObjectId | null;
  eventType:
    | 'task_created'
    | 'task_started'
    | 'task_paused'
    | 'task_completed'
    | 'task_postponed'
    | 'task_rescheduled'
    | 'estimate_updated'
    | 'calibration_recorded'
    | 'recalibrated'
    | 'recommendation_applied'
    | 'recommendation_dismissed';
  occurredAt: Date;
  localDate: string;
  category?: TaskCategory;
  userEstimatedMinutes?: number | null;
  aiEstimatedMinutes?: number | null;
  actualMinutes?: number | null;
  deadlineSlackMinutes?: number | null;
  calibrationEnergy?: EnergyLevel | null;
  metadata?: Record<string, unknown>;
}

const TaskEventSchema = new Schema<ITaskEvent>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    taskId: {
      type: Schema.Types.ObjectId,
      ref: 'Task',
      default: null,
    },
    eventType: {
      type: String,
      enum: [
        'task_created',
        'task_started',
        'task_paused',
        'task_completed',
        'task_postponed',
        'task_rescheduled',
        'estimate_updated',
        'calibration_recorded',
        'recalibrated',
        'recommendation_applied',
        'recommendation_dismissed',
      ],
      required: true,
    },
    occurredAt: { type: Date, required: true, default: () => new Date() },
    localDate: { type: String, required: true },
    category: { type: String },
    userEstimatedMinutes: { type: Number, default: null },
    aiEstimatedMinutes: { type: Number, default: null },
    actualMinutes: { type: Number, default: null },
    deadlineSlackMinutes: { type: Number, default: null },
    calibrationEnergy: { type: String, default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: false }
);

TaskEventSchema.index({ userId: 1, occurredAt: -1 });
TaskEventSchema.index({ userId: 1, localDate: 1 });

// Enforce append-only semantics
TaskEventSchema.pre(['updateOne', 'findOneAndUpdate', 'updateMany'], function () {
  throw new Error('TaskEvent history is strictly append-only.');
});

export const TaskEventModel =
  mongoose.models.TaskEvent ||
  mongoose.model<ITaskEvent>('TaskEvent', TaskEventSchema);
