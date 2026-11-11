'use strict'
// «Все мессенджеры»: ВКонтакте (vk.ru / vk.com). VK's own web client keeps its API caller on the page (window.vkApi):
// the list of conversations and the history of the open one are asked through it — the same calls VK's page makes —
// so nothing is guessed from the page's markup. A conversation is opened at VK's own address /im/convo/<peer>;
// what is typed goes into VK's own message field. Page scripts are plain ES5 strings.

const VK_CHATS = 150
const VK_MESSAGES = 60
const VK_LIST_EVERY_MS = 10 * 1000
const VK_HISTORY_EVERY_MS = 2500
const VK_OLDER_STEP = 40
// a voice message bigger than this is listened to in VK itself
const VK_MEDIA_MAX_BYTES = 40 * 1024 * 1024

const VK_COMMON = `
// VK's own list on the page changes the moment a message comes (its live connection): a change of it, or of the
// page's title with its counter, means VK is asked at once instead of waiting for the next regular ask
function __vkPulse() {
    var items = document.querySelectorAll('.ConvoListItem'), s = document.title;
    for (var i = 0; i < items.length && i < 6; i++) s += '|' + String(items[i].innerText || '').slice(0, 160);
    return s;
}
function __vkApi() { return window.vkApi && typeof window.vkApi.api === 'function' ? window.vkApi : null; }
function __vkPeople(r) {
    var p = {};
    (r && r.profiles || []).forEach(function (u) { p[u.id] = { name: [u.first_name, u.last_name].filter(Boolean).join(' '), first: u.first_name || '', photo: u.photo_100 || '', online: u.online === 1, seen: u.last_seen && u.last_seen.time, sex: u.sex }; });
    (r && r.groups || []).forEach(function (g) { p[-g.id] = { name: g.name || '', first: g.name || '', photo: g.photo_100 || '' }; });
    return p;
}
function __vkTitle(conv, people) {
    var peer = conv.peer || {};
    if (peer.type === 'chat') return conv.chat_settings && conv.chat_settings.title || 'Беседа';
    var who = people[peer.id];
    return who ? who.name : '';
}
function __vkLabel(m) {
    if (!m) return '';
    var a = (m.attachments || [])[0], t = a && a.type;
    var LABELS = { photo: 'Фото', video: 'Видео', audio: 'Аудио', audio_message: 'Голосовое сообщение', doc: 'Файл', sticker: 'Стикер',
        link: 'Ссылка', wall: 'Запись', wall_reply: 'Комментарий', gift: 'Подарок', graffiti: 'Граффити', poll: 'Опрос', call: 'Звонок',
        market: 'Товар', story: 'История', money_transfer: 'Денежный перевод' };
    if (m.text) return m.text;
    if (t === 'doc' && a.doc) return '📄 ' + (a.doc.title || 'Файл');
    if (t) return LABELS[t] || 'Вложение';
    if (m.fwd_messages && m.fwd_messages.length) return 'Пересланные сообщения';
    if (m.action) return 'Событие в беседе';
    return '';
}
`

