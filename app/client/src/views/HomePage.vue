<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-title>
          <span class="pulso-title-compact">
            <PulsoMark class="pulso-title-compact__mark" />
            PULSO
          </span>
        </ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <ion-header collapse="condense">
        <ion-toolbar>
          <ion-title size="large">
            <div class="pulso-brand">
              <PulsoMark class="pulso-brand__mark" />
              <div class="pulso-brand__text">
                <div class="pulso-brand__name">PULSO</div>
                <div class="pulso-brand__tagline">Syncing Fitbit to Apple Health</div>
              </div>
            </div>
          </ion-title>
        </ion-toolbar>
      </ion-header>

      <!-- Auth & Refresh -->
      <div class="pulso-actions">
        <ion-button v-if="!loggedIn" expand="block" class="pulso-actions__primary" @click="login()">
          Login to Fitbit
        </ion-button>
        <template v-else>
          <ion-button class="pulso-actions__primary" @click="refreshData()">Refresh</ion-button>
          <ion-button fill="outline" color="medium" size="small" @click="doLogout()">Logout</ion-button>
        </template>
      </div>

      <!-- Status Banner -->
      <div v-if="syncStatus" class="pulso-banner pulso-banner--status">
        <span class="pulso-banner__dot" />
        {{ syncStatus }}
      </div>
      <!-- Sleep Status & Tools Banner -->
      <div v-if="loggedIn" class="pulso-banner pulso-banner--tools">
        <div v-if="sleepError" class="pulso-banner__tools-msg">{{ sleepError }}</div>
        <div class="pulso-banner__tools-actions">
          <ion-button size="small" fill="outline" @click="restoreSleepHistory(14)">Restore 14d</ion-button>
          <ion-button size="small" fill="outline" @click="restoreSleepHistory(30)">Restore 30d</ion-button>
          <ion-button size="small" fill="outline" @click="resetSleepData()">Reset &amp; Resave</ion-button>
          <ion-button size="small" fill="outline" @click="resyncRecoveryHistory(30)">Re-sync HRV/SpO2 30d</ion-button>
        </div>
      </div>

      <!-- Daily Summary -->
      <ion-card v-if="dailySummary" class="pulso-card pulso-card--summary">
        <ion-card-header class="pulso-card__header">
          <ion-card-title class="pulso-card__title">Today's Summary</ion-card-title>
          <div class="pulso-card__date">{{ formatTodayLabel(dailySummary.date) }}</div>
        </ion-card-header>
        <ion-card-content class="pulso-card__content">
          <div class="pulso-stats">
            <div class="pulso-stats__grid pulso-stats__grid--hero">
              <div class="summary-stat summary-stat--hero">
                <div class="stat-value">{{ dailySummary.steps.toLocaleString() }}</div>
                <div class="stat-label">Steps</div>
              </div>
              <div class="summary-stat summary-stat--hero">
                <div class="stat-value">{{ dailySummary.distanceKm.toFixed(1) }}</div>
                <div class="stat-label">km</div>
              </div>
              <div class="summary-stat summary-stat--hero">
                <div class="stat-value">{{ dailySummary.caloriesOut.toLocaleString() }}</div>
                <div class="stat-label">kcal</div>
              </div>
            </div>
            <div class="pulso-stats__grid">
              <div class="summary-stat">
                <div class="stat-value">{{ dailySummary.activeMinutes }}</div>
                <div class="stat-label">Active min</div>
              </div>
              <div class="summary-stat" v-if="dailySummary.restingHeartRate">
                <div class="stat-value">{{ dailySummary.restingHeartRate }}</div>
                <div class="stat-label">Resting HR</div>
              </div>
              <div class="summary-stat" v-if="dailySummary.sleepMinutes != null">
                <div class="stat-value">{{ Math.floor(dailySummary.sleepMinutes / 60) }}h {{ dailySummary.sleepMinutes % 60 }}m</div>
                <div class="stat-label">Sleep</div>
              </div>
              <div class="summary-stat" v-if="dailySummary.hrvDaily">
                <div class="stat-value">{{ Math.round(dailySummary.hrvDaily) }}</div>
                <div class="stat-label">HRV (ms)</div>
              </div>
              <div class="summary-stat" v-if="dailySummary.spo2">
                <div class="stat-value">{{ dailySummary.spo2.toFixed(1) }}%</div>
                <div class="stat-label">SpO2</div>
              </div>
              <div class="summary-stat" v-if="dailySummary.breathingRate">
                <div class="stat-value">{{ dailySummary.breathingRate.toFixed(1) }}</div>
                <div class="stat-label">Breaths/min</div>
              </div>
              <div class="summary-stat" v-if="dailySummary.skinTemp != null">
                <div class="stat-value">{{ dailySummary.skinTemp > 0 ? '+' : '' }}{{ dailySummary.skinTemp.toFixed(1) }}°</div>
                <div class="stat-label">Skin Temp</div>
              </div>
              <div class="summary-stat" v-if="dailySummary.vo2Max">
                <div class="stat-value">{{ dailySummary.vo2Max.toFixed(0) }}</div>
                <div class="stat-label">VO2 Max</div>
              </div>
            </div>
            <!-- Sleep Stages -->
            <div v-if="dailySummary.sleepStages.length" class="pulso-stats__group">
              <div class="pulso-stats__group-title">Sleep Stages</div>
              <div class="pulso-stats__grid pulso-stats__grid--small">
                <div v-for="(st, i) in sleepStageSummary" :key="i" class="summary-stat summary-stat--small">
                  <div class="stat-value">{{ Math.round(st.minutes) }}m</div>
                  <div class="stat-label">{{ st.label }}</div>
                </div>
              </div>
            </div>
            <!-- Heart Rate Zones -->
            <div v-if="dailySummary.heartRateZones.length" class="pulso-stats__group">
              <div class="pulso-stats__group-title">Heart Rate Zones</div>
              <div class="pulso-stats__grid pulso-stats__grid--small">
                <div v-for="zone in dailySummary.heartRateZones.filter(z => z.minutes > 0)" :key="zone.name" class="summary-stat summary-stat--small">
                  <div class="stat-value">{{ zone.minutes }}m</div>
                  <div class="stat-label">{{ zone.name }}</div>
                  <div class="stat-sublabel">{{ zone.min }}–{{ zone.max }} bpm</div>
                </div>
              </div>
            </div>
          </div>
        </ion-card-content>
      </ion-card>

      <!-- Auto-Sync Controls -->
      <ion-card class="pulso-card pulso-card--sync">
        <ion-card-content class="pulso-card__content">
          <ion-item lines="none" class="pulso-sync__row">
            <ion-label>
              <h2 class="pulso-sync__title">Auto Sync</h2>
              <p v-if="autoSyncEnabled && lastSyncTime" class="pulso-sync__meta">Last sync · {{ lastSyncTime }}</p>
              <p v-else-if="autoSyncEnabled" class="pulso-sync__meta">Sync starting…</p>
              <p v-else class="pulso-sync__meta pulso-sync__meta--off">Disabled</p>
            </ion-label>
            <ion-toggle :checked="autoSyncEnabled" @ionChange="toggleAutoSync($event)"></ion-toggle>
          </ion-item>
          <ion-item v-if="autoSyncEnabled" lines="none" class="pulso-sync__row">
            <ion-label class="pulso-sync__interval-label">Interval</ion-label>
            <ion-select :value="syncIntervalMinutes" @ionChange="updateSyncInterval($event)" interface="popover">
              <ion-select-option :value="5">5 min</ion-select-option>
              <ion-select-option :value="15">15 min</ion-select-option>
              <ion-select-option :value="30">30 min</ion-select-option>
              <ion-select-option :value="60">60 min</ion-select-option>
            </ion-select>
          </ion-item>
        </ion-card-content>
      </ion-card>

      <!-- Workouts -->
      <div v-if="fitbitWorkouts.length" class="pulso-section">
        <div class="pulso-section__header">
          <div class="pulso-section__title">Recent Workouts</div>
          <div class="pulso-section__count">{{ fitbitWorkouts.length }}</div>
        </div>
        <ion-card v-for="(workout, index) in fitbitWorkouts" :key="index" class="pulso-card pulso-card--workout">
          <ion-card-header class="pulso-card__header">
            <ion-card-title class="pulso-card__title">{{ workout.activityName }}</ion-card-title>
            <div class="pulso-card__date">{{ new Date(workout.startTime).toLocaleString() }}</div>
          </ion-card-header>
          <ion-card-content class="pulso-card__content">
            <div class="pulso-workout__metrics">
              <div class="pulso-workout__metric">
                <div class="stat-value">{{ workout.calories }}</div>
                <div class="stat-label">kcal</div>
              </div>
              <div class="pulso-workout__metric">
                <div class="stat-value">{{ Math.round(workout.duration / 60000) }}</div>
                <div class="stat-label">min</div>
              </div>
              <div class="pulso-workout__metric" v-if="workout.distance">
                <div class="stat-value">{{ (workout.distance / 1000).toFixed(2) }}</div>
                <div class="stat-label">km</div>
              </div>
              <div class="pulso-workout__metric" v-if="workout.steps">
                <div class="stat-value">{{ workout.steps.toLocaleString() }}</div>
                <div class="stat-label">Steps</div>
              </div>
            </div>
            <ion-button class="pulso-workout__cta" expand="block" size="small"
              :color="workout.buttonColor" :disabled="workout.isButtonDisabled"
              @click="saveWorkout(workout)">{{ workout.buttonLabel }}</ion-button>
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
import PulsoMark from '../components/PulsoMark.vue';
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
    PulsoMark,
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
    // Dev-only: ?demo=1 injects mock data so designers can iterate on the UI
    // without going through the Fitbit OAuth flow.
    if (import.meta.env.DEV && typeof window !== 'undefined' && window.location.search.includes('demo=1')) {
      this.loadDemoFixtures();
      return;
    }

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
          const HK_AUTH_VERSION = '6';
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
    // One-time backfill of the overnight recovery metrics Bevel reads (HRV, SpO2, wrist
    // temperature) over the last `days` days. HRV was previously written at midday (outside
    // the sleep window) and wrist temperature was never written at all, so Bevel had no trend.
    // Deletes app-authored samples of each type, then re-writes them inside the sleep window.
    async resyncRecoveryHistory(days = 30) {
      const HRV_TYPE = 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN';
      const SPO2_TYPE = 'HKQuantityTypeIdentifierOxygenSaturation';
      try {
        this.sleepError = 'Deleting old HRV / SpO2 samples...';
        let deleted = 0;
        for (const t of [HRV_TYPE, SPO2_TYPE]) {
          try {
            const r = await SleepPlugin.deleteAppQuantitySamples({ sampleType: t });
            deleted += r.deleted;
          } catch {}
        }

        let hrvSaved = 0, spo2Saved = 0, errors = 0;
        for (let i = 0; i < days; i++) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const dateStr = this.formatDateStr(d);
          this.sleepError = `Re-syncing ${dateStr} (${i + 1}/${days})...`;
          try {
            const { hrvDaily, spo2, sleepEnd } = await fitbit.fetchOvernightMetrics(dateStr);
            const wake = this.overnightTimestamp({ date: dateStr, sleepEnd });
            const wakeEnd = new Date(wake.getTime() + 1000);

            if (hrvDaily && await this.trySaveQuantity(HRV_TYPE, 'ms', hrvDaily, wake, wakeEnd)) {
              this.markItemSaved(dateStr, 'hrv');
              hrvSaved++;
            }
            if (spo2 && await this.trySaveQuantity(SPO2_TYPE, '%', spo2 / 100, wake, wakeEnd)) {
              this.markItemSaved(dateStr, 'spo2');
              spo2Saved++;
            }
          } catch (e: any) {
            errors++;
            if (e?.message?.includes('429') || e?.message?.includes('rate')) {
              this.sleepError = `Rate limited at ${dateStr}. Wait 1h and retry. Saved so far — HRV ${hrvSaved}, SpO2 ${spo2Saved}`;
              return;
            }
          }
        }
        this.sleepError = `Re-sync complete: deleted ${deleted}, saved HRV ${hrvSaved}, SpO2 ${spo2Saved} day(s), ${errors} errors`;
      } catch (e: any) {
        this.sleepError = 'Re-sync failed: ' + (e?.message || String(e));
      }
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
    loadDemoFixtures() {
      const today = this.formatDateStr(new Date());
      this.loggedIn = true;
      this.syncStatus = 'Saved to Apple Health: steps + distance + sleep';
      this.lastSyncTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      this.autoSyncEnabled = true;
      this.syncIntervalMinutes = 15;
      this.sleepError = '23:42–07:18 (asleep 412m, 38 stages): SAVED 38 stages (replaced 0)';
      this.dailySummary = {
        date: today,
        steps: 11248,
        distanceKm: 8.4,
        caloriesOut: 2647,
        activeMinutes: 64,
        restingHeartRate: 58,
        heartRateZones: [
          { name: 'Out of Range', min: 30, max: 97, minutes: 1142, caloriesOut: 1820 },
          { name: 'Fat Burn', min: 97, max: 136, minutes: 184, caloriesOut: 612 },
          { name: 'Cardio', min: 136, max: 166, minutes: 38, caloriesOut: 192 },
          { name: 'Peak', min: 166, max: 220, minutes: 9, caloriesOut: 58 },
        ],
        heartRateIntraday: [],
        sleepMinutes: 412,
        sleepStart: `${today}T23:42:00`,
        sleepEnd: `${today}T07:18:00`,
        sleepStages: [
          { stage: 'deep', startTime: '', endTime: '', seconds: 78 * 60 },
          { stage: 'light', startTime: '', endTime: '', seconds: 226 * 60 },
          { stage: 'rem', startTime: '', endTime: '', seconds: 108 * 60 },
          { stage: 'wake', startTime: '', endTime: '', seconds: 34 * 60 },
        ],
        sleepLogs: [],
        hrvDaily: 47,
        spo2: 96.4,
        breathingRate: 14.2,
        skinTemp: -0.3,
        vo2Max: 42,
      };
      this.fitbitWorkouts = [
        {
          logId: 1, activityName: 'Outdoor Run', calories: 612, duration: 38 * 60 * 1000,
          distance: 6420, steps: 7912, startTime: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
          buttonLabel: 'Saved!', buttonColor: 'success', isButtonDisabled: true,
        },
        {
          logId: 2, activityName: 'Indoor Cycle', calories: 384, duration: 45 * 60 * 1000,
          distance: 14200, steps: 0, startTime: new Date(Date.now() - 28 * 3600 * 1000).toISOString(),
          buttonLabel: 'Save to Apple Health', buttonColor: 'tertiary', isButtonDisabled: false,
        },
      ];
    },
    formatTodayLabel(dateStr: string): string {
      try {
        const d = new Date(dateStr + 'T00:00:00');
        return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
      } catch {
        return dateStr;
      }
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
      // Fitbit only exposes daily RMSSD; HealthKit only has an SDNN HRV type, so we map
      // RMSSD -> SDNN. The absolute value won't match a native Apple Watch reading, but
      // recovery apps (Bevel etc.) build a personal baseline from your own data, so a
      // consistent series is what matters.
      // Crucially, those apps read HRV from the overnight/morning window. Stamp the sample
      // at wake time (end of main sleep) instead of midday, otherwise it falls outside the
      // sleep window and gets ignored. Fall back to early morning when sleep data is missing.
      if (s.hrvDaily && !alreadySaved.includes('hrv')) {
        const hrvTime = this.overnightTimestamp(s);
        const hrvEnd = new Date(hrvTime.getTime() + 1000);
        if (await this.trySaveQuantity('HKQuantityTypeIdentifierHeartRateVariabilitySDNN', 'ms', s.hrvDaily, hrvTime, hrvEnd)) {
          this.markItemSaved(s.date, 'hrv');
          saved.push('HRV');
        }
      }

      // SpO2 — stamped at wake time (inside the detected sleep session) like HRV, instead of
      // a fixed 04:00 that can fall at the edge of or outside the night Bevel recognizes.
      if (s.spo2 && !alreadySaved.includes('spo2')) {
        const spo2Time = this.overnightTimestamp(s);
        const spo2End = new Date(spo2Time.getTime() + 1000);
        if (await this.trySaveQuantity('HKQuantityTypeIdentifierOxygenSaturation', '%', s.spo2 / 100, spo2Time, spo2End)) {
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
    // Best timestamp for an overnight/morning metric (HRV): the wake time at the end of
    // the main sleep, so recovery apps that scan the sleep window pick it up. Falls back to
    // 04:00 local on the summary date when sleep data is unavailable or unparseable.
    overnightTimestamp(s: any): Date {
      const fallback = new Date(s.date + 'T04:00:00');
      const end = s.sleepEnd ? new Date(s.sleepEnd) : null;
      return end && !isNaN(end.getTime()) ? end : fallback;
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
/* ============================================================
   PULSO design tokens (scoped to view)
   Accent #FF4500 · Deep #011D22 · Light #FCFCFC
   Space Mono — brand, headings, numbers · Open Sans — body
   ============================================================ */

ion-content {
  --background: var(--ion-background-color);
  --overflow: hidden auto;
}

/* --- Compact title in collapsed toolbar --- */
.pulso-title-compact {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: var(--ion-font-family);
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--ion-text-color);
}
.pulso-title-compact__mark {
  font-size: 1.4em;
}

/* --- Large brand header (collapse=condense) --- */
:deep(.header-collapse-condense ion-toolbar) {
  --min-height: 130px;
  --padding-top: 8px;
  --padding-bottom: 8px;
}
:deep(.header-collapse-condense ion-title) {
  --padding-top: 20px;
  --padding-bottom: 16px;
}
.pulso-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  min-width: 0;
}
.pulso-brand__mark {
  font-size: 36px;
}
.pulso-brand__text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  line-height: 1;
  min-width: 0;
}
.pulso-brand__name {
  font-family: var(--ion-font-family);
  font-weight: 700;
  font-size: 26px;
  letter-spacing: -0.02em;
  line-height: 1;
  color: var(--ion-text-color);
}
.pulso-brand__tagline {
  font-family: var(--font-secondary);
  font-weight: 500;
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ion-color-medium);
  line-height: 1.3;
  white-space: normal;
}

