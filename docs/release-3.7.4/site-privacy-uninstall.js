// 3.7.4: adds the «removing the app» line to the privacy policy (ru + en). Run inside a copy of the site source on
// the server (cwd = project root, like site-deploy.sh does), BEFORE the build. Not deployed yet — goes with 3.7.4.
const fs = require('fs')

const RU = '          <p style={pS}><strong style={strongS}>1.3.1 Удаление программы (Windows).</strong> Когда вы удаляете Centrio с компьютера на Windows, программа один раз сообщает нам об этом: передаются только случайный идентификатор установки и номер версии, без имени, почты и содержимого. Если на этом компьютере выполнялся вход в аккаунт, отметка «удалил программу» появляется в вашем профиле. Мы используем её только для статистики: сколько людей перестают пользоваться приложением и через какое время.</p>\n'
// (EN paragraph style kept for reference, the page uses a list)
const EN_UNUSED = '          <p style={pS}><strong style={strongS}>1.3.1 Removing the app (Windows).</strong> When you remove Centrio from a Windows computer, the app tells us once: only a random install identifier and the version number are sent, no name, email or content. If you were signed in on that computer, a “removed the app” mark appears in your profile. We use it only for statistics: how many people stop using the app and after how long.</p>\n'

function addAfter(file, marker, line) {
    const s = fs.readFileSync(file, 'utf8')
    if (s.includes('1.3.1 ')) { console.log(file, 'already'); return }
    const i = s.indexOf(marker)
    if (i < 0) throw new Error(file + ': marker not found')
    const end = s.indexOf('</p>\n', i) + '</p>\n'.length
    fs.writeFileSync(file, s.slice(0, end) + line + s.slice(end))
    console.log(file, 'added')
}

addAfter('src/app/privacy/page.tsx', '1.3 Технические данные.', RU)
// The English page is a short list: one more item after «Technical data»
const enFile = 'src/app/en/privacy/page.tsx'
if (fs.existsSync(enFile)) {
    const en = fs.readFileSync(enFile, 'utf8')
    const marker = 'Technical data:</strong>'
    if (en.includes('Removing the app')) console.log(enFile, 'already')
    else if (!en.includes(marker)) throw new Error(enFile + ': marker not found')
    else {
        const i = en.indexOf(marker)
        const end = en.indexOf('</li>\n', i) + '</li>\n'.length
        const item = '            <li><strong style={strongS}>Removing the app (Windows):</strong> when you remove Centrio from a Windows computer, the app tells us once — only a random install identifier and the version number, no name, email or content. If you were signed in on that computer, a “removed the app” mark appears in your profile. Used only for statistics.</li>\n'
        fs.writeFileSync(enFile, en.slice(0, end) + item + en.slice(end))
        console.log(enFile, 'added')
    }
}
