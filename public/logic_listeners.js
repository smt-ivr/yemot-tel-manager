let isListenersModalOpen = false;

function initRealTimeListeners() {
    createListenersUI();
    startPolling();
}

function createListenersUI() {
    const headerBottomRow = document.getElementById('header-row-bottom');
    if (!headerBottomRow) return;

    const listenerChip = document.createElement('div');
    listenerChip.id = 'liveListenersCounter';
    listenerChip.className = 'live-listeners-chip'; 
    listenerChip.innerHTML = `
        <span class="pulse-dot"></span>
        <span class="chip-icon"><i class="fas fa-headphones-alt"></i></span>
        <span class="chip-label">מאזינים כעת:</span>
        <span id="listenersCountValue" class="chip-value">0</span>
    `;
    listenerChip.title = "לחץ לפירוט מלא";
    listenerChip.onclick = toggleListenersModal;
    
    headerBottomRow.appendChild(listenerChip);

    const modalHtml = `
        <div id="listenersModal" class="listeners-modal" style="display: none;">
            <div class="listeners-modal-content fixed-size-modal">
                <div class="listeners-header">
                    <h3><i class="fas fa-chart-line"></i> פירוט שיחות פעילות</h3>
                    <div class="header-actions">
                        <span id="modalTotalStatus" class="status-pill">ממתין לנתונים...</span>
                        <button onclick="toggleListenersModal()" class="close-btn"><i class="fas fa-times"></i></button>
                    </div>
                </div>
                <div class="listeners-body-container">
                    <table id="listenersTable" class="fixed-table">
                        <thead>
                            <tr>
                                <th style="width: 10%;">משך זמן</th>
                                <th style="width: 25%;">מספר מתקשר / זיהוי</th>
                                <th style="width: 25%;">מיקום (Path)</th>
                                <th style="width: 15%;">קו נכנס (DID)</th>
                                <th style="width: 15%;">מזהה (ID)</th>
                                <th style="width: 10%;">הועבר מ-</th>
                            </tr>
                        </thead>
                        <tbody id="listenersTableBody">
                            </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function startPolling() {
    if (window.listenersInterval) clearInterval(window.listenersInterval);
    fetchListenersData();
    window.listenersInterval = setInterval(fetchListenersData, 1000);
}

window.fetchListenersData = async function() { 
    if (window.isSessionExpired) return;

    const tokenInput = document.getElementById('current-token-display');
    const token = tokenInput ? tokenInput.value : localStorage.getItem('ym_token');
    
    if (!token) return;

    try {
        const response = await fetch(`https://www.call2all.co.il/ym/api/GetIncomingCalls?token=${token}`);
        const data = await response.json();

        if (window.checkSessionError && window.checkSessionError(data)) {
            return;
        }

        if (data.responseStatus === 'OK') {
            updateListenersUI(data);
        }
    } catch (error) {
        console.error("Error fetching listeners:", error);
    }
}

function updateListenersUI(data) {
    const countSpan = document.getElementById('listenersCountValue');
    const chip = document.getElementById('liveListenersCounter');
    const modalStatus = document.getElementById('modalTotalStatus');
    
    const count = data.callsCount || 0;

    if (countSpan && chip) {
        countSpan.innerText = count;
        
        if (count > 0) {
            chip.classList.add('active-calls');
            if (modalStatus) modalStatus.innerText = `פעילים: ${count}`;
        } else {
            chip.classList.remove('active-calls');
            if (modalStatus) modalStatus.innerText = 'אין שיחות פעילות';
        }
    }

    if (isListenersModalOpen) {
        const tbody = document.getElementById('listenersTableBody');
        if (data.calls && data.calls.length > 0) {
            renderListenersTable(data.calls);
        } else {
            tbody.innerHTML = `
                <tr class="empty-state-row">
                    <td colspan="6">
                        <div class="empty-state-content">
                            <i class="fas fa-phone-slash"></i>
                            <span>אין שיחות פעילות כרגע</span>
                        </div>
                    </td>
                </tr>`;
        }
    }

    if (typeof window.updateConfManagerUI === 'function') {
        window.updateConfManagerUI(data);
    }
}

function renderListenersTable(calls) {
    const tbody = document.getElementById('listenersTableBody');
    if (!tbody) return;

    let html = '';
    calls.forEach(call => {
        const duration = window.formatDuration(call.duration);
        const transferInfo = call.transferFrom ? call.transferFrom : '-';
        
        html += `
            <tr>
                <td class="col-duration"><span class="time-badge">${duration}</span></td>
                <td class="col-caller">${call.callerIdNum || '-'}</td>
                <td class="col-path" title="${call.path || ''}">${call.path || '-'}</td>
                <td class="col-did">${call.did || '-'}</td>
                <td class="col-id" title="${call.id || ''}">${call.id || '-'}</td>
                <td class="col-transfer">${transferInfo}</td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}

window.formatDuration = function(seconds) {
    if (!seconds && seconds !== 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function toggleListenersModal() {
    const modal = document.getElementById('listenersModal');
    isListenersModalOpen = !isListenersModalOpen;
    modal.style.display = isListenersModalOpen ? 'flex' : 'none';
    
    if (isListenersModalOpen) {
        window.fetchListenersData();
    }
}