/* --- Actions row --- */
.pulso-actions {
  display: flex;
  gap: 8px;
  align-items: stretch;
  justify-content: space-between;
  padding: 12px 16px 4px;
}
.pulso-actions ion-button {
  --border-radius: 12px;
  --box-shadow: none;
  font-family: var(--ion-font-family);
  font-weight: 700;
  text-transform: none;
  letter-spacing: 0.02em;
  margin: 0;
  height: 44px;
}
.pulso-actions__primary {
  flex: 1 1 auto;
  min-width: 0;
  --background: var(--pulso-accent);
  --background-hover: var(--ion-color-primary-shade);
  --color: var(--pulso-light);
}

/* --- Banners --- */
.pulso-banner {
  margin: 12px 16px;
  border-radius: 14px;
  font-family: var(--font-secondary);
  line-height: 1.4;
}
.pulso-banner--status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 16px;
  background: var(--pulso-accent);
  color: var(--pulso-light);
  font-family: var(--ion-font-family);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  text-align: center;
  word-break: break-word;
  min-width: 0;
}
.pulso-banner--status > * {
  min-width: 0;
}
.pulso-banner__dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--pulso-light);
  box-shadow: 0 0 0 0 rgba(252, 252, 252, 0.6);
  animation: pulso-pulse 1.6s ease-out infinite;
}
@keyframes pulso-pulse {
  0%   { box-shadow: 0 0 0 0 rgba(252, 252, 252, 0.6); }
  70%  { box-shadow: 0 0 0 8px rgba(252, 252, 252, 0); }
  100% { box-shadow: 0 0 0 0 rgba(252, 252, 252, 0); }
}
.pulso-banner--tools {
  padding: 12px 14px;
  background: rgba(var(--ion-color-primary-rgb), 0.06);
  color: var(--ion-text-color);
  border: 1px solid rgba(var(--ion-color-primary-rgb), 0.18);
  font-size: 13px;
}
.pulso-banner__tools-msg {
  margin-bottom: 10px;
  color: var(--ion-color-medium);
  font-size: 12px;
  text-align: center;
}
.pulso-banner__tools-actions {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}
.pulso-banner__tools-actions ion-button {
  --border-color: var(--pulso-accent);
  --color: var(--pulso-accent);
  --border-radius: 8px;
  font-family: var(--ion-font-family);
  font-size: 10px;
  font-weight: 700;
  text-transform: none;
  letter-spacing: 0.02em;
  margin: 0;
  --padding-start: 4px;
  --padding-end: 4px;
  min-width: 0;
}

