// Поддержка реальных Chrome-расширений — жёстко заданный каталог (сейчас: Google
// Переводчик, LanguageTool), НЕ открытый магазин "установить по ID".
//
// LanguageTool (2026-07-30): добавлен по тому же паттерну, что и Google
// Переводчик, без специфичных патчей — ID подтверждён живым запросом к
// офиц. Chrome Web Store update-check endpoint (только заголовки редиректа,
// без скачивания самого .crx), CRX3-подпись проверяется тем же общим кодом
// (verifyCrx3Signature), no-op шим chrome.contextMenus применяется
// автоматически (он общий для всех ключей CATALOG, не специфичен для
// translate-ext). applySameLanguageHintPatch ниже намеренно НЕ трогает
// LanguageTool (guard `key !== 'translate-ext'`) — это патч именно под
// Closure-сборку Google Переводчика.
//
// Живой тест реального .crx (.claude/ext-real-test/test-languagetool-live.js,
// 2026-07-30) нашёл в background.js вызов `this._contextMenu.removeAll().then(...)`
// БЕЗ callback'а (ожидает Promise-стиль API) — это выполняется не на верхнем
// уровне при загрузке скрипта, а внутри отложенного storageController.onReady(),
// поэтому падение там не валит регистрацию всего service worker (не тот же
// класс бага, что у chrome.contextMenus.onClicked в Google Переводчике), но
// раньше молча ломало бы именно пункт меню "проверить в LanguageTool"
// (removeAll() возвращал undefined → .then на undefined → TypeError). Из-за
// этого находки CONTEXT_MENUS_SHIM ниже сделан двухрежимным: если вызван без
// callback — возвращает Promise.resolve(), как настоящий chrome.contextMenus
// в MV3. Также используются chrome.windows.getAll/update и chrome.tabs.create
// (изначально — для показа premium-апселла/открытия trial-страницы по клику
// пользователя, не в top-level коде). chrome.windows остаётся тем же структурным
// пробелом Electron, что и у LastPass (см. ниже), и по-прежнему не критичен — ломает
// только апселл. НО chrome.tabs.create (2026-07-31, см. следующий абзац про попап
// подсказок) оказался НЕ ограничен апселлом: тот же вызов достаётся и до основного
// сценария клика по подчёркиванию, и был реальным блокером попапа — исправлен
// TABS_CREATE_SHIM ниже (аналогично тому, как у Google Переводчика без
// chrome.offscreen отваливается только TTS-озвучка — здесь же похожий по форме
// пробел оказался критичным, а не косметическим).
//
// LanguageTool, живой баг попапа подсказок (2026-07-31): установленный билд
// показывал подчёркивание ошибок, но НЕ показывал попап с вариантами замены по
// клику. Живым Electron-тестом (.claude/ext-real-test/probe-storage-live.js —
// изолированный минимальный пробник, не сам LanguageTool, чтобы исключить
// путаницу с его минифицированным кодом) найдена реальная причина:
// chrome.storage.sync в Electron СУЩЕСТВУЕТ как truthy-объект (typeof ===
// 'object', проходит любую проверку на наличие), но КАЖДЫЙ вызов его методов
// асинхронно реджектится с Error: "sync" is not available in this instance of
// Chrome. Это принципиально ДРУГОЙ класс пробела, чем chrome.contextMenus
// (тот просто undefined — !chrome.contextMenus надёжно ловит его). Живым
// тестом на самом LanguageTool (.claude/ext-real-test/test-languagetool-popup-live.js)
// подтверждено, что этот необработанный reject летит и из background.js, и из
// content.js — то есть какая-то инициализация, зависящая от настроек через
// storage.sync, рвётся раньше, чем успевает навесить обработчик клика по
// подчёркиванию, хотя сам рендеринг подчёркивания эту зависимость переживает.
// Исправлено новым STORAGE_SYNC_SHIM ниже: безусловно (без проверки на
// существование — она бесполезна) подменяет методы chrome.storage.sync
// алиасом на chrome.storage.local (последний работает в Electron корректно).
// Применяется теперь и к background.service_worker, И рекурсивно ко ВСЕМ .js
// файлам распакованного расширения (не только к manifest.content_scripts[].js —
// у LanguageTool главный content.js вообще не объявлен в манифесте, подгружается
// динамическим import() изнутри extension-loader.js, поэтому статического списка
// content_scripts недостаточно) — applyChromeApiShim и listJsFilesRecursive ниже
// расширены именно под это (раньше патчил только background).
//
// После этого фикса подчёркивание+клик стали доходить дальше, но попап всё ещё не
// появлялся — вскрылся ВТОРОЙ, независимый баг: chrome.tabs.create отсутствует
// (chrome.tabs.update при этом есть и работает) — см. TABS_CREATE_SHIM ниже и
// абзац про premium-апселл выше. Оба шима нужны одновременно для рабочего попапа.
//
// LastPass — ОКОНЧАТЕЛЬНОЕ решение пользователя (2026-07-30): НЕ делаем, вообще,
// не переоцениваем позже. Это не "отложено", вопрос закрыт. Причина зафиксирована
// технически ниже (падение background service worker), но сам отказ от LastPass —
// продуктовое решение пользователя, а не только техническое ограничение.
//
// Более широко: LastPass и другие пароль-менеджеры (пробовали также Bitwarden,
// RoboForm) сюда НЕ включены, т.к. их background service worker падает на старте с
// "Uncaught TypeError: Cannot read properties of undefined (reading 'onFocusChanged'/
// 'onCommitted')", т.к. Electron нативно не реализует chrome.windows и реализует
// chrome.webNavigation лишь частично — это структурный пробел платформы Electron,
// а не баг конкретного расширения, воспроизводится у всех проверенных пароль-менеджеров.
// Для этого КЛАССА пробелов (полноценная семантика окон/навигации, актуально для
// будущих других расширений, НЕ для LastPass, который закрыт отдельно решением выше)
// решение по-прежнему отложено: либо сторонняя обвязка chrome.windows
// (electron-chrome-extensions — GPL-3.0/Patron лицензия, требует отдельного решения
// пользователя), либо свой шим с реальной логикой (а не no-op — иначе поведение
// будет тихо неверным).
//
// Архитектура сознательно проще старой (см. .claude/plans/centrio-extensions-lastpass-translate.plan.md):
// без MV2-моста/relay-окна/патчинга manifest.json — эти хаки были главным подозреваемым
// в "белых экранах", из-за которых старую реализацию откатили (commit bed3d65). Спайк на
// Electron 39.8.10 показал, что session.loadExtension() + chrome.tabs/scripting работают
// нативно без обвязки.
//
// Исключения из "без спецпатчей" — три точечных шима в applyChromeApiShim() ниже
// (все три общие для ВСЕХ ключей CATALOG, не специфичны под конкретное расширение):
// CONTEXT_MENUS_SHIM, STORAGE_SYNC_SHIM и TABS_CREATE_SHIM (см. абзацы про
// LanguageTool выше). Начнём с contextMenus: Electron не реализует этот API вообще (chrome.contextMenus === undefined), а у Google
// Переводчика (и у многих других расширений) верхнеуровневый
// chrome.contextMenus.onClicked.addListener(...) стоит последней строкой background-скрипта.
// Необработанное исключение там валит ВСЮ регистрацию service worker (status code 15) —
// даже те listener'ы (onMessage и т.п.), что физически стоят раньше в файле и успевают
// выполниться до броска, аннулируются вместе с ним. Живым тестом подтверждено
// (.claude/ext-real-test/test-contextmenus-shim.js, test-shim-live.js): с этим шимом SW
// регистрируется, а сам перевод (bubble_compiled.js) не зависит от background вообще —
// делает fetch() к translate.googleapis.com напрямую из content script. chrome.offscreen
// (нужен только для TTS-озвучки) Electron тоже не реализует, но это не ломает основной
// перевод — вызов обёрнут внутри onMessage-обработчика, а не в top-level коде, поэтому
// непойманный reject там не валит SW целиком, а просто отключает кнопку "прослушать".
// Шим — no-op заглушка (никогда не открывает реальное меню), идемпотентна и применяется
// к файлу background.service_worker дважды: при установке (installExtension) и повторно,
// защитно, при каждой загрузке в сессию (loadIntoSession) — второе нужно, чтобы уже
// установленные ДО появления этого шима копии на диске тоже получили патч без переустановки.
//
// Опт-ин по умолчанию выключен (extensionsState[key] !== true), устанавливается
// только при явном включении карточки пользователем.
//
// Security-фиксы (по итогам security-reviewer от 2026-07-30):
// - HIGH-1: скачанный .crx теперь проверяется на подлинность полной CRX3-проверкой
//   подписи (verifyCrx3Signature ниже) — тот же алгоритм, что и в самом Chromium
//   (components/crx_file/crx_verifier.cc): сообщение "CRX3 SignedData\0" + LE-длина
//   signed_header_data + signed_header_data + архив, проверяется RSA-PKCS1/ECDSA
//   подписью(ями) из заголовка, а извлечённый crx_id должен совпадать и с самими
//   ключами подписи, и с ожидаемым ID из CATALOG. Это не хэш-пиннинг (у нас нет
//   заранее известного хэша каждой версии), а криптографическое доказательство,
//   что файл подписан тем же ключом, которому принадлежит заявленный Chrome
//   Web Store ID — подделать это без приватного ключа нельзя.
// - MEDIUM-1: редиректы при скачивании .crx ограничены allowlist'ом хостов Google
//   (см. isAllowedDownloadHost) и обязательным https на каждом шаге.
// - MEDIUM-2: guard от Windows drive-relative путей ("C:foo" — path.isAbsolute()
//   на win32 такое НЕ считает абсолютным, известный footgun) в applyChromeApiShim.

