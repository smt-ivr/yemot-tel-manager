const API_BASE = "https://www.call2all.co.il/ym/api";

const PASS_REASONS = {
    "INACTIVE_SYSTEM": "מנוע האימות לא פעיל",
    "WAIT_TO_BLOCK_DATE": "תאריך אכיפה טרם הגיע",
    "INIT_WHITELIST_IPS": "IP ברשימה לבנה",
    "INIT_MASTER_LOGIN_WHITELIST_IPS": "IP מאסטר ברשימה לבנה",
    "HAVE_ACTIVE_TRUST_TOKEN": "בוצע זיהוי 'זכור אותי'",
    "INHERITED_FROM_ORIGINAL_SESSION": "ירושה מסשן קודם",
    "MFA_PASSED": "אומת בהצלחה",
    "SPECIAL_VALID_TOKEN": "פטור מאימות מיוחד",
    "FOR_FIREWALL_TOKEN": "טוקן חומת אש",
    "IS_CUSTOMER_AUTH_TOKEN": "מפתח גישה קבוע",
    "API_SKIP_FOR_MFA": "דילוג אימות API"
};

let pollingInterval = null;
let currentUserToken = null; 

// משתני סשן גלובליים
window.isSessionExpired = false;

window.triggerSessionExpired = function() {
    if (window.isSessionExpired) return;
    window.isSessionExpired = true;
    
    // עצירת מאזינים
    if (window.listenersInterval) {
        clearInterval(window.listenersInterval);
    }
    
    const modal = document.getElementById('session-expired-modal');
    if (modal) modal.style.display = 'flex';
};

window.closeSessionExpiredModal = function() {
    const modal = document.getElementById('session-expired-modal');
    if (modal) modal.style.display = 'none';
};

window.checkSessionError = function(data) {
    if (data && data.responseStatus === 'FORBIDDEN' && data.message === 'session is inactive') {
        window.triggerSessionExpired();
        return true;
    }
    return false;
};

window.onload = function() {
    const userField = document.getElementById('username');
    const passField = document.getElementById('password');
    const tokenField = document.getElementById('manual-token');

    if(userField) {
        userField.addEventListener('keydown', function(e) {
            if(e.key === 'Enter') { e.preventDefault(); passField.focus(); }
        });
    }
    
    if(passField) {
        passField.addEventListener('keydown', function(e) {
            if(e.key === 'Enter') { e.preventDefault(); performLogin(); }
        });
    }

    if(tokenField) {
        tokenField.addEventListener('keydown', function(e) {
            if(e.key === 'Enter') { e.preventDefault(); loginWithTokenInput(); }
        });
    }

    initAutoLogin(); 
};

function switchTab(tabName) {
    const userForm = document.getElementById('user-pass-form');
    const tokenForm = document.getElementById('token-mode-form');
    const tabUser = document.getElementById('tab-user-pass');
    const tabToken = document.getElementById('tab-token');
    
    const status = document.getElementById('login-status');
    const txtEl = document.getElementById('login-status-text');
    status.className = 'status-msg default';
    status.style.visibility = 'visible';

    if(tabName === 'user-pass') {
        userForm.style.display = 'block';
        tokenForm.style.display = 'none';
        tabUser.classList.add('active');
        if(tabToken) tabToken.classList.remove('active');
        txtEl.innerText = 'יש להכניס פרטי מערכת';
        setTimeout(() => document.getElementById('username').focus(), 50);
    } else {
        userForm.style.display = 'none';
        tokenForm.style.display = 'block';
        tabUser.classList.remove('active');
        if(tabToken) tabToken.classList.add('active');
        txtEl.innerText = 'יש להכניס טוקן להתחברות';
        setTimeout(() => document.getElementById('manual-token').focus(), 50);
    }
}

