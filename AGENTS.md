# AGENTS.md

BS Coding — desktop app (Electron + React) quản lý nhiều CLI coding agent (opencode, Claude Code,
aider, ...) chạy song song trong các pane terminal trên một cửa sổ.

## Luật dự án

**Đây là nơi duy nhất chứa luật dự án.** Luật không thuộc version nào: có hiệu lực từ đầu dự án cho
tới khi chủ dự án yêu cầu thay đổi. File `AGENTS.md` trong các thư mục con chỉ mô tả thư mục đó và
**không** đặt luật — đừng đi tìm luật ở đó.

Khi một plan V2 thay thế cơ chế mà một luật đang mô tả (`Channels` → typed IPC ở plan 14,
`userData/*.json` → SQLite ở plan 3), luật được viết lại trong cùng lần thay đổi đó và cần chủ dự án
duyệt. Luật không bao giờ bị âm thầm bỏ đi vì code đã dời.

### A. Quy trình

- Quy trình: brainstorm → spec → plan → thực thi → review → merge → release. Mỗi bước là một gate,
  phải được duyệt trước khi sang bước sau.
- "Thực hiện" chỉ mở đúng gate kế tiếp. Không tự quyết định gộp bước, hoãn việc hay bỏ việc.
- Mỗi task một nhánh riêng. Không commit thẳng vào `master`.
- Đọc spec của vùng và `git log` của file trước khi sửa nó.
- Chỉ sửa đúng thứ được yêu cầu. Thứ khác mà thay đổi chạm tới cần hỏi trước.
- Điều tra đủ rồi hỏi gộp một lượt, không hỏi rải rác từng câu.
- Cập nhật `docs/CURRENT-WORK.md` khi trạng thái công việc đổi. Khi quyết định KHÔNG làm một việc vừa
  phát hiện, ghi vào `docs/DEBT.md` — không ghi thì nó thành TODO bị quên.
- Tên file lưu trữ quy trình: `YYYY-MM-DD-slug.md`, đặt trong `docs/superpowers/specs/`,
  `docs/superpowers/plans/`.

### B. Ranh giới tiến trình

- Chỉ main process được spawn/kill process. Renderer V1 truy cập mọi thứ qua `window.api`; renderer
  V2 truy cập qua `window.bs.v2`.
- Renderer **không** import `electron` hay `node:*`. V1 dùng `window.api` (kiểu `AgentApi` từ shared);
  V2 dùng API DTO typed tại `window.bs.v2`.
- Preload **không** expose `ipcRenderer` ra window; V1 chỉ expose đúng tập method trong `AgentApi`,
  V2 chỉ expose API DTO typed dưới `window.bs.v2`, và preload không import thư viện Node ngoài
  `electron`.
- `src/shared` chỉ chứa thứ JSON-serializable: không class, không function, không import
  Node/Electron. File ở đây dùng cho cả build main, preload, renderer và test → không kéo dependency
  bên ngoài. Ngoại lệ V2 duy nhất: `src/shared/v2/schemas` được import `zod` để runtime-validate
  contract tại external boundary; `contracts`/`dto` và phần shared còn lại không có ngoại lệ này.
- Service thuần (PtyManager, các store/service) không import Electron UI — để test được với Vitest.
- Toàn bộ logic agent nằm ở main process; renderer V1 chỉ thấy `ChatEvent` qua IPC, renderer V2 chỉ
  thấy DTO projection/event đã runtime-validate.
- LSP và MCP chỉ chạy ở main; renderer không nói chuyện trực tiếp với chúng. Lỗi được nuốt theo từng
  client (offline / ngôn ngữ không hỗ trợ → không có diagnostics, không crash); server MCP lỗi thì
  đánh dấu `error` trong status chứ không làm sập app.
- `App.tsx` (component cha) sở hữu việc đăng ký terminal và state toàn cục; component con giữ vai trò
  trình bày.
- Output đến trước khi xterm mount → buffer trong `buffersRef` (App), flush khi `registerTerminal`
  được gọi. Đừng xoá bỏ cơ chế này.
