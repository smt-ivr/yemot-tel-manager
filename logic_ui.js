// --- הגדרות תצוגה ---

const displayOrder = [
    "mainDid", "name", "email", "units", "resellerCreditFile", "systemSite", "ivrType"
];

// שדות שיוצגו בשורה העליונה (כל השאר ילכו למטה)
const topRowFields = ["mainDid", "name", "email", "units"];

const fieldConfig = {
    "mainDid": { label: "מערכת", icon: "fa-hashtag" },
    "name": { label: "לקוח", icon: "fa-user-circle" },
    "email": { label: "מייל", icon: "fa-envelope" },
    "units": { label: "יחידות", icon: "fa-coins" },
    "resellerCreditFile": { label: "משווק", icon: "fa-user-tie" },
    "systemSite": { label: "שרת", icon: "fa-server" },
    "ivrType": { label: "סוג מערכת", icon: "fa-sitemap" }
};

const IVR_TRANSLATIONS = {
    "CAMPAIGN": "חייגן קמפיינים",
    "EMERGENCY": "חייגן חירום",
    "WHATSAPP_PHONE": "וואצפון ישן",
    "QUEUE": "מערכת תור",
    "VIRTUAL_PLUS": "וירטואל פלוס",
    "WHATSAPP_PHONE_ADMIN": "וואצפון מנהלים",
    "NEW_WHATSAPP_PHONE": "וואצפון חדש",
    "DIAL_TO_SIP": "מערכת SIP",
    "IVR2": "IVR2"
};

const PASS_REASONS_HE = {
    "INACTIVE_SYSTEM": "מנוע האימות לא פעיל",
    "WAIT_TO_BLOCK_DATE": "תאריך אכיפה טרם הגיע",
    "INIT_WHITELIST_IPS": "כתובת IP ברשימה לבנה",
    "INIT_MASTER_LOGIN_WHITELIST_IPS": "כתובת I.P מאסטר ברשימה לבנה",
    "HAVE_ACTIVE_TRUST_TOKEN": "אסימון 'זכור אותי'",
    "INHERITED_FROM_ORIGINAL_SESSION": "ירושה מסשן קודם",
    "MFA_PASSED": "בוצע אימות בפועל",
    "SPECIAL_VALID_TOKEN": "פטור מאימות מיוחד",
    "FOR_FIREWALL_TOKEN": "טוקן חומת אש",
    "IS_CUSTOMER_AUTH_TOKEN": "מפתח גישה קבוע",
    "API_SKIP_FOR_MFA": "עדיין אין אכיפת אימות בAPI"
};

// --- פונקציות פורמט ---
function formatExpiryDate(dateStr) {
    if (!dateStr) return { text: "", isExpired: false, relative: "" };
    const dateObj = new Date(dateStr);
    if (isNaN(dateObj.getTime())) return { text: dateStr, isExpired: false, relative: "" };

    const now = new Date();
    now.setHours(0,0,0,0);
    const compareDate = new Date(dateObj);
    compareDate.setHours(0,0,0,0);

    const isExpired = compareDate < now;
    const formattedDate = dateObj.toLocaleDateString('he-IL');
    const diffTime = Math.abs(compareDate - now);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    let relativeText = "";

    if (isExpired) relativeText = "(פג תוקף)";
    else {
        if (diffDays === 0) relativeText = "(היום)";
        else if (diffDays === 1) relativeText = "(מחר)";
        else relativeText = `(פג עוד ${diffDays} ימים)`;
    }
    return { display: formattedDate, relative: relativeText, isExpired: isExpired };
}

// --- פונקציה ראשית ---
function initDashboardUI(userData, token, authData) {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('dashboard-screen').style.display = 'flex';

    // ניקוי הקונטיינרים
    const rowTop = document.getElementById('header-row-top');
    const rowBottom = document.getElementById('header-row-bottom');
    rowTop.innerHTML = ""; 
    rowBottom.innerHTML = ""; 

    displayOrder.forEach(key => {
        if (userData[key] === undefined && key !== 'units') return;
        const config = fieldConfig[key];
        let displayValue = userData[key];
        let extraClass = "";
        let extraHtml = "";

        if (key === "units") {
            const amount = userData['units'] || 0;
            const dateStr = userData['unitsExpireDate'];
            const formattedAmount = parseFloat(amount).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            
            if (dateStr) {
                const dateData = formatExpiryDate(dateStr);
                if (dateData.isExpired) {
                    extraHtml = `<span class="sep">|</span><i class="fas fa-times-circle text-danger"></i> <span class="text-danger">${dateData.display}</span>`;
                } else {
                    extraHtml = `<span class="sep">|</span><span>${dateData.display}</span> <span style="font-size:0.75em; opacity:0.8">${dateData.relative}</span>`;
                }
            }
            displayValue = formattedAmount;
        } else if (key === "ivrType") {
            displayValue = IVR_TRANSLATIONS[displayValue] || displayValue;
        }

        const itemHtml = `
            <div class="detail-chip ${extraClass}" title="${config.label}">
                <i class="fas ${config.icon} detail-icon"></i>
                <span class="detail-label">${config.label}:</span>
                <span class="detail-value">${displayValue}</span>
                ${extraHtml}
            </div>
        `;

        // מיון לשורה המתאימה
        if (topRowFields.includes(key)) {
            rowTop.innerHTML += itemHtml;
        } else {
            rowBottom.innerHTML += itemHtml;
        }
    });

    document.getElementById('current-token-display').value = token;

    // 2. עדכון צד שמאל (פרטי אימות)
    updateAuthSidePanel(authData);

    // 3. טעינת לוגו משווק
    if (userData.resellerCreditFile) {
        loadResellerLogo(userData.resellerCreditFile);
    }
}

