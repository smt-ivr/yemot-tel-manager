let globalToken = null;
let globalPath = null;
let globalPathCopy = null;
const MAX_SINGLE_UPLOAD_SIZE = 50 * 1024 * 1024; // 50MB

// פוקוס אוטומטי בהתחלה
window.onload = () => {
    document.getElementById('passwordInput').focus();
    setupDragAndDrop();
};

// התחברות עם Enter
document.getElementById('passwordInput').addEventListener('keydown', function(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        document.getElementById('loginBtn').click();
    }
});

// הגדרת מערכת גרירה והשלכה (Drag & Drop)
function setupDragAndDrop() {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover'), false);
    });

    dropZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        fileInput.files = files;
        // מפעיל את אירוע השינוי כדי לעדכן את הטקסט
        fileInput.dispatchEvent(new Event('change'));
    });
}

// שינוי תצוגת הקבצים הנבחרים
document.getElementById('fileInput').addEventListener('change', function(e) {
    const fileNameElement = document.getElementById('selectedFileName');
    if (this.files && this.files.length > 0) {
        if (this.files.length === 1) {
            fileNameElement.textContent = this.files[0].name;
        } else {
            fileNameElement.textContent = `נבחרו ${this.files.length} קבצים להעלאה`;
        }
    } else {
        fileNameElement.textContent = '';
    }
});

// פונקציה מרוכזת לטיפול בשגיאות התחברות
function handleLoginError(msg) {
    const errorElement = document.getElementById('loginError');
    const passwordInput = document.getElementById('passwordInput');
    
    errorElement.textContent = msg;
    passwordInput.value = ''; // ניקוי השדה
    passwordInput.focus();    // החזרת פוקוס
}

// התחברות
document.getElementById('loginBtn').addEventListener('click', async () => {
    const password = document.getElementById('passwordInput').value;
    const loginBtn = document.getElementById('loginBtn');
    
    document.getElementById('loginError').textContent = '';
    
    if (!password) {
        handleLoginError('אנא הזן סיסמה.');
        return;
    }

    loginBtn.disabled = true;
    loginBtn.textContent = 'מתחבר...';

    try {
        const response = await fetch('https://masechet.m7008410.workers.dev/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pass: password })
        });

        const data = await response.json();

        if (data.error) {
            handleLoginError(data.error);
        } 
        else if (data.config) {
            if (!data.config.path) {
                handleLoginError('שגיאה: לא התקבל נתיב (path) מהשרת.');
                return;
            }

            globalToken = data.config.yemotToken;
            globalPath = data.config.path;
            globalPathCopy = data.config.path_copy || null;
            
            document.getElementById('loginSection').classList.add('hidden');
            document.getElementById('uploadSection').classList.remove('hidden');
            
            document.getElementById('displayPath').textContent = globalPath;
            if (globalPathCopy) {
                document.getElementById('displayCopyPath').textContent = globalPathCopy;
                document.getElementById('displayCopyPathContainer').classList.remove('hidden');
            }
            
            if (data.username) {
                const welcomeEl = document.getElementById('welcomeMessage');
                welcomeEl.textContent = 'שלום: ' + data.username;
                welcomeEl.classList.remove('hidden');
            }
        } else {
            handleLoginError('הנתונים שהתקבלו מהשרת אינם תקינים.');
        }
    } catch (error) {
        handleLoginError('שגיאת תקשורת מול שרת האימות.');
    } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = 'התחבר למערכת';
    }
});