- Input/resize: xterm `onData`/resize → `window.api.writeInput` / `window.api.resizePty` (qua props
  trong `Pane`).
- Message queue: prompt gửi trong lúc một turn đang chạy được xếp hàng ở **main**; renderer hiển thị
  row badge `queued` và cho xoá/sửa qua `window.api.removeQueued` / `editQueued`.
- Ảnh truyền dưới dạng chuỗi dataURL trong `ImageAttachment`; chỉ nhận `image/*`.

### C. Hợp đồng IPC

- **Không hardcode** channel string ở bất kỳ đâu. V1 chỉ dùng `Channels` từ `src/shared/ipc.ts`; V2
  chỉ dùng registry namespaced trong `src/shared/v2/contracts/ipc.ts`.
- Đổi contract V1 phải cập nhật đồng bộ handler main (`src/main/index.ts`), preload
  (`src/preload/index.ts`), renderer (`window.api`) và `tests/unit/ipc-contract.test.ts`. Đổi contract
  V2 phải cập nhật registry/schema shared, router main, `window.bs.v2`, renderer type và các test
  `tests/unit/v2/*ipc*`/`preload-contract.test.ts` tương ứng.
- IPC V1 tiếp tục dùng `Channels` + `AgentApi`, `registerIpcHandlers` và preload implementation cho
  tới cutover. IPC V2 dùng command/query/subscription contract namespaced, request/response/event đều
  runtime-validate bằng Zod tại external boundary; consequential command mang `requestId`.
- Event push V1 dùng `win.webContents.send(Channels.Event*)` và payload contract V1. Projection event
  V2 dùng channel từ registry, mang monotonic `sequence` + `revision`; renderer bỏ duplicate/out-of-order
  event và refetch khi phát hiện gap.
- Preload V1 gọi `ipcRenderer.invoke(Channels.X, ...)`; V2 gọi channel registry qua API DTO typed tại
  `window.bs.v2`. Subscription của cả hai trả về hàm huỷ để renderer cleanup. Không API nào expose raw
  secret, filesystem handle, provider client, `process` hay `ipcRenderer`.
- Trạng thái agent V1 chỉ đổi qua `MainApp.setState` và renderer chỉ được notify khi field visible đổi
  (status/exitCode/alert). Trạng thái V2 đổi qua application/domain service và renderer chỉ nhận DTO
  projection/event; renderer không tự mutate state authoritative.

### D. Bẫy nền tảng

- Trên Windows (ConPTY), lệnh non-`.exe` (opencode, claude, ... chỉ là `.cmd` shim) phải được bọc qua
  `cmd.exe` — xem `buildSpawnCommand` trong `src/main/pty-manager.ts`. Đừng phá vỡ logic này.
- Tool `bash` trên Windows ưu tiên Git Bash (`gitBashPath`/`buildShellCommand`), fallback `cmd.exe`.
  Đừng phá vỡ logic này.
- Agent thoát phải được xử lý: mọi path stop đều đi qua `tree-kill` để kill cả process tree, không để
  process mồ côi. Kiểm tra lại sau khi đổi logic stop.
- Khi agent exit lỗi (code ≠ 0) và không có output: chèn hint tiếng Việt prefix `[bs]`.
- node-pty dùng prebuilds; đừng sửa code node-pty trực tiếp. Sau `npm install`, nếu thiếu binding
  native: `npx @electron/rebuild -f -w @lydell/node-pty`.
- Working tree là CRLF. `sed -i` âm thầm chuyển cả file sang LF, và `cat -A` / `awk` báo thiếu nên
  không phát hiện ra. Dùng công cụ sửa file thay vì `sed -i`.
- `npm run dev` cần port 1305 trống trước khi chạy.
- Không cắt ngắn log dev khi đọc.

### E. Kiểm thử

