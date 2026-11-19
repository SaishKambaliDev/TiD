import mongoose, { Schema, type Document } from 'mongoose';
import type { RoutineActivityType } from '../../src/shared/types.js';

export interface IDailyRoutine extends Document {
  userId: mongoose.Types.ObjectId;
  activityName: string;
  startTime: string;
  endTime: string;
  daysOfWeek: number[]; // ISO 1 (Mon) .. 7 (Sun)
  activityType: RoutineActivityType;
  isFixed: boolean;
  isMovable: boolean;
  isActive: boolean;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

const DailyRoutineSchema = new Schema<IDailyRoutine>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    activityName: { type: String, required: true, trim: true },
    startTime: { type: String, required: true, match: /^\d{2}:\d{2}$/ },
    endTime: { type: String, required: true, match: /^\d{2}:\d{2}$/ },
    daysOfWeek: {
      type: [Number],
      default: [1, 2, 3, 4, 5, 6, 7],
    },
    activityType: {
      type: String,
      enum: [
        'sleep',
        'meal',
        'work_office',
        'college',
        'exercise',
        'commute',
        'personal',
        'break',
      ],
      default: 'personal',
    },
    isFixed: { type: Boolean, default: true },
    isMovable: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    notes: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

DailyRoutineSchema.index({ userId: 1, isActive: 1 });

export const DailyRoutineModel =
  mongoose.models.DailyRoutine ||
  mongoose.model<IDailyRoutine>('DailyRoutine', DailyRoutineSchema);
