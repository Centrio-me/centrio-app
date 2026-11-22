'use strict'
// Which downloads are Word documents the reader can show (.docx only: the old binary .doc and macro-enabled files stay as they are).
// By the file NAME only. The mime type comes from whoever sent the file, and a file that is not named .docx must never be taken
// for one: a failed conversion falls back to opening the file with the system, which would run an .exe that claims a Word mime type.

function isWordDownload(filename) {
    return /\.docx$/i.test(String(filename || '').trim())
}

module.exports = { isWordDownload }
