# PULSO

> Syncing Fitbit to Apple Health data.

A native iOS app (Ionic + Vue + Capacitor) that pulls your Fitbit data and writes it into Apple Health on-device. No backend, no third-party servers in the loop — your tokens and data never leave the device.

> **PULSO is a substantially revised fork of [Fitbit2AppleHealth](https://github.com/anbarsaleem/Fitbit2AppleHealth) by [@anbarsaleem](https://github.com/anbarsaleem).** The upstream project shipped an Express backend and synced weight workouts only. PULSO removes the backend, expands the metrics coverage, fixes the auth-persistence and refresh issues, and ships a custom design system.

---

## What's different from upstream

- **No backend.** OAuth (PKCE) and every Fitbit API call run on-device. The Express server in `app/api/` is no longer required for normal use and is kept only for reference.
- **Persistent auth.** Tokens are stored via `@capacitor/preferences` (iOS UserDefaults) instead of `localStorage`, which iOS regularly purges from WebViews — fixes the "logged out every day" problem.
- **Resilient token refresh.** The previous logic wiped tokens on *any* non-OK refresh response (including 429 rate limits and transient 5xx). PULSO only invalidates the session on definitive OAuth errors (`invalid_grant` / `invalid_token` / `invalid_client`), so a temporary network blip no longer kicks the user out — fixes "app no longer available after a week".
- **Expanded metrics sync.** Beyond workouts: daily steps, distance, calories, active minutes, resting heart rate, HRV, SpO₂, respiratory rate, skin temperature, VO₂ max, sleep stages, heart-rate zones.
- **Auto-sync.** Background refresh on configurable interval (5/15/30/60 min) and on app foreground.
- **Sleep history restore.** One-tap restore of the last 14 or 30 days of sleep data to Apple Health, with a reset-and-resave path.
- **Custom brand.** New name, palette and typography (see [Design system](#design-system)).

## Tech stack

- **Frontend:** Ionic 7 + Vue 3 + Vite (TypeScript)
- **Native shell:** Capacitor 5 (iOS)
- **HealthKit bridge:** `@ionic-native/health-kit` + a small custom Swift sleep plugin (`ios/App/App/SleepPlugin.swift`)
- **Auth:** Fitbit OAuth 2.0 with PKCE, fully on-device
- **Storage:** `@capacitor/preferences` (UserDefaults) for tokens and PKCE verifier; `localStorage` for non-sensitive UI prefs

## Build

### Prerequisites
- Xcode + an Apple Developer account (required to install on a physical device)
- Node ≥ 18, Yarn
- A Fitbit developer app (free) — register at <https://dev.fitbit.com/apps/new> with:
  - **OAuth 2.0 Application Type:** Personal
  - **Callback URL:** `f2ahclient://callback`
  - **Default Access Type:** Read-Only
  - **Scopes:** `activity cardio_fitness heartrate weight sleep oxygen_saturation respiratory_rate temperature`

### Steps

```bash
cd app/client
yarn install
# set your Fitbit client_id in src/services/fitbitService.ts (CLIENT_ID constant)
yarn build
npx cap sync ios
npx cap open ios
```

In Xcode: configure your team and provisioning profile under **Signing & Capabilities**, then build to a device or simulator with the run button.

The bundle ID is `com.ionic.fitbitapplehealth`. To publish under your own identity, change `PRODUCT_BUNDLE_IDENTIFIER` in the Xcode project and `appId` in `capacitor.config.ts`. The OAuth scheme `f2ahclient://` is hardcoded in `ios/App/App/Info.plist` (`CFBundleURLSchemes`) and in `src/services/fitbitService.ts`; if you change it, update both **and** the Callback URL on the Fitbit dashboard.

### Local dev (browser)

```bash
yarn dev
```

The OAuth callback uses a custom URL scheme that only resolves inside Capacitor, so the full login flow can only be exercised on an iOS build. The dev server is useful for layout, styling, and component work.

## Usage

1. **Login to Fitbit** — opens the Fitbit OAuth page in an in-app browser; on success you're redirected back to PULSO and tokens are persisted.
2. **Grant HealthKit permissions** — iOS will prompt for read/write access to the metric types PULSO needs. PULSO versions its auth request, so adding new metrics in future versions will re-prompt automatically.
3. **Today's summary** loads automatically and is auto-written to Apple Health on every refresh.
4. **Auto Sync** toggle (in-app) schedules background refreshes at your chosen interval and on app foreground.
5. **Workouts** appear as cards; tap the per-card button to sync any individual workout to HealthKit.
6. **Sleep tools** let you restore the last 14/30 days of sleep history or reset and resave PULSO-written sleep samples.

## Design system

| Token            | Value                | Usage                                              |
|------------------|----------------------|----------------------------------------------------|
| Accent           | `#FF4500`            | Primary CTAs, key numeric values, status banners   |
| Deep             | `#011D22`            | Text (light mode), background (dark mode)          |
| Light            | `#FCFCFC`            | Background (light mode), text (dark mode)          |
| Font — primary   | Space Mono           | Brand mark, headings, numeric values, UI chrome    |
| Font — secondary | Open Sans            | Body copy, descriptions, tagline                   |

Tokens live in `app/client/src/theme/variables.css` with light + dark variants driven by `prefers-color-scheme`.

## Project layout

```
.
├── app/
│   ├── api/        # Legacy Express backend from upstream (no longer required)
│   └── client/     # Ionic / Vue / Capacitor app — the actual PULSO codebase
│       ├── src/
│       │   ├── views/HomePage.vue
│       │   ├── services/fitbitService.ts   # PKCE OAuth + Fitbit API
│       │   ├── services/sleepPlugin.ts     # bridge to native sleep plugin
│       │   └── theme/variables.css         # PULSO design tokens
│       └── ios/
│           └── App/App/SleepPlugin.swift   # native HealthKit sleep writer
└── README.md
```

## Credits

- **Original project:** [Fitbit2AppleHealth](https://github.com/anbarsaleem/Fitbit2AppleHealth) by [@anbarsaleem](https://github.com/anbarsaleem) — Express backend, PKCE-less OAuth via server, weight-workout sync.
- **This fork (PULSO):** backend removal, on-device PKCE, expanded metric coverage, auth-persistence fixes, sleep history tooling, redesign.

## License

This fork inherits any terms set by the upstream repository. Refer to the original [Fitbit2AppleHealth](https://github.com/anbarsaleem/Fitbit2AppleHealth) repo for license details.
