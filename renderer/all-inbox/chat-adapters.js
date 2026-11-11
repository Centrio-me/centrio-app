'use strict'
// «Все мессенджеры» (3.8): the open conversation of a tab, read from its page, and its message field.
//   CHAT       — page script → { title, subtitle, messages: [{ id, out, author, text, time, at, read, kind, media, name, duration, reply, forwarded }] }
//                kind: text | photo | video | voice | sticker | file | service
//   COMPOSER   — page script that focuses the message field and returns its centre { x, y } (null when there is none)
//   OLDER      — page script that scrolls the page's own message list up so the messenger loads earlier messages
// The tab is behind our window: Centrio types into it with real input (webview.insertText + Enter).
const { AVATAR_HELPER } = require('./adapters')

const MAX_MESSAGES = 120

// A picture the page holds (often a blob: URL only the page can read) becomes a small data URL, cached per message.
const IMAGE_HELPER = `
var __ciImg = window.__centrioInboxImages || (window.__centrioInboxImages = {});
function __ciPicture(key, img) {
    if (!img || !img.src) return '';
    if (__ciImg[key] && __ciImg[key].src === img.src) return __ciImg[key].data;
    try {
        if (!img.complete || !img.naturalWidth) return /^https?:/i.test(img.src) ? img.src : '';
        var w = img.naturalWidth, h = img.naturalHeight, max = 420, k = Math.min(1, max / Math.max(w, h));
        var c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        var data = c.toDataURL('image/jpeg', 0.82);
        __ciImg[key] = { src: img.src, data: data };
        return data;
    } catch (e) { return /^https?:/i.test(img.src) ? img.src : ''; }
}
// The first of these elements that is really on screen (a channel keeps a hidden message field)
function __ciVisible(root, sel) {
    var all = root ? root.querySelectorAll(sel) : [];
    for (var i = 0; i < all.length; i++) { var r = all[i].getBoundingClientRect(); if (r.width && r.height) return all[i]; }
    return null;
}
function __ciCleanText(el, drop) {
    if (!el) return '';
    var clone = el.cloneNode(true);
    var gone = clone.querySelectorAll(drop);
    for (var i = 0; i < gone.length; i++) gone[i].remove();
    __ciEmojiText(clone);
    return String(clone.innerText || clone.textContent || '').replace(/\\n{3,}/g, '\\n\\n').trim();
}
`

