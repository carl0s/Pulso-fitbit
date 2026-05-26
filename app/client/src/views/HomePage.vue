<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-title>PULSO</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <ion-header collapse="condense">
        <ion-toolbar>
          <ion-title size="large">
            <div class="pulso-brand">
              <div class="pulso-brand__name">PULSO</div>
              <div class="pulso-brand__tagline">Syncing Fitbit to Apple Health data</div>
            </div>
          </ion-title>
        </ion-toolbar>
      </ion-header>

      <!-- Auth & Refresh -->
      <div style="text-align: center; padding: 12px;">
        <ion-button v-if="!loggedIn" @click="login()">Login to Fitbit</ion-button>
        <ion-button v-else color="danger" fill="outline" size="small" @click="doLogout()">Logout</ion-button>
        <ion-button @click="refreshData()" :disabled="!loggedIn">Refresh</ion-button>
      </div>

      <!-- Status Banner -->
      <div v-if="syncStatus" class="pulso-banner pulso-banner--status">
        {{ syncStatus }}
      </div>
      <!-- Sleep Status & Tools Banner -->
      <div v-if="loggedIn" class="pulso-banner pulso-banner--tools">
        <div v-if="sleepError">{{ sleepError }}</div>
        <div style="margin-top: 8px; display: flex; gap: 6px; justify-content: center; flex-wrap: wrap;">
          <ion-button size="small" fill="outline" @click="restoreSleepHistory(14)">Restore 14 days</ion-button>
          <ion-button size="small" fill="outline" @click="restoreSleepHistory(30)">Restore 30 days</ion-button>
          <ion-button size="small" fill="outline" @click="resetSleepData()">Reset &amp; Resave</ion-button>
        </div>
      </div>

      <!-- Daily Summary -->
      <ion-card v-if="dailySummary">
        <ion-card-header>
          <ion-card-title style="font-size: 1.1em;">Today's Summary</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col class="summary-stat">
                <div class="stat-value">{{ dailySummary.steps.toLocaleString() }}</div>
                <div class="stat-label">Steps</div>
              </ion-col>
              <ion-col class="summary-stat">
                <div class="stat-value">{{ dailySummary.distanceKm.toFixed(1) }}</div>
                <div class="stat-label">km</div>
              </ion-col>
              <ion-col class="summary-stat">
                <div class="stat-value">{{ dailySummary.caloriesOut.toLocaleString() }}</div>
                <div class="stat-label">kcal</div>
              </ion-col>
            </ion-row>
            <ion-row>
              <ion-col class="summary-stat">
                <div class="stat-value">{{ dailySummary.activeMinutes }}</div>
                <div class="stat-label">Active min</div>
              </ion-col>
              <ion-col class="summary-stat" v-if="dailySummary.restingHeartRate">
                <div class="stat-value">{{ dailySummary.restingHeartRate }}</div>
                <div class="stat-label">Resting HR</div>
              </ion-col>
              <ion-col class="summary-stat" v-if="dailySummary.sleepMinutes != null">
                <div class="stat-value">{{ Math.floor(dailySummary.sleepMinutes / 60) }}h {{ dailySummary.sleepMinutes % 60 }}m</div>
                <div class="stat-label">Sleep</div>
              </ion-col>
            </ion-row>
            <ion-row>
              <ion-col class="summary-stat" v-if="dailySummary.hrvDaily">
                <div class="stat-value">{{ Math.round(dailySummary.hrvDaily) }}</div>
                <div class="stat-label">HRV (ms)</div>
              </ion-col>
              <ion-col class="summary-stat" v-if="dailySummary.spo2">
                <div class="stat-value">{{ dailySummary.spo2.toFixed(1) }}%</div>
                <div class="stat-label">SpO2</div>
              </ion-col>
              <ion-col class="summary-stat" v-if="dailySummary.breathingRate">
                <div class="stat-value">{{ dailySummary.breathingRate.toFixed(1) }}</div>
                <div class="stat-label">Breaths/min</div>
              </ion-col>
              <ion-col class="summary-stat" v-if="dailySummary.skinTemp != null">
                <div class="stat-value">{{ dailySummary.skinTemp > 0 ? '+' : '' }}{{ dailySummary.skinTemp.toFixed(1) }}°</div>
                <div class="stat-label">Skin Temp</div>
              </ion-col>
              <ion-col class="summary-stat" v-if="dailySummary.vo2Max">
                <div class="stat-value">{{ dailySummary.vo2Max.toFixed(0) }}</div>
                <div class="stat-label">VO2 Max</div>
              </ion-col>
            </ion-row>
            <!-- Sleep Stages -->
            <ion-row v-if="dailySummary.sleepStages.length">
              <ion-col size="12" style="padding-top: 8px;">
                <div class="stat-label" style="font-size: 0.85em; margin-bottom: 4px;"><strong>Sleep Stages</strong></div>
              </ion-col>
              <ion-col v-for="(st, i) in sleepStageSummary" :key="i" class="summary-stat">
                <div class="stat-value" style="font-size: 1.1em;">{{ Math.round(st.minutes) }}m</div>
                <div class="stat-label">{{ st.label }}</div>
              </ion-col>
            </ion-row>
            <!-- Heart Rate Zones -->
            <ion-row v-if="dailySummary.heartRateZones.length">
              <ion-col size="12" style="padding-top: 8px;">
                <div class="stat-label" style="font-size: 0.85em; margin-bottom: 4px;"><strong>Heart Rate Zones</strong></div>
              </ion-col>
              <ion-col v-for="zone in dailySummary.heartRateZones.filter(z => z.minutes > 0)" :key="zone.name" class="summary-stat">
                <div class="stat-value" style="font-size: 1.1em;">{{ zone.minutes }}m</div>
                <div class="stat-label">{{ zone.name }}</div>
                <div class="stat-label">{{ zone.min }}-{{ zone.max }} bpm</div>
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <!-- Auto-Sync Controls -->
      <ion-card>
        <ion-card-content>
          <ion-item lines="none">
            <ion-label>
              <h2>Auto Sync</h2>
              <p v-if="autoSyncEnabled && lastSyncTime">Last sync: {{ lastSyncTime }}</p>
              <p v-else-if="autoSyncEnabled">Sync starting...</p>
              <p v-else>Disabled</p>
            </ion-label>
            <ion-toggle :checked="autoSyncEnabled" @ionChange="toggleAutoSync($event)"></ion-toggle>
          </ion-item>
          <ion-item v-if="autoSyncEnabled" lines="none">
            <ion-label>Interval (minutes)</ion-label>
            <ion-select :value="syncIntervalMinutes" @ionChange="updateSyncInterval($event)" interface="popover">
              <ion-select-option :value="5">5</ion-select-option>
              <ion-select-option :value="15">15</ion-select-option>
              <ion-select-option :value="30">30</ion-select-option>
              <ion-select-option :value="60">60</ion-select-option>
            </ion-select>
          </ion-item>
        </ion-card-content>
      </ion-card>

      <!-- Workouts -->
      <div v-if="fitbitWorkouts.length">
        <ion-item>
          <ion-label><strong>Recent Workouts ({{ fitbitWorkouts.length }})</strong></ion-label>
        </ion-item>
        <ion-card v-for="(workout, index) in fitbitWorkouts" :key="index">
          <ion-card-header>{{ workout.activityName }}</ion-card-header>
          <ion-card-content>
            <p>Calories: {{ workout.calories }} kcal</p>
            <p>Duration: {{ Math.round(workout.duration / 60000) }} min</p>
            <p v-if="workout.distance">Distance: {{ (workout.distance / 1000).toFixed(2) }} km</p>
            <p v-if="workout.steps">Steps: {{ workout.steps.toLocaleString() }}</p>
            <p>{{ new Date(workout.startTime).toLocaleString() }}</p>
            <div style="text-align: center;">
              <ion-button size="small" :color="workout.buttonColor" :disabled="workout.isButtonDisabled"
                @click="saveWorkout(workout)">{{ workout.buttonLabel }}</ion-button>
            </div>
          </ion-card-content>
        </ion-card>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonContent, IonHeader, IonPage, IonTitle, IonToolbar, IonItem, IonLabel,
  IonCardContent, IonCardHeader, IonCardTitle, IonCard, IonButton,
  IonToggle, IonSelect, IonSelectOption, IonGrid, IonRow, IonCol,
} from '@ionic/vue';
import { HealthKit } from '@ionic-native/health-kit';
</script>

