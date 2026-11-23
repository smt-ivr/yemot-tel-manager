const YEMOT_API_BASE_URL = "https://www.call2all.co.il/ym/api";
const SYSTEM_NUMBER_STORAGE_KEY = "yemotSystemNumber"; 
const PASSWORD_STORAGE_KEY = "yemotPassword";       
const BASE_PATH_STORAGE_KEY = "yemotSurveyBasePath";
const NUMBER_OF_QUESTIONS_TO_LOAD_KEY = "yemotNumberOfQuestionsToLoad"; 
const ACTIVE_TOKEN_KEY = "yemotActiveSessionToken"; 
const PERCENTAGE_FILE_SUFFIX = "Q_log_percentage.ini";
const COUNT_FILE_SUFFIX = "Q_log_number.ini";

let currentValidToken = null;
let mfaPollingInterval = null;

// מיפוי סיבות אימות לעברית
const MFA_REASONS = {
    "INACTIVE_SYSTEM": "מנוע האימות הדו שלבי לא פעיל או לא זמין",
    "WAIT_TO_BLOCK_DATE": "תאריך אכיפת השירות לא הגיע",
    "INIT_WHITELIST_IPS": "כתובת IP ברשימה לבנה",
    "INIT_MASTER_LOGIN_WHITELIST_IPS": "כתובת IP ברשימה לבנה בהתחברות מאסטר",
    "HAVE_ACTIVE_TRUST_TOKEN": "בוצע מעבר על ידי אסימון ״זכור אותי״",
    "INHERITED_FROM_ORIGINAL_SESSION": "ירושה מסשן קודם כל שהוא",
    "MFA_PASSED": "בוצע אימות בפועל בחיבור הנוכחי",
    "SPECIAL_VALID_TOKEN": "טוקן שנוצר עם פטור מאימות מסיבה מיוחדת",
    "FOR_FIREWALL_TOKEN": "טוקן עבר חומת אש",
    "IS_CUSTOMER_AUTH_TOKEN": "מפתח גישה קבוע",
    "API_SKIP_FOR_MFA": "דילוג על אימות בAPI"
};

// פונקציה לקליטת הגדרות מ-URL ושמירתן המיידית ב-localStorage, ולאחר מכן ניקוי ה-URL
function handleUrlParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    let hasChanges = false;

    if (urlParams.has('system')) { 
        localStorage.setItem(SYSTEM_NUMBER_STORAGE_KEY, urlParams.get('system')); 
        hasChanges = true; 
    }
    if (urlParams.has('password')) { 
        localStorage.setItem(PASSWORD_STORAGE_KEY, urlParams.get('password')); 
        hasChanges = true; 
    }
    if (urlParams.has('basePath')) { 
        localStorage.setItem(BASE_PATH_STORAGE_KEY, urlParams.get('basePath')); 
        hasChanges = true; 
    }
    if (urlParams.has('questions')) { 
        localStorage.setItem(NUMBER_OF_QUESTIONS_TO_LOAD_KEY, urlParams.get('questions')); 
        hasChanges = true; 
    }
    if (urlParams.has('token')) { 
        localStorage.setItem(ACTIVE_TOKEN_KEY, urlParams.get('token')); 
        hasChanges = true; 
    }

    // אם נקלטו פרמטרים, נמחק אותם מיד משורת הכתובת ללא רענון הדף
    if (hasChanges) {
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    // הרצת בדיקת הפרמטרים מה-URL מיד עם טעינת הדף
    handleUrlParameters();
    
    // טעינת ההגדרות העדכניות לתוך שדות הקלט
    loadSettings();
    
    document.getElementById('saveSettingsButton').addEventListener('click', handleSaveAndLogin);
    document.getElementById('loadSurveysButton').addEventListener('click', startProcess);
    document.getElementById('settingsButton').addEventListener('click', openSettingsModal);
    document.getElementById('closeSettingsModalButton').addEventListener('click', closeSettingsModal);
    document.getElementById('closeMfaModalBtn').addEventListener('click', abortMfaProcess);
    document.getElementById('disconnectButton').addEventListener('click', disconnectSession);
    
    // סגירת מודל הגדרות בלחיצה מחוץ למודל
    document.getElementById('settingsModal').addEventListener('click', (event) => { 
        if (event.target === document.getElementById('settingsModal')) closeSettingsModal();
    });
});