const { session, app } = require('electron')
const path = require('path')
const fs = require('fs')
const https = require('https')
const crypto = require('crypto')
const store = require('./store')

let log
try { log = require('electron-log') } catch { log = console }

// Жёстко заданный каталог — реальные ID из Chrome Web Store.
const CATALOG = {
    'translate-ext': {
        id: 'aapbdbdomjkkjkaonfhkkikfgjllcleb',
        name: 'Google Переводчик',
        storeUrl: 'https://chromewebstore.google.com/detail/google-переводчик/aapbdbdomjkkjkaonfhkkikfgjllcleb'
    },
    'languagetool-ext': {
        id: 'oldceeleldhonbafppcapldpdifcinji',
        name: 'LanguageTool',
        storeUrl: 'https://chromewebstore.google.com/detail/languagetool-grammar-spe/oldceeleldhonbafppcapldpdifcinji'
    }
}

// Версия строкой прод-версии Chrome для CRX update-check запроса — сам Electron
// не обязан совпадать по номеру, Google принимает достаточно широкий диапазон.
const CHROME_VERSION_FOR_CRX = '124.0.6367.60'

function getExtensionsRoot() {
    return path.join(app.getPath('userData'), 'centrio-extensions')
}

function getInstallDir(key) {
    const entry = CATALOG[key]
    if (!entry) throw new Error(`Unknown extension key: ${key}`)
    return path.join(getExtensionsRoot(), entry.id)
}

function isInstalled(key) {
    try {
        return fs.existsSync(path.join(getInstallDir(key), 'manifest.json'))
    } catch {
        return false
    }
}

function getCatalogForUi() {
    return Object.keys(CATALOG).map((key) => {
        const entry = CATALOG[key]
        return {
            key,
            name: entry.name,
            chromeId: entry.id,
            storeUrl: entry.storeUrl,
            installed: isInstalled(key)
        }
    })
}

function crxDownloadUrl(chromeId) {
    const x = `id=${chromeId}&installsource=ondemand&uc`
    const params = new URLSearchParams({
        response: 'redirect',
        prodversion: CHROME_VERSION_FOR_CRX,
        acceptformat: 'crx3',
        x
    })
    return `https://clients2.google.com/service/update2/crx?${params.toString()}`
}

// Allowlist хостов, которым мы доверяем скачивать .crx (сам update-check endpoint
// + известные CDN-хосты Google, на которые он реально редиректит). Каждый переход
// по редиректу (в т.ч. самый первый запрос) обязан быть https и попадать в этот
// список — иначе скачивание останавливается с ошибкой. Это не заменяет проверку
// подписи CRX3 (см. verifyCrx3Signature), а защищает от скачивания произвольного
// контента с не-Google хоста в первую очередь.
const ALLOWED_DOWNLOAD_HOST_SUFFIXES = ['.google.com', 'google.com', '.googleusercontent.com', '.gvt1.com']

function isAllowedDownloadHost(hostname) {
    const host = String(hostname || '').toLowerCase()
    return ALLOWED_DOWNLOAD_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(suffix))
}

function assertSafeDownloadUrl(url) {
    let parsed
    try {
        parsed = new URL(url)
    } catch {
        throw new Error('Invalid download URL')
    }
    if (parsed.protocol !== 'https:') {
        throw new Error(`Refusing non-https download URL: ${parsed.protocol}`)
    }
    if (!isAllowedDownloadHost(parsed.hostname)) {
        throw new Error(`Refusing download from disallowed host: ${parsed.hostname}`)
    }
    return parsed
}