const telegram = {
    CHAT: `(function () {${AVATAR_HELPER}${IMAGE_HELPER}
        // Telegram keeps the previous chats on the page too: only the active one counts
        var chat = document.querySelector('.chats-container > .chat.active, #column-center .chat.active');
        if (!chat) return { title: '', subtitle: '', messages: [], none: true };
        var titles = chat.querySelectorAll('.chat-info .peer-title');
        var bubbles = chat.querySelectorAll('.bubbles-inner .bubble[data-mid]');
        // the message's own picture, not the small one of the message it replies to
        function own(b, sel) { var all = b.querySelectorAll(sel); for (var o = 0; o < all.length; o++) if (!all[o].closest('.reply, .webpage')) return all[o]; return null; }
        // a link preview: the site, the title, a little text and its picture, as Telegram shows it under the text
        function webpageOf(b, mid) {
            var w = b.querySelector('.webpage');
            if (!w) return null;
            var pic = w.querySelector('img.media-photo');
            return {
                url: w.getAttribute('href') || '',
                site: __ciText(w.querySelector('.webpage-name')),
                title: __ciText(w.querySelector('.webpage-title')),
                text: __ciText(w.querySelector('.webpage-text')),
                image: pic ? __ciPicture('tgw' + mid, pic) : ''
            };
        }
        function __ciRgb(s) { var m = /rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/.exec(s || ''); return m ? 'rgb(' + m[1] + ', ' + m[2] + ', ' + m[3] + ')' : ''; }
        // a group of messages from one person: its avatar and its name colour, read once per group
        var groups = [];
        function groupOf(b) {
            var g = b.closest('.bubbles-group');
            if (!g) return {};
            for (var x = 0; x < groups.length; x++) if (groups[x].el === g) return groups[x].info;
            var box = g.querySelector('.bubbles-group-avatar-container');
            var pic = box && box.querySelector('img');
            var peer = box && (box.querySelector('[data-peer-id]') || box).getAttribute('data-peer-id');
            var named = g.querySelector('.colored-name');
            var key = 'g' + (peer || (pic && pic.src ? pic.src.slice(-24) : ''));
            var info = {
                id: 'grp' + groups.length,
                color: named ? __ciRgb(getComputedStyle(named).color) : '',
                avatar: pic ? __ciPicture(key, pic) : '',
                avatarKey: pic ? key : '',
                avatarText: box && !pic ? __ciText(box).slice(0, 2) : ''
            };
            groups.push({ el: g, info: info });
            return info;
        }
        // an album: its photos where Telegram puts them, as parts of the whole (0..1)
        function albumOf(b, mid) {
            var items = b.querySelectorAll('.album-item');
            if (items.length < 2) return null;
            var rects = [], minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
            for (var k = 0; k < items.length; k++) {
                var r = items[k].getBoundingClientRect();
                rects.push(r);
                minX = Math.min(minX, r.left); minY = Math.min(minY, r.top); maxX = Math.max(maxX, r.right); maxY = Math.max(maxY, r.bottom);
            }
            var w = maxX - minX, h = maxY - minY;
            if (!w || !h) return null;
            var list = [];
            for (var n = 0; n < items.length; n++) {
                var p = items[n].querySelector('img.media-photo, img.thumbnail');
                list.push({
                    key: 'm' + mid + '_' + n,
                    src: p ? __ciPicture('tg' + mid + '_' + n, p) : '',
                    picture: p ? 'tg' + mid + '_' + n : '',
                    x: (rects[n].left - minX) / w, y: (rects[n].top - minY) / h, w: rects[n].width / w, h: rects[n].height / h,
                    ratio: w / h
                });
            }
            return list;
        }
        function reactionsOf(b) {
            var list = [], rs = b.querySelectorAll('.reactions .reaction');
            for (var q = 0; q < rs.length && list.length < 8; q++) {
                var pic = rs[q].querySelector('img[alt]');
                var emoji = pic ? pic.getAttribute('alt') : __ciText(rs[q].querySelector('.reaction-sticker'));
                var count = __ciText(rs[q].querySelector('.reaction-counter'));
                if (!count) count = String(rs[q].querySelectorAll('.stacked-avatars-avatar-container, .avatar-like').length || 1);
                if (emoji) list.push({ e: emoji.slice(0, 8), n: count.slice(0, 6), mine: / is-chosen /.test(' ' + rs[q].className + ' ') });
            }
            return list;
        }
        var start = Math.max(0, bubbles.length - ${MAX_MESSAGES});
        var out = [];
        for (var i = start; i < bubbles.length; i++) {
            var b = bubbles[i], cls = ' ' + b.className + ' ';
            var mid = b.getAttribute('data-mid');
            var at = Number(b.getAttribute('data-timestamp')) * 1000 || 0;
            // Telegram's date bubbles are drawn by us from the exact times; its other service bubbles are events (a note)
            if (/ service /.test(cls)) {
                if (/ is-date /.test(cls)) continue;
                var noteEl = b.querySelector('.service-msg') || b;
                out.push({ id: 's' + mid, kind: 'service', note: true, text: String(noteEl.innerText || '').split('\\n').map(function (x) { return x.trim(); }).filter(Boolean).join(' · ').slice(0, 300), at: at });
                continue;
            }
            var kind = 'text';
            if (/ voice-message /.test(cls) || b.querySelector('.audio.is-voice, .voice')) kind = 'voice';
            else if (/ sticker /.test(cls) || /emoji-big/.test(cls)) kind = 'sticker';
            else if (/ video /.test(cls) || b.querySelector('video')) kind = 'video';
            // a picture sent as a file is a file (with its small preview), like Telegram shows it
            else if (b.querySelector('.document-name')) kind = 'file';
            else if (own(b, 'img.media-photo')) kind = 'photo';
            var nameEl = /hide-name/.test(cls) ? null : b.querySelector('.name .peer-title, .colored-name .peer-title');
            var img = (kind === 'file' ? own(b, '.document img, .document-thumb img, img.media-photo') : own(b, 'img.media-photo')) || (kind === 'sticker' ? own(b, 'img.media-sticker') : null) || (kind === 'video' ? own(b, 'img.thumbnail, video') : null);
            var group = groupOf(b);
            var replyEl = b.querySelector('.reply');
            var album = albumOf(b, mid);
            var size = img ? img.getBoundingClientRect() : null;
            out.push({
                id: mid,
                at: at,
                out: / is-out /.test(cls),
                read: / is-read /.test(cls),
                kind: album ? 'photo' : kind,
                author: nameEl ? __ciText(nameEl).split('\\n')[0].trim() : '',
                // Telegram's own colour of this person's name, and the group's avatar, exactly as Telegram draws them
                authorColor: group.color || '',
                avatar: / is-out /.test(cls) ? '' : group.avatar || '',
                avatarKey: group.avatarKey || '',
                // Telegram's own group of messages from one person
                group: group.id || '',
                avatarText: group.avatarText || '',
                forwarded: / forwarded /.test(cls) ? __ciText(b.querySelector('.name')).replace(/^Переслано от\\s*/, '') : '',
                reply: __ciText(b.querySelector('.reply .reply-subtitle')).slice(0, 140),
                replyTitle: replyEl ? __ciText(replyEl.querySelector('.reply-title')).slice(0, 80) : '',
                replyColor: replyEl ? __ciRgb(getComputedStyle(replyEl).backgroundColor) : '',
                text: __ciCleanText(b.querySelector('.message'), '.time, .reply, .reactions, .name, .bubble-name-forwarded, .document, .audio, .webpage, .webpage-preview'),
                name: __ciText(b.querySelector('.document-name')),
                size: __ciText(b.querySelector('.document-size')),
                duration: __ciText(b.querySelector('.audio-time, .video-time')),
                media: album ? '' : (img && img.tagName === 'IMG' ? __ciPicture('tg' + mid, img) : ''),
                mediaW: size ? Math.round(size.width) : 0,
                mediaH: size ? Math.round(size.height) : 0,
                album: album,
                picture: !album && img && img.tagName === 'IMG' && kind === 'photo' ? 'tg' + mid : '',
                reactions: reactionsOf(b),
                webpage: webpageOf(b, mid),
                time: __ciText(b.querySelector('.time .time-inner, .time')).replace(/[^0-9:]/g, '').slice(-5)
            });
        }
        return {
            title: titles[0] ? __ciText(titles[0]) : '',
            subtitle: __ciText(chat.querySelector('.chat-info .info')),
            // channels and chats where writing is closed have no message field on screen
            canWrite: !!__ciVisible(chat, '.input-message-input[contenteditable="true"]'),
            messages: out
        };
    })()`,
    COMPOSER: `(function () {
        var chat = document.querySelector('.chats-container > .chat.active, #column-center .chat.active');
        var all = chat ? chat.querySelectorAll('.input-message-input[contenteditable="true"]') : [];
        for (var i = 0; i < all.length; i++) {
            var el = all[i], r = el.getBoundingClientRect();
            if (!r.width || !r.height) continue;
            el.focus();
            return { x: r.left + Math.min(40, r.width / 2), y: r.top + r.height / 2 };
        }
        return null;
    })()`,
    // where files are dropped: the conversation itself; Telegram then opens its own «send» window and waits
    DROP: `(function () {
        var chat = document.querySelector('.chats-container > .chat.active, #column-center .chat.active');
        var area = chat && chat.querySelector('.bubbles');
        if (!area) return null;
        var r = area.getBoundingClientRect();
        return r.width && r.height ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
    })()`,
    sendsOnDrop: false,
    // Telegram's «send files» window: its caption field and its send button
    MEDIA_POPUP: `(function () {${IMAGE_HELPER}
        var p = document.querySelector('.popup-new-media.active');
        if (!p) return null;
        var cap = __ciVisible(p, '.input-message-input[contenteditable="true"]');
        var send = __ciVisible(p, 'button.btn-primary');
        if (!send) return null;
        function centre(el) { var r = el.getBoundingClientRect(); return { x: r.left + Math.min(40, r.width / 2), y: r.top + r.height / 2 }; }
        var s = send.getBoundingClientRect();
        return { caption: cap ? centre(cap) : null, send: { x: s.left + s.width / 2, y: s.top + s.height / 2 } };
    })()`,
    // answer a message: Telegram's own reply, set on the message by its id (the field then shows the quote)
    REPLY: (id) => `(function () {
        var mid = Number(${JSON.stringify(String(id))});
        var input = window.appImManager && appImManager.chat && appImManager.chat.input;
        if (!mid || !input || typeof input.initMessageReply !== 'function') return false;
        try { input.initMessageReply({ replyToMsgId: mid }); return true; } catch (e) { return false; }
    })()`,
    OLDER: `(function () {
        var chat = document.querySelector('.chats-container > .chat.active, #column-center .chat.active');
        var s = chat && chat.querySelector('.bubbles .scrollable-y, .bubbles-inner');
        var box = s && (s.classList.contains('scrollable-y') ? s : s.closest('.scrollable-y'));
        if (box) box.scrollTop = 0;
        return !!box;
    })()`
}

