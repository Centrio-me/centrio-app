'use strict'
// «Все мессенджеры» (3.8): the open conversation of a tab, read from its page, and its message field.
//   CHAT       — page script → { title, subtitle, messages: [{ id, out, author, text, time, at, read, kind, media, name, duration, reply, forwarded }] }
//                kind: text | photo | video | voice | sticker | file | service
//   COMPOSER   — page script that focuses the message field and returns its centre { x, y } (null when there is none)
//   OLDER      — page script that scrolls the page's own message list up so the messenger loads earlier messages
// The tab is behind our window: Centrio types into it with real input (webview.insertText + Enter).
const { AVATAR_HELPER } = require('./adapters')
const { whatsappChat } = require('./whatsapp')
const { vkChat } = require('./vk')
const { instagramChat } = require('./instagram')

const MAX_MESSAGES = 120
// voice messages, audio and videos up to this size play in our window; bigger ones open in the messenger
const MEDIA_MAX_BYTES = 100 * 1024 * 1024 // 3.8.3: channel videos are often bigger than 40 MB; bigger ones open in the tab
// a poll's votes are asked again this often while the chat is open
const POLL_REFRESH_MS = 5000
// MAX photos not on the page yet: at most this many messages are warmed up per read, each waited for this long
const MAX_WARM_ITEMS = 12
const MAX_WARM_TRIES = 12
const MAX_WARM_STEP_MS = 120
// how long MAX's player is given to take the address of a voice message's sound
const MAX_AUDIO_WAIT_MS = 4000
// a warm-up that has not finished by then is taken as broken: reads and new warm-ups go on
const MAX_WARM_GIVE_UP_MS = 30000

