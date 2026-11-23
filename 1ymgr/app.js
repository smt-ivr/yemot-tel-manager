let rawData = [];
let filteredData = [];
let activeFilters = {}; // שומר את הערכים שנבחרו לסינון לכל עמודה
let currentToken = '';
let currentWath = '';

document.addEventListener('DOMContentLoaded', () => {
    initSystem();
    
    // סגירת תפריטי סינון בעת לחיצה מחוץ להם
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.filter-dropdown') && !e.target.closest('.filter-icon')) {
            closeAllFilterDropdowns();
        }
    });
});

function initSystem() {
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('token');
    const urlWath = urlParams.get('wath');

    if (urlToken && urlWath) {
        // שמירת פרמטרים חדשים - דורס את הישנים
        localStorage.setItem('ym_token', urlToken);
        localStorage.setItem('ym_wath', urlWath);
        currentToken = urlToken;
        currentWath = urlWath;
        cleanUrl();
        fetchData();
    } else {
        const storedToken = localStorage.getItem('ym_token');
        const storedWath = localStorage.getItem('ym_wath');
        
        if (storedToken && storedWath) {
            currentToken = storedToken;
            currentWath = storedWath;
            fetchData();
        } else {
            showState('no-params');
        }
    }
}

function reloadData() {
    if (currentToken && currentWath) {
        fetchData();
    } else {
        initSystem();
    }
}

async function fetchData() {
    showState('loading');
    const refreshIcon = document.getElementById('refreshIcon');
    if (refreshIcon) refreshIcon.classList.add('fa-spin-fast');

    const apiUrl = `https://www.call2all.co.il/ym/api/RenderYMGRFile?token=${currentToken}&wath=${currentWath}&convertType=json`;

    try {
        const response = await fetch(apiUrl);
        const textResponse = await response.text();
        
        let jsonResponse;
        try {
            jsonResponse = JSON.parse(textResponse);
        } catch (e) {
            throw new Error("התגובה שהתקבלה אינה בפורמט JSON תקין:\n" + textResponse);
        }

        if (jsonResponse.responseStatus === 'OK' && Array.isArray(jsonResponse.data)) {
            rawData = jsonResponse.data;
            activeFilters = {}; 
            document.getElementById('globalSearch').value = '';
            
            updateLastUpdateTime();
            applyAllFilters(); 
            showState('table');
        } else {
            showError(JSON.stringify(jsonResponse, null, 4));
        }
    } catch (error) {
        showError(error.message || error);
    } finally {
        if (refreshIcon) refreshIcon.classList.remove('fa-spin-fast');
    }
}

// מחיל את החיפוש החופשי והסינונים של העמודות במקביל
function applyAllFilters() {
    const searchTerm = document.getElementById('globalSearch').value.toLowerCase();
    
    filteredData = rawData.filter(row => {
        // 1. בדיקת סינוני עמודות (Excel filters)
        let passesColumnFilters = true;
        for (const col in activeFilters) {
            if (activeFilters[col] && activeFilters[col].length > 0) {
                const rowValue = String(row[col] || '');
                if (!activeFilters[col].includes(rowValue)) {
                    passesColumnFilters = false;
                    break;
                }
            }
        }
        if (!passesColumnFilters) return false;

        // 2. בדיקת חיפוש גלובלי
        if (searchTerm) {
            const rowString = Object.values(row).join(' ').toLowerCase();
            if (!rowString.includes(searchTerm)) {
                return false;
            }
        }
        
        return true;
    });

    renderTable();
}

// הפעלת החיפוש הגלובלי מתיבת הטקסט
function applyFilters() {
    applyAllFilters();
}

function renderTable() {
    const tableHead = document.getElementById('tableHead');
    const tableBody = document.getElementById('tableBody');
    const recordCount = document.getElementById('recordCount');

    if (rawData.length === 0) {
        tableHead.innerHTML = '';
        tableBody.innerHTML = '<tr><td class="text-center p-4">לא נמצאו נתונים להצגה בקובץ זה</td></tr>';
        recordCount.innerText = '0';
        return;
    }

    const headers = Object.keys(rawData[0]);
    
    // בניית כותרות
    let headerHtml = '<tr>';
    headers.forEach(col => {
        const isFiltered = activeFilters[col] && activeFilters[col].length > 0;
        const iconClass = isFiltered ? 'fa-solid fa-filter active' : 'fa-solid fa-filter';
        
        headerHtml += `
            <th>
                <div class="th-content" onclick="toggleFilterDropdown(event, '${col}')">
                    <span>${col}</span>
                    <i class="filter-icon ${iconClass}"></i>
                </div>
            </th>`;
    });
    headerHtml += '</tr>';
    tableHead.innerHTML = headerHtml;

    // בניית גוף הטבלה
    let bodyHtml = '';
    if (filteredData.length === 0) {
        bodyHtml = `<tr><td colspan="${headers.length}" class="text-center p-4">לא נמצאו רשומות התואמות לסינון</td></tr>`;
    } else {
        filteredData.forEach(row => {
            bodyHtml += '<tr>';
            headers.forEach(col => {
                bodyHtml += `<td>${row[col] || '-'}</td>`;
            });
            bodyHtml += '</tr>';
        });
    }
    tableBody.innerHTML = bodyHtml;
    recordCount.innerText = filteredData.length.toLocaleString();
}

// --- לוגיקת תפריטי סינון --- //