/* --- Cards --- */
.pulso-card {
  margin: 12px 16px;
  border-radius: 18px;
  box-shadow: 0 1px 2px rgba(1, 29, 34, 0.04), 0 4px 16px rgba(1, 29, 34, 0.05);
  overflow: hidden;
  border: 1px solid rgba(var(--ion-color-medium-rgb), 0.12);
}
.pulso-card__header {
  padding: 16px 18px 4px;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}
.pulso-card__title {
  font-family: var(--ion-font-family);
  font-weight: 700;
  font-size: 13px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ion-text-color);
  margin: 0;
  padding: 0;
}
.pulso-card__date {
  font-family: var(--font-secondary);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--ion-color-medium);
  text-transform: uppercase;
}
.pulso-card__content {
  padding: 8px 12px 14px;
}
.pulso-card--summary {
  border-left: 3px solid var(--pulso-accent);
}

/* --- Stat grid (CSS grid, wraps without overflow) --- */
.pulso-stats {
  display: flex;
  flex-direction: column;
}
.pulso-stats__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px;
  padding: 6px 4px;
}
.pulso-stats__grid--hero {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  padding-bottom: 10px;
  border-bottom: 1px dashed rgba(var(--ion-color-medium-rgb), 0.18);
}
.pulso-stats__grid--small {
  grid-template-columns: repeat(auto-fit, minmax(72px, 1fr));
  gap: 6px;
  padding: 4px 0 0;
}
.pulso-stats__grid + .pulso-stats__grid {
  border-top: 1px dashed rgba(var(--ion-color-medium-rgb), 0.18);
  margin-top: 2px;
  padding-top: 10px;
}
.summary-stat {
  text-align: center;
  padding: 8px 4px;
  min-width: 0;
  overflow: hidden;
}
.stat-value {
  font-family: var(--ion-font-family);
  font-size: 20px;
  font-weight: 700;
  color: var(--pulso-accent);
  letter-spacing: -0.03em;
  line-height: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: clip;
}
.summary-stat--hero .stat-value {
  font-size: 24px;
}
.summary-stat--small .stat-value {
  font-size: 16px;
}
.stat-label {
  font-family: var(--font-secondary);
  font-size: 10px;
  color: var(--ion-color-medium);
  margin-top: 6px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.stat-sublabel {
  font-family: var(--ion-font-family);
  font-size: 9px;
  color: var(--ion-color-medium);
  letter-spacing: 0.02em;
  margin-top: 2px;
  opacity: 0.7;
  white-space: nowrap;
}
.pulso-stats__group {
  margin-top: 10px;
  padding-top: 12px;
  border-top: 1px solid rgba(var(--ion-color-medium-rgb), 0.14);
}
.pulso-stats__group-title {
  font-family: var(--ion-font-family);
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--ion-text-color);
  opacity: 0.6;
  padding: 0 4px 6px;
}

