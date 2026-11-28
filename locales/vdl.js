// Strings of the downloads panel (11.2026). Each locale file attaches its part as `vdl`;
// a missing string falls back to English, then Russian (renderer/i18n.js).
module.exports = {
    ru: {
        today: 'Сегодня', yesterday: 'Вчера', earlier: 'Раньше',
        search: 'Найти файл',
        f_all: 'Все', f_active: 'Идут', f_done: 'Готово', f_failed: 'Не вышло',
        nothing: 'Ничего не найдено',
        remove: 'Убрать из списка',
        of: '{a} из {b}', perSecond: '/с',
        failed: 'Не удалось скачать', cancelled: 'Отменено',
        u0: 'Б', u1: 'КБ', u2: 'МБ', u3: 'ГБ',
    },
    en: {
        today: 'Today', yesterday: 'Yesterday', earlier: 'Earlier',
        search: 'Find a file',
        f_all: 'All', f_active: 'In progress', f_done: 'Done', f_failed: 'Failed',
        nothing: 'Nothing found',
        remove: 'Remove from the list',
        of: '{a} of {b}', perSecond: '/s',
        failed: 'Download failed', cancelled: 'Cancelled',
        u0: 'B', u1: 'KB', u2: 'MB', u3: 'GB',
    },
}
