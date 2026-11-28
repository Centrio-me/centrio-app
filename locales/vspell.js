// Strings of the spell checking group in Settings → Основные (11.2026). Each locale file attaches its part as `vspell`;
// a missing string falls back to English, then Russian (renderer/i18n.js).
module.exports = {
    ru: {
        title: 'Проверка правописания',
        enable: 'Подчёркивать ошибки',
        enableHint: 'Работает во всех сервисах и в заметках. Исправления предлагаются в меню правой кнопки.',
        languages: 'Языки проверки',
        languagesHint: 'Можно выбрать несколько: слово считается верным, если оно верно хотя бы на одном языке.',
        dictionary: 'Мой словарь',
        dictionaryHint: 'Слова, которые вы добавили через меню правой кнопки. Они не подчёркиваются во всех сервисах.',
        addWord: 'Добавить слово',
        empty: 'Пока пусто',
        remove: 'Убрать из словаря',
    },
    en: {
        title: 'Spell checking',
        enable: 'Underline mistakes',
        enableHint: 'Works in every service and in notes. Corrections are offered in the right-click menu.',
        languages: 'Languages',
        languagesHint: 'You can pick several: a word counts as right if it is right in at least one of them.',
        dictionary: 'My dictionary',
        dictionaryHint: 'Words you added from the right-click menu. They are not underlined in any service.',
        addWord: 'Add a word',
        empty: 'Nothing yet',
        remove: 'Remove from the dictionary',
    },
}
