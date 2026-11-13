'use strict'
// «Все мессенджеры»: WhatsApp Web (and WhatsApp Business, the same site). Its own chat store (window.require of the page,
// WAWebCollections) has every chat with exact times, ticks, mute, pins and mentions — the page draws only ~30 of them.
// A chat is opened with WhatsApp's own command; the open conversation is read from the page, and each message's type,
// time, author and ticks come from the store by the message's id. Page scripts are plain ES5 strings.

// every chat is listed, so search finds any (3.8.3, as Telegram); only the freshest get avatars asked for
const WA_CHATS = 150
const WA_ALL_CHATS = 1500
const WA_MESSAGES = 120
const WA_AVATARS_AT_ONCE = 6

// the part shared by the list and the conversation: the store and how a message reads in one line
const WA_STORE = `
function __waStore() {
    try { return typeof window.require === 'function' ? window.require('WAWebCollections') : null; } catch (e) { return null; }
}
function __waName(C, wid) {
    if (!wid) return '';
    var c = C.Contact.get(wid);
    return c ? (c.name || c.verifiedName || c.pushname || c.formattedName || '') : '';
}
// a message of the open chat by the id our window has (the row's data-id, or WhatsApp's own short id)
function __waMsg(C, id) {
    var chat = C && C.Chat.getActive ? C.Chat.getActive() : null;
    if (!chat || !chat.msgs) return null;
    var all = chat.msgs.getModelsArray();
    for (var i = all.length - 1; i >= 0; i--) {
        var m = all[i], k = m.id || {};
        if (k._serialized === id || k.id === id || (k.id && String(id).indexOf(k.id) >= 0)) return m;
    }
    return null;
}
// The file of a message from WhatsApp's own store (3.8.3, owner 2026-11-13: pictures opened as little previews, voice
// messages sent to the web page). A file WhatsApp no longer has on its server (NEED_POKE) is asked from the phone
// first — what WhatsApp itself does on a click — then downloaded; resolves to a Blob, or null.
function __waFile(m, waitMs) {
    if (!m || !m.mediaData) return Promise.resolve(null);
    var md = m.mediaData;
    var type = String(m.mimetype || '').split(';')[0].trim();
    function asBlob(x) { return x instanceof Blob ? x : (x ? new Blob([x], { type: type }) : null); }
    // the file WhatsApp already holds: its own blob (voice messages have no address, they waited for one in vain and
    // only turned, Oleg 2026-11-13), or the address it draws from
    function held() {
        var ob = md.mediaBlob;
        try {
            if (ob instanceof Blob) return Promise.resolve(ob);
            if (ob && ob._blob instanceof Blob) return Promise.resolve(ob._blob);
            if (ob && typeof ob.forceToBlob === 'function') return Promise.resolve(ob.forceToBlob()).then(asBlob).catch(function () { return null; });
        } catch (e) {}
        var url = md.renderableUrl || md.staticUrl || (ob && typeof ob.url === 'function' ? ob.url() : '');
        if (!url) return null;
        return fetch(url).then(function (r) { return r.ok ? r.blob() : null; }).catch(function () { return null; });
    }
    // downloaded and decrypted the way WhatsApp itself does, straight from its server
    function fetched() {
        try {
            var DM = window.require('WAWebDownloadManager').downloadManager;
            var quiet = new Proxy({}, { get: function () { return function () {}; } });
            return Promise.resolve(DM.downloadAndMaybeDecrypt({ directPath: m.directPath, encFilehash: m.encFilehash, filehash: m.filehash,
                mediaKey: m.mediaKey, mediaKeyTimestamp: m.mediaKeyTimestamp, type: m.type, signal: new AbortController().signal, downloadQpl: quiet, qpl: quiet }))
                .then(asBlob).catch(function () { return null; });
        } catch (e) { return Promise.resolve(null); }
    }
    return Promise.resolve(held()).then(function (b) {
        if (b && b.size) return b;
        return fetched().then(function (f) {
            if (f && f.size) return f;
            // gone from WhatsApp's server: the phone is asked to send it again — what WhatsApp itself does on a click
            try { if (md.mediaStage === 'NEED_POKE' && typeof m.resumeRemoteUpload === 'function') Promise.resolve(m.resumeRemoteUpload()).catch(function () {}); } catch (e) {}
            try { if (typeof m.downloadMedia === 'function') Promise.resolve(m.downloadMedia({ downloadEvenIfExpensive: true, rmrReason: 1, isUserInitiated: true })).catch(function () {}); } catch (e) {}
            var until = Date.now() + (waitMs || 20000);
            return new Promise(function (resolve) {
                (function wait() {
                    var h = md.mediaStage === 'RESOLVED' ? held() : null;
                    if (h) { Promise.resolve(h).then(function (x) { if (x && x.size) resolve(x); else if (Date.now() > until) resolve(null); else setTimeout(wait, 600); }); return; }
                    if (Date.now() > until) { resolve(null); return; }
                    setTimeout(wait, 400);
                })();
            });
        });
    });
}
// the reactions of a message from WhatsApp's own store: emoji, how many, yours (3.8.3)
function __waReactions(C, m) {
    try {
        var agg = C.Reactions && (C.Reactions.get(m.id._serialized) || C.Reactions.get(m.id));
        if (!agg || !agg.reactions) return [];
        return agg.reactions.getModelsArray().map(function (g) {
            var n = g.senders ? (g.senders.length || (g.senders.getModelsArray ? g.senders.getModelsArray().length : 0)) : 0;
            return g.aggregateEmoji ? { e: String(g.aggregateEmoji).slice(0, 8), n: String(n || 1), mine: !!g.hasReactionByMe } : null;
        }).filter(Boolean).slice(0, 8);
    } catch (e) { return []; }
}
function __waTitle(C, chat) {
    var c = chat.contact;
    return (c && (c.name || c.verifiedName)) || chat.formattedTitle || chat.name || '';
}
function __waGroup(chat) { return !!(chat && (chat.isGroup || (chat.id && chat.id.server === 'g.us'))); }
function __waLine(m) {
    if (!m) return '';
    var t = m.type, body = String(m.caption || m.body || '');
    if (t === 'chat') return body;
    if (t === 'image') return body && m.caption ? '🖼 ' + m.caption : 'Фото';
    if (t === 'video') return m.caption ? '🎬 ' + m.caption : 'Видео';
    if (t === 'ptt') return 'Голосовое сообщение';
    if (t === 'audio') return 'Аудио';
    if (t === 'document') return '📄 ' + (m.filename || 'Файл');
    if (t === 'sticker') return 'Стикер';
    if (t === 'vcard' || t === 'multi_vcard') return '👤 ' + (m.vcardFormattedName || 'Контакт');
    if (t === 'location' || t === 'liveLocation') return '📍 Геопозиция';
    if (t === 'revoked') return 'Сообщение удалено';
    if (t === 'poll_creation') return '📊 Опрос';
    if (t === 'call_log') return 'Звонок';
    return m.caption || (t === 'interactive' || t === 'notification_template' || t === 'template' ? body.split('\\n')[0] : '');
}
`