const max = {
    CHAT: `(function () {${AVATAR_HELPER}${IMAGE_HELPER}
        var chat = document.querySelector('.openedChat');
        if (!chat) return { title: '', subtitle: '', messages: [], none: true };
        var items = chat.querySelectorAll('div.item[data-index]');
        var out = [], list = [];
        for (var i = 0; i < items.length; i++) if (items[i].querySelector('.messageWrapper, .capsule')) list.push(items[i]);
        var start = Math.max(0, list.length - ${MAX_MESSAGES});
        for (var j = start; j < list.length; j++) {
            var it = list[j];
            var capsule = it.querySelector('.capsule');
            if (capsule) out.push({ id: 'c' + it.getAttribute('data-index') + __ciText(capsule), kind: 'service', text: __ciText(capsule) });
            var wrappers = it.querySelectorAll('[data-bubbles-variant]');
            for (var k = 0; k < wrappers.length; k++) {
                var w = wrappers[k];
                var textEl = w.querySelector('span.text[data-message-markup]');
                var times = w.querySelectorAll('.text, .time');
                var time = '';
                for (var t = times.length - 1; t >= 0; t--) { var v = __ciText(times[t]); if (/^\\d{1,2}:\\d{2}$/.test(v)) { time = v; break; } }
                var pics = w.querySelectorAll('img');
                var photo = null;
                for (var p = 0; p < pics.length; p++) if (!/avatar/i.test(pics[p].className) && pics[p].naturalWidth > 40) { photo = pics[p]; break; }
                var text = textEl ? __ciText(textEl) : '';
                var kind = photo ? 'photo' : (w.querySelector('audio, [class*=voice]') ? 'voice' : (w.querySelector('[class*=file], [class*=document]') ? 'file' : 'text'));
                if (!text && !photo && kind === 'text') continue;
                var id = it.getAttribute('data-index') + ':' + k + ':' + time + ':' + text.slice(0, 24);
                out.push({
                    id: id,
                    out: w.getAttribute('data-bubbles-variant') === 'outgoing',
                    read: !!w.querySelector('.indicators [class*=read]'),
                    kind: kind,
                    author: __ciText(w.querySelector('[class*=author], [class*=senderName], .name')),
                    text: text,
                    name: kind === 'file' ? __ciText(w.querySelector('[class*=file] [class*=name], [class*=document] [class*=name]')) : '',
                    media: photo ? __ciPicture('max' + id, photo) : '',
                    // the picture's own size: MAX may draw a file's picture as a thin strip
                    mediaW: photo ? photo.naturalWidth : 0,
                    mediaH: photo ? photo.naturalHeight : 0,
                    picture: photo ? 'max' + id : '',
                    time: time
                });
            }
        }
        return {
            title: __ciText(chat.querySelector('.topbar span.title')),
            subtitle: '',
            canWrite: !!__ciVisible(chat, 'div.contenteditable[contenteditable], [role=textbox][contenteditable]'),
            messages: out
        };
    })()`,
    COMPOSER: `(function () {
        var chat = document.querySelector('.openedChat');
        var all = chat ? chat.querySelectorAll('div.contenteditable[contenteditable], [role=textbox][contenteditable]') : [];
        for (var i = 0; i < all.length; i++) {
            var el = all[i], r = el.getBoundingClientRect();
            if (!r.width || !r.height) continue;
            el.focus();
            return { x: r.left + Math.min(40, r.width / 2), y: r.top + r.height / 2 };
        }
        return null;
    })()`,
    // MAX sends a dropped file at once, with no window of its own: our window is the preview, the drop is «send»
    DROP: `(function () {
        var chat = document.querySelector('.openedChat');
        var area = chat && (chat.querySelector('.scrollListScrollable, [class*=history], [class*=messages]') || chat);
        if (!area) return null;
        var r = area.getBoundingClientRect();
        // not the centre: MAX writes «Перетащите сюда фото» there, and a drop on that label is ignored
        var h = Math.min(r.height, window.innerHeight - r.top);
        return r.width && h > 0 ? { x: r.left + r.width / 2, y: r.top + h * 0.25 } : null;
    })()`,
    sendsOnDrop: true,
    MEDIA_POPUP: '',
    // answer a message: MAX shows its «Ответить» button only under the mouse, so the tab first gets the mouse over
    // the message (REPLY_POINT gives where), then the button is pressed
    REPLY_POINT: (id) => `(function () {
        var parts = ${JSON.stringify(String(id))}.split(':');
        var it = document.querySelector('.openedChat div.item[data-index="' + parts[0] + '"]');
        var bubbles = it ? it.querySelectorAll('[data-bubbles-variant] .bubble') : [];
        var b = bubbles[Number(parts[1]) || 0] || bubbles[0];
        if (!b) return null;
        b.scrollIntoView({ block: 'nearest' });
        var r = b.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`,
    REPLY: (id) => `(function () {
        var parts = ${JSON.stringify(String(id))}.split(':');
        var it = document.querySelector('.openedChat div.item[data-index="' + parts[0] + '"]');
        var button = it && it.querySelector('button[aria-label="Ответить"]');
        if (!button) return false;
        button.click();
        return true;
    })()`,
    OLDER: `(function () {
        var chat = document.querySelector('.openedChat');
        var items = chat ? chat.querySelectorAll('div.item[data-index]') : [];
        for (var i = 0; i < items.length; i++) { if (items[i].querySelector('.messageWrapper')) { items[i].scrollIntoView({ block: 'start' }); return true; } }
        return false;
    })()`
}

