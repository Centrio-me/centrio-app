'use strict'
// How the PDF reader asks for a print job. The native print window of Windows starts from the settings the app gives it,
// so «печать на обеих сторонах» chosen there was lost on the next print. The reader keeps the person's choice and passes it.

const isDuplexOn = (stored) => stored === true

/** The options of webContents.print: both sides (long edge) when the person turned duplex on, else the printer's own setting. */
function printOptions(duplex) {
    return duplex ? { printBackground: true, duplexMode: 'longEdge' } : { printBackground: true }
}

module.exports = { printOptions, isDuplexOn }
