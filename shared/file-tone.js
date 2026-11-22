'use strict'
// The colour and the short label of a file's icon in a conversation, by its extension (the web messengers: PDF red, Excel green...).
const TONES = {
    pdf: ['pdf'],
    doc: ['doc', 'docx', 'rtf', 'odt', 'txt'],
    sheet: ['xls', 'xlsx', 'xlsm', 'csv', 'ods'],
    slides: ['ppt', 'pptx', 'odp'],
    zip: ['zip', 'rar', '7z', 'tar', 'gz']
}

/** @returns {{ tone: string, label: string }} */
function fileTone(name) {
    const m = /\.([a-z0-9]{1,5})$/i.exec(String(name || '').trim())
    const ext = m ? m[1].toLowerCase() : ''
    const tone = Object.keys(TONES).find((k) => TONES[k].includes(ext)) || 'other'
    return { tone, label: ext.toUpperCase() }
}

module.exports = { fileTone }