- **Không bao giờ** gọi API LLM thật trong test — dùng stub `LlmClient` (`makeManager` trong
  `bs-agent-manager.test.ts`, hoặc `createLlm` giả như trong `tests/unit/agent-loop.test.ts`) hoặc
  `partsQueue` để script output.
- Unit và integration **không** phụ thuộc agent thật (opencode/claude/aider); dùng fixture
  (`tests/fixtures/echo-agent.js`, `mock-lsp-server.js`) hoặc lệnh `node` + fixture.
- Giữ test hermetic: temp dir qua `mkdtempSync(tmpdir())` + cleanup trong `afterEach`/`finally`.
- Integration spawn PTY thật phải stop/cleanup trong `afterEach`/`finally` để không để lại process
  mồ côi.
- Một file test cho một module: `tests/unit/<name>.test.ts`.
- `tests/unit/ipc-contract.test.ts` canh contract: mọi method `AgentApi` phải tồn tại, mọi channel
  string được assert. **Cập nhật nó mỗi khi contract IPC đổi.**
- Ưu tiên test hành vi quan sát được (event phát ra, nội dung store) hơn là nội bộ.
- Alias `@shared` đã cấu hình trong `vitest.config.ts`; import code main bằng đường dẫn tương đối.
- E2E **cần** `npm run build` trước, vì nó chạy app đã build trong `out/`. Config Playwright ở
  `playwright.config.ts`, workers = 1.
- Mỗi test e2e dùng temp userData + temp project riêng; ghi `workspaces.json` trực tiếp. Dùng locator
  auto-wait (`toHaveText`/`toContainText`) cho UI bất đồng bộ.
- Sau khi đụng IPC hoặc UI, thêm hoặc mở rộng một assertion trong e2e smoke để bắt regression.
- Renderer chưa có unit test; đảm bảo `npm run typecheck` pass và e2e smoke không vỡ.
- **Trước khi hoàn thành:** `npm run typecheck` pass, `npm test` pass, và
  `npm run build && npm run e2e` nếu thay đổi chạm tới e2e.

### F. Thêm thứ mới

- Thêm tool: implement trong `src/main/agent/tools/`, đăng ký trong
  `src/main/agent/tools/registry.ts`, thêm permission mặc định vào
  `DEFAULT_BS_CONFIG.permission` trong `src/main/agent/config.ts`. Mỗi tool là object thuần khớp
  `ToolDefinition`; `schema` là kiểu zod có `.parse()`.
- Thêm setting: kiểu `BsSettings` trong `src/shared/types.ts` + normalize trong
  `src/main/agent/config.ts` + tab tương ứng trong settings dialog. Sửa đi qua `patch()` trên bản
  draft — không ghi gì tới khi bấm Save; `saveSettings` trả về settings đã normalize.
- MCP: config server lấy từ field `mcp` của `bs.json`; tool được gộp vào map tool của agent trong
  `BsAgentManager.syncTools()`; status lộ ra qua IPC `getMcpStatus`.
- LSP: tắt khi `lsp.enabled` là false trong config; `LspManager` là optional trong
  `BsAgentManagerDeps`.
- Transcript item của session là nguồn sự thật duy nhất về những gì LLM nhìn thấy — `message.ts` dựng
  lại prompt từ chúng.

### G. Hiệu năng renderer

Rút ra từ một buổi debug lag ô chat input thật (đo bằng Chromium trace qua CDP, không suy đoán):

- **Hạn chế animation không cần thiết**, nhất là trên phần tử cập nhật thường xuyên (scroll theo mỗi
  token stream, transition trên input đang gõ). Animation chạy trên UI thread; cộng dồn với re-render
  dày đặc (streaming, gõ phím liên tục) sẽ gây giật rõ rệt. Với các cập nhật lặp lại nhanh, dùng scroll
  tức thời (`scrollIntoView()` không `behavior: 'smooth'`); chỉ dùng smooth scroll cho hành động rời
  rạc, một lần (VD: có message mới xuất hiện hẳn, không phải mỗi delta).
