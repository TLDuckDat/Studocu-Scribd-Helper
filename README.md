# 🎓 Studocu & Scribd Helper

Một tiện ích mở rộng (Browser Extension) gọn nhẹ, mạnh mẽ dành cho sinh viên, giúp tự động hóa hoàn toàn việc mở khóa, làm sạch giao diện và tải tài liệu chuẩn **100% khổ giấy A4** trên cả **Studocu** và **Scribd** chỉ với **1 cú click**.

> **Phiên bản:** `v1.0`  
> **Hỗ trợ:** Chrome, Brave, Microsoft Edge, Cốc Cốc (Manifest V3)

---

## 📖 Giới thiệu

Khi ôn tập và tìm kiếm tài liệu trên **Studocu** hoặc **Scribd**, sinh viên thường gặp phải các bất tiện lớn:
- Trang tài liệu bị làm mờ (*"Why is this page out of focus?"*, *"Unlock this document"*), bị chèn quảng cáo hoặc bắt tắt trình chặn quảng cáo (đặc biệt trên trình duyệt **Brave**).
- Phải tự lăn chuột thủ công qua hàng chục, hàng trăm trang để tài liệu tải hết nội dung.
- Khi in hoặc lưu về máy dạng PDF, trang tài liệu bị **thu nhỏ lại**, không lấp đầy khổ giấy A4, hoặc bị **vỡ cấu trúc bảng biểu, lỗi phông chữ tiếng Việt** (*"điểm"* bị lỗi glyph thành *"đi7m"*).

**Studocu & Scribd Helper** giải quyết triệt để toàn bộ các vấn đề trên bằng một quy trình tự động hóa khép kín.

---

## ✨ Tính năng nổi bật

### 1. 🖨️ Tự động Tải & Xuất PDF Chuẩn A4 (1-Click All-in-One)
Chỉ cần bấm một nút duy nhất, tiện ích sẽ tự động thực hiện toàn bộ quy trình:
- **Tự động làm sạch trước khi tải:**
  - **Trên Studocu:** Tự động xóa sạch Cookies, Cache, LocalStorage/SessionStorage và tải lại trang mới để gỡ bỏ hoàn toàn lớp phủ mờ Premium trước khi quét.
  - **Trên Scribd:** Tự động chuyển hướng thông minh từ `/document/{id}/...` sang trình đọc sạch `/embeds/{id}/content` không chứa Paywall hay banner quảng cáo.
- **Tự động cuộn 2 lượt (Double-Pass Auto Scroll):**
  - **Lượt 1:** Tự động cuộn từ trang đầu đến trang cuối để kích hoạt nạp toàn bộ văn bản, hình ảnh nền (`img.bi` / `img.absimg`) và phông chữ (`@font-face` / `FontFace`), đồng thời lưu trữ (capture) từng trang ngay khi vừa nạp xong để chống cơ chế tự xóa DOM (virtualization) của web.
  - **Lượt 2:** Tự động lướt kiểm tra lại một lần nữa từ trang `1 → N` để đảm bảo 100% các trang đã nạp đủ ảnh và chữ, không bị sót hay trắng bất kỳ trang nào.
- **Giữ nguyên 100% định dạng gốc & Phóng chuẩn khổ giấy A4 (`210mm × 297mm`):**
  - Bảo toàn nguyên vẹn cấu trúc lớp văn bản và CSS gốc của tài liệu (`.p2hv > .pf > .pc` trên Studocu và `.outer_page > .newpage` trên Scribd), giúp giữ chuẩn xác 100% bảng biểu, đồ thị, công thức toán học và phông chữ tiếng Việt.
  - Tự động nhận diện trang dọc (`Portrait`) hoặc slide ngang (`Landscape`) và co giãn đồng nhất (`uniform scale`) vừa khít 100% trang A4 tràn viền (`margin: 0mm`).
  - Xử lý triệt để lỗi "vạch đen" ở mép dưới mỗi trang khi xuất PDF.

### 2. 🔓 Bypass Mờ, Quảng cáo & Tương thích hoàn hảo với Brave
- **Tự động vượt rào cản trên trình duyệt Brave:** Tự động đóng và bỏ qua hộp thoại phát hiện chặn quảng cáo (`AdBlockerModal`), tự động bấm qua nút *"Skip ad"*, ẩn bảng Cookie Consent (`Osano` / `OneTrust`) và mở khóa thanh cuộn chuột.
- **Chế độ đọc trực tiếp sạch sẽ:** Nút **"Bypass mờ & Mở khóa trang"** giúp xóa nhanh cache trên Studocu hoặc mở ngay chế độ Embed sạch trên Scribd khi bạn chỉ muốn đọc trực tiếp trên trình duyệt mà không cần tải về.

