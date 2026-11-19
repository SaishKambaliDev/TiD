import mongoose, { Schema, type Document } from 'mongoose';
import type {
  CapacityBreakdown,
  ScheduleConflict,
  ScheduledTaskBlockDTO,
  UnscheduledTaskEntry,
} from '../../src/shared/types.js';

export interface IDailyPlan extends Document {
  userId: mongoose.Types.ObjectId;
  date: string;
  timezone: string;
  revisionNumber: number;
  calibrationConfirmed: boolean;
  capacityBreakdown: CapacityBreakdown;
  blocks: ScheduledTaskBlockDTO[];
  unscheduledTasks: UnscheduledTaskEntry[];
  conflicts: ScheduleConflict[];
  createdAt: Date;
  updatedAt: Date;
}

const ScheduledBlockSchema = new Schema<ScheduledTaskBlockDTO>(
  {
    id: { type: String, required: true },
    kind: {
      type: String,
      enum: ['task', 'break', 'routine', 'commitment'],
      required: true,
    },
    taskId: { type: String, default: null },
    title: { type: String, required: true },
    category: { type: String },
    priority: { type: String },
    startMinute: { type: Number, required: true },
    endMinute: { type: Number, required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    status: {
      type: String,
      enum: ['planned', 'in_progress', 'completed', 'skipped'],
      default: 'planned',
    },
    isSplitPart: { type: Boolean, default: false },
    splitIndex: { type: Number, default: 1 },
    splitTotal: { type: Number, default: 1 },
    attentionClass: { type: String, default: null },
    isOverlapping: { type: Boolean, default: false },
    overlapWithBlockId: { type: String, default: null },
    overlapConfirmed: { type: Boolean, default: false },
    efficiencyNote: { type: String, default: null },
    isFixed: { type: Boolean, default: false },
  },
  { _id: false }
);

const DailyPlanSchema = new Schema<IDailyPlan>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    timezone: { type: String, required: true, default: 'UTC' },
    revisionNumber: { type: Number, default: 1 },
    calibrationConfirmed: { type: Boolean, default: false },
    capacityBreakdown: {
      totalWakingMinutes: { type: Number, default: 0 },
      committedMinutes: { type: Number, default: 0 },
      availableMinutes: { type: Number, default: 0 },
      scheduledTaskMinutes: { type: Number, default: 0 },
      unallocatedMinutes: { type: Number, default: 0 },
      bufferMinutes: { type: Number, default: 0 },
    },
    blocks: { type: [ScheduledBlockSchema], default: [] },
    unscheduledTasks: { type: [Object], default: [] },
    conflicts: { type: [Object], default: [] },
  },
  { timestamps: true }
);

DailyPlanSchema.index({ userId: 1, date: 1 }, { unique: true });

export const DailyPlanModel =
  mongoose.models.DailyPlan ||
  mongoose.model<IDailyPlan>('DailyPlan', DailyPlanSchema);
