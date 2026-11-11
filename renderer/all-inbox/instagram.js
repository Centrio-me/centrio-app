'use strict'
// «Все мессенджеры»: Instagram Direct (instagram.com/direct). Instagram's page keeps its chats and their messages in
// its own data store (Relay, the module PolarisRelayEnvironment): the list and the conversation are read from there,
// so nothing is guessed from the page's markup. A chat is opened by Instagram's own router at /direct/t/<thread>/;
// what is typed goes into Instagram's own message field. Page scripts are plain ES5 strings.

const IG_CHATS = 150
const IG_MESSAGES = 120
// voice messages and videos up to this size play in our window
const IG_MEDIA_MAX_BYTES = 40 * 1024 * 1024

// reading Instagram's store: records by id, and the records a field points to
const IG_STORE = `
function __igSrc() {
    try { return window.require('PolarisRelayEnvironment').getStore().getSource(); } catch (e) { return null; }
}
function __igRef(src, r, k) { var v = r && r[k]; return v && v.__ref ? src.get(v.__ref) : null; }
function __igRefs(src, r, k) { var v = r && r[k]; return v && v.__refs ? v.__refs.map(function (id) { return src.get(id); }).filter(Boolean) : []; }
function __igResolved(src, r, k) { var x = __igRef(src, r, k); return x ? x.__resolverValue : undefined; }
function __igThreads(src) {
    var out = [], ids = src.getRecordIDs();
    for (var i = 0; i < ids.length; i++) { var r = src.get(ids[i]); if (r && r.__typename === 'XFBIGDirectViewerThread') out.push(r); }
    return out;
}
// the messages of a chat, newest first (the conversation's own list, else the one the inbox loaded)
function __igMessages(src, t) {
    var names = ['__IGDMessagesList_slide_messages_connection', '__IGDInbox__slide_messages_connection'];
    for (var i = 0; i < names.length; i++) {
        var got = __igRefs(src, __igRef(src, t, names[i]), 'edges').map(function (e) { return __igRef(src, e, 'node'); }).filter(Boolean);
        if (got.length) return got;
    }
    return [];
}
function __igViewerFbid(src, t) { var v = __igRef(src, t, 'viewer'); return v ? String(v.interop_messaging_user_fbid || '') : ''; }
// the latest moment the other side has read up to
function __igReadUpTo(src, t, me) {
    var most = 0;
    __igRefs(src, t, 'slide_read_receipts').forEach(function (r) { if (String(r.participant_fbid) !== me) most = Math.max(most, Number(r.watermark_timestamp_ms) || 0); });
    return most;
}
function __igSnippet(src, m) {
    var c = __igRef(src, m, 'content');
    var t = c && c.__typename;
    if (m.text_body) return m.text_body;
    if (t === 'SlideMessageImageContent') return 'Фото';
    if (t === 'SlideMessageVideosContent') return 'Видео';
    if (t === 'SlideMessageAudiosContent') return 'Голосовое сообщение';
    // a shared reel or post: named for what it is, not «… sent an attachment»
    var x = __igRef(src, c, 'xma'), pic = x && __igRef(src, x, 'preview_image');
    if (x) return (pic && pic.preview_image_decoration_type === 'REEL' ? 'Рилс' : 'Публикация') + (x.header_title_text ? ' · ' + x.header_title_text : '');
    return m.igd_snippet || '';
}
`

