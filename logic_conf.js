let selectedConfRoom = null;
let currentConfData = {};

// פונקציית החלפת הטאבים במסך הראשי
window.switchDashboardTab = function(tab) {
    document.querySelectorAll('.tab-item').forEach(el => el.classList.remove('active'));
    
    if(tab === 'fm') {
        document.getElementById('tab-fm').classList.add('active');
        document.getElementById('fm-view').style.display = 'flex';
        document.getElementById('conf-view').style.display = 'none';
    } else {
        document.getElementById('tab-conf').classList.add('active');
        document.getElementById('fm-view').style.display = 'none';
        document.getElementById('conf-view').style.display = 'flex';
    }
};

// נקרא אוטומטית בכל רענון של ה-Polling מתוך logic_listeners.js
window.updateConfManagerUI = function(data) {
    const confCalls = data.confCalls || {};
    currentConfData = confCalls;
    
    const roomIds = Object.keys(confCalls);
    const selectEl = document.getElementById('confRoomSelect');
    
    // אם אין חדרים פעילים
    if(roomIds.length === 0) {
        selectEl.innerHTML = '<option value="">אין חדרים פעילים</option>';
        document.getElementById('confTableBody').innerHTML = '<tr><td colspan="6" style="text-align:center; padding:30px; color:#999;">אין משתתפים בחדרי ועידה כעת.</td></tr>';
        selectedConfRoom = null;
        return;
    }

    // עדכון רשימת החדרים ב-Select (אם השתנה)
    let currentOptions = Array.from(selectEl.options).map(o => o.value);
    if (JSON.stringify(currentOptions) !== JSON.stringify(roomIds) || selectEl.options[0].value === "") {
        selectEl.innerHTML = '';
        roomIds.forEach(id => {
            const opt = document.createElement('option');
            opt.value = id;
            opt.innerText = id;
            selectEl.appendChild(opt);
        });
    }

    // בחירת החדר המוצג
    if(!selectedConfRoom || !confCalls[selectedConfRoom]) {
        selectedConfRoom = roomIds[0];
        selectEl.value = selectedConfRoom;
    } else if (selectEl.value !== selectedConfRoom) {
        selectEl.value = selectedConfRoom;
    }

    renderConfTable(confCalls[selectedConfRoom]);
};

window.changeConfRoom = function() {
    selectedConfRoom = document.getElementById('confRoomSelect').value;
    if(currentConfData[selectedConfRoom]) {
        document.getElementById('confTableBody').innerHTML = ''; // מחיקת הטבלה כדי להכריח רינדור מחדש מלא
        renderConfTable(currentConfData[selectedConfRoom]);
    }
};

// רינדור חכם (Diff) כדי למנוע הבהובים של הטבלה
function renderConfTable(participants) {
    const tbody = document.getElementById('confTableBody');
    if (!tbody) return;

    // מנקה את הודעת ה"אין משתתפים" אם היא שם
    if(tbody.querySelector('td[colspan]')) {
        tbody.innerHTML = '';
    }

    const existingRows = {};
    Array.from(tbody.children).forEach(tr => existingRows[tr.dataset.id] = tr);
    const newIds = new Set();

    participants.forEach(p => {
        newIds.add(p.id);
        if (existingRows[p.id]) {
            // עדכון שורה קיימת
            updateConfRow(existingRows[p.id], p);
        } else {
            // יצירת שורה חדשה
            tbody.appendChild(createConfRow(p));
        }
    });

    // מחיקת משתתפים שעזבו את החדר
    Object.keys(existingRows).forEach(id => {
        if (!newIds.has(id)) existingRows[id].remove();
    });
}

function createConfRow(p) {
    const tr = document.createElement('tr');
    tr.dataset.id = p.id;
    
    tr.innerHTML = `
        <td class="c-caller" style="font-weight:600;"></td>
        <td class="c-role"></td>
        <td class="c-dur" style="direction:ltr; text-align:right;"></td>
        <td class="c-mute"></td>
        <td class="c-hand" style="text-align: center;"></td>
        <td class="c-actions">
            <div class="conf-actions-col">
                <button class="conf-btn-mute btn-toggle-mute" title="השתק/בטל השתקה"></button>
                <button class="conf-btn-danger btn-kick" title="הוצא מחדר"><i class="fas fa-sign-out-alt"></i></button>
            </div>
        </td>
    `;
    
    // הצמדת מאזינים פעם אחת בלבד
    tr.querySelector('.btn-toggle-mute').addEventListener('click', () => {
        const isMuted = tr.dataset.mute === 'true';
        sendConfAction(isMuted ? 'unmute' : 'mute', p.id);
    });
    
    tr.querySelector('.btn-kick').addEventListener('click', () => {
        if(confirm('האם בטוח שברצונך להוציא את המשתמש מהחדר?')) sendConfAction('kick', p.id);
    });
    
    updateConfRow(tr, p);
    return tr;
}

