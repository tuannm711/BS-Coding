# Changelog — BS Coding v1.1.1 → v1.1.2

## 📱 Mobile Remote Control — Coming Soon
- Continues development of secure pairing and synchronized remote control for BS Coding sessions.
- Stay tuned — mobile control remains under active development. 🚧

## 🐛 Bug Fixes
- Providers: Antigravity accounts now refresh their OAuth token when Cloud Code rejects a quota request, instead of going unavailable until a manual reconnect.
- Providers: Antigravity quota percentages no longer follow hidden helper models, so the account total matches the Gemini and Claude group cards.
- Windows: the taskbar button now shows the BS Coding icon, and pins to the same entry as the installed shortcut.

## 🧹 Internal & Docs
- Adds regression coverage for Antigravity credential refresh, grouped quota accuracy, and Windows window-icon resolution.