function initAutoLogin() {
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('token');
    const urlUser = urlParams.get('username') || urlParams.get('user');
    const urlPass = urlParams.get('password') || urlParams.get('pass');

    if (urlToken || urlUser || urlPass) {
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    if (urlUser) document.getElementById('username').value = urlUser;
    if (urlPass) document.getElementById('password').value = urlPass;
    if (urlToken) {
        document.getElementById('manual-token').value = urlToken;
        switchTab('token-mode');
    }

    if (urlToken) {
        verifyAndLogin(urlToken, false, true); 
        return; 
    } else if (urlUser && urlPass) {
        performLogin(true);
        return; 
    }

    const savedToken = window.accountsGetActiveToken ? window.accountsGetActiveToken() : localStorage.getItem('ym_token');
    if (savedToken) {
        const savedAcc = window.accounts ? window.accounts.current() : null;
        verifyAndLogin(savedToken, savedAcc ? savedAcc.persist : true, true);
    } else {
        hideSplashAndShowLogin();
    }
}

function hideSplashAndShowLogin() {
    const splash = document.getElementById('app-splash-screen');
    if(splash) splash.classList.add('hidden-splash');
    
    document.getElementById('login-screen').style.display = 'flex';
    
    const status = document.getElementById('login-status');
    const txtEl = document.getElementById('login-status-text');
    status.className = 'status-msg default';
    status.style.visibility = 'visible';
    txtEl.innerText = 'יש להכניס פרטי מערכת';

    setTimeout(() => {
        const tokenForm = document.getElementById('token-mode-form');
        if (tokenForm && tokenForm.style.display !== 'none') {
            const tokenInput = document.getElementById('manual-token');
            if (tokenInput) { tokenInput.select(); tokenInput.focus(); }
        } else {
            const userInput = document.getElementById('username');
            const passInput = document.getElementById('password');
            if (userInput && !userInput.value) { 
                userInput.focus(); 
            } else if (passInput && !passInput.value) {
                passInput.focus(); 
            } else if (userInput) {
                userInput.select(); userInput.focus(); 
            }
        }
    }, 100);
}

function hideSplashAndShowDashboard() {
    const splash = document.getElementById('app-splash-screen');
    if(splash) splash.classList.add('hidden-splash');
    
    document.getElementById('login-screen').style.display = 'none';
}

async function performLogin(isSilent = false) {
    if (typeof isSilent !== 'boolean') isSilent = false;

    const user = document.getElementById('username').value;
    const pass = document.getElementById('password').value;
    const remember = document.getElementById('remember').checked;

    window.lastLoginUsername = user;

    if (!user || !pass) {
        if (!isSilent) showStatus("נא להזין מספר וסיסמה", "error");
        else hideSplashAndShowLogin();
        return;
    }

    if (!isSilent) {
        setLoading(true, 'login-btn');
        showStatus("מתחבר לשרת...", "info");
    }

    try {
        const url = `${API_BASE}/Login?username=${user}&password=${pass}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.responseStatus === 'OK' && data.token) {
            await verifyAndLogin(data.token, remember, isSilent);
        } else {
            if (isSilent) hideSplashAndShowLogin();
            handleLoginError(data);
            setLoading(false, 'login-btn');
        }

    } catch (err) {
        console.error(err);
        if (isSilent) hideSplashAndShowLogin();
        showStatus("שגיאת תקשורת עם השרת", "error");
        setLoading(false, 'login-btn');
    }
}

async function loginWithTokenInput() {
    const token = document.getElementById('manual-token').value;
    if (!token) {
        showStatus("נא להזין טוקן", "error");
        return;
    }
    window.lastLoginUsername = null;
    setLoading(true, 'token-login-btn'); 
    await verifyAndLogin(token, true, false);
}

async function verifyAndLogin(token, rememberMe, isSilent = false) {
    currentUserToken = token; 
    
    if(!isSilent) showStatus("מאמת מול שרת אבטחה...", "info");
    
    const status1 = await checkMfaStatus(token, "isPass");
    
    if (status1.responseStatus !== 'OK' || status1.isPass === undefined) {
        finalizeLogin(token, { passReason: "לא ניתן לקבל פרטי טוקן", isPassInThisSession: "UNKNOWN_TOKEN_DETAILS" }, rememberMe, isSilent);
        return;
    }

    if (status1.isPass === true) {
        finalizeLogin(token, status1, rememberMe, isSilent);
        return;
    }

    if(!isSilent) showStatus("מנסה לבצע אימות אוטומטי...", "info");
    const statusTry = await checkMfaStatus(token, "try");
    const statusFinal = await checkMfaStatus(token, "isPass");

    if (statusFinal.responseStatus !== 'OK') {
        finalizeLogin(token, { passReason: "לא ניתן לקבל פרטי טוקן", isPassInThisSession: "UNKNOWN_TOKEN_DETAILS" }, rememberMe, isSilent);
        return;
    }

    if (statusFinal.isPass === true) {
        finalizeLogin(token, statusFinal, rememberMe, isSilent);
    } else {
        if(isSilent) hideSplashAndShowLogin();
        handleMfaRequired(token, rememberMe);
    }
}

async function checkMfaStatus(token, action) {
    try {
        const url = `${API_BASE}/MFASession?token=${token}&action=${action}`;
        const res = await fetch(url);
        return await res.json();
    } catch (e) {
        return { responseStatus: "EXCEPTION", message: "Network Error" };
    }
}

function handleInvalidToken(data, isSilent = false) {
    setLoading(false, 'login-btn');
    setLoading(false, 'token-login-btn');
    
    localStorage.removeItem('ym_token');
    if (window.accountsOnInvalid) window.accountsOnInvalid(currentUserToken);
    
    if(isSilent) {
        hideSplashAndShowLogin();
        // מחיקת שגיאות ממסך הטעינה (במקרה של טעינה מהזיכרון)
        const status = document.getElementById('login-status');
        const txtEl = document.getElementById('login-status-text');
        if (status && txtEl) {
            status.className = 'status-msg default';
            txtEl.innerText = 'יש להכניס פרטי מערכת';
        }
        if (window.accountsAfterInvalidUI) window.accountsAfterInvalidUI();
    } else {
        showLoginScreen(); 
        let msg = "שגיאה באימות הטוקן";
        if (data && data.message && (data.message.includes("invalid") || data.message.includes("expired"))) {
            msg = "הטוקן לא תקין או פג תוקף";
        } else if (data && data.responseStatus === 'EXCEPTION') {
            msg = "הטוקן לא תקין או פג תוקף"; 
        }
        showStatus(msg, "error");
    }
    
    setTimeout(() => {
        const tokenForm = document.getElementById('token-mode-form');
        if (tokenForm && tokenForm.style.display !== 'none') {
            const tokenInput = document.getElementById('manual-token');
            if(tokenInput) { tokenInput.select(); tokenInput.focus(); }
        } else {
            const userInput = document.getElementById('username');
            if(userInput) { userInput.select(); userInput.focus(); }
        }
    }, 100);
}

function handleLoginError(data) {
    let msg = "פרטים שגויים";
    if (data && data.message) msg = data.message;
    showStatus("שגיאה בהתחברות: " + msg, "error");
    
    const passInput = document.getElementById('password');
    if(passInput) {
        passInput.select();
        passInput.focus();
    }
}

function handleMfaRequired(token, rememberMe) {
    setLoading(false, 'login-btn');
    setLoading(false, 'token-login-btn');
    showStatus("נדרש אימות דו-שלבי", "info");

    const modal = document.getElementById('mfa-modal');
    const linkBtn = document.getElementById('mfa-link-btn');
    linkBtn.href = `https://call2all.co.il/ym/mfa.php?mode=SSO&ymapitoken=${token}&callback=https://call2all.co.il`;
    
    modal.style.display = 'flex';

    startPolling(token, rememberMe);
}

function triggerManualReAuth() {
    if (!currentUserToken) return;
    handleMfaRequired(currentUserToken, true);
}

function startPolling(token, rememberMe) {
    if (pollingInterval) clearInterval(pollingInterval);
    pollingInterval = setInterval(async () => {
        const check = await checkMfaStatus(token, "isPass");
        
        if (check.responseStatus !== 'OK') {
            clearInterval(pollingInterval);
            closeMfaModal();
            handleInvalidToken(check);
            return;
        }

        if (check.isPass === true) {
            clearInterval(pollingInterval);
            closeMfaModal();
            finalizeLogin(token, check, rememberMe);
        }
    }, 2000);
}

function closeMfaModal() {
    document.getElementById('mfa-modal').style.display = 'none';
    if (pollingInterval) clearInterval(pollingInterval);
}

async function finalizeLogin(token, authData, rememberMe, isSilent = false) {
    if(!isSilent) showStatus("אימות הושלם! טוען נתונים...", "success");

    if (rememberMe) localStorage.setItem('ym_token', token);
    else if (localStorage.getItem('ym_token') === token) localStorage.removeItem('ym_token');

    const fullAuthData = {
        reason: authData.passReason,
        isSession: authData.isPassInThisSession
    };

    try {
        const url = `${API_BASE}/GetCustomerData?token=${token}`;
        const res = await fetch(url);
        const userData = await res.json();

        if (userData.responseStatus !== "OK") {
            handleInvalidToken(userData, isSilent);
            return;
        }

        // רישום המערכת ברשימת המערכות (logic_accounts.js). true = הדף נטען מחדש
        if (window.accountsOnLogin && window.accountsOnLogin(token, userData, rememberMe)) return;

        if(isSilent) hideSplashAndShowDashboard();
        
        initDashboardUI(userData, token, fullAuthData);
        if (window.accounts) window.accounts.renderSwitcher();

    } catch (e) {
        if(!isSilent) showStatus("שגיאת רשת בטעינת נתונים", "error");
        else {
            hideSplashAndShowLogin();
            showStatus("שגיאת רשת בטעינת נתונים", "error");
        }
        
        setLoading(false, 'login-btn');
    }
}

function logout() {
    const tokenInput = document.getElementById('current-token-display');
    const token = tokenInput ? tokenInput.value : localStorage.getItem('ym_token');
    
    if (token) {
        // קריאה אסינכרונית לניתוק ללא המתנה לתשובה
        fetch(`${API_BASE}/Logout?token=${token}`).catch(() => {});
    }
    
    // אם יש מערכות נוספות ברשימה - עוברים לבאה בתור (logic_accounts.js)
    if (window.accountsLogoutCurrent) return window.accountsLogoutCurrent(token);

    localStorage.removeItem('ym_token');
    location.reload();
}

function showLoginScreen() {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('dashboard-screen').style.display = 'none';
}

function showStatus(text, type) {
    const el = document.getElementById('login-status');
    const txtEl = document.getElementById('login-status-text');
    
    if(txtEl) txtEl.innerText = text;
    else el.innerText = text; 

    el.className = `status-msg ${type}`;
    el.style.visibility = 'visible';
}

function setLoading(isLoading, btnId) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    const textSpan = btn.querySelector('.btn-text');
    const loaderSpan = btn.querySelector('.btn-loader');
    if (isLoading) {
        btn.disabled = true;
        textSpan.style.display = 'none';
        loaderSpan.style.display = 'inline-block';
    } else {
        btn.disabled = false;
        textSpan.style.display = 'inline-block';
        loaderSpan.style.display = 'none';
    }
}

function toggleTokenVisibility() {
    const input = document.getElementById('current-token-display');
    const btn = event.currentTarget; 
    const icon = btn.querySelector('i');
    
    if (input.type === "password") {
        input.type = "text";
        icon.className = "fas fa-eye-slash";
    } else {
        input.type = "password";
        icon.className = "fas fa-eye";
    }
}

function copyTokenToClipboard() {
     const input = document.getElementById('current-token-display');
     if(!input || !input.value) return;
     
     navigator.clipboard.writeText(input.value).then(() => {
         const icon = document.getElementById('iconCopyToken');
         const originalClass = icon.className;
         
         icon.className = "fas fa-check";
         icon.style.color = "#10b981"; 
         
         setTimeout(() => {
             icon.className = "fas fa-copy";
             icon.style.color = "";
         }, 1000);
     }).catch(err => {
         console.error("Failed to copy:", err);
     });
}