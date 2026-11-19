import mongoose, { Schema, type Document } from 'mongoose';
import type {
  CapacityBreakdown,
  ScheduledTaskBlockDTO,
  UnscheduledTaskEntry,
} from '../../src/shared/types.js';

export interface IDailyPlanRevision extends Document {
  userId: mongoose.Types.ObjectId;
  date: string;
  revisionNumber: number;
  triggerReason:
    | 'initial_generate'
    | 'manual_edit'
    | 'recalibration'
    | 'task_completed';
  blocksSnapshot: ScheduledTaskBlockDTO[];
  capacityBreakdownSnapshot: CapacityBreakdown;
  unscheduledSnapshot: UnscheduledTaskEntry[];
  diffSummary: string[];
  createdAt: Date;
}

const DailyPlanRevisionSchema = new Schema<IDailyPlanRevision>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    revisionNumber: { type: Number, required: true },
    triggerReason: {
      type: String,
      enum: [
        'initial_generate',
        'manual_edit',
        'recalibration',
        'task_completed',
      ],
      required: true,
    },
    blocksSnapshot: { type: [Object], default: [] },
    capacityBreakdownSnapshot: { type: Schema.Types.Mixed, required: true },
    unscheduledSnapshot: { type: [Object], default: [] },
    diffSummary: { type: [String], default: [] },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

DailyPlanRevisionSchema.index({ userId: 1, date: 1, revisionNumber: -1 });

export const DailyPlanRevisionModel =
  mongoose.models.DailyPlanRevision ||
  mongoose.model<IDailyPlanRevision>(
    'DailyPlanRevision',
    DailyPlanRevisionSchema
  );
