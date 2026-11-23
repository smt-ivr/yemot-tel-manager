const FM_CONFIG = {
    apiBase: 'https://call2all.co.il/ym/api/',
    token: '',
    currentPath: '/',
};

let extTranslations = {};

const els = {
    container: document.getElementById('fmContainer'),
    breadcrumbs: document.getElementById('fmBreadcrumbs'),
    loader: document.getElementById('fmLoader'),
    refreshBtn: document.getElementById('refreshBtn'),
    // Editor
    modal: document.getElementById('editorModal'),
    xCloseBtn: document.getElementById('xCloseBtn'),
    closeBtn: document.getElementById('closeEditorBtn'),
    saveBtn: document.getElementById('saveEditorBtn'),
    editorContent: document.getElementById('editorContent'),
    editorFileName: document.getElementById('editorFileName'),
    // Audio
    audioModal: document.getElementById('audioModal'),
    audioPlayer: document.getElementById('audioPlayer'),
    audioFileName: document.getElementById('audioFileName'),
    xCloseAudioBtn: document.getElementById('xCloseAudioBtn'),
    downloadAudioBtn: document.getElementById('downloadAudioBtn'),
    audioPlayerLoader: document.getElementById('audioPlayerLoader'),
    // YMGR
    ymgrModal: document.getElementById('ymgrModal'),
    ymgrTableContainer: document.getElementById('ymgrTableContainer'),
    ymgrSearchInput: document.getElementById('ymgrSearchInput'),
    ymgrRowCount: document.getElementById('ymgrRowCount'),
    ymgrFilePathDisplay: document.getElementById('ymgrFilePathDisplay'),
    xCloseYmgrBtn: document.getElementById('xCloseYmgrBtn'),
    closeYmgrBtn: document.getElementById('closeYmgrBtn')
};

let currentEditingFile = null;
let currentYmgrFile = null;

document.addEventListener('DOMContentLoaded', () => {
    if(els.refreshBtn) els.refreshBtn.addEventListener('click', () => loadDirectory(FM_CONFIG.currentPath));
    
    // Editor Events
    if(els.xCloseBtn) els.xCloseBtn.addEventListener('click', closeModal);
    if(els.closeBtn) els.closeBtn.addEventListener('click', closeModal);
    if(els.saveBtn) els.saveBtn.addEventListener('click', saveFileChanges);
    
    // Audio Events
    if(els.xCloseAudioBtn) els.xCloseAudioBtn.addEventListener('click', closeAudioModal);
    
    // YMGR Events - (הוספנו גם ב-HTML, אבל שומרים גם כאן לגיבוי)
    if(els.xCloseYmgrBtn) els.xCloseYmgrBtn.addEventListener('click', closeYmgrModal);
    if(els.closeYmgrBtn) els.closeYmgrBtn.addEventListener('click', closeYmgrModal);
});

async function loadTranslationsFile() {
    try {
        const response = await fetch('translations.json');
        if (response.ok) {
            extTranslations = await response.json();
        }
    } catch (error) {
        console.warn('translations.json load error:', error);
    }
}

window.initFileManager = async function(token) {
    if(!token) return;
    FM_CONFIG.token = token;
    await loadTranslationsFile();
    loadDirectory('/');
};

async function loadDirectory(path) {
    FM_CONFIG.currentPath = path;
    showMainLoader(true);
    updateBreadcrumbs(path);
    els.container.innerHTML = '';

    try {
        const url = `${FM_CONFIG.apiBase}GetIVR2Dir?token=${FM_CONFIG.token}&path=${encodeURIComponent(path)}`;
        const response = await fetch(url);
        const data = await response.json();

        if (window.checkSessionError && window.checkSessionError(data)) {
            showMainLoader(false);
            return;
        }

        if (data.responseStatus === 'OK') {
            if (window.fmOnDirLoaded) window.fmOnDirLoaded(path, data);
            renderFiles(data.dirs, data.files, data.ini);
        } else {
            els.container.innerHTML = `<div style="text-align:center; padding:20px;">שגיאה: ${data.message || 'לא ניתן לטעון נתונים'}</div>`;
        }
    } catch (error) {
        console.error(error);
        els.container.innerHTML = `<div style="text-align:center; padding:20px;">שגיאת תקשורת</div>`;
    } finally {
        showMainLoader(false);
    }
}