<script lang="ts">
import { defineComponent, reactive } from 'vue';
import { App as CapApp } from '@capacitor/app';
import * as fitbit from '../services/fitbitService';
import { getHealthKitActivityType } from '../services/fitbitService';
import type { DailySummary } from '../services/fitbitService';
import SleepPlugin from '../services/sleepPlugin';

interface Workout {
  energy: number;
  energyUnit: string;
  activityType: string;
  quantityType: string;
  duration: number;
  distance: number;
  distanceUnit: string;
  startDate: Date;
}

export default defineComponent({
  components: {
    IonContent, IonHeader, IonPage, IonTitle, IonToolbar, IonItem, IonLabel,
    IonCardContent, IonCardHeader, IonCardTitle, IonCard, IonButton,
    IonToggle, IonSelect, IonSelectOption, IonGrid, IonRow, IonCol,
  },
  data() {
    return {
      loggedIn: false,
      fitbitWorkouts: reactive([] as any[]),
      dailySummary: null as DailySummary | null,
      healthKit: HealthKit,
      autoSyncEnabled: false,
      syncIntervalMinutes: 15,
      syncTimerId: null as ReturnType<typeof setInterval> | null,
      lastSyncTime: '',
      syncStatus: '',
      healthKitReady: false,
      sleepError: '',
      sleepRetryTimerId: null as ReturnType<typeof setTimeout> | null,
    };
  },
  async created() {
    this.loggedIn = await fitbit.isLoggedIn();
    this.syncStatus = this.loggedIn ? 'Logged in' : 'Not logged in';

    const savedAutoSync = localStorage.getItem('autoSyncEnabled');
    const savedInterval = localStorage.getItem('syncIntervalMinutes');
    if (savedAutoSync === 'true') this.autoSyncEnabled = true;
    if (savedInterval) this.syncIntervalMinutes = parseInt(savedInterval, 10);

    CapApp.addListener('appUrlOpen', async (event) => {
      this.syncStatus = 'Received callback...';
      await this.handleOAuthUrl(event.url);
    });

    try {
      const launchUrl = await CapApp.getLaunchUrl();
      if (launchUrl?.url) {
        await this.handleOAuthUrl(launchUrl.url);
      }
    } catch {}

    // HealthKit init - only request auth once (store flag)
    this.$nextTick(async () => {
      try {
        const available = await this.healthKit.available();
        if (available) {
          // Version the auth request so new permissions trigger a re-ask
          const HK_AUTH_VERSION = '4';
          const hkAuthed = localStorage.getItem('hk_auth_version');
          if (hkAuthed !== HK_AUTH_VERSION) {
            const allTypes = [
              'HKQuantityTypeIdentifierStepCount',
              'HKQuantityTypeIdentifierDistanceWalkingRunning',
              'HKQuantityTypeIdentifierDistanceCycling',
              'HKQuantityTypeIdentifierActiveEnergyBurned',
              'HKQuantityTypeIdentifierHeartRate',
              'HKQuantityTypeIdentifierRestingHeartRate',
              'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
              'HKQuantityTypeIdentifierOxygenSaturation',
              'HKQuantityTypeIdentifierRespiratoryRate',
              'HKQuantityTypeIdentifierVO2Max',
              'HKCategoryTypeIdentifierSleepAnalysis',
              'HKWorkoutTypeIdentifier',
            ];
            await this.healthKit.requestAuthorization({
              readTypes: allTypes,
              writeTypes: allTypes,
            });
            localStorage.setItem('hk_auth_version', HK_AUTH_VERSION);
          }
          this.healthKitReady = true;
        }
      } catch (e) {
        console.error('HealthKit init error:', e);
      }

      // Always fetch + auto-save on app open
      if (this.loggedIn) {
        await this.refreshData();
      }
      if (this.autoSyncEnabled && this.loggedIn) {
        this.startAutoSync();
      }
    });

    // Refresh data when app comes back to foreground (e.g. after being in background)
    CapApp.addListener('appStateChange', async (state) => {
      if (state.isActive && this.loggedIn && this.healthKitReady) {
        this.syncStatus = 'Refreshing...';
        await this.refreshData();
      }
    });
  },
  computed: {
    sleepStageSummary(): { label: string; minutes: number }[] {
      if (!this.dailySummary?.sleepStages.length) return [];
      const totals: Record<string, number> = {};
      for (const s of this.dailySummary.sleepStages) {
        totals[s.stage] = (totals[s.stage] || 0) + s.seconds / 60;
      }
      const labels: Record<string, string> = { deep: 'Deep', light: 'Light', rem: 'REM', wake: 'Awake' };
      return Object.entries(totals).map(([stage, minutes]) => ({
        label: labels[stage] || stage,
        minutes,
      }));
    },
  },
  beforeUnmount() {
    this.stopAutoSync();
    if (this.sleepRetryTimerId) {
      clearTimeout(this.sleepRetryTimerId);
      this.sleepRetryTimerId = null;
    }
  },
  methods: {
    // --- Auth ---
    async handleOAuthUrl(url: string) {
      let code: string | null = null;
      try {
        const cleanUrl = url.split('#')[0];
        const queryString = cleanUrl.split('?')[1] || '';
        code = new URLSearchParams(queryString).get('code');
      } catch { return; }

      if (code) {
        try {
          const { Browser } = await import('@capacitor/browser');
          await Browser.close();
        } catch {}
        try {
          this.syncStatus = 'Exchanging token...';
          await fitbit.handleCallback(code);
          this.loggedIn = true;
          this.syncStatus = 'Login successful!';
          await this.refreshData();
        } catch (err: any) {
          this.syncStatus = 'Login failed: ' + err.message;
        }
      }
    },
    async login() {
      try {
        this.syncStatus = 'Opening Fitbit login...';
        await fitbit.startLogin();
      } catch (err: any) {
        this.syncStatus = 'Login error: ' + err.message;
      }
    },
    async doLogout() {
      await fitbit.logout();
      this.loggedIn = false;
      this.fitbitWorkouts = [];
      this.dailySummary = null;
      this.stopAutoSync();
      this.syncStatus = 'Logged out';
    },

    // --- Data fetching + auto-save ---
    async resetSleepData() {
      try {
        this.sleepError = 'Deleting existing sleep samples from Apple Health...';
        const result = await SleepPlugin.deleteAppSleepSamples();
        this.sleepError = `Deleted ${result.deleted} sample(s). Refreshing...`;
        await this.refreshData();
      } catch (e: any) {
        this.sleepError = 'Reset failed: ' + (e?.message || String(e));
      }
    },
    async restoreSleepHistory(days = 14) {
      let totalSaved = 0;
      let totalStages = 0;
      let totalErrors = 0;
      const errors: string[] = [];
      for (let i = 0; i < days; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = this.formatDateStr(d);
        this.sleepError = `Restoring ${dateStr} (${i + 1}/${days})...`;
        try {
          const summary = await fitbit.fetchDailySummary(dateStr);
          if (summary.sleepLogs && summary.sleepLogs.length > 0) {
            const mainLogs = summary.sleepLogs.filter(l => l.isMainSleep);
            const logs = mainLogs.length > 0 ? mainLogs : summary.sleepLogs;
            const minStart = Math.min(...logs.map(l => new Date(l.startTime).getTime()));
            const maxEnd = Math.max(...logs.map(l => new Date(l.endTime).getTime()));
            const stageInputs = logs.flatMap(l => l.stages.map(stg => ({
              startDate: Math.floor(new Date(stg.startTime).getTime() / 1000),
              endDate: Math.floor(new Date(stg.endTime).getTime() / 1000),
              stage: stg.stage,
            })));
            if (stageInputs.length > 0) {
              try {
                const result = await SleepPlugin.saveSleepStages({
                  windowStart: Math.floor(minStart / 1000),
                  windowEnd: Math.floor(maxEnd / 1000),
                  stages: stageInputs,
                });
                if (result.saved) {
                  totalSaved++;
                  totalStages += result.stagesSaved;
                }
              } catch (e: any) {
                totalErrors++;
                errors.push(`${dateStr}: ${e?.message?.substring(0, 50) || 'error'}`);
              }
            }
          }
        } catch (e: any) {
          totalErrors++;
          errors.push(`${dateStr}: fetch failed`);
          // If rate-limited, stop and report
          if (e?.message?.includes('429') || e?.message?.includes('rate')) {
            this.sleepError = `Rate limited at ${dateStr}. Wait 1h and retry. Nights saved: ${totalSaved} (${totalStages} stages)`;
            return;
          }
        }
      }
      this.sleepError = `Restore complete: ${totalSaved} night${totalSaved !== 1 ? 's' : ''} saved (${totalStages} stages), ${totalErrors} errors`;
    },
    scheduleSleepRetry() {
      if (this.sleepRetryTimerId) clearTimeout(this.sleepRetryTimerId);
      this.sleepRetryTimerId = setTimeout(async () => {
        this.sleepRetryTimerId = null;
        if (this.loggedIn && this.healthKitReady) {
          console.log('Retrying sleep fetch...');
          await this.refreshData();
        }
      }, 5 * 60 * 1000);
    },
    async refreshData() {
      try {
        const now = new Date().toLocaleTimeString();
        this.syncStatus = `Fetching from Fitbit (${now})...`;

        // Fetch today + yesterday summaries to catch late-arriving sleep data
        const today = new Date();
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const todayStr = this.formatDateStr(today);
        const yesterdayStr = this.formatDateStr(yesterday);

        const [workouts, summaryToday, summaryYesterday] = await Promise.all([
          fitbit.fetchWorkouts(),
          fitbit.fetchDailySummary(todayStr),
          fitbit.fetchDailySummary(yesterdayStr),
        ]);

        this.fitbitWorkouts = this.markSyncedWorkouts(workouts);
        this.dailySummary = summaryToday;

        const hrCount = summaryToday.heartRateIntraday?.length || 0;
        const lastHR = hrCount > 0 ? summaryToday.heartRateIntraday[hrCount - 1] : null;
        this.syncStatus = `${workouts.length} workouts, ${hrCount} HR samples${lastHR ? ` (last: ${lastHR.time})` : ''} - ${now}`;

        // Auto-save today + yesterday if HealthKit is ready
        if (this.healthKitReady) {
          await this.autoSaveAll();
          // Also save yesterday's sleep if it wasn't captured
          if (summaryYesterday.sleepLogs && summaryYesterday.sleepLogs.length > 0) {
            await this.saveSummaryToHealthKit(summaryYesterday);
          }
        }
      } catch (err: any) {
        this.syncStatus = `Error: ${err.message}`;
        if (err.message.includes('Not authenticated') || err.message.includes('login')) {
          this.loggedIn = false;
        }
      }
    },
    formatDateStr(d: Date): string {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    },

    async autoSaveAll() {
      const results: string[] = [];

      // 1. Auto-save daily summary
      // Track which specific items were saved, so new data (e.g. sleep arriving later) gets saved
      if (this.dailySummary) {
        const summaryResults = await this.saveSummaryToHealthKit(this.dailySummary);
        if (summaryResults.length > 0) {
          results.push(summaryResults.join(', '));
        }
      }

      // 2. Auto-save unsaved workouts (check both localStorage AND HealthKit)
      const syncedIds = this.getSyncedWorkoutIds();
      let workoutsSaved = 0;
      let workoutsSkipped = 0;
      for (const workout of this.fitbitWorkouts) {
        const id = workout.logId?.toString() || workout.startTime;
        if (syncedIds.includes(id)) continue;

        // Double-check HealthKit to prevent duplicates after reinstall
        const startDate = new Date(workout.startTime);
        if (await this.hasExistingWorkout(startDate)) {
          // Already in HealthKit, just mark it locally
          this.markWorkoutAsSynced(workout);
          workout.buttonLabel = 'Saved!';
          workout.buttonColor = 'success';
          workout.isButtonDisabled = true;
          workoutsSkipped++;
          continue;
        }

        try {
          await this.saveWorkoutToHealthKit(workout);
          this.markWorkoutAsSynced(workout);
          workout.buttonLabel = 'Saved!';
          workout.buttonColor = 'success';
          workout.isButtonDisabled = true;
          workoutsSaved++;
        } catch (err) {
          console.error('Workout save failed:', workout.activityName, err);
          workout.buttonLabel = 'Failed';
          workout.buttonColor = 'danger';
        }
      }
      if (workoutsSaved > 0) results.push(`${workoutsSaved} workouts`);

      if (results.length > 0) {
        this.syncStatus = `Saved to Apple Health: ${results.join(' + ')}`;
      } else {
        this.syncStatus = 'Everything up to date';
      }
    },

    // --- HealthKit saves ---
    // Track which items have been saved per date to allow new data to be saved later
    getSavedItems(date: string): string[] {
      try {
        return JSON.parse(localStorage.getItem(`saved_items_${date}`) || '[]');
      } catch { return []; }
    },
    markItemSaved(date: string, item: string) {
      const items = this.getSavedItems(date);
      if (!items.includes(item)) {
        items.push(item);
        localStorage.setItem(`saved_items_${date}`, JSON.stringify(items));
      }
    },

    async saveSummaryToHealthKit(s: DailySummary): Promise<string[]> {
      const saved: string[] = [];
      const alreadySaved = this.getSavedItems(s.date);
      const start = new Date(s.date + 'T00:00:00');
      const end = new Date(s.date + 'T23:59:59');

      // Steps
      if (s.steps > 0 && !alreadySaved.includes('steps')) {
        if (await this.trySaveQuantity('HKQuantityTypeIdentifierStepCount', 'count', s.steps, start, end)) {
          this.markItemSaved(s.date, 'steps');
          saved.push('steps');
        }
      }

      // Distance
      if (s.distanceKm > 0 && !alreadySaved.includes('distance')) {
        if (await this.trySaveQuantity('HKQuantityTypeIdentifierDistanceWalkingRunning', 'km', s.distanceKm, start, end)) {
          this.markItemSaved(s.date, 'distance');
          saved.push('distance');
        }
      }

      // Calories
      if (s.caloriesOut > 0 && !alreadySaved.includes('calories')) {
        if (await this.trySaveQuantity('HKQuantityTypeIdentifierActiveEnergyBurned', 'kcal', s.caloriesOut, start, end)) {
          this.markItemSaved(s.date, 'calories');
          saved.push('calories');
        }
      }

      // Resting HR
      if (s.restingHeartRate && !alreadySaved.includes('restingHR')) {
        const midday = new Date(s.date + 'T12:00:00');
        const middayEnd = new Date(s.date + 'T12:00:01');
        if (await this.trySaveQuantity('HKQuantityTypeIdentifierRestingHeartRate', 'count/min', s.restingHeartRate, midday, middayEnd)) {
          this.markItemSaved(s.date, 'restingHR');
          saved.push('resting HR');
        }
      }

      // HRV
      if (s.hrvDaily && !alreadySaved.includes('hrv')) {
        const midday = new Date(s.date + 'T12:00:00');
        const middayEnd = new Date(s.date + 'T12:00:01');
        if (await this.trySaveQuantity('HKQuantityTypeIdentifierHeartRateVariabilitySDNN', 'ms', s.hrvDaily, midday, middayEnd)) {
          this.markItemSaved(s.date, 'hrv');
          saved.push('HRV');
        }
      }

      // SpO2
      if (s.spo2 && !alreadySaved.includes('spo2')) {
        const night = new Date(s.date + 'T04:00:00');
        const nightEnd = new Date(s.date + 'T04:00:01');
        if (await this.trySaveQuantity('HKQuantityTypeIdentifierOxygenSaturation', '%', s.spo2 / 100, night, nightEnd)) {
          this.markItemSaved(s.date, 'spo2');
          saved.push('SpO2');
        }
      }

      // Breathing Rate
      if (s.breathingRate && !alreadySaved.includes('breathingRate')) {
        const night = new Date(s.date + 'T04:00:00');
        const nightEnd = new Date(s.date + 'T04:00:01');
        if (await this.trySaveQuantity('HKQuantityTypeIdentifierRespiratoryRate', 'count/min', s.breathingRate, night, nightEnd)) {
          this.markItemSaved(s.date, 'breathingRate');
          saved.push('breathing rate');
        }
      }

      // VO2 Max
      if (s.vo2Max && !alreadySaved.includes('vo2max')) {
        const midday = new Date(s.date + 'T12:00:00');
        const middayEnd = new Date(s.date + 'T12:00:01');
        if (await this.trySaveQuantity('HKQuantityTypeIdentifierVO2Max', 'ml/kg*min', s.vo2Max, midday, middayEnd)) {
          this.markItemSaved(s.date, 'vo2max');
          saved.push('VO2 Max');
        }
      }

      // Sleep - save per-stage samples (deep/light/rem/wake) from all main-sleep logs.
      // Plugin deletes overlapping app-authored samples in the night window before writing
      // the new set → idempotent, correct total (asleep stages sum to minutesAsleep, wake excluded).
      if (s.sleepLogs && s.sleepLogs.length > 0) {
        const mainLogs = s.sleepLogs.filter(l => l.isMainSleep);
        const logs = mainLogs.length > 0 ? mainLogs : s.sleepLogs;
        const minStart = Math.min(...logs.map(l => new Date(l.startTime).getTime()));
        const maxEnd = Math.max(...logs.map(l => new Date(l.endTime).getTime()));

        const stageInputs = logs.flatMap(l => l.stages.map(stg => ({
          startDate: Math.floor(new Date(stg.startTime).getTime() / 1000),
          endDate: Math.floor(new Date(stg.endTime).getTime() / 1000),
          stage: stg.stage,
        })));

        const startStr = new Date(minStart).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
        const endStr = new Date(maxEnd).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
        const asleepMin = Math.round(logs.reduce((sum, l) => sum + l.minutesAsleep, 0));
        const label = `${startStr}-${endStr} (asleep ${asleepMin}m, ${stageInputs.length} stages)`;

        if (stageInputs.length === 0) {
          this.sleepError = `${label}: no stage data from Fitbit`;
        } else {
          try {
            const result = await SleepPlugin.saveSleepStages({
              windowStart: Math.floor(minStart / 1000),
              windowEnd: Math.floor(maxEnd / 1000),
              stages: stageInputs,
            });
            if (result.saved) {
              this.sleepError = `${label}: SAVED ${result.stagesSaved} stages (replaced ${result.replaced})`;
              saved.push('sleep');
            } else {
              this.sleepError = `${label}: no change`;
            }
          } catch (e: any) {
            const msg = e?.message || String(e);
            console.error('Sleep save failed', e);
            this.sleepError = `${label}: FAILED (${msg.substring(0, 60)})`;
          }
        }
      } else if (s.sleepMinutes === null) {
        this.sleepError = `No sleep data from Fitbit yet for ${s.date} - retrying in 5 min`;
        this.scheduleSleepRetry();
      } else {
        this.sleepError = '';
      }

      // HR intraday - trySaveQuantity checks HealthKit for duplicates per sample
      if (s.heartRateIntraday.length > 0) {
        let hrSaved = 0;
        for (let i = 0; i < s.heartRateIntraday.length; i += 5) {
          const sample = s.heartRateIntraday[i];
          const sampleTime = new Date(`${s.date}T${sample.time}`);
          const sampleEnd = new Date(sampleTime.getTime() + 60000);
          if (await this.trySaveQuantity('HKQuantityTypeIdentifierHeartRate', 'count/min', sample.value, sampleTime, sampleEnd))
            hrSaved++;
        }
        if (hrSaved > 0) saved.push(`${hrSaved} HR samples`);
      }

      return saved;
    },

    async hasExistingData(sampleType: string, unit: string, startDate: Date, endDate: Date): Promise<boolean> {
      try {
        const data = await this.healthKit.querySampleType({
          startDate: startDate,
          endDate: endDate,
          sampleType: sampleType,
          unit: unit,
          limit: 1,
        });
        return data && data.length > 0;
      } catch {
        return false; // Can't check, assume no data
      }
    },
    async trySaveQuantity(sampleType: string, unit: string, amount: number, startDate: Date, endDate: Date): Promise<boolean> {
      try {
        // Check HealthKit for existing data first to prevent duplicates
        if (await this.hasExistingData(sampleType, unit, startDate, endDate)) {
          console.log(`Skipping ${sampleType} - already exists in HealthKit`);
          return true; // Count as "saved" since it's already there
        }
        // Plugin expects Unix timestamps in seconds
        await this.healthKit.saveQuantitySample({
          startDate: Math.floor(startDate.getTime() / 1000),
          endDate: Math.floor(endDate.getTime() / 1000),
          sampleType: sampleType,
          unit: unit,
          amount: amount,
        });
        return true;
      } catch (e) {
        console.error(`Save ${sampleType} failed:`, e);
        return false;
      }
    },

    async saveWorkout(workout: any) {
      const id = workout.logId?.toString() || workout.startTime;
      if (this.getSyncedWorkoutIds().includes(id)) {
        workout.buttonLabel = 'Already saved!';
        workout.buttonColor = 'success';
        workout.isButtonDisabled = true;
        return;
      }
      try {
        workout.buttonLabel = 'Saving...';
        workout.buttonColor = 'warning';
        await this.saveWorkoutToHealthKit(workout);
        this.markWorkoutAsSynced(workout);
        workout.buttonLabel = 'Saved!';
        workout.buttonColor = 'success';
        workout.isButtonDisabled = true;
      } catch (err: any) {
        workout.buttonLabel = 'Failed - Tap to retry';
        workout.buttonColor = 'danger';
        this.syncStatus = 'Save error: ' + (err.message || JSON.stringify(err));
      }
    },

    async hasExistingWorkout(startDate: Date): Promise<boolean> {
      try {
        const workouts = await this.healthKit.findWorkouts();
        if (!workouts || !Array.isArray(workouts)) return false;
        const startMs = startDate.getTime();
        return workouts.some((w: any) => {
          const wStart = new Date(w.startDate).getTime();
          return Math.abs(wStart - startMs) < 60000; // Within 1 minute
        });
      } catch {
        return false;
      }
    },
    saveWorkoutToHealthKit(workout: any): Promise<void> {
      const activityType = getHealthKitActivityType(workout.activityName || '');
      const distanceKm = workout.distance ? workout.distance / 1000 : 0;
      const isWalkOrRun = activityType.includes('Walking') || activityType.includes('Running') || activityType.includes('Hiking');

      return this.healthKit.saveWorkout({
        activityType,
        quantityType: isWalkOrRun ? 'HKQuantityTypeIdentifierDistanceWalkingRunning' : 'HKQuantityTypeIdentifierDistanceCycling',
        startDate: new Date(workout.startTime),
        duration: workout.duration / 1000,
        energy: workout.calories || 0,
        energyUnit: 'kcal',
        distance: distanceKm,
        distanceUnit: 'km',
      } as any);
    },

    // --- Sync tracking (localStorage-based, source of truth) ---
    markSyncedWorkouts(workouts: any[]) {
      const syncedIds = this.getSyncedWorkoutIds();
      return workouts.map((w: any) => {
        const id = w.logId?.toString() || w.startTime;
        const isSynced = syncedIds.includes(id);
        return {
          ...w,
          buttonLabel: isSynced ? 'Saved!' : 'Save to Apple Health',
          buttonColor: isSynced ? 'success' : 'tertiary',
          isButtonDisabled: isSynced,
        };
      });
    },
    getSyncedWorkoutIds(): string[] {
      try {
        return JSON.parse(localStorage.getItem('syncedWorkoutIds') || '[]');
      } catch { return []; }
    },
    markWorkoutAsSynced(workout: any) {
      const ids = this.getSyncedWorkoutIds();
      const id = workout.logId?.toString() || workout.startTime;
      if (!ids.includes(id)) {
        ids.push(id);
        localStorage.setItem('syncedWorkoutIds', JSON.stringify(ids));
      }
    },

    // --- Auto-sync timer ---
    toggleAutoSync(event: any) {
      this.autoSyncEnabled = event.detail.checked;
      localStorage.setItem('autoSyncEnabled', String(this.autoSyncEnabled));
      if (this.autoSyncEnabled) {
        this.startAutoSync();
      } else {
        this.stopAutoSync();
        this.syncStatus = '';
      }
    },
    updateSyncInterval(event: any) {
      this.syncIntervalMinutes = event.detail.value;
      localStorage.setItem('syncIntervalMinutes', String(this.syncIntervalMinutes));
      if (this.autoSyncEnabled) {
        this.stopAutoSync();
        this.startAutoSync();
      }
    },
    startAutoSync() {
      this.stopAutoSync();
      this.syncTimerId = setInterval(() => {
        this.refreshData();
      }, this.syncIntervalMinutes * 60 * 1000);
    },
    stopAutoSync() {
      if (this.syncTimerId) {
        clearInterval(this.syncTimerId);
        this.syncTimerId = null;
      }
    },
  },
});
</script>