/* --- Auto-sync card --- */
.pulso-card--sync .pulso-sync__row {
  --background: transparent;
  --padding-start: 6px;
  --inner-padding-end: 6px;
  --min-height: 44px;
}
.pulso-sync__title {
  font-family: var(--ion-font-family);
  font-weight: 700;
  font-size: 14px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ion-text-color);
  margin: 0;
}
.pulso-sync__meta {
  font-family: var(--font-secondary);
  font-size: 12px;
  color: var(--ion-color-medium);
  margin-top: 2px;
}
.pulso-sync__meta--off {
  color: var(--ion-color-medium);
  opacity: 0.7;
}
.pulso-sync__interval-label {
  font-family: var(--ion-font-family);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ion-text-color);
}
ion-toggle {
  --handle-background-checked: var(--pulso-light);
  --background-checked: var(--pulso-accent);
}

/* --- Section header (e.g. Recent Workouts) --- */
.pulso-section {
  margin-top: 8px;
}
.pulso-section__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 18px 22px 6px;
}
.pulso-section__title {
  font-family: var(--ion-font-family);
  font-weight: 700;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--ion-text-color);
}
.pulso-section__count {
  font-family: var(--ion-font-family);
  font-weight: 700;
  font-size: 11px;
  letter-spacing: 0.06em;
  color: var(--pulso-accent);
  background: rgba(var(--ion-color-primary-rgb), 0.1);
  padding: 2px 8px;
  border-radius: 999px;
}

/* --- Workout cards --- */
.pulso-workout__metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(60px, 1fr));
  gap: 6px;
  padding: 4px 0 14px;
}
.pulso-workout__metric {
  text-align: center;
  padding: 6px 4px;
}
.pulso-workout__metric .stat-value {
  font-size: 22px;
}
.pulso-workout__cta {
  --border-radius: 10px;
  --box-shadow: none;
  margin: 0;
  font-family: var(--ion-font-family);
  font-weight: 700;
  text-transform: none;
  letter-spacing: 0.02em;
  font-size: 12px;
}
</style>