// התחלת העלאה
document.getElementById('uploadBtn').addEventListener('click', async () => {
    const fileInput = document.getElementById('fileInput');
    const statusElement = document.getElementById('uploadStatus');
    const progressContainer = document.getElementById('progressContainer');
    const fileSelectionArea = document.getElementById('fileSelectionArea');
    const resetBtn = document.getElementById('resetBtn');

    if (fileInput.files.length === 0) {
        alert('אנא בחר או גרור קובץ להעלאה.');
        return;
    }

    // אימות מקדים: סוגי קבצים
    for (let i = 0; i < fileInput.files.length; i++) {
        const file = fileInput.files[i];
        if (!file.type.startsWith('audio/') && !file.type.startsWith('video/')) {
            alert(`הקובץ "${file.name}" אינו נתמך. המערכת מקבלת קבצי שמע ווידאו בלבד.`);
            return; 
        }
    }
    
    // הסתרת אזור בחירת הקבצים בזמן ההעלאה
    fileSelectionArea.classList.add('hidden');
    progressContainer.classList.remove('hidden');
    resetBtn.classList.add('hidden'); // מוודא שמוסתר למקרה של העלאה חוזרת
    statusElement.className = '';
    
    const totalFiles = fileInput.files.length;
    let successCount = 0;
    let errorCount = 0;

    // לולאה שעוברת קובץ קובץ (תור העלאות)
    for (let i = 0; i < totalFiles; i++) {
        const file = fileInput.files[i];
        
        let fileStatusHTML = `מעלה קובץ ${i + 1} מתוך ${totalFiles}: <br><b>${file.name}</b>`;
        
        // ציון שהקובץ גדול ומצריך פיצול
        if (file.size > MAX_SINGLE_UPLOAD_SIZE) {
            fileStatusHTML += '<br><span class="large-file-notice">(מעלה קובץ גדול: מבצע העלאת פיצול)</span>';
        }

        statusElement.innerHTML = fileStatusHTML;
        updateProgress(0);

        try {
            const uploadResponse = await uploadFileToSystem(file);
            
            if (globalPathCopy && uploadResponse.path) {
                statusElement.innerHTML += '<br><span class="copy-success-msg">מבצע העתקה לתיקיית היעד...</span>';
                await performCopyAction(uploadResponse.path);
            }
            
            successCount++;
        } catch (error) {
            console.error(`שגיאה בהעלאת ${file.name}:`, error);
            errorCount++;
        }
    }

    // סיכום בסיום העלאת כל הקבצים
    if (errorCount === 0) {
        statusElement.innerHTML = `סיום: ${successCount} קבצים הועלו בהצלחה!`;
        statusElement.className = 'success-msg';
    } else {
        statusElement.innerHTML = `סיום: ${successCount} הועלו בהצלחה, ${errorCount} נכשלו.`;
        statusElement.className = 'error-msg';
    }
    
    updateProgress(100);
    
    // חשיפת כפתור האיפוס לאחר הסיום המלא
    resetBtn.classList.remove('hidden');
});

// מנגנון כפתור "העלאת קבצים נוספים"
document.getElementById('resetBtn').addEventListener('click', () => {
    // איפוס ויזואלי ולוגי
    document.getElementById('fileSelectionArea').classList.remove('hidden');
    document.getElementById('resetBtn').classList.add('hidden');
    document.getElementById('progressContainer').classList.add('hidden');
    document.getElementById('uploadStatus').textContent = '';
    document.getElementById('uploadStatus').className = '';
    
    const fileInput = document.getElementById('fileInput');
    fileInput.value = '';
    document.getElementById('selectedFileName').textContent = '';
});

function updateProgress(percent) {
    const progressBar = document.getElementById('progressBar');
    const displayPercent = Math.min(Math.floor(percent), 100); 
    progressBar.style.width = displayPercent + '%';
    progressBar.textContent = displayPercent + '%';
}

function generateUUID() {
    return crypto.randomUUID ? crypto.randomUUID() : 
           'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
               var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
               return v.toString(16);
           });
}

