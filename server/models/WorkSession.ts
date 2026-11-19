import mongoose, { Schema, type Document } from 'mongoose';

export interface IWorkSession extends Document {
  userId: mongoose.Types.ObjectId;
  taskId: mongoose.Types.ObjectId;
  planDate: string;
  planBlockId: string | null;
  startedAt: Date;
  pausedAt: Date | null;
  endedAt: Date | null;
  status: 'active' | 'paused' | 'completed' | 'abandoned';
  activeMinutes: number;
  pausedMinutes: number;
  pairedBackgroundTaskId: mongoose.Types.ObjectId | null;
  interruptionCount: number;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

const WorkSessionSchema = new Schema<IWorkSession>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    taskId: {
      type: Schema.Types.ObjectId,
      ref: 'Task',
      required: true,
      index: true,
    },
    planDate: { type: String, required: true },
    planBlockId: { type: String, default: null },
    startedAt: { type: Date, required: true, default: () => new Date() },
    pausedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ['active', 'paused', 'completed', 'abandoned'],
      default: 'active',
    },
    activeMinutes: { type: Number, default: 0, min: 0 },
    pausedMinutes: { type: Number, default: 0, min: 0 },
    pairedBackgroundTaskId: {
      type: Schema.Types.ObjectId,
      ref: 'Task',
      default: null,
    },
    interruptionCount: { type: Number, default: 0, min: 0 },
    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

WorkSessionSchema.index({ userId: 1, planDate: 1, status: 1 });

export const WorkSessionModel =
  mongoose.models.WorkSession ||
  mongoose.model<IWorkSession>('WorkSession', WorkSessionSchema);
