// Background Service Worker: Điều phối quy trình tự động cho cả STUDOCU và SCRIBD
// - Studocu: Xóa sạch Cache/Storage/Cookies -> Reload trang sạch -> Tự cuộn & Capture .pf -> Chuẩn hóa A4 -> In PDF
// - Scribd: Tự động chuyển từ /document/{id}/... sang /embeds/{id}/content (bản sạch 100% không paywall/mờ) -> Tự cuộn & Capture .outer_page -> Chuẩn hóa A4 -> In PDF

async function clearDomainCookies(domainKeyword) {
    const allCookies = await chrome.cookies.getAll({});
    let count = 0;
    for (const cookie of allCookies) {
        if (cookie.domain.includes(domainKeyword)) {
            let cleanDomain = cookie.domain.startsWith('.') ? cookie.domain.substring(1) : cookie.domain;
            const protocol = cookie.secure ? "https:" : "http:";
            const url = `${protocol}//${cleanDomain}${cookie.path}`;
            await chrome.cookies.remove({ url: url, name: cookie.name, storeId: cookie.storeId });
            count++;
        }
    }
    return count;
}

async function clearTabStorageAndCache(tabId) {
    try {
        await chrome.scripting.executeScript({
            target: { tabId },
            func: async () => {
                try { localStorage.clear(); } catch (_) {}
                try { sessionStorage.clear(); } catch (_) {}
                try {
                    if (window.caches && caches.keys) {
                        const keys = await caches.keys();
                        await Promise.all(keys.map(k => caches.delete(k)));
                    }
                } catch (_) {}
                try {
                    if (window.indexedDB && indexedDB.databases) {
                        const dbs = await indexedDB.databases();
                        dbs.forEach(db => {
                            if (db && db.name) indexedDB.deleteDatabase(db.name);
                        });
                    }
                } catch (_) {}
            }
        });
    } catch (_) {}
}

// Trích xuất URL Embed sạch của Scribd từ URL tài liệu gốc
// Ví dụ: https://www.scribd.com/document/1044574076/... -> https://www.scribd.com/embeds/1044574076/content
function getScribdEmbedUrl(url) {
    if (!url) return null;
    const match = url.match(/scribd\.com\/(?:document|doc|presentation|read)\/(\d+)/i);
    if (match && match[1]) {
        return `https://www.scribd.com/embeds/${match[1]}/content`;
    }
    const embedMatch = url.match(/scribd\.com\/embeds\/(\d+)\/content/i);
    if (embedMatch && embedMatch[1]) {
        return `https://www.scribd.com/embeds/${embedMatch[1]}/content`;
    }
    return null;
}

// Lắng nghe yêu cầu từ Popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'START_FULL_AUTO_PDF') {
        const tabId = message.tabId;
        (async () => {
            try {
                const tab = await chrome.tabs.get(tabId);
                const url = tab.url || '';
                const isScribd = url.includes('scribd.com');
                const isStudocu = url.includes('studocu.com') || url.includes('studocu.vn');

                if (!isScribd && !isStudocu) {
                    sendResponse({ ok: false, error: "Hãy mở tài liệu trên Studocu hoặc Scribd!" });
                    return;
                }

                if (isScribd) {
                    const embedUrl = getScribdEmbedUrl(url);
                    if (!embedUrl) {
                        sendResponse({ ok: false, error: "Không tìm thấy ID tài liệu Scribd trên URL này!" });
                        return;
                    }

                    // Nếu đã ở đúng trang /embeds/{id}/content và người dùng bấm nút lần nữa -> Chạy cuộn & xuất PDF ngay!
                    if (url.includes('/embeds/') && url.includes('/content')) {
                        await chrome.scripting.insertCSS({
                            target: { tabId },
                            files: ["viewer_styles.css"]
                        });
                        await chrome.scripting.executeScript({
                            target: { tabId },
                            func: runScribdAutoExport
                        });
                        sendResponse({ ok: true, mode: 'scribd_direct' });
                        return;
                    }

                    // Nếu đang ở trang /document/{id}/... -> Đặt cờ tự động xuất PDF và chuyển thẳng sang /embeds/{id}/content
                    await chrome.storage.local.set({ [`auto_pdf_tab_${tabId}`]: 'scribd' });
                    await chrome.tabs.update(tabId, { url: embedUrl });
                    sendResponse({ ok: true, mode: 'scribd_redirect' });
                    return;
                }

                // Nếu là Studocu: Xóa sạch cache + storage + cookies -> Reload trang sạch -> Tự động cuộn & xuất PDF
                await chrome.storage.local.set({ [`auto_pdf_tab_${tabId}`]: 'studocu' });
                await clearTabStorageAndCache(tabId);
                const cookieCount = await clearDomainCookies('studocu');
                await chrome.tabs.reload(tabId, { bypassCache: true });

                sendResponse({ ok: true, mode: 'studocu', cookieCount });
            } catch (err) {
                sendResponse({ ok: false, error: err.message });
            }
        })();
        return true;
    }

    if (message.action === 'CLEAR_ONLY') {
        const tabId = message.tabId;
        (async () => {
            try {
                const tab = await chrome.tabs.get(tabId);
                const url = tab.url || '';
                const isScribd = url.includes('scribd.com');

                if (isScribd) {
                    const embedUrl = getScribdEmbedUrl(url);
                    await clearTabStorageAndCache(tabId);
                    const cookieCount = await clearDomainCookies('scribd');
                    if (embedUrl && !url.includes('/embeds/')) {
                        await chrome.tabs.update(tabId, { url: embedUrl });
                    } else {
                        await chrome.tabs.reload(tabId, { bypassCache: true });
                    }
                    sendResponse({ ok: true, mode: 'scribd', cookieCount });
                    return;
                }

                // Studocu
                await clearTabStorageAndCache(tabId);
                const cookieCount = await clearDomainCookies('studocu');
                await chrome.tabs.reload(tabId, { bypassCache: true });
                sendResponse({ ok: true, mode: 'studocu', cookieCount });
            } catch (err) {
                sendResponse({ ok: false, error: err.message });
            }
        })();
        return true;
    }
});

