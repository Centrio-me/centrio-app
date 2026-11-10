'use strict'
// «Все мессенджеры» (3.8): how each messenger's web page shows its chat list. Every adapter has
//   match(url)      — whether a tab is this messenger
//   LIST            — a page script that returns [{ key, title, preview, time, unread, muted, avatar }]
//   locate(key)     — a page script that scrolls that chat into view and returns its centre { x, y } (or null);
//                     the tab then gets a real click there (the pages ignore synthetic clicks)
// Everything runs inside the page through webview.executeJavaScript; nothing leaves the computer.
// Page scripts are plain ES5 strings: no names that a minifier could change.

const MAX_CHATS = 60
// Telegram gives its whole dialog list; the freshest ones are enough for one screen of history
const TELEGRAM_CHATS = 150

// A blob:/data: avatar (Telegram keeps them as blob: URLs only that page can read) becomes a small data URL,
// cached per chat in the page so it is drawn once.
const AVATAR_HELPER = `
var __ciAv = window.__centrioInboxAvatars || (window.__centrioInboxAvatars = {});
function __ciAvatar(key, img) {
    if (!img || !img.src) return '';
    if (/^https?:/i.test(img.src)) return img.src;
    if (__ciAv[key] && __ciAv[key].src === img.src) return __ciAv[key].data;
    try {
        if (!img.complete || !img.naturalWidth) return '';
        var c = document.createElement('canvas'); c.width = 64; c.height = 64;
        c.getContext('2d').drawImage(img, 0, 0, 64, 64);
        var data = c.toDataURL('image/jpeg', 0.8);
        __ciAv[key] = { src: img.src, data: data };
        return data;
    } catch (e) { return ''; }
}
// Emoji drawn as pictures (MAX, Telegram) become their characters, so names and texts keep them
function __ciEmojiText(root) {
    // MAX keeps the character on a wrapper around its emoji picture
    var marked = root.querySelectorAll('[data-lexical-emoji]');
    for (var m = 0; m < marked.length; m++) marked[m].replaceWith(document.createTextNode(marked[m].getAttribute('data-lexical-emoji') || ''));
    var pics = root.querySelectorAll('img[alt]');
    for (var i = 0; i < pics.length; i++) { var alt = pics[i].getAttribute('alt') || ''; if (alt && alt.length <= 16) pics[i].replaceWith(document.createTextNode(alt)); }
    return root;
}
function __ciText(el) {
    if (!el) return '';
    if (el.querySelector && el.querySelector('img[alt], [data-lexical-emoji]')) el = __ciEmojiText(el.cloneNode(true));
    return String(el.innerText || el.textContent || '').trim();
}
// Scrolls the chat into view, lets the list settle (virtual lists re-lay out after a scroll), measures again and
// checks that the point really lands on this chat — a click on the wrong chat would open someone else.
function __ciCentre(find) {
    return new Promise(function (resolve) {
        var el = find();
        if (!el) return resolve(null);
        el.scrollIntoView({ block: 'center' });
        var tries = 0;
        (function measure() {
            requestAnimationFrame(function () { requestAnimationFrame(function () { setTimeout(function () {
                el = find();
                if (!el) return resolve(null);
                var r = el.getBoundingClientRect();
                var x = r.left + r.width / 2, y = r.top + r.height / 2;
                var hit = r.width && r.height ? document.elementFromPoint(x, y) : null;
                if (hit && (hit === el || el.contains(hit))) return resolve({ x: x, y: y });
                if (++tries > 4) return resolve(null);
                el.scrollIntoView({ block: 'center' });
                measure();
            }, 120); }); });
        })();
    });
}
`

