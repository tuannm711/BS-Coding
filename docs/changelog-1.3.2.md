# Changelog — BS Coding v1.3.1 → v1.3.2

## 📱 Mobile Remote Control — Coming Soon
- Continues development of secure pairing and synchronized remote control for BS Coding sessions.
- Stay tuned — mobile control remains under active development. 🚧

## 🐛 Fixes

### The chat stopped following a streaming answer after one scroll down

- **Symptom.** During a reply, one downward wheel movement froze the transcript. Nothing moved it again except the **Scroll to end** button.
- **Cause.** Wheel movement was treated as taking manual control unless the feed was within 1px of the very bottom. A streaming turn keeps a spacer below the content — it is what lets the turn you just sent stay near the top while the answer grows into the space — so the feed is never within 1px of the bottom while it streams. Every downward scroll therefore counted as taking over, and taking over stops all automatic scrolling for the rest of the turn.
- **Fix.** Downward movement no longer takes control. Scrolling up does, which is what the design always meant by scrolling away from the follow zone.
- The rule came from an earlier fix that tightened an 80px tolerance to 1px in order to release the scroll during subagent output. That release comes from scrolling up and is unchanged.
- Recorded: the test covering this stated the frozen behaviour as the intended rule, which is why the suite stayed green over it.
