// Content Script chạy tự động ngay khi mở trang Studocu hoặc Scribd (đặc biệt tối ưu cho trình duyệt Brave)
// 1. Tự động vô hiệu hóa / đóng các popup phát hiện Adblock (AdBlockerModal-module_*), Osano Cookie Consent, Skip Ad
// 2. Tự động xóa class blurred_page, gỡ bỏ hộp thoại "Unlock this document" / "Unlock the next 2 pages after an ad" trên Scribd
// 3. Cho phép cuộn trang tự nhiên không bị khóa scroll bởi modal

(function () {
    const isScribd = location.hostname.includes('scribd.com');
    const isStudocu = location.hostname.includes('studocu.');

    if (!isScribd && !isStudocu) return;

    function autoBypassPromptsAndLocks() {
        // --- A. XỬ LÝ RIÊNG CHO SCRIBD TRÊN BRAVE ---
        if (isScribd) {
            // 1. Tự động bấm nút "Continue" / "Tiếp tục" trên AdBlockerModal nếu Brave Shields kích hoạt cảnh báo Adblock
            const adblockContinueBtns = document.querySelectorAll(
                '[class*="AdBlockerModal-module_continue_btn"], [class*="AdBlockerModal"] button'
            );
            adblockContinueBtns.forEach(btn => {
                const txt = (btn.textContent || '').toLowerCase();
                if (btn.className.includes('continue_btn') || txt.includes('continue') || txt.includes('tiếp tục') || txt.includes('close')) {
                    try { btn.click(); } catch (_) {}
                }
            });

            // Xóa hẳn lớp phủ AdBlockerModal khỏi DOM nếu vẫn còn
            document.querySelectorAll('[class*="AdBlockerModal-module_wrapper"], [class*="AdBlockerModal-module_modalBackground"]').forEach(el => {
                el.remove();
            });

            // 2. Tự động tick / bấm nút "Skip ad" ([data-e2e="skip-ad-button"]) nếu xuất hiện trên trang /document/
            const skipAdBtns = document.querySelectorAll('[data-e2e="skip-ad-button"]');
            skipAdBtns.forEach(btn => {
                try { btn.click(); } catch (_) {}
            });

            // 3. Tự động đóng Osano Cookie Consent Banner trên Brave để không che khuất tài liệu
            const osanoCloseBtn = document.querySelector(
                '.osano-cm-deny, .osano-cm-accept-all, .osano-cm-close, .osano-cm-dialog__close'
            );
            if (osanoCloseBtn && osanoCloseBtn.offsetParent !== null) {
                try { osanoCloseBtn.click(); } catch (_) {}
            }
            document.querySelectorAll('.osano-cm-window, .osano-cm-dialog').forEach(el => {
                el.style.setProperty('display', 'none', 'important');
            });

            // 4. Xóa bỏ các khối khóa trang "[data-e2e='ads-for-access-promo']" ("Unlock this document" / "Unlock the next 2 pages after an ad")
            document.querySelectorAll('[data-e2e="ads-for-access-promo"], .between_page_portal_root').forEach(promo => {
                const wrapper = promo.closest('._3jL30R') || promo;
                wrapper.remove();
            });

            // 5. Gỡ bỏ class "blurred_page" trên tất cả các trang .outer_page để ảnh và chữ nét 100% ngay cả khi chưa sang /embeds/
            document.querySelectorAll('.outer_page.blurred_page').forEach(page => {
                page.classList.remove('blurred_page');
            });
        }

        // --- B. XỬ LÝ CHO STUDOCU ---
        if (isStudocu) {
            document.querySelectorAll('#onetrust-banner-sdk, #onetrust-consent-sdk').forEach(el => {
                el.remove();
            });
        }

        // Mở khóa cuộn chuột nếu modal của web khóa body overflow: hidden
        if (document.body && document.body.style.overflow === 'hidden') {
            document.body.style.setProperty('overflow', 'auto', 'important');
        }
    }

    // Chạy ngay khi DOM sẵn sàng và theo dõi liên tục bằng MutationObserver
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', autoBypassPromptsAndLocks);
    } else {
        autoBypassPromptsAndLocks();
    }

    const observer = new MutationObserver(() => {
        autoBypassPromptsAndLocks();
    });

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true
    });
})();
