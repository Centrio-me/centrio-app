// Strings of the PDF reader. Russian and English; every other system language falls back to English.
const RU = {
  sidebar: 'Панель страниц', prev: 'Предыдущая страница', next: 'Следующая страница', zoomOut: 'Уменьшить', zoomMenu: 'Масштаб', zoomIn: 'Увеличить',
  fit: 'Вписать по ширине', rotate: 'Повернуть', search: 'Поиск (Ctrl+F)', sign: 'Подписать', print: 'Печать (Ctrl+P)', saveAs: 'Сохранить как… (Ctrl+S)',
  open: 'Открыть другой PDF (Ctrl+O)', prevMatch: 'Предыдущее совпадение', nextMatch: 'Следующее совпадение', close: 'Закрыть',
  matchCase: 'Учитывать регистр', pages: 'Страницы', outline: 'Оглавление', noOutline: 'В документе нет оглавления', dropTitle: 'Отпустите, чтобы открыть PDF',
  pwTitle: 'Документ защищён паролем', pwText: 'Введите пароль, чтобы открыть этот файл.', pwWrong: 'Пароль не подошёл. Попробуйте ещё раз.', pwOk: 'Открыть', cancel: 'Отмена',
  sigTitle: 'Ваша подпись', sigDraw: 'Нарисовать', sigType: 'Напечатать', sigImage: 'Из картинки', sigErase: 'Стереть', sigPick: 'Выбрать фото подписи (PNG или JPG)',
  sigSaved: 'Сохранённые подписи', sigUse: 'Поставить подпись', sigTypeHint: 'Ваше имя', sigEmpty: 'Сначала нарисуйте или введите подпись',
  sigHint: 'Нажмите на страницу, куда поставить подпись', sigPlaced: 'Подпись можно перетащить и изменить размер. Она попадёт в файл при сохранении.', signAgain: 'Ещё одна', signClear: 'Убрать все',
  loading: 'Открываем документ…', failedTitle: 'Не удалось открыть PDF', failedText: 'Файл повреждён или не является PDF.', matches: '{n} из {m}', noMatches: 'Не найдено',
  printing: 'Готовим печать: страница {n} из {m}', saved: 'Сохранено: {name}', saveFailed: 'Не удалось сохранить файл', printFailed: 'Не удалось напечатать',
  signRotated: 'Верните поворот страниц в исходное положение, чтобы поставить подпись', rotateSigned: 'Сначала уберите подписи: после них поворот недоступен',
  signUnsupported: 'Подпись на страницах с собственным поворотом недоступна', fitWidth: 'По ширине', fitPage: 'Страница целиком', pageWord: 'Страница', unnamed: 'Документ',
  signedSaved: 'Сохранено вместе с подписью: {name}'
}
const EN = {
  sidebar: 'Page panel', prev: 'Previous page', next: 'Next page', zoomOut: 'Zoom out', zoomMenu: 'Zoom', zoomIn: 'Zoom in',
  fit: 'Fit to width', rotate: 'Rotate', search: 'Search (Ctrl+F)', sign: 'Sign', print: 'Print (Ctrl+P)', saveAs: 'Save as… (Ctrl+S)',
  open: 'Open another PDF (Ctrl+O)', prevMatch: 'Previous match', nextMatch: 'Next match', close: 'Close',
  matchCase: 'Match case', pages: 'Pages', outline: 'Outline', noOutline: 'This document has no outline', dropTitle: 'Drop to open the PDF',
  pwTitle: 'This document is password protected', pwText: 'Enter the password to open this file.', pwWrong: 'Wrong password. Try again.', pwOk: 'Open', cancel: 'Cancel',
  sigTitle: 'Your signature', sigDraw: 'Draw', sigType: 'Type', sigImage: 'From image', sigErase: 'Clear', sigPick: 'Choose a photo of your signature (PNG or JPG)',
  sigSaved: 'Saved signatures', sigUse: 'Place signature', sigTypeHint: 'Your name', sigEmpty: 'Draw or type your signature first',
  sigHint: 'Click on the page where the signature goes', sigPlaced: 'Drag the signature to move it, drag the corner to resize. It is added to the file when you save.', signAgain: 'Add another', signClear: 'Remove all',
  loading: 'Opening the document…', failedTitle: 'Could not open this PDF', failedText: 'The file is damaged or is not a PDF.', matches: '{n} of {m}', noMatches: 'Not found',
  printing: 'Preparing to print: page {n} of {m}', saved: 'Saved: {name}', saveFailed: 'Could not save the file', printFailed: 'Could not print',
  signRotated: 'Reset the page rotation to place a signature', rotateSigned: 'Remove the signatures first: rotation is unavailable after signing',
  signUnsupported: 'Signing pages that have their own rotation is not supported', fitWidth: 'Fit width', fitPage: 'Fit page', pageWord: 'Page', unnamed: 'Document',
  signedSaved: 'Saved with the signature: {name}'
}
const dict = String(navigator.language || '').toLowerCase().startsWith('ru') ? RU : EN
document.documentElement.lang = dict === RU ? 'ru' : 'en'

export const t = (key, vars) => String(dict[key] ?? EN[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => (vars && vars[k] != null ? vars[k] : ''))

export function applyI18n(root = document) {
  root.querySelectorAll('[data-t]').forEach((el) => { el.textContent = t(el.dataset.t) })
  root.querySelectorAll('[data-tip]').forEach((el) => { el.dataset.tipText = t(el.dataset.tip); el.setAttribute('aria-label', t(el.dataset.tip)) })
}