function renderFiles(dirs, files, iniFiles) {
    els.container.innerHTML = '';

    if (dirs) {
        dirs.forEach(dir => {
            const card = createCard('folder', dir.name, dir.path, dir);
            card.addEventListener('click', () => loadDirectory(dir.path));
            els.container.appendChild(card);
        });
    }

    if (files) {
        files.forEach(file => processFile(file));
    }

    if (iniFiles) {
        iniFiles.forEach(file => processFile(file));
    }

    if ((!dirs || dirs.length === 0) && (!files || files.length === 0) && (!iniFiles || iniFiles.length === 0)) {
        els.container.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:#999; padding:40px;">התיקייה ריקה</div>';
    }
}

function processFile(file) {
    let type = 'unknown';
    const name = file.name.toLowerCase();
    
    if (name.endsWith('.wav') || name.endsWith('.mp3') || name.endsWith('.ogg')) {
        type = 'audio';
    } else if (name.endsWith('.ymgr')) {
        type = 'ymgr';
    } else if (name.endsWith('.txt') || name.endsWith('.ini') || name.endsWith('.tts')) {
        type = 'text';
    }

    const card = createCard(type, file.name, file.path, file);
    
    if (type === 'audio') {
        card.addEventListener('click', () => playAudioFile(file));
        const txtPath = file.path.substring(0, file.path.lastIndexOf('.')) + '.txt';
        addEditButton(card, txtPath, 'ערוך פרטים');

    } else if (type === 'ymgr') {
        card.addEventListener('click', () => openYmgrViewer(file, card));
        addEditButton(card, file.path, 'ערוך קובץ');

    } else if (type === 'text') {
        card.addEventListener('click', () => openEditor(file.path, card));
        addEditButton(card, file.path, 'ערוך קובץ');
    }

    els.container.appendChild(card);
}

function createCard(type, name, path, meta = null) {
    const div = document.createElement('div');
    div.className = `fm-item ${type}`;
    
    let iconHTML = '<i class="fas fa-file"></i>';
    
    if (type === 'folder') {
        if (meta && meta.extType) {
            iconHTML = '<i class="fas fa-layer-group"></i>';
        } else {
            iconHTML = '<i class="fas fa-folder"></i>';
        }
    } else if (type === 'audio') {
        iconHTML = '<i class="fas fa-volume-up"></i>';
    } else if (type === 'ymgr') {
        iconHTML = '<i class="fas fa-table"></i>';
    } else if (type === 'text') {
        if(name.endsWith('.ini')) iconHTML = '<i class="fas fa-sliders-h"></i>';
        else if(name.endsWith('.tts')) iconHTML = '<i class="fas fa-microphone-alt"></i>';
        else iconHTML = '<i class="fas fa-file-alt"></i>';
    }

    let extraInfo = '';
    if (meta) {
        if (type === 'folder') {
            let extType = meta.extType;
            if ((!extType && meta.fileType === 'DIR') || extType === 'DIR') {
                extType = 'תיקייה';
            }
            
            let displayType = extType;
            if (extType && extTranslations[extType.toLowerCase()]) {
                displayType = extTranslations[extType.toLowerCase()];
            }

            if (displayType) {
                extraInfo += `<div class="fm-extra-tag type">${displayType}</div>`;
            }
            if (meta.extTitle) {
                extraInfo += `<div class="fm-extra-tag title">${meta.extTitle}</div>`;
            }
        } else {
            extraInfo += `<div class="fm-meta">${formatSize(meta.size)}</div>`;
            if (meta.mtime) {
                extraInfo += `<div class="fm-date" title="תאריך עדכון אחרון"><i class="far fa-clock"></i> ${meta.mtime}</div>`;
            }
        }
    }

    div.innerHTML = `
        <div class="fm-item-icon-area">${iconHTML}</div>
        <div class="fm-item-details">
            <div class="fm-name" title="${name}">${name}</div>
            ${extraInfo}
        </div>
    `;

    // נתונים עבור פעולות הקבצים (בחירה, העתקה, גזירה וכו') - logic_fm_actions.js
    div.dataset.path = path;
    div.dataset.name = name;
    div.dataset.kind = type === 'folder' ? 'dir' : 'file';
    if (window.fmDecorateCard) window.fmDecorateCard(div);

    return div;
}

