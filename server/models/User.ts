import mongoose, { Schema, type Document } from 'mongoose';

export interface IUser extends Document {
  email: string;
  passwordHash: string;
  name: string;
  timezone: string;
  workingHours: {
    start: string;
    end: string;
  };
  defaultBreakMinutes: number;
  defaultBufferRatio: number;
  defaultSessionMinutes: number;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    timezone: {
      type: String,
      required: true,
      default: 'UTC',
    },
    workingHours: {
      start: { type: String, default: '09:00' },
      end: { type: String, default: '18:00' },
    },
    defaultBreakMinutes: {
      type: Number,
      default: 15,
      min: 5,
      max: 60,
    },
    defaultBufferRatio: {
      type: Number,
      default: 0.12,
      min: 0,
      max: 0.4,
    },
    defaultSessionMinutes: {
      type: Number,
      default: 50,
      min: 15,
      max: 180,
    },
  },
  { timestamps: true }
);

export const UserModel =
  mongoose.models.User || mongoose.model<IUser>('User', UserSchema);