function updateConfRow(tr, p) {
    // עדכון תכונות ב-DOM רק אם הן השתנו, כדי למנוע עומס ולהשאיר פוקוס תקין
    tr.dataset.mute = p.mute;
    
    const callerText = p.callerIdNum || 'לא ידוע';
    if(tr.querySelector('.c-caller').innerText !== callerText) tr.querySelector('.c-caller').innerText = callerText;
    
    const roleHtml = p.admin 
        ? '<span style="color:#e67e22; font-weight:bold; background:#fdf2e9; padding:2px 6px; border-radius:4px;"><i class="fas fa-star"></i> מנהל</span>' 
        : '<span style="color:#7f8c8d;">מאזין</span>';
    if(tr.querySelector('.c-role').innerHTML !== roleHtml) tr.querySelector('.c-role').innerHTML = roleHtml;
    
    // שימוש בפונקציית העיצוב הקיימת במערכת מתוך logic_listeners.js
    const durText = window.formatDuration ? window.formatDuration(p.duration) : p.duration;
    if(tr.querySelector('.c-dur').innerText !== durText) tr.querySelector('.c-dur').innerText = durText;
    
    const muteHtml = p.mute 
        ? '<span style="color:#e74c3c; font-weight:600;"><i class="fas fa-microphone-slash"></i> מושתק</span>' 
        : '<span style="color:#27ae60; font-weight:600;"><i class="fas fa-microphone"></i> פתוח</span>';
    if(tr.querySelector('.c-mute').innerHTML !== muteHtml) tr.querySelector('.c-mute').innerHTML = muteHtml;
    
    let handHtml = '-';
    if(p.hand) {
        handHtml = `<i class="fas fa-hand-paper fa-lg pulse-hand" title="לחץ כדי להוריד את היד" onclick="sendConfAction('lowerhand', '${p.id}')"></i>`;
    }
    if(tr.querySelector('.c-hand').innerHTML !== handHtml) tr.querySelector('.c-hand').innerHTML = handHtml;
    
    // עדכון אייקון הכפתור להשתקה/פתיחה
    const btnMute = tr.querySelector('.btn-toggle-mute');
    const newBtnHtml = p.mute ? '<i class="fas fa-microphone" style="color:#27ae60;"></i>' : '<i class="fas fa-microphone-slash" style="color:#e74c3c;"></i>';
    if(btnMute.innerHTML !== newBtnHtml) btnMute.innerHTML = newBtnHtml;
}

// שליחת פעולת ניהול לשרת API
window.sendConfAction = async function(action, ids) {
    const tokenInput = document.getElementById('current-token-display');
    const token = tokenInput ? tokenInput.value : localStorage.getItem('ym_token');
    if(!token) return;

    try {
        const url = `https://www.call2all.co.il/ym/api/CallAction?token=${token}&action=${action}&ids=${ids}`;
        const res = await fetch(url);
        const data = await res.json();
        
        if(data.responseStatus !== 'OK') {
            console.error("Conf Action failed", data);
            alert("פעולה נכשלה: " + (data.message || 'שגיאה לא ידועה'));
        } else {
            // מזרז רענון כדי שהשינוי יופיע מיד בלי להמתין לשנייה הבאה
            if(window.fetchListenersData) window.fetchListenersData();
        }
    } catch(e) {
        console.error(e);
        alert("שגיאת תקשורת עם השרת בעת הפעלת הפקודה.");
    }
};

// פעולות גורפות - מנצל את האופציה לשרשר מזהים (ids=X:Y:Z)
window.confActionBatch = function(action) {
    if(!selectedConfRoom || !currentConfData[selectedConfRoom]) return;
    const participants = currentConfData[selectedConfRoom];
    if(participants.length === 0) return;
    
    let targetIds = [];
    
    if(action === 'mute') {
        targetIds = participants.filter(p => !p.mute).map(p => p.id);
    } else if (action === 'unmute') {
        targetIds = participants.filter(p => p.mute).map(p => p.id);
    } else if (action === 'lowerhand') {
        targetIds = participants.filter(p => p.hand).map(p => p.id);
    }

    if(targetIds.length > 0) {
        sendConfAction(action, targetIds.join(':'));
    }
};