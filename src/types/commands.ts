import type { SleepQuality, WorkoutLevel } from './core';

export type ParsedTime = {
  hour: number;
  minute: number;
  raw: string;
};

export type ParsedSleepCommand = {
  sleepStartAt: Date;
  sleepEndAt: Date;
  sleepHours: number;
  sleepQuality: SleepQuality;
  note: string;
  startLabel: string;
  endLabel: string;
};

export type ParsedStockCommand = {
  name: string;
  quantity: string;
  unit?: string;
  purchaseChannel?: string;
};

export type ParsedWorkoutCommand = {
  workoutName: string;
  durationMin: number;
  workoutLevel: WorkoutLevel;
  note: string;
  workoutVideoUrl: string;
};
