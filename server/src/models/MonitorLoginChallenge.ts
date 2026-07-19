import mongoose, { Schema } from "mongoose";

export type MonitorLoginChallengeDocument = {
  challengeId: string;
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  usedAt?: Date;
  ip?: string;
  userAgent?: string;
  createdAt: Date;
  updatedAt: Date;
};

const monitorLoginChallengeSchema = new Schema<MonitorLoginChallengeDocument>(
  {
    challengeId: { type: String, required: true, unique: true },
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, required: true, default: 0 },
    usedAt: { type: Date },
    ip: { type: String },
    userAgent: { type: String }
  },
  { timestamps: true }
);

monitorLoginChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const MonitorLoginChallenge =
  mongoose.models.MonitorLoginChallenge ||
  mongoose.model<MonitorLoginChallengeDocument>(
    "MonitorLoginChallenge",
    monitorLoginChallengeSchema
  );
