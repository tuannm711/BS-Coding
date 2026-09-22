# Provider subscription login: mượn danh tính client thật — design

Date: 2026-09-22
Branch: `claude/bs-coding-v1-3-3-release-d5127b` (nhánh release V1 1.3.3)
Baseline: `develop/v1` (`2f16deb`) + 7 commit provider-auth của gemini (HEAD `b09c1ac`)

Quyết định của chủ dự án:
- Login OpenAI/ChatGPT **tự chứa trong app** (không uỷ quyền cho CLI ngoài định tuyến chat).
- Khi vận hành **giữ toàn bộ tool + vòng lặp agent của BS Coding** (BS Coding vẫn là BS Coding, không thành wrapper).
- Danh tính giao tiếp backend **lấy động từ client thật đã cài** (Codex CLI / Antigravity), không hardcode chuỗi giả.
- Không có client đã cài → **chặn** login thuê bao provider đó (fallback (a)). API key luôn khả dụng.
- Đã hiểu rõ và chấp nhận: đây vẫn là vùng xám ToS (mạo danh ở mức giao thức), rủi ro **giảm** chứ không bằng 0.

## 0. Vì sao có thiết kế này

gemini đã thay login OpenAI bằng **Codex App Server** (spawn CLI `codex` như tiến trình con, chat đi qua agent của codex). Hệ quả không mong muốn:
- Bắt buộc cài `codex` CLI và **định tuyến chat qua codex** → BS Coding mất quyền điều khiển tool/agent (`supportsTools: false` cho *toàn bộ* model OpenAI, kể cả API key).
- Mất bản sắc: BS Coding trở thành lớp mỏng bọc codex.

Ngã ba đã cân nhắc (đa tài khoản: cả bốn đều giữ được):

| Hướng | Tool | Không cần CLI | ToS sạch | Dùng thuê bao |
|---|:--:|:--:|:--:|:--:|
| 1. OAuth tự chứa, giả cứng | ✅ | ✅ | ⚠️ xám | ✅ |
| 2. Codex app-server (gemini) | ❌ | ❌ | ✅ | ✅ |
| 3. Chỉ API key | ✅ | ✅ | ✅ | ❌ |
| **4. Mượn danh tính client thật (chọn)** | ✅ | ⚠️ cần cài để bật | ⚠️ xám (giảm) | ✅ |

Hướng 4 = Hướng 1 làm có trách nhiệm hơn: danh tính không mục nát (khớp version client thật), chỉ mượn danh tính client người dùng thực sự đã cài, và có thể gate theo sự hiện diện của client.

## 1. Module `client-identity` (mới)

Vị trí: `src/main/providers/identity/client-identity.ts`.

Nhiệm vụ: phát hiện client đã cài và cung cấp danh tính động cho tầng runtime + gate UI.

```ts
export interface BorrowedIdentity {
  installed: boolean
  version?: string          // vd '0.155.0' đọc từ `codex --version`
  userAgent?: string        // vd 'codex_cli/0.155.0' — dựng từ version thật
  originator?: string       // vd 'codex_cli'
}

export function detectCodexIdentity(): Promise<BorrowedIdentity>
export function detectAntigravityIdentity(): Promise<BorrowedIdentity>
```

- Phát hiện: dò trên PATH + vị trí cài đặt đã biết; chạy `<bin> --version` (timeout ngắn, không tương tác) và parse.
- Cache kết quả trong phiên (tránh spawn lặp), có API làm mới khi người dùng bấm kết nối.
- **Không** giữ tiến trình con chạy nền; chỉ đọc version rồi thoát.
- Không cài → trả `{ installed: false }`. Tầng trên dựa vào đây để gate.

Ranh giới: module này chỉ trả dữ liệu danh tính; không gọi backend, không giữ OAuth.

## 2. OpenAI adapter — khôi phục self-contained + tiêm danh tính

File: `src/main/providers/adapters/openai.ts`.

- **Auth**: khôi phục luồng OAuth callback/PKCE tự chứa của 1.3.2 (khôi phục từ `develop/v1:src/main/providers/adapters/openai.ts`). **Bỏ** chiến lược `managed` + `CodexAppServerClient` cho login.
- **Gate method** (fallback a): method `oauth` ("Sign in with ChatGPT") chỉ được liệt kê/bật khi `detectCodexIdentity().installed === true`; ngược lại ẩn/khoá kèm ghi chú "Cần cài Codex CLI". Method `api-key` luôn có.
- **Bỏ** method `chatgpt-device-code` (vốn chỉ tồn tại nhờ app-server; YAGNI).
- **Runtime chat**: dùng `createLlm(...)` gọi thẳng `https://chatgpt.com/backend-api/codex` như 1.3.2, nhưng header danh tính (`user-agent`, `originator`, các header phiên bản) **lấy từ `BorrowedIdentity`** thay vì hằng số giả cứng. Agent + tool của BS Coding điều khiển → `supportsTools: true`.
- **Model catalog**: sửa `supportsTools: false` → `true`. Tài khoản `oauth` dùng `OPENAI_OAUTH_MODELS`; tài khoản `api-key` dùng danh sách model OpenAI thật (đều `supportsTools: true`).

