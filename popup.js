// Cập nhật trạng thái trên Popup
function updateStatus(msg, isProcessing = false) {
    const statusText = document.getElementById('status-text');
    const statusBar = document.getElementById('status');
    
    if (statusText && statusBar) {
        statusText.innerText = msg;
        if (isProcessing) {
            statusBar.classList.add('processing');
        } else {
            statusBar.classList.remove('processing');
        }
    } else {
        const oldStatus = document.getElementById('status');
        if (oldStatus) oldStatus.textContent = msg;
    }
}

// Nút 1 (All-in-One): Tự động Xóa Cache/Cookie -> Tải lại trang sạch -> Tự cuộn hết trang -> Chuẩn hóa A4 -> In PDF
document.getElementById('checkBtn').addEventListener('click', async () => {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.id) {
            updateStatus("Không tìm thấy tab hiện tại!", false);
            return;
        }

        updateStatus("Đang xóa cache/cookie & tự động tạo PDF...", true);

        chrome.runtime.sendMessage(
            { action: 'START_FULL_AUTO_PDF', tabId: tab.id },
            (response) => {
                if (chrome.runtime.lastError) {
                    updateStatus("Lỗi: " + chrome.runtime.lastError.message, false);
                    return;
                }
                if (response && response.ok) {
                    updateStatus(`Đã xóa ${response.cookieCount} cookie & cache! Đang tự cuộn & in...`, true);
                    setTimeout(() => window.close(), 900);
                } else {
                    updateStatus("Lỗi: " + (response ? response.error : "Không xác định"), false);
                }
            }
        );
    } catch (e) {
        updateStatus("Lỗi: " + e.message, false);
    }
});

// Nút 2: Chỉ xóa Cache & Cookie để đọc trực tiếp trên web
document.getElementById('clearBtn').addEventListener('click', async () => {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.id) return;

        updateStatus("Đang xóa sạch cache và cookie...", true);

        chrome.runtime.sendMessage(
            { action: 'CLEAR_ONLY', tabId: tab.id },
            (response) => {
                if (chrome.runtime.lastError) {
                    updateStatus("Lỗi: " + chrome.runtime.lastError.message, false);
                    return;
                }
                if (response && response.ok) {
                    updateStatus(`Đã xóa ${response.cookieCount} cookies & cache! Đang tải lại...`, false);
                } else {
                    updateStatus("Lỗi: " + (response ? response.error : "Không xác định"), false);
                }
            }
        );
    } catch (e) {
        updateStatus("Lỗi: " + e.message, false);
    }
});