function toggleFilterDropdown(event, column) {
    event.stopPropagation();
    
    const existingDropdown = document.querySelector(`.filter-dropdown[data-column="${column}"]`);
    closeAllFilterDropdowns();
    if (existingDropdown) return;

    const uniqueValues = [...new Set(rawData.map(row => String(row[column] || '')))].sort();
    
    const dropdown = document.createElement('div');
    dropdown.className = 'filter-dropdown';
    dropdown.setAttribute('data-column', column);

    const searchDiv = document.createElement('div');
    searchDiv.className = 'filter-search';
    searchDiv.innerHTML = `<input type="text" placeholder="חפש ב${column}..." oninput="filterCheckboxList(this)">`;
    
    const listDiv = document.createElement('div');
    listDiv.className = 'filter-list';
    
    const isAllSelected = !activeFilters[column] || activeFilters[column].length === 0;
    listDiv.innerHTML += `
        <label class="filter-item" style="font-weight: 600; border-bottom: 1px solid #eee;">
            <input type="checkbox" class="select-all-cb" ${isAllSelected ? 'checked' : ''} onchange="toggleAllCheckboxes(this)">
            <span>(בחר הכל)</span>
        </label>`;

    uniqueValues.forEach(val => {
        const isChecked = isAllSelected || activeFilters[column].includes(val);
        const displayVal = val === '' ? '(ריק)' : val;
        listDiv.innerHTML += `
            <label class="filter-item val-item">
                <input type="checkbox" value="${val}" ${isChecked ? 'checked' : ''} onchange="updateSelectAllStatus(this)">
                <span>${displayVal}</span>
            </label>`;
    });

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'filter-actions';
    actionsDiv.innerHTML = `
        <button class="btn-apply-filter" onclick="applyColumnFilter('${column}', this)">אישור</button>
        <button class="btn-clear-filter" onclick="clearColumnFilter('${column}')">נקה</button>
    `;

    dropdown.appendChild(searchDiv);
    dropdown.appendChild(listDiv);
    dropdown.appendChild(actionsDiv);
    document.body.appendChild(dropdown);

    const rect = event.currentTarget.getBoundingClientRect();
    dropdown.style.top = `${rect.bottom + 5}px`;
    
    let leftPos = rect.left - (dropdown.offsetWidth / 2);
    if (leftPos < 10) leftPos = 10;
    dropdown.style.left = `${leftPos}px`;
}

function closeAllFilterDropdowns() {
    document.querySelectorAll('.filter-dropdown').forEach(el => el.remove());
}

function filterCheckboxList(input) {
    const term = input.value.toLowerCase();
    const items = input.closest('.filter-dropdown').querySelectorAll('.val-item');
    items.forEach(item => {
        const text = item.querySelector('span').innerText.toLowerCase();
        item.style.display = text.includes(term) ? 'flex' : 'none';
    });
}

function toggleAllCheckboxes(selectAllCb) {
    const list = selectAllCb.closest('.filter-list');
    const checkboxes = list.querySelectorAll('.val-item input[type="checkbox"]');
    checkboxes.forEach(cb => {
        if (cb.closest('.val-item').style.display !== 'none') {
            cb.checked = selectAllCb.checked;
        }
    });
}

function updateSelectAllStatus(cb) {
    const list = cb.closest('.filter-list');
    const selectAllCb = list.querySelector('.select-all-cb');
    const allCbs = Array.from(list.querySelectorAll('.val-item input[type="checkbox"]'));
    selectAllCb.checked = allCbs.every(c => c.checked);
}

function applyColumnFilter(column, btnElement) {
    const dropdown = btnElement.closest('.filter-dropdown');
    const selectAllCb = dropdown.querySelector('.select-all-cb');
    
    if (selectAllCb.checked) {
        delete activeFilters[column];
    } else {
        const checkedValues = [];
        dropdown.querySelectorAll('.val-item input[type="checkbox"]:checked').forEach(cb => {
            checkedValues.push(cb.value);
        });
        activeFilters[column] = checkedValues;
    }
    
    closeAllFilterDropdowns();
    applyAllFilters();
}

function clearColumnFilter(column) {
    delete activeFilters[column];
    closeAllFilterDropdowns();
    applyAllFilters();
}

// --- ניהול מערכת כללי --- //

function exportToExcel() {
    if (filteredData.length === 0) {
        alert("אין נתונים לייצוא");
        return;
    }
    const worksheet = XLSX.utils.json_to_sheet(filteredData);
    const workbook = XLSX.utils.book_new();
    if(!worksheet['!views']) worksheet['!views'] = [];
    worksheet['!views'].push({ rightToLeft: true });
    XLSX.utils.book_append_sheet(workbook, worksheet, "נתונים מסוננים");
    
    const now = new Date();
    const dateStr = now.toISOString().slice(0,10);
    const timeStr = now.getHours() + "-" + now.getMinutes();
    XLSX.writeFile(workbook, `Yemot_Data_${dateStr}_${timeStr}.xlsx`);
}

function updateLastUpdateTime() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
    document.getElementById('lastUpdate').innerText = timeString;
}

function cleanUrl() {
    const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
    window.history.replaceState({path: newUrl}, '', newUrl);
}

function showState(state) {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('no-params-msg').style.display = 'none';
    document.getElementById('error-box').style.display = 'none';
    document.getElementById('tableContainer').style.display = 'none';
    document.getElementById('topControls').style.display = 'none';

    if (state === 'loading') document.getElementById('loading').style.display = 'block';
    if (state === 'no-params') document.getElementById('no-params-msg').style.display = 'block';
    if (state === 'table') {
        document.getElementById('tableContainer').style.display = 'block';
        document.getElementById('topControls').style.display = 'flex';
    }
}

function showError(message) {
    showState('error');
    document.getElementById('error-box').style.display = 'block';
    document.getElementById('errorText').value = message;
}

function copyError() {
    const errorText = document.getElementById('errorText');
    errorText.select();
    navigator.clipboard.writeText(errorText.value).then(() => {
        alert('הודעת השגיאה הועתקה');
    });
}