/** @param {{ AVATAR_HELPER: string }} helpers */
function whatsappList({ AVATAR_HELPER }) {
    return {
        id: 'whatsapp',
        match: (url) => /^https:\/\/web\.whatsapp\.com\//.test(url),
        LIST: `(function () {${AVATAR_HELPER}${WA_STORE}
            // pictures of the rows on screen, by their title (the store rarely has the small avatars loaded)
            var seen = window.__ciWaAv || (window.__ciWaAv = {});
            var rows = document.querySelectorAll('#pane-side [role=listitem], #pane-side [role=row]');
            for (var i = 0; i < rows.length; i++) {
                var t = rows[i].querySelector('span[title]');
                var img = rows[i].querySelector('img');
                if (t && img) { var a = __ciAvatar('wa' + t.getAttribute('title'), img); if (a) seen[t.getAttribute('title')] = a; }
            }
            var C = __waStore();
            if (!C || !C.Chat) return [];
            var now = Date.now(), me = '';
            var loading = window.__ciWaAvLoading || (window.__ciWaAvLoading = {});
            // the chat with oneself is there even before anything was written in it (WhatsApp keeps no time for it)
            var meLid = '', mePn = '';
            try { var mu = window.require('WAWebUserPrefsMeUser'); var l = mu.getMaybeMeLidUser && mu.getMaybeMeLidUser(); var p = mu.getMaybeMePnUser && mu.getMaybeMePnUser(); meLid = l ? l._serialized : ''; mePn = p ? p._serialized : ''; } catch (e) {}
            var isMe = function (c) { var id = c.id && c.id._serialized || ''; return !!id && (id === meLid || id === mePn); };
            var chats = C.Chat.getModelsArray().filter(function (c) {
                var id = c.id && c.id._serialized || '';
                return (c.t || isMe(c)) && id !== 'status@broadcast' && id.indexOf('@broadcast') < 0;
            }).sort(function (a, b) { return (b.t || 0) - (a.t || 0); }).slice(0, ${WA_ALL_CHATS});
            var out = [];
            chats.forEach(function (c, place) {
                var title = __waTitle(C, c);
                if (!title) return;
                var last = c.msgs && c.msgs.last ? c.msgs.last() : null;
                var line = __waLine(last);
                if (line && last && last.id && last.id.fromMe && __waGroup(c)) line = 'Вы: ' + line;
                else if (line && last && __waGroup(c) && last.author) { var who = __waName(C, last.author); if (who) line = who.split(' ')[0] + ': ' + line; }
                // the small avatar: from the store when it has one (asked a few at a time), else the one on the page
                var pic = C.ProfilePicThumb && C.ProfilePicThumb.get(c.id);
                var avatar = (pic && (pic.img || pic.imgFull)) || seen[title] || '';
                if (!avatar && place < ${WA_CHATS} && C.ProfilePicThumb && !loading[c.id._serialized] && Object.keys(loading).length < ${WA_AVATARS_AT_ONCE}) {
                    loading[c.id._serialized] = 1;
                    Promise.resolve(C.ProfilePicThumb.find(c.id)).catch(function () {}).then(function () { setTimeout(function () { delete loading[c.id._serialized]; }, 60000); });
                }
                var ack = last && last.id && last.id.fromMe ? last.ack : -1;
                var server = c.id.server || '';
                out.push({
                    key: c.id._serialized,
                    title: title,
                    preview: line,
                    at: (c.t || 0) * 1000,
                    unread: c.unreadCount > 0 ? c.unreadCount : (c.unreadCount === -1 ? 1 : 0),
                    muted: !!(c.muteExpiration && (c.muteExpiration === -1 || c.muteExpiration * 1000 > now)),
                    pinned: !!c.pin,
                    mentions: c.unreadMentionCount || 0,
                    kind: __waGroup(c) ? 'group' : (server === 'newsletter' ? 'channel' : 'user'),
                    outState: ack >= 3 ? 'read' : (ack >= 1 ? 'sent' : ''),
                    avatar: typeof avatar === 'string' && /^(https:|data:image)/.test(avatar) ? avatar : ''
                });
            });
            return out;
        })()`,
        // WhatsApp opens a chat by its id with its own command: nothing is clicked, it cannot land on another chat
        open: (key) => `(function () {${WA_STORE}
            var C = __waStore();
            if (!C) return false;
            try {
                var chat = C.Chat.get(${JSON.stringify(String(key))});
                if (!chat) return false;
                window.require('WAWebCmd').Cmd.openChatBottom({ chat: chat });
                return true;
            } catch (e) { return false; }
        })()`,
        locate: (key) => `(function () {${AVATAR_HELPER}
            var key = ${JSON.stringify(String(key))};
            return __ciCentre(function () {
                var rows = document.querySelectorAll('#pane-side [role=listitem], #pane-side [role=row]');
                for (var i = 0; i < rows.length; i++) { var t = rows[i].querySelector('span[title]'); if (t && t.getAttribute('title') === key) return rows[i]; }
                return null;
            });
        })()`
    }
}