function openSettingsModal() { document.getElementById('settingsModal').classList.add('open'); }
function closeSettingsModal() { document.getElementById('settingsModal').classList.remove('open'); }

function loadSettings() {
    document.getElementById('systemNumberInput').value = localStorage.getItem(SYSTEM_NUMBER_STORAGE_KEY) || '';
    document.getElementById('passwordInput').value = localStorage.getItem(PASSWORD_STORAGE_KEY) || '';
    document.getElementById('surveyBasePathInput').value = localStorage.getItem(BASE_PATH_STORAGE_KEY) || 'ivr2:1/1/1';
    document.getElementById('numberOfQuestionsInput').value = localStorage.getItem(NUMBER_OF_QUESTIONS_TO_LOAD_KEY) || 8;
}

function showStatus(message, type = 'info', isCritical = false) {
    const el = document.getElementById('statusMessage');
    el.textContent = message;
    let className = `my-5 text-center font-semibold text-sm status-message-area`;
    if (isCritical) className += ' critical-error';
    else if (type === 'error') className += ' text-red-700';
    else if (type === 'success') className += ' text-green-700';
    else className += ' text-blue-700';
    el.className = className;
}

// --- ניהול התחברות ו-MFA --- //

async function handleSaveAndLogin() {
    const sys = document.getElementById('systemNumberInput').value.trim();
    const pass = document.getElementById('passwordInput').value.trim();
    const basePath = document.getElementById('surveyBasePathInput').value.trim().replace(/\/$/, "");
    const qty = parseInt(document.getElementById('numberOfQuestionsInput').value, 10);
    const settingsStatus = document.getElementById('settingsStatus');

    if (!sys || !pass || !basePath || isNaN(qty) || qty < 1) {
        settingsStatus.textContent = 'אנא מלא את כל השדות כראוי.';
        settingsStatus.className = 'mt-4 text-xs text-center text-red-600 font-medium';
        return;
    }

    localStorage.setItem(SYSTEM_NUMBER_STORAGE_KEY, sys);
    localStorage.setItem(PASSWORD_STORAGE_KEY, pass);
    localStorage.setItem(BASE_PATH_STORAGE_KEY, basePath);
    localStorage.setItem(NUMBER_OF_QUESTIONS_TO_LOAD_KEY, qty);
    
    localStorage.removeItem(ACTIVE_TOKEN_KEY);

    settingsStatus.textContent = 'ההגדרות נשמרו. מתחבר...';
    settingsStatus.className = 'mt-4 text-xs text-center text-blue-600 font-medium';
    
    await startProcess();
    closeSettingsModal();
    settingsStatus.textContent = '';
}

function disconnectSession() {
    currentValidToken = null;
    localStorage.removeItem(ACTIVE_TOKEN_KEY);
    document.getElementById('authStatusContainer').classList.add('hidden');
    document.getElementById('surveyResultsContainer').innerHTML = '';
    showStatus('התנתקת מהמערכת ומחקת את הטוקן', 'info');
}

