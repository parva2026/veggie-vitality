# Veggie Vitality

A vegetarian nutrition tracker that runs entirely on your own device. Log what you
ate in plain English, see how the day adds up against your personal targets, and
ask a nutrition assistant questions about your own numbers.

Runs as a web app and as an Android app from the same source.

## What it does

- **Log food by describing it.** "2 cups rice and a bowl of dal" becomes weighed
  entries. A built-in food database handles common Indian and vegetarian staples
  offline; anything it doesn't recognise goes to the AI service you configured.
- **Log food from a photo.** On Android this uses the system camera picker.
- **Daily targets** for calories, protein, fibre, iron, B12, calcium and the rest,
  derived from your age, sex, weight, height and activity level.
- **Water and weight tracking**, with history.
- **Medicines and reminders.** Track up to 15 medicines, each with its own
  name, dose, note and up to 6 daily times, and tick doses off as you take
  them. Water reminders repeat across a window you choose. On Android these
  are real OS alarms and fire with the app closed — see
  [Reminders](#reminders).
- **Dr. Veggie**, a nutrition assistant that answers with your actual logged data
  as context. It is explicitly not a medical professional and says so.
- **Works offline** for everything except the AI-backed features.

## Your data

Everything lives on your device — there is no server and no account. On the web
that means `localStorage`; on Android it is Capacitor Preferences, backed by
SharedPreferences, because WebView storage can be evicted under storage pressure.

Your medicine list is never sent over the network. It is not part of the data
block Dr. Veggie reasons over; a medicine list names conditions you never
typed, so `buildHealthContext` takes a fixed set of keys that excludes it, and
a test asserts it stays excluded. The one way it leaves the device is a backup
you export yourself, which contains it along with everything else — treat that
file as medical records, not as a config file.

The only network request the app ever makes is to the AI endpoint you configured
(Google Gemini by default), and only when you have supplied an API key. The
shipped bundle carries a Content-Security-Policy that makes those the only hosts
it *can* reach — see [Using a different AI service](#using-a-different-ai-service).

Backups are plain JSON. The API key is **excluded by default** and has to be
opted into, because a backup is the kind of file people email to themselves.
Importing a backup that contains a key asks you separately before adopting it,
and names the server that key would be sent to.

## Getting an API key

By default the AI features use Google Gemini, so you need a key from
[Google AI Studio](https://aistudio.google.com/apikey). The free tier is enough
for personal use. Paste it into Settings; it is stored only on your device and is
sent only to the configured endpoint, in a request header — never in a URL.

Without a key the app still works: profile, targets, the offline food parser,
water, weight and history are all local.

## Using a different AI service

Settings → **Where requests go** lets you point the app somewhere other than
Google: your own proxy, a self-hosted model, OpenRouter, Groq, LM Studio, Ollama.
You choose three things:

| Field | Meaning |
| --- | --- |
| **API style** | `Gemini` for Google's `:generateContent` shape, `OpenAI-compatible` for the `/chat/completions` shape that nearly everything else speaks |
| **Address** | The base URL. For OpenAI-compatible services include the version segment (`https://openrouter.ai/api/v1`) — the app appends `/chat/completions`. For Gemini give the server root; the app appends the model path. |
| **Model** | e.g. `gemini-2.5-flash`, `gpt-4o-mini`, `llama3.1:8b`, `anthropic/claude-3.5-sonnet` |

### The address has to be allowed at build time

You cannot type an arbitrary host into Settings and have it work, and this is
deliberate. The bundle's CSP pins `connect-src` to a fixed list; a `<meta>` CSP
can only ever be *tightened* at runtime, never relaxed. If the endpoint were
freely settable, the protection that stops an injected script from posting your
API key and your health log to an arbitrary server would be gone.

So the list of reachable hosts is decided when you build. Copy `.env.example` to
`.env.local` and set:

```
VITE_API_ORIGINS=https://openrouter.ai,https://api.groq.com
```

then rebuild. Origins only — scheme, host, optional port, no path. Google's
endpoint is always allowed, so you never list it. The value lands in two places
at once: the CSP in `index.html`, and the allowlist `src/lib/apiConfig.js`
validates against, so a disallowed address gives you a readable sentence in
Settings instead of a silent console error.

Never put an API key in `.env.local` — it would be compiled into the JavaScript
and shipped inside the APK. Keys belong in Settings, on the device.

### Local models

`http://` is accepted only for loopback (`localhost`, `127.0.0.1`), where nothing
crosses the network. This works in the browser. It does **not** work in the
Android app, because the manifest sets `usesCleartextTraffic="false"` — and
loopback on the phone is the phone itself, not your PC. To use a model on your
PC from the phone, put it behind HTTPS on your LAN and add that origin to
`VITE_API_ORIGINS`.

## Running it

```bash
npm install
```

```bash
npm run dev
```

Other scripts:

| Command | What it does |
| --- | --- |
| `npm run build` | Production web build into `dist/` |
| `npm test` | Run the test suite |
| `npm run lint` | ESLint |
| `npm run android:sync` | Build the web app and sync it into `android/` |
| `npm run android:build` | The above, then assemble a debug APK |

## Building the Android app

Requires a JDK 21 and the Android SDK (platform 36, build-tools 36.0.0). Point
`android/local.properties` at your SDK:

```
sdk.dir=C\:\\Android\\Sdk
```

Then:

```bash
npm run android:build
```

The APK lands in `android/app/build/outputs/apk/debug/`.

The native project is hardened relative to the Capacitor default: backups and
device-to-device transfer are disabled (`allowBackup="false"` plus explicit
extraction rules), cleartext traffic is off, WebView debugging is off, and the
app requests **only** `INTERNET` — photo capture goes through the system picker
rather than a camera permission.

## Installing it on your own phone

This app is not meant to be published. Nothing here involves the Play Store, a
developer account, or sharing anything with anyone — you build an APK on your
machine and copy it to your phone. It stays private because you never distribute
the file, not because of any setting.

### Build a *release* APK, not the debug one

The debug APK is `android:debuggable="true"`. That flag lets anyone with USB
debugging and `adb` read the app's private storage on a connected phone — and
that is where your API key is stored. Use a release build for the copy you
actually keep on your phone.

Release builds have to be signed, and Android has no way to install an unsigned
APK. The signing key is generated by you, stays on your machine, and is never
committed (`android/.gitignore` covers `*.jks` and `keystore.properties`).

**1. Create the keystore (once).** From the `android` directory:

```bash
keytool -genkeypair -v -keystore veggie-release.jks -alias veggie -keyalg RSA -keysize 4096 -validity 10000
```

`keytool` will prompt you to choose a password and to enter a name and
organisation. For a personal build the name fields can be anything; the password
is the part that matters. Choose it yourself and keep it in your password
manager.

Back the `.jks` file up somewhere private. If you lose it you can never update an
already-installed copy — only uninstall and reinstall, which wipes your logged
data unless you exported a backup first. If someone else gets it, they can build
an "update" your phone will silently accept.

**2. Point Gradle at it.** Copy `android/keystore.properties.example` to
`android/keystore.properties` and fill in the password you just chose. That file
is gitignored.

**3. Build.**

```bash
npm run android:sync
```

```bash
cd android && ./gradlew assembleRelease
```

The signed APK lands in `android/app/build/outputs/apk/release/app-release.apk`.
(Without `keystore.properties` the same command still works but produces
`app-release-unsigned.apk`, which cannot be installed — that is the tell.)

### Get it onto the phone

Over USB, with USB debugging on:

```bash
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

Or copy the APK across however you like — cable, your own cloud folder, a cable
transfer — open it in the phone's file manager, and allow "install unknown apps"
for that file manager when prompted. That prompt is Android telling you the app
did not come from the Play Store, which is exactly right here.

`-r` reinstalls over an existing copy and keeps your data — but only if the new
APK is signed with the *same* keystore. This is why step 1 is one-time.

### If you ever want it on more than one of your own devices

Same APK file, same keystore. There is nothing to publish and no account
involved. Copy the file across, install, and re-enter your API key (or import a
backup with the key included, which the app will ask you to confirm).

## Reminders

Medicine and water reminders are scheduled with the OS, so on Android they fire
whether or not the app is running.

- **Nothing is scheduled until you grant notification permission**, and the app
  only asks from a button you press — never on first launch. Revoke it in system
  settings and the app cancels every alarm it owns rather than leaving orphans.
- **The alarms are exact.** Since Android 13, `SCHEDULE_EXACT_ALARM` is no longer
  granted automatically, and an inexact alarm can be deferred by up to an hour in
  Doze — which is not what "8am dose" means. The app therefore declares
  `USE_EXACT_ALARM`, the normal (install-time, no prompt) permission intended for
  apps whose core function is alarms and reminders.
- **The medicine's name is in the notification you see, and nowhere else.** The
  data attached to the alarm carries only an id, a kind and a time, because
  notification extras live in the OS alarm store beyond the app's own storage.
- **Reminder ids are positional and bounded** — 15 medicines x 6 times, plus a
  block for water — so rescheduling can cancel the app's whole id range and can
  never strand an alarm after a rename, reorder or delete.
- **On the web there are no real alarms.** A page cannot wake itself once the tab
  is closed, so the fallback is an in-page timer that only works while the app is
  open. The UI says so rather than quietly promising more.

Reminders are a convenience, not a medical device. Do not rely on them alone for
a dose that matters.

## How the code is laid out

```
src/lib/          Pure logic, all unit-tested
  schema.js         The single validated data boundary — see below
  storage.js        Versioned persistence, migration, quota recovery, backups
  apiConfig.js      Which service to talk to; URL validation and the allowlist
  apiClient.js      Transport, per-protocol adapters, typed errors
  ai.js             Prompts and reply parsing, provider-agnostic
  localParser.js    Offline "2 cups rice" -> grams parser
  nutrition.js      Targets and totals, as pure functions
  foodDatabase.js   Offline nutrition data
  healthContext.js  Builds the data block Dr. Veggie reasons over
  reminders.js      Reminder times, dose status, and the fixed alarm id space
  notifications.js  The only place that knows how a reminder reaches the OS
  platform.js       The few things that genuinely differ on Android
  dates.js          Timezone-correct date keys and midnight rollover
src/hooks/        State ownership, debounced persistence, toasts
src/components/   UI
```

### The data boundary

Every path that produces app data — the text API, the vision API, the offline
parser, backup import, and reading from storage — goes through
`normalizeFoodEntry` / `normalizeAppState` in `src/lib/schema.js`. Those
functions whitelist keys, clamp every nutrient to a sane finite range, and are
total: any input at all, including a hostile hand-edited backup, yields a
renderable state rather than an exception on every subsequent render.

Nothing else is trusted. If you add a new source of entries, route it through
there.

### Prompt handling

User data is interpolated into prompts inside delimited blocks via `fenced()` in
`src/lib/ai.js`, which strips the marker punctuation from the payload so a food
name can't close its own block and start issuing instructions. Names are
additionally forced to a single line at the schema layer.

The model's output is never trusted either — it is parsed with a
bracket-balancing extractor and then normalized like any other input.

## Limitations worth knowing

- The API key is stored in plaintext on the device. That is inherent to a
  local-first app with no backend; on a device with a screen lock and no root it
  is as protected as the app's private storage. Keystore-backed encryption would
  be the upgrade.
- Exported backups are written to shared Documents on Android, where they persist
  until you delete them.
- Pointing the app at a third-party endpoint means that operator receives every
  food description and health question you send. The app tells you which host is
  configured, but it cannot vouch for it.
- Nutrition figures from the model are estimates, and so are the offline
  database's. Treat them as a guide.
- Dr. Veggie is not medical advice, and refers you to a professional for anything
  clinical.