---

## 🛠 Hướng dẫn cài đặt

Bạn có thể cài đặt tiện ích trực tiếp qua chế độ **Developer Mode** trên mọi trình duyệt nhân Chromium (Chrome, Brave, Edge, Cốc Cốc...):

1. **Tải mã nguồn:**
   - Tải file `.zip` của repository này về máy và giải nén (hoặc dùng lệnh `git clone`).
2. **Mở trang Quản lý Tiện ích (Extensions):**
   - Trên Chrome: Truy cập `chrome://extensions/`
   - Trên Brave: Truy cập `brave://extensions/`
   - Trên Edge: Truy cập `edge://extensions/`
3. **Bật Chế độ dành cho nhà phát triển:**
   - Gạt bật công tắc **"Developer mode"** (*Chế độ dành cho nhà phát triển*) ở góc trên bên phải màn hình.
4. **Nạp tiện ích:**
   - Nhấn vào nút **"Load unpacked"** (*Tải tiện ích đã giải nén*) ở góc trên bên trái và chọn thư mục chứa mã nguồn của dự án.

---

## 🚀 Hướng dẫn sử dụng

1. Truy cập vào trang tài liệu bất kỳ trên **Studocu** (`studocu.com`, `studocu.vn`) hoặc **Scribd** (`scribd.com/document/...`).
2. Mở tiện ích **Studocu & Scribd Helper** trên thanh công cụ trình duyệt:
   - Nhấn **"Tự động Tải & Xuất PDF A4"**: Tiện ích sẽ tự động xóa cache/chuyển sang trang sạch $\rightarrow$ tự động cuộn tải toàn bộ các trang qua 2 lượt $\rightarrow$ dàn trang chuẩn A4 $\rightarrow$ tự động bật hộp thoại **In / Lưu dưới dạng PDF (Save as PDF)**.
   - Nhấn **"Bypass mờ & Mở khóa trang"**: Nếu bạn chỉ muốn mở khóa nhanh để đọc trực tiếp trên web.
3. Trong hộp thoại In của trình duyệt:
   - Mục **Destination (Máy in đích)**: Chọn **Save as PDF (Lưu dưới dạng PDF)**.
   - Nhấn **Save (Lưu)** để hoàn tất!
4. Sau khi hộp thoại In đóng lại, bạn có thể dùng thanh công cụ nổi ở góc trên bên phải màn hình để bấm **"In / Lưu PDF A4"** lại lần nữa hoặc bấm **"Thoát chế độ in"** để quay về giao diện web ban đầu.

---

## 📂 Cấu trúc thư mục

```text
├── manifest.json       # Cấu hình tiện ích mở rộng (Manifest V3)
├── background.js       # Service Worker điều phối xóa cache, chuyển trang & tự động cuộn 2 lượt
├── content_script.js   # Tự động bypass Anti-Adblock (Brave), Skip Ad, Cookie Banner & gỡ khóa mờ
├── custom_style.css    # CSS làm sạch giao diện trực tiếp trên Studocu & Scribd
├── viewer_styles.css   # CSS chế độ Clean Viewer, bảng tiến trình & định dạng in chuẩn 100% A4
├── popup.html          # Giao diện bảng điều khiển tiện ích
├── popup.css           # Định dạng giao diện Popup
└── popup.js            # Xử lý sự kiện từ người dùng trên Popup
```

---

## 🙏 Credits & Tham khảo

- Phát triển và tối ưu hóa bởi **Đạt**.
- Dự án có tham khảo ý tưởng và mã nguồn nền tảng từ [xDatx/Studocu-Scribd-Helper](https://github.com/xDatx/Studocu-Scribd-Helper).

---

## ⚠️ Lưu ý (Disclaimer)

Công cụ này được phát triển với mục đích phi lợi nhuận nhằm hỗ trợ sinh viên trong việc học tập, ôn thi và nghiên cứu cá nhân. Vui lòng sử dụng có trách nhiệm và tôn trọng bản quyền của tác giả tài liệu gốc.
