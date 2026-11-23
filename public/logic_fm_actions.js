// =====================================================================
//  פעולות סייר הקבצים: שלוחה/תיקייה חדשה, קובץ טקסט חדש, העלאת קבצים,
//  שינוי שם, העתקה, גזירה, הדבקה, מחיקה, הורדה, בחירה מרובה,
//  תפריט קליק-ימני וקיצורי מקלדת.
//  נשען על logic_files.js (FM_CONFIG, loadDirectory, openEditor).
// =====================================================================
(function () {
    'use strict';

    const API = () => FM_CONFIG.apiBase;
    const TOKEN = () => FM_CONFIG.token;
    const CLIPBOARD_KEY = 'fm_clipboard';

    let dirListing = { dirs: [], files: [] }; // תוכן התיקייה הנוכחית
    const selected = new Set();               // נתיבים מלאים (ivr2:/...)
    let lastClickedPath = null;

    // ---------- עזרי נתיבים ----------
    function norm(p) {
        // ממיר כל צורה (/1/2, ivr2:1/2, ivr2:/1/2) לצורה אחידה: ivr2:/1/2
        let s = String(p || '').replace(/^ivr2:/, '');
        if (!s.startsWith('/')) s = '/' + s;
        s = s.replace(/\/+/g, '/');
        if (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1);
        return 'ivr2:' + s;
    }
    function plain(p) { return norm(p).replace(/^ivr2:/, ''); }
    function join(dir, name) { const d = plain(dir); return norm((d === '/' ? '' : d) + '/' + name); }
    function parentOf(p) { const s = plain(p); const i = s.lastIndexOf('/'); return norm(i <= 0 ? '/' : s.slice(0, i)); }
    function baseName(p) { const s = plain(p); return s.slice(s.lastIndexOf('/') + 1); }
    function currentDir() { return norm(FM_CONFIG.currentPath || '/'); }
    function existsInCurrent(name) {
        return dirListing.dirs.some(d => d.name === name) || dirListing.files.some(f => f.name === name);
    }
    function isValidName(name) { return !!name && !/[\/\\]/.test(name) && name !== '.' && name !== '..'; }

    // ---------- קריאות API ----------
    async function apiPost(method, params, fileField) {
        // בלי קובץ שולחים urlencoded (FormData ממיר ירידות שורה ל-CRLF)
        const fd = fileField ? new FormData() : new URLSearchParams();
        fd.append('token', TOKEN());
        Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null) fd.append(k, v); });
        if (fileField) fd.append(fileField.name, fileField.file, fileField.fileName || fileField.file.name);
        const res = await fetch(API() + method, { method: 'POST', body: fd });
        const data = await res.json().catch(() => ({ responseStatus: 'ERROR', message: 'תשובה לא תקינה מהשרת' }));
        if (window.checkSessionError && window.checkSessionError(data)) throw new Error('session');
        if (data.responseStatus !== 'OK') throw new Error(data.message || 'שגיאה לא ידועה');
        return data;
    }

    function fileAction(action, whats, target) {
        const params = { action };
        whats.forEach((w, i) => { params['what' + i] = norm(w); });
        if (target) params.target = norm(target);
        return apiPost('FileAction', params);
    }

    // ---------- הודעות קופצות (Toast) ----------
    function toast(msg, type = 'ok') {
        let box = document.getElementById('fmToastBox');
        if (!box) {
            box = document.createElement('div');
            box.id = 'fmToastBox';
            document.body.appendChild(box);
        }
        const t = document.createElement('div');
        t.className = 'fm-toast ' + type;
        const icon = type === 'error' ? 'fa-circle-exclamation' : (type === 'info' ? 'fa-circle-info' : 'fa-circle-check');
        t.innerHTML = `<i class="fas ${icon}"></i><span></span>`;
        t.querySelector('span').textContent = msg;
        box.appendChild(t);
        setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, type === 'error' ? 6000 : 3000);
    }

    async function run(label, fn) {
        const loader = document.getElementById('fmLoader');
        if (loader) loader.classList.remove('hidden');
        try {
            await fn();
            return true;
        } catch (e) {
            if (e.message !== 'session') toast(label + ' נכשל: ' + e.message, 'error');
            return false;
        } finally {
            if (loader) loader.classList.add('hidden');
        }
    }

    function refresh() { loadDirectory(FM_CONFIG.currentPath); }

    // ---------- דיאלוג כללי ----------
    // fields: [{id,label,type:'text'|'select'|'textarea'|'checkbox'|'file',value,options:[[v,t]],placeholder,ltr,hint}]
    function dialog({ title, icon = 'fa-pen', fields = [], okText = 'אישור', message, danger = false, wide = false }) {
        return new Promise(resolve => {
            const overlay = document.createElement('div');
            overlay.className = 'fm-modal fm-dialog';
            overlay.innerHTML = `
                <div class="fm-modal-content fm-dialog-box ${wide ? 'wide' : ''}">
                    <div class="fm-modal-header">
                        <h3><i class="fas ${icon}"></i> <span class="dlg-title"></span></h3>
                        <button class="close-modal-btn dlg-x"><i class="fas fa-times"></i></button>
                    </div>
                    <div class="fm-modal-body dlg-body"></div>
                    <div class="fm-modal-footer">
                        <button class="fm-btn-secondary dlg-cancel">ביטול</button>
                        <button class="${danger ? 'fm-btn-danger' : 'fm-btn-primary'} dlg-ok"></button>
                    </div>
                </div>`;
            overlay.querySelector('.dlg-title').textContent = title;
            overlay.querySelector('.dlg-ok').textContent = okText;
            const body = overlay.querySelector('.dlg-body');

            if (message) {
                const p = document.createElement('div');
                p.className = 'dlg-message';
                p.textContent = message;
                body.appendChild(p);
            }

            const inputs = {};
            fields.forEach(f => {
                const g = document.createElement('div');
                g.className = 'form-group dlg-group' + (f.type === 'checkbox' ? ' dlg-check' : '');
                if (f.showIf) g.dataset.showIf = JSON.stringify(f.showIf);
                let el;
                if (f.type === 'select') {
                    el = document.createElement('select');
                    el.className = 'fm-input dlg-select';
                    f.options.forEach(([v, t]) => {
                        const o = document.createElement('option');
                        o.value = v; o.textContent = t;
                        el.appendChild(o);
                    });
                    if (f.value !== undefined) el.value = f.value;
                } else if (f.type === 'textarea') {
                    el = document.createElement('textarea');
                    el.className = 'fm-textarea dlg-textarea';
                    el.value = f.value || '';
                } else if (f.type === 'checkbox') {
                    el = document.createElement('input');
                    el.type = 'checkbox';
                    el.checked = !!f.value;
                } else if (f.type === 'file') {
                    el = document.createElement('input');
                    el.type = 'file';
                    el.multiple = !!f.multiple;
                    el.className = 'fm-input';
                } else {
                    el = document.createElement('input');
                    el.type = 'text';
                    el.className = 'fm-input';
                    el.value = f.value || '';
                    el.placeholder = f.placeholder || '';
                }
                if (!f.ltr && f.type !== 'checkbox') el.classList.add('rtl');
                el.id = 'dlg_' + f.id;
                const label = document.createElement('label');
                label.htmlFor = el.id;
                label.textContent = f.label;
                if (f.type === 'checkbox') { g.appendChild(el); g.appendChild(label); }
                else { g.appendChild(label); g.appendChild(el); }
                if (f.hint) {
                    const h = document.createElement('div');
                    h.className = 'dlg-hint';
                    h.textContent = f.hint;
                    g.appendChild(h);
                }
                body.appendChild(g);
                inputs[f.id] = el;
            });

            // הצגת שדות לפי ערך של שדה אחר
            function applyShowIf() {
                body.querySelectorAll('[data-show-if]').forEach(g => {
                    const cond = JSON.parse(g.dataset.showIf);
                    const src = inputs[cond.field];
                    const val = src.type === 'checkbox' ? src.checked : src.value;
                    const ok = Array.isArray(cond.in) ? cond.in.includes(val) : (cond.not !== undefined ? val !== cond.not : val === cond.eq);
                    g.style.display = ok ? '' : 'none';
                });
            }
            Object.values(inputs).forEach(el => el.addEventListener('change', applyShowIf));
            applyShowIf();

            function close(result) {
                document.removeEventListener('keydown', onKey, true);
                overlay.remove();
                resolve(result);
            }
            function collect() {
                const out = {};
                Object.entries(inputs).forEach(([k, el]) => {
                    out[k] = el.type === 'checkbox' ? el.checked : (el.type === 'file' ? Array.from(el.files) : el.value);
                });
                return out;
            }
            function onKey(e) {
                if (e.key === 'Escape') { e.stopPropagation(); close(null); }
                if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); e.stopPropagation(); close(collect()); }
            }
            overlay.querySelector('.dlg-x').onclick = () => close(null);
            overlay.querySelector('.dlg-cancel').onclick = () => close(null);
            overlay.querySelector('.dlg-ok').onclick = () => close(collect());
            document.addEventListener('keydown', onKey, true);
            document.body.appendChild(overlay);
            const first = body.querySelector('input[type=text], textarea, select');
            if (first) { first.focus(); if (first.select) first.select(); }
            else overlay.querySelector('.dlg-ok').focus();
        });
    }

    async function confirmDialog(message, okText = 'אישור', danger = false, title = 'אישור פעולה') {
        const r = await dialog({ title, icon: danger ? 'fa-triangle-exclamation' : 'fa-circle-question', message, okText, danger });
        return r !== null;
    }

    // ---------- בחירה ----------
    function cards() { return Array.from(document.querySelectorAll('#fmContainer .fm-item[data-path]')); }
    function cardByPath(p) { return cards().find(c => norm(c.dataset.path) === p); }

    function setSelected(p, on) {
        if (on) selected.add(p); else selected.delete(p);
        const c = cardByPath(p);
        if (c) {
            c.classList.toggle('selected', on);
            const cb = c.querySelector('.fm-select-box');
            if (cb) cb.checked = on;
        }
    }
    function clearSelection() { Array.from(selected).forEach(p => setSelected(p, false)); updateBars(); }
    function selectAll() { cards().forEach(c => setSelected(norm(c.dataset.path), true)); updateBars(); }
    function selectedItems() {
        return Array.from(selected).map(p => {
            const c = cardByPath(p);
            return { path: p, name: c ? c.dataset.name : baseName(p), kind: c ? c.dataset.kind : 'file' };
        });
    }

    function toggleWithModifiers(card, e) {
        const p = norm(card.dataset.path);
        if (e.shiftKey && lastClickedPath) {
            const all = cards().map(c => norm(c.dataset.path));
            let a = all.indexOf(lastClickedPath), b = all.indexOf(p);
            if (a > b) [a, b] = [b, a];
            for (let i = a; i <= b; i++) setSelected(all[i], true);
        } else {
            setSelected(p, !selected.has(p));
            lastClickedPath = p;
        }
        updateBars();
    }

    // נקרא מ-logic_files.js עבור כל כרטיס
    window.fmDecorateCard = function (card) {
        const p = norm(card.dataset.path);

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'fm-select-box';
        cb.title = 'בחר';
        cb.addEventListener('click', e => {
            e.stopPropagation();
            setSelected(p, cb.checked);
            lastClickedPath = p;
            updateBars();
        });
        card.appendChild(cb);

        const more = document.createElement('button');
        more.className = 'fm-more-btn';
        more.title = 'פעולות';
        more.innerHTML = '<i class="fas fa-ellipsis-vertical"></i>';
        more.addEventListener('click', e => {
            e.stopPropagation();
            if (!selected.has(p)) { clearSelection(); setSelected(p, true); updateBars(); }
            const r = more.getBoundingClientRect();
            openContextMenu(r.left, r.bottom, card);
        });
        card.appendChild(more);

        if (selected.has(p)) card.classList.add('selected'), (cb.checked = true);
        const clip = getClipboard();
        if (clip && clip.action === 'move' && clip.items.some(i => norm(i.path) === p)) card.classList.add('cut-pending');
    };

    window.fmOnDirLoaded = function (path, data) {
        dirListing = { dirs: data.dirs || [], files: [...(data.files || []), ...(data.ini || [])] };
        selected.clear();
        lastClickedPath = null;
        setTimeout(updateBars, 0);
    };

    // ---------- לוח העתקה ----------
    function getClipboard() {
        try { return JSON.parse(sessionStorage.getItem(CLIPBOARD_KEY) || 'null'); } catch (e) { return null; }
    }
    function setClipboard(action, items) {
        try {
            if (action) sessionStorage.setItem(CLIPBOARD_KEY, JSON.stringify({ action, items }));
            else sessionStorage.removeItem(CLIPBOARD_KEY);
        } catch (e) { /* ignore */ }
        document.querySelectorAll('.fm-item.cut-pending').forEach(c => c.classList.remove('cut-pending'));
        if (action === 'move') items.forEach(i => { const c = cardByPath(norm(i.path)); if (c) c.classList.add('cut-pending'); });
        updateBars();
    }

    function copySelected(action) {
        const items = selectedItems();
        if (!items.length) return toast('לא נבחרו פריטים', 'info');
        setClipboard(action, items);
        toast((action === 'move' ? 'נגזרו ' : 'הועתקו ') + items.length + ' פריטים. עבור לתיקיית היעד ולחץ "הדבק"', 'info');
    }

    async function paste() {
        const clip = getClipboard();
        if (!clip || !clip.items.length) return toast('הלוח ריק', 'info');
        const target = currentDir();

        // בדיקות תקינות
        for (const it of clip.items) {
            const src = norm(it.path);
            if (it.kind === 'dir' && (target === src || target.startsWith(src + '/'))) {
                return toast('לא ניתן להדביק תיקייה לתוך עצמה', 'error');
            }
        }
        const sameDir = clip.items.every(it => parentOf(it.path) === target);
        if (sameDir) {
            if (clip.action === 'move') return toast('הפריטים כבר נמצאים בתיקייה זו', 'info');
            return pasteDuplicate(clip.items);
        }
        const conflicts = clip.items.filter(it => existsInCurrent(it.name)).map(it => it.name);
        if (conflicts.length && !(await confirmDialog('הפריטים הבאים כבר קיימים בתיקייה זו ויידרסו:\n' + conflicts.join(', ') + '\n\nלהמשיך?', 'דרוס', true))) return;

        const ok = await run('ההדבקה', () => fileAction(clip.action, clip.items.map(i => i.path), target));
        if (ok) {
            toast((clip.action === 'move' ? 'הועברו ' : 'הועתקו ') + clip.items.length + ' פריטים');
            if (clip.action === 'move') setClipboard(null);
            refresh();
        }
    }

    // העתקה לאותה תיקייה - יוצר עותק בשם חדש
    async function pasteDuplicate(items) {
        const ok = await run('יצירת העותק', async () => {
            for (const it of items) {
                const newName = uniqueCopyName(it.name, it.kind);
                await fileAction('copy', [it.path], join(currentDir(), newName));
            }
        });
        if (ok) { toast('נוצרו עותקים'); refresh(); }
    }
    function uniqueCopyName(name, kind) {
        const dot = kind === 'file' ? name.lastIndexOf('.') : -1;
        const base = dot > 0 ? name.slice(0, dot) : name;
        const ext = dot > 0 ? name.slice(dot) : '';
        // שלוחות הן לרוב מספרים - מציע את המספר הפנוי הבא
        if (kind === 'dir' && /^\d+$/.test(base)) {
            let n = parseInt(base, 10) + 1;
            while (existsInCurrent(String(n))) n++;
            return String(n);
        }
        let i = 1, candidate;
        do { candidate = `${base}_copy${i > 1 ? i : ''}${ext}`; i++; } while (existsInCurrent(candidate));
        return candidate;
    }

    // ---------- מחיקה ----------
    async function deleteSelected() {
        const items = selectedItems();
        if (!items.length) return toast('לא נבחרו פריטים', 'info');
        const dirs = items.filter(i => i.kind === 'dir').length;
        let msg = items.length === 1 ? `למחוק את "${items[0].name}"?` : `למחוק ${items.length} פריטים?\n${items.map(i => i.name).join(', ')}`;
        if (dirs) msg += '\n\nשים לב: מחיקת שלוחה/תיקייה מוחקת גם את כל התוכן שבתוכה!';
        msg += '\nלא ניתן לשחזר פעולה זו.';
        if (!(await confirmDialog(msg, 'מחק', true, 'מחיקה'))) return;
        const ok = await run('המחיקה', () => fileAction('delete', items.map(i => i.path)));
        if (ok) { toast('נמחקו ' + items.length + ' פריטים'); refresh(); }
    }

    // ---------- שינוי שם ----------
    async function renameSelected() {
        const items = selectedItems();
        if (items.length !== 1) return toast('יש לבחור פריט אחד לשינוי שם', 'info');
        const it = items[0];
        const r = await dialog({
            title: 'שינוי שם', icon: 'fa-i-cursor', okText: 'שנה שם',
            fields: [{ id: 'name', label: it.kind === 'dir' ? 'שם/מספר חדש לשלוחה:' : 'שם חדש לקובץ:', value: it.name, ltr: true }]
        });
        if (!r) return;
        const newName = r.name.trim();
        if (!isValidName(newName)) return toast('שם לא תקין', 'error');
        if (newName === it.name) return;
        if (existsInCurrent(newName) && !(await confirmDialog(`"${newName}" כבר קיים. לדרוס?`, 'דרוס', true))) return;
        const ok = await run('שינוי השם', () => fileAction('move', [it.path], join(parentOf(it.path), newName)));
        if (ok) { toast('השם שונה ל-' + newName); refresh(); }
    }

    // ---------- הורדה ----------
    async function downloadSelected() {
        const files = selectedItems().filter(i => i.kind === 'file');
        if (!files.length) return toast('יש לבחור קבצים להורדה (לא תיקיות)', 'info');
        await run('ההורדה', async () => {
            for (const f of files) {
                const res = await fetch(`${API()}DownloadFile?token=${encodeURIComponent(TOKEN())}&path=${encodeURIComponent(norm(f.path))}`);
                const ct = res.headers.get('content-type') || '';
                if (ct.includes('application/json')) {
                    const data = await res.json();
                    if (window.checkSessionError && window.checkSessionError(data)) throw new Error('session');
                    if (data.responseStatus && data.responseStatus !== 'OK') throw new Error(data.message || f.name);
                }
                if (!res.ok) throw new Error(f.name);
                const blob = await res.blob();
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = f.name;
                document.body.appendChild(a); a.click(); a.remove();
                setTimeout(() => URL.revokeObjectURL(a.href), 5000);
            }
        });
    }

    // ---------- שלוחה / תיקייה חדשה ----------
    function nextFreeNumber() {
        let n = 1;
        while (existsInCurrent(String(n))) n++;
        return String(n);
    }

    async function newExtension(presetType) {
        const types = (window.EXT_TYPES || [['normal_folder', 'תיקייה רגילה'], ['menu', 'תפריט'], ['playfile', 'השמעת קבצים']]);
        const r = await dialog({
            title: 'שלוחה / תיקייה חדשה', icon: 'fa-folder-plus', okText: 'צור',
            fields: [
                { id: 'type', label: 'סוג השלוחה:', type: 'select', value: presetType || 'menu', options: types },
                { id: 'name', label: 'מספר השלוחה:', value: nextFreeNumber(), ltr: true, hint: 'בשלוחה יש להשתמש בספרות בלבד. בתיקייה רגילה ניתן לבחור כל שם.' },
                { id: 'title', label: 'כותרת (title) - שם תיאורי לשלוחה:', showIf: { field: 'type', not: 'normal_folder' } },
                { id: 'extra', label: 'הגדרות נוספות ל-ext.ini (לא חובה, שורה לכל הגדרה):', type: 'textarea', ltr: true, showIf: { field: 'type', not: 'normal_folder' } },
                { id: 'open', label: 'פתח את השלוחה לאחר היצירה', type: 'checkbox', value: false }
            ]
        });
        if (!r) return;
        const name = r.name.trim();
        if (!isValidName(name)) return toast('שם לא תקין', 'error');
        if (r.type !== 'normal_folder' && !/^\d+$/.test(name)) return toast('מספר שלוחה חייב להכיל ספרות בלבד', 'error');
        if (existsInCurrent(name) && !(await confirmDialog(`"${name}" כבר קיים בתיקייה זו. להמשיך ולדרוס את ההגדרות?`, 'דרוס', true))) return;

        const path = join(currentDir(), name);
        const ok = await run('יצירת השלוחה', async () => {
            await apiPost('UpdateExtension', { path });
            if (r.type !== 'normal_folder') {
                let ini = 'type=' + r.type;
                if (r.title.trim()) ini += '\ntitle=' + r.title.trim();
                const extra = (r.extra || '').trim();
                if (extra) ini += '\n' + extra;
                await apiPost('UploadTextFile', { what: path + '/ext.ini', contents: ini });
            }
        });
        if (ok) {
            toast((r.type === 'normal_folder' ? 'התיקייה ' : 'השלוחה ') + name + ' נוצרה');
            if (r.open) loadDirectory(plain(path)); else refresh();
        }
    }

    // ---------- קובץ טקסט חדש ----------
    async function newTextFile() {
        const r = await dialog({
            title: 'קובץ חדש', icon: 'fa-file-circle-plus', okText: 'צור', wide: true,
            fields: [
                { id: 'kind', label: 'סוג הקובץ:', type: 'select', value: 'tts', options: [
                    ['tts', 'הקראת טקסט (tts)'], ['txt', 'קובץ טקסט (txt)'], ['ini', 'קובץ הגדרות (ini)'], ['ext.ini', 'הגדרות שלוחה (ext.ini)'], ['other', 'אחר (שם מלא כולל סיומת)']] },
                { id: 'name', label: 'שם הקובץ (ללא סיומת):', value: '', ltr: true, placeholder: 'לדוגמה: 000 או M1000', showIf: { field: 'kind', in: ['tts', 'txt', 'ini', 'other'] } },
                { id: 'contents', label: 'תוכן:', type: 'textarea', ltr: false }
            ]
        });
        if (!r) return;
        let name;
        if (r.kind === 'ext.ini') name = 'ext.ini';
        else if (r.kind === 'other') name = r.name.trim();
        else name = r.name.trim().replace(new RegExp('\\.' + r.kind + '$', 'i'), '') + '.' + r.kind;
        if (!isValidName(name) || name.startsWith('.')) return toast('יש להזין שם קובץ תקין', 'error');
        if (existsInCurrent(name) && !(await confirmDialog(`הקובץ "${name}" כבר קיים. לדרוס?`, 'דרוס', true))) return;
        const ok = await run('יצירת הקובץ', () => apiPost('UploadTextFile', { what: join(currentDir(), name), contents: r.contents }));
        if (ok) { toast('הקובץ ' + name + ' נוצר'); refresh(); }
    }

    // ---------- העלאת קבצים ----------
    async function uploadDialog(preFiles) {
        const fields = [];
        if (!preFiles) fields.push({ id: 'files', label: 'בחר קבצים:', type: 'file', multiple: true, ltr: true });
        fields.push(
            { id: 'naming', label: 'שמות הקבצים בשרת:', type: 'select', value: 'keep', options: [['keep', 'שמור על השם המקורי'], ['auto', 'מספור אוטומטי (000, 001, ...)']] },
            { id: 'convert', label: 'המר קבצי שמע לפורמט המערכת (WAV)', type: 'checkbox', value: true }
        );
        const r = await dialog({
            title: preFiles ? `העלאת ${preFiles.length} קבצים` : 'העלאת קבצים', icon: 'fa-cloud-arrow-up', okText: 'העלה',
            message: 'הקבצים יועלו לתיקייה: ' + plain(currentDir()), fields
        });
        if (!r) return;
        const files = preFiles || r.files;
        if (!files || !files.length) return toast('לא נבחרו קבצים', 'info');
        await uploadFiles(files, r.naming === 'auto', r.convert);
    }

    async function uploadFiles(files, autoNumbering, convert) {
        if (!autoNumbering) {
            const conflicts = files.map(f => targetName(f.name, convert)).filter(existsInCurrent);
            if (conflicts.length && !(await confirmDialog('הקבצים הבאים כבר קיימים ויידרסו:\n' + conflicts.join(', ') + '\n\nלהמשיך?', 'דרוס', true))) return;
        }
        const progress = showProgress(files.length);
        let done = 0, failed = [];
        for (const f of files) {
            progress.update(done, f.name);
            try {
                const params = { convertAudio: convert && isAudio(f.name) ? 1 : 0 };
                if (autoNumbering) {
                    params.path = plain(currentDir()) === '/' ? 'ivr2:/' : norm(currentDir()) + '/';
                    params.autoNumbering = 'true';
                } else {
                    params.path = join(currentDir(), f.name);
                }
                await apiPost('UploadFile', params, { name: 'upload', file: f });
            } catch (e) {
                if (e.message === 'session') { progress.close(); return; }
                failed.push(f.name + ' (' + e.message + ')');
            }
            done++;
        }
        progress.close();
        if (failed.length) toast('חלק מהקבצים לא הועלו: ' + failed.join(', '), 'error');
        if (done - failed.length > 0) toast('הועלו ' + (done - failed.length) + ' קבצים');
        refresh();
    }
    function isAudio(n) { return /\.(wav|mp3|ogg|m4a|aac|wma|flac|amr|opus|webm|mp4)$/i.test(n); }
    function targetName(n, convert) { return convert && isAudio(n) && !/\.wav$/i.test(n) ? n.replace(/\.[^.]+$/, '.wav') : n; }

    function showProgress(total) {
        const el = document.createElement('div');
        el.className = 'fm-progress';
        el.innerHTML = '<div class="fm-progress-text"></div><div class="fm-progress-bar"><div></div></div>';
        document.body.appendChild(el);
        return {
            update(done, name) {
                el.querySelector('.fm-progress-text').textContent = `מעלה ${done + 1} מתוך ${total}: ${name}`;
                el.querySelector('.fm-progress-bar div').style.width = Math.round(done / total * 100) + '%';
            },
            close() { el.remove(); }
        };
    }

    // ---------- הגדרות שלוחה ----------
    function editExtIni(dirPath) {
        if (typeof openEditor === 'function') openEditor(plain(dirPath) + '/ext.ini', cardByPath(norm(dirPath)));
    }

    function goUp() {
        const cur = plain(currentDir());
        if (cur === '/') return;
        loadDirectory(plain(parentOf(cur)));
    }

    // ---------- תפריט קליק ימני ----------
    let menuEl = null;
    function closeContextMenu() { if (menuEl) { menuEl.remove(); menuEl = null; } }

    function openContextMenu(x, y, card) {
        closeContextMenu();
        const items = selectedItems();
        const clip = getClipboard();
        const single = items.length === 1 ? items[0] : null;
        const entries = [];

        if (card && single) {
            entries.push({ icon: single.kind === 'dir' ? 'fa-folder-open' : 'fa-up-right-from-square', text: 'פתח', act: () => card.click() });
            if (single.kind === 'dir') entries.push({ icon: 'fa-sliders', text: 'הגדרות שלוחה (ext.ini)', act: () => editExtIni(single.path) });
            entries.push('-');
        }
        if (card) {
            entries.push({ icon: 'fa-copy', text: 'העתק', key: 'Ctrl+C', act: () => copySelected('copy') });
            entries.push({ icon: 'fa-scissors', text: 'גזור', key: 'Ctrl+X', act: () => copySelected('move') });
        }
        if (clip && clip.items.length) entries.push({ icon: 'fa-paste', text: `הדבק כאן (${clip.items.length})`, key: 'Ctrl+V', act: paste });
        if (card) {
            if (single) entries.push({ icon: 'fa-i-cursor', text: 'שנה שם', key: 'F2', act: renameSelected });
            if (items.some(i => i.kind === 'file')) entries.push({ icon: 'fa-download', text: 'הורד', act: downloadSelected });
            entries.push('-');
            entries.push({ icon: 'fa-trash-can', text: items.length > 1 ? `מחק (${items.length})` : 'מחק', key: 'Del', act: deleteSelected, danger: true });
        } else {
            if (entries.length) entries.push('-');
            entries.push({ icon: 'fa-folder-plus', text: 'שלוחה / תיקייה חדשה', act: () => newExtension() });
            entries.push({ icon: 'fa-file-circle-plus', text: 'קובץ חדש', act: newTextFile });
            entries.push({ icon: 'fa-cloud-arrow-up', text: 'העלאת קבצים', act: () => uploadDialog() });
            entries.push({ icon: 'fa-sliders', text: 'הגדרות השלוחה הנוכחית', act: () => editExtIni(currentDir()) });
            entries.push('-');
            entries.push({ icon: 'fa-check-double', text: 'בחר הכל', key: 'Ctrl+A', act: selectAll });
            entries.push({ icon: 'fa-rotate', text: 'רענן', act: refresh });
        }

        menuEl = document.createElement('div');
        menuEl.className = 'fm-context-menu';
        entries.forEach(en => {
            if (en === '-') { const s = document.createElement('div'); s.className = 'fm-cm-sep'; menuEl.appendChild(s); return; }
            const b = document.createElement('button');
            b.className = 'fm-cm-item' + (en.danger ? ' danger' : '');
            b.innerHTML = `<i class="fas ${en.icon}"></i><span></span>${en.key ? `<kbd>${en.key}</kbd>` : ''}`;
            b.querySelector('span').textContent = en.text;
            b.onclick = e => { e.stopPropagation(); closeContextMenu(); en.act(); };
            menuEl.appendChild(b);
        });
        document.body.appendChild(menuEl);
        const r = menuEl.getBoundingClientRect();
        menuEl.style.left = Math.max(5, Math.min(x, window.innerWidth - r.width - 5)) + 'px';
        menuEl.style.top = Math.max(5, Math.min(y, window.innerHeight - r.height - 5)) + 'px';
    }

    // ---------- סרגל כלים ----------
    function buildToolbar() {
        const actions = document.querySelector('#fm-view .fm-actions');
        if (!actions || document.getElementById('fmActionsBar')) return;

        const bar = document.createElement('div');
        bar.id = 'fmActionsBar';
        bar.className = 'fm-actions-bar';
        bar.innerHTML = `
            <button class="fm-tb-btn" data-act="up" title="תיקייה למעלה (Backspace)"><i class="fas fa-arrow-turn-up"></i></button>
            <span class="fm-tb-sep"></span>
            <button class="fm-tb-btn primary" data-act="newExt" title="שלוחה / תיקייה חדשה"><i class="fas fa-folder-plus"></i><span>שלוחה חדשה</span></button>
            <button class="fm-tb-btn" data-act="newFile" title="קובץ טקסט / tts / ini חדש"><i class="fas fa-file-circle-plus"></i><span>קובץ חדש</span></button>
            <button class="fm-tb-btn" data-act="upload" title="העלאת קבצים (ניתן גם לגרור קבצים לחלון)"><i class="fas fa-cloud-arrow-up"></i><span>העלאה</span></button>
            <button class="fm-tb-btn" data-act="extIni" title="עריכת הגדרות השלוחה הנוכחית (ext.ini)"><i class="fas fa-sliders"></i><span>הגדרות שלוחה</span></button>
            <span class="fm-tb-sep"></span>
            <button class="fm-tb-btn" data-act="paste" id="fmPasteBtn" title="הדבק (Ctrl+V)"><i class="fas fa-paste"></i><span>הדבק</span></button>`;
        actions.prepend(bar);

        const sel = document.createElement('div');
        sel.id = 'fmSelectionBar';
        sel.className = 'fm-selection-bar hidden';
        sel.innerHTML = `
            <span class="fm-sel-count"></span>
            <button class="fm-tb-btn" data-act="copy" title="העתק (Ctrl+C)"><i class="fas fa-copy"></i><span>העתק</span></button>
            <button class="fm-tb-btn" data-act="cut" title="גזור (Ctrl+X)"><i class="fas fa-scissors"></i><span>גזור</span></button>
            <button class="fm-tb-btn" data-act="rename" title="שנה שם (F2)"><i class="fas fa-i-cursor"></i><span>שנה שם</span></button>
            <button class="fm-tb-btn" data-act="download" title="הורד"><i class="fas fa-download"></i><span>הורד</span></button>
            <button class="fm-tb-btn danger" data-act="delete" title="מחק (Delete)"><i class="fas fa-trash-can"></i><span>מחק</span></button>
            <span class="fm-tb-sep"></span>
            <button class="fm-tb-btn" data-act="selectAll" title="בחר הכל (Ctrl+A)"><i class="fas fa-check-double"></i></button>
            <button class="fm-tb-btn" data-act="clearSel" title="בטל בחירה (Esc)"><i class="fas fa-xmark"></i></button>`;
        const toolbar = document.querySelector('#fm-view .fm-toolbar');
        toolbar.after(sel);

        const handlers = {
            up: goUp, newExt: () => newExtension(), newFile: newTextFile, upload: () => uploadDialog(),
            extIni: () => editExtIni(currentDir()), paste,
            copy: () => copySelected('copy'), cut: () => copySelected('move'), rename: renameSelected,
            download: downloadSelected, delete: deleteSelected, selectAll, clearSel: clearSelection
        };
        [bar, sel].forEach(b => b.addEventListener('click', e => {
            const btn = e.target.closest('[data-act]');
            if (btn && !btn.disabled) handlers[btn.dataset.act]();
        }));
        updateBars();
    }

    function updateBars() {
        const sel = document.getElementById('fmSelectionBar');
        if (sel) {
            const items = selectedItems();
            sel.classList.toggle('hidden', items.length === 0);
            sel.querySelector('.fm-sel-count').textContent = `נבחרו ${items.length} פריטים`;
            sel.querySelector('[data-act=rename]').disabled = items.length !== 1;
            sel.querySelector('[data-act=download]').disabled = !items.some(i => i.kind === 'file');
        }
        const pb = document.getElementById('fmPasteBtn');
        if (pb) {
            const clip = getClipboard();
            const n = clip && clip.items ? clip.items.length : 0;
            pb.disabled = !n;
            pb.querySelector('span').textContent = n ? `הדבק (${n})` : 'הדבק';
            pb.classList.toggle('has-items', !!n);
            pb.title = n ? (clip.action === 'move' ? 'העבר לכאן: ' : 'העתק לכאן: ') + clip.items.map(i => i.name).join(', ') : 'הלוח ריק';
        }
        const up = document.querySelector('#fmActionsBar [data-act=up]');
        if (up) up.disabled = plain(currentDir()) === '/';
    }

    // ---------- אירועים ----------
    function fmVisible() {
        const v = document.getElementById('fm-view');
        const d = document.getElementById('dashboard-screen');
        return v && d && v.style.display !== 'none' && d.style.display !== 'none';
    }
    function modalOpen() {
        return !!document.querySelector('.fm-modal:not(.hidden), .modal-overlay[style*="flex"]');
    }

    function bindEvents() {
        const container = document.getElementById('fmContainer');
        const scroll = document.querySelector('#fm-view .fm-scroll-container');
        if (!container || !scroll) return;

        // Ctrl/Shift + קליק = בחירה (בשלב ה-capture כדי לא לפתוח את הפריט)
        container.addEventListener('click', e => {
            const card = e.target.closest('.fm-item[data-path]');
            if (!card || e.target.closest('.fm-select-box, .fm-more-btn')) return;
            if (e.ctrlKey || e.metaKey || e.shiftKey) {
                e.preventDefault();
                e.stopPropagation();
                toggleWithModifiers(card, e);
            }
        }, true);

        // קליק על שטח ריק מבטל בחירה
        scroll.addEventListener('click', e => {
            if (!e.target.closest('.fm-item')) clearSelection();
        });

        // תפריט קליק ימני
        scroll.addEventListener('contextmenu', e => {
            e.preventDefault();
            const card = e.target.closest('.fm-item[data-path]');
            if (card) {
                const p = norm(card.dataset.path);
                if (!selected.has(p)) { clearSelection(); setSelected(p, true); lastClickedPath = p; updateBars(); }
            }
            openContextMenu(e.clientX, e.clientY, card);
        });

        document.addEventListener('click', closeContextMenu);
        window.addEventListener('blur', closeContextMenu);
        scroll.addEventListener('scroll', closeContextMenu);

        // גרירת קבצים מהמחשב להעלאה
        let dragDepth = 0;
        scroll.addEventListener('dragenter', e => {
            if (!e.dataTransfer || !Array.from(e.dataTransfer.types).includes('Files')) return;
            e.preventDefault(); dragDepth++; scroll.classList.add('fm-drop-active');
        });
        scroll.addEventListener('dragover', e => {
            if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) e.preventDefault();
        });
        scroll.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; scroll.classList.remove('fm-drop-active'); } });
        scroll.addEventListener('drop', e => {
            if (!e.dataTransfer || !e.dataTransfer.files.length) return;
            e.preventDefault(); dragDepth = 0; scroll.classList.remove('fm-drop-active');
            uploadDialog(Array.from(e.dataTransfer.files));
        });

        // קיצורי מקלדת
        document.addEventListener('keydown', e => {
            if (!fmVisible() || modalOpen()) return;
            const tag = (e.target.tagName || '').toLowerCase();
            if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;
            const ctrl = e.ctrlKey || e.metaKey;
            const k = e.key.toLowerCase();
            // תמיכה גם במקלדת בעברית (ב=c, ס=x, ה=v, ש=a)
            const code = e.code;
            if (ctrl && (k === 'c' || code === 'KeyC')) { if (selected.size) { e.preventDefault(); copySelected('copy'); } }
            else if (ctrl && (k === 'x' || code === 'KeyX')) { if (selected.size) { e.preventDefault(); copySelected('move'); } }
            else if (ctrl && (k === 'v' || code === 'KeyV')) { e.preventDefault(); paste(); }
            else if (ctrl && (k === 'a' || code === 'KeyA')) { e.preventDefault(); selectAll(); }
            else if (e.key === 'Delete') { if (selected.size) { e.preventDefault(); deleteSelected(); } }
            else if (e.key === 'F2') { if (selected.size === 1) { e.preventDefault(); renameSelected(); } }
            else if (e.key === 'Escape') { closeContextMenu(); clearSelection(); }
            else if (e.key === 'Backspace') { e.preventDefault(); goUp(); }
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        buildToolbar();
        bindEvents();
    });

    // חשיפה לשימוש חיצוני
    window.fmActions = { newExtension, newTextFile, uploadDialog, paste, copySelected, deleteSelected, renameSelected, downloadSelected, selectAll, clearSelection, goUp, refresh };
})();