function downloadFile(url, destPath, redirectsLeft = 5) {
    return new Promise((resolve, reject) => {
        if (redirectsLeft < 0) {
            reject(new Error('Too many redirects while downloading extension'))
            return
        }

        let safeUrl
        try {
            safeUrl = assertSafeDownloadUrl(url)
        } catch (err) {
            reject(err)
            return
        }

        const request = https.get(safeUrl, { headers: { 'User-Agent': 'Mozilla/5.0 Centrio' } }, (res) => {
            const status = res.statusCode || 0

            if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
                res.resume()
                let nextUrl
                try {
                    // Location может быть относительным — резолвим относительно текущего
                    // (уже проверенного) URL, затем следующий вызов downloadFile повторно
                    // проверит итоговый абсолютный URL через assertSafeDownloadUrl.
                    nextUrl = new URL(res.headers.location, safeUrl).toString()
                } catch (err) {
                    reject(new Error(`Invalid redirect location: ${err.message}`))
                    return
                }
                downloadFile(nextUrl, destPath, redirectsLeft - 1).then(resolve, reject)
                return
            }

            if (status !== 200) {
                res.resume()
                reject(new Error(`Download failed: HTTP ${status}`))
                return
            }

            const file = fs.createWriteStream(destPath)
            res.pipe(file)
            file.on('finish', () => file.close(() => resolve(destPath)))
            file.on('error', (err) => {
                fs.unlink(destPath, () => {})
                reject(err)
            })
        })

        request.on('error', reject)
    })
}

// --- CRX3 signature verification (HIGH-1 fix) ---------------------------------
//
// Минимальный protobuf-декодер: нам нужны только varint (wire type 0) и
// length-delimited (wire type 2) поля — этого достаточно для CrxFileHeader /
// AsymmetricKeyProof / SignedData (см. components/crx_file/crx3.proto в
// Chromium). Возвращает map: номер поля -> массив сырых значений (Buffer для
// wire type 2, BigInt для wire type 0).
function decodeProtobufFields(buf) {
    const fields = new Map()
    let offset = 0

    function readVarint() {
        let result = 0n
        let shift = 0n
        for (;;) {
            if (offset >= buf.length) throw new Error('Truncated protobuf varint')
            const byte = buf[offset++]
            result |= BigInt(byte & 0x7f) << shift
            if ((byte & 0x80) === 0) break
            shift += 7n
        }
        return result
    }

    while (offset < buf.length) {
        const tag = readVarint()
        const fieldNumber = Number(tag >> 3n)
        const wireType = Number(tag & 0x7n)
        let value

        if (wireType === 0) {
            value = readVarint()
        } else if (wireType === 1) {
            value = buf.subarray(offset, offset + 8)
            offset += 8
        } else if (wireType === 2) {
            const len = Number(readVarint())
            if (len < 0 || offset + len > buf.length) throw new Error('Truncated protobuf length-delimited field')
            value = buf.subarray(offset, offset + len)
            offset += len
        } else if (wireType === 5) {
            value = buf.subarray(offset, offset + 4)
            offset += 4
        } else {
            throw new Error(`Unsupported protobuf wire type ${wireType}`)
        }

        if (!fields.has(fieldNumber)) fields.set(fieldNumber, [])
        fields.get(fieldNumber).push(value)
    }
    return fields
}

// Хекс-строка -> алфавит расширений Chrome ('a'-'p' вместо '0'-'f'), 1-в-1 с
// ConvertHexadecimalToIDAlphabet в components/crx_file/id_util.cc.
function hexToExtensionIdAlphabet(hex) {
    let out = ''
    for (const ch of hex.toLowerCase()) {
        const val = parseInt(ch, 16)
        out += String.fromCharCode('a'.charCodeAt(0) + (Number.isNaN(val) ? 0 : val))
    }
    return out
}

// GenerateId(publicKeyDer) в терминах Chromium: первые 16 байт SHA-256 от
// публичного ключа (DER SPKI), в hex, переведённые в id-алфавит.
function extensionIdFromPublicKey(publicKeyDer) {
    const hash = crypto.createHash('sha256').update(publicKeyDer).digest()
    return hexToExtensionIdAlphabet(hash.subarray(0, 16).toString('hex'))
}

const CRX3_SIGNATURE_CONTEXT = Buffer.from('CRX3 SignedData\0', 'utf8') // 16 bytes, incl. trailing NUL

// Полная проверка подписи CRX3 — тот же алгоритм, что и в самом Chromium
// (components/crx_file/crx_verifier.cc, функция VerifyCrx3). headerBuf — сырые
// байты CrxFileHeader (protobuf), archiveBuf — оставшиеся байты файла (ZIP).
// Бросает исключение с понятным сообщением при любом несовпадении; ничего не
// возвращает при успехе (fail-closed).
function verifyCrx3Signature(headerBuf, archiveBuf, expectedChromeId) {
    const header = decodeProtobufFields(headerBuf)

    const signedHeaderDataList = header.get(10000)
    if (!signedHeaderDataList || signedHeaderDataList.length === 0) {
        throw new Error('CRX3 header missing signed_header_data')
    }
    const signedHeaderData = signedHeaderDataList[0]

    const signedData = decodeProtobufFields(signedHeaderData)
    const crxIdList = signedData.get(1)
    if (!crxIdList || crxIdList.length === 0) {
        throw new Error('CRX3 signed_header_data missing crx_id')
    }
    const declaredCrxId = hexToExtensionIdAlphabet(crxIdList[0].toString('hex'))

    if (declaredCrxId !== expectedChromeId) {
        throw new Error(`CRX3 declared id "${declaredCrxId}" does not match expected "${expectedChromeId}"`)
    }

    // Сообщение, которое подписано: "CRX3 SignedData\0" + LE(len(signed_header_data))
    // + signed_header_data + archive. Дословно из crx3.proto/crx_verifier.cc.
    const lengthPrefix = Buffer.alloc(4)
    lengthPrefix.writeUInt32LE(signedHeaderData.length, 0)
    const message = Buffer.concat([CRX3_SIGNATURE_CONTEXT, lengthPrefix, signedHeaderData, archiveBuf])

    const proofLists = [
        { fieldNumber: 2, name: 'sha256_with_rsa' },
        { fieldNumber: 3, name: 'sha256_with_ecdsa' }
    ]

    let proofCount = 0
    let matchingKeyFound = false

    for (const { fieldNumber, name } of proofLists) {
        const rawProofs = header.get(fieldNumber) || []
        for (const rawProof of rawProofs) {
            proofCount++
            const proof = decodeProtobufFields(rawProof)
            const publicKeyList = proof.get(1)
            const signatureList = proof.get(2)
            if (!publicKeyList || !signatureList) {
                throw new Error(`CRX3 ${name} proof missing public_key or signature`)
            }
            const publicKeyDer = Buffer.from(publicKeyList[0])
            const signature = Buffer.from(signatureList[0])

            if (extensionIdFromPublicKey(publicKeyDer) === declaredCrxId) {
                matchingKeyFound = true
            }

            let publicKeyObject
            try {
                publicKeyObject = crypto.createPublicKey({ key: publicKeyDer, format: 'der', type: 'spki' })
            } catch (err) {
                throw new Error(`CRX3 ${name} proof has invalid public key: ${err.message}`, { cause: err })
            }

            const verified = crypto.verify('sha256', message, publicKeyObject, signature)
            if (!verified) {
                throw new Error(`CRX3 ${name} signature verification failed`)
            }
        }
    }

    if (proofCount === 0) {
        throw new Error('CRX3 header has no signature proofs at all')
    }
    if (!matchingKeyFound) {
        throw new Error('CRX3 signed_header_data crx_id does not match any signing key in the header')
    }
}

