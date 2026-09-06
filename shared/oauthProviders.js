'use strict'

// ── OAuth-провайдеры, которым нужен popup-брокер вместо обычного webview/
// внешнего браузера ────────────────────────────────────────────────────────
// Большинство OAuth-провайдеров (в первую очередь Google) сознательно
// отказывают во входе изнутри embedded-браузера — Electron <webview>
// детектится как небезопасный встроенный браузер, и вместо формы входа
// показывается "This browser or app may not be secure" (или форма просто
// виснет). Решение — не webview и не внешний системный браузер (там нет
// сессии мессенджера, и вернуть управление обратно в приложение нечем), а
// обычное popup-окно с нормальным desktop-UA Chrome и ТОЙ ЖЕ session
// partition, что и у мессенджера (см. main/ipc/window.js createPopupWindow →
// isOAuthBroker): такое окно проходит проверку провайдера, а полученные
// cookies/сессия остаются в той же партиции, что и у уже открытого webview
// мессенджера.
//
// Общий файл (не renderer/, не main/), потому что он нужен в обоих
// процессах: renderer/webview-tabs-bind.js использует его для
// 'will-navigate' (top-level редиректы внутри webview) и старого,
// фактически мёртвого на текущей версии Electron слушателя 'new-window';
// main/bootstrap/registerAppEvents.js использует его в
// contents.setWindowOpenHandler() на уровне гостевого webContents — это
// единственный путь, который Chromium реально вызывает для window.open()
// изнутри <webview> на этой версии Electron (см. комментарий там). esbuild
// (build-renderer.js, bundle:true) резолвит относительные require() за
// пределами renderer/ так же, как обычный Node require в main/ — отдельного
// шага сборки не нужно.
//
// BUGFIX ("вход в Я.Мессенджер не работает" — live-reproduced): yandex.ru/chat
// логинит через ПЕРВЫЙ-ПАРТИЙНЫЙ passport.yandex.ru, не через
// oauth.yandex.ru (тот — только для стороннего "Войти через Яндекс" на чужих
// сайтах). passport.yandex.ru не совпадал с этим списком → popup для него
// создавался НЕ как OAuth-брокер (main/ipc/window.js: isOAuthBroker требует
// валидный opts.returnHost, который выставляется только когда
// isOAuthProviderUrl() истинно), а как "обычный" popup — тот безусловно
// делает event.preventDefault() + shell.openExternal() на КАЖДОЙ навигации
// (см. 'will-navigate' в createPopupWindow) и обрывает вход сразу после
// первого шага формы, выкидывая в системный браузер без сессии мессенджера.
const OAUTH_PROVIDER_HOST_RE = /(^|\.)accounts\.google\.com$|(^|\.)appleid\.apple\.com$|(^|\.)login\.live\.com$|(^|\.)login\.microsoftonline\.com$|(^|\.)oauth\.yandex\.(ru|com)$|(^|\.)passport\.yandex\.(ru|com)$|(^|\.)id\.vk\.com$/i

function isOAuthProviderUrl(url) {
    try {
        return OAUTH_PROVIDER_HOST_RE.test(new URL(url).hostname)
    } catch {
        return false
    }
}

// ── Яндекс: внутренние cross-domain cookie-sync хосты ──────────────────────
// BUGFIX (2026-08-24, "Яндекс.Почта — лишний второй попап"): sso.ya.ru и
// sso.passport.yandex.(ru|com) — служебные хопы, синхронизирующие cookies
// между доменами Яндекса в середине логин-флоу; они ПОДСТРОЧНО совпадают с
// OAUTH_PROVIDER_HOST_RE (тот завязан на суффикс "passport.yandex.ru"), но
// сами никогда не являются экраном входа. Раньше список жил только локально
// в main/bootstrap/registerAppEvents.js (используется там, чтобы не открыть
// ВТОРОЙ popup поверх уже идущей sync-навигации внутри одного и того же
// popup) — см. подробный BUGFIX-комментарий на месте прежнего объявления.
//
// BUGFIX (2026-08-25, "зависает после входа в Яндекс, помогает только
// перезапуск всего приложения" — live-reproduced, root-caused через
// [oauth-broker][DEBUG]-лог): main/ipc/window.js's maybeFinishOAuth() —
// СОВСЕМ ДРУГАЯ функция в другом файле, отвечающая за то, КОГДА закрывать
// уже открытый OAuth-попап — не знала об этом списке вообще. Живой лог
// показал точный момент разрыва: `setWindowOpenHandler` открывал popup на
// passport.yandex.ru/auth (валидный экран входа), а 26 секунд спустя, сразу
// после успешного логина, maybeFinishOAuth сработал на
// `navUrl=https://sso.ya.ru/sync?...&finish=https%3A%2F%2Fcookier.360.yandex.ru%2Fyandex360session%3Fretpath%3D...yandex.ru%2Fchat...`
// и ТУТ ЖЕ закрыл popup — потому что sso.ya.ru не входил ни в
// isOAuthProviderUrl(), ни в isGoogleAccountsUrl(), а других проверок
// maybeFinishOAuth не делал. Реальный флоу должен был продолжиться с
// sso.ya.ru/sync НА cookier.360.yandex.ru (тот и правда выставляет
// финальные session-cookies по параметру `finish`, судя по имени и по URL в
// логе) и только ПОТОМ на yandex.ru/chat с уже рабочей сессией — вместо
// этого popup обрывался посередине cookie-sync цепочки, партиция
// оставалась с частично записанной/несогласованной сессией, и никакой
// webview.reload() эту сессию починить не мог — требовался полный
// перезапуск приложения (свежий процесс/сессия), что в точности совпадает
// с описанием пользователя. cookier.360.yandex.ru добавлен в список тем же
// доводом: это ещё один cookie-sync хоп той же природы, а не финальный
// экран, так что промежуточная посадка на нём тоже не должна закрывать
// popup. Вынесено сюда (в общий shared/-файл), чтобы ОБА места — старая
// проверка-от-двойного-попапа в registerAppEvents.js и maybeFinishOAuth() в
// window.js — читали один и тот же список, а не рассинхронизировались
// снова при следующей правке.
const YANDEX_INTERNAL_SSO_HOSTS = new Set([
    'sso.ya.ru',
    'sso.passport.yandex.ru',
    'sso.passport.yandex.com',
    'cookier.360.yandex.ru'
])

function isYandexInternalSsoHost(url) {
    try {
        return YANDEX_INTERNAL_SSO_HOSTS.has(new URL(url).hostname.toLowerCase())
    } catch {
        return false
    }
}

module.exports = {
    OAUTH_PROVIDER_HOST_RE,
    isOAuthProviderUrl,
    YANDEX_INTERNAL_SSO_HOSTS,
    isYandexInternalSsoHost
}
