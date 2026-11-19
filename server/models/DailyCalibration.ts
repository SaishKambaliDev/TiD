import mongoose, { Schema, type Document } from 'mongoose';
import type {
  AvailableCapacityChoice,
  CustomCommitment,
  EnergyLevel,
  ExtractedConstraint,
  PreferredSessionStyle,
  TimeWindow,
  WorkloadPerception,
} from '../../src/shared/types.js';

export interface IDailyCalibration extends Document {
  userId: mongoose.Types.ObjectId;
  date: string;
  status: 'pending' | 'completed' | 'skipped';
  energyLevel: EnergyLevel;
  availableCapacityChoice: AvailableCapacityChoice;
  customAvailableMinutes: number | null;
  availableWindows: TimeWindow[];
  routineChangesSummary: string;
  customCommitments: CustomCommitment[];
  workloadPerception: WorkloadPerception;
  priorityTaskIds: mongoose.Types.ObjectId[];
  customPriorities: string[];
  preferredSessionStyle: PreferredSessionStyle;
  preferredSessionMinutes: number;
  preferredBreakMinutes: number;
  unexpectedConstraintsText: string;
  extractedConstraints: ExtractedConstraint[];
  calibrationCountToday: number;
  lastUpdatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const DailyCalibrationSchema = new Schema<IDailyCalibration>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    status: {
      type: String,
      enum: ['pending', 'completed', 'skipped'],
      default: 'pending',
    },
    energyLevel: {
      type: String,
      enum: [
        'very_energetic',
        'good',
        'normal',
        'a_little_tired',
        'low_energy',
      ],
      default: 'normal',
    },
    availableCapacityChoice: {
      type: String,
      enum: [
        'full_free_time',
        'less_than_usual',
        'few_hours',
        'unusually_busy',
        'custom',
      ],
      default: 'full_free_time',
    },
    customAvailableMinutes: { type: Number, default: null },
    availableWindows: [
      {
        start: { type: String, required: true },
        end: { type: String, required: true },
      },
    ],
    routineChangesSummary: { type: String, default: '' },
    customCommitments: [
      {
        id: { type: String, required: true },
        title: { type: String, required: true },
        startTime: { type: String, required: true },
        endTime: { type: String, required: true },
        isFixed: { type: Boolean, default: true },
      },
    ],
    workloadPerception: {
      type: String,
      enum: ['light', 'manageable', 'heavy', 'overwhelming'],
      default: 'manageable',
    },
    priorityTaskIds: [{ type: Schema.Types.ObjectId, ref: 'Task' }],
    customPriorities: { type: [String], default: [] },
    preferredSessionStyle: {
      type: String,
      enum: [
        'long_uninterrupted',
        'short_frequent_breaks',
        'mixed',
        'no_preference',
      ],
      default: 'no_preference',
    },
    preferredSessionMinutes: { type: Number, default: 50, min: 15, max: 180 },
    preferredBreakMinutes: { type: Number, default: 10, min: 5, max: 45 },
    unexpectedConstraintsText: { type: String, default: '' },
    extractedConstraints: [
      {
        type: {
          type: String,
          enum: [
            'unavailable_window',
            'leave_early',
            'rest',
            'priority_target',
            'commitment',
            'note',
          ],
          default: 'note',
        },
        description: { type: String, required: true },
        startTime: { type: String },
        endTime: { type: String },
        targetTaskTitle: { type: String },
        effect: { type: String, required: true },
      },
    ],
    calibrationCountToday: { type: Number, default: 1 },
    lastUpdatedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true }
);

DailyCalibrationSchema.index({ userId: 1, date: 1 }, { unique: true });

export const DailyCalibrationModel =
  mongoose.models.DailyCalibration ||
  mongoose.model<IDailyCalibration>('DailyCalibration', DailyCalibrationSchema);