// CRX3-формат: magic 'Cr24' (4 байта) + версия uint32 LE (4 байта) +
// длина protobuf-заголовка uint32 LE (4 байта) + сам заголовок + ZIP-архив.
// expectedChromeId — жёстко заданный ID из CATALOG; при несовпадении подписи
// или ID выбрасывает исключение и НЕ распаковывает архив (fail-closed).
function unpackCrx(crxPath, destDir, expectedChromeId) {
    const AdmZip = require('adm-zip')
    const buf = fs.readFileSync(crxPath)

    const magic = buf.toString('utf8', 0, 4)
    if (magic !== 'Cr24') {
        throw new Error('Not a valid CRX file (bad magic header)')
    }

    const version = buf.readUInt32LE(4)
    if (version !== 3) {
        throw new Error(`Unsupported CRX version: ${version} (only CRX3 is supported)`)
    }

    const headerLength = buf.readUInt32LE(8)
    const headerBuf = buf.subarray(12, 12 + headerLength)
    const zipStart = 12 + headerLength
    const zipBuf = buf.subarray(zipStart)

    verifyCrx3Signature(headerBuf, zipBuf, expectedChromeId)

    fs.rmSync(destDir, { recursive: true, force: true })
    fs.mkdirSync(destDir, { recursive: true })

    const zip = new AdmZip(zipBuf)
    zip.extractAllTo(destDir, true)
}

// No-op заглушка chrome.contextMenus — см. комментарий в начале файла для полного
// обоснования. Никогда не показывает реальное меню, только не даёт background-скрипту
// упасть на верхнем уровне при обращении к несуществующему в Electron API.
// remove/removeAll/update поддерживают ОБА стиля вызова настоящего chrome.contextMenus
// (callback ИЛИ Promise без callback'а) — найдено живым тестом на реальном LanguageTool
// .crx, где removeAll() вызывается без callback'а и ожидает .then(...).
const CONTEXT_MENUS_SHIM = `
if (typeof chrome !== 'undefined' && chrome.runtime && !chrome.contextMenus) {
  function __ctxMenuShimAsync(cb) { if (typeof cb === 'function') { cb(); return undefined } return Promise.resolve() }
  chrome.contextMenus = {
    create: function () {},
    remove: function (id, cb) { return __ctxMenuShimAsync(cb) },
    removeAll: function (cb) { return __ctxMenuShimAsync(cb) },
    update: function (id, props, cb) { return __ctxMenuShimAsync(cb) },
    onClicked: { addListener: function () {}, removeListener: function () {}, hasListener: function () { return false } }
  };
}
`.trim() + '\n'

// Шим chrome.storage.sync — НЕ похож на CONTEXT_MENUS_SHIM выше по своей природе.
// chrome.contextMenus в Electron просто отсутствует (undefined), поэтому проверка
// !chrome.contextMenus — надёжный флаг "надо подставить заглушку". А вот
// chrome.storage.sync в Electron СУЩЕСТВУЕТ как truthy-объект (typeof === 'object',
// проходит любую проверку на истинность/наличие), но КАЖДЫЙ вызов его методов
// (get/set/...) асинхронно реджектится с Error: "sync" is not available in this
// instance of Chrome. Подтверждено живым тестом на изолированном пробнике
// (.claude/ext-real-test/probe-storage-live.js) — реальная причина бага
// LanguageTool "подчёркивание есть, попап подсказок по клику не появляется":
// необработанный reject где-то в цепочке инициализации (background.js И
// отдельно в content.js) рвёт логику, которая читает/пишет настройки через
// storage.sync, прежде чем успевает настроить обработчик клика по подчёркиванию.
// Поэтому шим НЕ проверяет наличие chrome.storage.sync (это ничего не даст —
// объект и так есть), а безусловно подменяет его методы алиасом на
// chrome.storage.local, который в Electron работает корректно (round-trip
// подтверждён тем же пробником).
const STORAGE_SYNC_SHIM = `
if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
  (function () {
    const __localArea = chrome.storage.local
    const __syncShim = {
      get: function () { return __localArea.get.apply(__localArea, arguments) },
      set: function () { return __localArea.set.apply(__localArea, arguments) },
      remove: function () { return __localArea.remove.apply(__localArea, arguments) },
      clear: function () { return __localArea.clear.apply(__localArea, arguments) },
      getBytesInUse: __localArea.getBytesInUse
        ? function () { return __localArea.getBytesInUse.apply(__localArea, arguments) }
        : function () { return Promise.resolve(0) },
      onChanged: __localArea.onChanged
    }
    try {
      Object.defineProperty(chrome.storage, 'sync', { value: __syncShim, configurable: true, writable: true })
    } catch (e) {
      chrome.storage.sync = __syncShim
    }
  })()
}
`.trim() + '\n'

// Шим chrome.tabs.create — ТРЕТИЙ найденный точечный пробел (2026-07-31, тем же
// живым тестом на реальном LanguageTool, .claude/ext-real-test/test-languagetool-popup-live.js),
// и он оказался НАСТОЯЩИМ блокером попапа с подсказками (не просто апселл-фичей,
// как раньше документировано выше в шапке файла для этого же chrome.tabs.create).
// Эмпирически подтверждено отдельным изолированным пробником
// (.claude/ext-real-test/probe-tabs-live.js): в Electron chrome.tabs — реальный
// объект, chrome.tabs.update — реальная функция (работает), а chrome.tabs.create
// — строго undefined. Это ЧАСТИЧНАЯ реализация Electron chrome.tabs (не
// полное отсутствие, как chrome.windows у LastPass, и не "существует, но всегда
// реджектится", как storage.sync выше) — третий отдельный класс пробела.
// Живым тестом на content.js прослежен полный путь: клик по подчёркиванию LanguageTool
// шлёт chrome.runtime.sendMessage(...) в background.js, который в
// _onOpenURLMessage(e,t) делает `"self"===t.target?n.update(...):n.create(...)`
// (n = chrome.tabs) — необработанный reject от несуществующего .create долетает
// обратно до content.js как unhandled rejection ("TypeError: n.create is not a
// function", захвачено диагностическим unhandledrejection-listener'ом) и рвёт ту
// же цепочку инициализации, что должна показать toolbox-попап. Шим — best-effort
// деградация, а не полноценная реализация новых вкладок (Electron не даёт создать
// настоящую новую вкладку без electron-chrome-extensions/своей обвязки — см. шапку
// файла про chrome.windows у LastPass): если chrome.tabs.create отсутствует, но
// chrome.tabs.update есть, .create(props) перенаправляется на .update(props) —
// т.е. вместо открытия НОВОЙ вкладки просто переходит в ТЕКУЩЕЙ (то же самое
// компромиссное поведение, что уже принято для остальных структурных пробелов
// Electron в этом файле). Резолвится в {} БЕЗ windowId, чтобы вызывающий код
// (`.then(e=>{e&&e.windowId&&...windows.update(...)})`) не пытался следом дёрнуть
// ещё и chrome.windows (тоже отсутствующий в Electron) и не породил вторую
// необработанную ошибку.
const TABS_CREATE_SHIM = `
if (typeof chrome !== 'undefined' && chrome.tabs && typeof chrome.tabs.create !== 'function') {
  chrome.tabs.create = function (createProperties) {
    if (typeof chrome.tabs.update === 'function') {
      return chrome.tabs.update(createProperties).then(function () { return {} }).catch(function () { return {} })
    }
    return Promise.resolve({})
  }
}
`.trim() + '\n'