- **List dài (chat feed, tool-call list) bắt buộc có `content-visibility: auto` trên từng row**
  (`.chat-msg`, `.tool-call`) + `contain-intrinsic-size` ước lượng. Đã đo thực tế: project có lịch sử
  ~250 item / ~3000 DOM node khiến MỖI keystroke trong ô chat kích hoạt một lần layout toàn trang
  (~39ms) — trình duyệt cần layout đồng bộ để định vị con trỏ nhập liệu (`TypingCommand::InsertText`),
  và layout đó lan ra toàn bộ DOM kể cả phần đã cuộn khỏi màn hình từ lâu nếu không được đánh dấu
  content-visibility. Thêm thuộc tính này giảm ~6-7 lần chi phí (39ms → 5.7ms/keystroke).
- **Input text field chính (chat input) dùng uncontrolled (ref) thay vì controlled
  (`value` + `onChange` + `setState`)**. `setState` mỗi keystroke ép React re-render dù nội dung không
  ảnh hưởng UI khác. Đọc `e.target.value` trực tiếp qua ref; chỉ `setState` khi có state phái sinh THỰC
  SỰ đổi (VD: mở/đóng menu lệnh "/"), và bail-out bằng cách trả về cùng object reference khi giá trị
  không đổi để React tự bỏ qua re-render.
- **Đừng tối ưu khi chưa đo.** `requestAnimationFrame`/`cancelAnimationFrame` KHÔNG miễn phí — từng thử
  dùng rAF để "tách" một phép check rẻ (so sánh string) ra khỏi input handler, kết quả CHẬM HƠN bản
  đồng bộ cũ vì rAF là lời gọi API trình duyệt thật, không phải no-op. Trước khi thêm bất kỳ tối ưu perf
  nào: đo bằng công cụ thật (CPU profile / Chromium trace qua CDP `Profiler`/`Tracing`, hoặc Event
  Timing API `processingStart`/`processingEnd`) — không suy đoán từ pattern quen thuộc rồi coi là xong.
- **Callback truyền xuống component đã `memo()`** (VD: `ChatPanel`, `FeedMessage`, `ToolCallCard`,
  `CommandMenuItem`) phải ổn định qua `useCallback` với dependency đúng — nếu không, mọi re-render của
  component cha (kể cả do state không liên quan, VD polling git status mỗi 5s) sẽ ép re-render lan
  xuống toàn bộ cây con. Row/item component nên nhận props dạng primitive, tránh nhận nguyên object cha
  đổi reference mỗi render, nếu không `memo()` mất tác dụng.
- Cập nhật feed được gom theo animation frame (`flushDeltas`) để tránh lag input — giữ hot path của
  streaming rẻ.
- `FeedMessage`/`ToolCallCard` được `memo()`; cập nhật theo kiểu copy-on-write, **không** mutate item
  tại chỗ, nếu không `memo()` mất tác dụng.

### H. Ngôn ngữ và style

- Mã nguồn và UI label tiếng Anh; thông báo system-style từ main dùng tiếng Việt, prefix `[bs]`.
- Không thêm comment thừa; chỉ comment khi giải thích quyết định phức tạp (VD: Windows shim,
  tree-kill).
- Component dạng functional + hooks; khai báo interface `Props` trong cùng file.
- Dùng số liệu tabular-nums khi hiển thị.
- Grid + zoom: click pane để zoom full-window, `Esc` thoát (xử lý trong `PaneGrid`).

