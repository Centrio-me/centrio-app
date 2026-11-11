'use strict'
// «Все мессенджеры» (3.8): how each messenger's web page shows its chat list. Every adapter has
//   match(url)      — whether a tab is this messenger
//   LIST            — a page script that returns [{ key, title, preview, time | at, unread, muted, avatar, icon }]
//                     (or listScript({ sweep }) — the same, built per read; MAX uses it to walk its list through)
//   locate(key)     — a page script that scrolls that chat into view and returns its centre { x, y } (or null);
//                     the tab then gets a real click there (the pages ignore synthetic clicks)
// Everything runs inside the page through webview.executeJavaScript; nothing leaves the computer.
// Page scripts are plain ES5 strings: no names that a minifier could change.

const MAX_CHATS = 60
// Telegram gives its whole dialog list; the freshest ones are enough for one screen of history
const TELEGRAM_CHATS = 150
// MAX: how many chats are remembered, and how its list is walked through while the tab is not on screen
const MAX_ALL_CHATS = 200
const MAX_WALK_STEPS = 25
const MAX_WALK_STEP_MS = 220
const MAX_WALK_EVERY_MS = 90 * 1000
const MAX_WALK_WAIT_TRIES = 3
const MAX_WALK_WAIT_MS = 700
// avatars asked from Telegram at the same time (the rest come on the next reads)
const TELEGRAM_AVATARS_AT_ONCE = 8
// people whose «в сети» is asked again on every read (the freshest chats)
const TELEGRAM_STATUS_PEERS = 40

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
        var peers = window.__ciTgPeers || (window.__ciTgPeers = {});
        function titleOf(peerId) {
            if (titles[peerId]) return Promise.resolve(titles[peerId]);
            if (peerId === rs.myId) return Promise.resolve(titles[peerId] = 'Избранное');
            var p = peerId < 0
                ? m.appChatsManager.getChat(-peerId).then(function (c) { peers[peerId] = c; return c && c.title || ''; })
                : m.appUsersManager.getUser(peerId).then(function (u) { peers[peerId] = u; return u ? [u.first_name, u.last_name].filter(Boolean).join(' ') : ''; });
            return p.then(function (t) { if (t) titles[peerId] = t; return t; }, function () { return ''; });
        }
        // Avatars of chats the page has not drawn: asked from Telegram a few at a time in the background, kept as
        // small pictures per photo, so the list fills in over a couple of reads and never waits for them
        var avatars = window.__ciTgAvatars || (window.__ciTgAvatars = {});
        var loadingAv = window.__ciTgAvLoading || (window.__ciTgAvLoading = {});
        function avatarOf(peerId) {
            var peer = peers[peerId], photo = peer && peer.photo;
            if (!photo || !photo.photo_id || !m.appAvatarsManager) return '';
            var id = String(photo.photo_id), have = avatars[peerId];
            if (have && have.id === id) return have.data;
            if (!loadingAv[peerId] && Object.keys(loadingAv).length < ${TELEGRAM_AVATARS_AT_ONCE}) {
                loadingAv[peerId] = 1;
                Promise.resolve(m.appAvatarsManager.loadAvatar(peerId, photo, 'photo_small'))
                    .then(function (url) { return typeof url === 'string' ? fetch(url).then(function (r) { return r.blob(); }) : null; })
                    .then(function (blob) { return blob ? createImageBitmap(blob) : null; })
                    .then(function (bmp) {
                        if (!bmp) return;
                        var c = document.createElement('canvas'); c.width = 64; c.height = 64;
                        c.getContext('2d').drawImage(bmp, 0, 0, 64, 64);
                        avatars[peerId] = { id: id, data: c.toDataURL('image/jpeg', 0.85) };
                    })
                    .catch(function () {})
                    .then(function () { delete loadingAv[peerId]; });
            }
            return have ? have.data : '';
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
            // «в сети» changes all the time: the freshest people are asked again in the background on every read
            var statuses = window.__ciTgStatus || (window.__ciTgStatus = {});
            top.filter(function (x) { return x.peerId > 0 && x.peerId !== rs.myId; }).slice(0, ${TELEGRAM_STATUS_PEERS}).forEach(function (x) {
                m.appUsersManager.getUser(x.peerId).then(function (u) { if (u) statuses[x.peerId] = u.status || null; }, function () {});
            });
            function kindOf(peerId) {
                if (peerId === rs.myId) return 'saved';
                var p = peers[peerId];
                if (peerId < 0) return p && p.pFlags && p.pFlags.broadcast ? 'channel' : 'group';
                return p && p.pFlags && p.pFlags.bot ? 'bot' : 'user';
            }
            function onlineOf(peerId) {
                var st = statuses[peerId] || (peers[peerId] && peers[peerId].status);
                return !!(st && st._ === 'userStatusOnline' && (!st.expires || st.expires * 1000 > Date.now()));
            }
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
                        avatar: (seen && seen.avatar) || (x.peerId === rs.myId ? '' : avatarOf(x.peerId)),
                        icon: x.peerId === rs.myId ? 'saved' : '',
                        kind: kindOf(x.peerId),
                        pinned: !!(x.pFlags && x.pFlags.pinned),
                        online: x.peerId > 0 && x.peerId !== rs.myId && onlineOf(x.peerId),
                        // ✓ sent, ✓✓ read by the other side (not for «Избранное»)
                        outState: msg.pFlags && msg.pFlags.out && x.peerId !== rs.myId ? (x.read_outbox_max_id >= msg.mid ? 'read' : 'sent') : '',
                        members: x.peerId < 0 && peers[x.peerId] ? peers[x.peerId].participants_count || 0 : 0,
                        draft: x.draft && x.draft._ === 'draftMessage' ? String(x.draft.message || '') : '',
                        mentions: x.unread_mentions_count || 0
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
    // MAX draws only the chats on screen and keeps no list anywhere else: the rows are remembered as they are seen,
    // and while the tab is not on screen its list is walked through now and then (scrolled down a screen at a time, then
    // back to where it was), so every chat gets on the list. New messages lift a chat to the top, where it is seen at once.
    listScript: ({ sweep }) => `(function () {${AVATAR_HELPER}
        function readCells() {
            var cells = document.querySelectorAll('.scrollListContent > div.item button.cell');
            var out = [], seen = {};
            for (var i = 0; i < cells.length; i++) {
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
                out.push({ key: title, title: title, preview: preview.join(': '), time: time, unread: unread, kind: preview.length > 1 ? 'group' : 'user', avatar: __ciAvatar('max' + title, c.querySelector('img.avatarImage')) });
            }
            return out;
        }
        var cache = window.__ciMaxChats || (window.__ciMaxChats = {});
        function remember(rows) { var t = Date.now(); for (var i = 0; i < rows.length; i++) cache[rows[i].key] = { row: rows[i], at: t }; }
        function listBox() { var cell = document.querySelector('.scrollListContent > div.item button.cell'); return cell && cell.closest('.scrollListScrollable'); }
        function walk() {
            var box = listBox();
            if (!box) return;
            window.__ciMaxWalking = true;
            var start = box.scrollTop, steps = 0, waited = 0, height = box.scrollHeight;
            (function step() {
                remember(readCells());
                var end = box.scrollTop + box.clientHeight >= box.scrollHeight - 4;
                // at the bottom MAX fetches the next older chats: wait for them a moment before calling it the end
                if (end && box.scrollHeight === height && waited < ${MAX_WALK_WAIT_TRIES}) { waited++; setTimeout(step, ${MAX_WALK_WAIT_MS}); return; }
                if (box.scrollHeight !== height) { height = box.scrollHeight; waited = 0; end = false; }
                if (end || ++steps > ${MAX_WALK_STEPS} || Object.keys(cache).length >= ${MAX_ALL_CHATS}) {
                    box.scrollTop = start;
                    window.__ciMaxWalking = false;
                    window.__ciMaxWalkedAt = Date.now();
                    return;
                }
                box.scrollTop += Math.max(200, box.clientHeight * 0.9);
                setTimeout(step, ${MAX_WALK_STEP_MS});
            })();
        }
        remember(readCells());
        if (${sweep ? 1 : 0} && !window.__ciMaxWalking && Date.now() - (window.__ciMaxWalkedAt || 0) > ${MAX_WALK_EVERY_MS}) walk();
        return Object.keys(cache).map(function (k) { return cache[k].row; });
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
