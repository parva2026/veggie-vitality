# Veggie Vitality

Veggie Vitality is a local-first vegetarian nutrition tracker. You can log meals, track nutrition targets, and ask an AI assistant about your own health logs.

> **Status: not actively maintained.**
> This is a personal project shared publicly. It may still be useful to read or fork, but support and updates are not guaranteed.

## What it does

- Log food in plain English
- Capture food from a photo (Android)
- Track daily nutrition targets, water, and weight
- Manage medicine schedules and reminders
- Ask **Dr. Veggie** questions using your own logged data as context
- Work offline for all non-AI features

## AI functionality

Veggie Vitality uses AI for:

1. Understanding free-text food logs when offline parsing is not enough
2. Helping estimate nutrition values for described meals
3. Powering **Dr. Veggie**, a nutrition assistant for your tracked data

Default provider is Google Gemini, but you can switch to an OpenAI-compatible endpoint in Settings.

Important notes:

- AI features require your API key
- Requests are sent only to the configured AI endpoint
- Dr. Veggie is informational and **not medical advice**

## Your data and privacy

- No backend, no account, no analytics
- Data is stored on your device (`localStorage` on web, Preferences on Android)
- Medicine list is not included in Dr. Veggie context
- Backups are JSON files you export/import manually
- API key is stored on-device and excluded from backup by default

## Getting started

```bash
npm install
npm run dev
```

### Common scripts

- `npm run build` — production build
- `npm test` — run tests
- `npm run lint` — lint code
- `npm run android:sync` — build + sync web assets to Android
- `npm run android:build` — build and assemble release APK

## Android build notes

Requires:

- Node.js 20+
- JDK 21
- Android SDK (platform 36)

Release APK output:

`android/app/build/outputs/apk/release/app-release.apk`

## Project structure

```text
src/lib/          Core logic (unit-tested)
src/hooks/        State and persistence hooks
src/components/   UI
```

## Limitations

- AI and nutrition values are estimates
- API key is stored locally in app storage
- Exported backups are plain JSON and should be handled carefully

## Contributing

This repo is effectively in maintenance mode. Forking is the recommended path.

## License

No license file is included, so default copyright applies.