function addEditButton(card, path, title) {
    const actionBar = document.createElement('div');
    actionBar.className = 'fm-action-bar';
    
    const btn = document.createElement('button');
    btn.className = 'edit-file-btn';
    btn.innerHTML = `<i class="fas fa-pen"></i> ${title}`;
    btn.onclick = (e) => {
        e.stopPropagation();
        openEditor(path, card);
    };
    
    actionBar.appendChild(btn);
    card.appendChild(actionBar);
}

// --- YMGR Viewer Functions ---

window.closeYmgrModal = function() {
    const modal = document.getElementById('ymgrModal');
    if (modal) modal.classList.add('hidden');
    
    const container = document.getElementById('ymgrTableContainer');
    if (container) container.innerHTML = '';
    
    currentYmgrFile = null;
};

async function openYmgrViewer(file, cardElement) {
    if (cardElement) toggleCardLoader(cardElement, true);
    else showMainLoader(true);

    const fullPath = file.path.startsWith('ivr2:') ? file.path : `ivr2:${file.path}`;
    currentYmgrFile = { ...file, fullPath: fullPath };

    try {
        const url = `${FM_CONFIG.apiBase}RenderYMGRFile?token=${FM_CONFIG.token}&wath=${encodeURIComponent(fullPath)}&convertType=json`;
        const response = await fetch(url);
        const jsonData = await response.json();

        if (window.checkSessionError && window.checkSessionError(jsonData)) {
            if (cardElement) toggleCardLoader(cardElement, false);
            else showMainLoader(false);
            return;
        }

        if (jsonData.responseStatus === 'OK') {
            renderYmgrTable(jsonData.data);
            els.ymgrFilePathDisplay.innerText = fullPath;
            els.ymgrModal.classList.remove('hidden');
        } else {
            alert('שגיאה בטעינת קובץ YMGR: ' + (jsonData.message || ''));
        }
    } catch (error) {
        console.error('YMGR Error:', error);
        alert('שגיאת תקשורת בטעינת הקובץ');
    } finally {
        if (cardElement) toggleCardLoader(cardElement, false);
        else showMainLoader(false);
    }
}

window.refreshYmgrTable = async function() {
    if(!currentYmgrFile) return;
    const btn = event.currentTarget;
    const originalHTML = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> מרענן...';
    btn.disabled = true;

    try {
        const url = `${FM_CONFIG.apiBase}RenderYMGRFile?token=${FM_CONFIG.token}&wath=${encodeURIComponent(currentYmgrFile.fullPath)}&convertType=json`;
        const response = await fetch(url);
        const jsonData = await response.json();
        
        if (window.checkSessionError && window.checkSessionError(jsonData)) {
            btn.innerHTML = originalHTML;
            btn.disabled = false;
            return;
        }

        if (jsonData.responseStatus === 'OK') renderYmgrTable(jsonData.data);
        else alert('שגיאה ברענון: ' + jsonData.message);
    } catch(e) {
        console.error(e);
        alert('שגיאת תקשורת');
    } finally {
        btn.innerHTML = originalHTML;
        btn.disabled = false;
    }
};

