// Скачивает иконки мессенджеров, которых нет в assets/logomessenger/
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'assets', 'logomessenger');

const icons = [
    { file: 'discord.png',     url: 'https://www.google.com/s2/favicons?domain=discord.com&sz=128' },
    { file: 'slack.png',       url: 'https://www.google.com/s2/favicons?domain=slack.com&sz=128' },
    { file: 'viber.png',       url: 'https://www.google.com/s2/favicons?domain=viber.com&sz=128' },
    { file: 'skype.png',       url: 'https://www.google.com/s2/favicons?domain=skype.com&sz=128' },
    { file: 'teams.png',       url: 'https://www.google.com/s2/favicons?domain=teams.microsoft.com&sz=128' },
    { file: 'wechat.png',      url: 'https://www.google.com/s2/favicons?domain=weixin.qq.com&sz=128' },
    { file: 'zoom.png',        url: 'https://www.google.com/s2/favicons?domain=zoom.us&sz=128' },
    { file: 'bip.png',         url: 'https://www.google.com/s2/favicons?domain=bip.com&sz=128' },
    { file: 'signal.png',      url: 'https://www.google.com/s2/favicons?domain=signal.org&sz=128' },
    { file: 'line.png',        url: 'https://www.google.com/s2/favicons?domain=line.me&sz=128' },
    { file: 'messenger.png',   url: 'https://www.google.com/s2/favicons?domain=messenger.com&sz=128' },
    { file: 'instagram.png',   url: 'https://www.google.com/s2/favicons?domain=instagram.com&sz=128' },
    { file: 'x.png',           url: 'https://www.google.com/s2/favicons?domain=x.com&sz=128' },
    { file: 'linkedin.png',    url: 'https://www.google.com/s2/favicons?domain=linkedin.com&sz=128' },
    { file: 'googlechat.png',  url: 'https://www.google.com/s2/favicons?domain=chat.google.com&sz=128' },
    { file: 'rocketchat.png',  url: 'https://www.google.com/s2/favicons?domain=rocket.chat&sz=128' },
    { file: 'outlook.png',     url: 'https://www.google.com/s2/favicons?domain=outlook.live.com&sz=128' },
    { file: 'yahoo.png',       url: 'https://www.google.com/s2/favicons?domain=mail.yahoo.com&sz=128' },
    { file: 'protonmail.png',  url: 'https://www.google.com/s2/favicons?domain=proton.me&sz=128' },
    { file: 'notion.png',      url: 'https://www.google.com/s2/favicons?domain=notion.so&sz=128' },
    { file: 'trello.png',      url: 'https://www.google.com/s2/favicons?domain=trello.com&sz=128' },
    { file: 'asana.png',       url: 'https://www.google.com/s2/favicons?domain=asana.com&sz=128' },
    { file: 'clickup.png',     url: 'https://www.google.com/s2/favicons?domain=clickup.com&sz=128' },
    { file: 'monday.png',      url: 'https://www.google.com/s2/favicons?domain=monday.com&sz=128' },
    { file: 'jira.png',        url: 'https://www.google.com/s2/favicons?domain=atlassian.com&sz=128' },
    { file: 'github.png',      url: 'https://www.google.com/s2/favicons?domain=github.com&sz=128' },
    { file: 'figma.png',       url: 'https://www.google.com/s2/favicons?domain=figma.com&sz=128' },
    { file: 'todoist.png',     url: 'https://www.google.com/s2/favicons?domain=todoist.com&sz=128' },
    { file: 'twitch.png',      url: 'https://www.google.com/s2/favicons?domain=twitch.tv&sz=128' },
    { file: 'zendesk.png',     url: 'https://www.google.com/s2/favicons?domain=zendesk.com&sz=128' },
    { file: 'vk.png',          url: 'https://www.google.com/s2/favicons?domain=vk.com&sz=128' },
    { file: 'mailru.png',      url: 'https://www.google.com/s2/favicons?domain=mail.ru&sz=128' },
    { file: 'discord.png',     url: 'https://www.google.com/s2/favicons?domain=discord.com&sz=128' },
    { file: 'yandexchat.png',  url: 'https://www.google.com/s2/favicons?domain=yandex.ru&sz=128' },
    { file: 'alice.png',       url: 'https://www.google.com/s2/favicons?domain=alice.yandex.ru&sz=128' },
    // ── Добавлено из каталога rambox.app/apps/ (2026-08-28, live user request) ──
    { file: 'element.png',     url: 'https://www.google.com/s2/favicons?domain=element.io&sz=128' },
    { file: 'threema.png',     url: 'https://www.google.com/s2/favicons?domain=threema.ch&sz=128' },
    { file: 'wire.png',        url: 'https://www.google.com/s2/favicons?domain=wire.com&sz=128' },
    { file: 'zalo.png',        url: 'https://www.google.com/s2/favicons?domain=zalo.me&sz=128' },
    { file: 'groupme.png',     url: 'https://www.google.com/s2/favicons?domain=groupme.com&sz=128' },
    { file: 'threads.png',     url: 'https://www.google.com/s2/favicons?domain=threads.net&sz=128' },
    { file: 'snapchat.png',    url: 'https://www.google.com/s2/favicons?domain=snapchat.com&sz=128' },
    { file: 'googlemeet.png',  url: 'https://www.google.com/s2/favicons?domain=meet.google.com&sz=128' },
    { file: 'webex.png',       url: 'https://www.google.com/s2/favicons?domain=webex.com&sz=128' },
    { file: 'chatwork.png',    url: 'https://www.google.com/s2/favicons?domain=chatwork.com&sz=128' },
];

function download(url, dest) {
    return new Promise((resolve, reject) => {
        if (fs.existsSync(dest)) { resolve('skip'); return; }
        const file = fs.createWriteStream(dest);
        const mod = url.startsWith('https') ? https : http;
        const req = mod.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                file.close();
                fs.unlinkSync(dest);
                return download(res.headers.location, dest).then(resolve).catch(reject);
            }
            res.pipe(file);
            file.on('finish', () => file.close(() => resolve('ok')));
        });
        req.on('error', err => { fs.existsSync(dest) && fs.unlinkSync(dest); reject(err); });
    });
}

async function main() {
    const unique = [...new Map(icons.map(i => [i.file, i])).values()];
    for (const { file, url } of unique) {
        const dest = path.join(OUT, file);
        try {
            const res = await download(url, dest);
            if (res === 'skip') console.log(`  ⏭ ${file} (уже есть)`);
            else console.log(`  ✓ ${file}`);
        } catch (e) {
            console.log(`  ✗ ${file}: ${e.message}`);
        }
    }
    console.log('\nГотово!');
}

main();
