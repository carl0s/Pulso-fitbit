import { registerPlugin } from '@capacitor/core';

export interface SleepStageInput {
  startDate: number;  // unix seconds
  endDate: number;    // unix seconds
  stage: 'deep' | 'light' | 'rem' | 'wake' | 'awake' | 'asleep' | 'restless' | string;
}

interface SleepPluginInterface {
  saveSleepStages(options: {
    windowStart: number;
    windowEnd: number;
    stages: SleepStageInput[];
  }): Promise<{ saved: boolean; verified: boolean; stagesSaved: number; replaced: number }>;
  deleteAppSleepSamples(): Promise<{ deleted: number }>;
}

const SleepPlugin = registerPlugin<SleepPluginInterface>('SleepPlugin');

export default SleepPlugin;