function renderYmgrTable(data) {
    els.ymgrTableContainer.innerHTML = '';
    els.ymgrSearchInput.value = '';
    if (!data || data.length === 0) {
        els.ymgrTableContainer.innerHTML = '<div class="empty-state">אין נתונים בקובץ</div>';
        els.ymgrRowCount.innerText = 'סה"כ שורות: 0';
        return;
    }
    const table = document.createElement('table');
    table.className = 'ymgr-table';
    const headers = Object.keys(data[0]); 
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const thNum = document.createElement('th');
    thNum.innerText = '#';
    thNum.style.width = '50px';
    headerRow.appendChild(thNum);
    headers.forEach(key => {
        const th = document.createElement('th');
        th.innerText = key;
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    tbody.id = 'ymgrTableBody';
    data.forEach((row, index) => {
        const tr = document.createElement('tr');
        const tdNum = document.createElement('td');
        tdNum.innerText = index + 1;
        tr.appendChild(tdNum);
        headers.forEach(key => {
            const td = document.createElement('td');
            td.innerText = row[key] || ''; 
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    els.ymgrTableContainer.appendChild(table);
    els.ymgrRowCount.innerText = `סה"כ שורות: ${data.length}`;
}

window.filterYmgrTable = function() {
    const input = els.ymgrSearchInput.value.toLowerCase();
    const rows = document.getElementById('ymgrTableBody').getElementsByTagName('tr');
    let visibleCount = 0;
    for (let i = 0; i < rows.length; i++) {
        const text = rows[i].textContent.toLowerCase();
        if (text.indexOf(input) > -1) {
            rows[i].style.display = "";
            visibleCount++;
        } else {
            rows[i].style.display = "none";
        }
    }
    els.ymgrRowCount.innerText = `נמצאו ${visibleCount} מתוך ${rows.length} שורות`;
};

window.downloadYmgrFile = async function(type) {
    if (!currentYmgrFile) return;
    const btn = event.currentTarget;
    const originalContent = btn.innerHTML;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> מכין...`;
    btn.disabled = true;
    try {
        const url = `${FM_CONFIG.apiBase}RenderYMGRFile?token=${FM_CONFIG.token}&wath=${encodeURIComponent(currentYmgrFile.fullPath)}&convertType=${type}`;
        const response = await fetch(url);
        
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
            const data = await response.json();
            if (window.checkSessionError && window.checkSessionError(data)) {
                btn.innerHTML = originalContent;
                btn.disabled = false;
                return;
            }
        }

        if (!response.ok) throw new Error('Network response was not ok');
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const downloadLink = document.createElement('a');
        downloadLink.href = blobUrl;
        
        let cleanName = currentYmgrFile.fullPath.replace(/^ivr2:/, '').replace(/[\/\\]/g, '_');
        cleanName = cleanName.replace(/\.ymgr$/i, '') + '.' + type;
        
        downloadLink.setAttribute('download', cleanName);
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        URL.revokeObjectURL(blobUrl);
    } catch (error) {
        console.error('Download Error:', error);
        alert('שגיאה בהורדת הקובץ');
    } finally {
        btn.innerHTML = originalContent;
        btn.disabled = false;
    }
};

window.printYmgrTable = function() {
    if (!els.ymgrTableContainer.innerHTML) return;
    const win = window.open('', '_blank', 'height=800,width=1200');
    const content = els.ymgrTableContainer.innerHTML;
    const title = els.ymgrFilePathDisplay.innerText;
    const html = `
    <html lang="he" dir="rtl">
    <head>
        <title>הדפסת נתונים - ${title}</title>
        <style>
            body { font-family: 'Assistant', sans-serif; direction: rtl; padding: 20px; }
            h2 { text-align: center; color: #333; margin-bottom: 20px; direction: ltr; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #ccc; padding: 6px; text-align: right; }
            th { background-color: #f0f0f0; font-weight: bold; }
            tr:nth-child(even) { background-color: #fafafa; }
            @media print {
                @page { size: landscape; margin: 1cm; }
                body { padding: 0; }
                table { page-break-inside: auto; }
                tr { page-break-inside: avoid; page-break-after: auto; }
                thead { display: table-header-group; }
                tfoot { display: table-footer-group; }
            }
        </style>
    </head>
    <body>
        <h2>${title}</h2>
        ${content}
        <script>window.onload = function() { window.print(); window.close(); }</script>
    </body>
    </html>`;
    win.document.write(html);
    win.document.close();
};

// --- Audio Player Logic ---
async function playAudioFile(file) {
    els.audioFileName.innerText = file.name;
    els.audioModal.classList.remove('hidden');
    
    // מצב טעינה
    els.audioPlayer.style.display = 'none';
    els.audioPlayerLoader.classList.remove('hidden');
    els.audioPlayer.src = ''; 
    els.downloadAudioBtn.style.display = 'none';

    const fullPath = file.path.startsWith('ivr2:') ? file.path : `ivr2:${file.path}`;

    try {
        const url = `${FM_CONFIG.apiBase}DownloadFile?token=${FM_CONFIG.token}&path=${encodeURIComponent(fullPath)}`;
        const response = await fetch(url);
        
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
            const data = await response.json();
            if (window.checkSessionError && window.checkSessionError(data)) {
                els.audioPlayerLoader.classList.add('hidden');
                return;
            }
        }

        if (!response.ok) throw new Error('Network response was not ok');
        
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        
        els.audioPlayer.src = blobUrl;
        els.audioFileName.innerText = file.name;
        els.downloadAudioBtn.href = blobUrl;
        els.downloadAudioBtn.setAttribute('download', file.name);
        
        // סיום טעינה
        els.audioPlayerLoader.classList.add('hidden');
        els.audioPlayer.style.display = 'block';
        els.downloadAudioBtn.style.display = 'inline-flex';

        await els.audioPlayer.play();

    } catch (error) {
        console.error('Audio load error:', error);
        els.audioFileName.innerText = "שגיאה בטעינת הקובץ";
        els.audioPlayerLoader.classList.add('hidden');
    }
}

function closeAudioModal() {
    els.audioPlayer.pause();
    els.audioPlayer.src = '';
    els.audioModal.classList.add('hidden');
}

// --- Editor Logic ---
function toggleCardLoader(cardElement, show) {
    if (!cardElement) return;
    if (show) {
        if (cardElement.querySelector('.fm-card-loader')) return;
        const loader = document.createElement('div');
        loader.className = 'fm-card-loader';
        loader.innerHTML = `<div class="spinner"></div>`;
        cardElement.appendChild(loader);
    } else {
        const loader = cardElement.querySelector('.fm-card-loader');
        if (loader) loader.remove();
    }
}

async function openEditor(filePath, cardElement) {
    if (cardElement) toggleCardLoader(cardElement, true);
    else showMainLoader(true);

    const fullPath = filePath.startsWith('ivr2:') ? filePath : `ivr2:${filePath}`;

    try {
        const url = `${FM_CONFIG.apiBase}GetTextFile?token=${FM_CONFIG.token}&what=${encodeURIComponent(fullPath)}`;
        const response = await fetch(url);
        const data = await response.json();

        if (window.checkSessionError && window.checkSessionError(data)) {
            if (cardElement) toggleCardLoader(cardElement, false);
            else showMainLoader(false);
            return;
        }

        if (data.responseStatus === 'OK') {
            currentEditingFile = fullPath;
            els.editorFileName.value = fullPath;
            els.editorContent.value = data.contents || '';
            els.modal.classList.remove('hidden');
        } else {
            if(confirm('הקובץ לא קיים או ריק. האם ליצור אותו?')) {
                currentEditingFile = fullPath;
                els.editorFileName.value = fullPath;
                els.editorContent.value = '';
                els.modal.classList.remove('hidden');
            }
        }
    } catch (error) {
        console.error(error);
        alert('שגיאה בטעינת הקובץ');
    } finally {
        if (cardElement) toggleCardLoader(cardElement, false);
        else showMainLoader(false);
    }
}

async function saveFileChanges() {
    if (!currentEditingFile) return;
    
    if (!confirm("האם אתה בטוח שברצונך לשמור את השינויים?\n\nשים לב: פעולה זו תחליף את תוכן הקובץ הקיים בשרת ולא ניתן יהיה לשחזר אותו.")) {
        return;
    }

    const content = els.editorContent.value;
    const originalText = els.saveBtn.innerHTML;
    els.saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> שומר...';
    els.saveBtn.disabled = true;

    try {
        const formData = new URLSearchParams();
        formData.append('token', FM_CONFIG.token);
        formData.append('what', currentEditingFile);
        formData.append('contents', content);

        const response = await fetch(`${FM_CONFIG.apiBase}UploadTextFile`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
            body: formData
        });

        const data = await response.json();

        if (window.checkSessionError && window.checkSessionError(data)) {
            els.saveBtn.innerHTML = originalText;
            els.saveBtn.disabled = false;
            return;
        }

        if (data.responseStatus === 'OK') {
            closeModal();
        } else {
            alert('שגיאה בשמירה: ' + data.message);
        }
    } catch (error) {
        console.error(error);
        alert('שגיאת תקשורת בשמירת הקובץ');
    } finally {
        els.saveBtn.innerHTML = originalText;
        els.saveBtn.disabled = false;
    }
}

function closeModal() {
    els.modal.classList.add('hidden');
    currentEditingFile = null;
    els.editorContent.value = '';
}

function showMainLoader(show) {
    if(show) els.loader.classList.remove('hidden');
    else els.loader.classList.add('hidden');
}

function updateBreadcrumbs(path) {
    const parts = path.split('/').filter(p => p);
    let html = `<span class="crumb root" onclick="loadDirectory('/')"><i class="fas fa-home"></i> ראשי</span>`;
    let currentPath = '';
    parts.forEach((part) => {
        currentPath += '/' + part;
        html += `<span class="sep">/</span><span class="crumb" onclick="loadDirectory('${currentPath}')">${part}</span>`;
    });
    els.breadcrumbs.innerHTML = html;
}

function formatSize(bytes) {
    if (bytes === 0 || !bytes) return '';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}