# AGENTS.md — docs

Hai loại tài liệu ở đây, và trộn lẫn chúng là nguồn sai lầm thường gặp nhất.

## Tham chiếu — hệ thống hiện là gì

- `design/` — **tài liệu thiết kế, là nguồn đáng tin về hiện tại.** Bắt đầu ở
  `design/README.md`: nó chỉ mục tám tài liệu miền, mang mục Current work /
  Next work, và có chỉ mục tên xuyên file để đi một bước từ một định danh tới
  đúng dòng giải thích nó.
- `technical-debt.md` — việc đã hoãn có chủ đích, kèm lý do hoãn và điều kiện
  để đóng. Không phải danh sách TODO.
- `changelog-*.md` — lịch sử phát hành. `changelog-format.md` là quy ước viết.

TOC trong `design/` **được sinh tự động** bởi `scripts/build-docs-toc.mjs`. Sửa
tay là vô nghĩa — chạy `npm run docs:toc`, và một test sẽ đỏ nếu TOC lệch nội
dung hoặc tài liệu trích một đường dẫn không tồn tại.

## Lưu trữ quy trình — dự án đã đi tới đây bằng cách nào

- `superpowers/specs/` — design spec, viết **trước** khi code.
- `superpowers/plans/` — kế hoạch triển khai từng bước.
- `superpowers/brainstorms/` — ghi chú phiên brainstorm.
- `superpowers/notes/` — ghi chú kỹ thuật rời rạc.
- `superpowers/audits/` — kết quả rà soát.
- `evidence/` — biên bản kiểm chứng thủ công.

**Mỗi file ở đây là ảnh chụp một thay đổi tại một thời điểm.** Một plan ngày
2026-08-04 nói đúng về thời điểm của nó và không nói gì đáng tin về hôm nay. Đọc
để hiểu lịch sử quyết định, không đọc để biết hệ thống đang làm gì — phần đó ở
`design/`.

## Quy ước

- Tên file lưu trữ: `YYYY-MM-DD-slug.md`.
- Quy trình: brainstorm → spec → plan → thực thi. Cập nhật spec/plan khi quyết
  định thay đổi.
- Khi một thay đổi làm sai một điều đã ghi trong `design/`, sửa `design/` trong
  cùng lần thay đổi đó. Tài liệu tham chiếu lệch code còn tệ hơn không có.
