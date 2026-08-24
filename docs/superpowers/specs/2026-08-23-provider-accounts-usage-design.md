# BS Coding — Provider Accounts, OAuth, Responses Compaction & Live Usage

Ngày: 2026-08-23  
Trạng thái: Đã duyệt thiết kế

## 1. Mục tiêu

Mở rộng cơ chế provider hiện tại để:

- mọi kết nối (API key và ChatGPT/Codex OAuth) nằm trong cùng Providers UI;
- hỗ trợ nhiều account cho mỗi provider, bật/tắt linh động và refresh credential;
- cho phép mỗi agent chọn provider, account và model riêng;
- giảm token lặp lại cho OpenAI API bằng Responses API và auto-compaction;
- giám sát quota/usage ở Providers UI và trực tiếp trong màn hình chat theo từng agent.

## 2. Nguyên tắc và giới hạn

Provider là khái niệm kết nối; account là credential cụ thể của provider. Không dùng OAuth token
của ChatGPT/Codex như API key của OpenAI API nếu endpoint/credential không hỗ trợ điều đó.

- OpenAI API account dùng API key và Responses API.
- ChatGPT/Codex OAuth account dùng luồng OAuth tương thích Codex, refresh token và credential
  injection cho Codex-compatible execution path.
- Provider không công khai quota API phải hiển thị `Unavailable`; BS vẫn đếm usage nội bộ từ
  response đã nhận và phải gắn nhãn đây là số liệu nội bộ.
- Chỉ main process truy cập secret; renderer chỉ nhận metadata, số liệu đã chuẩn hóa và key mask.

## 3. Mô hình dữ liệu

Mở rộng provider settings thành provider + account metadata. Secret (API key, access token,
refresh token) lưu trong vault mã hóa của OS; file settings chỉ giữ `keyRef`/`accountId`.

```ts
type AccountStatus = 'active' | 'disabled' | 'expired' | 'error'
type AuthMode = 'api-key' | 'oauth' | 'imported'

interface ProviderAccount {
  id: string
  providerId: string
  label: string
  authMode: AuthMode
  status: AccountStatus
  profile?: { email?: string; name?: string; planName?: string }
  createdAt: number
  lastUsedAt: number
  oauthExpiresAt?: number
  keyRef?: string
  quota?: ProviderUsage
}

interface ProviderUsage {
  accountId: string
  periodStart?: number
  periodEnd?: number
  resetAt?: number
  requestsUsed?: number
  requestLimit?: number
  tokensUsed?: number
  tokenLimit?: number
  bankedUsed?: number
  bankedLimit?: number
  subscriptionExpiresAt?: number
  refreshedAt: number
  status: 'ok' | 'near-limit' | 'expired' | 'unavailable'
}
```

Usage được phân biệt thành số liệu provider trả về và bộ đếm nội bộ BS Coding. Account active là
account được phép chọn bởi chế độ `Auto`; account disabled không được dùng nhưng credential vẫn
được giữ để bật lại.

## 4. Providers UI

Providers tab tiếp tục là điểm vào duy nhất cho mọi kết nối. Mỗi provider hiển thị danh sách
account con, trạng thái, model, usage, reset time và plan expiry.

`Connect provider` hỗ trợ hai nhánh:

1. API key — lưu vào vault, đồng bộ model catalog.
2. Sign in with ChatGPT/Codex — OAuth PKCE, callback localhost cổng 1455, refresh token và
   profile metadata.

Account actions: enable/disable, refresh, switch active, logout/remove, test connection. OAuth
account được hiển thị rõ là account ChatGPT/Codex, không hiển thị như API key.

## 5. OAuth và nhiều account

OAuth adapter chạy ở main process:

- sinh PKCE verifier/challenge và state có TTL;
- mở authorization URL bằng browser hệ thống;
- nhận callback `127.0.0.1:1455/callback`;
- đổi code lấy access/refresh token;
- refresh trước khi hết hạn;
- lưu account độc lập trong vault;
- khi cần Codex CLI, merge token vào `~/.codex/auth.json` bằng atomic write và backup file cũ.

Mỗi account có lifecycle riêng. Disable không xóa credential; logout/remove xóa secret và metadata
theo chính sách an toàn. Việc chọn account không được làm rò token sang renderer.

