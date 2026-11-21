'use client'

// «Add people» block of the team page (3.10): invitations by email for a whole list, and accounts with a login and a password
// for employees who have no email. The owner is told why an email is better and can still create the accounts without one.
// Passwords live only in this component's state: they are shown once after creation and never written anywhere.

import { useState, useMemo } from 'react'
import { api } from '@/lib/api'
import { ADD_PEOPLE_STR } from './add-people-strings'
import './add-people.css'

const MAX_BATCH = 30
const LOGIN_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/
const PASSWORD_MIN = 8

type Strings = (typeof ADD_PEOPLE_STR)['ru']
type Role = 'MEMBER' | 'ADMIN'
type Mode = 'email' | 'login'
type Step = 'warn' | 'names' | 'review' | 'done'
type Msg = { type: 'ok' | 'err'; text: string } | null

interface InviteResult { email: string; status: string }
interface Row { name: string; login: string; password: string }
interface Created extends Row { userId: string; role: Role }
interface Failed { name: string; login: string; error: string }

interface Props {
  orgId: string
  isOwner: boolean
  freeSeats: number
  lang: string
  onChanged: () => void
  onBuySeats: () => void
}

/** The addresses of a pasted list: split on lines, commas, semicolons and spaces, lower-cased, without repeats. */
export function splitEmails(text: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of text.split(/[\s,;]+/)) {
    const token = raw.replace(/^[<"'(]+|[>"')]+$/g, '').trim().toLowerCase()
    if (token && token.includes('@') && !seen.has(token)) { seen.add(token); out.push(token) }
  }
  return out
}

function statusText(t: Strings, status: string): string {
  switch (status) {
    case 'sent': return t.resultSent
    case 'invalid': return t.resultInvalid
    case 'duplicate': return t.resultDuplicate
    case 'already_member': return t.resultAlreadyMember
    case 'already_invited': return t.resultAlreadyInvited
    case 'no_seats': return t.resultNoSeats
    case 'team_expired': return t.resultTeamExpired
    default: return t.resultFailed
  }
}

function errorOf(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { error?: string } } }
  return e?.response?.data?.error || fallback
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