## 3. Antigravity adapter — đối xứng

File: `src/main/providers/adapters/antigravity.ts` (gemini đã gỡ ~228 dòng).

- Khôi phục login + runtime tự chứa từ `develop/v1`, áp cùng cơ chế: danh tính lấy từ `detectAntigravityIdentity()`.
- Gate method thuê bao theo sự hiện diện của Antigravity; không cài → chặn.

## 4. Giữ lại của gemini (không phụ thuộc hướng login)

- Provider **Google Gemini native** (`src/main/providers/adapters/google.ts`) — chỉ `gemini-api-key`, bỏ vertex-ai.
- Cải tiến **`AuthSessionCoordinator`** (`src/main/providers/auth/session.ts`): vòng đời timer + clearTimeout, dọn field nhạy cảm khỏi DTO.
- Phòng thủ traversal + chứa thư mục khi xoá account.

Kiểm tra tương thích: các cải tiến này phải hoạt động với chiến lược `callback`; nếu chúng bị buộc chặt vào `managed`, tách phần dùng chung ra.

## 5. Gỡ bỏ

- `src/main/agent/codex-app-server-llm.ts` (định tuyến chat qua codex).
- Wiring `managed` cho openai trong `src/main/connections/manager.ts`; nếu sau khi gỡ, `ProviderManagedAuthorizationStrategy` không còn ai dùng thì gỡ luôn khỏi `types.ts`/`registry.ts` cho gọn.
- Setting `codexPath` dùng để spawn app-server (`src/shared/types.ts`, `src/main/agent/config.ts`, UI ProvidersTab/SettingsDialog) — trừ khi tái dùng cho việc **dò đường dẫn Codex** ở module identity; nếu tái dùng thì đổi ngữ nghĩa cho đúng.
- `src/main/connections/codex-app-server.ts`: giữ hay bỏ tuỳ có còn được dùng cho việc dò version không; mặc định **bỏ** vì dò version chỉ cần `<bin> --version`.

## 6. Xử lý lỗi

- Client biến mất giữa chừng (đã liệt kê method nhưng lúc kết nối lại không dò được) → báo rõ, chặn, không tạo account.
- OAuth lỗi/hết hạn/refresh → giữ hành vi refresh token của 1.3.2.
- Backend đổi shape → thông điệp lỗi rõ ràng, không nuốt lỗi.
- Không rò rỉ token/PII ra log.

## 7. Kiểm thử

- **`client-identity`**: có/không cài; parse version đúng/định dạng lạ; cache; timeout khi `--version` treo.
- **Gate**: method `oauth` ẩn khi chưa cài, hiện khi đã cài; `api-key` luôn hiện.
- **OpenAI adapter**: oauth + api-key đều `supportsTools: true`; header danh tính runtime khớp `BorrowedIdentity` (không còn chuỗi giả cứng); đa tài khoản cô lập giữ nguyên.
- **Antigravity adapter**: tương tự.
- **Giữ** các test hợp lệ của gemini (google, session coordinator, containment); **bỏ/điều chỉnh** test gắn với app-server (`codex-app-server.test.ts`, phần device-code, `isolated-smoke`).
- Toàn bộ `npm run typecheck` + `npm test` xanh trước khi xem là xong.

## 8. Ngoài phạm vi design này (đưa vào implementation plan của 1.3.3)

Ba luồng việc còn lại của bản 1.3.3, không cần design riêng:
1. **Vá 20 Dependabot alerts** (7 nhóm: xmldom, fast-uri, hono, js-yaml, qs, vitest) bằng `overrides` + verify build/test. Tất cả fixable không cần `--force`.
2. **Dọn dẹp release**: dời 3 report `V1_PROVIDER_AUTH_*.md` từ root vào `docs/`; bump `1.3.2 → 1.3.3`; viết `docs/release-notes/v1.3.3.md`.
3. **Review chất lượng** phần diff còn giữ lại theo skill code-review.
4. **Dọn worktree của gemini**: sau khi hoàn tất & merge, gỡ worktree `C:\Users\brads\Documents\BS-Coding-v1-provider-auth` (gemini tạo cho nhánh `fix/v1-provider-auth`) bằng `git worktree remove`, và xoá nhánh `fix/v1-provider-auth` nếu không còn cần. Làm ở bước cuối cùng.

## 9. Rủi ro & giới hạn còn lại

- **ToS**: vẫn mạo danh ở mức giao thức; rủi ro giảm (danh tính thật, gated) nhưng không bằng 0 và không được OpenAI chính thức chấp thuận.
- **Bảo trì**: tích hợp backend trực tiếp có thể vỡ khi backend đổi.
- **Phụ thuộc để bật**: cần client thật cài để mở login thuê bao (theo đúng quyết định fallback (a)).
