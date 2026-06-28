/**
 * Fitbit OAuth 2.0 PKCE + API service
 * Runs entirely on-device, no backend required.
 */
import { Browser } from '@capacitor/browser';
import { Preferences } from '@capacitor/preferences';

const CLIENT_ID = '23VCLS';
// Must match exactly what's configured in Fitbit Developer dashboard
const REDIRECT_URI = 'f2ahclient://callback';
const SCOPES = 'activity cardio_fitness heartrate weight sleep oxygen_saturation respiratory_rate temperature';
const TOKEN_STORAGE_KEY = 'fitbit_tokens';
const VERIFIER_STORAGE_KEY = 'fitbit_pkce_verifier';

interface FitbitTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number; // timestamp ms
}

// --- PKCE helpers ---

function generateRandomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let result = '';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  for (let i = 0; i < length; i++) {
    result += chars[array[i] % chars.length];
  }
  return result;
}

async function sha256(plain: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  return crypto.subtle.digest('SHA-256', encoder.encode(plain));
}

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function generatePKCEChallenge(verifier: string): Promise<{ challenge: string; method: string }> {
  // Try S256 first, fallback to plain if crypto.subtle not available
  try {
    if (crypto?.subtle) {
      const buffer = await sha256(verifier);
      return { challenge: base64UrlEncode(buffer), method: 'S256' };
    }
  } catch {
    // fallback below
  }
  // Plain fallback (less secure but works everywhere)
  return { challenge: verifier, method: 'plain' };
}

// --- Token persistence (Capacitor Preferences = UserDefaults on iOS, persists across iOS WebView cache purges that nuke localStorage) ---

async function saveTokens(tokens: FitbitTokens): Promise<void> {
  await Preferences.set({ key: TOKEN_STORAGE_KEY, value: JSON.stringify(tokens) });
}

async function loadTokens(): Promise<FitbitTokens | null> {
  const { value } = await Preferences.get({ key: TOKEN_STORAGE_KEY });
  if (value) {
    try { return JSON.parse(value); } catch { return null; }
  }
  // One-shot migration: pull legacy tokens out of localStorage so existing users
  // don't get logged out by this very fix
  const legacy = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (legacy) {
    try {
      const parsed = JSON.parse(legacy) as FitbitTokens;
      await Preferences.set({ key: TOKEN_STORAGE_KEY, value: legacy });
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      return parsed;
    } catch {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  }
  return null;
}

async function clearTokens(): Promise<void> {
  await Preferences.remove({ key: TOKEN_STORAGE_KEY });
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}

async function saveVerifier(verifier: string): Promise<void> {
  await Preferences.set({ key: VERIFIER_STORAGE_KEY, value: verifier });
}

async function loadVerifier(): Promise<string | null> {
  const { value } = await Preferences.get({ key: VERIFIER_STORAGE_KEY });
  if (value) return value;
  // Migration fallback for an in-flight login started before this update
  return localStorage.getItem(VERIFIER_STORAGE_KEY);
}

async function clearVerifier(): Promise<void> {
  await Preferences.remove({ key: VERIFIER_STORAGE_KEY });
  localStorage.removeItem(VERIFIER_STORAGE_KEY);
}

function isTokenExpired(tokens: FitbitTokens): boolean {
  // Consider expired 60s before actual expiry for safety
  return Date.now() >= tokens.expires_at - 60000;
}

// --- OAuth flow ---

export async function startLogin(): Promise<void> {
  const codeVerifier = generateRandomString(64);
  await saveVerifier(codeVerifier);

  const { challenge, method } = await generatePKCEChallenge(codeVerifier);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    scope: SCOPES,
    redirect_uri: REDIRECT_URI,
    code_challenge: challenge,
    code_challenge_method: method,
  });

  const url = `https://www.fitbit.com/oauth2/authorize?${params.toString()}`;
  await Browser.open({ url, presentationStyle: 'fullscreen' });
}

