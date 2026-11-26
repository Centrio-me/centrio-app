'use strict'
// The reader's «Сохранить как». A Word file is shown there as a PDF made from it; saving gave only that PDF, never the
// Word file itself (a client, 2026-11-26). With the original at hand the dialog offers Word first, then PDF.

const WORD_FILTER = { name: 'Документ Word', extensions: ['docx'] }
const PDF_FILTER = { name: 'PDF', extensions: ['pdf'] }

const withoutExt = (name) => String(name).replace(/\.[A-Za-z0-9]{1,8}$/, '')

/** @returns {{ defaultName: string, filters: Array<{name:string, extensions:string[]}> }} */
function saveChoices(suggestedName, hasOriginal) {
    const base = String(suggestedName || 'document')
    if (hasOriginal) return { defaultName: `${withoutExt(base)}.docx`, filters: [WORD_FILTER, PDF_FILTER] }
    return { defaultName: /\.pdf$/i.test(base) ? base : `${base}.pdf`, filters: [PDF_FILTER] }
}

/** What goes into the chosen file: the Word original (a .docx name, original still there) or the PDF bytes. */
function saveKind(filePath, hasOriginal) {
    return hasOriginal && /\.docx$/i.test(String(filePath)) ? 'original' : 'pdf'
}

module.exports = { saveChoices, saveKind }