function vkList() {
    return {
        id: 'vk',
        match: (url) => /^https:\/\/(m\.)?vk\.(ru|com)\//.test(url),
        // VK is asked at most every ten seconds; the reads in between give the last answer
        LIST: `(function () {${VK_COMMON}
            var api = __vkApi();
            if (!api) return [];
            var cache = window.__ciVkList || (window.__ciVkList = { at: 0, list: [], busy: false });
            var pulse = __vkPulse();
            if (cache.busy || (Date.now() - cache.at < ${VK_LIST_EVERY_MS} && pulse === cache.pulse)) return cache.list;
            cache.busy = true; cache.pulse = pulse;
            return Promise.resolve(api.api('messages.getConversations', { count: ${VK_CHATS}, extended: 1, fields: 'photo_100,online' })).then(function (r) {
                var people = __vkPeople(r), now = Date.now() / 1000, out = [];
                (r && r.items || []).forEach(function (it) {
                    var c = it.conversation || {}, m = it.last_message || {}, peer = c.peer || {};
                    var title = __vkTitle(c, people);
                    if (!title) return;
                    var line = __vkLabel(m);
                    if (line && m.out && peer.type === 'chat') line = 'Вы: ' + line;
                    else if (line && peer.type === 'chat' && people[m.from_id]) line = people[m.from_id].first + ': ' + line;
                    var ps = c.push_settings || {};
                    var who = people[peer.id];
                    out.push({
                        key: String(peer.id),
                        title: title,
                        preview: line,
                        at: (m.date || 0) * 1000,
                        unread: c.unread_count || (c.is_marked_unread ? 1 : 0),
                        muted: !!(ps.disabled_forever || (ps.disabled_until && ps.disabled_until > now)),
                        pinned: !!(c.sort_id && c.sort_id.major_id > 0),
                        mentions: c.mentions ? c.mentions.length : 0,
                        kind: peer.type === 'chat' ? 'group' : (peer.type === 'group' ? 'bot' : 'user'),
                        online: !!(who && who.online),
                        outState: m.out ? (c.out_read >= m.id ? 'read' : 'sent') : '',
                        avatar: peer.type === 'chat' ? (c.chat_settings && c.chat_settings.photo && c.chat_settings.photo.photo_100 || '') : (who && who.photo || '')
                    });
                });
                cache.list = out; cache.at = Date.now(); cache.busy = false;
                return out;
            }, function () { cache.busy = false; return cache.list; });
        })()`,
        // the conversation at VK's own address: the page's router takes it without reloading when it can
        open: (key) => `(function () {
            var peer = ${JSON.stringify(String(key))};
            if (!/^-?\\d+$/.test(peer)) return false;
            var path = '/im/convo/' + peer;
            if (location.pathname === path) return true;
            try {
                history.pushState({}, '', path);
                window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
            } catch (e) {}
            // if VK's page did not follow the address, it is opened the plain way
            setTimeout(function () { if (!document.querySelector('.ConvoComposer__input, [class*=ConvoComposer]')) location.href = path; }, 1500);
            if (window.__ciVkHist) window.__ciVkHist.at = 0;
            return true;
        })()`,
        locate: () => '(function () { return null; })()'
    }
}