const telegram = {
    id: 'telegram',
    match: (url) => /^https:\/\/web\.telegram\.org\//.test(url),
    // Telegram's own dialog store has every chat (the page renders only the ~20 on screen); the rendered list is
    // the fallback when the store is not there (another Telegram client, an update that renamed it).
    LIST: `(function () {${AVATAR_HELPER}
        function fromDom() {
            var rows = document.querySelectorAll('.chatlist a.chatlist-chat[data-peer-id]');
            var out = [], seen = {};
            for (var i = 0; i < rows.length && out.length < ${MAX_CHATS}; i++) {
                var a = rows[i], key = a.getAttribute('data-peer-id');
                if (!key || seen[key]) continue; seen[key] = 1;
                var sub = a.querySelector('.row-subtitle, .dialog-subtitle');
                var subText = '';
                if (sub) { var clone = sub.cloneNode(true); var badges = clone.querySelectorAll('.dialog-subtitle-badge, .badge'); for (var j = 0; j < badges.length; j++) badges[j].remove(); subText = __ciText(clone); }
                var badge = a.querySelector('.dialog-subtitle-badge-unread');
                out.push({
                    key: key,
                    title: __ciText(a.querySelector('.peer-title')),
                    preview: subText,
                    time: __ciText(a.querySelector('.message-time, .row-title-right .time')),
                    unread: badge ? __ciText(badge) : 0,
                    muted: !!a.querySelector('.dialog-subtitle-badge-muted, .is-muted'),
                    avatar: __ciAvatar('tg' + key, a.querySelector('img.avatar-photo'))
                });
            }
            return out;
        }
        var rs = window.rootScope, m = rs && rs.managers;
        if (!m || !m.dialogsStorage || !m.appChatsManager || !m.appUsersManager) return fromDom();
        var titles = window.__ciTgTitles || (window.__ciTgTitles = {});
        function titleOf(peerId) {
            if (titles[peerId]) return Promise.resolve(titles[peerId]);
            if (peerId === rs.myId) return Promise.resolve(titles[peerId] = 'Избранное');
            var p = peerId < 0
                ? m.appChatsManager.getChat(-peerId).then(function (c) { return c && c.title || ''; })
                : m.appUsersManager.getUser(peerId).then(function (u) { return u ? [u.first_name, u.last_name].filter(Boolean).join(' ') : ''; });
            return p.then(function (t) { if (t) titles[peerId] = t; return t; }, function () { return ''; });
        }
        function mediaLabel(media) {
            var k = media && media._ || '';
            if (/Photo/.test(k)) return 'Фото';
            if (/Document/.test(k)) {
                var attrs = media.document && media.document.attributes || [];
                for (var i = 0; i < attrs.length; i++) {
                    var a = attrs[i]._ || '';
                    if (/Audio/.test(a)) return attrs[i].pFlags && attrs[i].pFlags.voice ? 'Голосовое сообщение' : 'Аудио';
                    if (/Video/.test(a)) return attrs[i].pFlags && attrs[i].pFlags.round_message ? 'Видеосообщение' : 'Видео';
                    if (/Sticker/.test(a)) return 'Стикер';
                }
                return 'Файл';
            }
            if (/Geo|Venue/.test(k)) return 'Геопозиция';
            if (/Contact/.test(k)) return 'Контакт';
            if (/Poll/.test(k)) return 'Опрос';
            return k ? 'Вложение' : '';
        }
        // a tab that has not been opened yet keeps its store asleep and the call hangs: one waiting call is enough
        if (window.__ciTgWaiting) return fromDom();
        window.__ciTgWaiting = true;
        var asked = Promise.resolve(m.dialogsStorage.getFolderDialogs(0));
        asked.then(function () { window.__ciTgWaiting = false; }, function () { window.__ciTgWaiting = false; });
        return asked.then(function (dialogs) {
            if (!dialogs || !dialogs.length) return fromDom();
            var dom = {}, domList = fromDom();
            for (var d = 0; d < domList.length; d++) dom[domList[d].key] = domList[d];
            var now = Date.now();
            var top = dialogs.filter(function (x) { return x && x.peerId; })
                .sort(function (a, b) { return ((b.topMessage && b.topMessage.date) || 0) - ((a.topMessage && a.topMessage.date) || 0); })
                .slice(0, ${TELEGRAM_CHATS});
            // «Избранное» is always there, however old: it is where people send things to themselves
            if (!top.some(function (x) { return x.peerId === rs.myId; })) { var saved = dialogs.filter(function (x) { return x && x.peerId === rs.myId; })[0]; if (saved) top.push(saved); }
            // titles come from the page's worker; the first read waits a moment for them, later reads are cached
            var named = Promise.all(top.map(function (x) { return titleOf(x.peerId); }));
            var wait = new Promise(function (r) { setTimeout(r, 1500); });
            return Promise.race([named, wait]).then(function () {
                var out = [];
                top.forEach(function (x) {
                    var key = String(x.peerId), seen = dom[key];
                    var title = titles[x.peerId] || (seen && seen.title) || '';
                    if (!title) return;
                    var msg = x.topMessage || {};
                    var text = String(msg.message || '') || mediaLabel(msg.media);
                    if (msg._ === 'messageService') text = (seen && seen.preview) || '';
                    if (text && msg.pFlags && msg.pFlags.out && x.peerId !== rs.myId) text = 'Вы: ' + text;
                    var ns = x.notify_settings || {};
                    out.push({
                        key: key,
                        title: title,
                        preview: text,
                        at: msg.date ? msg.date * 1000 : 0,
                        time: seen ? seen.time : '',
                        unread: x.unread_count || 0,
                        muted: !!(ns.mute_until && ns.mute_until * 1000 > now) || (seen ? seen.muted : false),
                        avatar: seen ? seen.avatar : ''
                    });
                });
                return out.length ? out : domList;
            });
        }, function () { return fromDom(); });
    })()`,
    locate: (key) => `(function () {${AVATAR_HELPER}
        var key = ${JSON.stringify(String(key))};
        return __ciCentre(function () { return document.querySelector('.chatlist a.chatlist-chat[data-peer-id="' + key + '"]'); });
    })()`,
    // Telegram opens a chat by its id itself — no click on the list, so it cannot land on another chat
    open: (key) => `(function () {
        var id = Number(${JSON.stringify(String(key))});
        if (!id || !window.appImManager || typeof appImManager.setInnerPeer !== 'function') return false;
        try { appImManager.setInnerPeer({ peerId: id }); return true; } catch (e) { return false; }
    })()`
}

