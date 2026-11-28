'use strict'
// "5 км в мили", "70 kg to lb", "20 c в f", "100 км/ч в м/с", "2 гб в мб": a number, a unit, and the unit to turn it into (or the usual ones).
// Lengths, masses, volumes, areas, speeds and data sizes go through a base unit; temperatures have their own formulas.
const CATEGORIES = {
    length: { base: 'm', units: { mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, ft: 0.3048, yd: 0.9144, mi: 1609.344 }, show: ['mi', 'km', 'ft', 'm'] },
    mass: { base: 'g', units: { mg: 0.001, g: 1, kg: 1000, t: 1e6, oz: 28.349523125, lb: 453.59237 }, show: ['lb', 'kg', 'oz', 'g'] },
    volume: { base: 'ml', units: { ml: 1, l: 1000, gal: 3785.411784, qt: 946.352946, pt: 473.176473, cup: 236.5882365, floz: 29.5735295625 }, show: ['l', 'gal', 'ml'] },
    area: { base: 'm2', units: { cm2: 0.0001, m2: 1, km2: 1e6, ha: 1e4, ft2: 0.09290304, acre: 4046.8564224 }, show: ['m2', 'ft2', 'ha'] },
    speed: { base: 'ms', units: { ms: 1, kmh: 1 / 3.6, mph: 0.44704, kn: 0.514444444 }, show: ['kmh', 'ms', 'mph'] },
    data: { base: 'b', units: { b: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3, tb: 1024 ** 4 }, show: ['mb', 'gb', 'kb'] },
    temperature: { base: 'c', units: { c: 1, f: 1, k: 1 }, show: ['c', 'f', 'k'] }
}

const WORDS = {}
const add = (unit, words) => { for (const w of words) WORDS[w] = unit }
add('mm', ['mm', 'мм', 'миллиметр', 'миллиметра', 'миллиметров'])
add('cm', ['cm', 'см', 'сантиметр', 'сантиметра', 'сантиметров'])
add('m', ['m', 'м', 'метр', 'метра', 'метров', 'meter', 'meters', 'metre', 'metres'])
add('km', ['km', 'км', 'километр', 'километра', 'километров'])
add('in', ['in', 'inch', 'inches', 'дюйм', 'дюйма', 'дюймов', '"'])
add('ft', ['ft', 'foot', 'feet', 'фут', 'фута', 'футов'])
add('yd', ['yd', 'yard', 'yards', 'ярд', 'ярда', 'ярдов'])
add('mi', ['mi', 'mile', 'miles', 'миля', 'мили', 'миль'])
add('mg', ['mg', 'мг', 'миллиграмм', 'миллиграмма'])
add('g', ['g', 'г', 'гр', 'грамм', 'грамма', 'граммов', 'gram', 'grams'])
add('kg', ['kg', 'кг', 'килограмм', 'килограмма', 'килограммов', 'кило'])
add('t', ['тонна', 'тонны', 'тонн', 'тонну', 'ton', 'tons', 'tonne'])
add('oz', ['oz', 'унция', 'унции', 'унций', 'ounce', 'ounces'])
add('lb', ['lb', 'lbs', 'pound', 'pounds', 'фунт', 'фунта', 'фунтов'])
add('ml', ['ml', 'мл', 'миллилитр', 'миллилитра', 'миллилитров'])
add('l', ['l', 'л', 'литр', 'литра', 'литров', 'liter', 'liters', 'litre', 'litres'])
add('gal', ['gal', 'gallon', 'gallons', 'галлон', 'галлона', 'галлонов'])
add('qt', ['qt', 'quart', 'кварта'])
add('pt', ['pint', 'пинта', 'пинты'])
add('cup', ['cup', 'cups', 'чашка', 'чашки'])
add('floz', ['floz', 'fl.oz'])
add('cm2', ['cm2', 'см2', 'см²', 'cm²'])
add('m2', ['m2', 'м2', 'м²', 'm²', 'кв.м', 'квм'])
add('km2', ['km2', 'км2', 'км²', 'km²'])
add('ha', ['ha', 'га', 'гектар', 'гектара', 'гектаров'])
add('ft2', ['ft2', 'ft²', 'sqft', 'кв.фут'])
add('acre', ['acre', 'acres', 'акр', 'акра', 'акров'])
add('ms', ['m/s', 'м/с', 'мс'])
add('kmh', ['km/h', 'kmh', 'kph', 'км/ч', 'км/час'])
add('mph', ['mph', 'миль/ч'])
add('kn', ['kn', 'kt', 'knot', 'knots', 'узел', 'узла', 'узлов'])
add('b', ['b', 'byte', 'bytes', 'байт', 'байта', 'байтов'])
add('kb', ['kb', 'кб', 'килобайт', 'килобайта', 'килобайтов'])
add('mb', ['mb', 'мб', 'мегабайт', 'мегабайта', 'мегабайтов'])
add('gb', ['gb', 'гб', 'гигабайт', 'гигабайта', 'гигабайтов'])
add('tb', ['tb', 'тб', 'терабайт', 'терабайта', 'терабайтов'])
add('c', ['c', 'с', '°c', '°с', 'celsius', 'цельсий', 'цельсия', 'градус', 'градуса', 'градусов'])
add('f', ['f', 'ф', '°f', '°ф', 'fahrenheit', 'фаренгейт', 'фаренгейта'])
add('k', ['k', 'к', 'kelvin', 'кельвин', 'кельвина'])

