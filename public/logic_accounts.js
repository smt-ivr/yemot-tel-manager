// =====================================================================
//  ניהול מספר מערכות: שמירת כמה מערכות מחוברות ומעבר ביניהן
//  בלי להתנתק ולהתחבר מחדש.
//  מערכות עם "זכור אותי" נשמרות ב-localStorage, אחרות רק ללשונית הנוכחית.
// =====================================================================
(function () {
    'use strict';

    const LS_KEY = 'ym_accounts';           // מערכות שמורות (זכור אותי)
    const SS_KEY = 'ym_accounts_session';   // מערכות ללשונית זו בלבד
    const SS_ACTIVE = 'ym_active_token';    // הטוקן הפעיל בלשונית זו
    const SS_ADD_MODE = 'ym_add_mode';

    function read(storage, key) {
        try { return JSON.parse(storage.getItem(key) || '[]') || []; } catch (e) { return []; }
    }
    function write(storage, key, list) {
        try { storage.setItem(key, JSON.stringify(list)); } catch (e) { /* ignore */ }
    }

    function all() {
        const persisted = read(localStorage, LS_KEY).map(a => ({ ...a, persist: true }));
        const session = read(sessionStorage, SS_KEY).map(a => ({ ...a, persist: false }));
        const ids = new Set(persisted.map(a => a.id));
        return [...persisted, ...session.filter(a => !ids.has(a.id))];
    }

    function save(list) {
        const strip = ({ persist, ...rest }) => rest;
        write(localStorage, LS_KEY, list.filter(a => a.persist).map(strip));
        write(sessionStorage, SS_KEY, list.filter(a => !a.persist).map(strip));
    }

    function activeToken() {
        try { return sessionStorage.getItem(SS_ACTIVE) || localStorage.getItem('ym_token'); } catch (e) { return null; }
    }

    function setActive(acc) {
        try {
            sessionStorage.setItem(SS_ACTIVE, acc.token);
            if (acc.persist) localStorage.setItem('ym_token', acc.token);
        } catch (e) { /* ignore */ }
    }

    function clearActive() {
        try { sessionStorage.removeItem(SS_ACTIVE); localStorage.removeItem('ym_token'); } catch (e) { /* ignore */ }
    }

    function current() {
        const t = activeToken();
        return all().find(a => a.token === t) || null;
    }

    // ---------- נקרא מ-logic_auth.js ----------

    // אחרי התחברות מוצלחת. מחזיר true אם הדף נטען מחדש (ואין להמשיך)
    window.accountsOnLogin = function (token, userData, rememberMe) {
        const id = String(userData.mainDid || window.lastLoginUsername || token.split(':')[0]);
        const list = all();
        const existing = list.find(a => a.id === id);
        const acc = {
            id,
            token,
            name: userData.name || '',
            username: window.lastLoginUsername || (existing && existing.username) || id,
            persist: !!rememberMe || !!(existing && existing.persist && !window.lastLoginUsername),
            updatedAt: Date.now()
        };
        const next = list.filter(a => a.id !== id);
        next.push(acc);
        save(next);
        setActive(acc);

        let adding = false;
        try { adding = sessionStorage.getItem(SS_ADD_MODE) === '1'; sessionStorage.removeItem(SS_ADD_MODE); } catch (e) { /* ignore */ }
        if (adding) {
            location.reload();
            return true;
        }
        renderSwitcher();
        return false;
    };

    // טוקן לא תקף - שומרים את המערכת ברשימה כ"דורשת התחברות"
    let expiredAccount = null;
    window.accountsOnInvalid = function (token) {
        if (!token) return;
        const list = all();
        list.forEach(a => { if (a.token === token) { a.token = ''; a.needsLogin = true; expiredAccount = a; } });
        save(list);
        try { if (sessionStorage.getItem(SS_ACTIVE) === token) sessionStorage.removeItem(SS_ACTIVE); } catch (e) { /* ignore */ }
    };

    window.accountsGetActiveToken = activeToken;

    // מסך ההתחברות אחרי שטוקן שמור פג: ממלא את מספר המערכת ומאפשר לחזור למערכות האחרות
    window.accountsAfterInvalidUI = function () {
        if (!expiredAccount) return;
        const others = all().filter(a => a.token);
        if (!others.length) return;
        try { sessionStorage.setItem(SS_ADD_MODE, '1'); } catch (e) { /* ignore */ }
        document.getElementById('login-screen').classList.add('adding-account');
        document.getElementById('username').value = expiredAccount.username || expiredAccount.id;
        if (typeof showStatus === 'function') showStatus('פג תוקף החיבור ל' + (expiredAccount.name || expiredAccount.id) + ' - יש להתחבר מחדש', 'info');
        ensureBackButton();
        setTimeout(() => document.getElementById('password').focus(), 150);
    };

    // התנתקות מהמערכת הנוכחית. אם יש מערכות נוספות - עוברים לבאה בתור
    window.accountsLogoutCurrent = function (token) {
        const list = all().filter(a => a.token !== token || !token);
        save(list);
        clearActive();
        const next = list.find(a => a.token);
        if (next) setActive(next);
        location.reload();
    };

    // ---------- פעולות משתמש ----------

    function switchTo(id) {
        const acc = all().find(a => a.id === id);
        if (!acc) return;
        if (!acc.token) return addAccount(acc.username);
        if (acc.token === activeToken()) return closeMenu();
        // לוח ההעתקה של סייר הקבצים שייך למערכת הקודמת
        try { sessionStorage.removeItem('fm_clipboard'); } catch (e) { /* ignore */ }
        setActive(acc);
        showSwitching(acc);
        location.reload();
    }

    function removeAccount(id) {
        const acc = all().find(a => a.id === id);
        if (!acc) return;
        const isCurrent = acc.token && acc.token === activeToken();
        const label = acc.name ? `${acc.name} (${acc.id})` : acc.id;
        if (!confirm(`להסיר את המערכת ${label} מהרשימה?` + (isCurrent ? '\nזו המערכת הפעילה - תתבצע התנתקות ממנה.' : ''))) return;
        if (acc.token) fetch(`${API_BASE}/Logout?token=${encodeURIComponent(acc.token)}`).catch(() => {});
        if (isCurrent) return window.accountsLogoutCurrent(acc.token);
        save(all().filter(a => a.id !== id));
        renderSwitcher();
        openMenu();
    }

    function addAccount(prefillUser) {
        closeMenu();
        try { sessionStorage.setItem(SS_ADD_MODE, '1'); } catch (e) { /* ignore */ }
        document.getElementById('dashboard-screen').style.display = 'none';
        const login = document.getElementById('login-screen');
        login.style.display = 'flex';
        login.classList.add('adding-account');
        document.getElementById('username').value = typeof prefillUser === 'string' ? prefillUser : '';
        document.getElementById('password').value = '';
        document.getElementById('manual-token').value = '';
        // כפתורי ההתחברות נשארים נעולים מההתחברות הקודמת
        if (typeof setLoading === 'function') { setLoading(false, 'login-btn'); setLoading(false, 'token-login-btn'); }
        if (typeof switchTab === 'function') { try { switchTab('user-pass'); } catch (e) { /* ignore */ } }
        if (typeof showStatus === 'function') showStatus(typeof prefillUser === 'string' ? 'פג תוקף החיבור למערכת זו - יש להתחבר מחדש' : 'הוספת מערכת נוספת', 'info');
        ensureBackButton();
        setTimeout(() => {
            const u = document.getElementById('username');
            (u.value ? document.getElementById('password') : u).focus();
        }, 50);
    }

    function cancelAdd() {
        try { sessionStorage.removeItem(SS_ADD_MODE); } catch (e) { /* ignore */ }
        const login = document.getElementById('login-screen');
        login.classList.remove('adding-account');
        if (current() && current().token) {
            login.style.display = 'none';
            document.getElementById('dashboard-screen').style.display = 'flex';
            return;
        }
        // אין מערכת פעילה (למשל פג תוקף) - עוברים למערכת תקינה אחרת
        const other = all().find(a => a.token);
        if (other) { setActive(other); showSwitching(other); location.reload(); }
    }

    function ensureBackButton() {
        if (document.getElementById('accBackBtn')) return;
        const box = document.querySelector('#login-screen .login-body');
        if (!box) return;
        const b = document.createElement('button');
        b.id = 'accBackBtn';
        b.className = 'acc-back-btn';
        b.type = 'button';
        b.innerHTML = '<i class="fas fa-arrow-right"></i> חזרה למערכת הנוכחית';
        b.onclick = cancelAdd;
        box.appendChild(b);
    }

    function showSwitching(acc) {
        const splash = document.getElementById('app-splash-screen');
        if (!splash) return;
        const t = splash.querySelector('.splash-text');
        if (t) t.textContent = 'עובר למערכת ' + (acc.name || acc.id) + '...';
        splash.classList.remove('hidden-splash');
    }

    // ---------- תפריט בחירת מערכת בכותרת ----------
    let menuOpen = false;

    function esc(s) { const d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }

    function renderSwitcher() {
        const row = document.querySelector('#dashboard-screen .user-info-row');
        if (!row) return;
        let wrap = document.getElementById('accSwitcher');
        if (!wrap) {
            wrap = document.createElement('div');
            wrap.id = 'accSwitcher';
            wrap.className = 'acc-switcher';
            row.prepend(wrap);
            document.addEventListener('click', e => { if (menuOpen && !wrap.contains(e.target)) closeMenu(); });
            document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
        }
        const cur = current();
        const list = all();
        const title = cur ? (cur.name || cur.id) : 'מערכת';
        wrap.innerHTML = `
            <button class="acc-current" type="button" title="החלפת מערכת">
                <i class="fas fa-building acc-icon"></i>
                <span class="acc-current-text">
                    <span class="acc-current-name">${esc(title)}</span>
                    ${cur && cur.name ? `<span class="acc-current-id">${esc(cur.id)}</span>` : ''}
                </span>
                ${list.length > 1 ? `<span class="acc-count">${list.length}</span>` : ''}
                <i class="fas fa-chevron-down acc-caret"></i>
            </button>
            <div class="acc-menu hidden">
                <div class="acc-menu-title">המערכות שלי</div>
                <div class="acc-list">
                    ${list.map(a => `
                        <div class="acc-row ${cur && a.id === cur.id ? 'active' : ''} ${a.token ? '' : 'expired'}" data-id="${esc(a.id)}">
                            <button class="acc-pick" type="button" data-id="${esc(a.id)}">
                                <i class="fas ${cur && a.id === cur.id ? 'fa-circle-check' : (a.token ? 'fa-circle' : 'fa-circle-exclamation')}"></i>
                                <span class="acc-row-text">
                                    <span class="acc-row-name">${esc(a.name || a.id)}</span>
                                    <span class="acc-row-sub">${esc(a.id)}${a.token ? '' : ' · נדרשת התחברות'}${a.persist ? '' : ' · ללשונית זו בלבד'}</span>
                                </span>
                            </button>
                            <button class="acc-remove" type="button" data-remove="${esc(a.id)}" title="הסר מהרשימה"><i class="fas fa-xmark"></i></button>
                        </div>`).join('')}
                </div>
                <button class="acc-add" type="button"><i class="fas fa-plus"></i> הוסף מערכת</button>
            </div>`;

        wrap.querySelector('.acc-current').onclick = e => { e.stopPropagation(); menuOpen ? closeMenu() : openMenu(); };
        wrap.querySelector('.acc-add').onclick = e => { e.stopPropagation(); addAccount(); };
        wrap.querySelectorAll('.acc-pick').forEach(b => b.onclick = e => { e.stopPropagation(); switchTo(b.dataset.id); });
        wrap.querySelectorAll('.acc-remove').forEach(b => b.onclick = e => { e.stopPropagation(); removeAccount(b.dataset.remove); });
    }

    function openMenu() {
        const m = document.querySelector('#accSwitcher .acc-menu');
        if (m) { m.classList.remove('hidden'); menuOpen = true; }
    }
    function closeMenu() {
        const m = document.querySelector('#accSwitcher .acc-menu');
        if (m) m.classList.add('hidden');
        menuOpen = false;
    }

    // מעבר שבוצע מלשונית אחרת לא משפיע על לשונית זו (כל לשונית שומרת את הטוקן הפעיל שלה)
    window.addEventListener('storage', e => { if (e.key === LS_KEY) renderSwitcher(); });

    // מערכת שכבר מחוברת מגרסה קודמת (לפני ניהול מערכות מרובות) - תיווסף לרשימה בהתחברות הבאה
    // החיבור פג תוקף - מתחברים מחדש לאותה מערכת
    function reloginCurrent() {
        const cur = current();
        const modal = document.getElementById('session-expired-modal');
        if (modal) modal.style.display = 'none';
        if (!cur) return logout();
        window.accountsOnInvalid(cur.token);
        clearActive();
        addAccount(cur.username || cur.id);
    }

    window.accounts = { all, current, switchTo, addAccount, removeAccount, renderSwitcher, reloginCurrent };
})();
