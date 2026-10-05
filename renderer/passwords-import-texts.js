// Texts of the password import wizard: where to export from, step by step. Russian and English; other languages
// fall back to English.
const copy = {
    ru: {
        title: 'Импорт паролей', back: 'Назад', intro: 'Перенесите пароли из браузера или другого менеджера за пару минут. Выберите, откуда импортируем.',
        howTitle: 'Как скачать пароли из «{name}»', stepsNote: 'Названия пунктов меню могут немного отличаться в вашей версии.',
        fileNote: 'Вы получите файл .csv с вашими паролями. Он не зашифрован, поэтому после импорта Centrio предложит его удалить.',
        pickFile: 'Выбрать файл .csv', pickAgain: 'Выбрать другой файл', reading: 'Читаем файл…',
        found: 'Нашли паролей: {n}', add: 'Новых: {n}', update: 'Обновим (пароль изменился): {n}', same: 'Уже есть: {n}', skipped: 'Пропущено: {n}',
        skippedWhy: 'Пропускаются записи без пароля, без адреса сайта и пароли приложений Android.', examples: 'Например:',
        deleteAfter: 'Удалить файл с паролями после импорта', doImport: 'Импортировать ({n})', importing: 'Импортируем…', nothing: 'Новых паролей нет: всё из этого файла уже сохранено.',
        doneTitle: 'Готово', added: 'Добавлено: {n}', updated: 'Обновлено: {n}', erased: 'Файл с паролями удалён.',
        notErased: 'Не получилось удалить файл автоматически. Удалите его сами: в нём пароли в открытом виде.',
        kept: 'Файл с паролями остался на диске. Он не защищён: удалите его, когда не нужен.',
        browserTip: 'Совет: после переезда отключите сохранение паролей в браузере, чтобы не держать два хранилища.', close: 'Закрыть',
        errTOO_BIG: 'Файл слишком большой (больше 8 МБ).', errEMPTY: 'В файле нет строк с паролями.',
        errNO_COLUMNS: 'Не нашли столбцы с адресом сайта и паролем. Проверьте, что выбран файл экспорта паролей (.csv).',
        errLOCKED: 'Сначала разблокируйте менеджер паролей.', errEXPIRED: 'Время вышло. Выберите файл ещё раз.', errFAILED: 'Не удалось прочитать файл.'
    },
    en: {
        title: 'Import passwords', back: 'Back', intro: 'Move your passwords from a browser or another manager in a couple of minutes. Choose where to import from.',
        howTitle: 'How to export your passwords from “{name}”', stepsNote: 'Menu names can differ slightly in your version.',
        fileNote: 'You will get a .csv file with your passwords. It is not encrypted, so Centrio offers to delete it right after the import.',
        pickFile: 'Choose the .csv file', pickAgain: 'Choose another file', reading: 'Reading the file…',
        found: 'Passwords found: {n}', add: 'New: {n}', update: 'Will be updated (password changed): {n}', same: 'Already saved: {n}', skipped: 'Skipped: {n}',
        skippedWhy: 'Rows without a password, without a site address and Android app passwords are skipped.', examples: 'For example:',
        deleteAfter: 'Delete the file with the passwords after the import', doImport: 'Import ({n})', importing: 'Importing…', nothing: 'No new passwords: everything in this file is already saved.',
        doneTitle: 'Done', added: 'Added: {n}', updated: 'Updated: {n}', erased: 'The file with the passwords was deleted.',
        notErased: 'Could not delete the file automatically. Delete it yourself: it holds your passwords in plain text.',
        kept: 'The file with the passwords is still on the disk and is not protected: delete it when you no longer need it.',
        browserTip: 'Tip: after moving, turn off saving passwords in the browser so you do not keep two vaults.', close: 'Close',
        errTOO_BIG: 'The file is too large (over 8 MB).', errEMPTY: 'There are no password rows in the file.',
        errNO_COLUMNS: 'Could not find the site address and password columns. Make sure you picked the passwords export (.csv).',
        errLOCKED: 'Unlock the password manager first.', errEXPIRED: 'Time ran out. Choose the file again.', errFAILED: 'Could not read the file.'
    }
}