function vkChat() {
    return {
        CHAT: `(function () {${VK_COMMON}
            var api = __vkApi();
            var m0 = /\\/im\\/convo\\/(-?\\d+)/.exec(location.pathname);
            if (!api || !m0) return { title: '', subtitle: '', messages: [], none: true };
            var peer = Number(m0[1]);
            var h = window.__ciVkHist;
            if (!h || h.peer !== peer) h = window.__ciVkHist = { peer: peer, at: 0, count: ${VK_MESSAGES}, data: null, busy: false };
            var pulse = __vkPulse();
            if (h.data && (h.busy || (Date.now() - h.at < ${VK_HISTORY_EVERY_MS} && pulse === h.pulse))) return h.data;
            h.busy = true; h.pulse = pulse;
            var media = {};
            function clock(t) { var d = new Date(t * 1000); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
            function size(n) { if (!(n > 0)) return ''; if (n < 1024) return n + ' Б'; if (n < 1048576) return Math.round(n / 1024) + ' КБ'; return (n / 1048576).toFixed(1).replace('.', ',') + ' МБ'; }
            function dur(s) { s = Math.round(s || 0); return s ? Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2) : ''; }
            // the picture size closest to what the conversation shows (about 600 px)
            function best(sizes) {
                var list = (sizes || []).filter(function (s) { return s && s.url; }).sort(function (a, b) { return (a.width || 0) - (b.width || 0); });
                for (var i = 0; i < list.length; i++) if ((list[i].width || 0) >= 560) return list[i];
                return list[list.length - 1] || null;
            }
            // the history and the conversation itself (title, what the other side has read, whether one may write)
            return Promise.all([
                api.api('messages.getHistory', { peer_id: peer, count: h.count, extended: 1, fields: 'photo_100,online,last_seen,sex' }),
                api.api('messages.getConversationsById', { peer_ids: peer, extended: 1, fields: 'photo_100,online,last_seen,sex' })
            ]).then(function (both) {
                var r = both[0] || {}, info = both[1] || {};
                var people = __vkPeople(r), more = __vkPeople(info);
                for (var k in more) if (!people[k]) people[k] = more[k];
                var conv = (info.items || [])[0] || (r.conversations || [])[0] || {};
                var isChat = conv.peer && conv.peer.type === 'chat';
                var title = __vkTitle(conv, people) || (people[peer] && people[peer].name) || '';
                var subtitle = '';
                if (isChat) subtitle = conv.chat_settings && conv.chat_settings.members_count ? conv.chat_settings.members_count + ' участников' : '';
                else if (people[peer] && people[peer].online) subtitle = 'в сети';
                else if (people[peer] && people[peer].seen) subtitle = (people[peer].sex === 1 ? 'была ' : 'был ') + 'в ' + clock(people[peer].seen);
                var out = [];
                var items = (r.items || []).slice().reverse();
                items.forEach(function (m) {
                    var id = String(m.id), base = { out: !!m.out, read: !!(m.out && conv.out_read >= m.id), at: m.date * 1000, time: clock(m.date) };
                    var who = people[m.from_id];
                    if (isChat && !m.out && who) { base.author = who.name; base.avatar = who.photo; base.avatarKey = 'vka' + m.from_id; base.group = 'g' + m.from_id; }
                    if (m.action) { out.push({ id: id, kind: 'service', note: true, text: (who ? who.first + ': ' : '') + ({ chat_invite_user: 'добавил(а) участника', chat_kick_user: 'исключил(а) участника', chat_title_update: 'изменил(а) название', chat_photo_update: 'обновил(а) фото беседы', chat_pin_message: 'закрепил(а) сообщение', chat_create: 'создал(а) беседу' }[m.action.type] || 'событие в беседе') }); return; }
                    var reply = m.reply_message;
                    if (reply) { base.reply = String(reply.text || __vkLabel(reply)).slice(0, 140); base.replyTitle = people[reply.from_id] ? people[reply.from_id].name : ''; }
                    if (m.fwd_messages && m.fwd_messages.length) base.forwarded = people[m.fwd_messages[0].from_id] ? people[m.fwd_messages[0].from_id].name : 'пересланное';
                    var text = String(m.text || (m.fwd_messages && m.fwd_messages[0] ? m.fwd_messages[0].text : '') || '');
                    var atts = m.attachments || [];
                    var photos = atts.filter(function (a) { return a.type === 'photo' && a.photo; });
                    var webpage = null;
                    // photos first (several of them become an album), the text and the rest after them
                    photos.forEach(function (a, i) {
                        var s = best(a.photo.sizes);
                        if (!s) return;
                        var last = i === photos.length - 1;
                        out.push(Object.assign({}, base, { id: id + '_p' + i, kind: 'photo', media: s.url, mediaW: s.width || 0, mediaH: s.height || 0, text: last && photos.length === 1 ? text : '' }));
                    });
                    if (photos.length === 1) return;
                    var other = atts.filter(function (a) { return a.type !== 'photo'; })[0];
                    var row = Object.assign({}, base, { id: id, kind: 'text', text: text });
                    if (other) {
                        var t = other.type, o = other[t] || {};
                        if (t === 'audio_message') { row.kind = 'voice'; row.duration = dur(o.duration); row.wave = o.waveform || []; media[id] = o.link_ogg || o.link_mp3 || ''; }
                        else if (t === 'doc') { row.kind = 'file'; row.name = o.title || 'Файл'; row.size = size(o.size); }
                        else if (t === 'sticker') { var img = (o.images || []).filter(function (x) { return x.width >= 128; })[0] || (o.images || [])[0]; if (img) { row.kind = 'sticker'; row.media = img.url; } }
                        else if (t === 'video') { var th = best(o.image || []); row.kind = 'video'; row.media = th ? th.url : ''; row.mediaW = th ? th.width : 0; row.mediaH = th ? th.height : 0; row.duration = dur(o.duration); }
                        else if (t === 'link') { var lp = o.photo && best(o.photo.sizes); webpage = { url: o.url || '', site: o.caption || '', title: o.title || '', text: o.description || '', image: lp ? lp.url : '' }; row.webpage = webpage; if (!row.text) row.text = o.url || ''; }
                        else if (t === 'wall') row.text = (row.text ? row.text + '\\n' : '') + 'Запись: ' + String(o.text || '').slice(0, 300);
                        else row.text = row.text || __vkLabel(m);
                    }
                    if (row.kind === 'text' && !row.text) return;
                    if (photos.length > 1 && !row.text && row.kind === 'text') return;
                    out.push(row);
                });
                var can = conv.can_write ? conv.can_write.allowed !== false : true;
                h.data = { title: title, subtitle: subtitle, canWrite: can, messages: out };
                h.media = media;
                h.at = Date.now(); h.busy = false;
                return h.data;
            }, function () { h.busy = false; return h.data || { title: '', subtitle: '', messages: [], none: true }; });
        })()`,
        COMPOSER: `(function () {
            var el = document.querySelector('.ConvoComposer__input[contenteditable="true"], [class*=ConvoComposer] [contenteditable="true"]');
            if (!el) return null;
            var r = el.getBoundingClientRect();
            if (!r.width || !r.height) return null;
            el.focus();
            if (window.__ciVkHist) window.__ciVkHist.at = 0;
            return { x: r.left + Math.min(40, r.width / 2), y: r.top + r.height / 2 };
        })()`,
        // a dropped file joins VK's message field; Enter there sends it with the text
        DROP: `(function () {
            var area = document.querySelector('[class*=ConvoMain], [class*=ConvoHistory], [class*=Convo__]') || document.querySelector('.ConvoComposer__input');
            if (!area) return null;
            var r = area.getBoundingClientRect();
            return r.width && r.height ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
        })()`,
        MEDIA_POPUP: `(function () {
            var el = document.querySelector('.ConvoComposer__input[contenteditable="true"], [class*=ConvoComposer] [contenteditable="true"]');
            var send = document.querySelector('[class*=ConvoComposer__sendButton], [class*=ConvoComposer] button[aria-label*="Отправить"]');
            if (!el || !send) return null;
            var a = el.getBoundingClientRect(), s = send.getBoundingClientRect();
            if (!s.width) return null;
            return { caption: { x: a.left + Math.min(40, a.width / 2), y: a.top + a.height / 2 }, send: { x: s.left + s.width / 2, y: s.top + s.height / 2 } };
        })()`,
        // a voice message of the open conversation, from VK's own address of it
        MEDIA: (id) => `(function () {
            var h = window.__ciVkHist, url = h && h.media && h.media[${JSON.stringify(String(id))}];
            if (!url || url.indexOf('https://') !== 0) return null;
            return fetch(url).then(function (r) { return r.ok ? r.blob() : null; }).then(function (blob) {
                if (!blob || blob.size > ${VK_MEDIA_MAX_BYTES}) return null;
                return new Promise(function (resolve) {
                    var fr = new FileReader();
                    fr.onload = function () { resolve({ data: String(fr.result), mime: blob.type || 'audio/ogg' }); };
                    fr.onerror = function () { resolve(null); };
                    fr.readAsDataURL(blob);
                });
            }).catch(function () { return null; });
        })()`,
        // earlier messages: VK is asked for more of the history next time
        OLDER: `(function () {
            var h = window.__ciVkHist;
            if (!h || h.count >= 200) return false;
            h.count += ${VK_OLDER_STEP}; h.at = 0;
            return true;
        })()`
    }
}

module.exports = { vkList, vkChat }
