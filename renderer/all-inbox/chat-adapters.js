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
        var start = Math.max(0, bubbles.length - ${MAX_MESSAGES});
        var out = [];
        for (var i = start; i < bubbles.length; i++) {
            var b = bubbles[i], cls = ' ' + b.className + ' ';
            var mid = b.getAttribute('data-mid');
            var at = Number(b.getAttribute('data-timestamp')) * 1000 || 0;
            if (/ service /.test(cls)) { out.push({ id: 's' + mid, kind: 'service', text: __ciText(b), at: at }); continue; }
            var kind = 'text';
            if (/ voice-message /.test(cls) || b.querySelector('.audio.is-voice, .voice')) kind = 'voice';
            else if (/ sticker /.test(cls) || /emoji-big/.test(cls)) kind = 'sticker';
            else if (/ video /.test(cls) || b.querySelector('video')) kind = 'video';
            else if (b.querySelector('img.media-photo')) kind = 'photo';
            else if (b.querySelector('.document-name')) kind = 'file';
            var nameEl = /hide-name/.test(cls) ? null : b.querySelector('.name .peer-title, .colored-name .peer-title');
            var img = b.querySelector('img.media-photo') || (kind === 'sticker' ? b.querySelector('img.media-sticker') : null) || (kind === 'video' ? b.querySelector('img.thumbnail, video') : null);
            out.push({
                id: mid,
                at: at,
                out: / is-out /.test(cls),
                read: / is-read /.test(cls),
                kind: kind,
                author: nameEl ? __ciText(nameEl) : '',
                forwarded: / forwarded /.test(cls) ? __ciText(b.querySelector('.name')).replace(/^Переслано от\\s*/, '') : '',
                reply: __ciText(b.querySelector('.reply .reply-subtitle')).slice(0, 140),
                text: __ciCleanText(b.querySelector('.message'), '.time, .reply, .reactions, .name, .bubble-name-forwarded, .document, .audio, .webpage, .webpage-preview'),
                name: __ciText(b.querySelector('.document-name')),
                duration: __ciText(b.querySelector('.audio-time, .video-time')),
                media: img && img.tagName === 'IMG' ? __ciPicture('tg' + mid, img) : '',
                picture: img && img.tagName === 'IMG' && kind === 'photo' ? 'tg' + mid : '',
                time: __ciText(b.querySelector('.time .time-inner, .time')).replace(/[^0-9:]/g, '').slice(-5)
            });
        }
        return { title: titles[0] ? __ciText(titles[0]) : '', subtitle: __ciText(chat.querySelector('.chat-info .info')), messages: out };
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
                    picture: photo ? 'max' + id : '',
                    time: time
                });
            }
        }
        return { title: __ciText(chat.querySelector('.topbar span.title')), subtitle: '', messages: out };
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

module.exports = { chatAdapterFor, fullPicture, MAX_MESSAGES }