// Defense-in-depth guard для путей, взятых из manifest.json (CRX качается с офиц.
// CDN Google по жёстко заданному ID и теперь ещё проверяется CRX3-подписью — см.
// verifyCrx3Signature — но path-guard оставляем как отдельный независимый слой).
// Отклоняет: обычные абсолютные пути (path.isAbsolute — ловит POSIX "/..." и
// Windows "C:\..."/"\\server\share"), UNC-префиксы вида "//" или "\\\\", и
// ОТДЕЛЬНО — Windows drive-relative пути вида "C:foo" (без разделителя сразу
// после двоеточия). path.isAbsolute() на win32 такие пути АБСОЛЮТНЫМИ не считает
// (известный footgun: 'C:foo' резолвится ОС относительно текущего рабочего
// каталога на диске C:, а не как './foo' — то есть может выйти за пределы
// destDir даже пройдя path.isAbsolute()===false).
function isUnsafeManifestPath(candidate) {
    if (typeof candidate !== 'string' || candidate.length === 0) return true
    if (path.isAbsolute(candidate)) return true
    if (/^[a-zA-Z]:/.test(candidate)) return true // "C:foo" drive-relative
    if (candidate.startsWith('\\\\') || candidate.startsWith('//')) return true // UNC
    return false
}

// Безопасно резолвит relative-путь файла скрипта из manifest.json внутри destDir и
// применяет к нему один или несколько шимов (префиксом), идемпотентно — если файл уже
// начинается с конкретного шима, повторно его не добавляет. Тот же path-guard
// (isUnsafeManifestPath + path.relative outside-check), что и раньше для service_worker,
// теперь переиспользуется для ЛЮБОГО файла скрипта из манифеста (background ИЛИ content script).
function applyShimsToScriptFile(destDir, relFile, shims) {
    if (!relFile || typeof relFile !== 'string') return
    if (isUnsafeManifestPath(relFile)) return

    const filePath = path.join(destDir, relFile)
    if (path.relative(destDir, filePath).startsWith('..')) return
    if (!fs.existsSync(filePath)) return

    let content = fs.readFileSync(filePath, 'utf8')
    let changed = false
    for (const shim of shims) {
        if (content.startsWith(shim)) continue
        content = shim + content
        changed = true
    }
    if (changed) fs.writeFileSync(filePath, content)
}

// Применяет шимы Chrome API к background.service_worker И к каждому уникальному
// content-script файлу из manifest.json, если они есть. Идемпотентно (повторная
// установка не задваивает шимы) и без побочных эффектов, если файл уже содержит
// соответствующий Chrome API сам по себе (шимы внутри себя ничего не переопределяют
// сверх того, что явно описано в их собственных комментариях).
//
// CONTEXT_MENUS_SHIM применяется только к background — chrome.contextMenus в реальном
// Chrome доступен только фоновому/расширенческому контексту, не content script'ам.
//
// STORAGE_SYNC_SHIM применяется И к background, И ко ВСЕМ .js файлам во всём
// распакованном дереве расширения — живой тест
// (.claude/ext-real-test/probe-storage-live.js + test-languagetool-popup-live.js)
// подтвердил падение chrome.storage.sync и в background.js, и в content.js у
// реального LanguageTool. Важно: content.js у LanguageTool НЕ объявлен в
// manifest.content_scripts вообще — он динамически подгружается через
// import(chrome.runtime.getURL("/content.js")) изнутри extension-loader.js
// (подтверждено чтением extension-loader.js в этом же расследовании), поэтому
// перебора manifest.content_scripts[].js недостаточно для покрытия реальных
// случаев — берём рекурсивный обход всей директории расширения. STORAGE_SYNC_SHIM
// безопасен для такого широкого применения: он полностью no-op, если
// chrome/chrome.storage.local отсутствуют в контексте выполнения файла (guard
// в самом шиме), и идемпотентен (проверка startsWith перед каждым файлом).
// CONTEXT_MENUS_SHIM остаётся точечным (только background) — chrome.contextMenus
// в реальном Chrome доступен только фоновому/расширенческому контексту.
//
// TABS_CREATE_SHIM применяется так же широко, как STORAGE_SYNC_SHIM (background +
// рекурсивно все .js файлы) — найденный вживую call site у LanguageTool лежит в
// background.js, но chrome.tabs в принципе (в реальном Chrome) доступен и другим
// расширенческим контекстам (не только content script'ам), и сам шим полностью
// no-op, если chrome.tabs в контексте выполнения файла отсутствует (guard внутри
// шима) — расширить область применения дешевле, чем рисковать пропустить другой
// call site у будущих расширений в CATALOG.
function applyChromeApiShim(destDir, manifest) {
    const swFile = manifest && manifest.background && manifest.background.service_worker
    applyShimsToScriptFile(destDir, swFile, [CONTEXT_MENUS_SHIM, STORAGE_SYNC_SHIM, TABS_CREATE_SHIM])

    for (const jsFile of listJsFilesRecursive(destDir)) {
        if (jsFile === swFile) continue // уже обработан выше (все три шима)
        applyShimsToScriptFile(destDir, jsFile, [STORAGE_SYNC_SHIM, TABS_CREATE_SHIM])
    }
}

// Рекурсивно собирает относительные (от destDir) пути всех .js файлов внутри
// распакованного расширения. Используется только для уже проверенного CRX3-подписью
// и извлечённого во временную/рабочую директорию расширения (не для произвольного
// недоверенного дерева), поэтому полный обход безопасен и предсказуем по размеру
// (реальные расширения из CATALOG — единицы-десятки МБ, не рекурсивные symlink-ловушки).
function listJsFilesRecursive(baseDir, subDir = '') {
    const currentDir = path.join(baseDir, subDir)
    let entries
    try {
        entries = fs.readdirSync(currentDir, { withFileTypes: true })
    } catch (err) {
        return []
    }
    const results = []
    for (const entry of entries) {
        const relPath = path.join(subDir, entry.name)
        if (entry.isDirectory()) {
            results.push(...listJsFilesRecursive(baseDir, relPath))
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
            results.push(relPath)
        }
    }
    return results
}