async function startProcess() {
    const sys = localStorage.getItem(SYSTEM_NUMBER_STORAGE_KEY);
    const pass = localStorage.getItem(PASSWORD_STORAGE_KEY);
    const savedToken = localStorage.getItem(ACTIVE_TOKEN_KEY);
    
    if (!sys || !pass) {
        openSettingsModal();
        return;
    }

    document.getElementById('surveyResultsContainer').innerHTML = '';
    document.getElementById('loader').classList.remove('hidden');
    showStatus('מוודא חיבור ותוקף טוקן מול השרת...', 'info');

    try {
        let token = savedToken;
        let isTokenValid = false;

        if (token) {
            const testRes = await fetch(`${YEMOT_API_BASE_URL}/MFASession?token=${token}&action=isPass`);
            const testData = await testRes.json();
            if (testData.responseStatus === "OK") {
                isTokenValid = true;
            }
        }

        if (!isTokenValid) {
            showStatus('הטוקן פג תוקף, מתחבר מחדש מול השרת...', 'info');
            const loginRes = await fetch(`${YEMOT_API_BASE_URL}/Login?username=${encodeURIComponent(sys)}&password=${encodeURIComponent(pass)}`);
            const loginData = await loginRes.json();
            
            if (loginData.responseStatus !== "OK") {
                throw new Error(loginData.message || "שם משתמש או סיסמא שגויים");
            }
            
            token = loginData.token;
            localStorage.setItem(ACTIVE_TOKEN_KEY, token);
        } else {
            showStatus('זוהה טוקן פעיל, עובר לאימות גישה...', 'info');
        }
        
        await authenticateMfaFlow(token);

    } catch (err) {
        document.getElementById('loader').classList.add('hidden');
        showStatus(`שגיאת התחברות: ${err.message}`, 'error', true);
        localStorage.removeItem(ACTIVE_TOKEN_KEY);
        openSettingsModal();
    }
}

async function authenticateMfaFlow(token) {
    try {
        let passCheck = await checkMfaStatus(token);
        
        if (!passCheck.isPass) {
            const tryRes = await fetch(`${YEMOT_API_BASE_URL}/MFASession?token=${token}&action=try`);
            await tryRes.json();
            passCheck = await checkMfaStatus(token);
        }

        if (passCheck.isPass) {
            handleSuccessfulAuth(token, passCheck.passReason);
        } else {
            openMfaModal(token);
        }
    } catch (e) {
        document.getElementById('loader').classList.add('hidden');
        showStatus('אירעה שגיאה בבדיקת אימות מול השרת.', 'error');
    }
}

async function checkMfaStatus(token) {
    const res = await fetch(`${YEMOT_API_BASE_URL}/MFASession?token=${token}&action=isPass`);
    return await res.json();
}

function openMfaModal(token) {
    document.getElementById('loader').classList.add('hidden');
    showStatus('ממתין להשלמת אימות דו-שלבי...', 'info');
    
    const mfaUrl = `https://call2all.co.il/ym/mfa.php?mode=SSO&ymapitoken=${token}&callback=https://call2all.co.il`;
    document.getElementById('mfaIframe').src = mfaUrl;
    document.getElementById('mfaModal').classList.add('open');
    
    mfaPollingInterval = setInterval(async () => {
        try {
            const passCheck = await checkMfaStatus(token);
            if (passCheck.isPass) {
                clearInterval(mfaPollingInterval);
                document.getElementById('mfaModal').classList.remove('open');
                handleSuccessfulAuth(token, passCheck.passReason);
            }
        } catch(e) {
            console.error('MFA poll error', e);
        }
    }, 1000);
}

function abortMfaProcess() {
    if (mfaPollingInterval) clearInterval(mfaPollingInterval);
    document.getElementById('mfaModal').classList.remove('open');
    document.getElementById('mfaIframe').src = "";
    showStatus('תהליך האימות בוטל על ידי המשתמש.', 'error');
}

function handleSuccessfulAuth(token, reasonCode) {
    currentValidToken = token;
    
    const uiContainer = document.getElementById('authStatusContainer');
    const reasonTextEl = document.getElementById('authReasonText');
    
    uiContainer.classList.remove('hidden');
    uiContainer.classList.add('flex');
    
    const hebrewReason = MFA_REASONS[reasonCode] || reasonCode;
    reasonTextEl.textContent = `סיבה: ${hebrewReason}`;
    
    showStatus('האימות עבר בהצלחה. מתחיל בטעינת הנתונים...', 'success');
    loadAllSurveyData(token);
}

