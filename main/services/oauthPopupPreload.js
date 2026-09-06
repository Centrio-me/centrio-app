// BUGFIX (2026-08-26): this file used to also inject a script that hid
// navigator.userAgentData and overrode navigator.userAgent to Firefox on
// accounts.google.* pages, to paper over a Firefox-header/Chrome-JS
// mismatch produced by wireOAuthPopup()/ensureGoogleAccountsUaOverride()
// in main/ipc/window.js. Live A/B testing (scripts/ua-matrix.js, run
// against the user's real Gmail session) proved that whole UA-spoofing
// approach was the CAUSE of Google's rejection, not a fix for it — see the
// BUGFIX comment above isGoogleAccountsUrl() in main/ipc/window.js for the
// evidence. The spoofing on both ends has been removed instead of patched
// further; this preload now only guards WebAuthn conditional UI below.
;(function () {
    // BUGFIX (2026-08-25, "Гугл выдает про ключ на любой авторизации ...
    // постоянно сначала стандартное окно винды для входа через ключ" —
    // live-reported на трёх разных машинах, для ЛЮБОГО мессенджера, чей
    // OAuth-попап проходит через accounts.google.*, а не только для Grok):
    // тот же разрыв, что и в webview-preload.js (см. подробный BUGFIX-
    // комментарий там же) — WebAuthn "conditional UI" (автозаполнение
    // пасскеев) поднимает нативный OS-диалог Windows Hello/ключа САМ, ещё
    // до действия пользователя, независимо от UA/userAgentData-спуфинга
    // выше (тот меняет то, что Google ЧИТАЕТ, а не реальные возможности
    // движка — PublicKeyCredential.isConditionalMediationAvailable() это
    // прямая проверка возможностей, не UA-сниффинг). Та же двойная защита:
    // (1) isConditionalMediationAvailable() → false, чтобы корректный код
    // сам не стал звать conditional-get(); (2) сам conditional-get(),
    // если всё же вызван, возвращает вечно висящий Promise вместо
    // обращения к нативному API. Обычный (не-conditional) вызов —
    // осознанный явный вход через ключ безопасности — не трогаем.
    //
    // BUGFIX (2026-08-25, "открываю окно авторизации через Google —
    // Centrio целиком перестаёт реагировать на клики, ЗАКРЫТИЕ ПОПАПА НЕ
    // ПОМОГАЕТ" — live-reproduced и root-caused через computer-use:
    // Диспетчер задач не помечает ни один процесс Centrio.exe как "Не
    // отвечает" и CPU не растёт — значит это не deadlock, а блокировка
    // снаружи; клик по кастомной кнопке "свернуть" вообще не долетает.
    // То, что закрытие попапа НЕ снимает блокировку, исключает всё, что
    // завязано на жизненный цикл самого попап-окна (focus/alwaysOnTop-
    // фиксы из 2.3.22/2.3.23 в main/ipc/window.js) — блокирующий объект
    // переживает закрытие попапа, значит это осиротевший нативный OS-
    // диалог (WebAuthn conditional UI broker), а не что-то внутри
    // Electron. Вероятная причина, почему двойная защита выше иногда не
    // успевает: это <script>, инжектящийся в document.head, когда тот
    // появится (через retry-таймер) — гонка с собственным ранним
    // inline-скриптом Google в <head>, который может вызвать conditional
    // WebAuthn раньше, чем наш скрипт встанет. Скрипт-инъекция здесь
    // оставлена как есть (дешёвый second line of defence), но ГЛАВНый,
    // не подверженный гонке барьер — HTTP-заголовок Permissions-Policy
    // (publickey-credentials-get/-create), выставляемый на уровне движка
    // Chromium ДО выполнения любого скрипта страницы — добавлен отдельно
    // в main/ipc/window.js (onHeadersReceived, там же, где и wireOAuthPopup).
    function injectWebAuthnConditionalUiGuard() {
        const target = document.head || document.documentElement
        if (!target) {
            setTimeout(injectWebAuthnConditionalUiGuard, 10)
            return
        }
        try {
            const script = document.createElement('script')
            script.textContent = `(() => {
                try {
                    if (window.PublicKeyCredential && typeof window.PublicKeyCredential.isConditionalMediationAvailable === 'function') {
                        window.PublicKeyCredential.isConditionalMediationAvailable = () => Promise.resolve(false);
                    }
                } catch {}
                try {
                    if (navigator.credentials && typeof navigator.credentials.get === 'function') {
                        const originalCredentialsGet = navigator.credentials.get.bind(navigator.credentials);
                        navigator.credentials.get = function (options) {
                            if (options && options.mediation === 'conditional') {
                                return new Promise(() => {});
                            }
                            return originalCredentialsGet(options);
                        };
                    }
                } catch {}
            })();`
            target.appendChild(script)
            script.remove()
        } catch {
            // ignore — страница просто увидит настоящий WebAuthn conditional UI
        }
    }

    injectWebAuthnConditionalUiGuard()
})()

