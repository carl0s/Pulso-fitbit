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
  deleteAppQuantitySamples(options: {
    sampleType: string;   // HKQuantityTypeIdentifier, e.g. 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN'
    startDate?: number;   // unix seconds, optional window start
    endDate?: number;     // unix seconds, optional window end
  }): Promise<{ deleted: number }>;
  saveQuantitySample(options: {
    sampleType: string;   // HKQuantityTypeIdentifier
    unit: string;         // HKUnit string, e.g. 'degC', '%', 'ms'
    amount: number;
    startDate: number;    // unix seconds
    endDate: number;      // unix seconds
  }): Promise<{ saved: boolean }>;
}

const SleepPlugin = registerPlugin<SleepPluginInterface>('SleepPlugin');

export default SleepPlugin;
