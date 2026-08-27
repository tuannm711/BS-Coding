# Changelog — BS Coding v1.1.3 → v1.1.4

## 📱 Mobile Remote Control — Coming Soon
- Continues development of secure pairing and synchronized remote control for BS Coding sessions.
- Stay tuned — mobile control remains under active development. 🚧

## 🐛 Bug Fixes
- Windows: the notification area now shows the BS Coding logo instead of the previous branding.
- Providers: an account whose Claude or GPT quota is spent no longer reports itself exhausted while its Gemini quota is untouched, on both the Providers tab and the chat panel.
- Providers: ChatGPT accounts now show their subscription term, read from the sign-in token rather than a request that the Codex credential is refused.

## 🚀 Improvements
- Quota windows now name the exact reset instant beside the countdown, as `4d 20h · 19:09:02 30/08/2026`.
- Subscription terms read as `Term 24d · 12:47:59 18/09/2026`.
- The chat quota panel now shows the request count for the current reset window alongside tokens and estimated cost.

## 🧹 Internal & Docs
- Narrows the provider usage status to the two values any consumer distinguishes, removing two values that were written but never read.
- Regenerates the tray icon from the icon sources during the build, with a test that fails if the two ever drift apart.
- Adds `docs/technical-debt.md` recording deferred work, why it was deferred, and what closing it involves.