### I. Bảo mật

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: false`. Không expose `ipcRenderer` ra
  window.
- Secret nằm trong vault main process (`safeStorage`); không lộ ra renderer, log hay fixture của test.
- Browser bridge: chỉ bind `127.0.0.1` (không expose mạng), pairing code bắt buộc trước khi nhận lệnh;
  chạy trên profile Chrome **thật** của user — không tách profile riêng theo project.

### J. Release

- Viết `docs/release-notes/<tag>.md` rồi push tag, để CI publish. **Không** chạy `gh release create`
  bằng tay.
- Format changelog: `docs/v1/changelog-format.md`.

### K. Cách làm việc

- Không spawn subagent; làm inline.
- Dùng superpowers skills cho phần việc chúng bao phủ.

## Công nghệ

- Electron 41 + electron-vite 5 + React 19 + TypeScript (strict).
- PTY: `@lydell/node-pty`; terminal UI: `@xterm/xterm` + `@xterm/addon-fit`.
- Test: Vitest (unit + integration), Playwright (e2e).

## Cấu trúc

3 tiến trình tách biệt, giao tiếp qua IPC contract tập trung:

- `src/main` — main process: PTY, stores, services, IPC handlers, vòng đời app.
- `src/preload` — contextBridge, expose `window.api` (implement `AgentApi`).
- `src/renderer` — React UI: sidebar, pane grid, xterm + native-agent chat.
- `src/shared` — types + IPC contract chung.
- `src/browser-extension` — Chrome MV3 extension (build riêng bằng esbuild → `out/browser-extension`,
  copy sang `userData/browser-extension/` để Load unpacked trên profile Chrome thật).
- `src/main/browser` — BrowserBridge (WS server local + pairing code) + Chrome launcher/hướng dẫn cài.

Alias `@shared` → `src/shared` (đã cấu hình trong electron.vite.config.ts, vitest.config.ts, tsconfig).

Dữ liệu bền: `userData/templates.json`, `userData/workspaces.json`; log mỗi agent trong
`userData/logs/<agentId>.log`.

## Lệnh

- `npm run dev` — chạy dev (electron-vite; pre-hook tự build extension).
- `npm run build` / `npm run start` — build / preview (pre-hook tự build extension).
- `npm test` — unit + integration (Vitest).
- `npm run typecheck` — tsc node + web + extension.
- `npm run build:extension` — build Chrome extension (esbuild → `out/browser-extension`).
- `npm run e2e` — Playwright smoke (cần `npm run build` trước).
- `npm run dist` / `dist:dir` / `dist:linux` / `dist:mac` — đóng gói qua electron-builder.
- `npm run regen:models` — regenerate `src/main/models-snapshot.json`.

## Docs

- `docs/CURRENT-WORK.md` — **đọc trước mọi việc.** Việc đang làm, việc sắp làm, việc đang bị chặn. Đây
  là thẩm quyền về "việc gì đang mở". Được giao việc mà file này không mô tả thì cập nhật nó trước khi
  bắt đầu.
- `docs/DEBT.md` — nợ dự án: thứ đã cố tình không làm, vì sao, và cần gì để đóng. Không thuộc version
  nào.
- `docs/superpowers/` — kho quy trình: `specs/`, `plans/`, `brainstorms/`, `notes/`, `audits/`. Mỗi
  file là ảnh chụp một quyết định tại một thời điểm.
- `docs/v2/` — **căn cứ cho V2.** Bắt đầu từ `docs/v2/START_HERE.md`, rồi
  `docs/v2/architecture/README.md`, rồi `docs/v2/implementation-plans/00-MASTER-PLAN.md`.
  Đặt nguyên khối, không sửa nội dung: liên kết nội bộ, `depends_on` và `MANIFEST.txt`
  đều là đường dẫn tương đối trong đó.
- `docs/v1/` — **hồ sơ lịch sử của V1.** Thiết kế, spec, plan, nợ kỹ thuật và changelog của
  V1.3.2 trở về trước. Tham chiếu, không phải việc phải làm: V2 không kế thừa nợ của V1.
- `docs/release-notes/` — ở nguyên ngoài `v1/`: job publish đọc `docs/release-notes/<tag>.md`
  theo đúng tên tag.
- Code V1 ở nguyên `src/`. Theo `docs/v2/implementation-plans/plans/01-foundation-module-boundaries.md`,
  V2 dựng **bên cạnh** tại `src/main/v2`, `src/shared/v2`, `src/renderer/src/v2`, và cutover nằm ở
  plan 18 và 20.