const max = {
    id: 'max',
    match: (url) => /^https:\/\/web\.max\.ru\//.test(url),
    LIST: `(function () {${AVATAR_HELPER}
        var cells = document.querySelectorAll('.scrollListContent > div.item button.cell');
        var out = [], seen = {};
        for (var i = 0; i < cells.length && out.length < ${MAX_CHATS}; i++) {
            var c = cells[i];
            var leaves = [], all = c.querySelectorAll('.text, .time');
            for (var j = 0; j < all.length; j++) if (all[j].children.length === 0 || /textMultiline/.test(all[j].className)) leaves.push(all[j]);
            var title = '', time = '', unread = 0, preview = [];
            for (var k = 0; k < leaves.length; k++) {
                var el = leaves[k], text = __ciText(el), cls = String(el.className);
                if (!text) continue;
                if (/(^|\\s)time(\\s|$)/.test(cls)) { time = text; continue; }
                if (!title) { title = text; continue; }
                if (/text--20/.test(cls) && /^\\d+$/.test(text)) { unread = text; continue; }
                preview.push(text);
            }
            if (!title || seen[title]) continue; seen[title] = 1;
            out.push({ key: title, title: title, preview: preview.join(': '), time: time, unread: unread, avatar: __ciAvatar('max' + title, c.querySelector('img.avatarImage')) });
        }
        return out;
    })()`,
    locate: (key) => `(function () {${AVATAR_HELPER}
        var key = ${JSON.stringify(String(key))};
        function find() {
            var cells = document.querySelectorAll('.scrollListContent > div.item button.cell');
            for (var i = 0; i < cells.length; i++) { var t = cells[i].querySelector('.text'); if (t && __ciText(t) === key) return cells[i]; }
            return null;
        }
        // MAX keeps only the visible part of its list on the page: scroll down to the chat when it is further away
        return new Promise(function (resolve) {
            var box = document.querySelector('.scrollListScrollable');
            var steps = 0;
            (function look() {
                if (find() || !box || steps > 40) return resolve(__ciCentre(find));
                if (steps === 0) box.scrollTop = 0; else box.scrollTop += Math.max(200, box.clientHeight * 0.8);
                steps++;
                setTimeout(look, 140);
            })();
        });
    })()`,
    // a chat MAX has opened once is opened again by its address, like MAX's own links do
    PATH: `(function () { var p = location.pathname; return p.charAt(0) === '/' && /^-?[0-9]+$/.test(p.slice(1)) ? p : ''; })()`,
    navigate: (path) => `(function () {
        var path = ${JSON.stringify(String(path))};
        if (path.charAt(0) !== '/' || !/^-?[0-9]+$/.test(path.slice(1))) return false;
        var a = document.createElement('a'); a.href = path; a.style.display = 'none';
        document.body.appendChild(a); a.click(); a.remove();
        return true;
    })()`
}

const ADAPTERS = [telegram, max]

/** @param {string} url @returns {object|null} */
function adapterFor(url) {
    return ADAPTERS.find((a) => a.match(String(url || ''))) || null
}

module.exports = { adapterFor, ADAPTERS, MAX_CHATS, AVATAR_HELPER }