// --- טעינת הנתונים והצגתם --- //

async function loadAllSurveyData(token) {
    const basePath = localStorage.getItem(BASE_PATH_STORAGE_KEY) || 'ivr2:1/1/1';
    const qty = parseInt(localStorage.getItem(NUMBER_OF_QUESTIONS_TO_LOAD_KEY) || 8, 10);
    
    document.getElementById('loader').classList.remove('hidden');
    showStatus(`טוען נתונים עבור ${qty} שאלות...`, 'info');

    const fetchPromises = [];
    for (let i = 1; i <= qty; i++) {
        const currentPath = `${basePath}/${i}/`; 
        fetchPromises.push(fetchCombinedSurveyData(i, token, currentPath));
    }
    
    try {
        const results = await Promise.all(fetchPromises);
        document.getElementById('loader').classList.add('hidden'); 
        
        let questionsDisplayed = 0;
        results.forEach(result => {
            if (result && result.data) {
                displaySurveyData(result.questionNumber, result.data); 
                questionsDisplayed++;
            } else if (result && result.error) { 
                displayErrorForQuestion(result.questionNumber, result.error); 
            }
        });

        if (questionsDisplayed > 0) {
            showStatus(`טעינת הנתונים הושלמה. ${questionsDisplayed} שאלות נטענו.`, 'success');
        }

    } catch (error) { 
        document.getElementById('loader').classList.add('hidden');
        showStatus('שגיאה כללית בטעינת הנתונים.', 'error', true);
    }
}