<style scoped>
/* --- PULSO brand header --- */
.pulso-brand {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.pulso-brand__name {
  font-family: var(--ion-font-family);
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1;
}
.pulso-brand__tagline {
  font-family: var(--font-secondary);
  font-weight: 400;
  font-size: 0.42em;
  letter-spacing: 0.01em;
  opacity: 0.7;
  margin-top: 2px;
}

/* --- Banners --- */
.pulso-banner {
  text-align: center;
  margin: 8px;
  border-radius: 10px;
  font-family: var(--font-secondary);
  line-height: 1.35;
}
.pulso-banner--status {
  padding: 8px 16px;
  background: var(--ion-color-primary);
  color: var(--ion-color-primary-contrast);
  font-size: 0.85em;
  font-weight: 600;
  letter-spacing: 0.02em;
}
.pulso-banner--tools {
  padding: 10px 14px;
  background: rgba(var(--ion-color-primary-rgb), 0.08);
  color: var(--ion-text-color);
  border: 1px solid rgba(var(--ion-color-primary-rgb), 0.25);
  font-size: 0.95em;
}

/* --- Stat grid --- */
.summary-stat {
  text-align: center;
  padding: 8px 4px;
}
.stat-value {
  font-family: var(--ion-font-family); /* Space Mono — feels right for numbers */
  font-size: 1.3em;
  font-weight: 700;
  color: var(--ion-color-primary);
  letter-spacing: -0.01em;
}
.stat-label {
  font-family: var(--font-secondary);
  font-size: 0.75em;
  color: var(--ion-color-medium);
  margin-top: 2px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

/* --- Body copy inside cards uses the secondary (legibility) font --- */
ion-card-content p {
  font-family: var(--font-secondary);
}
</style>