const SEPARATORS = new Set(['в', 'to', 'in', '->', '=', '→', 'into'])
const CATEGORY_OF = {}
for (const [name, cat] of Object.entries(CATEGORIES)) for (const u of Object.keys(cat.units)) CATEGORY_OF[u] = name
// ambiguous letters used by several units are read by the second unit's category, see pickUnits

const SHORT_LABEL = { ms: 'м/с', kmh: 'км/ч', mph: 'mph', kn: 'уз', m2: 'м²', cm2: 'см²', km2: 'км²', ft2: 'ft²', floz: 'fl oz', c: '°C', f: '°F', k: 'K' }
const RU_LABEL = { mm: 'мм', cm: 'см', m: 'м', km: 'км', in: 'дюйм', ft: 'фут', yd: 'ярд', mi: 'миль', mg: 'мг', g: 'г', kg: 'кг', t: 'т', oz: 'унц', lb: 'фунт', ml: 'мл', l: 'л', gal: 'гал', qt: 'кварта', pt: 'пинта', cup: 'чашка', b: 'Б', kb: 'КБ', mb: 'МБ', gb: 'ГБ', tb: 'ТБ', ha: 'га', acre: 'акр' }
const label = (u, lang = 'en') => (lang === 'ru' && RU_LABEL[u]) || SHORT_LABEL[u] || u

function parseNumber(text) {
    const raw = text.replace(/\s/g, '').replace(',', '.')
    return /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : null
}

/**
 * @param {string} text
 * @returns {{ amount: number, from: string, to: string | null } | null}
 */
function parseUnitQuery(text) {
    const source = String(text || '').trim().toLowerCase().replace(/°\s+/g, '°')
    if (!source || source.length > 60) return null
    const tokens = source.split(/\s+/)
    let i = 0
    let amountText = ''
    while (i < tokens.length && /^-?[\d.,]+$/.test(tokens[i])) { amountText += tokens[i]; i += 1 }
    if (!amountText) {
        // "5km", "20c": the number glued to the unit
        const m = /^(-?[\d.,]+)(.+)$/.exec(tokens[0] || '')
        if (!m) return null
        amountText = m[1]
        tokens[0] = m[2]
        i = 0
    }
    const amount = parseNumber(amountText)
    if (amount == null) return null
    const fromWord = tokens[i]
    const from = fromWord ? WORDS[fromWord] : null
    if (!from) return null
    i += 1
    if (i === tokens.length) return { amount, from, to: null }
    if (!SEPARATORS.has(tokens[i]) || i + 2 !== tokens.length) return null
    const to = WORDS[tokens[i + 1]]
    if (!to || CATEGORY_OF[to] !== CATEGORY_OF[from]) return null
    return { amount, from, to }
}

function toCelsius(value, unit) {
    if (unit === 'f') return (value - 32) * 5 / 9
    if (unit === 'k') return value - 273.15
    return value
}

function fromCelsius(value, unit) {
    if (unit === 'f') return value * 9 / 5 + 32
    if (unit === 'k') return value + 273.15
    return value
}

/**
 * @param {{ amount: number, from: string, to: string | null }} query
 * @returns {{ unit: string, label: string, value: number }[]}
 */
function convertUnits(query, lang = 'en') {
    const name = CATEGORY_OF[query.from]
    const cat = CATEGORIES[name]
    if (!cat) return []
    const targets = (query.to ? [query.to] : cat.show).filter((u) => u !== query.from)
    return targets.map((unit) => {
        const value = name === 'temperature'
            ? fromCelsius(toCelsius(query.amount, query.from), unit)
            : (query.amount * cat.units[query.from]) / cat.units[unit]
        return { unit, label: label(unit, lang), value }
    })
}

module.exports = { parseUnitQuery, convertUnits, unitLabel: label }
