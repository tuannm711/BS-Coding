# Changelog — BS Coding v1.3.0 → v1.3.1

## 📱 Mobile Remote Control — Coming Soon
- Continues development of secure pairing and synchronized remote control for BS Coding sessions.
- Stay tuned — mobile control remains under active development. 🚧

## 🐛 Fixes

### Agents wrote out tool calls instead of making them

- **Cause.** Every conversation in the app goes through the shared-session path, and that path replayed each earlier tool call to the model as a line of prose — `- read · completed`, then `input:`, then `output:`. The model was shown a conversation in which using a tool looks like writing about one, so it wrote about one. Nothing ran.
- **Fix.** Prior turns are now replayed as real tool calls, with fresh call ids and no provider-specific metadata, exactly as a single agent's own history has always been sent. Both paths produce one conversation format.
- **Contagion.** A written-out call is stored as an ordinary reply, so every later turn saw tool-shaped text in the assistant's own voice — and copied it, including after switching to a different agent. There is no longer anything to copy.
- The record header and the system-prompt note that explained the record format are gone with it; there is no format left to explain.
- The detector behind the *"The model wrote out a tool call instead of making one"* notice now matches the shape models actually produce — the body of the record, without its header — as well as the two older shapes. It is a safety net rather than the fix.
- A tool call with no assistant message ahead of it is now given one, so its result never answers a call that was never made.

### Recorded

- The 2026-08-25 design that introduced the prose records is annotated with the two claims that turned out false: that flattening tool calls was necessary, and that single-agent chat was unaffected. Neither survived measurement.
