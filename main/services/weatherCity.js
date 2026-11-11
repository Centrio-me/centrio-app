'use strict'
// The city the lock screen's weather is for, chosen by the person (2026-11-11): with a VPN on, the city found from
// the network address is the VPN's, not theirs. Cities are found by name through open-meteo's free geocoding
// (no key); the choice is kept in the store as { name, latitude, longitude }.

const MAX_RESULTS = 6

const isLat = (v) => typeof v === 'number' && Number.isFinite(v) && v >= -90 && v <= 90
const isLon = (v) => typeof v === 'number' && Number.isFinite(v) && v >= -180 && v <= 180
const text = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '')

/**
 * The cities of a geocoding answer, each with its name, region, country and coordinates.
 * @param {*} answer open-meteo geocoding JSON
 * @returns {{ name: string, region: string, country: string, latitude: number, longitude: number }[]}
 */
function citiesFromGeocoding(answer) {
    const list = answer && Array.isArray(answer.results) ? answer.results : []
    return list
        .filter((c) => c && text(c.name, 80) && isLat(c.latitude) && isLon(c.longitude))
        .slice(0, MAX_RESULTS)
        .map((c) => ({ name: text(c.name, 80), region: text(c.admin1, 80), country: text(c.country, 60), latitude: c.latitude, longitude: c.longitude }))
}

/**
 * The saved city, if it can be used.
 * @returns {{ name: string, latitude: number, longitude: number } | null}
 */
function savedCity(value) {
    if (!value || typeof value !== 'object' || !isLat(value.latitude) || !isLon(value.longitude)) return null
    return { name: text(value.name, 80), latitude: value.latitude, longitude: value.longitude }
}

module.exports = { citiesFromGeocoding, savedCity }
