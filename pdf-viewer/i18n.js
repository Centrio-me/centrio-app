// Strings of the PDF reader. Russian and English; every other system language falls back to English.
const RU = {
  sidebar: 'Панель страниц', prev: 'Предыдущая страница', next: 'Следующая страница', zoomOut: 'Уменьшить', zoomMenu: 'Масштаб', zoomIn: 'Увеличить',
  fit: 'Вписать по ширине', rotate: 'Повернуть', search: 'Поиск (Ctrl+F)', addText: 'Добавить текст', print: 'Печать (Ctrl+P)', duplex: 'Печать на обеих сторонах', openOriginal: 'Открыть в Word', openOriginalFailed: 'Не удалось открыть файл в Word', duplexOn: 'Печать на обеих сторонах включена. Запомним для следующих файлов.', duplexOff: 'Печать на обеих сторонах выключена', saveAs: 'Сохранить как… (Ctrl+S)',
  open: 'Открыть другой PDF (Ctrl+O)', prevMatch: 'Предыдущее совпадение', nextMatch: 'Следующее совпадение', close: 'Закрыть',
  matchCase: 'Учитывать регистр', pages: 'Страницы', outline: 'Оглавление', noOutline: 'В документе нет оглавления', dropTitle: 'Отпустите, чтобы открыть PDF',
  pwTitle: 'Документ защищён паролем', pwText: 'Введите пароль, чтобы открыть этот файл.', pwWrong: 'Пароль не подошёл. Попробуйте ещё раз.', pwOk: 'Открыть', cancel: 'Отмена',
  textTitle: 'Добавить текст', textPlaceholder: 'Введите любой текст', textFont: 'Шрифт', textSize: 'Размер', textStyle: 'Начертание', textColor: 'Цвет', textUse: 'Вставить на страницу', textEmpty: 'Сначала введите текст',
  placeHint: 'Нажмите на страницу, куда поставить текст', placed: 'Текст можно перетащить и изменить размер. В файл он попадёт при сохранении.', placeAgain: 'Ещё текст', placeClear: 'Убрать всё',
  loading: 'Открываем документ…', failedTitle: 'Не удалось открыть PDF', failedText: 'Файл повреждён или не является PDF.', matches: '{n} из {m}', noMatches: 'Не найдено',
  printing: 'Готовим печать: страница {n} из {m}', saved: 'Сохранено: {name}', saveFailed: 'Не удалось сохранить файл', printFailed: 'Не удалось напечатать',
  placeRotated: 'Верните поворот страниц в исходное положение, чтобы добавить текст', rotateEdited: 'Сначала уберите добавленный текст: после него поворот недоступен',
  placeUnsupported: 'Текст на страницах с собственным поворотом добавить нельзя', fitWidth: 'По ширине', fitPage: 'Страница целиком', pageWord: 'Страница', unnamed: 'Документ',
  editedSaved: 'Сохранено вместе с текстом: {name}', editedSuffix: ' (с текстом)'
}
const EN = {
  sidebar: 'Page panel', prev: 'Previous page', next: 'Next page', zoomOut: 'Zoom out', zoomMenu: 'Zoom', zoomIn: 'Zoom in',
  fit: 'Fit to width', rotate: 'Rotate', search: 'Search (Ctrl+F)', addText: 'Add text', print: 'Print (Ctrl+P)', duplex: 'Print on both sides', openOriginal: 'Open in Word', openOriginalFailed: 'Could not open the file in Word', duplexOn: 'Printing on both sides is on. It is remembered for the next files.', duplexOff: 'Printing on both sides is off', saveAs: 'Save as… (Ctrl+S)',
  open: 'Open another PDF (Ctrl+O)', prevMatch: 'Previous match', nextMatch: 'Next match', close: 'Close',
  matchCase: 'Match case', pages: 'Pages', outline: 'Outline', noOutline: 'This document has no outline', dropTitle: 'Drop to open the PDF',
  pwTitle: 'This document is password protected', pwText: 'Enter the password to open this file.', pwWrong: 'Wrong password. Try again.', pwOk: 'Open', cancel: 'Cancel',
  textTitle: 'Add text', textPlaceholder: 'Type any text', textFont: 'Font', textSize: 'Size', textStyle: 'Style', textColor: 'Color', textUse: 'Place on the page', textEmpty: 'Type some text first',
  placeHint: 'Click on the page where the text goes', placed: 'Drag the text to move it, drag the corner to resize. It is added to the file when you save.', placeAgain: 'Add more text', placeClear: 'Remove all',
  loading: 'Opening the document…', failedTitle: 'Could not open this PDF', failedText: 'The file is damaged or is not a PDF.', matches: '{n} of {m}', noMatches: 'Not found',
  printing: 'Preparing to print: page {n} of {m}', saved: 'Saved: {name}', saveFailed: 'Could not save the file', printFailed: 'Could not print',
  placeRotated: 'Reset the page rotation to add text', rotateEdited: 'Remove the added text first: rotation is unavailable after it',
  placeUnsupported: 'Adding text to pages that have their own rotation is not supported', fitWidth: 'Fit width', fitPage: 'Fit page', pageWord: 'Page', unnamed: 'Document',
  editedSaved: 'Saved with the text: {name}', editedSuffix: ' (with text)'
}
const dict = String(navigator.language || '').toLowerCase().startsWith('ru') ? RU : EN
document.documentElement.lang = dict === RU ? 'ru' : 'en'

export const t = (key, vars) => String(dict[key] ?? EN[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => (vars && vars[k] != null ? vars[k] : ''))

export function applyI18n(root = document) {
  root.querySelectorAll('[data-t]').forEach((el) => { el.textContent = t(el.dataset.t) })
  root.querySelectorAll('[data-ph]').forEach((el) => { el.placeholder = t(el.dataset.ph) })
  root.querySelectorAll('[data-tip]').forEach((el) => { el.dataset.tipText = t(el.dataset.tip); el.setAttribute('aria-label', t(el.dataset.tip)) })
}