## 6. Agent assignment

Agent settings mở rộng lựa chọn thành:

```text
provider / account / model
```

Account có thể là account cụ thể hoặc `Auto`. `Auto` chỉ chọn account active, ưu tiên account còn
quota và credential hợp lệ. Agent có thể có fallback account/provider khi account chính hết quota,
expired hoặc gặp lỗi xác thực. Đổi assignment khi agent đang chạy chỉ có hiệu lực ở turn kế tiếp;
không đổi credential giữa một request đang stream.

## 7. OpenAI Responses API và compaction

OpenAI API provider được triển khai bằng client Responses riêng, không ảnh hưởng provider khác.

- Session giữ response state theo từng account.
- Request dùng response continuation khi khả dụng, kèm tool definitions tương ứng.
- Bật context management/compact threshold theo giới hạn model.
- Trước khi vượt ngưỡng, gọi `/responses/compact` và lưu compaction item opaque.
- Nếu Responses/compact không khả dụng, fallback về compaction nội bộ hiện có.
- Khi đổi account, response state của account cũ không được tái sử dụng.
- Usage map từ `input_tokens`, `cached_tokens`, `output_tokens`, `reasoning_tokens` vào
  `MessageTokens` và bộ đếm session.

Compaction phải được phát event để UI hiển thị trạng thái `compacting`, sau đó reload context summary
đúng session. Không compact trong lúc đang stream một request.

## 8. Usage adapters và giám sát quota

Mỗi provider có adapter chuẩn hóa:

- `OpenAICodexUsageAdapter`
- `OpenAIApiUsageAdapter`
- `AnthropicUsageAdapter`
- `GenericProviderUsageAdapter`

Scheduler refresh khi mở Providers tab, sau login/switch và theo chu kỳ. Adapter lỗi không làm agent
crash; lưu `quotaError`/`unavailable` và retry ở lần refresh sau. Cảnh báo gần ngưỡng dùng notification
`[bs]` với cooldown.

## 9. Live monitor trong màn hình chat

Mỗi agent đang có trong project có một monitor card, liên kết theo `agentId` và `accountId`. Card
hiển thị realtime:

- trạng thái agent: idle/running/waiting/compacting/error/stopped;
- provider, account, model;
- input/output/cached/reasoning tokens của turn và tổng session;
- context hiện tại, limit và ngưỡng auto-compact;
- quota requests/tokens, banked remaining, reset countdown, plan expiry;
- thời điểm cập nhật cuối và trạng thái dữ liệu (official/internal/unavailable).

Card có nút Stop và Change account khi agent idle hoặc sau turn kết thúc. Nhiều card hiển thị dạng
grid; khi cửa sổ hẹp chuyển sang thanh trạng thái gọn. Main process phát usage/quota/compaction events
qua IPC tập trung; renderer giữ state theo agent và không tự gọi provider.

## 10. IPC và bảo mật

Thêm channels tập trung cho account list, login start/callback/cancel, enable/disable, switch,
logout/remove, usage refresh và agent assignment. Không hardcode channel string.

Secret chỉ nằm trong main/vault và vùng credential bắt buộc của Codex CLI. OAuth state/PKCE verifier
chỉ tồn tại trong memory với TTL. Mọi lỗi hệ thống gửi về UI theo thông báo tiếng Việt prefix `[bs]`.

## 11. Kiểm thử và tiêu chí chấp nhận

- Unit: vault, migration, PKCE/state, callback, token refresh, multi-account lifecycle, auth merge.
- Unit: Responses request/continuation, compact threshold, fallback compaction và usage mapping.
- Unit/integration: provider/account IPC, agent assignment/fallback, live usage events.
- UI/e2e: connect API key, OAuth callback, bật/tắt account, gán account cho nhiều agent, monitor
  card cập nhật trong lúc chạy.
- `npm run typecheck` và `npm test` phải pass; thay đổi UI/runtime phải chạy build và e2e.

## 12. Phạm vi triển khai

Triển khai theo các phase độc lập:

1. Data model, vault, migration và provider/account IPC.
2. OAuth adapter và multi-account lifecycle.
3. Responses LLM + compaction state.
4. Agent assignment và fallback.
5. Usage adapters/scheduler.
6. Providers UI và live chat monitor.
7. Regression, build và e2e.