function instagramList() {
    return {
        id: 'instagram',
        match: (url) => /^https:\/\/(www\.)?instagram\.com\//.test(url),
        LIST: `(function () {${IG_STORE}
            var src = __igSrc();
            if (!src) return [];
            var out = [];
            __igThreads(src).forEach(function (t) { try {
                if (t.folder === 'SPAM' || t.system_folder === 'SPAM') return;
                var users = __igRefs(src, t, 'users');
                var title = t.thread_title || users.map(function (u) { return u.full_name || u.username; }).join(', ');
                if (!title) return;
                var me = __igViewerFbid(src, t);
                var last = __igMessages(src, t)[0];
                var mine = !!(last && me && String(last.sender_fbid) === me);
                var line = last ? __igSnippet(src, last) : '';
                if (line && mine) line = 'Вы: ' + line;
                else if (line && t.is_group && last) { var who = __igRef(src, last, 'sender'); if (who && who.name) line = String(who.name).split(' ')[0] + ': ' + line; }
                var unread = Number(__igResolved(src, t, '$r:client__unread_messages_count')) || 0;
                if (!unread && (__igResolved(src, t, '$r:client__is_unread') === true || t.marked_as_unread === true)) unread = 1;
                out.push({
                    key: String(t.thread_key),
                    title: title,
                    preview: line,
                    at: Number(t.last_activity_timestamp_ms) || (last ? Number(last.timestamp_ms) : 0),
                    unread: unread,
                    muted: t.is_muted === true,
                    pinned: t.is_pin === true,
                    kind: t.is_group ? 'group' : 'user',
                    outState: mine ? (__igReadUpTo(src, t, me) >= Number(last.timestamp_ms) ? 'read' : 'sent') : '',
                    avatar: !t.is_group && users[0] ? users[0].profile_pic_url || '' : (t.thread_image_url || '')
                });
            // one chat Instagram keeps in an unexpected shape does not cost the whole list
            } catch (e) {} });
            out.sort(function (a, b) { return b.at - a.at; });
            return out.slice(0, ${IG_CHATS});
        })()`,
        // the chat at Instagram's own address, opened by Instagram's own router (no reload)
        open: (key) => `(function () {
            var key = ${JSON.stringify(String(key))};
            if (!/^[0-9]+$/.test(key)) return false;
            var path = '/direct/t/' + key + '/';
            if (location.pathname === path) return true;
            try { window.require('browserHistory_DO_NOT_USE').getCometRouterDispatcher().go(path, {}); return true; }
            catch (e) { location.href = path; return true; }
        })()`,
        locate: () => '(function () { return null; })()'
    }
}