// Подсказка вместо тишины, когда Google Переводчик сам подавляет пузырёк из-за
// совпадения определённого языка выделения с целевым языком перевода (это
// штатное поведение bubble_compiled.js — isMyLanguage()===true — а не баг
// Centrio/Electron, подтверждено рядом изолированных диагностик в
// .claude/ext-real-test/, включая живой прод-тест на реальном билде). Вместо
// молчания показываем свою реплику: "вы пытаетесь перевести с X на X — это
// один и тот же язык, выберите другой язык перевода".
//
// v2 (по фидбеку с живого билда): подсказка должна появляться ТОЛЬКО по клику
// на иконку перевода, а не сразу при выделении текста — как обычный сценарий
// (выделение → иконка → клик → перевод). v1 показывала подсказку немедленно
// при выделении, т.к. вызывала её прямо в точке isMyLanguage()===true, вообще
// не создавая иконку (в оригинале Google в этой ветке иконка тоже не
// создаётся — просто ничего не происходит). v2 патчит иначе: оба call site
// теперь ВСЕГДА вызывают translateText(...), при isMyLanguage()===true передавая
// 5-й параметр e = целевой язык (сигнал "режим подсказки"); третий патч — внутри
// самого translateText — создаёт иконку как обычно, но привязывает её CLICK
// на подсказку вместо handleClickIcon, когда e истинно (для не-ICON режима —
// мгновенный показ подсказки в той же точке, где был бы мгновенный перевод).
//
// Технически, как и applyChromeApiShim выше: (1) отдельный маленький content
// script, подключаемый ПЕРВЫМ в manifest.content_scripts[0].js, определяет
// window.__centrioShowSameLangHint; (2) три точечные строковые замены в
// bubble_compiled.js (i18n-ветка через detectSelectionLanguage callback,
// non-i18n-ветка через Bubble.detectLanguage(), и сам translateText). Семантика
// остального поведения (языки НЕ совпадают → показывается иконка/перевод как
// раньше) сохраняется 1-в-1 — проверено живыми Electron-тестами:
// .claude/ext-real-test/test-same-lang-hint-v2.js (3 сценария: ru==ru →
// иконка сразу, подсказка по клику; en==en → то же; ru!=en → иконка, обычный
// перевод по клику, подсказка не показывается — регрессия не сломана).
//
// Каждая замена ищется как строго уникальная подстрока в файле; если анкор не
// найден один раз (Google выпустил другую сборку bubble_compiled.js) — эта
// конкретная замена просто пропускается с логом, а НЕ бросает исключение,
// чтобы никогда не сломать основной перевод из-за несовпадения текста патча.
const HINT_FILENAME = 'centrio_same_lang_hint.js'
const HINT_SOURCE = `
window.__centrioShowSameLangHint = window.__centrioShowSameLangHint || function (rect, detected, target) {
  try {
    if (!rect || (rect.width === 0 && rect.height === 0)) return;
    var old = document.getElementById('centrio-same-lang-hint');
    if (old) old.remove();
    var LANG_NAMES = {
      ru: ['русского', 'русский'], en: ['английского', 'английский'],
      de: ['немецкого', 'немецкий'], es: ['испанского', 'испанский'],
      fr: ['французского', 'французский'], it: ['итальянского', 'итальянский'],
      zh: ['китайского', 'китайский'], 'zh-CN': ['китайского', 'китайский'],
      pt: ['португальского', 'португальский'], uk: ['украинского', 'украинский'],
      tr: ['турецкого', 'турецкий'], ar: ['арабского', 'арабский'],
      ja: ['японского', 'японский'], ko: ['корейского', 'корейский']
    };
    var isRu = !!(chrome.i18n && chrome.i18n.getUILanguage && chrome.i18n.getUILanguage().indexOf('ru') === 0);
    // form: 'gen' = родительный падеж (после "с"), 'acc' = винительный/именительный
    // (после "на" и перед "текст") — иначе получается грамматически неверное
    // "с русского на русского" вместо "с русского на русский".
    function nameOf(code, form) {
      var e = LANG_NAMES[code];
      if (!e) return code || '?';
      if (!isRu) return code || '?';
      return form === 'acc' ? e[1] : e[0];
    }
    var msg = isRu
      ? ('Вы пытаетесь перевести с ' + nameOf(detected, 'gen') + ' на ' + nameOf(target, 'acc') + ' \\u2014 это один и тот же язык. ' +
         'Если нужно переводить ' + nameOf(target, 'acc') + ' текст, выберите другой язык перевода в настройках расширения Google Переводчик.')
      : ('You are translating ' + (detected || '?') + ' to ' + (target || '?') + ' \\u2014 same language. ' +
         'To translate ' + (target || '?') + ' text, choose a different target language in Google Translate settings.');

    var el = document.createElement('div');
    el.id = 'centrio-same-lang-hint';
    el.setAttribute('style', [
      'position:fixed', 'z-index:2147483647', 'max-width:280px',
      'left:' + Math.max(8, Math.round(rect.left)) + 'px',
      'top:' + Math.round(rect.bottom + 8) + 'px',
      'background:#202124', 'color:#e8eaed', 'font:13px/1.4 Roboto,Arial,sans-serif',
      'padding:10px 12px', 'border-radius:8px', 'box-shadow:0 2px 10px rgba(0,0,0,.35)',
      'pointer-events:auto'
    ].join(';'));
    el.textContent = msg;
    var closeBtn = document.createElement('span');
    closeBtn.textContent = ' \\u2715';
    closeBtn.setAttribute('style', 'float:right;cursor:pointer;opacity:.7;margin-left:8px');
    closeBtn.addEventListener('click', function (ev) { ev.stopPropagation(); el.remove(); });
    el.insertBefore(closeBtn, el.firstChild);
    document.documentElement.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.remove(); }, 6000);
  } catch (e) {}
};
`.trim() + '\n'