async function loadResellerLogo(resellerName) {
    try {
        const url = `https://www.call2all.co.il/ym/misc/GetImgReseller.php?Reseller=${encodeURIComponent(resellerName)}`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.YemotShApi === "OK" && data.url) {
            let imgUrl = data.url;
            if (!imgUrl.startsWith('http://') && !imgUrl.startsWith('https://')) {
                imgUrl = 'https://' + imgUrl;
            }
            
            const placeholder = document.getElementById('reseller-logo-placeholder');
            if (placeholder) {
                const img = document.createElement('img');
                img.src = imgUrl;
                img.className = 'reseller-logo-img';
                
                if (data.width) img.style.width = data.width;
                if (data.height) img.style.height = data.height;
                
                // חסימה נוספת למניעת גרירה ולחיצה ימנית (בנוסף ל-CSS)
                img.draggable = false;
                img.oncontextmenu = function() { return false; };
                
                placeholder.innerHTML = '';
                placeholder.appendChild(img);
            }
        }
    } catch (e) {
        // התעלמות משגיאות רשת - במקרה כזה הלוגו פשוט לא יוצג
    }
}

function updateAuthSidePanel(authData) {
    // סיבת אימות
    const reasonText = PASS_REASONS_HE[authData.reason] || authData.reason || "לא ידוע";
    document.getElementById('auth-reason-text').innerText = reasonText;
    document.getElementById('auth-reason-badge').style.display = 'flex';

    // סטטוס סשן (קשיח)
    const sessionBadge = document.getElementById('auth-session-status');
    
    if (authData.isSession === "UNKNOWN_TOKEN_DETAILS") {
        sessionBadge.innerHTML = '<i class="fas fa-info-circle"></i> לא ניתן לקבל פרטי טוקן';
        sessionBadge.className = 'session-badge unverified';
    } else if (authData.isSession === true) {
        // מאומת קשיח
        sessionBadge.innerHTML = '<i class="fas fa-lock"></i> מאומת קשיח';
        sessionBadge.className = 'session-badge verified';
    } else {
        // לא מאומת קשיח (למשל זכור אותי)
        sessionBadge.innerHTML = `
            <i class="fas fa-unlock"></i> אינו מאומת קשיח
            <button class="reauth-link" onclick="triggerManualReAuth()">בצע אימות</button>
        `;
        sessionBadge.className = 'session-badge unverified';
    }
    sessionBadge.style.display = 'flex'; // שינוי ל-flex כדי שיתאים לקופסה החדשה
}


// --- עזרים ---
function switchTab(mode) {
    document.querySelectorAll('.tab-link').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    document.getElementById('user-pass-form').style.display = (mode === 'user-pass') ? 'block' : 'none';
    document.getElementById('token-mode-form').style.display = (mode === 'token-mode') ? 'block' : 'none';
    
    // איפוס הודעות והצגת טקסט ברירת מחדל מתאים
    setDefaultStatusMsg(mode);
}

function setDefaultStatusMsg(mode) {
    const statusEl = document.getElementById('login-status');
    const txtEl = document.getElementById('login-status-text');
    
    statusEl.className = 'status-msg default';
    statusEl.style.visibility = 'visible';
    
    if (mode === 'token-mode') {
        txtEl.innerText = 'יש להכניס טוקן';
    } else {
        txtEl.innerText = 'יש להכניס פרטי מערכת';
    }
}

function toggleTokenVisibility() {
    const input = document.getElementById('current-token-display');
    const btnIcon = event.currentTarget.querySelector('i');
    const isPass = input.type === "password";
    input.type = isPass ? "text" : "password";
    btnIcon.className = isPass ? "fas fa-eye-slash" : "fas fa-eye";
}

function copyTokenToClipboard() {
    const token = document.getElementById('current-token-display').value;
    if(!token) return;
    navigator.clipboard.writeText(token).then(() => {
        const btn = event.currentTarget;
        const icon = btn.querySelector('i');
        const oldClass = icon.className;
        icon.className = "fas fa-check text-success";
        setTimeout(() => icon.className = oldClass, 1500);
    });
}

function showLoginScreen() {
    document.getElementById('dashboard-screen').style.display = 'none';
    document.getElementById('login-screen').style.display = 'flex';
    // איפוס לטקסט ברירת מחדל של מסך מנוי
    setDefaultStatusMsg('user-pass');
}