async function fetchIniFile(token, whatParameter) {
    const url = `${YEMOT_API_BASE_URL}/GetTextFile?token=${token}&what=${encodeURIComponent(whatParameter)}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`שגיאת רשת ${response.status}`);
    
    const jsonData = await response.json();
    if (jsonData.responseStatus !== "OK") throw new Error(`שגיאת API: ${jsonData.message || 'לא ידוע'}`);
    
    if (!jsonData.file || !jsonData.file.exists) {
        return { data: null, exists: false };
    }
    
    const contentString = jsonData.contents;
    if (!contentString || contentString.trim() === "") return { data: {}, exists: true }; 

    const parsedData = {};
    contentString.trim().split(/\r\n|\n/).forEach(line => {
        const parts = line.split('=');
        if (parts.length === 2) parsedData[parts[0].trim()] = parseFloat(parts[1].trim());
    });
    return { data: parsedData, exists: true };
}

async function fetchCombinedSurveyData(questionNumber, token, path) {
    const pWhat = `${path}${PERCENTAGE_FILE_SUFFIX}`;
    const cWhat = `${path}${COUNT_FILE_SUFFIX}`;
    let pData, cData;

    try {
        const pRes = await fetchIniFile(token, pWhat);
        pData = pRes.data;
        if(!pRes.exists && pData === null) return { questionNumber, error: "קובץ האחוזים אינו נגיש (ייתכן שאלה פתוחה ללא אחוזים)." };
        
        const cRes = await fetchIniFile(token, cWhat);
        cData = cRes.data;
    } catch(e) {
        return { questionNumber, error: e.message };
    }

    const combinedData = {};
    const primary = pData || {}; 

    for (const ansId in primary) {
        combinedData[ansId] = { percentage: primary[ansId], count: (cData && cData[ansId] !== undefined) ? cData[ansId] : null };
    }
    if (cData) {
        for (const ansId in cData) {
            if (!combinedData[ansId]) combinedData[ansId] = { percentage: null, count: cData[ansId] };
        }
    }
    
    const dataArray = Object.keys(combinedData).map(id => ({
        answerId: id, percentage: combinedData[id].percentage, count: combinedData[id].count
    })).filter(item => item.percentage !== null || item.count !== null); 

    return { questionNumber, data: dataArray };
}

function getHebrewLetter(num) {
    const letters = ["א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט", "י", "יא", "יב", "יג", "יד", "טו", "טז", "יז", "יח", "יט", "כ"];
    return (num >= 1 && num <= letters.length) ? letters[num - 1] : String(num);
}

function displaySurveyData(qNum, data) { 
    const container = document.getElementById('surveyResultsContainer');
    const qInfo = (typeof SURVEY_QUESTIONS_TEXTS !== 'undefined') ? SURVEY_QUESTIONS_TEXTS.find(q => q.id === qNum) : null;
    const hLetter = getHebrewLetter(qNum);
    const headerText = qInfo ? `${qInfo.title} - ${qInfo.questionText}` : `${hLetter}. נתונים לשאלה ${qNum}`;

    const div = document.createElement('div');
    div.className = 'question-card'; 
    div.innerHTML = `<h3 class="question-header">${headerText}</h3>`;

    let total = 0, countsAvail = false;
    data.forEach(i => { if (i.count !== null) { total += i.count; countsAvail = true; } });

    if (countsAvail) {
        div.innerHTML += `<div class="total-votes-summary">סה"כ <strong class="text-blue-700">${total.toLocaleString('he-IL')}</strong> הצבעות במערכת לשאלה זו</div>`;
    }

    const cw = document.createElement('div'); 
    cw.className = 'flex-grow mt-auto'; 

    if (data.length === 0) {
        cw.innerHTML = '<p class="text-gray-500 italic py-4 text-center">אין נתונים להצגה. ייתכן ומדובר בשאלה פתוחה (הקלטות).</p>';
    } else {
        data.sort((a, b) => (b.count || 0) - (a.count || 0));
        const ul = document.createElement('ul');
        ul.className = 'answer-list space-y-3';
        
        data.forEach(item => {
            const idx = parseInt(item.answerId.substring(1), 10) - 1;
            let ansText = (qInfo && qInfo.answers && qInfo.answers[idx]) ? qInfo.answers[idx] : `תשובה ${item.answerId}`;
            
            const percNum = item.percentage !== null ? item.percentage.toFixed(1) : 0;
            const percText = item.percentage !== null ? `${percNum}%` : `<span class="italic text-gray-400 font-normal text-xs">אין נתון</span>`;
            const countStr = item.count !== null ? `<span class="vote-count">(${item.count.toLocaleString('he-IL')} הצבעות)</span>` : '';
            
            ul.innerHTML += `
            <li class="answer-item-crm">
                <div class="answer-top-row">
                    <span class="answer-text">${ansText}</span>
                    <span class="answer-details">
                        <span class="percentage-value">${percText}</span>
                        ${countStr}
                    </span>
                </div>
                <div class="percentage-bar-container">
                    <div class="percentage-bar-fill" style="width: ${percNum}%;"></div>
                </div>
            </li>`;
        });
        cw.appendChild(ul);
    }
    div.appendChild(cw); 
    container.appendChild(div);
}

function displayErrorForQuestion(qNum, errorMsg) { 
    const qInfo = (typeof SURVEY_QUESTIONS_TEXTS !== 'undefined') ? SURVEY_QUESTIONS_TEXTS.find(q => q.id === qNum) : null;
    const hLetter = getHebrewLetter(qNum);
    const titleText = qInfo ? qInfo.title : hLetter;
    
    const div = document.createElement('div');
    div.className = 'question-card error-card'; 
    div.innerHTML = `
        <h3 class="question-header"><i class="fas fa-exclamation-triangle mr-2 text-red-500"></i> ${titleText}</h3>
        <p class="text-sm error-details mt-2">${errorMsg}</p>
        <p class="text-xs text-gray-500 mt-2">ייתכן וזו שאלה פתוחה (הקלטות) שאין לה קובץ התפלגות, או שהיא טרם נענתה.</p>
    `;
    document.getElementById('surveyResultsContainer').appendChild(div);
}