const SAME_LANG_HINT_PATCHES = [
    [
        `module$contents$gtx$Bubble_detectSelectionLanguage(b,function(d){if(!module$contents$gtx$Bubble_optionsInBubble.isMyLanguage(d)){if(d==\n"zh"||d=="zh-Hant")d="zh-CN";module$contents$gtx$Bubble_translateText(a,b,c,d)}})`,
        `module$contents$gtx$Bubble_detectSelectionLanguage(b,function(d){if(!module$contents$gtx$Bubble_optionsInBubble.isMyLanguage(d)){if(d==\n"zh"||d=="zh-Hant")d="zh-CN";module$contents$gtx$Bubble_translateText(a,b,c,d)}else{module$contents$gtx$Bubble_translateText(a,b,c,d,module$contents$gtx$Bubble_optionsInBubble.get_targetLang())}})`
    ],
    [
        `module$contents$gtx$Bubble_Bubble.detectLanguage()&&module$contents$gtx$Bubble_optionsInBubble.isMyLanguage(module$contents$gtx$Bubble_Bubble.detectedLanguage)||module$contents$gtx$Bubble_translateText(a,b,c)`,
        `module$contents$gtx$Bubble_Bubble.detectLanguage()&&module$contents$gtx$Bubble_optionsInBubble.isMyLanguage(module$contents$gtx$Bubble_Bubble.detectedLanguage)?module$contents$gtx$Bubble_translateText(a,b,c,module$contents$gtx$Bubble_Bubble.detectedLanguage,module$contents$gtx$Bubble_optionsInBubble.get_targetLang()):module$contents$gtx$Bubble_translateText(a,b,c)`
    ],
    [
        `module$contents$gtx$Bubble_translateText=function(a,b,c,d){b=b.getRangeAt(0).getBoundingClientRect();module$contents$gtx$Bubble_Bubble.goodAnchor(b)&&(module$contents$gtx$Options_Options.showBubble.ICON==module$contents$gtx$Bubble_optionsInBubble.get_showBubble()?(a=module$contents$gtx$Bubble_Bubble.getTranslateIcon(a,b),goog.events.listen(a,module$contents$goog$events$EventType_EventType.CLICK,\ngoog.partial(module$contents$gtx$Bubble_handleClickIcon,b,c,d))):module$contents$gtx$Bubble_translator.getTranslationResult(c,goog.partial(module$contents$gtx$Bubble_afterTranslatorSet,b),"bubble",d))}`,
        `module$contents$gtx$Bubble_translateText=function(a,b,c,d,e){b=b.getRangeAt(0).getBoundingClientRect();module$contents$gtx$Bubble_Bubble.goodAnchor(b)&&(module$contents$gtx$Options_Options.showBubble.ICON==module$contents$gtx$Bubble_optionsInBubble.get_showBubble()?(a=module$contents$gtx$Bubble_Bubble.getTranslateIcon(a,b),goog.events.listen(a,module$contents$goog$events$EventType_EventType.CLICK,\ne?function(){window.__centrioShowSameLangHint&&window.__centrioShowSameLangHint(b,d,e)}:goog.partial(module$contents$gtx$Bubble_handleClickIcon,b,c,d))):e?(window.__centrioShowSameLangHint&&window.__centrioShowSameLangHint(b,d,e)):module$contents$gtx$Bubble_translator.getTranslationResult(c,goog.partial(module$contents$gtx$Bubble_afterTranslatorSet,b),"bubble",d))}`
    ]
]

// Живой баг-репорт пользователя: "Cannot check text — confirm privacy policy
// first" почти всегда, и лишь изредка (по ощущениям) выскакивает нормальное
// окно согласия, после чего проверка начинает работать. Расследование чтения
// живого content.js (oldceeleldhonbafppcapldpdifcinji/content.js) нашло точную
// причину — это НЕ баг Centrio/Electron, а собственная рандомизированная
// логика LanguageTool:
//
//   static shouldProactivelyShowModal(){
//     return this._waitForStorageController().then(()=>{
//       if(Math.random()>.2) return Promise.resolve(!1);   // <-- вот эта строка
//       if(!TERMS_OF_SERVICE_MODAL_ENABLED) return false;
//       if(!this.hasNoticePeriodStarted()) return false;
//       if(this._hasShownModal) return false;
//       ...дальше настоящие условия (тип расширения, нет custom-сервера/логина,
//       ещё не принята текущая версия соглашения)...
//
// Вызывается это из _renderTermsOfServiceModal(), которая срабатывает РОВНО
// ОДИН РАЗ на каждый экземпляр тулбара (флаг this._isTermsOfServiceModalRendered
// взводится сразу, независимо от исхода) — то есть даже без рандома шанс
// увидеть окно согласия был бы один на тулбар, а с Math.random()>.2 это ещё и
// урезано до ~20% попыток. Отдельно есть путь через клик по "!"-иконке
// тулбара (_onToolbarPermissionRequiredIconClicked) — но для НОВОГО пользователя
// (appliedSuggestions===0) он ВСЕГДА уходит в открытие внешнего URL
// (chrome.tabs.create/update на languagetool.org/webextension/welcome), а не
// показывает то же самое окно согласия — то есть это не запасной путь для
// первого запуска, он бесполезен именно в самый нужный момент.
//
// Патч заменяет `Math.random()>.2` на `false` — это НЕ обходит и не подделывает
// согласие: показывается ТО ЖЕ САМОЕ окно LanguageTool с кнопками
// "Later"/"Continue", реальное согласие пользователя (клик "Continue") по-прежнему
// обязательно и по-прежнему пишется в chrome.storage самим LanguageTool. Патч
// только убирает произвольный рандомизированный gate маркетингового "нежного
// напоминания" — все остальные настоящие условия (лицензия соглашения ещё не
// принята, окно ещё не показывалось в этом тулбаре, нет custom-сервера/логина,
// период уведомления уже начался) остаются как есть. Идемпотентно и безопасно:
// если Google/LanguageTool поменяют сборку и анкор перестанет встречаться ровно
// один раз — патч просто пропускается с логом, полноценная проверка текста при
// этом не ломается (просто вернётся прежнее ~20%-поведение).
const CONSENT_MODAL_RELIABILITY_PATCHES = [
    ['if(Math.random()>.2)return Promise.resolve(!1);', 'if(false)return Promise.resolve(!1);']
]

// Специфично для LanguageTool (структура и анкоры взяты из его собственного
// content.js) — не вызывать для других расширений.
function applyConsentModalReliabilityPatch(key, destDir, manifest) {
    if (key !== 'languagetool-ext') return
    try {
        const contentPath = path.join(destDir, 'content.js')
        if (!fs.existsSync(contentPath)) return

        let src = fs.readFileSync(contentPath, 'utf8')
        const alreadyPatched = src.includes('if(false)return Promise.resolve(!1);')
        if (alreadyPatched) return

        let appliedCount = 0
        for (const [from, to] of CONSENT_MODAL_RELIABILITY_PATCHES) {
            const count = src.split(from).length - 1
            if (count !== 1) {
                log.info(`[extensions] consent-modal-reliability patch anchor mismatch (count=${count}), skipping — LanguageTool's own ~20% random modal behavior stays as-is`)
                continue
            }
            src = src.split(from).join(to)
            appliedCount++
        }
        if (appliedCount > 0) {
            fs.writeFileSync(contentPath, src)
            log.info(`[extensions] applied ${appliedCount}/${CONSENT_MODAL_RELIABILITY_PATCHES.length} consent-modal-reliability patches to content.js`)
        }
    } catch (err) {
        log.error(`[extensions] applyConsentModalReliabilityPatch failed for "${key}":`, err.message)
    }
}