function instagramChat() {
    return {
        CHAT: `(function () {${IG_STORE}
            var src = __igSrc();
            var parts = location.pathname.split('/');
            var key = parts[1] === 'direct' && parts[2] === 't' ? parts[3] : '';
            if (!src || !key) return { title: '', subtitle: '', messages: [], none: true };
            var t = __igThreads(src).filter(function (x) { return String(x.thread_key) === key; })[0];
            if (!t) return { title: '', subtitle: '', messages: [], none: true };
            var users = __igRefs(src, t, 'users');
            var title = t.thread_title || users.map(function (u) { return u.full_name || u.username; }).join(', ');
            var me = __igViewerFbid(src, t), readUpTo = __igReadUpTo(src, t, me);
            var media = window.__ciIgMedia = {};
            function clock(ms) { var d = new Date(ms); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
            function dur(ms) { var s = Math.round((ms || 0) / 1000); return s ? Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2) : ''; }
            var list = __igMessages(src, t).slice(0, ${IG_MESSAGES}).sort(function (a, b) { return Number(a.timestamp_ms) - Number(b.timestamp_ms); }), out = [];
            list.forEach(function (m) {
                var at = Number(m.timestamp_ms) || 0, id = String(m.message_id || m.id);
                var c = __igRef(src, m, 'content'), type = c && c.__typename;
                var mine = !!(me && String(m.sender_fbid) === me);
                if (type === 'SlideMessageAdminText') {
                    var words = __igRefs(src, c, 'text_fragments').map(function (f) { return f.plaintext || ''; }).join('') || m.igd_snippet || '';
                    if (words) out.push({ id: 's' + id, kind: 'service', note: true, text: words, at: at });
                    return;
                }
                var row = { id: id, at: at, time: clock(at), out: mine, read: mine && readUpTo >= at, kind: 'text', text: m.text_body || '' };
                var sender = __igRef(src, m, 'sender');
                if (t.is_group && !mine && sender) { row.author = sender.name || ''; row.group = 'g' + sender.id; }
                var reply = __igRef(src, m, 'replied_to_message');
                if (reply) { row.reply = String(reply.text_body || __igSnippet(src, reply)).slice(0, 140); var rs = __igRef(src, reply, 'sender'); row.replyTitle = rs && rs.name || ''; }
                if (m.igd_is_forwarded) row.forwarded = 'пересланное';
                if (type === 'SlideMessageImageContent') {
                    var pics = __igRefs(src, c, 'attachments');
                    if (pics.length > 1) {
                        row.kind = 'photo';
                        row.album = pics.slice(0, 10).map(function (p, i) {
                            var cols = pics.length > 3 ? 2 : pics.length, rowsN = Math.ceil(Math.min(pics.length, 10) / cols);
                            return { key: 'ig' + id + '_' + i, src: p.preview_cdn_url || '', x: (i % cols) / cols, y: Math.floor(i / cols) / rowsN, w: 1 / cols, h: 1 / rowsN, ratio: 1 };
                        });
                    } else if (pics[0]) {
                        row.kind = 'photo'; row.media = pics[0].preview_cdn_url || ''; row.mediaW = Number(pics[0].preview_width) || 0; row.mediaH = Number(pics[0].preview_height) || 0;
                    }
                } else if (type === 'SlideMessageVideosContent') {
                    var v = __igRefs(src, c, 'videos')[0];
                    if (v) { row.kind = 'video'; row.media = v.preview_cdn_url || ''; row.mediaW = Number(v.preview_width) || 0; row.mediaH = Number(v.preview_height) || 0; media[id] = v.attachment_cdn_url || ''; }
                } else if (type === 'SlideMessageAudiosContent') {
                    var a = __igRefs(src, c, 'audio_attachments')[0];
                    if (a) {
                        row.kind = 'voice'; row.duration = dur(Number(a.playable_duration_ms));
                        row.wave = (Array.isArray(a.waveform_data) ? a.waveform_data : []).map(function (x) { return (Number(x) || 0) * 31; });
                        media[id] = a.attachment_cdn_url || '';
                    }
                } else {
                    // a shared post or reel: a card with its picture, its author and a link to it
                    var x = __igRef(src, c, 'xma');
                    if (x && (x.target_url || x.header_title_text)) {
                        var pi = __igRef(src, x, 'preview_image');
                        row.webpage = { url: x.target_url || '', site: 'Instagram', title: x.header_title_text || '', text: x.header_subtitle_text || '', image: pi && pi.url || '' };

                    } else if (!row.text) row.text = m.igd_snippet || '';
                }
                if (row.kind === 'text' && !row.text) return;
                out.push(row);
            });
            // nothing loaded yet for this chat (Instagram is still fetching it): the turning mark stays, not «no messages»
            return { title: title, subtitle: '', canWrite: true, messages: out.length ? out : null };
        })()`,
        COMPOSER: `(function () {
            var all = document.querySelectorAll('div[role="textbox"][contenteditable="true"]');
            for (var i = 0; i < all.length; i++) {
                var r = all[i].getBoundingClientRect();
                if (!r.width || !r.height) continue;
                all[i].focus();
                return { x: r.left + Math.min(40, r.width / 2), y: r.top + r.height / 2 };
            }
            return null;
        })()`,
        DROP: '(function () { return null; })()',
        MEDIA_POPUP: '',
        // a voice message or a video of the open chat, from Instagram's own address of it
        MEDIA: (id) => `(function () {
            var url = window.__ciIgMedia && window.__ciIgMedia[${JSON.stringify(String(id))}];
            if (!url || url.indexOf('https://') !== 0) return null;
            return fetch(url, { credentials: 'omit' }).then(function (r) { return r.ok ? r.blob() : null; }).then(function (blob) {
                if (!blob || blob.size > ${IG_MEDIA_MAX_BYTES}) return null;
                return new Promise(function (resolve) {
                    var fr = new FileReader();
                    fr.onload = function () { resolve({ data: String(fr.result), mime: blob.type || 'audio/mp4' }); };
                    fr.onerror = function () { resolve(null); };
                    fr.readAsDataURL(blob);
                });
            }).catch(function () { return null; });
        })()`,
        // earlier messages: the conversation's scroll goes to its top, Instagram loads more there
        OLDER: `(function () {
            var box = null, best = 0, all = document.querySelectorAll('div');
            for (var i = 0; i < all.length; i++) {
                var el = all[i];
                if (el.scrollHeight - el.clientHeight < 200) continue;
                var oy = getComputedStyle(el).overflowY;
                if (oy !== 'auto' && oy !== 'scroll') continue;
                var r = el.getBoundingClientRect();
                if (r.left < 300 || r.width * r.height <= best) continue;
                best = r.width * r.height; box = el;
            }
            if (box) box.scrollTop = 0;
            return !!box;
        })()`
    }
}

module.exports = { instagramList, instagramChat }
