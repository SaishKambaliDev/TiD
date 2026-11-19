import mongoose, { Schema, type Document } from 'mongoose';
import type {
  CalibrationCorrelation,
  CategoryPosterior,
} from '../../src/shared/types.js';

export interface IPersonalBehaviourProfile extends Document {
  userId: mongoose.Types.ObjectId;
  populationPriors: {
    defaultEffortMultiplier: number;
    priorStrength: number;
    baselinePostponementRate: number;
    baselineOnTimeRate: number;
  };
  categoryPosteriors: CategoryPosterior[];
  calibrationCorrelations: CalibrationCorrelation[];
  initiationBehaviour: {
    avgHoursBeforeDeadlineStarted: number;
    observationCount: number;
  };
  workloadTolerance: {
    optimalDailyActiveMinutes: number;
    maxObservedSustainableMinutes: number;
    overloadEventCount: number;
    observationCount: number;
  };
  deadlineSensitivity: {
    onTimeCount: number;
    lateCount: number;
    lastMinuteRushRate: number;
  };
  taskSwitchingCount: number;
  recommendationAcceptedCount: number;
  recommendationDismissedCount: number;
  updatedAt: Date;
  createdAt: Date;
}

const PersonalBehaviourProfileSchema = new Schema<IPersonalBehaviourProfile>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    populationPriors: {
      defaultEffortMultiplier: { type: Number, default: 1.15 },
      priorStrength: { type: Number, default: 4 },
      baselinePostponementRate: { type: Number, default: 0.22 },
      baselineOnTimeRate: { type: Number, default: 0.78 },
    },
    categoryPosteriors: { type: [Object], default: [] },
    calibrationCorrelations: { type: [Object], default: [] },
    initiationBehaviour: {
      avgHoursBeforeDeadlineStarted: { type: Number, default: 24 },
      observationCount: { type: Number, default: 0 },
    },
    workloadTolerance: {
      optimalDailyActiveMinutes: { type: Number, default: 240 },
      maxObservedSustainableMinutes: { type: Number, default: 360 },
      overloadEventCount: { type: Number, default: 0 },
      observationCount: { type: Number, default: 0 },
    },
    deadlineSensitivity: {
      onTimeCount: { type: Number, default: 0 },
      lateCount: { type: Number, default: 0 },
      lastMinuteRushRate: { type: Number, default: 0 },
    },
    taskSwitchingCount: { type: Number, default: 0 },
    recommendationAcceptedCount: { type: Number, default: 0 },
    recommendationDismissedCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const PersonalBehaviourProfileModel =
  mongoose.models.PersonalBehaviourProfile ||
  mongoose.model<IPersonalBehaviourProfile>(
    'PersonalBehaviourProfile',
    PersonalBehaviourProfileSchema
  );