// Специфично для Google Переводчика (module$contents$gtx$Bubble_* — приватные
// имена именно его Closure-сборки) — не вызывать для других расширений.
function applySameLanguageHintPatch(key, destDir, manifest) {
    if (key !== 'translate-ext') return
    try {
        const cs = manifest && Array.isArray(manifest.content_scripts) ? manifest.content_scripts[0] : null
        if (!cs || !Array.isArray(cs.js) || !cs.js.includes('bubble_compiled.js')) return

        const bubblePath = path.join(destDir, 'bubble_compiled.js')
        if (!fs.existsSync(bubblePath)) return

        let src = fs.readFileSync(bubblePath, 'utf8')
        const alreadyPatched = src.includes('__centrioShowSameLangHint')

        if (!alreadyPatched) {
            let appliedCount = 0
            for (const [from, to] of SAME_LANG_HINT_PATCHES) {
                const count = src.split(from).length - 1
                if (count !== 1) {
                    log.info(`[extensions] same-lang-hint patch anchor mismatch (count=${count}), skipping this one patch — translate itself is unaffected`)
                    continue
                }
                src = src.split(from).join(to)
                appliedCount++
            }
            if (appliedCount > 0) {
                fs.writeFileSync(bubblePath, src)
                log.info(`[extensions] applied ${appliedCount}/${SAME_LANG_HINT_PATCHES.length} same-lang-hint patches to bubble_compiled.js`)
            }
        }

        const hintPath = path.join(destDir, HINT_FILENAME)
        if (!fs.existsSync(hintPath) || fs.readFileSync(hintPath, 'utf8') !== HINT_SOURCE) {
            fs.writeFileSync(hintPath, HINT_SOURCE)
        }

        if (!cs.js.includes(HINT_FILENAME)) {
            cs.js = [HINT_FILENAME].concat(cs.js)
            const manifestPath = path.join(destDir, 'manifest.json')
            fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
        }
    } catch (err) {
        log.error(`[extensions] applySameLanguageHintPatch failed for "${key}":`, err.message)
    }
}

async function installExtension(key) {
    const entry = CATALOG[key]
    if (!entry) return { success: false, error: 'unknown-extension' }

    const root = getExtensionsRoot()
    fs.mkdirSync(root, { recursive: true })
    const tmpCrx = path.join(root, `${entry.id}.crx`)

    try {
        await downloadFile(crxDownloadUrl(entry.id), tmpCrx)

        const destDir = getInstallDir(key)
        unpackCrx(tmpCrx, destDir, entry.id)

        const manifestPath = path.join(destDir, 'manifest.json')
        if (!fs.existsSync(manifestPath)) {
            throw new Error('Unpacked extension is missing manifest.json')
        }

        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
        applyChromeApiShim(destDir, manifest)
        applySameLanguageHintPatch(key, destDir, manifest)
        applyConsentModalReliabilityPatch(key, destDir, manifest)

        log.info(`[extensions] installed "${key}" (${entry.id}) into ${destDir}`)
        return { success: true }
    } catch (err) {
        log.error(`[extensions] install failed for "${key}":`, err.message)
        return { success: false, error: err.message }
    } finally {
        fs.unlink(tmpCrx, () => {})
    }
}

function uninstallExtension(key) {
    if (!CATALOG[key]) return { success: false, error: 'unknown-extension' }

    try {
        removeFromAllMessengerSessions(key)
        fs.rmSync(getInstallDir(key), { recursive: true, force: true })
        log.info(`[extensions] uninstalled "${key}"`)
        return { success: true }
    } catch (err) {
        log.error(`[extensions] uninstall failed for "${key}":`, err.message)
        return { success: false, error: err.message }
    }
}

function isExtensionEnabledInStore(key) {
    const state = store.get('extensionsState', {}) || {}
    return state[key] === true
}

// Загружает уже установленное расширение в конкретную сессию (persist:<messengerId>),
// если оно ещё не загружено туда. Безопасно вызывать многократно (идемпотентно).
async function loadIntoSession(ses, key) {
    if (!isInstalled(key)) return false
    const dir = getInstallDir(key)

    const already = ses.getAllExtensions().some((e) => e.path === dir)
    if (already) return true

    // На случай, если расширение было установлено до появления applyChromeApiShim()
    // (старая копия на диске) — шим идемпотентен, повторный вызов безопасен.
    try {
        const manifestPath = path.join(dir, 'manifest.json')
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
        applyChromeApiShim(dir, manifest)
        applySameLanguageHintPatch(key, dir, manifest)
        applyConsentModalReliabilityPatch(key, dir, manifest)
    } catch (err) {
        log.error(`[extensions] applyChromeApiShim retro-patch failed for "${key}":`, err.message)
    }

    await ses.loadExtension(dir, { allowFileAccess: false })
    return true
}

function removeFromSession(ses, key) {
    try {
        const dir = getInstallDir(key)
        const match = ses.getAllExtensions().find((e) => e.path === dir)
        if (match) ses.removeExtension(match.id)
    } catch (err) {
        log.error(`[extensions] removeFromSession failed for "${key}":`, err.message)
    }
}

// Точка входа, вызываемая при каждом создании webview (renderer/webview-tabs-bind.js).
// Загружает во ВСЕ включённые (extensionsState) и установленные расширения в эту сессию.
async function applyToSession(partition) {
    if (!partition || typeof partition !== 'string') {
        return { success: true, loaded: [] }
    }

    try {
        const ses = session.fromPartition(partition)
        const loaded = []

        for (const key of Object.keys(CATALOG)) {
            if (!isExtensionEnabledInStore(key)) continue
            if (!isInstalled(key)) continue
            try {
                await loadIntoSession(ses, key)
                loaded.push(key)
            } catch (err) {
                log.error(`[extensions] loadExtension failed for "${key}" in ${partition}:`, err.message)
            }
        }

        return { success: true, loaded }
    } catch (err) {
        log.error('[extensions] applyToSession error:', err.message)
        return { success: false, error: err.message }
    }
}

function getMessengerPartitions() {
    const messengers = store.get('messengers', []) || []
    return messengers.filter((m) => m && m.id).map((m) => `persist:${m.id}`)
}

function removeFromAllMessengerSessions(key) {
    for (const partition of getMessengerPartitions()) {
        try {
            removeFromSession(session.fromPartition(partition), key)
        } catch (err) {
            log.error(`[extensions] removeFromAllMessengerSessions failed for ${partition}:`, err.message)
        }
    }
}

// Явное действие "включить/выключить именно этот key везде прямо сейчас" — вызывается
// из ext:toggle сразу после того, как пользователь щёлкнул тумблер. Загружает/выгружает
// ТОЛЬКО переданный key, напрямую (без чтения extensionsState) — иначе была бы гонка
// с асинхронной записью store:set из рендерера (renderer store.set успевает в кеш
// мгновенно, но персистится в main через отдельный IPC-раунд-трип).
async function setEnabledEverywhere(key, enabled) {
    if (!CATALOG[key]) return { success: false, error: 'unknown-extension' }

    if (enabled) {
        if (!isInstalled(key)) {
            return { success: false, error: 'not-installed' }
        }
        const partitions = getMessengerPartitions()
        await Promise.all(partitions.map(async (partition) => {
            try {
                await loadIntoSession(session.fromPartition(partition), key)
            } catch (err) {
                log.error(`[extensions] enable failed for "${key}" in ${partition}:`, err.message)
            }
        }))
    } else {
        removeFromAllMessengerSessions(key)
    }

    return { success: true }
}

module.exports = {
    CATALOG,
    getCatalogForUi,
    isInstalled,
    installExtension,
    uninstallExtension,
    applyToSession,
    setEnabledEverywhere
}