// A picture the page holds (often a blob: URL only the page can read) becomes a small data URL, cached per message.
const IMAGE_HELPER = `
var __ciImg = window.__centrioInboxImages || (window.__centrioInboxImages = {});
function __ciPicture(key, img) {
    if (!img || !img.src) return '';
    var hit = __ciImg[key];
    if (hit && hit.src === img.src) {
        if (hit.data) return hit.data;
        if (hit.busy || hit.tries > 2) return '';
        if (hit.tries) { __ciFetchPicture(key, img.src); return ''; }
    }
    try {
        // a video (Telegram's round messages): one frame of it, taken once
        var isVideo = img.tagName === 'VIDEO';
        if (isVideo ? (img.readyState < 2 || !img.videoWidth) : (!img.complete || !img.naturalWidth)) {
            // not loaded on the page yet (MAX loads photos only when scrolled to): asked for directly
            if (!isVideo && /^https:/i.test(img.src)) { __ciFetchPicture(key, img.src); return __ciImg[key] && __ciImg[key].data || ''; }
            return '';
        }
        var w = isVideo ? img.videoWidth : img.naturalWidth, h = isVideo ? img.videoHeight : img.naturalHeight, max = 420, k = Math.min(1, max / Math.max(w, h));
        var c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        var data = c.toDataURL('image/jpeg', 0.82);
        __ciImg[key] = { src: img.src, data: data };
        return data;
    } catch (e) {
        // a picture from another site (MAX keeps photos on i.oneme.ru): the page may show it but not copy it, and our
        // window, not signed in, cannot load its address — it is asked once more as a plain request and copied then
        if (/^https:/i.test(img.src)) { __ciFetchPicture(key, img.src); return __ciImg[key] && __ciImg[key].data || ''; }
        return '';
    }
}
function __ciFetchPicture(key, src) {
    var had = __ciImg[key];
    if (had && had.src === src && (had.data || had.busy || had.tries > 2)) return;
    __ciImg[key] = { src: src, data: '', busy: true, tries: (had && had.src === src ? had.tries || 0 : 0) + 1 };
    fetch(src, { credentials: 'omit' }).then(function (r) { return r.ok ? r.blob() : null; }).then(function (blob) {
        return blob ? createImageBitmap(blob) : null;
    }).then(function (bmp) {
        var cur = __ciImg[key];
        if (!cur || cur.src !== src) return;
        cur.busy = false;
        if (!bmp) return;
        var max = 420, k = Math.min(1, max / Math.max(bmp.width, bmp.height));
        var c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
        c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
        cur.data = c.toDataURL('image/jpeg', 0.82);
        if (bmp.close) bmp.close();
    }).catch(function () { var cur = __ciImg[key]; if (cur && cur.src === src) cur.busy = false; });
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
        // what belongs to the message itself: not the quote, the link preview, nor the animated emoji status next to the
        // author's name or an animated emoji in the text (Telegram draws those as video; 3.8.3, owner: «он её картинкой вставляет»)
        function own(b, sel) { var all = b.querySelectorAll(sel); for (var o = 0; o < all.length; o++) if (!all[o].closest('.reply, .webpage, .emoji-status, .custom-emoji, custom-emoji-element, custom-emoji-renderer-element, .name, .peer-title')) return all[o]; return null; }
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
            // the edges start from nothing: an album scrolled above the top has places below zero (3.8.3 — from 0 the
            // frame reached down to the window's top and the album became a tall grey sheet)
            var rects = [], minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
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
        // a voice message's waveform from Telegram's own message (asked once, ready by the next read)
        var waves = window.__ciTgWaves || (window.__ciTgWaves = {});
        var peerNow = window.appImManager && appImManager.chat ? appImManager.chat.peerId : 0;
        function waveOf(mid) {
            var k = peerNow + '_' + mid;
            if (waves[k] !== undefined) return waves[k] || null;
            waves[k] = 0;
            try {
                rootScope.managers.appMessagesManager.getMessageByPeer(peerNow, Number(mid)).then(function (m) {
                    var d = m && m.media && m.media.document;
                    var a = d && (d.attributes || []).filter(function (x) { return x._ === 'documentAttributeAudio'; })[0];
                    waves[k] = a && a.waveform ? Array.prototype.slice.call(a.waveform, 0, 200) : [];
                }, function () { waves[k] = []; });
            } catch (e) { waves[k] = []; }
            return null;
        }
        // reactions from Telegram's own message (3.8.3): its bubbles draw them as animated pictures with no text, so the
        // emoji, the count and «yours» are taken from the message data, asked again every few seconds
        var reacts = window.__ciTgReacts || (window.__ciTgReacts = {});
        function reactsOf(mid, b) {
            var k = peerNow + '_' + mid, c = reacts[k];
            if (!c) c = reacts[k] = { at: 0, list: null, busy: false };
            var hasEl = !!b.querySelector('.reactions .reaction');
            if (!c.busy && (Date.now() - c.at > ${POLL_REFRESH_MS} || (hasEl && !c.list))) {
                c.busy = true; c.at = Date.now();
                try {
                    rootScope.managers.appMessagesManager.getMessageByPeer(peerNow, Number(mid)).then(function (m) {
                        c.busy = false;
                        var rs = (m && m.reactions && m.reactions.results) || [];
                        c.list = rs.map(function (r) {
                            var e = r.reaction && r.reaction._ === 'reactionEmoji' ? r.reaction.emoticon : (r.reaction && r.reaction._ === 'reactionPaid' ? '⭐' : '');
                            return e ? { e: String(e).slice(0, 8), n: String(r.count || 1), mine: r.chosen_order !== undefined } : null;
                        }).filter(Boolean).slice(0, 8);
                    }, function () { c.busy = false; });
                } catch (e) { c.busy = false; }
            }
            return c.list && c.list.length ? c.list : reactionsOf(b);
        }
        // a poll from Telegram's own message: question, options, votes, yours (asked again every few seconds)
        var polls = window.__ciTgPolls || (window.__ciTgPolls = {});
        function pollOf(mid) {
            var k = peerNow + '_' + mid, c = polls[k];
            if (!c) c = polls[k] = { at: 0, data: null, busy: false };
            if (!c.busy && Date.now() - c.at > ${POLL_REFRESH_MS}) {
                c.busy = true; c.at = Date.now();
                try {
                    rootScope.managers.appMessagesManager.getMessageByPeer(peerNow, Number(mid)).then(function (m) {
                        c.busy = false;
                        var md = m && m.media;
                        if (!md || md._ !== 'messageMediaPoll') return;
                        var p = md.poll, r = md.results || {}, res = r.results || [], pf = p.pFlags || {};
                        function txt(t) { return typeof t === 'string' ? t : (t && t.text) || ''; }
                        function same(a, b) { return Array.prototype.join.call(a || [], ',') === Array.prototype.join.call(b || [], ','); }
                        c.data = {
                            question: txt(p.question),
                            type: pf.quiz ? 'quiz' : (pf.public_voters ? 'public' : 'anon'),
                            multiple: !!pf.multiple_choice, closed: !!pf.closed,
                            voted: res.some(function (x) { return x.pFlags && x.pFlags.chosen; }),
                            total: r.total_voters || 0,
                            options: (p.answers || []).map(function (a) {
                                var v = res.filter(function (x) { return same(x.option, a.option); })[0];
                                return { text: txt(a.text), votes: v ? v.voters || 0 : 0, chosen: !!(v && v.pFlags && v.pFlags.chosen), correct: !!(v && v.pFlags && v.pFlags.correct) };
                            })
                        };
                    }, function () { c.busy = false; });
                } catch (e) { c.busy = false; }
            }
            return c.data;
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
            // a message of one to three emoji: Telegram draws them as big animated stickers and keeps no text — the emoji
            // are on the stickers (data-sticker-emoji); it is a text, drawn big by our window (owner, 2026-11-12: «пустое место»)
            var bigEmoji = /emoji-big/.test(cls) ? [].map.call(b.querySelectorAll('[data-sticker-emoji]'), function (e) { return e.getAttribute('data-sticker-emoji') || ''; }).join('') : '';
            // a round video message carries a sound element too: it is a video
            if (bigEmoji) kind = 'text';
            else if (/ round /.test(cls)) kind = 'video';
            else if (b.querySelector('poll-element, .poll')) kind = 'poll';
            else if (/ voice-message /.test(cls) || b.querySelector('.audio.is-voice, .voice')) kind = 'voice';
            else if (/ sticker /.test(cls) || /emoji-big/.test(cls)) kind = 'sticker';
            else if (/ video /.test(cls) || own(b, 'video')) kind = 'video';
            // a picture sent as a file is a file (with its small preview), like Telegram shows it
            else if (b.querySelector('.document-name')) kind = 'file';
            // a shared contact: Telegram draws its name and number in a card
            else if (b.querySelector('.contact')) kind = 'contact';
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
                // the author's emoji status next to the name (3.8.3): its first frame as a small picture, one per author
                authorBadge: (function () {
                    var st = nameEl && b.querySelector('.name .emoji-status video, .name .emoji-status img, .colored-name .emoji-status video, .colored-name .emoji-status img');
                    return st ? __ciPicture('tgst' + __ciText(nameEl).split('\\n')[0].trim(), st) : '';
                })(),
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
                text: bigEmoji || __ciCleanText(b.querySelector('.message'), '.time, .reply, .reactions, .name, .bubble-name-forwarded, .document, .audio, .webpage, .webpage-preview'),
                name: kind === 'contact' ? __ciText(b.querySelector('.contact-name, .contact .name')) || 'Контакт' : __ciText(b.querySelector('.document-name')),
                phone: kind === 'contact' ? __ciText(b.querySelector('.contact-number, .contact .number')) : '',
                size: __ciText(b.querySelector('.document-size')),
                duration: __ciText(b.querySelector('.audio-time, .video-time')),
                waveBytes: kind === 'voice' ? waveOf(mid) : null,
                poll: kind === 'poll' ? pollOf(mid) : null,
                round: / round /.test(cls),
                media: album ? '' : (img && (img.tagName === 'IMG' || (kind === 'video' && img.tagName === 'VIDEO')) ? __ciPicture('tg' + mid, img) : ''),
                mediaW: size ? Math.round(size.width) : 0,
                mediaH: size ? Math.round(size.height) : 0,
                album: album,
                picture: !album && img && img.tagName === 'IMG' && kind === 'photo' ? 'tg' + mid : '',
                reactions: reactsOf(mid, b),
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
    // while files are dragged Telegram draws two zones: «…без сжатия» (a file) and «…быстрым способом» (a photo) (3.8.3)
    ZONE: (asFile) => `(function () {
        var want = ${asFile ? '/без сжатия|without compression/i' : '/быстр|quick/i'};
        var ds = [].filter.call(document.querySelectorAll('.drops-container .drop'), function (d) { return d.offsetWidth; });
        for (var i = 0; i < ds.length; i++) {
            if (!want.test(ds[i].innerText || '')) continue;
            var r = ds[i].getBoundingClientRect();
            return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        }
        return null;
    })()`,
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
    // edit an own message (3.8.3) through Telegram's own edit; Telegram itself refuses what may not be edited
    EDIT: (id, text) => `(function () {
        var mid = Number(${JSON.stringify(String(id))}), text = ${JSON.stringify(String(text))};
        var c = window.appImManager && appImManager.chat;
        if (!mid || !c || !text) return false;
        var M = rootScope.managers;
        return M.appMessagesManager.getMessageByPeer(c.peerId, mid).then(function (m) {
            if (!m || m._ !== 'message') return false;
            return Promise.resolve(M.appMessagesManager.editMessage(m, text)).then(function () { return true; });
        }).catch(function () { return false; });
    })()`,
    // a reaction (3.8.3) through Telegram's own; the same reaction again takes it off
    REACT: (id, emoji) => `(function () {
        var mid = Number(${JSON.stringify(String(id))}), emoticon = ${JSON.stringify(String(emoji))};
        var c = window.appImManager && appImManager.chat;
        if (!mid || !c || !emoticon) return false;
        var M = rootScope.managers;
        return M.appMessagesManager.getMessageByPeer(c.peerId, mid).then(function (m) {
            if (!m || m._ !== 'message') return false;
            return Promise.resolve(M.appReactionsManager.sendReaction({ message: m, reaction: { _: 'reactionEmoji', emoticon: emoticon } })).then(function () {
                // the next read asks Telegram for this message's reactions again at once
                var k = c.peerId + '_' + mid;
                if (window.__ciTgReacts && window.__ciTgReacts[k]) window.__ciTgReacts[k].at = 0;
                return true;
            });
        }).catch(function () { return false; });
    })()`,
    // delete an own message (3.8.3) through Telegram's own; «у всех» revokes it for the other side too
    DELETE: (id, forAll) => `(function () {
        var mid = Number(${JSON.stringify(String(id))});
        var c = window.appImManager && appImManager.chat;
        if (!mid || !c) return false;
        return Promise.resolve(rootScope.managers.appMessagesManager.deleteMessages(c.peerId, [mid], ${forAll ? 'true' : 'false'}))
            .then(function () { return true; }, function () { return false; });
    })()`,
    // Telegram lets an own message be edited for 48 hours
    EDIT_WINDOW_MS: 48 * 3600 * 1000,
    // Telegram's free reactions most chats allow
    REACTIONS: ['👍', '❤', '🔥', '🥰', '👏', '😁', '🤔', '😢'],
    // a vote in a poll of the open chat, through Telegram's own vote (indexes of the chosen options)
    VOTE: (id, indexes) => `(function () {
        var mid = Number(${JSON.stringify(String(id))}), pick = ${JSON.stringify((indexes || []).map(Number).filter((n) => Number.isInteger(n) && n >= 0))};
        var c = window.appImManager && appImManager.chat;
        if (!mid || !c || !pick.length) return false;
        var M = rootScope.managers;
        return M.appMessagesManager.getMessageByPeer(c.peerId, mid).then(function (m) {
            if (!m || !m.media || m.media._ !== 'messageMediaPoll') return false;
            return Promise.resolve(M.appPollsManager.sendVote(m, pick)).then(function () {
                var k = c.peerId + '_' + mid;
                if (window.__ciTgPolls && window.__ciTgPolls[k]) window.__ciTgPolls[k].at = 0;
                return true;
            });
        }).catch(function () { return false; });
    })()`,
    // the open chat read up to its newest message, through Telegram's own «read» (only when something is unread)
    READ: `(function () {
        var c = window.appImManager && appImManager.chat;
        if (!c || !c.peerId || !window.rootScope) return false;
        var M = rootScope.managers;
        return M.dialogsStorage.getDialogOnly(c.peerId).then(function (d) {
            if (!d || !(d.unread_count > 0) || !d.top_message) return false;
            return Promise.resolve(M.appMessagesManager.readHistory(c.peerId, d.top_message)).then(function () { return true; });
        }).catch(function () { return false; });
    })()`,
    // a voice message, an audio file or a video of the open chat, taken through Telegram's own downloader
    MEDIA: (id) => `(function () {
        var mid = Number(${JSON.stringify(String(id))});
        var chat = window.appImManager && appImManager.chat;
        if (!mid || !chat || !window.appDownloadManager || !window.rootScope) return null;
        return rootScope.managers.appMessagesManager.getMessageByPeer(chat.peerId, mid).then(function (m) {
            var doc = m && m.media && m.media.document;
            if (!doc || !/^(audio|video)\\//.test(doc.mime_type || '') || doc.size > ${MEDIA_MAX_BYTES}) return null;
            // the whole file: a video's address is Telegram's stream, and reading it plainly gave only its first
            // half-megabyte — the video played a few seconds and jumped to its end (3.8.3)
            return Promise.resolve(appDownloadManager.downloadMedia({ media: doc })).then(function (blob) {
                if (!(blob instanceof Blob) || blob.size < (Number(doc.size) || 0) * 0.95) return null;
                return new Promise(function (resolve) {
                    var fr = new FileReader();
                    fr.onload = function () { resolve({ data: String(fr.result), mime: blob.type || doc.mime_type }); };
                    fr.onerror = function () { resolve(null); };
                    fr.readAsDataURL(blob);
                });
            });
        }).catch(function () { return null; });
    })()`,
    OLDER: `(function () {
        var chat = document.querySelector('.chats-container > .chat.active, #column-center .chat.active');
        var s = chat && chat.querySelector('.bubbles .scrollable-y, .bubbles-inner');
        var box = s && (s.classList.contains('scrollable-y') ? s : s.closest('.scrollable-y'));
        if (box) box.scrollTop = 0;
        return !!box;
    })()`
}

// MAX's messages carry no id on the page, and its numbering of them (data-index) shifts whenever earlier messages are
// loaded above. A message is known by what it is: its time, side, the start of its text, its sound's length or file's
// name, how many photos — and, for messages exactly alike, which one of them it is. Reading, answering and playing all
// find a message this way.
const MAX_ID_HELPER = `
function __mxTime(w) {
    var times = w.querySelectorAll('.text, .time');
    for (var t = times.length - 1; t >= 0; t--) { var v = __ciText(times[t]); if (/^\\d{1,2}:\\d{2}$/.test(v)) return v; }
    return '';
}
function __mxKey(w) {
    var textEl = w.querySelector('span.text[data-message-markup]');
    // a voice message by its waveform: its time label turns into the playing position once MAX's player touches it
    var peaks = w.querySelectorAll('[class*=attachAudio] .peak'), wave = '';
    for (var p = 0; p < peaks.length && p < 12; p++) wave += Math.round(parseFloat(peaks[p].style.height) || 0) + '.';
    var extra = peaks.length ? 'v' + peaks.length + ':' + wave : __ciText(w.querySelector('.attaches .title'));
    // «+» joins the ids of photos shown as one album: it is kept out of a message's own id
    return (__mxTime(w) + '|' + (w.getAttribute('data-bubbles-variant') === 'outgoing' ? 'o' : 'i') + '|' + (textEl ? __ciText(textEl).slice(0, 40) : '') + '|' + String(extra || '').slice(0, 30) + '|' + w.querySelectorAll('[class*=tile]').length).split('+').join('');
}
// every message of the open chat with its id, in order (the n-th of messages exactly alike gets #n)
function __mxAll() {
    var seen = {}, out = [];
    var ws = document.querySelectorAll('.openedChat div.item[data-index] [data-bubbles-variant]');
    for (var i = 0; i < ws.length; i++) { var k = __mxKey(ws[i]); seen[k] = (seen[k] || 0) + 1; out.push({ w: ws[i], id: k + '#' + seen[k] }); }
    return out;
}
function __mxFind(id) { var all = __mxAll(); for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i].w; return null; }
`

const max = {
    CHAT: `(function () {${AVATAR_HELPER}${IMAGE_HELPER}${MAX_ID_HELPER}
        var chat = document.querySelector('.openedChat');
        if (!chat) return { title: '', subtitle: '', messages: [], none: true };
        // while photos are warmed up the tab shows an earlier part of the chat: this read gives nothing, the last one stays
        if (window.__ciMaxWarming && Date.now() - (window.__ciMaxWarmingAt || 0) < ${MAX_WARM_GIVE_UP_MS}) return { title: __ciText(chat.querySelector('.topbar span.title')), subtitle: '', messages: null, busy: true };
        var items = chat.querySelectorAll('div.item[data-index]');
        var out = [], list = [];
        // MAX puts a photo on the page only when it is scrolled to; until then a small blurred copy stands in its place.
        // Such photos are warmed up: the tab behind our window is scrolled to them for a moment, MAX loads them, a copy
        // is kept under the blurred copy's own fingerprint (MAX's numbering of messages may shift; the photo's does not)
        var phMemo = window.__ciMaxPh || (window.__ciMaxPh = {});
        function phPrint(v) { return v.length + ':' + v.slice(-48); }
        function placeholderOf(tile) {
            var ph = tile.querySelector('[class*=placeholder]') || tile;
            var bg = /url\\(["']?(data:image[^"')]+)/.exec(ph.style.backgroundImage || '');
            return bg ? bg[1] : '';
        }
        var cold = [];
        // the id of every message, known by what it is (MAX_ID_HELPER)
        __mxAll().forEach(function (x) { x.w.__ciId = x.id; });
        var capsSeen = {};
        for (var i = 0; i < items.length; i++) if (items[i].querySelector('.messageWrapper, .capsule')) list.push(items[i]);
        var start = Math.max(0, list.length - ${MAX_MESSAGES});
        for (var j = start; j < list.length; j++) {
            var it = list[j];
            var capsule = it.querySelector('.capsule');
            if (capsule) { var ct = __ciText(capsule); capsSeen[ct] = (capsSeen[ct] || 0) + 1; out.push({ id: 'c' + ct + '#' + capsSeen[ct], kind: 'service', text: ct }); }
            var wrappers = it.querySelectorAll('[data-bubbles-variant]');
            for (var k = 0; k < wrappers.length; k++) {
                var w = wrappers[k];
                var id = w.__ciId || __mxKey(w);
                var textEl = w.querySelector('span.text[data-message-markup]');
                var times = w.querySelectorAll('.text, .time');
                var time = '';
                for (var t = times.length - 1; t >= 0; t--) { var v = __ciText(times[t]); if (/^\\d{1,2}:\\d{2}$/.test(v)) { time = v; break; } }
                // a shared contact: its picture, the name and «Новый контакт» in the attachment block
                var attach = w.querySelector('.attaches');
                var contactBox = attach && !attach.querySelector('[class*=fileIcon]') && attach.querySelector('[class*=avatar]') ? attach : null;
                var pics = contactBox ? [] : w.querySelectorAll('img');
                var photo = null;
                for (var p = 0; p < pics.length; p++) {
                    var pic = pics[p];
                    if (/avatar/i.test(pic.className) || pic.closest('.link, .mark, [class*=reaction]')) continue;
                    // a photo further up is not loaded yet (MAX loads them when they come into view): it counts all the same
                    var inMedia = !!pic.closest('[class*=media], [class*=grid], [class*=photo]');
                    if (pic.naturalWidth > 40 || (inMedia && !pic.naturalWidth && /^https?:/i.test(pic.src))) { photo = pic; break; }
                }
                // MAX's photo grid: its tiles where MAX puts them; a photo not loaded yet is its blurred placeholder
                var grid = contactBox ? null : w.querySelector('[class*=grid][aria-label], [class*=grid]');
                var tiles = grid ? grid.querySelectorAll('[class*=tile]') : [];
                var album = null, gridPic = '';
                // the page's key of the copy a tile shows (a click opens it large)
                var tileKey = '';
                function tileSrc(tile, key) {
                    var im = tile.querySelector('img');
                    tileKey = key;
                    // the photo once it is copied; until then MAX's blurred placeholder of it
                    var got = im && (im.naturalWidth > 40 || /^https?:/i.test(im.src)) ? __ciPicture(key, im) : '';
                    if (got) return got;
                    var ph = placeholderOf(tile);
                    if (ph) {
                        var warm = phMemo[phPrint(ph)];
                        if (warm && __ciImg[warm.key] && __ciImg[warm.key].data) { tileKey = warm.key; return __ciImg[warm.key].data; }
                        tileKey = '';
                        if (!im && cold.indexOf(it) < 0) cold.push(it);
                    }
                    return ph;
                }
                if (tiles.length) {
                    var gw = parseFloat(grid.style.width) || 0, gh = parseFloat(grid.style.height) || 0;
                    if (tiles.length > 1) {
                        album = [];
                        for (var ti = 0; ti < tiles.length; ti++) {
                            var st = tiles[ti].style;
                            album.push({ key: 'mx' + id + '_' + ti, src: tileSrc(tiles[ti], 'mx' + id + '_' + ti), picture: tileKey,
                                x: (parseFloat(st.left) || 0) / 100, y: (parseFloat(st.top) || 0) / 100, w: (parseFloat(st.width) || 100) / 100, h: (parseFloat(st.height) || 100) / 100,
                                ratio: gw && gh ? gw / gh : 1 });
                        }
                    } else {
                        gridPic = tileSrc(tiles[0], 'mxg' + id);
                        var gridKey = tileKey;
                        if (!photo) photo = tiles[0].querySelector('img') || null;
                    }
                }
                var text = textEl ? __ciText(textEl) : '';
                var kind = contactBox ? 'contact' : (album || gridPic) ? 'photo' : photo ? 'photo' : (w.querySelector('audio, [class*=voice], [class*=attachAudio]') ? 'voice' : (w.querySelector('[class*=fileIcon], [class*=document]') ? 'file' : 'text'));
                var contactName = '', contactNote = '';
                if (contactBox) {
                    var bits = String(contactBox.innerText || '').split('\\n').map(function (x) { return x.trim(); }).filter(Boolean);
                    contactName = bits.filter(function (x) { return !/контакт|contact/i.test(x); })[0] || bits[0] || 'Контакт';
                    contactNote = bits.filter(function (x) { return x !== contactName; })[0] || '';
                }
                if (!text && !photo && !album && !gridPic && kind === 'text') continue;
                out.push({
                    id: id,
                    out: w.getAttribute('data-bubbles-variant') === 'outgoing',
                    // ✓✓ read: MAX draws its status as an icon «icon_status_read»
                    read: !!w.querySelector('.indicators use[href*="read"], .indicators [class*=read]'),
                    kind: kind,
                    // the author of this message, not of the message it quotes
                    author: (function () {
                        var names = w.querySelectorAll('[class*=author], [class*=senderName], .name');
                        for (var n = 0; n < names.length; n++) if (!names[n].closest('.link, .mark, .attaches')) return __ciText(names[n]);
                        return '';
                    })(),
                    text: text,
                    // the message this one answers (3.8.3): MAX draws it as a button with the author and a line of text
                    reply: (function () {
                        var mark = w.querySelector('.bubbleContent .link > .mark');
                        if (!mark) return '';
                        var parts = [].filter.call(mark.children, function (c) { return /(^|\\s)text(\\s|$)/.test(c.className); });
                        return parts.length ? __ciText(parts[parts.length - 1]).slice(0, 140) : (mark.querySelector('img') ? 'Фото' : '');
                    })(),
                    replyTitle: (function () {
                        var who = w.querySelector('.bubbleContent .link > .mark .author');
                        return who ? __ciText(who).slice(0, 80) : '';
                    })(),
                    name: kind === 'file' ? __ciText(w.querySelector('.attaches .title, [class*=file] [class*=name], [class*=document] [class*=name]')) : (kind === 'contact' ? contactName : ''),
                    phone: kind === 'contact' ? contactNote : '',
                    // the length as MAX first wrote it (later the label shows the position of MAX's player)
                    duration: kind === 'voice' ? (function () {
                        var lens = window.__ciMxLen || (window.__ciMxLen = {});
                        var now = __ciText(w.querySelector('[class*=attachAudio] .duration, .duration'));
                        if (!lens[id] && now && !/^0?0:00$/.test(now)) lens[id] = now;
                        return lens[id] || now;
                    })() : '',
                    // MAX draws the voice message's waveform as bars with their height in per cent
                    wave: kind === 'voice' ? [].map.call(w.querySelectorAll('[class*=attachAudio] .peak'), function (p) { return (parseFloat(p.style.height) || 0) * 0.31; }) : null,
                    size: kind === 'file' ? __ciText(w.querySelector('.attaches .info')).replace(/^.*•\\s*/, '') : '',
                    media: album ? '' : gridPic || (photo ? __ciPicture('max' + id, photo) : '') || (contactBox ? __ciPicture('maxc' + id, contactBox.querySelector('img')) : ''),
                    album: album,
                    // the picture's own size: MAX may draw a file's picture as a thin strip
                    mediaW: (photo && photo.naturalWidth) || (grid ? parseFloat(grid.style.width) || 0 : 0),
                    mediaH: (photo && photo.naturalHeight) || (grid ? parseFloat(grid.style.height) || 0 : 0),
                    picture: gridPic ? (gridKey || '') : (photo ? 'max' + id : ''),
                    // reactions (3.8.3): MAX draws each one on a canvas with no text — its picture is taken off the canvas
                    // (once it has been drawn) and shown with the count
                    reactions: (function () {
                        var shots = window.__ciMxReacts || (window.__ciMxReacts = {});
                        var box = w.closest('div.item') || w;
                        var bs = box.querySelectorAll('.reactions button.reaction');
                        var list = [];
                        for (var q = 0; q < bs.length && list.length < 8; q++) {
                            var cv = bs[q].querySelector('canvas');
                            var count = String(bs[q].innerText || '').replace(/\\s+/g, '') || '1';
                            var active = /reaction--active/.test(bs[q].className);
                            // one picture per place, count and «yours»: taken again when any of them changes (the reaction
                            // there may be another one now), not on every read — the canvas animates
                            var key = id + ':' + q + ':' + count + (active ? '*' : '');
                            if (cv && !shots[key]) {
                                try {
                                    var px = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data, ink = 0;
                                    for (var p = 3; p < px.length; p += 16) ink += px[p];
                                    if (ink > 0) shots[key] = cv.toDataURL('image/png');
                                } catch (e) {}
                            }
                            if (shots[key]) list.push({ e: '', img: shots[key], n: count.slice(0, 6), mine: active });
                        }
                        return list;
                    })(),
                    time: time
                });
            }
        }
        if (cold.length && !(window.__ciMaxWarming && Date.now() - (window.__ciMaxWarmingAt || 0) < ${MAX_WARM_GIVE_UP_MS})) (function warmUp() {
            var tried = window.__ciMaxTried || (window.__ciMaxTried = {});
            var todo = [];
            cold.forEach(function (item) {
                var prints = [].map.call(item.querySelectorAll('[class*=tile]'), function (t) { var p = placeholderOf(t); return p ? phPrint(p) : ''; });
                var k = prints.join('|');
                if (!prints.some(Boolean) || (tried[k] || 0) >= 2) return;
                tried[k] = (tried[k] || 0) + 1;
                todo.push({ item: item, prints: prints });
            });
            var box = todo.length && todo[0].item.closest('.scrollListScrollable');
            if (!box) return;
            window.__ciMaxWarming = true;
            window.__ciMaxWarmingAt = Date.now();
            var startTop = box.scrollTop, atBottom = startTop + box.clientHeight >= box.scrollHeight - 8, n = 0, startPath = location.pathname;
            // back where the chat was — only if it is still the same chat on the page
            function finish() {
                window.__ciMaxWarming = false;
                if (location.pathname === startPath && box.isConnected) box.scrollTop = atBottom ? box.scrollHeight : startTop;
            }
            (function next() {
                try {
                if (n >= todo.length || n >= ${MAX_WARM_ITEMS} || location.pathname !== startPath) return finish();
                var job = todo[n++];
                if (!job.item.isConnected) return next();
                job.item.scrollIntoView({ block: 'center' });
                var waited = 0;
                (function look() {
                    var tiles = job.item.querySelectorAll('[class*=tile]'), done = 0;
                    for (var q = 0; q < tiles.length; q++) {
                        var im = tiles[q].querySelector('img');
                        if (im && /^https:/i.test(im.src) && job.prints[q]) { var key = 'mxph' + job.prints[q]; phMemo[job.prints[q]] = { key: key }; __ciPicture(key, im); done++; }
                    }
                    if (done >= tiles.length || ++waited > ${MAX_WARM_TRIES}) return next();
                    setTimeout(look, ${MAX_WARM_STEP_MS});
                })();
                } catch (e) { finish(); }
            })();
        })();
        return {
            title: __ciText(chat.querySelector('.topbar span.title')),
            // «Был(-а) вчера в 21:12», «в сети», «печатает…», «12 участников» — the line under the name in MAX's header
            subtitle: __ciText(chat.querySelector('.topbar .subtitle')).slice(0, 80),
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
    // MAX used to send a dropped file at once; since November 2026 it puts the file into its message field («png» under
    // the field) and waits for «Отправить» — the file then went only with the next message (Oleg, 2026-11-12). Both are
    // handled: the field with the file is its «send» window, and if no such field shows up the file has gone already.
    sendsOnDrop: false,
    dropMaySendAtOnce: true,
    // while files are dragged MAX draws «Отправка без сжатия» (a file) and «Быстрая отправка» (a photo) (3.8.3)
    ZONE: (asFile) => `(function () {
        var want = ${asFile ? '/без сжатия/i' : '/быстрая отправка/i'};
        var titles = document.querySelectorAll('.openedChat .title, .openedChat [class*=zone] [class*=title]');
        for (var i = 0; i < titles.length; i++) {
            var t = titles[i];
            if (!t.offsetWidth || !want.test(t.innerText || '')) continue;
            var zone = t.closest('[class*=zone]') || t.parentElement;
            var r = zone.getBoundingClientRect();
            return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        }
        return null;
    })()`,
    MEDIA_POPUP: `(function () {
        var chat = document.querySelector('.openedChat');
        var bar = chat && chat.querySelector('.composer .attaches .attach');
        var composer = bar && bar.closest('.composerContainer, .composer');
        if (!composer) return null;
        function at(el) { if (!el) return null; var r = el.getBoundingClientRect(); return r.width && r.height ? { x: r.left + Math.min(40, r.width / 2), y: r.top + r.height / 2 } : null; }
        var send = chat.querySelector('button[aria-label="Отправить сообщение"]');
        var sr = send && send.getBoundingClientRect();
        var field = composer.querySelector('div.contenteditable[contenteditable], [role=textbox][contenteditable]') || chat.querySelector('div.contenteditable[contenteditable], [role=textbox][contenteditable]');
        if (field) field.focus();
        return { caption: at(field), send: sr && sr.width ? { x: sr.left + sr.width / 2, y: sr.top + sr.height / 2 } : null };
    })()`,
    // answer a message: MAX shows its «Ответить» button only under the mouse, so the tab first gets the mouse over
    // the message (REPLY_POINT gives where), then the button is pressed
    REPLY_POINT: (id) => `(function () {${AVATAR_HELPER}${MAX_ID_HELPER}
        var w = __mxFind(${JSON.stringify(String(id))});
        var b = w && (w.querySelector('.bubble') || w);
        if (!b) return null;
        b.scrollIntoView({ block: 'nearest' });
        var r = b.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`,
    // edit and react (3.8.3): MAX does both from its own menu on a right click over the message (REPLY_POINT gives
    // where): MENU_ITEM presses «Редактировать», then the field holds the text and Enter saves; REACT_PICK presses the
    // n-th reaction of the menu's row, in the order of MAX's own setting «reactions-menu» (REACTIONS_LIST)
    contextEdit: true,
    // «Удалить» from the message menu opens MAX's question «Удалить у всех?» with a box: set as asked, then «Удалить»
    DELETE_CONFIRM: (forAll) => `(function () {
        var modal = [].filter.call(document.querySelectorAll('.modal'), function (m) { return m.offsetWidth; }).pop();
        if (!modal) return false;
        var box = modal.querySelector('input[type=checkbox]');
        if (box && box.checked !== ${forAll ? 'true' : 'false'}) box.click();
        var ok = [].filter.call(modal.querySelectorAll('button'), function (b) { return (b.innerText || '').trim() === 'Удалить'; })[0];
        if (!ok) return false;
        ok.click();
        return true;
    })()`,
    // MAX lets an own message be edited for 7 days (its setting edit-timeout = 604800 s)
    EDIT_WINDOW_MS: 7 * 24 * 3600 * 1000,
    MENU_ITEM: (label) => `(function () {
        var label = ${JSON.stringify(String(label))};
        var items = document.querySelectorAll('[role=menu] [role=menuitem], [role=menu] button');
        for (var i = 0; i < items.length; i++) {
            var it = items[i], name = it.getAttribute('aria-label') || it.innerText || '';
            if (it.offsetWidth && name.trim() === label) { it.click(); return true; }
        }
        return false;
    })()`,
    REACT_PICK: (index) => `(function () {
        var n = ${Number(index) || 0};
        var all = [].filter.call(document.querySelectorAll('button.reaction'), function (b) { return b.offsetWidth && !b.closest('.openedChat div.item'); });
        if (!all[n]) return false;
        all[n].click();
        return true;
    })()`,
    REACTIONS_LIST: `(function () {
        var fallback = ['👍', '❤️', '🤣', '🔥', '😭', '💯', '💩', '😡'];
        if (!window.indexedDB || !indexedDB.databases) return fallback;
        return indexedDB.databases().then(function (dbs) {
            var d = dbs.filter(function (x) { return /^max-db/.test(x.name); })[0];
            if (!d) return fallback;
            return new Promise(function (resolve) {
                var open = indexedDB.open(d.name);
                open.onerror = function () { resolve(fallback); };
                open.onsuccess = function () {
                    try {
                        var q = open.result.transaction('config', 'readonly').objectStore('config').getAll();
                        q.onsuccess = function () {
                            var text = JSON.stringify(q.result || []);
                            var m = text.match(/"reactions-menu":(\\[[^\\]]*\\])/);
                            var list = null;
                            try { list = m ? JSON.parse(m[1]) : null; } catch (e) {}
                            // the menu shows seven of them, the eighth is behind «more»
                            resolve(Array.isArray(list) && list.length ? list.slice(0, 7) : fallback.slice(0, 7));
                        };
                        q.onerror = function () { resolve(fallback.slice(0, 7)); };
                    } catch (e) { resolve(fallback.slice(0, 7)); }
                };
            });
        }).catch(function () { return fallback.slice(0, 7); });
    })()`,
    REPLY: (id) => `(function () {${AVATAR_HELPER}${MAX_ID_HELPER}
        var w = __mxFind(${JSON.stringify(String(id))});
        var it = w && w.closest('div.item[data-index]');
        var button = it && it.querySelector('button[aria-label="Ответить"]');
        if (!button) return false;
        button.click();
        return true;
    })()`,
    // a voice message: MAX gives the address of its sound only to its own player — its play button is pressed with the
    // sound off, the address is taken and MAX's player stopped; the sound is then asked for as a plain request
    MEDIA: (id) => `(function () {${AVATAR_HELPER}${MAX_ID_HELPER}
        // one at a time: MAX has one player, a second press while the first is taken would hand over the wrong sound
        function take() {
        var w = __mxFind(${JSON.stringify(String(id))});
        var box = w && w.querySelector('[class*=attachAudio]');
        var button = box && box.querySelector('button');
        if (!button) return null;
        var au = document.querySelector('audio');
        if (!au) return null;
        var before = au.src;
        au.muted = true;
        button.click();
        return new Promise(function (resolve) {
            var started = Date.now();
            (function wait() {
                if (au.src && (au.src !== before || !au.paused)) {
                    var src = au.src;
                    au.pause(); au.muted = false;
                    if (src.indexOf('https://') !== 0) return resolve(null);
                    fetch(src, { credentials: 'omit' }).then(function (r) { return r.ok ? r.blob() : null; }).then(function (blob) {
                        if (!blob || blob.size > ${MEDIA_MAX_BYTES}) return resolve(null);
                        var fr = new FileReader();
                        fr.onload = function () { resolve({ data: String(fr.result), mime: blob.type || 'audio/ogg' }); };
                        fr.onerror = function () { resolve(null); };
                        fr.readAsDataURL(blob);
                    }).catch(function () { resolve(null); });
                    return;
                }
                if (Date.now() - started > ${MAX_AUDIO_WAIT_MS}) { au.pause(); au.muted = false; return resolve(null); }
                setTimeout(wait, 50);
            })();
        });
        }
        var next = (window.__ciMxMedia || Promise.resolve()).then(take, take);
        window.__ciMxMedia = next.then(function () {}, function () {});
        return next;
    })()`,
    OLDER: `(function () {
        var chat = document.querySelector('.openedChat');
        var items = chat ? chat.querySelectorAll('div.item[data-index]') : [];
        for (var i = 0; i < items.length; i++) { if (items[i].querySelector('.messageWrapper')) { items[i].scrollIntoView({ block: 'start' }); return true; } }
        return false;
    })()`
}

const CHAT_ADAPTERS = { telegram, max, whatsapp: whatsappChat({ AVATAR_HELPER, IMAGE_HELPER }), vk: vkChat(), instagram: instagramChat() }

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
            // a picture from another site is asked for openly, so it can be copied (MAX's photo server allows it)
            if (/^https:/i.test(c.src)) img.crossOrigin = 'anonymous';
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