// BUGFIX (2026-08-26, "Grok — авторизация доходит до конца, но не проходит
// в самом Grok" — see matching BUGFIX comment above the
// 'oauth-relay-postmessage' listener in main/ipc/window.js for the full
// diagnosis): accounts.x.ai's own completion page (oauth-complete) matches
// the classic `window.opener.postMessage(...)` handoff pattern, but every
// OAuth popup this app opens is a manually-constructed `new BrowserWindow()`
// with no real window.open() relationship to the tab that triggered it, so
// `window.opener` is always null here — any postMessage call the page makes
// has nowhere to go. Define a `window.opener` shim whose postMessage() is
// relayed via IPC into the real guest <webview> by main/ipc/window.js.
//
// BUGFIX (2026-08-26, live re-test after shipping the fix above: "Грок —
// вход снова не выполнен" — still broken): the shim was injected via a
// `document.createElement('script')` appended to <head>/<html>, i.e. a
// classic inline <script> element. Identity/SSO completion pages routinely
// ship a strict `Content-Security-Policy: script-src ...` header with no
// 'unsafe-inline' and no matching nonce/hash for OUR injected element —
// Chromium silently refuses to execute it and just logs a CSP violation to
// the (invisible, since this is a popup with no devtools open) console. The
// shim never ran, `window.opener` stayed null, exactly reproducing the
// reported symptom. `webFrame.executeJavaScript()` evaluates code in the
// page's real main-world context the same way `<script>` injection does,
// but through the same internal channel DevTools' own Console/
// Runtime.evaluate uses — which Chromium does not subject to the page's
// script-src CSP (that policy only gates content the page's own HTML
// parser loads/executes, not first-party browser tooling). Same technique
// fixes BOTH x.ai's oauth-complete handoff and, generalized below, Google's
// own accounts.google.* handoff — see the widened scope note underneath.
//
// BUGFIX (2026-08-26, live report: "Gmail — показал окно авторизации,
// прошла авторизация, но окно осталось чёрным"): this shim used to be
// scoped to *.x.ai only. But the root cause is generic to EVERY OAuth
// provider this app talks to, not specific to xAI — Google Identity
// Services' own popup flow uses the exact same `window.opener.
// postMessage(...)` + `window.close()` handoff convention on its
// accounts.google.* completion page. With `window.opener` null there too,
// Google's page sits on its own blank "you can close this window now"
// screen forever instead of closing itself — that blank page is what read
// as "the window just went black". Widened the host match to also cover
// accounts.google.* (same hostname shape as GOOGLE_ACCOUNTS_HOST_RE in
// main/ipc/window.js, duplicated here rather than required across the
// main/preload boundary) so Gmail gets the same relay Grok does. The
// existing navigation-based settle-timer in maybeFinishOAuth() (main/ipc/
// window.js) remains the fallback for every OTHER provider that doesn't
// use this handoff pattern at all.
// BUGFIX (2026-08-26, live re-test: "Грок — вход снова не выполнен" STILL
// reproduces after the executeJavaScript shim above shipped — [oauth-broker]
// log confirms the settle-timer path fires instead, meaning the relay's own
// 'relayed opener.postMessage into guest webview' line never once appears
// for any real attempt): `webFrame.executeJavaScript()` runs the shim
// asynchronously — it round-trips the code to the renderer's DevTools-style
// evaluator and back, which takes at least one microtask/IPC tick. xAI's
// (and Google's) own completion page calls `window.opener && window.opener.
// postMessage(...)` synchronously, in its own earliest inline script — the
// exact same race already diagnosed and fixed with a non-script mechanism
// for the WebAuthn guard near the top of this file (see the BUGFIX comment
// above injectWebAuthnConditionalUiGuard). By the time our shim's
// executeJavaScript call actually lands, the page has usually already run
// its own `if (window.opener)` check, found it null, and given up without
// retrying — so `window.opener` being set a moment later changes nothing.
// Fix: contextBridge.exposeInMainWorld() runs synchronously as part of
// preload — which Electron guarantees completes before the page's own
// script starts executing at all — so defining `window.opener` directly
// through it (rather than injecting a same-purpose script afterwards)
// closes the race instead of narrowing it.
;(function () {
    const { contextBridge, ipcRenderer } = require('electron')

    const GOOGLE_ACCOUNTS_HOST_RE = /(^|\.)accounts\.google\.[a-z]{2,3}(\.[a-z]{2,3})?$/i

    function shouldRelayOpener() {
        const host = location.hostname
        return /(^|\.)x\.ai$/i.test(host) || GOOGLE_ACCOUNTS_HOST_RE.test(host)
    }

    if (shouldRelayOpener()) {
        try {
            contextBridge.exposeInMainWorld('opener', {
                postMessage: (data, targetOrigin) => {
                    try {
                        ipcRenderer.send('oauth-relay-postmessage', { data, targetOrigin })
                    } catch {}
                }
            })
        } catch {}
    }
})()
