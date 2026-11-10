'use strict'
// «Все мессенджеры» (3.8): how each messenger's web page shows its chat list. Every adapter has
//   match(url)      — whether a tab is this messenger
//   LIST            — a page script that returns [{ key, title, preview, time, unread, muted, avatar }]
//   locate(key)     — a page script that scrolls that chat into view and returns its centre { x, y } (or null);
//                     the tab then gets a real click there (the pages ignore synthetic clicks)
// Everything runs inside the page through webview.executeJavaScript; nothing leaves the computer.
// Page scripts are plain ES5 strings: no names that a minifier could change.

const MAX_CHATS = 60

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
function __ciText(el) { return el ? String(el.innerText || el.textContent || '').trim() : ''; }
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
    LIST: `(function () {${AVATAR_HELPER}
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
    })()`,
    locate: (key) => `(function () {${AVATAR_HELPER}
        var key = ${JSON.stringify(String(key))};
        return __ciCentre(function () { return document.querySelector('.chatlist a.chatlist-chat[data-peer-id="' + key + '"]'); });
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
        return __ciCentre(function () {
            var cells = document.querySelectorAll('.scrollListContent > div.item button.cell');
            for (var i = 0; i < cells.length; i++) { var t = cells[i].querySelector('.text'); if (t && __ciText(t) === key) return cells[i]; }
            return null;
        });
    })()`
}

const ADAPTERS = [telegram, max]

/** @param {string} url @returns {object|null} */
function adapterFor(url) {
    return ADAPTERS.find((a) => a.match(String(url || ''))) || null
}

module.exports = { adapterFor, ADAPTERS, MAX_CHATS, AVATAR_HELPER }
