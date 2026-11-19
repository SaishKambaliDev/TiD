import mongoose, { Schema, type Document } from 'mongoose';
import type {
  RoutineActivityType,
  RoutineOverrideAction,
} from '../../src/shared/types.js';

export interface IDailyRoutineOverride extends Document {
  userId: mongoose.Types.ObjectId;
  date: string; // YYYY-MM-DD in user timezone
  routineId: mongoose.Types.ObjectId | null;
  action: RoutineOverrideAction;
  activityName: string;
  startTime: string;
  endTime: string;
  activityType: RoutineActivityType;
  isFixed: boolean;
  isMovable: boolean;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

const DailyRoutineOverrideSchema = new Schema<IDailyRoutineOverride>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    routineId: {
      type: Schema.Types.ObjectId,
      ref: 'DailyRoutine',
      default: null,
    },
    action: {
      type: String,
      enum: ['modify', 'disable', 'add'],
      required: true,
    },
    activityName: { type: String, required: true, trim: true },
    startTime: { type: String, default: '09:00', match: /^\d{2}:\d{2}$/ },
    endTime: { type: String, default: '10:00', match: /^\d{2}:\d{2}$/ },
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
    notes: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

DailyRoutineOverrideSchema.index({ userId: 1, date: 1 });

export const DailyRoutineOverrideModel =
  mongoose.models.DailyRoutineOverride ||
  mongoose.model<IDailyRoutineOverride>(
    'DailyRoutineOverride',
    DailyRoutineOverrideSchema
  );