function downloadCsv(rows: Created[], t: Strings) {
  const head = [t.colName, t.colLogin, t.colPassword].map(csvCell).join(';')
  const body = rows.map(r => [r.name, r.login, r.password].map(csvCell).join(';'))
  // a BOM so that Excel reads the Cyrillic names correctly
  const blob = new Blob(['﻿' + [head, ...body].join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'centrio-team-logins.csv'
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export default function AddPeoplePanel({ orgId, isOwner, freeSeats, lang, onChanged, onBuySeats }: Props) {
  const t = ADD_PEOPLE_STR[lang === 'en' ? 'en' : 'ru']
  const [mode, setMode] = useState<Mode>('email')
  const [role, setRole] = useState<Role>('MEMBER')

  // ── invitations by email ──
  const [emails, setEmails] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteMsg, setInviteMsg] = useState<Msg>(null)
  const [inviteResults, setInviteResults] = useState<InviteResult[]>([])
  const parsed = useMemo(() => splitEmails(emails), [emails])

  const sendInvites = async (e: React.FormEvent) => {
    e.preventDefault()
    setInviteMsg(null)
    setInviteResults([])
    if (parsed.length === 0) { setInviteMsg({ type: 'err', text: t.noEmailsEntered }); return }
    if (parsed.length > MAX_BATCH) { setInviteMsg({ type: 'err', text: t.tooManyAtOnce }); return }
    setInviting(true)
    try {
      const { data } = await api.post(`/api/org/${orgId}/invites/batch`, { emails: parsed, role })
      const results: InviteResult[] = data?.data?.results || []
      const sent = results.filter(r => r.status === 'sent').length
      setInviteResults(results)
      setInviteMsg({ type: sent > 0 ? 'ok' : 'err', text: t.invitedSummary(sent, results.length) })
      // addresses that did not get an invitation stay in the field, to be fixed and sent again
      const left = results.filter(r => r.status !== 'sent' && r.status !== 'duplicate').map(r => r.email)
      setEmails(left.join('\n'))
      if (sent > 0) onChanged()
    } catch (err) {
      setInviteMsg({ type: 'err', text: errorOf(err, t.genericError) })
    } finally {
      setInviting(false)
    }
  }

  // ── accounts with a login and a password ──
  const [step, setStep] = useState<Step>('warn')
  const [names, setNames] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [busy, setBusy] = useState(false)
  const [loginMsg, setLoginMsg] = useState<Msg>(null)
  const [created, setCreated] = useState<Created[]>([])
  const [failed, setFailed] = useState<Failed[]>([])
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const openLoginMode = () => { setMode('login'); setStep('warn'); setLoginMsg(null) }
  const backToEmail = () => { setMode('email'); setLoginMsg(null) }

  const prepare = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginMsg(null)
    const list = names.split(/\r?\n/).map(n => n.trim()).filter(Boolean)
    if (list.length === 0) { setLoginMsg({ type: 'err', text: t.noNamesEntered }); return }
    if (list.length > MAX_BATCH) { setLoginMsg({ type: 'err', text: t.tooManyAtOnce }); return }
    setBusy(true)
    try {
      const { data } = await api.post(`/api/org/${orgId}/accounts/prepare`, { names: list })
      setRows((data?.data?.rows || []) as Row[])
      setStep('review')
    } catch (err) {
      setLoginMsg({ type: 'err', text: errorOf(err, t.prepareFailed) })
    } finally {
      setBusy(false)
    }
  }

  const editRow = (index: number, patch: Partial<Row>) => {
    setRows(prev => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }
  const removeRow = (index: number) => setRows(prev => prev.filter((_, i) => i !== index))

  const rowProblem = (r: Row): string | null => {
    if (!LOGIN_RE.test(r.login.trim().toLowerCase())) return t.checkLogin
    if (r.password.length < PASSWORD_MIN) return t.checkPassword
    return null
  }
  const problems = rows.map(rowProblem)
  const duplicateLogins = new Set(
    rows.map(r => r.login.trim().toLowerCase()).filter((l, i, all) => all.indexOf(l) !== i)
  )
  const hasProblem = problems.some(Boolean) || duplicateLogins.size > 0
  const tooMany = rows.length > freeSeats

  const createAccounts = async () => {
    setLoginMsg(null)
    if (rows.length === 0 || hasProblem || tooMany) return
    setBusy(true)
    try {
      const payload = rows.map(r => ({ name: r.name.trim(), login: r.login.trim().toLowerCase(), password: r.password, role }))
      const { data } = await api.post(`/api/org/${orgId}/accounts`, { accounts: payload })
      const ok: Created[] = data?.data?.created || []
      const bad = (data?.data?.failed || []) as Array<{ name: string; login: string; error: string }>
      setCreated(prev => [...prev, ...ok])
      setFailed(bad.map(b => ({ name: b.name, login: b.login, error: b.error })))
      // the rows that were not created stay available for «fix and retry», with the passwords the owner saw
      const badLogins = new Set(bad.map(b => b.login))
      setRows(payload.filter(p => badLogins.has(p.login)).map(p => ({ name: p.name, login: p.login, password: p.password })))
      setStep('done')
      if (ok.length > 0) onChanged()
    } catch (err) {
      setLoginMsg({ type: 'err', text: errorOf(err, t.createFailed) })
    } finally {
      setBusy(false)
    }
  }

  const finishLoginFlow = () => {
    setStep('warn')
    setMode('email')
    setNames('')
    setRows([])
    setCreated([])
    setFailed([])
    setLoginMsg(null)
  }

  const flashCopied = (key: string) => {
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(k => (k === key ? null : k)), 1800)
  }
  const copyRow = async (r: Created) => { if (await copyText(t.clipboardLine(r.name, r.login, r.password))) flashCopied(r.userId) }
  const copyAll = async () => {
    if (await copyText(created.map(r => t.clipboardLine(r.name, r.login, r.password)).join('\n'))) flashCopied('all')
  }

  return (
    <div className="glass-card ap-card">
      <div className="ap-modes" role="tablist">
        <button type="button" role="tab" aria-selected={mode === 'email'} className={`ap-mode${mode === 'email' ? ' is-on' : ''}`} onClick={backToEmail}>
          {t.modeEmail} <span className="ap-reco">{t.recommended}</span>
        </button>
        <button type="button" role="tab" aria-selected={mode === 'login'} className={`ap-mode${mode === 'login' ? ' is-on' : ''}`} onClick={openLoginMode}>
          {t.modeLogin}
        </button>
      </div>

      {mode === 'email' && (
        <form onSubmit={sendInvites} className="ap-body">
          <label className="field-label" htmlFor="ap-emails">{t.emailsLabel}</label>
          <textarea id="ap-emails" className="field-input ap-textarea" rows={4} value={emails} onChange={e => setEmails(e.target.value)} placeholder={t.emailsPlaceholder} spellCheck={false} />
          <div className="ap-hint">{t.emailsHint}</div>
          {parsed.length > 0 && (
            <div className={`ap-count${parsed.length > freeSeats ? ' is-bad' : ''}`}>
              {parsed.length > freeSeats ? t.notEnoughSeats(parsed.length, Math.max(0, freeSeats)) : t.addressesCount(parsed.length, freeSeats)}
            </div>
          )}
          <div className="ap-actions">
            {isOwner && (
              <select className="field-select ap-role" aria-label={t.roleLabel} value={role} onChange={e => setRole(e.target.value as Role)}>
                <option value="MEMBER">{t.roleMember}</option>
                <option value="ADMIN">{t.roleAdmin}</option>
              </select>
            )}
            <button type="submit" className="btn-primary" disabled={inviting || freeSeats <= 0 || parsed.length === 0}>
              {inviting ? t.sending : t.inviteBtn}
            </button>
            {freeSeats <= 0 && <button type="button" className="btn-secondary" onClick={onBuySeats}>{t.buySeats}</button>}
          </div>
          {inviteMsg && <div className={`form-msg ${inviteMsg.type}`}>{inviteMsg.text}</div>}
          {inviteResults.length > 0 && (
            <ul className="ap-results">
              {inviteResults.map(r => (
                <li key={r.email + r.status} className={r.status === 'sent' ? 'is-ok' : 'is-bad'}>
                  <span className="ap-res-mail">{r.email}</span>
                  <span className="ap-res-text">{statusText(t, r.status)}</span>
                </li>
              ))}
            </ul>
          )}
          {inviteResults.some(r => r.status === 'sent') && <div className="ap-hint">{t.mailsComing}</div>}
          {inviteResults.some(r => r.status !== 'sent' && r.status !== 'duplicate') && <div className="ap-hint">{t.notSentKept}</div>}
          <div className="ap-switch">{t.noEmailLink} <button type="button" className="ap-link" onClick={openLoginMode}>{t.noEmailLinkBtn}</button></div>
        </form>
      )}

      {mode === 'login' && step === 'warn' && (
        <div className="ap-body">
          <div className="ap-warn">
            <div className="ap-warn-title">{t.warnTitle}</div>
            <p>{t.warnIntro}</p>
            <ul>
              <li>{t.warn1}</li>
              <li>{t.warn2}</li>
              <li>{t.warn3}</li>
              <li>{t.warn4}</li>
            </ul>
          </div>
          <div className="ap-actions">
            <button type="button" className="btn-primary" onClick={backToEmail}>{t.warnBack}</button>
            <button type="button" className="btn-secondary" onClick={() => setStep('names')}>{t.warnContinue}</button>
          </div>
        </div>
      )}

      {mode === 'login' && step === 'names' && (
        <form onSubmit={prepare} className="ap-body">
          <label className="field-label" htmlFor="ap-names">{t.namesLabel}</label>
          <textarea id="ap-names" className="field-input ap-textarea" rows={5} value={names} onChange={e => setNames(e.target.value)} placeholder={t.namesPlaceholder} />
          <div className="ap-hint">{t.namesHint}</div>
          <div className="ap-actions">
            {isOwner && (
              <select className="field-select ap-role" aria-label={t.roleLabel} value={role} onChange={e => setRole(e.target.value as Role)}>
                <option value="MEMBER">{t.roleMember}</option>
                <option value="ADMIN">{t.roleAdmin}</option>
              </select>
            )}
            <button type="button" className="btn-secondary" onClick={() => setStep('warn')}>{t.backBtn}</button>
            <button type="submit" className="btn-primary" disabled={busy}>{busy ? t.preparing : t.prepareBtn}</button>
          </div>
          {loginMsg && <div className={`form-msg ${loginMsg.type}`}>{loginMsg.text}</div>}
        </form>
      )}

      {mode === 'login' && step === 'review' && (
        <div className="ap-body">
          <div className="ap-title">{t.reviewTitle}</div>
          <div className="ap-hint">{t.reviewHint}</div>
          <div className="ap-table" role="table">
            <div className="ap-tr ap-th" role="row">
              <span role="columnheader">{t.colName}</span><span role="columnheader">{t.colLogin}</span><span role="columnheader">{t.colPassword}</span><span />
            </div>
            {rows.map((r, i) => (
              <div key={i} className="ap-tr-wrap">
                <div className="ap-tr" role="row">
                  <input className="field-input" aria-label={t.colName} value={r.name} maxLength={80} onChange={e => editRow(i, { name: e.target.value })} />
                  <input className={`field-input${problems[i] === t.checkLogin || duplicateLogins.has(r.login.trim().toLowerCase()) ? ' is-bad' : ''}`} aria-label={t.colLogin} value={r.login} maxLength={32} autoCapitalize="off" spellCheck={false} onChange={e => editRow(i, { login: e.target.value })} />
                  <input className={`field-input ap-mono${problems[i] === t.checkPassword ? ' is-bad' : ''}`} aria-label={t.colPassword} value={r.password} maxLength={128} autoCapitalize="off" spellCheck={false} onChange={e => editRow(i, { password: e.target.value })} />
                  <button type="button" className="tm-icon-btn is-danger" title={t.removeRow} aria-label={`${t.removeRow}: ${r.name}`} onClick={() => removeRow(i)}>×</button>
                </div>
                {problems[i] && <div className="ap-row-problem">{problems[i]}</div>}
              </div>
            ))}
          </div>
          <div className={`ap-count${tooMany ? ' is-bad' : ''}`}>{tooMany ? t.notEnoughSeatsAccounts(rows.length, Math.max(0, freeSeats)) : t.seatsInfo(rows.length, freeSeats)}</div>
          <div className="ap-actions">
            <button type="button" className="btn-secondary" onClick={() => setStep('names')} disabled={busy}>{t.backBtn}</button>
            {tooMany && <button type="button" className="btn-secondary" onClick={onBuySeats}>{t.buySeats}</button>}
            <button type="button" className="btn-primary" onClick={createAccounts} disabled={busy || rows.length === 0 || hasProblem || tooMany}>
              {busy ? t.creating : t.createBtn(rows.length)}
            </button>
          </div>
          {loginMsg && <div className={`form-msg ${loginMsg.type}`}>{loginMsg.text}</div>}
        </div>
      )}

      {mode === 'login' && step === 'done' && (
        <div className="ap-body">
          {created.length > 0 && (
            <>
              <div className="ap-title">{t.doneTitle(created.length)}</div>
              <div className="form-msg err ap-keep">{t.doneWarning}</div>
              <div className="ap-table" role="table">
                <div className="ap-tr ap-th ap-tr-done" role="row">
                  <span role="columnheader">{t.colName}</span><span role="columnheader">{t.colLogin}</span><span role="columnheader">{t.colPassword}</span><span />
                </div>
                {created.map(r => (
                  <div key={r.userId} className="ap-tr ap-tr-done" role="row">
                    <span className="ap-cell">{r.name}</span>
                    <span className="ap-cell ap-mono">{r.login}</span>
                    <span className="ap-cell ap-mono">{r.password}</span>
                    <button type="button" className="btn-secondary ap-copy" onClick={() => copyRow(r)}>{copiedKey === r.userId ? t.copied : t.copyRow}</button>
                  </div>
                ))}
              </div>
              <div className="ap-hint">{t.howToSignIn}</div>
              <div className="ap-actions">
                <button type="button" className="btn-secondary" onClick={copyAll}>{copiedKey === 'all' ? t.copied : t.copyAll}</button>
                <button type="button" className="btn-secondary" onClick={() => downloadCsv(created, t)}>{t.downloadCsv}</button>
              </div>
            </>
          )}
          {failed.length > 0 && (
            <>
              <div className="ap-title is-bad">{t.failedTitle}: {failed.length}</div>
              <ul className="ap-results">
                {failed.map(f => (
                  <li key={f.login} className="is-bad"><span className="ap-res-mail">{f.name} ({f.login})</span><span className="ap-res-text">{f.error}</span></li>
                ))}
              </ul>
              <div className="ap-actions">
                <button type="button" className="btn-secondary" onClick={() => { setFailed([]); setStep('review') }}>{t.retryFailed}</button>
              </div>
            </>
          )}
          <div className="ap-actions">
            <button type="button" className="btn-primary" onClick={finishLoginFlow}>{t.doneBtn}</button>
          </div>
        </div>
      )}
    </div>
  )
}

/** «Reset password» for an employee who has only a login: the new password is shown once, to be handed over. */
export function ResetPasswordBlock({ orgId, userId, name, lang, onDone }: { orgId: string; userId: string; name: string; lang: string; onDone?: () => void }) {
  const t = ADD_PEOPLE_STR[lang === 'en' ? 'en' : 'ru']
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ login: string; password: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const reset = async () => {
    if (!window.confirm(t.resetConfirm)) return
    setBusy(true)
    setError(null)
    try {
      const { data } = await api.post(`/api/org/${orgId}/members/${userId}/reset-password`, {})
      setResult({ login: data?.data?.login || '', password: data?.data?.password || '' })
      onDone?.()
    } catch (err) {
      setError(errorOf(err, t.resetFailed))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="ap-reset">
      <div className="ap-hint">{t.resetHint}</div>
      <button type="button" className="btn-secondary" onClick={reset} disabled={busy}>{busy ? t.resetting : t.resetBtn}</button>
      {error && <div className="form-msg err">{error}</div>}
      {result && (
        <div className="ap-reset-result">
          <div className="ap-title">{t.resetDoneTitle}: {name}</div>
          <div className="ap-mono">{t.loginLabel}: {result.login}</div>
          <div className="ap-mono">{t.colPassword}: {result.password}</div>
          <button type="button" className="btn-secondary ap-copy" onClick={async () => { if (await copyText(t.clipboardLine(name, result.login, result.password))) { setCopied(true); setTimeout(() => setCopied(false), 1800) } }}>
            {copied ? t.copied : t.copyRow}
          </button>
        </div>
      )}
    </div>
  )
}