const CHAT_ADAPTERS = { telegram, max }

const FULL_PICTURE_MAX = 1600

/** A page script that gives a picture shown in the conversation in full size (up to 1600 px), or '' */
function fullPicture(key) {
    return `(function () {
        var c = (window.__centrioInboxImages || {})[${JSON.stringify(String(key))}];
        if (!c || !c.src) return '';
        return new Promise(function (resolve) {
            var img = new Image();
            img.onload = function () {
                try {
                    var w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, ${FULL_PICTURE_MAX} / Math.max(w, h));
                    var cv = document.createElement('canvas'); cv.width = Math.round(w * k); cv.height = Math.round(h * k);
                    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
                    resolve(cv.toDataURL('image/jpeg', 0.9));
                } catch (e) { resolve(''); }
            };
            img.onerror = function () { resolve(''); };
            img.src = c.src;
        });
    })()`
}

/** @param {string} adapterId the id of the chat-list adapter (adapters.js) */
function chatAdapterFor(adapterId) {
    return CHAT_ADAPTERS[adapterId] || null
}

/**
 * The chat is read every second and a half; its pictures (data URLs, tens of KB each) cross from the tab only the first
 * time in a session — after that the page sends «@m<id>» and resolveImages() takes the picture we already have.
 * A new session (another chat opened) starts clean on both sides.
 */
