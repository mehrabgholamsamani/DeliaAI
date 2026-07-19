import type { ClientRateLimitInfo, Options, Store } from "express-rate-limit";
import { createHash } from "node:crypto";
import { RateLimitCounter } from "./models/RateLimitCounter.js";

export class MongoRateLimitStore implements Store {
  localKeys = false;
  prefix: string;
  private windowMs = 60_000;

  constructor(prefix: string) {
    this.prefix = prefix;
  }

  init(options: Options) {
    this.windowMs = options.windowMs;
  }

  private getBucket(now = Date.now()) {
    return Math.floor(now / this.windowMs);
  }

  private getResetTime(bucket: number) {
    return new Date((bucket + 1) * this.windowMs);
  }

  private getCounterId(key: string, bucket: number) {
    const keyHash = createHash("sha256").update(key).digest("hex");

    return `${this.prefix}:${keyHash}:${bucket}`;
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const bucket = this.getBucket();
    const resetTime = this.getResetTime(bucket);
    const counter = await RateLimitCounter.findOneAndUpdate(
      { _id: this.getCounterId(key, bucket) },
      {
        $inc: { hits: 1 },
        $setOnInsert: {
          key: `${this.prefix}:${key}`,
          bucket,
          resetTime,
          expiresAt: resetTime
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean<{
      hits: number;
      resetTime: Date;
    }>();

    return {
      totalHits: counter?.hits || 1,
      resetTime: counter?.resetTime || resetTime
    };
  }

  async get(key: string): Promise<ClientRateLimitInfo | undefined> {
    const bucket = this.getBucket();
    const counter = await RateLimitCounter.findById(this.getCounterId(key, bucket))
      .select("hits resetTime")
      .lean<{ hits: number; resetTime: Date }>();

    if (!counter) {
      return undefined;
    }

    return {
      totalHits: counter.hits,
      resetTime: counter.resetTime
    };
  }

  async decrement(key: string) {
    const bucket = this.getBucket();

    await RateLimitCounter.updateOne(
      { _id: this.getCounterId(key, bucket), hits: { $gt: 0 } },
      { $inc: { hits: -1 } }
    );
  }

  async resetKey(key: string) {
    await RateLimitCounter.deleteMany({ key: { $in: [`${this.prefix}:${key}`, key] } });
  }

  async resetAll() {
    await RateLimitCounter.deleteMany({ key: new RegExp(`^${this.prefix}:`) });
  }
}
