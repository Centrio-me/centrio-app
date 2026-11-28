// Strings of the new tools of Settings → Расширения (11.2026). Each locale file attaches its part as `vext`;
// a missing string falls back to English, then Russian (renderer/i18n.js).
module.exports = {
    ru: {
        settings: 'Настройки',
        panelTitle: 'Инструменты правой панели',
        panelHint: 'Включены по умолчанию. Выключите то, чем не пользуетесь: значок уйдёт из правой панели, а сами данные останутся.',
        panelOrderHint: 'Включается в Расширениях',
        spell: { title: 'Проверка правописания', desc: 'Подчёркивает ошибки во всех сервисах и в заметках, исправления в меню правой кнопки' },
        translate: {
            title: 'Переводчик', desc: 'Выделите текст, правая кнопка, «Перевести»: перевод появится рядом',
            target: 'Переводить на', targetHint: 'Язык, на который переводятся выделенные тексты.',
            insert: 'Вставить вместо', loading: 'Переводим…', failed: 'Не удалось перевести. Проверьте подключение к интернету и попробуйте ещё раз.'
        },
        adblock: {
            lists: 'Списки фильтров', listsHint: 'EasyList, EasyPrivacy и RU AdList: блокируют запросы к рекламным и следящим сетям. Обновляются сами раз в несколько дней.',
            cosmetic: 'Скрывать рекламные блоки', cosmeticHint: 'Прячет места под рекламу на сайтах, для которых в списках есть правила. Мессенджеры и рабочие сервисы не затрагиваются.',
            stats: 'В списках: {d} доменов и правила для {s} сайтов. Обновлено: {when}.', blocked: 'Заблокировано запросов: {n}', never: 'ещё не загружались',
            update: 'Обновить списки', updating: 'Загружаем…', unavailable: 'Не удалось получить состояние списков.'
        },
        timer: { title: 'Таймер', desc: 'В быстром переходе (Ctrl+K): «таймер 15 мин», по окончании придёт уведомление со звуком', ex1: 'таймер 15 мин', ex2: 'таймер 1:30 чай', ex3: 'через 2 часа',
            for: 'Таймер на {d}', start: 'Enter: запустить', left: 'Осталось {t}', cancel: 'Enter: отменить', done: 'Таймер сработал', doneLabel: 'Таймер сработал: {label}', h: 'ч', m: 'мин', s: 'сек' },
        units: { title: 'Конвертер единиц', desc: 'В быстром переходе (Ctrl+K): длина, вес, объём, скорость, температура, размер файлов', ex1: '5 км в мили', ex2: '70 кг в фунты', ex3: '20 c в f' },
        color: { title: 'Цветовая пипетка', desc: 'Пипетка берёт цвет с экрана (правая кнопка по странице или «пипетка» в Ctrl+K), а записанный цвет показывается как HEX, RGB и HSL', ex1: 'пипетка', ex2: '#5aa9ff', ex3: 'rgb(90, 169, 255)',
            pickTitle: 'Цвет с экрана', pickLabel: 'Пипетка: взять цвет с экрана', pickHint: 'Enter, затем клик по цвету', again: 'Взять ещё', unsupported: 'Пипетка недоступна в этой версии программы.' },
        hints: { title: 'Что ещё можно написать', sum: 'посчитать', money: 'перевести деньги по курсу ЦБ', units: 'перевести единицы', timer: 'запустить таймер', color: 'показать цвет во всех записях', eyedropper: 'взять цвет со страницы', commands: 'команды Centrio' },
        menu: { translateSelection: 'Перевести выделенное', translateField: 'Перевести написанное', fixErrors: 'Исправить ошибки', eyedropper: 'Пипетка: взять цвет' },
        fix: { title: 'Исправление ошибок', checking: 'Проверяем…', empty: 'В поле нет текста.', none: 'Ошибок не найдено.', failed: 'Не удалось проверить текст.', keep: 'оставить', apply: 'Исправить' },
        answers: { what: 'Что можно написать в Ctrl+K', group: 'Ответ', copy: 'Enter: скопировать', loading: 'Загружаем курс…', rate: 'Курс ЦБ на {d} · Enter', close: 'Закрыть', copyText: 'Скопировать перевод', copyShort: 'Копировать', copied: 'Скопировано' },
        currency: {
            title: 'Курс валют и калькулятор', desc: 'В быстром переходе (Ctrl+K) считает примеры и переводит деньги по курсу Банка России',
            how: 'Что можно написать в Ctrl+K', ex1: '2+2*3, (10+5)/3, 200*15%', ex2: '100 usd, 5000 руб в евро, $20', ex3: '1 000 юаней в рубли',
            source: 'Курс Банка России на {d}. Обновляется несколько раз в день.', offline: 'Курс пока не загружен: проверьте подключение к интернету.'
        },
        panel: {
            todos: { title: 'Задачи', desc: 'Список дел, сроки и напоминания, быстрая задача по Ctrl+Alt+Space' },
            notes: { title: 'Заметки', desc: 'Заметки и списки с поиском, папками и картинками' },
            quickReplies: { title: 'Быстрые ответы', desc: 'Тексты, которые вы часто пишете, копируются в любой чат одним нажатием' },
            passwords: { title: 'Менеджер паролей', desc: 'Пароли под мастер-паролем, подстановка на сайтах, синхронизация между устройствами' }
        }
    },
    en: {
        settings: 'Settings',
        panelTitle: 'Right panel tools',
        panelHint: 'On by default. Switch off what you do not use: its icon leaves the right panel, the data stays.',
        panelOrderHint: 'Switched on in Extensions',
        spell: { title: 'Spell checking', desc: 'Underlines mistakes in every service and in notes, fixes in the right-click menu' },
        translate: {
            title: 'Translator', desc: 'Select a text, right-click, «Translate»: the translation appears next to it',
            target: 'Translate into', targetHint: 'The language selected texts are translated into.',
            insert: 'Replace in the field', loading: 'Translating…', failed: 'Could not translate. Check your internet connection and try again.'
        },
        adblock: {
            lists: 'Filter lists', listsHint: 'EasyList, EasyPrivacy and RU AdList: block requests to ad and tracking networks. They update by themselves every few days.',
            cosmetic: 'Hide ad blocks', cosmeticHint: 'Hides the ad slots on sites that have rules in the lists. Messengers and work services are left alone.',
            stats: 'In the lists: {d} domains and rules for {s} sites. Updated: {when}.', blocked: 'Requests blocked: {n}', never: 'not downloaded yet',
            update: 'Update the lists', updating: 'Downloading…', unavailable: 'Could not read the state of the lists.'
        },
        timer: { title: 'Timer', desc: 'In the quick switcher (Ctrl+K): «timer 15 min», a notification with a sound comes when it is done', ex1: 'timer 15 min', ex2: 'timer 1:30 tea', ex3: 'in 2 hours',
            for: 'Timer for {d}', start: 'Enter: start', left: '{t} left', cancel: 'Enter: cancel', done: 'The timer is up', doneLabel: 'The timer is up: {label}', h: 'h', m: 'min', s: 'sec' },
        units: { title: 'Unit converter', desc: 'In the quick switcher (Ctrl+K): length, weight, volume, speed, temperature, file sizes', ex1: '5 km to mi', ex2: '70 kg to lb', ex3: '20 c to f' },
        color: { title: 'Colour picker', desc: 'The eyedropper takes a colour from the screen (right-click a page or «eyedropper» in Ctrl+K), a written colour is shown as HEX, RGB and HSL', ex1: 'eyedropper', ex2: '#5aa9ff', ex3: 'rgb(90, 169, 255)',
            pickTitle: 'Colour from the screen', pickLabel: 'Eyedropper: pick a colour from the screen', pickHint: 'Enter, then click a colour', again: 'Pick another', unsupported: 'The eyedropper is not available in this version.' },
        hints: { title: 'What else you can type', sum: 'solve a sum', money: 'convert money at the Bank of Russia rate', units: 'convert units', timer: 'start a timer', color: 'show a colour in every notation', eyedropper: 'pick a colour from the page', commands: 'Centrio commands' },
        menu: { translateSelection: 'Translate the selection', translateField: 'Translate what is written', fixErrors: 'Fix mistakes', eyedropper: 'Eyedropper: pick a colour' },
        fix: { title: 'Fixing mistakes', checking: 'Checking…', empty: 'There is no text in the field.', none: 'No mistakes found.', failed: 'Could not check the text.', keep: 'keep', apply: 'Fix' },
        answers: { what: 'What you can type in Ctrl+K', group: 'Answer', copy: 'Enter: copy', loading: 'Loading the rate…', rate: 'CBR rate {d} · Enter', close: 'Close', copyText: 'Copy the translation', copyShort: 'Copy', copied: 'Copied' },
        currency: {
            title: 'Currency rates and calculator', desc: 'In the quick switcher (Ctrl+K) it solves sums and converts money at the Bank of Russia rate',
            how: 'What you can type in Ctrl+K', ex1: '2+2*3, (10+5)/3, 200*15%', ex2: '100 usd, 5000 rub to eur, $20', ex3: '1 000 cny to rub',
            source: 'Bank of Russia rate for {d}. Updated a few times a day.', offline: 'The rate is not loaded yet: check your internet connection.'
        },
        panel: {
            todos: { title: 'Tasks', desc: 'To-do list, due dates and reminders, quick task with Ctrl+Alt+Space' },
            notes: { title: 'Notes', desc: 'Notes and lists with search, folders and pictures' },
            quickReplies: { title: 'Quick replies', desc: 'Texts you write often, copied into any chat with one click' },
            passwords: { title: 'Password manager', desc: 'Passwords under a master password, filled in on sites, synced between devices' }
        }
    }
}