function withImageMemo(chatScript, session) {
    return `(function () {
        var s = ${JSON.stringify(String(session))};
        var memo = window.__ciSentImages && window.__ciSentImages.s === s ? window.__ciSentImages : (window.__ciSentImages = { s: s, k: {} });
        function once(value, key) {
            if (!value || !key || value.indexOf('data:') !== 0) return value;
            if (memo.k[key] === value.length) return '@' + key;
            memo.k[key] = value.length;
            return value;
        }
        var r = ${chatScript};
        if (!r || !r.messages) return r;
        for (var i = 0; i < r.messages.length; i++) {
            var m = r.messages[i];
            m.media = once(m.media, 'm' + m.id);
            m.avatar = once(m.avatar, m.avatarKey);
            if (m.album) for (var j = 0; j < m.album.length; j++) m.album[j].src = once(m.album[j].src, m.album[j].key);
            if (m.webpage) m.webpage.image = once(m.webpage.image, 'w' + m.id);
        }
        return r;
    })()`
}

/** A picture value: «@key» becomes what we already have, a new data URL is kept under its key. */
function resolveOne(value, key, cache) {
    if (typeof value !== 'string' || !value) return value
    if (value.startsWith('@')) return cache.get(value.slice(1)) || ''
    if (value.startsWith('data:') && key) cache.set(key, value)
    return value
}

/** Messages with their «@key» pictures (photo, group avatar, album photos) filled in from the cache — new copies. */
function resolveImages(messages, cache) {
    return (messages || []).map((m) => {
        if (!m) return m
        const out = { ...m }
        if (m.media) out.media = resolveOne(m.media, 'm' + m.id, cache)
        if (m.avatar) out.avatar = resolveOne(m.avatar, m.avatarKey, cache)
        if (Array.isArray(m.album)) out.album = m.album.map((a) => ({ ...a, src: resolveOne(a && a.src, a && a.key, cache) }))
        if (m.webpage && m.webpage.image) out.webpage = { ...m.webpage, image: resolveOne(m.webpage.image, 'w' + m.id, cache) }
        return out
    })
}

module.exports = { chatAdapterFor, fullPicture, withImageMemo, resolveImages, MAX_MESSAGES }