const sources = [
    { id: 'chrome', name: 'Google Chrome', icon: 'C', hue: 140, steps: {
        ru: ['Откройте Google Chrome и вставьте в адресную строку chrome://password-manager/settings (или меню ⋮ → «Пароли и автозаполнение» → «Менеджер паролей Google» → «Настройки»).', 'В разделе «Экспорт паролей» нажмите «Скачать файл».', 'Подтвердите действие паролем от Windows.', 'Сохраните файл, например на рабочий стол, и вернитесь сюда.'],
        en: ['Open Google Chrome and paste chrome://password-manager/settings into the address bar (or menu ⋮ → “Passwords and autofill” → “Google Password Manager” → “Settings”).', 'Under “Export passwords” press “Download file”.', 'Confirm with your Windows password.', 'Save the file, for example to the desktop, and come back here.'] } },
    { id: 'edge', name: 'Microsoft Edge', icon: 'E', hue: 200, steps: {
        ru: ['Откройте Microsoft Edge и вставьте в адресную строку edge://wallet/passwords (или меню ⋯ → «Настройки» → «Профили» → «Пароли»).', 'Нажмите «⋯» рядом с «Сохранённые пароли» и выберите «Экспортировать пароли».', 'Подтвердите паролем Windows.', 'Сохраните файл и вернитесь сюда.'],
        en: ['Open Microsoft Edge and paste edge://wallet/passwords into the address bar (or menu ⋯ → “Settings” → “Profiles” → “Passwords”).', 'Press “⋯” next to “Saved passwords” and choose “Export passwords”.', 'Confirm with your Windows password.', 'Save the file and come back here.'] } },
    { id: 'yandex', name: 'Яндекс Браузер', icon: 'Я', hue: 5, steps: {
        ru: ['Откройте Яндекс Браузер и вставьте в адресную строку browser://passwords (или «Меню» → «Пароли и карты»).', 'Нажмите «⋮» (или «Ещё») рядом со списком паролей и выберите «Экспорт паролей».', 'Подтвердите паролем Windows или мастер-паролем Яндекса, если он задан.', 'Выберите формат CSV, сохраните файл и вернитесь сюда.'],
        en: ['Open Yandex Browser and paste browser://passwords into the address bar (or “Menu” → “Passwords and cards”).', 'Press “⋮” (or “More”) next to the password list and choose “Export passwords”.', 'Confirm with your Windows password or the Yandex master password if you set one.', 'Pick the CSV format, save the file and come back here.'] } },
    { id: 'firefox', name: 'Mozilla Firefox', icon: 'F', hue: 25, steps: {
        ru: ['Откройте Firefox и вставьте в адресную строку about:logins (или меню ≡ → «Пароли»).', 'Нажмите «⋯» в правом верхнем углу и выберите «Экспортировать логины».', 'Подтвердите паролем Windows.', 'Сохраните файл .csv и вернитесь сюда.'],
        en: ['Open Firefox and paste about:logins into the address bar (or menu ≡ → “Passwords”).', 'Press “⋯” in the top right corner and choose “Export logins”.', 'Confirm with your Windows password.', 'Save the .csv file and come back here.'] } },
    { id: 'opera', name: 'Opera', icon: 'O', hue: 350, steps: {
        ru: ['Откройте Opera и вставьте в адресную строку opera://settings/passwords (или меню → «Настройки» → «Дополнительно» → «Автозаполнение и пароли» → «Пароли»).', 'Нажмите «⋮» рядом с «Сохранённые пароли» и выберите «Экспорт паролей».', 'Подтвердите паролем Windows и сохраните файл.'],
        en: ['Open Opera and paste opera://settings/passwords into the address bar (or menu → “Settings” → “Advanced” → “Autofill and passwords” → “Passwords”).', 'Press “⋮” next to “Saved passwords” and choose “Export passwords”.', 'Confirm with your Windows password and save the file.'] } },
    { id: 'brave', name: 'Brave', icon: 'B', hue: 20, steps: {
        ru: ['Откройте Brave и вставьте в адресную строку brave://settings/passwords.', 'Нажмите «⋮» рядом с «Сохранённые пароли» и выберите «Экспортировать пароли».', 'Подтвердите паролем Windows и сохраните файл.'],
        en: ['Open Brave and paste brave://settings/passwords into the address bar.', 'Press “⋮” next to “Saved passwords” and choose “Export passwords”.', 'Confirm with your Windows password and save the file.'] } },
    { id: 'bitwarden', name: 'Bitwarden', icon: 'B', hue: 215, steps: {
        ru: ['Откройте веб-хранилище Bitwarden (vault.bitwarden.com) и войдите.', 'Выберите «Инструменты» → «Экспорт хранилища».', 'В поле «Формат файла» выберите «.csv», введите мастер-пароль Bitwarden и нажмите «Экспортировать».', 'Сохраните файл и вернитесь сюда.'],
        en: ['Open the Bitwarden web vault (vault.bitwarden.com) and sign in.', 'Choose “Tools” → “Export vault”.', 'Pick “.csv” as the file format, enter your Bitwarden master password and press “Export”.', 'Save the file and come back here.'] } },
    { id: 'onepassword', name: '1Password', icon: '1', hue: 225, steps: {
        ru: ['Откройте 1Password на компьютере.', 'Выберите «Файл» → «Экспорт» и нужную учётную запись или хранилище (в 1Password 8: меню аккаунта → «Экспорт»).', 'Выберите формат CSV и подтвердите мастер-паролем.', 'Сохраните файл и вернитесь сюда.'],
        en: ['Open 1Password on your computer.', 'Choose “File” → “Export” and the account or vault (in 1Password 8: account menu → “Export”).', 'Pick the CSV format and confirm with your master password.', 'Save the file and come back here.'] } },
    { id: 'lastpass', name: 'LastPass', icon: 'L', hue: 0, steps: {
        ru: ['Откройте расширение LastPass в браузере и нажмите «Параметры аккаунта» → «Дополнительно» → «Экспортировать».', 'Введите мастер-пароль LastPass.', 'Откроется страница с данными: скопируйте весь текст в Блокнот и сохраните как файл passwords.csv (или нажмите «Сохранить как», если браузер предложил файл).', 'Вернитесь сюда и выберите этот файл.'],
        en: ['Open the LastPass extension in the browser and press “Account Options” → “Advanced” → “Export”.', 'Enter your LastPass master password.', 'A page with the data opens: copy all the text into Notepad and save it as passwords.csv (or press “Save as” if the browser offered a file).', 'Come back here and choose this file.'] } },
    { id: 'keepass', name: 'KeePass', icon: 'K', hue: 120, steps: {
        ru: ['Откройте базу в KeePass: «Файл» → «Экспорт».', 'Выберите формат «KeePass CSV (1.x)» и нажмите OK.', 'Укажите имя файла, сохраните и вернитесь сюда.'],
        en: ['Open your database in KeePass: “File” → “Export”.', 'Choose the “KeePass CSV (1.x)” format and press OK.', 'Enter a file name, save and come back here.'] } },
    { id: 'other', name: '', nameKey: { ru: 'Другой менеджер или CSV', en: 'Another manager or CSV' }, icon: '…', hue: 260, steps: {
        ru: ['Найдите в вашем менеджере паролей функцию экспорта и выберите формат CSV.', 'Подойдёт любой CSV со столбцами: адрес сайта (url), логин (username) и пароль (password). Другие столбцы Centrio просто пропустит.', 'Сохраните файл и вернитесь сюда.'],
        en: ['Find the export function in your password manager and choose the CSV format.', 'Any CSV with the columns site address (url), login (username) and password (password) works. Centrio simply skips the other columns.', 'Save the file and come back here.'] } }
]

module.exports = { importCopy: copy, importSources: sources }