/** @param {{ AVATAR_HELPER: string, IMAGE_HELPER: string }} helpers */
function whatsappChat({ AVATAR_HELPER, IMAGE_HELPER }) {
    return {
        CHAT: `(function () {${AVATAR_HELPER}${IMAGE_HELPER}${WA_STORE}
            var main = document.querySelector('#main');
            if (!main) return { title: '', subtitle: '', messages: [], none: true };
            var C = __waStore();
            var active = C && C.Chat.getActive ? C.Chat.getActive() : null;
            var byId = {};
            if (active && active.msgs) active.msgs.getModelsArray().forEach(function (m) { if (m.id) byId[m.id.id] = m; });
            var head = main.querySelector('header');
            var lines = head ? String(head.innerText || '').split('\\n').map(function (s) { return s.trim(); }).filter(Boolean) : [];
            var title = active ? __waTitle(C, active) : (lines[0] || '');
            // «в сети», «был(а) …», «печатает…», the members — not WhatsApp's own hint to click the header
            var subtitle = lines.slice(1).filter(function (s) { return !/нажмите|click here|добавить в список/i.test(s); })[0] || '';
            function clock(t) { var d = new Date(t * 1000); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
            function size(n) { if (!(n > 0)) return ''; if (n < 1024) return n + ' Б'; if (n < 1048576) return Math.round(n / 1024) + ' КБ'; return (n / 1048576).toFixed(1).replace('.', ',') + ' МБ'; }
            function dur(s) { s = Math.round(s || 0); return s ? Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2) : ''; }
            function phoneOf(vcard) { var m = /TEL[^:]*:([^\\n\\r]+)/i.exec(String(vcard || '')); return m ? m[1].trim() : ''; }
            var KIND = { chat: 'text', image: 'photo', video: 'video', ptt: 'voice', audio: 'voice', document: 'file', sticker: 'sticker', vcard: 'contact', multi_vcard: 'contact' };
            var rows = main.querySelectorAll('[role=row]');
            var out = [];
            for (var i = Math.max(0, rows.length - ${WA_MESSAGES}); i < rows.length; i++) {
                var row = rows[i];
                var idEl = row.querySelector('[data-id]');
                if (!idEl) {
                    // a day or an event of the chat
                    var note = __ciText(row);
                    if (note && note.length < 120) out.push({ id: 's' + i + note, kind: 'service', text: note, note: !/^(сегодня|вчера|\\d{1,2}[.\\/]\\d{1,2}[.\\/]\\d{2,4}|понедельник|вторник|среда|четверг|пятница|суббота|воскресенье|\\d{1,2} [а-я]+)$/i.test(note) });
                    continue;
                }
                var id = idEl.getAttribute('data-id');
                var m = byId[id];
                var type = m ? m.type : '';
                if (type === 'e2e_notification' || type === 'gp2' || type === 'notification_template' && !m.body || type === 'call_log') {
                    var ev = type === 'call_log' ? (m.id.fromMe ? 'Исходящий звонок' : 'Входящий звонок') : __ciText(row);
                    if (ev) out.push({ id: id, kind: 'service', text: ev.slice(0, 200), note: true });
                    continue;
                }
                var kind = KIND[type] || (row.querySelector('img[src^="blob:"]') ? 'photo' : 'text');
                var textEl = row.querySelector('span.selectable-text');
                var text = textEl ? __ciText(textEl) : (m && type === 'chat' ? String(m.body || '') : '');
                if (type === 'revoked') { kind = 'text'; text = 'Сообщение удалено'; }
                if (type === 'location' || type === 'liveLocation') { kind = 'text'; text = '📍 Геопозиция' + (m.loc ? ': ' + m.loc : ''); }
                // a photo or video WhatsApp has not downloaded yet (its tab is not on screen, so it waits) shows only a
                // blurred little preview, and a click opened that (owner, 2026-11-12): WhatsApp is asked once to download it,
                // as if the person had scrolled to it — the next read has the real picture (3.8.3)
                if (m && (kind === 'photo' || kind === 'video' || kind === 'sticker') && typeof m.downloadMedia === 'function') {
                    var md = m.mediaData, asked = window.__ciWaAsked || (window.__ciWaAsked = {});
                    if (md && md.mediaStage && md.mediaStage !== 'RESOLVED' && md.mediaStage !== 'FETCHING' && !asked[id]) {
                        asked[id] = 1;
                        // gone from WhatsApp's server: the phone is asked to send it again, as WhatsApp does on a click
                        try { if (md.mediaStage === 'NEED_POKE' && typeof m.resumeRemoteUpload === 'function') Promise.resolve(m.resumeRemoteUpload()).catch(function () {}); } catch (e) {}
                        try { Promise.resolve(m.downloadMedia({ downloadEvenIfExpensive: true, rmrReason: 1, isUserInitiated: true })).catch(function () {}); } catch (e) {}
                    }
                }
                var pic = null;
                if (kind === 'photo' || kind === 'video' || kind === 'sticker') {
                    var imgs = row.querySelectorAll('img');
                    for (var k = 0; k < imgs.length; k++) if (imgs[k].naturalWidth > 40 && !/avatar|emoji/i.test(imgs[k].className)) { pic = imgs[k]; break; }
                }
                // no picture on the page (WhatsApp draws older ones only when scrolled to): the downloaded file from its
                // store, or else the little preview it keeps — an old photo it no longer has shows just that (3.8.3)
                var stored = '';
                if (!pic && m && (kind === 'photo' || kind === 'video' || kind === 'sticker')) {
                    var file = m.mediaData && (m.mediaData.renderableUrl || m.mediaData.staticUrl);
                    if (file && /^(blob:|https:)/.test(file)) { __ciFetchPicture('wa' + id, file); stored = __ciImg['wa' + id] && __ciImg['wa' + id].data || ''; }
                    // no address: the real photo is taken once, in the background, from WhatsApp's store or its server — older photos
                    // stayed blurred little previews (Oleg, 2026-11-13); the next read shows it
                    if (!stored && kind === 'photo') {
                        var full = window.__ciWaFull || (window.__ciWaFull = {});
                        if (full[id] && full[id] !== 1) { __ciFetchPicture('wa' + id, full[id]); stored = __ciImg['wa' + id] && __ciImg['wa' + id].data || ''; }
                        else if (!full[id] && (window.__ciWaFullBusy || 0) < 3) {
                            full[id] = 1;
                            window.__ciWaFullBusy = (window.__ciWaFullBusy || 0) + 1;
                            __waFile(m, 15000).then(function (k) { return function (blob) { window.__ciWaFullBusy--; if (blob && blob.size) window.__ciWaFull[k] = URL.createObjectURL(blob); }; }(id));
                        }
                    }
                    if (!stored && kind !== 'sticker' && /^\\/9j\\//.test(String(m.body || ''))) stored = 'data:image/jpeg;base64,' + m.body;
                }
                if (kind === 'text' && !text) continue;
                var fromMe = m ? !!m.id.fromMe : !!row.querySelector('[data-icon="tail-out"], [aria-label="Вы:"]');
                var quoted = m && m.quotedMsg;
                out.push({
                    id: id,
                    out: fromMe,
                    read: m ? m.ack >= 3 : !!row.querySelector('[aria-label*="Прочитано"]'),
                    kind: kind,
                    author: !fromMe && __waGroup(active) && m ? __waName(C, m.author) || m.notifyName || '' : '',
                    text: kind === 'contact' ? '' : text,
                    // formatting: drawn as tags on the page, or kept as marks in the stored text (*bold* _italic_ ~strike~,
                    // read in timeline.js) when the page has not drawn the message
                    marked: textEl ? __ciMarked(textEl, '') : '',
                    fmt: textEl ? '' : 'wa',
                    name: kind === 'file' ? (m && m.filename) || 'Файл' : (kind === 'contact' ? (m && m.vcardFormattedName) || 'Контакт' : ''),
                    phone: kind === 'contact' && m ? phoneOf(m.body) : '',
                    size: kind === 'file' && m ? size(m.size) : '',
                    duration: kind === 'voice' && m ? dur(m.duration) : '',
                    reply: quoted ? String(quoted.caption || quoted.body || __waLine(quoted)).slice(0, 140) : '',
                    replyTitle: quoted ? (quoted.id && quoted.id.fromMe ? 'Вы' : __waName(C, quoted.author || quoted.from)) : '',
                    forwarded: m && m.isForwarded ? 'пересланное' : '',
                    media: pic ? __ciPicture('wa' + id, pic) : stored,
                    mediaW: m && m.width || (pic ? pic.naturalWidth : 0),
                    mediaH: m && m.height || (pic ? pic.naturalHeight : 0),
                    // the full picture comes from WhatsApp's store on a click (FULL_PICTURE), whether or not the page drew it
                    picture: m && kind === 'photo' ? 'wa:' + id : (pic && kind === 'photo' ? 'wa' + id : ''),
                    reactions: m ? __waReactions(C, m) : [],
                    at: m && m.t ? m.t * 1000 : 0,
                    time: m && m.t ? clock(m.t) : ''
                });
            }
            return {
                title: title,
                subtitle: subtitle.slice(0, 80),
                canWrite: !!__ciVisible(main, 'footer [contenteditable="true"]'),
                messages: out
            };
        })()`,
        COMPOSER: `(function () {
            var el = document.querySelector('#main footer [contenteditable="true"]');
            if (!el) return null;
            var r = el.getBoundingClientRect();
            if (!r.width || !r.height) return null;
            el.focus();
            return { x: r.left + Math.min(40, r.width / 2), y: r.top + r.height / 2 };
        })()`,
        // a file dropped on the conversation opens WhatsApp's own preview with a caption field and its send button
        DROP: `(function () {
            var main = document.querySelector('#main');
            if (!main) return null;
            var r = main.getBoundingClientRect();
            return r.width && r.height ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
        })()`,
        MEDIA_POPUP: `(function () {
            function visible(el) { var r = el && el.getBoundingClientRect(); return r && r.width && r.height ? r : null; }
            var sends = document.querySelectorAll('[data-icon="send"], [data-icon="wds-ic-send-filled"], [aria-label="Отправить"], [aria-label="Send"]');
            var send = null;
            for (var i = 0; i < sends.length; i++) { if (!sends[i].closest('#main footer') && visible(sends[i])) { send = sends[i]; break; } }
            if (!send) return null;
            var caps = document.querySelectorAll('[contenteditable="true"]');
            var cap = null;
            for (var j = 0; j < caps.length; j++) { if (!caps[j].closest('#main footer') && !caps[j].closest('#side') && visible(caps[j])) { cap = caps[j]; break; } }
            function centre(el) { var r = el.getBoundingClientRect(); return { x: r.left + Math.min(40, r.width / 2), y: r.top + r.height / 2 }; }
            var s = send.getBoundingClientRect();
            return { caption: cap ? centre(cap) : null, send: { x: s.left + s.width / 2, y: s.top + s.height / 2 } };
        })()`,
        // ── reactions, editing, deleting, a file as a document (3.8.3) — through WhatsApp's own actions ──────────
        // the reaction picker of WhatsApp
        REACTIONS: ['👍', '❤️', '😂', '😮', '😢', '🙏'],
        // a voice message or a video, played in our window (it went to the web page)
        MEDIA: (id) => `(function () {${WA_STORE}
            var C = __waStore(), m = __waMsg(C, ${JSON.stringify(String(id))});
            return __waFile(m, 30000).then(function (blob) {
                if (!blob || blob.size > ${100 * 1024 * 1024}) return null;
                // «audio/ogg; codecs=opus» — the space in it is not part of a data URL type
                var type = String((m && m.mimetype) || blob.type || '').split(';')[0].trim() || (m && m.type === 'video' ? 'video/mp4' : 'audio/ogg');
                var b = new Blob([blob], { type: type });
                return new Promise(function (resolve) {
                    var r = new FileReader();
                    r.onload = function () { resolve({ data: String(r.result || '') }); };
                    r.onerror = function () { resolve(null); };
                    r.readAsDataURL(b);
                });
            });
        })()`,
        // a photo at full size for the viewer, from the store (the page holds only a preview or nothing)
        FULL_PICTURE: (id) => `(function () {${WA_STORE}
            var C = __waStore(), m = __waMsg(C, ${JSON.stringify(String(id))});
            return __waFile(m, 20000).then(function (blob) { return blob ? createImageBitmap(blob) : null; }).then(function (bmp) {
                if (!bmp) return '';
                var k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
                var c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
                c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
                return c.toDataURL('image/jpeg', 0.9);
            }).catch(function () { return ''; });
        })()`,
        // the same reaction again takes it off (WhatsApp keeps one reaction per person)
        REACT: (id, emoji) => `(function () {${WA_STORE}
            var C = __waStore(), m = __waMsg(C, ${JSON.stringify(String(id))}), emoji = ${JSON.stringify(String(emoji))};
            if (!m) return false;
            var mine = '';
            try { var agg = C.Reactions.get(m.id._serialized) || C.Reactions.get(m.id); mine = agg && agg.reactionByMe ? agg.reactionByMe.reactionText || '' : ''; } catch (e) {}
            return Promise.resolve(window.require('WAWebSendReactionMsgAction').sendReactionToMsg(m, mine === emoji ? '' : emoji))
                .then(function () { return true; }, function () { return false; });
        })()`,
        // answer a message (3.8.3): WhatsApp's own quote of the chat, set before the text is typed into its field
        REPLY: (id) => `(function () {${WA_STORE}
            var C = __waStore(), m = __waMsg(C, ${JSON.stringify(String(id))});
            var chat = C && C.Chat.getActive ? C.Chat.getActive() : null;
            if (!m || !chat) return false;
            try { chat.composeQuotedMsg = m; return true; } catch (e) { return false; }
        })()`,
        // WhatsApp lets an own message be edited for 15 minutes
        EDIT_WINDOW_MS: 15 * 60 * 1000,
        EDIT: (id, text) => `(function () {${WA_STORE}
            var C = __waStore(), m = __waMsg(C, ${JSON.stringify(String(id))});
            if (!m || !m.id || !m.id.fromMe) return false;
            return Promise.resolve(window.require('WAWebSendMessageEditAction').sendMessageEdit(m, ${JSON.stringify(String(text))}, { mentionedJidList: [], groupMentions: [] }))
                .then(function () { return true; }, function () { return false; });
        })()`,
        // «у всех» revokes it (WhatsApp leaves «Вы удалили это сообщение»), otherwise it goes from this chat only
        DELETE: (id, forAll) => `(function () {${WA_STORE}
            var C = __waStore(), m = __waMsg(C, ${JSON.stringify(String(id))});
            var chat = C && C.Chat.getActive ? C.Chat.getActive() : null;
            if (!m || !chat) return false;
            try {
                var done = ${forAll ? 'true' : 'false'}
                    ? window.require('WAWebRevokeMsgAction').sendRevoke({ type: 'message', data: m }, 'Sender', true)
                    : window.require('WAWebCmd').Cmd.sendDeleteMsgs(chat, { list: [m], type: 'message' }, true);
                return Promise.resolve(done).then(function () { return true; }, function () { return false; });
            } catch (e) { return false; }
        })()`,
        // «Файл»: WhatsApp has no drop zone for documents — the files (read by the main process) are prepared as
        // documents by WhatsApp itself and sent to the open chat; the text is the caption of the first
        SEND_DOCUMENTS: (files, caption) => `(function () {${WA_STORE}
            var C = __waStore(), chat = C && C.Chat.getActive ? C.Chat.getActive() : null;
            var files = ${JSON.stringify(files)}, caption = ${JSON.stringify(String(caption || ''))};
            if (!chat || !files.length) return false;
            var OD = window.require('WAWebMediaOpaqueData'), prepRaw = window.require('WAWebPrepRawMedia').prepRawMedia;
            function one(f, i) {
                var bin = atob(f.data), bytes = new Uint8Array(bin.length);
                for (var k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
                var file = new File([bytes], f.name, { type: f.mime });
                return Promise.resolve(OD.createFromData(file, f.mime)).then(function (opaque) {
                    var prep = prepRaw(opaque, { asDocument: true });
                    return Promise.resolve(prep.waitForPrep()).then(function () {
                        return prep.sendToChat({ chat: chat, options: i === 0 && caption ? { caption: caption } : {} });
                    });
                });
            }
            var chain = Promise.resolve();
            files.forEach(function (f, i) { chain = chain.then(function () { return one(f, i); }); });
            return chain.then(function () { return true; }, function () { return false; });
        })()`,
        // the open chat read, through WhatsApp's own «seen» (only when something in it is unread)
        READ: `(function () {${WA_STORE}
            var C = __waStore();
            var chat = C && C.Chat.getActive ? C.Chat.getActive() : null;
            if (!chat || !(chat.unreadCount > 0)) return false;
            try {
                var U = window.require('WAWebUpdateUnreadChatAction');
                return Promise.resolve(U.sendSeen({ chat: chat, threadId: undefined })).then(function () { return true; }, function () {
                    return Promise.resolve(U.sendSeen(chat, false)).then(function () { return true; }, function () { return false; });
                });
            } catch (e) { return false; }
        })()`,
        OLDER: `(function () {
            var first = document.querySelector('#main [role=row]');
            if (!first) return false;
            first.scrollIntoView({ block: 'start' });
            return true;
        })()`
    }
}

module.exports = { whatsappList, whatsappChat }
