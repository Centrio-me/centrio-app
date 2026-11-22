const test = require('node:test')
const assert = require('node:assert/strict')
const { isWordDownload } = require('../shared/doc-detect')

test('a Word download is a file named .docx, in any letter case', () => {
    assert.equal(isWordDownload('Договор.docx'), true)
    assert.equal(isWordDownload('ДОГОВОР.DOCX'), true)
    assert.equal(isWordDownload('  report.docx  '), true)
})

test('a file that only claims a Word mime type is NOT a Word file (an .exe must never be opened as one)', () => {
    // the mime type is not even an argument any more: the name is the only evidence
    assert.equal(isWordDownload('invoice.exe', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'), false)
    assert.equal(isWordDownload('x.bat'), false)
    assert.equal(isWordDownload('x.docx.lnk'), false)
})

test('the old binary .doc and macro files are not converted', () => {
    assert.equal(isWordDownload('old.doc'), false)
    assert.equal(isWordDownload('macro.docm'), false)
    assert.equal(isWordDownload('template.dotx'), false)
})

test('odd names are not Word files', () => {
    assert.equal(isWordDownload('a.docx.exe'), false)
    assert.equal(isWordDownload('docx'), false)
    assert.equal(isWordDownload(''), false)
    assert.equal(isWordDownload(undefined), false)
})