export async function handleCallback(code: string): Promise<FitbitTokens> {
  const codeVerifier = await loadVerifier();
  if (!codeVerifier) {
    throw new Error('Missing PKCE code verifier. Please login again.');
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    client_id: CLIENT_ID,
    code_verifier: codeVerifier,
  });

  const response = await fetch('https://api.fitbit.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(`Token exchange failed: ${errData.errors?.[0]?.message || response.statusText}`);
  }

  const data = await response.json();
  const tokens: FitbitTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };

  await saveTokens(tokens);
  await clearVerifier();
  return tokens;
}

async function refreshTokens(): Promise<FitbitTokens> {
  const current = await loadTokens();
  if (!current?.refresh_token) {
    throw new Error('No refresh token. Please login to Fitbit.');
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: current.refresh_token,
    client_id: CLIENT_ID,
  });

  let response: Response;
  try {
    response = await fetch('https://api.fitbit.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
  } catch (networkErr: any) {
    // Network failure / offline: keep tokens, surface error so caller can retry
    throw new Error(`Token refresh network error: ${networkErr?.message || networkErr}`);
  }

  if (!response.ok) {
    // Only clear tokens on definitive OAuth errors (refresh token rejected by Fitbit).
    // 429 (rate limit), 5xx (server), and transient errors must NOT wipe the session —
    // the previous behavior caused "app no longer available" after a single bad request.
    const errBody = await response.json().catch(() => ({} as any));
    const errType: string = errBody?.errors?.[0]?.errorType || '';
    const isAuthDead =
      (response.status === 400 || response.status === 401) &&
      (errType === 'invalid_grant' || errType === 'invalid_token' || errType === 'invalid_client');
    if (isAuthDead) {
      await clearTokens();
      throw new Error('Fitbit authorization expired. Please login again.');
    }
    throw new Error(`Token refresh failed (${response.status}). Will retry on next request.`);
  }

  const data = await response.json();
  const tokens: FitbitTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };

  await saveTokens(tokens);
  return tokens;
}

/** Get a valid access token, refreshing if needed */
export async function getAccessToken(): Promise<string> {
  let tokens = await loadTokens();
  if (!tokens) {
    throw new Error('Not authenticated. Please login to Fitbit.');
  }
  if (isTokenExpired(tokens)) {
    tokens = await refreshTokens();
  }
  return tokens.access_token;
}

/** Check if user is logged in (has stored tokens) */
export async function isLoggedIn(): Promise<boolean> {
  return (await loadTokens()) !== null;
}

/** Logout - clear stored tokens */
export async function logout(): Promise<void> {
  await clearTokens();
}

// --- Fitbit API calls ---

// Helper: authenticated fetch with no-cache headers
async function fitbitFetch(url: string): Promise<Response> {
  const accessToken = await getAccessToken();
  return fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
      'Cache-Control': 'no-cache, no-store',
      'Pragma': 'no-cache',
    },
  });
}

// Build a 429 error that includes Fitbit's own retry window (Retry-After / rate-limit-reset
// seconds), so the UI can tell the user exactly how long to wait instead of guessing.
function rateLimitError(res: Response): Error {
  const raw = res.headers.get('retry-after') || res.headers.get('fitbit-rate-limit-reset');
  const secs = raw ? parseInt(raw, 10) : NaN;
  return new Error(isNaN(secs) ? '429 rate limited' : `429 rate limited; retry in ${Math.max(1, Math.ceil(secs / 60))} min`);
}

// --- Daily summary & extra data ---

export interface HeartRateZone {
  name: string;       // e.g. "Fat Burn", "Cardio", "Peak"
  min: number;
  max: number;
  minutes: number;
  caloriesOut: number;
}

export interface HeartRateSample {
  time: string;   // "HH:mm:ss"
  value: number;  // bpm
}

