# BS Coding — Tạm ngừng tính năng trace (config flag, mặc định tắt): Design Spec

Ngày: 2026-08-17 · Trạng thái: chờ duyệt

## 1. Mục tiêu

Trace hiện vẫn gây lag dù đã chuyển sang async. Tạm thời:

1. **Ẩn UI** tab Trace trong pane (native agent).
2. **Ngừng mọi luồng xử lý trace** ở main (không ghi trace mới).
3. **Xóa dữ liệu trace cũ** (`userData/traces`).
4. Có cơ chế **bật lại** mà không cần sửa code: config flag `trace.enabled` (mặc định `false`).

## 2. Quyết định thiết kế

| Chủ đề | Quyết định |
|---|---|
| Config | Thêm `trace?: { enabled: boolean }` vào `BsConfig` + `BsSettings`; `DEFAULT_TRACE = { enabled: false }` |
| Gate main | Manager cache flag khi load config; `setOnEvent` bỏ `writeTrace(e)` khi tắt; `index.ts` không append `pty-run` trace khi tắt |
| Dọn dữ liệu | Khi app khởi động với `trace.enabled !== true` → xóa sạch thư mục `userData/traces` |
| Ẩn UI | `Pane.tsx` đọc `getSettings()` 1 lần khi mount; tắt thì không render tab Trace, luôn ChatPanel |
| Giữ nguyên | IPC `trace:*` + channel `EventTrace` + `TraceStore` + component trace — chỉ gate, không xóa; bật lại có ngay |
| Flush khi quit | Giữ `flushAll()` (vô hại, buffer rỗng khi tắt) |

## 3. Thay đổi chi tiết

### 3.1 `src/shared/types.ts`
- `BsSettings` thêm `trace?: { enabled: boolean }`.

### 3.2 `src/main/agent/config.ts`
- `BsConfig` thêm `trace?: TraceConfig` (`{ enabled: boolean }`).
- `DEFAULT_TRACE = { enabled: false }`; `DEFAULT_BS_CONFIG.trace = DEFAULT_TRACE`.
- `mergeDefaults` / `configToSettings` / `settingsToConfig` normalize `trace`.

### 3.3 `src/main/bs-agent-manager.ts`
- Cache `private traceEnabled = false`; khởi tạo từ `loadBsConfig(...)`.
- `setOnEvent`: `if (this.traceEnabled) this.writeTrace(e)`.
- `reload()` / `saveSettings()`: refresh `traceEnabled` từ config.
- Thêm getter `isTraceEnabled()` để `index.ts` dùng.

### 3.4 `src/main/index.ts`
- Khởi động: nếu `!bsAgent.isTraceEnabled()` → `rmSync(userData/traces, { recursive: true, force: true })` (xóa dữ liệu cũ).
- Hai chỗ `this.traces.append(pty-run)`: chỉ append khi `bsAgent.isTraceEnabled()`.

### 3.5 `src/renderer/src/components/Pane.tsx`
- `useState(false)` + `useEffect` gọi `window.api.getSettings()` 1 lần → `setTraceEnabled(s.trace?.enabled ?? false)`.
- `native && traceEnabled` mới render tab Trace; còn lại ChatPanel.

## 4. Ảnh hưởng
- Người dùng: mất tab Trace + trace cũ bị xóa (đúng yêu cầu). Bật lại bằng sửa `bs.json`.
- Không phá IPC contract / typecheck (field optional).

## 5. Kiểm thử
- Unit: config normalize `trace` (default false, giữ true khi set); manager `writeTrace` bị gate khi tắt (dùng fake trace đếm appends).
- `npm run typecheck`, `npm test`; e2e nếu ảnh hưởng.