// Lắng nghe khi tab Studocu hoặc Scribd tải xong để tự động kích hoạt luồng cuộn & xuất PDF A4
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status !== 'complete') return;
    const url = tab.url || '';
    const isStudocu = url.includes('studocu.com') || url.includes('studocu.vn');
    const isScribd = url.includes('scribd.com');
    if (!isStudocu && !isScribd) return;

    const key = `auto_pdf_tab_${tabId}`;
    const data = await chrome.storage.local.get(key);
    const taskType = data[key];
    if (!taskType) return;

    await chrome.storage.local.remove(key);

    try {
        await chrome.scripting.insertCSS({
            target: { tabId },
            files: ["viewer_styles.css"]
        });

        if (taskType === 'scribd' || isScribd) {
            await chrome.scripting.executeScript({
                target: { tabId },
                func: runScribdAutoExport
            });
        } else {
            await chrome.scripting.executeScript({
                target: { tabId },
                func: runStudocuAutoExport
            });
        }
    } catch (err) {
        console.error("Auto Export Error:", err);
    }
});

// ============================================================================
// 1. LUỒNG TỰ ĐỘNG XUẤT PDF A4 CHO SCRIBD (/embeds/{id}/content & /document/{id})
// ============================================================================
async function runScribdAutoExport() {
    if (window.__studocuAutoExportRunning) return;
    window.__studocuAutoExportRunning = true;

    let isCancelled = false;
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const overlay = document.createElement('div');
    overlay.id = 'std-helper-overlay';
    overlay.innerHTML = `
        <div class="std-modal">
            <div class="std-modal-icon">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="12" y1="18" x2="12" y2="12"></line>
                    <line x1="9" y1="15" x2="15" y2="15"></line>
                </svg>
            </div>
            <h3 class="std-modal-title">Đang xử lý tài liệu Scribd</h3>
            <p class="std-modal-status" id="std-progress-status">Đang khởi tạo trình đọc Scribd sạch...</p>
            <div class="std-progress-track">
                <div class="std-progress-fill" id="std-progress-fill"></div>
            </div>
            <div class="std-progress-meta">
                <span id="std-progress-count">Trang: 0 / 0</span>
                <span id="std-progress-percent">0%</span>
            </div>
            <button class="std-modal-btn" id="std-cancel-btn">Hủy tiến trình</button>
        </div>
    `;
    document.body.appendChild(overlay);

    const statusEl = document.getElementById('std-progress-status');
    const fillEl = document.getElementById('std-progress-fill');
    const countEl = document.getElementById('std-progress-count');
    const percentEl = document.getElementById('std-progress-percent');
    const cancelBtn = document.getElementById('std-cancel-btn');

    cancelBtn.addEventListener('click', () => {
        isCancelled = true;
        window.__studocuAutoExportRunning = false;
        overlay.remove();
    });

    function setProgress(current, total, statusText) {
        const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
        if (statusText) statusEl.textContent = statusText;
        fillEl.style.width = `${pct}%`;
        countEl.textContent = `Trang: ${current} / ${total}`;
        percentEl.textContent = `${pct}%`;
    }

    // Đợi danh sách trang .outer_page của Scribd xuất hiện
    let waitInit = 0;
    while (document.querySelectorAll('.outer_page').length === 0 && waitInit < 45) {
        if (isCancelled) return;
        await sleep(150);
        waitInit++;
    }

    const pages = Array.from(document.querySelectorAll('.outer_page'));
    if (pages.length === 0) {
        overlay.remove();
        window.__studocuAutoExportRunning = false;
        alert("⚠️ Không tìm thấy trang tài liệu Scribd nào!");
        return;
    }

    // Kiểm tra một trang Scribd (.outer_page) đã nạp xong nội dung (.newpage, .text_layer hoặc img.absimg có src) chưa
    function isScribdPageLoaded(page) {
        if (page.classList.contains('not_visible')) return false;
        const newpage = page.querySelector('.newpage');
        if (!newpage) return false;

        const imgs = Array.from(page.querySelectorAll('img.absimg, .image_layer img'));
        const hasTextSpans = page.querySelectorAll('.text_layer span, .text_layer div.ff0, .text_layer div[class^="ff"]').length > 0;

        if (imgs.length > 0) {
            const allImgsHaveSrc = imgs.every(img => Boolean(img.getAttribute('src') || img.currentSrc));
            return allImgsHaveSrc;
        }
        return hasTextSpans;
    }

    // Lưu bản clone của từng trang Scribd ngay khi cuộn tới để tránh bị Scribd giải phóng (not_visible) khi cuộn xuống dưới
    const capturedPageData = new Map();

    function captureScribdPage(page, index) {
        const newpage = page.querySelector('.newpage');
        if (!newpage) return false;

        // Lấy kích thước gốc của .newpage (ví dụ style="width: 902px; height: 1167px;")
        let nativeW = parseFloat(newpage.style.width) || newpage.offsetWidth || 0;
        let nativeH = parseFloat(newpage.style.height) || newpage.offsetHeight || 0;

        if (!nativeW || !nativeH) {
            const outerW = parseFloat(page.style.width) || page.offsetWidth || 902;
            const outerH = parseFloat(page.style.height) || page.offsetHeight || 1167;
            nativeW = outerW;
            nativeH = outerH;
        }

        const pageClone = page.cloneNode(true);
        pageClone.classList.remove('not_visible', 'blurred_page');

        // Xóa các phần tử thừa bên ngoài .newpage (như .highlighter_canvas hoặc 8 thẻ div rỗng viền IE6)
        Array.from(pageClone.children).forEach(child => {
            if (!child.classList.contains('newpage')) {
                child.remove();
            }
        });

        // Đảm bảo tất cả ảnh .absimg đã có thuộc tính src chuẩn và hiển thị rõ nét 100%
        pageClone.querySelectorAll('img').forEach(img => {
            const resolvedSrc = img.currentSrc || img.getAttribute('src') || img.getAttribute('orig');
            if (resolvedSrc) {
                img.setAttribute('src', resolvedSrc.replace(/^http:\/\//i, 'https://'));
            }
            img.removeAttribute('loading');
            img.style.setProperty('opacity', '1', 'important');
            img.style.setProperty('filter', 'none', 'important');
            img.style.setProperty('display', 'block', 'important');
        });

        // Bỏ hiệu ứng làm mờ chữ (nếu có)
        pageClone.querySelectorAll('.text_layer span, .text_layer div').forEach(el => {
            if (el.style && el.style.textShadow) {
                el.style.textShadow = 'none';
            }
        });

        capturedPageData.set(index, {
            clone: pageClone,
            nativeW,
            nativeH
        });
        return true;
    }

    try {
        // Tự động cuộn qua từng trang trên Scribd để kích hoạt nạp JSONP + FontFace + Signed Image URL
        const scroller = document.querySelector('.document_scroller') || document.getElementById('pdf_document_scroll_container');

        for (let i = 0; i < pages.length; i++) {
            if (isCancelled) return;
            const page = pages[i];
            setProgress(i + 1, pages.length, `Đang tự động cuộn và nạp trang ${i + 1} / ${pages.length}...`);

            page.scrollIntoView({ behavior: 'instant', block: 'center' });
            if (scroller) {
                // Kích hoạt sự kiện scroll để bộ nạp trang của Scribd nhận diện ngay lập tức
                scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
            }
            window.dispatchEvent(new Event('scroll', { bubbles: true }));

            // Chờ trang thoát trạng thái not_visible và gắn src cho ảnh img.absimg
            let retries = 0;
            while (!isScribdPageLoaded(page) && retries < 25) {
                if (isCancelled) return;
                await sleep(90);
                retries++;
            }

            // Chờ tất cả ảnh img.absimg trong trang tải hoàn tất
            const imgs = Array.from(page.querySelectorAll('img.absimg, .image_layer img'));
            for (const img of imgs) {
                if (!img.getAttribute('src') && img.getAttribute('orig')) {
                    img.setAttribute('src', img.getAttribute('orig').replace(/^http:\/\//i, 'https://'));
                }
                let imgWait = 0;
                while (!img.complete && imgWait < 20) {
                    if (isCancelled) return;
                    await sleep(60);
                    imgWait++;
                }
            }

            await sleep(60);
            captureScribdPage(page, i);
        }

        // Lượt 2: Tự động lướt kiểm tra lại toàn bộ từ trang 1 đến trang cuối một lần nữa
        // để đảm bảo 100% trang (cả ảnh nền & font chữ) đều đã tải đầy đủ, không sót bất kỳ trang nào!
        window.scrollTo({ top: 0, behavior: 'instant' });
        if (scroller) scroller.scrollTop = 0;
        await sleep(200);

        for (let i = 0; i < pages.length; i++) {
            if (isCancelled) return;
            const page = pages[i];
            const existingData = capturedPageData.get(i);
            const hasValidCapturedImg = existingData && Array.from(existingData.clone.querySelectorAll('img')).every(
                img => Boolean(img.getAttribute('src') && !img.getAttribute('src').startsWith('http://'))
            );

            setProgress(i + 1, pages.length, `Lượt 2: Đang lướt kiểm tra lại trang ${i + 1} / ${pages.length}...`);
            page.scrollIntoView({ behavior: 'instant', block: 'center' });
            if (scroller) {
                scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
            }
            window.dispatchEvent(new Event('scroll', { bubbles: true }));

            if (!existingData || !hasValidCapturedImg || isScribdPageLoaded(page)) {
                let retries = 0;
                while (!isScribdPageLoaded(page) && retries < 20) {
                    if (isCancelled) return;
                    await sleep(80);
                    retries++;
                }
                const imgs = Array.from(page.querySelectorAll('img.absimg, .image_layer img'));
                for (const img of imgs) {
                    if (!img.getAttribute('src') && img.getAttribute('orig')) {
                        img.setAttribute('src', img.getAttribute('orig').replace(/^http:\/\//i, 'https://'));
                    }
                    let imgWait = 0;
                    while (!img.complete && imgWait < 15) {
                        if (isCancelled) return;
                        await sleep(60);
                        imgWait++;
                    }
                }
                if (isScribdPageLoaded(page)) {
                    captureScribdPage(page, i);
                }
            } else {
                await sleep(70);
            }
        }

        if (isCancelled) return;

        // Đảm bảo tất cả các class font .ff0 .. .ff30 đều được hiển thị (display: unset) và chờ FontFace API tải xong
        setProgress(pages.length, pages.length, "Đang đồng bộ phông chữ và chuẩn hóa khổ giấy A4...");
        if (document.fonts && document.fonts.ready) {
            await Promise.race([document.fonts.ready, sleep(2500)]);
        }

        window.scrollTo({ top: 0, behavior: 'instant' });

        // Dựng #clean-viewer-container với class "outer_page_container" để khớp với CSS gốc của Scribd
        const viewerContainer = document.createElement('div');
        viewerContainer.id = 'clean-viewer-container';
        viewerContainer.className = 'outer_page_container';

        const A4_WIDTH = 794;   // 210mm @ 96 DPI
        const A4_HEIGHT = 1123; // 297mm @ 96 DPI
        let isLandscapeDoc = false;

        for (let i = 0; i < pages.length; i++) {
            const data = capturedPageData.get(i);
            const pageClone = data ? data.clone : pages[i].cloneNode(true);
            const nativeW = data ? data.nativeW : 902;
            const nativeH = data ? data.nativeH : 1167;

            const isLandscape = nativeW > nativeH * 1.05;
            if (isLandscape) isLandscapeDoc = true;

            const sheetW = isLandscape ? A4_HEIGHT : A4_WIDTH;
            const sheetH = isLandscape ? A4_WIDTH : A4_HEIGHT;

            const sheet = document.createElement('div');
            sheet.className = 'std-a4-sheet';
            sheet.id = `scribd-sheet-${i + 1}`;
            sheet.setAttribute('data-page-number', i + 1);
            sheet.style.width = `${sheetW}px`;
            sheet.style.height = `${sheetH}px`;

            // Tính tỉ lệ scale đồng nhất từ kích thước gốc của .newpage (ví dụ 902 x 1167) sang khổ A4 (794 x 1123)
            const scaleX = sheetW / nativeW;
            const scaleY = sheetH / nativeH;
            const uniformScale = Math.min(scaleX, scaleY);

            const scaledW = nativeW * uniformScale;
            const scaledH = nativeH * uniformScale;
            const offsetX = Math.max(0, (sheetW - scaledW) / 2);
            const offsetY = Math.max(0, (sheetH - scaledH) / 2);

            pageClone.style.width = `${sheetW}px`;
            pageClone.style.height = `${sheetH}px`;

            const newpageEl = pageClone.querySelector('.newpage');
            if (newpageEl) {
                newpageEl.style.width = `${nativeW}px`;
                newpageEl.style.height = `${nativeH}px`;
                newpageEl.style.left = `${offsetX.toFixed(2)}px`;
                newpageEl.style.top = `${offsetY.toFixed(2)}px`;
                newpageEl.style.transform = `scale(${uniformScale.toFixed(6)})`;
                newpageEl.style.webkitTransform = `scale(${uniformScale.toFixed(6)})`;
                newpageEl.style.transformOrigin = '0 0';
                newpageEl.style.webkitTransformOrigin = '0 0';
            }

            sheet.appendChild(pageClone);
            viewerContainer.appendChild(sheet);
        }

        const oldPrintRule = document.getElementById('std-dynamic-page-rule');
        if (oldPrintRule) oldPrintRule.remove();
        const dynamicPrintStyle = document.createElement('style');
        dynamicPrintStyle.id = 'std-dynamic-page-rule';
        dynamicPrintStyle.textContent = `
            @media print {
                @page {
                    size: A4 ${isLandscapeDoc ? 'landscape' : 'portrait'} !important;
                    margin: 0mm !important;
                }
                html, body, body.std-clean-mode, #clean-viewer-container {
                    width: ${isLandscapeDoc ? '297mm' : '210mm'} !important;
                }
                .std-a4-sheet {
                    width: ${isLandscapeDoc ? '1123px' : '794px'} !important;
                    height: ${isLandscapeDoc ? '794px' : '1123px'} !important;
                }
            }
        `;
        document.head.appendChild(dynamicPrintStyle);

        const toolbar = document.createElement('div');
        toolbar.id = 'std-clean-toolbar';
        toolbar.innerHTML = `
            <button class="std-toolbar-btn primary" id="std-reprint-btn">
                🖨️ In / Lưu PDF A4 (${pages.length} trang)
            </button>
            <button class="std-toolbar-btn secondary" id="std-exit-btn">
                ✕ Thoát chế độ in
            </button>
        `;

        document.body.classList.add('std-clean-mode');
        document.body.appendChild(toolbar);
        document.body.appendChild(viewerContainer);

        document.getElementById('std-reprint-btn').addEventListener('click', () => {
            window.print();
        });

        document.getElementById('std-exit-btn').addEventListener('click', () => {
            document.body.classList.remove('std-clean-mode');
            viewerContainer.remove();
            toolbar.remove();
            if (dynamicPrintStyle) dynamicPrintStyle.remove();
            window.__studocuAutoExportRunning = false;
        });

        // Chờ các ảnh trong viewerContainer decode hoàn tất
        const clonedImgs = Array.from(viewerContainer.querySelectorAll('img'));
        await Promise.all(clonedImgs.map(img => {
            if (img.complete) return Promise.resolve();
            return new Promise(res => {
                img.addEventListener('load', res, { once: true });
                img.addEventListener('error', res, { once: true });
                setTimeout(res, 1500);
            });
        }));

        overlay.remove();
        window.__studocuAutoExportRunning = false;

        setTimeout(() => {
            window.print();
        }, 400);

    } catch (err) {
        console.error('Scribd Helper Error:', err);
        overlay.remove();
        window.__studocuAutoExportRunning = false;
        alert('Lỗi khi xử lý tài liệu Scribd: ' + err.message);
    }
}

// ============================================================================
// 2. LUỒNG TỰ ĐỘNG XUẤT PDF A4 CHO STUDOCU
// ============================================================================
async function runStudocuAutoExport() {
    if (window.__studocuAutoExportRunning) return;
    window.__studocuAutoExportRunning = true;

    let isCancelled = false;
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const overlay = document.createElement('div');
    overlay.id = 'std-helper-overlay';
    overlay.innerHTML = `
        <div class="std-modal">
            <div class="std-modal-icon">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="12" y1="18" x2="12" y2="12"></line>
                    <line x1="9" y1="15" x2="15" y2="15"></line>
                </svg>
            </div>
            <h3 class="std-modal-title">Đã xóa Cache & Bypass mờ!</h3>
            <p class="std-modal-status" id="std-progress-status">Đang chờ tài liệu khởi tạo...</p>
            <div class="std-progress-track">
                <div class="std-progress-fill" id="std-progress-fill"></div>
            </div>
            <div class="std-progress-meta">
                <span id="std-progress-count">Trang: 0 / 0</span>
                <span id="std-progress-percent">0%</span>
            </div>
            <button class="std-modal-btn" id="std-cancel-btn">Hủy tiến trình</button>
        </div>
    `;
    document.body.appendChild(overlay);

    const statusEl = document.getElementById('std-progress-status');
    const fillEl = document.getElementById('std-progress-fill');
    const countEl = document.getElementById('std-progress-count');
    const percentEl = document.getElementById('std-progress-percent');
    const cancelBtn = document.getElementById('std-cancel-btn');

    cancelBtn.addEventListener('click', () => {
        isCancelled = true;
        window.__studocuAutoExportRunning = false;
        overlay.remove();
    });

    function setProgress(current, total, statusText) {
        const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
        if (statusText) statusEl.textContent = statusText;
        fillEl.style.width = `${pct}%`;
        countEl.textContent = `Trang: ${current} / ${total}`;
        percentEl.textContent = `${pct}%`;
    }

    let waitInit = 0;
    while (document.querySelectorAll('div[data-page-index]').length === 0 && waitInit < 40) {
        if (isCancelled) return;
        await sleep(150);
        waitInit++;
    }

    const initialPages = document.querySelectorAll('div[data-page-index]');
    if (initialPages.length === 0) {
        overlay.remove();
        window.__studocuAutoExportRunning = false;
        alert("⚠️ Không tìm thấy trang tài liệu nào sau khi tải lại!");
        return;
    }

    function isPageLoaded(page) {
        const pc = page.querySelector('.pc');
        const img = page.querySelector('img.bi') || page.querySelector('img');
        const hasText = pc && pc.children.length > 0;
        const hasImg = img && (img.getAttribute('src') || img.currentSrc);
        return Boolean(hasText || hasImg);
    }

    const capturedPfClones = new Map();
    const capturedDimensions = new Map();

    function capturePageIfLoaded(page, index) {
        if (!isPageLoaded(page)) return false;

        const pf = page.querySelector('.pf') || page;
        const pc = page.querySelector('.pc');
        let origW = (pf && pf.offsetWidth > 50) ? pf.offsetWidth : ((pc && pc.offsetWidth > 50) ? pc.offsetWidth : 0);
        let origH = (pf && pf.offsetHeight > 50) ? pf.offsetHeight : ((pc && pc.offsetHeight > 50) ? pc.offsetHeight : 0);

        if (!origW || !origH) {
            const pfStyle = window.getComputedStyle(pf);
            const sw = parseFloat(pfStyle.width);
            const sh = parseFloat(pfStyle.height);
            if (sw > 50 && sh > 50) {
                origW = sw;
                origH = sh;
            } else {
                origW = 595.3;
                origH = 841.9;
            }
        }

        const pfClone = pf.cloneNode(true);

        pfClone.querySelectorAll('img').forEach(img => {
            const src = img.currentSrc || img.getAttribute('src') || img.getAttribute('data-src');
            if (src) img.setAttribute('src', src);
            img.removeAttribute('loading');
            img.style.setProperty('filter', 'none', 'important');
            img.style.setProperty('-webkit-filter', 'none', 'important');
        });

        pfClone.querySelectorAll('[class*="paywall"], [class*="banner"], [id*="upgrade"], [class*="blur"], [class*="out-of-focus"]').forEach(el => el.remove());
        pfClone.querySelectorAll('div, section, aside').forEach(el => {
            if (!el.classList.contains('pc') && !el.classList.contains('page-content') && !el.classList.contains('t')) {
                const txt = (el.textContent || '').toLowerCase();
                if (txt.includes('out of focus') || txt.includes('become premium') || txt.includes('this is a premium document')) {
                    el.remove();
                }
            }
        });

        pfClone.querySelectorAll('.pc, .page-content, .t, span').forEach(el => {
            if (el.classList && el.classList.contains('pc')) {
                el.classList.add('opened');
                el.style.setProperty('display', 'block', 'important');
            }
            el.style.setProperty('visibility', 'visible', 'important');
            el.style.setProperty('opacity', '1', 'important');
            el.style.setProperty('filter', 'none', 'important');
            el.style.setProperty('-webkit-filter', 'none', 'important');
        });

        capturedPfClones.set(index, pfClone);
        capturedDimensions.set(index, { width: origW, height: origH });
        return true;
    }

    try {
        let pages = Array.from(document.querySelectorAll('div[data-page-index]'));
        for (let i = 0; i < pages.length; i++) {
            if (isCancelled) return;

            const updated = document.querySelectorAll('div[data-page-index]');
            if (updated.length > pages.length) {
                pages = Array.from(updated);
            }

            const page = pages[i];
            setProgress(i + 1, pages.length, `Đang tự động cuộn và tải trang ${i + 1} / ${pages.length}...`);
            page.scrollIntoView({ behavior: 'instant', block: 'center' });

            let retries = 0;
            while (!isPageLoaded(page) && retries < 22) {
                if (isCancelled) return;
                await sleep(85);
                retries++;
            }

            const pageImg = page.querySelector('img.bi') || page.querySelector('img');
            if (pageImg && !pageImg.complete) {
                let imgWait = 0;
                while (!pageImg.complete && imgWait < 15) {
                    if (isCancelled) return;
                    await sleep(60);
                    imgWait++;
                }
            } else {
                await sleep(50);
            }

            capturePageIfLoaded(page, i);
        }

        // Lượt 2: Tự động lướt kiểm tra lại một lần nữa từ trang 1 đến trang cuối
        // để đảm bảo 100% các trang đều đã tải đầy đủ cả text (.pc) lẫn ảnh nền (img.bi)
        window.scrollTo({ top: 0, behavior: 'instant' });
        await sleep(200);

        for (let i = 0; i < pages.length; i++) {
            if (isCancelled) return;
            const page = pages[i];
            const existingClone = capturedPfClones.get(i);
            const hasCompleteClone = existingClone &&
                existingClone.querySelector('.pc') &&
                existingClone.querySelector('.pc').children.length > 0 &&
                Array.from(existingClone.querySelectorAll('img')).every(img => Boolean(img.getAttribute('src')));

            setProgress(i + 1, pages.length, `Lượt 2: Đang lướt kiểm tra lại trang ${i + 1} / ${pages.length}...`);
            page.scrollIntoView({ behavior: 'instant', block: 'center' });

            if (!hasCompleteClone || isPageLoaded(page)) {
                let retries = 0;
                while (!isPageLoaded(page) && retries < 20) {
                    if (isCancelled) return;
                    await sleep(80);
                    retries++;
                }
                const pageImg = page.querySelector('img.bi') || page.querySelector('img');
                if (pageImg && !pageImg.complete) {
                    let imgWait = 0;
                    while (!pageImg.complete && imgWait < 15) {
                        if (isCancelled) return;
                        await sleep(60);
                        imgWait++;
                    }
                }
                if (isPageLoaded(page)) {
                    capturePageIfLoaded(page, i);
                }
            } else {
                await sleep(60);
            }
        }

        if (isCancelled) return;

        setProgress(pages.length, pages.length, "Đang đồng bộ phông chữ gốc và chuẩn hóa trang A4...");
        document.querySelectorAll('link[rel*="stylesheet"]').forEach(link => {
            if (link.rel !== 'stylesheet') {
                link.rel = 'stylesheet';
            }
        });
        document.querySelectorAll('body style, body link[rel*="stylesheet"]').forEach(node => {
            document.head.appendChild(node.cloneNode(true));
        });

        if (document.fonts && document.fonts.ready) {
            await Promise.race([document.fonts.ready, sleep(2500)]);
        }

        window.scrollTo({ top: 0, behavior: 'instant' });

        const viewerContainer = document.createElement('div');
        viewerContainer.id = 'clean-viewer-container';
        viewerContainer.className = 'p2hv';

        const A4_WIDTH = 794;
        const A4_HEIGHT = 1123;
        let isLandscapeDoc = false;

        for (let i = 0; i < pages.length; i++) {
            const pfClone = capturedPfClones.get(i) || (pages[i].querySelector('.pf') || pages[i]).cloneNode(true);
            const dims = capturedDimensions.get(i) || { width: 595.3, height: 841.9 };
            const origW = dims.width;
            const origH = dims.height;

            const isLandscape = origW > origH * 1.05;
            if (isLandscape) isLandscapeDoc = true;

            const sheetW = isLandscape ? A4_HEIGHT : A4_WIDTH;
            const sheetH = isLandscape ? A4_WIDTH : A4_HEIGHT;

            const sheet = document.createElement('div');
            sheet.className = 'std-a4-sheet';
            sheet.id = `page-${i + 1}`;
            sheet.setAttribute('data-page-number', i + 1);
            sheet.style.width = `${sheetW}px`;
            sheet.style.height = `${sheetH}px`;

            const scaleX = sheetW / origW;
            const scaleY = sheetH / origH;
            const uniformScale = Math.min(scaleX, scaleY);

            const scaledW = origW * uniformScale;
            const scaledH = origH * uniformScale;
            const offsetX = Math.max(0, (sheetW - scaledW) / 2);
            const offsetY = Math.max(0, (sheetH - scaledH) / 2);

            pfClone.style.width = `${origW}px`;
            pfClone.style.height = `${origH}px`;
            pfClone.style.left = `${offsetX.toFixed(2)}px`;
            pfClone.style.top = `${offsetY.toFixed(2)}px`;
            pfClone.style.transform = `scale(${uniformScale.toFixed(6)})`;
            pfClone.style.webkitTransform = `scale(${uniformScale.toFixed(6)})`;

            sheet.appendChild(pfClone);
            viewerContainer.appendChild(sheet);
        }

        const oldPrintRule = document.getElementById('std-dynamic-page-rule');
        if (oldPrintRule) oldPrintRule.remove();
        const dynamicPrintStyle = document.createElement('style');
        dynamicPrintStyle.id = 'std-dynamic-page-rule';
        dynamicPrintStyle.textContent = `
            @media print {
                @page {
                    size: A4 ${isLandscapeDoc ? 'landscape' : 'portrait'} !important;
                    margin: 0mm !important;
                }
                html, body, body.std-clean-mode, #clean-viewer-container.p2hv {
                    width: ${isLandscapeDoc ? '297mm' : '210mm'} !important;
                }
                .std-a4-sheet {
                    width: ${isLandscapeDoc ? '1123px' : '794px'} !important;
                    height: ${isLandscapeDoc ? '794px' : '1123px'} !important;
                }
            }
        `;
        document.head.appendChild(dynamicPrintStyle);

        const toolbar = document.createElement('div');
        toolbar.id = 'std-clean-toolbar';
        toolbar.innerHTML = `
            <button class="std-toolbar-btn primary" id="std-reprint-btn">
                🖨️ In / Lưu PDF A4 (${pages.length} trang)
            </button>
            <button class="std-toolbar-btn secondary" id="std-exit-btn">
                ✕ Thoát chế độ in
            </button>
        `;

        document.body.classList.add('std-clean-mode');
        document.body.appendChild(toolbar);
        document.body.appendChild(viewerContainer);

        document.getElementById('std-reprint-btn').addEventListener('click', () => {
            window.print();
        });

        document.getElementById('std-exit-btn').addEventListener('click', () => {
            document.body.classList.remove('std-clean-mode');
            viewerContainer.remove();
            toolbar.remove();
            if (dynamicPrintStyle) dynamicPrintStyle.remove();
            window.__studocuAutoExportRunning = false;
        });

        const clonedImgs = Array.from(viewerContainer.querySelectorAll('img'));
        await Promise.all(clonedImgs.map(img => {
            if (img.complete) return Promise.resolve();
            return new Promise(res => {
                img.addEventListener('load', res, { once: true });
                img.addEventListener('error', res, { once: true });
                setTimeout(res, 1500);
            });
        }));

        overlay.remove();
        window.__studocuAutoExportRunning = false;

        setTimeout(() => {
            window.print();
        }, 400);

    } catch (err) {
        console.error('Studocu Helper Error:', err);
        overlay.remove();
        window.__studocuAutoExportRunning = false;
        alert('Lỗi khi xử lý tài liệu: ' + err.message);
    }
}