export interface SleepStage {
  stage: string;   // 'deep' | 'light' | 'rem' | 'wake'
  startTime: string;
  endTime: string;
  seconds: number;
}

export interface SleepLog {
  logId: number;
  startTime: string;
  endTime: string;
  duration: number;       // ms
  minutesAsleep: number;
  isMainSleep: boolean;
  stages: SleepStage[];
}

export interface DailySummary {
  steps: number;
  distanceKm: number;
  caloriesOut: number;
  activeMinutes: number;
  restingHeartRate: number | null;
  heartRateZones: HeartRateZone[];
  heartRateIntraday: HeartRateSample[];
  sleepMinutes: number | null;
  sleepStart: string | null;
  sleepEnd: string | null;
  sleepStages: SleepStage[];
  sleepLogs: SleepLog[];
  hrvDaily: number | null;        // RMSSD in ms
  spo2: number | null;            // average SpO2 %
  breathingRate: number | null;   // breaths per minute
  skinTemp: number | null;        // relative skin temp variation in °C
  vo2Max: number | null;          // cardio fitness score
  date: string;
}

export async function fetchDailySummary(dateStr?: string): Promise<DailySummary> {
  const date = dateStr || formatDate(new Date());

  // Fetch activity summary
  const actRes = await fitbitFetch(`https://api.fitbit.com/1/user/-/activities/date/${date}.json`);
  if (!actRes.ok) throw new Error(`Activity summary failed: ${actRes.status}`);
  const actData = await actRes.json();

  const summary = actData.summary || {};
  const distanceObj = (summary.distances || []).find((d: any) => d.activity === 'total');

  // Fetch heart rate (zones + intraday)
  let restingHR: number | null = null;
  let heartRateZones: HeartRateZone[] = [];
  let heartRateIntraday: HeartRateSample[] = [];
  try {
    const hrRes = await fitbitFetch(`https://api.fitbit.com/1/user/-/activities/heart/date/${date}/1d/1min.json`);
    if (hrRes.ok) {
      const hrData = await hrRes.json();
      restingHR = hrData['activities-heart']?.[0]?.value?.restingHeartRate || null;

      // Heart rate zones
      const zones = hrData['activities-heart']?.[0]?.value?.heartRateZones || [];
      heartRateZones = zones.map((z: any) => ({
        name: z.name,
        min: z.min,
        max: z.max,
        minutes: z.minutes || 0,
        caloriesOut: z.caloriesOut || 0,
      }));

      // Intraday samples (1-min resolution)
      const dataset = hrData['activities-heart-intraday']?.dataset || [];
      heartRateIntraday = dataset.map((s: any) => ({
        time: s.time,
        value: s.value,
      }));
    }
  } catch {}

  // Fetch sleep (all logs including naps)
  let sleepMinutes: number | null = null;
  let sleepStart: string | null = null;
  let sleepEnd: string | null = null;
  let sleepStages: SleepStage[] = [];
  let sleepLogs: SleepLog[] = [];
  try {
    const sleepRes = await fitbitFetch(`https://api.fitbit.com/1.2/user/-/sleep/date/${date}.json`);
    if (sleepRes.ok) {
      const sleepData = await sleepRes.json();
      sleepMinutes = sleepData.summary?.totalMinutesAsleep || null;

      // Parse ALL sleep logs (main sleep + naps)
      for (const log of (sleepData.sleep || [])) {
        const levels = log.levels?.data || [];
        const stages = levels.map((l: any) => ({
          stage: l.level,
          startTime: l.dateTime,
          endTime: new Date(new Date(l.dateTime).getTime() + l.seconds * 1000).toISOString(),
          seconds: l.seconds,
        }));
        sleepLogs.push({
          logId: log.logId,
          startTime: log.startTime,
          endTime: log.endTime,
          duration: log.duration,
          minutesAsleep: log.minutesAsleep,
          isMainSleep: log.isMainSleep,
          stages,
        });
      }

      // Main sleep for backward compat
      const mainSleep = sleepLogs.find(s => s.isMainSleep) || sleepLogs[0];
      if (mainSleep) {
        sleepStart = mainSleep.startTime;
        sleepEnd = mainSleep.endTime;
        sleepStages = mainSleep.stages;
      }
    }
  } catch {}

  // Fetch HRV (Heart Rate Variability)
  let hrvDaily: number | null = null;
  try {
    const hrvRes = await fitbitFetch(`https://api.fitbit.com/1/user/-/hrv/date/${date}.json`);
    if (hrvRes.ok) {
      const hrvData = await hrvRes.json();
      hrvDaily = hrvData.hrv?.[0]?.value?.dailyRmssd || null;
    }
  } catch {}

  // Fetch SpO2
  let spo2: number | null = null;
  try {
    const spo2Res = await fitbitFetch(`https://api.fitbit.com/1/user/-/spo2/date/${date}.json`);
    if (spo2Res.ok) {
      const spo2Data = await spo2Res.json();
      spo2 = spo2Data.value?.avg || spo2Data.value || null;
    }
  } catch {}

  // Fetch Breathing Rate
  let breathingRate: number | null = null;
  try {
    const brRes = await fitbitFetch(`https://api.fitbit.com/1/user/-/br/date/${date}.json`);
    if (brRes.ok) {
      const brData = await brRes.json();
      breathingRate = brData.br?.[0]?.value?.breathingRate || null;
    }
  } catch {}

  // Fetch Skin Temperature
  let skinTemp: number | null = null;
  try {
    const tempRes = await fitbitFetch(`https://api.fitbit.com/1/user/-/temp/skin/date/${date}.json`);
    if (tempRes.ok) {
      const tempData = await tempRes.json();
      skinTemp = tempData.tempSkin?.[0]?.value?.nightlyRelative || null;
    }
  } catch {}

  // Fetch VO2 Max (Cardio Fitness Score)
  let vo2Max: number | null = null;
  try {
    const vo2Res = await fitbitFetch(`https://api.fitbit.com/1/user/-/cardioscore/date/${date}.json`);
    if (vo2Res.ok) {
      const vo2Data = await vo2Res.json();
      vo2Max = vo2Data.cardioScore?.[0]?.value?.vo2Max || null;
    }
  } catch {}

  return {
    steps: summary.steps || 0,
    distanceKm: distanceObj ? parseFloat(distanceObj.distance) : 0,
    caloriesOut: summary.caloriesOut || 0,
    activeMinutes: (summary.fairlyActiveMinutes || 0) + (summary.veryActiveMinutes || 0),
    restingHeartRate: restingHR,
    heartRateZones,
    heartRateIntraday,
    sleepMinutes,
    sleepStart,
    sleepEnd,
    sleepStages,
    sleepLogs,
    hrvDaily,
    spo2,
    breathingRate,
    skinTemp,
    vo2Max,
    date,
  };
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Lightweight fetch for the overnight-metrics re-sync: HRV (daily RMSSD), SpO2, and the
// main-sleep wake time (used to stamp samples inside the overnight window). Avoids the full
// daily summary so a multi-day re-sync stays under Fitbit's hourly rate limit. Throws on
// HTTP 429 so the caller can stop and report a rate-limit instead of silently skipping days.
export async function fetchOvernightMetrics(dateStr: string): Promise<{
  hrvDaily: number | null;
  spo2: number | null;
  sleepEnd: string | null;
  hrvStatus: number;   // HTTP status of the HRV call (diagnostic)
  spo2Status: number;  // HTTP status of the SpO2 call (diagnostic)
}> {
  let hrvDaily: number | null = null;
  let spo2: number | null = null;
  let sleepEnd: string | null = null;

  const hrvRes = await fitbitFetch(`https://api.fitbit.com/1/user/-/hrv/date/${dateStr}.json`);
  if (hrvRes.status === 429) throw rateLimitError(hrvRes);
  if (hrvRes.ok) {
    const hrvData = await hrvRes.json();
    hrvDaily = hrvData.hrv?.[0]?.value?.dailyRmssd || null;
  }

  const spo2Res = await fitbitFetch(`https://api.fitbit.com/1/user/-/spo2/date/${dateStr}.json`);
  if (spo2Res.status === 429) throw rateLimitError(spo2Res);
  if (spo2Res.ok) {
    const spo2Data = await spo2Res.json();
    spo2 = spo2Data.value?.avg || spo2Data.value || null;
  }

  const sleepRes = await fitbitFetch(`https://api.fitbit.com/1.2/user/-/sleep/date/${dateStr}.json`);
  if (sleepRes.status === 429) throw rateLimitError(sleepRes);
  if (sleepRes.ok) {
    const sleepData = await sleepRes.json();
    const logs = sleepData.sleep || [];
    const mainSleep = logs.find((l: any) => l.isMainSleep) || logs[0];
    if (mainSleep) sleepEnd = mainSleep.endTime;
  }

  return { hrvDaily, spo2, sleepEnd, hrvStatus: hrvRes.status, spo2Status: spo2Res.status };
}

// Range fetches: one Fitbit call returns every day in [startStr, endStr], so a 30-day
// backfill costs 3 calls total instead of ~90 (avoids the hourly rate limit). Each returns
// a { date -> value } map plus the HTTP status for diagnostics. Throw on 429.
export async function fetchHrvRange(startStr: string, endStr: string): Promise<{ map: Record<string, number>; status: number }> {
  const res = await fitbitFetch(`https://api.fitbit.com/1/user/-/hrv/date/${startStr}/${endStr}.json`);
  if (res.status === 429) throw rateLimitError(res);
  const map: Record<string, number> = {};
  if (res.ok) {
    const data = await res.json();
    for (const e of (data.hrv || [])) {
      const v = e?.value?.dailyRmssd;
      if (v != null && e.dateTime) map[e.dateTime] = v;
    }
  }
  return { map, status: res.status };
}

export async function fetchSpo2Range(startStr: string, endStr: string): Promise<{ map: Record<string, number>; status: number }> {
  const res = await fitbitFetch(`https://api.fitbit.com/1/user/-/spo2/date/${startStr}/${endStr}.json`);
  if (res.status === 429) throw rateLimitError(res);
  const map: Record<string, number> = {};
  if (res.ok) {
    const data = await res.json();
    // Range endpoint returns an array; single-date returns an object — handle both.
    const arr = Array.isArray(data) ? data : (data?.dateTime ? [data] : []);
    for (const e of arr) {
      const v = e?.value?.avg;
      if (v != null && e.dateTime) map[e.dateTime] = v;
    }
  }
  return { map, status: res.status };
}

// Main-sleep start/end per night, keyed by the date the sleep is attributed to. Used to
// place HRV/SpO2 samples mid-sleep (firmly inside the sleep session) so recovery apps that
// scan the asleep window pick them up.
export async function fetchSleepRange(startStr: string, endStr: string): Promise<Record<string, { start: string; end: string }>> {
  const res = await fitbitFetch(`https://api.fitbit.com/1.2/user/-/sleep/date/${startStr}/${endStr}.json`);
  if (res.status === 429) throw rateLimitError(res);
  const map: Record<string, { start: string; end: string }> = {};
  if (res.ok) {
    const data = await res.json();
    for (const log of (data.sleep || [])) {
      if (log.isMainSleep && log.dateOfSleep && log.startTime && log.endTime) {
        map[log.dateOfSleep] = { start: log.startTime, end: log.endTime };
      }
    }
  }
  return map;
}

export let lastApiDebug = '';

export async function fetchWorkouts(): Promise<any[]> {
  const accessToken = await getAccessToken();

  // Use tomorrow's date so "beforeDate" includes today
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const day = String(tomorrow.getDate()).padStart(2, '0');
  const month = String(tomorrow.getMonth() + 1).padStart(2, '0');
  const year = tomorrow.getFullYear();

  const url = `https://api.fitbit.com/1/user/-/activities/list.json?beforeDate=${year}-${month}-${day}&sort=desc&offset=0&limit=50`;

  lastApiDebug = `Calling: ${url.substring(0, 60)}...`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
    },
  });

  lastApiDebug += ` | Status: ${response.status}`;

  if (!response.ok) {
    const errText = await response.text();
    lastApiDebug += ` | Error: ${errText.substring(0, 100)}`;
    if (response.status === 401) {
      const newTokens = await refreshTokens();
      const retryResponse = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${newTokens.access_token}`,
          'Accept': 'application/json',
        },
      });
      if (!retryResponse.ok) throw new Error('Failed to fetch workouts (retry)');
      const retryData = await retryResponse.json();
      return extractActivities(retryData);
    }
    throw new Error(`Fitbit API error ${response.status}: ${errText.substring(0, 100)}`);
  }

  const data = await response.json();
  const activities = extractActivities(data);
  lastApiDebug += ` | Activities: ${activities.length}`;
  if (activities.length > 0) {
    lastApiDebug += ` | First: ${activities[0].activityName}`;
  }
  return activities;
}

function extractActivities(data: any): any[] {
  if (data.activities && Array.isArray(data.activities)) {
    return data.activities;
  }
  return [];
}

// Map Fitbit activity names to HealthKit workout types
const HEALTHKIT_ACTIVITY_MAP: Record<string, string> = {
  'Walk': 'HKWorkoutActivityTypeWalking',
  'Run': 'HKWorkoutActivityTypeRunning',
  'Outdoor Run': 'HKWorkoutActivityTypeRunning',
  'Treadmill': 'HKWorkoutActivityTypeRunning',
  'Weights': 'HKWorkoutActivityTypeTraditionalStrengthTraining',
  'Workout': 'HKWorkoutActivityTypeTraditionalStrengthTraining',
  'Bike': 'HKWorkoutActivityTypeCycling',
  'Outdoor Bike': 'HKWorkoutActivityTypeCycling',
  'Spinning': 'HKWorkoutActivityTypeCycling',
  'Swim': 'HKWorkoutActivityTypeSwimming',
  'Yoga': 'HKWorkoutActivityTypeYoga',
  'Hike': 'HKWorkoutActivityTypeHiking',
  'Elliptical': 'HKWorkoutActivityTypeElliptical',
  'Sport': 'HKWorkoutActivityTypeMixedCardio',
  'Aerobic Workout': 'HKWorkoutActivityTypeMixedCardio',
  'Circuit Training': 'HKWorkoutActivityTypeHighIntensityIntervalTraining',
  'Interval Workout': 'HKWorkoutActivityTypeHighIntensityIntervalTraining',
  'Tennis': 'HKWorkoutActivityTypeTennis',
  'Basketball': 'HKWorkoutActivityTypeBasketball',
  'Soccer': 'HKWorkoutActivityTypeSoccer',
  'Golf': 'HKWorkoutActivityTypeGolf',
  'Martial Arts': 'HKWorkoutActivityTypeMartialArts',
  'Dance': 'HKWorkoutActivityTypeDance',
  'Pilates': 'HKWorkoutActivityTypePilates',
  'Stair Climbing': 'HKWorkoutActivityTypeStairClimbing',
  'Bootcamp': 'HKWorkoutActivityTypeHighIntensityIntervalTraining',
  'Kickboxing': 'HKWorkoutActivityTypeKickboxing',
};

export function getHealthKitActivityType(fitbitName: string): string {
  return HEALTHKIT_ACTIVITY_MAP[fitbitName] || 'HKWorkoutActivityTypeOther';
}