// העלאת קובץ
function uploadFileToSystem(file) {
    const BASE_URL = 'https://www.call2all.co.il/ym/api/UploadFile';
    const convertAudio = "1";
    const autoNumbering = "1"; 

    if (file.size <= MAX_SINGLE_UPLOAD_SIZE) {
        // העלאה רגילה לקובץ שקטן מ-50MB
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', BASE_URL);

            xhr.upload.onprogress = function(event) {
                if (event.lengthComputable) {
                    updateProgress((event.loaded / event.total) * 100);
                }
            };

            xhr.onload = function() {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        const data = JSON.parse(xhr.responseText);
                        if (data.responseStatus !== 'OK' && data.messageCode !== 'OK' && !data.path) {
                            reject(new Error(data.message || 'השרת דחה את ההעלאה.'));
                        } else {
                            resolve(data);
                        }
                    } catch (e) {
                        reject(new Error('תגובה לא תקינה מהשרת.'));
                    }
                } else {
                    reject(new Error(`שגיאת שרת: ${xhr.status}`));
                }
            };

            xhr.onerror = () => reject(new Error('שגיאת רשת בעת ההעלאה.'));

            const formData = new FormData();
            formData.append('token', globalToken);
            formData.append('path', globalPath);
            formData.append('convertAudio', convertAudio);
            formData.append('autoNumbering', autoNumbering);
            formData.append('file', file);

            xhr.send(formData);
        });

    } else {
        // העלאה מפוצלת לקובץ גדול מ-50MB
        return async function() {
            const CHUNK_SIZE = 4000000;
            const totalParts = Math.ceil(file.size / CHUNK_SIZE);
            const uuid = generateUUID();
            let byteOffset = 0;

            // שלב א - שליחת המקטעים
            for (let partIndex = 0; partIndex < totalParts; partIndex++) {
                const chunk = file.slice(byteOffset, byteOffset + CHUNK_SIZE);
                const formData = new FormData();

                formData.append('token', globalToken);
                formData.append('path', globalPath);
                formData.append('convertAudio', convertAudio);
                formData.append('autoNumbering', autoNumbering);
                formData.append('qquuid', uuid);
                formData.append('qqpartindex', partIndex);
                formData.append('qqpartbyteoffset', byteOffset);
                formData.append('qqchunksize', chunk.size);
                formData.append('qqtotalparts', totalParts);
                formData.append('qqtotalfilesize', file.size);
                formData.append('qqfilename', file.name);
                formData.append('uploader', 'yemot-admin');
                formData.append('qqfile', chunk);

                const response = await fetch(BASE_URL, { method: 'POST', body: formData });
                if (!response.ok) throw new Error(`שגיאת רשת במקטע ${partIndex + 1}`);

                byteOffset += chunk.size;
                updateProgress((partIndex + 1) / totalParts * 95); 
            }

            // שלב ב - איחוד מול השרת
            // הפעם אנו משתמשים ב-URLSearchParams במקום FormData!
            // זה גורם ל-fetch לשלוח את הבקשה כ- application/x-www-form-urlencoded (בדיוק כמו האתר הרשמי)
            const doneParams = new URLSearchParams();
            doneParams.append('token', globalToken);
            
            // עיבוד הנתיב לפורמט הנדרש (החלפת ivr2 והוספת לוכסן בסוף)
            let donePath = globalPath.replace(/^ivr2:\/?/, 'ivr/');
            if (!donePath.endsWith('/')) {
                donePath += '/';
            }
            doneParams.append('path', donePath);
            
            doneParams.append('convertAudio', convertAudio);
            // כאן קריטי: שולחים "true" כמחרוזת ולא "1", כמו באתר הרשמי
            doneParams.append('autoNumbering', 'true');
            doneParams.append('qquuid', uuid);
            doneParams.append('qqfilename', file.name);
            doneParams.append('qqtotalfilesize', file.size);
            doneParams.append('qqtotalparts', totalParts);
            doneParams.append('uploader', 'yemot-admin');

            const doneResponse = await fetch(`${BASE_URL}?done`, { 
                method: 'POST',
                // שולחים את הפורמט החדש
                body: doneParams 
            });
            
            const doneData = await doneResponse.json();
            
            if (doneData.messageCode && doneData.messageCode !== 'OK' && !doneData.path) {
                 throw new Error(doneData.message || 'שגיאה בשלב איחוד הקובץ.');
            }
            return doneData;
        }(); 
    }
}

// העתקת קובץ
async function performCopyAction(uploadedFilePath) {
    let finalPathToCopy = uploadedFilePath;

    if (finalPathToCopy.startsWith('ivr/')) {
        finalPathToCopy = 'ivr2:' + finalPathToCopy.substring(4);
    } else if (!finalPathToCopy.startsWith('ivr2:')) {
        finalPathToCopy = 'ivr2:' + finalPathToCopy;
    }

    const copyUrl = new URL('https://www.call2all.co.il/ym/api/FileAction');
    copyUrl.searchParams.append('token', globalToken);
    copyUrl.searchParams.append('action', 'copy');
    copyUrl.searchParams.append('what', finalPathToCopy);
    copyUrl.searchParams.append('target', globalPathCopy);

    const response = await fetch(copyUrl, { method: 'POST' });
    const data = await response.json();
    
    if (!data.success) {
        throw new Error("אירעה שגיאה בביצוע ההעתקה לתיקיית היעד.");
    }
    return data;
}