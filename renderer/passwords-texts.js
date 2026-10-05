// Texts of the password manager panel (Russian and English; every other language falls back to English).
const ru = {
    title: 'Пароли', add: 'Добавить пароль', search: 'Поиск по названию, сайту, логину', settings: 'Настройки', lockNow: 'Заблокировать', back: 'Назад',
    forThisSite: 'Для этой вкладки', all: 'Все пароли',
    emptyTitle: 'Пока нет сохранённых паролей', emptyHint: 'Войдите на любой сайт во вкладке — Centrio предложит сохранить пароль. Или добавьте его вручную кнопкой «+».',
    fill: 'Вставить', copyLogin: 'Скопировать логин', copyPassword: 'Скопировать пароль', show: 'Показать пароль', hide: 'Скрыть пароль',
    edit: 'Изменить', remove: 'Удалить', removeConfirm: 'Точно удалить?', copied: 'Скопировано', copiedPassword: 'Скопировано, буфер очистится через 30 с',
    newTitle: 'Новый пароль', editTitle: 'Изменить пароль', fieldTitle: 'Название', fieldUrl: 'Сайт', fieldLogin: 'Логин', fieldPassword: 'Пароль',
    passwordKeep: 'Оставьте пустым, чтобы не менять', generate: 'Сгенерировать', save: 'Сохранить', cancel: 'Отмена',
    errTitle: 'Укажите название', errUrl: 'Укажите адрес сайта, например avito.ru', errPassword: 'Введите пароль', errSave: 'Не удалось сохранить', errLimit: 'Достигнут лимит сохранённых паролей',
    filling: 'Вставляем…', filled: 'Вставлено', errNoPage: 'Откройте вкладку с сайтом, куда нужно войти.', errOrigin: 'Открытая страница не относится к этому сайту, вход остановлен ради безопасности.', errNoForm: 'Не нашли форму входа. Откройте страницу входа и попробуйте ещё раз.', errFill: 'Не удалось вставить пароль.',
    footnote: 'Всё хранится в зашифрованном виде.',
    setupTitle: 'Задайте мастер-пароль', setupText: 'Он защищает все ваши пароли. Его нужно будет вводить, чтобы открыть менеджер паролей.',
    setupWarn: 'Мастер-пароль нельзя восстановить: если забыть его, сохранённые пароли не открыть. Запомните его или запишите в надёжном месте.', setupBtn: 'Создать хранилище',
    masterNew: 'Мастер-пароль', masterRepeat: 'Повторите мастер-пароль', masterHint: 'Не короче {n} символов', masterLabel: 'Мастер-пароль', masterOld: 'Текущий мастер-пароль', masterCloud: 'Мастер-пароль облачного хранилища',
    errMasterShort: 'Мастер-пароль должен быть не короче {n} символов', errMasterMismatch: 'Пароли не совпадают', errSetup: 'Не удалось создать хранилище',
    lockedTitle: 'Менеджер паролей заблокирован', wrongMaster: 'Неверный мастер-пароль', unlock: 'Разблокировать',
    autoLock: 'Блокировать после бездействия', autoLockNever: 'Только при закрытии приложения', autoLockMin: '{n} мин',
    syncTitle: 'Синхронизация', syncOn: 'Пароли синхронизируются между вашими устройствами в зашифрованном виде. Облако хранит только зашифрованные данные, прочитать их без мастер-пароля нельзя.', syncPro: 'Синхронизация паролей между устройствами доступна в Pro.',
    changeMaster: 'Сменить мастер-пароль', changeBtn: 'Сменить', masterChanged: 'Мастер-пароль изменён',
    resetText: 'Если мастер-пароль забыт, хранилище можно только сбросить: все сохранённые пароли будут удалены.', resetBtn: 'Сбросить хранилище', resetConfirm: 'Удалить все пароли?',
    stripManage: 'Управление', stripNone: 'Ничего не найдено', stripClose: 'Закрыть',
    mismatch: 'В облаке уже есть другое хранилище паролей. Введите его мастер-пароль, чтобы объединить пароли.', mismatchJoin: 'Объединить', mismatchLater: 'Не сейчас'
}

const en = {
    title: 'Passwords', add: 'Add password', search: 'Search by name, site or login', settings: 'Settings', lockNow: 'Lock', back: 'Back',
    forThisSite: 'For this tab', all: 'All passwords',
    emptyTitle: 'No saved passwords yet', emptyHint: 'Sign in to any site in a tab and Centrio will offer to save the password. Or add one by hand with "+".',
    fill: 'Fill in', copyLogin: 'Copy login', copyPassword: 'Copy password', show: 'Show password', hide: 'Hide password',
    edit: 'Edit', remove: 'Delete', removeConfirm: 'Really delete?', copied: 'Copied', copiedPassword: 'Copied, the clipboard is cleared in 30 s',
    newTitle: 'New password', editTitle: 'Edit password', fieldTitle: 'Name', fieldUrl: 'Site', fieldLogin: 'Login', fieldPassword: 'Password',
    passwordKeep: 'Leave empty to keep the current one', generate: 'Generate', save: 'Save', cancel: 'Cancel',
    errTitle: 'Enter a name', errUrl: 'Enter the site address, e.g. avito.ru', errPassword: 'Enter a password', errSave: 'Could not save', errLimit: 'Saved passwords limit reached',
    filling: 'Filling in…', filled: 'Filled in', errNoPage: 'Open the tab of the site you want to sign in to.', errOrigin: 'The open page does not belong to this site: sign-in stopped for your safety.', errNoForm: 'Could not find the sign-in form. Open the sign-in page and try again.', errFill: 'Could not fill in the password.',
    footnote: 'Everything is stored encrypted.',
    setupTitle: 'Set a master password', setupText: 'It protects all your passwords. You will enter it to open the password manager.',
    setupWarn: 'The master password cannot be recovered: if you forget it, the saved passwords cannot be opened. Remember it or keep it somewhere safe.', setupBtn: 'Create vault',
    masterNew: 'Master password', masterRepeat: 'Repeat the master password', masterHint: 'At least {n} characters', masterLabel: 'Master password', masterOld: 'Current master password', masterCloud: 'Master password of the cloud vault',
    errMasterShort: 'The master password must be at least {n} characters', errMasterMismatch: 'The passwords do not match', errSetup: 'Could not create the vault',
    lockedTitle: 'The password manager is locked', wrongMaster: 'Wrong master password', unlock: 'Unlock',
    autoLock: 'Lock after inactivity', autoLockNever: 'Only when the app closes', autoLockMin: '{n} min',
    syncTitle: 'Sync', syncOn: 'Passwords sync between your devices, encrypted. The cloud only stores encrypted data that cannot be read without the master password.', syncPro: 'Syncing passwords between devices is available in Pro.',
    changeMaster: 'Change master password', changeBtn: 'Change', masterChanged: 'Master password changed',
    resetText: 'If the master password is forgotten, the vault can only be reset: all saved passwords will be deleted.', resetBtn: 'Reset vault', resetConfirm: 'Delete all passwords?',
    stripManage: 'Manage', stripNone: 'Nothing found', stripClose: 'Close',
    mismatch: 'The cloud already holds another password vault. Enter its master password to merge the passwords.', mismatchJoin: 'Merge', mismatchLater: 'Not now'
}

module.exports = { passwordsTexts: { ru, en } }
