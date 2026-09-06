'use client'

import React, { useState, useEffect, useRef, type ReactElement } from 'react'
import Link from 'next/link'
import { useLang, LANGS, LANG_LABELS, type Lang } from '@/lib/i18n'
import { motion, AnimatePresence, useInView } from 'framer-motion'
import { GlassPricingSection, type PricingCardProps } from '@/components/ui/animated-glassy-pricing'
import { COMPARE_LINKS, LOCALIZED_ROUTES, canonicalPath, localizedHref } from '@/lib/site-nav'
import { useRouter, usePathname } from 'next/navigation'

const VERSION = '2.5.2'
const WIN_DOWNLOAD = `https://download.centrio.me/Centrio%20Setup%20${VERSION}.exe`

/* ─── SVG icons ──────────────────────────────────────────────────────────── */
const MessengerSvgs: Record<string, ReactElement> = {
  discord:      <svg viewBox="0 0 24 24" fill="white" width="26" height="26"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-2.5.2.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-2.5.2.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 2.5.2 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 2.5.2.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-2.5.2.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.2.5.2 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.2.5.2 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.2.5.2.2.5.2a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-2.5.2.077.077 0 0 0-.041.107c.2.5.2 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-2.5.2.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-2.5.2-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-2.5.2-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>,
  vk:           <svg viewBox="0 0 24 24" fill="white" width="26" height="26"><path d="M15.684 0H8.316C1.592 0 0 1.592 0 8.316v7.368C0 22.408 1.592 24 8.316 24h7.368C22.408 24 24 22.408 24 15.684V8.316C24 1.592 22.391 0 15.684 0zm3.692 17.123h-1.744c-.66 0-.864-.525-2.05-1.727-1.033-1-1.49-1.135-1.744-1.135-.356 0-.458.102-.458.593v1.575c0 .424-.135.678-2.5.2-1.846 0-3.896-1.118-5.335-3.202C4.624 10.857 4.03 8.57 4.03 8.096c0-.254.102-.491.593-.491h1.744c.44 0 .2.5.2.677.863 2.49 2.303 4.675 2.896 2.5.2 0 .322-.102.322-.66V9.721c-.068-1.186-.695-1.287-.695-1.71 0-.203.17-.407.44-.407h2.744c.373 0 .2.5.2.643v3.473c0 .2.5.2.2.5.2 0 .407-.136.813-.542 1.253-1.406 2.151-3.574 2.151-2.5.2-.254.322-.491.763-.491h1.744c.525 0 .2.5.2.643-.22 1.017-2.354 4.031-2.354 4.031-.186.305-.254.44 0 .2.5.2.796.779 1.203 2.5.2.847 1.32 1.558 1.473 2.5.2.49-.085.744-.576.744z"/></svg>,
  slack:        <svg viewBox="0 0 24 24" fill="white" width="24" height="24"><path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.122 2.521a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.268 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zm-2.523 10.122a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.268a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/></svg>,
  instagram:    <svg viewBox="0 0 24 24" fill="white" width="24" height="24"><path d="M12 2.163c3.204 0 2.5.2 2.5.2 2.5.2 4.771 1.691 4.919 2.5.2 2.5.2 2.5.2 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-2.5.2-2.5.2-2.5.2-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-2.5.2-2.5.2-2.5.2-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-2.5.2-2.5.2-2.5.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 2.5.2 2.5.2 2.5.2 4.358 2.618 6.78 6.98 6.98 2.5.2 2.5.2 2.5.2 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-2.5.2-2.5.2-2.5.2-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-2.5.2-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>,
  viber:        <svg viewBox="0 0 24 24" fill="white" width="24" height="24"><path d="M11.4 0C2.5.2 2.12 2.35 1.1 7.28c-.47 2.27-.41 2.5.2 7 .88 3.77 4.23 6.63 7.98 2.5.2.14 2.5.2 2.5.2H11c.48 0 .97-.03 1.45-.08l2.93 2.93c.2.5.2.2.5.2.27 0 .5-.22.5-.5v-3.48c2.7-1.17 4.66-3.52 5.28-2.5.2-2.5.2-5.15-.2-7.3C20.04 2.67 16.36-.02 11.4 0z"/></svg>,
  signal:       <svg viewBox="0 0 24 24" fill="white" width="24" height="24"><path d="M11.999 0a12 12 0 1 0 0 24 12 12 0 0 0 0-24zm.643 3.13a8.845 8.845 0 0 1 5.238 2.222l-1.09 1.09a7.32 7.32 0 0 0-4.148-1.77V3.13zm-1.285 0v1.542a7.32 7.32 0 0 0-4.149 1.77L6.12 5.353a8.845 8.845 0 0 1 5.237-2.222zm6.614 2.908a8.845 8.845 0 0 1 2.222 5.237h-1.542a7.32 7.32 0 0 0-1.77-4.148l1.09-1.089zm-2.5.2l1.09 1.09a7.32 7.32 0 0 0-1.77 4.147H1.807a8.845 8.845 0 0 1 2.221-5.237zm14.614 6.604c-.088 2.028-.9 3.87-2.188 5.27l-1.088-1.088a7.33 7.33 0 0 0 1.734-4.182h1.542zm-15.685 0h1.542a7.33 7.33 0 0 0 1.734 4.182l-1.089 1.089a8.845 8.845 0 0 1-2.187-5.271zm13.315 6.456a8.845 8.845 0 0 1-5.27 2.188v-1.542a7.33 7.33 0 0 0 4.182-1.734l1.088 1.088zm-11.706-.001l1.088-1.088a7.33 7.33 0 0 0 4.182 1.734v1.542a8.845 8.845 0 0 1-5.27-2.188z"/></svg>,
  notion:       <svg viewBox="0 0 24 24" fill="white" width="22" height="22"><path d="M4.459 4.208c.746.606 2.5.2 2.5.2l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 2.5.2l14.523-.84c.841-.047.934-.56.934-1.167V6.354c0-.606-.233-.933-.748-.887l-2.5.2c-.56.047-.746.327-.746.934zm2.5.2c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-2.5.2-2.5.2-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-2.5.2l-2.5.2c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-2.5.2-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.14c-.093-.514.28-.887.747-.933z"/></svg>,
  trello:       <svg viewBox="0 0 24 24" fill="white" width="24" height="24"><path d="M21 0H3C1.343 0 0 1.343 0 3v18c0 1.656 1.343 3 3 3h18c1.656 0 3-1.344 3-3V3c0-1.657-1.344-3-3-3zM10.44 18.18c0 .795-.645 1.44-1.44 1.44H4.56c-.795 0-1.44-.645-1.44-1.44V4.56c0-.795.645-1.44 1.44-1.44H9c.795 0 2.5.2 1.44 1.44v13.62zm10.44-7.2c0 .795-.645 1.44-1.44 1.44H15c-.795 0-1.44-.645-1.44-1.44V4.56c0-.795.645-1.44 1.44-1.44h4.44c.795 0 2.5.2 1.44 1.44v6.42z"/></svg>,
  telegram_web: <svg viewBox="0 0 24 24" fill="white" width="24" height="24"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248l-2.04 9.607c-.145.658-.537.818-2.5.2l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 2.5.2.903.614z"/></svg>,
}

const OsIcons = {
  windows: <svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32"><path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/></svg>,
  macos:   <svg viewBox="0 0 24 24" fill="currentColor" width="30" height="30"><path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.5.2-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.5.2 2.5.2 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-2.5.2-2.5.2-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 2.5.2 2.715-.688 3.559-1.701"/></svg>,
  linux:   <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" fill="currentColor" viewBox="0 0 16 16"><path d="M2.273 9.53a2.273 2.273 0 1 0 0-4.546 2.273 2.273 0 0 0 0 4.547Zm9.467-4.984a2.273 2.273 0 1 0 0-4.546 2.273 2.273 0 0 0 0 4.546M7.4 13.108a5.54 5.54 0 0 1-3.775-2.88 3.27 3.27 0 0 1-2.5.2 7.4 7.4 0 0 0 5.328 4.465c.53.113 2.5.2 2.5.2a3.25 3.25 0 0 1-.666-1.9 6 6 0 0 1-.557-.091m3.828 2.285a2.273 2.273 0 1 0 0-4.546 2.273 2.273 0 0 0 0 4.546m3.163-3.108a7.44 7.44 0 0 0 .373-8.726 3.3 3.3 0 0 1-1.278 1.498 5.57 5.57 0 0 1-.183 5.535 3.26 3.26 0 0 1 1.088 1.693M2.098 3.998a3.3 3.3 0 0 1 2.5.2 5.54 5.54 0 0 1 4.464-2.388c.037-.67.277-2.5.2-1.843a7.47 7.47 0 0 0-7.051 3.745"/></svg>,
}

/* ─── Hooks ──────────────────────────────────────────────────────────────── */
function useAnimatedCounter(target: number, duration = 1600) {
  const [val, setVal] = useState(0)
  const ref = useRef<HTMLSpanElement>(null)
  const started = useRef(false)
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !started.current) {
        started.current = true
        const steps = Math.ceil(duration / 16)
        let i = 0
        const t = setInterval(() => {
          i++
          setVal(Math.round(target * Math.pow(i / steps, 0.8)))
          if (i >= steps) { setVal(target); clearInterval(t) }
        }, 16)
      }
    })
    if (ref.current) obs.observe(ref.current)
    return () => obs.disconnect()
  }, [target, duration])
  return { val, ref }
}

function Reveal({ children, delay = 0, y = 24 }: { children: React.ReactNode; delay?: number; y?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-8% 0px' })
  return (
    <motion.div ref={ref}
      initial={{ opacity: 0, y }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1], delay }}>
      {children}
    </motion.div>
  )
}

/* ─── Support modal ──────────────────────────────────────────────────────── */
function SupportModal({ t, onClose }: { t: any; onClose: () => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState('')
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault(); setSending(true)
    await new Promise(r => setTimeout(r, 800)); setSent(true); setSending(false)
  }
  const inp: React.CSSProperties = { width: '100%', background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 10, padding: '11px 14px', color: '#F5F1E8', fontSize: 14, outline: 'none', fontFamily: 'inherit' }
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.75)', backdropFilter: 'blur(20px)' }} />
      <motion.div initial={{ scale: .94, opacity: 0, y: 16 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: .94, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 340, damping: 30 }}
        style={{ position: 'relative', zIndex: 1, background: '#111113', border: '1px solid rgba(255,255,255,.08)', borderRadius: 20, padding: '36px 32px', width: '100%', maxWidth: 440, boxShadow: '0 40px 120px rgba(0,0,0,.9)' }} onClick={e => e.stopPropagation()}>
        <button onClick={onClose} style={{ position: 'absolute', top: 14, right: 14, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.07)', color: 'rgba(255,255,255,.35)', width: 30, height: 30, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>×</button>
        {sent ? (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(34,197,94,.08)', border: '1px solid rgba(34,197,94,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg></div>
            <p style={{ color: '#F5F1E8', fontSize: 16, fontWeight: 600 }}>{t.sup_sent}</p>
            <button onClick={onClose} style={{ marginTop: 16, background: 'rgba(47,111,237,.9)', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 24px', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>{t.sup_close}</button>
          </div>
        ) : (
          <form onSubmit={handleSend}>
            <h3 style={{ color: '#F5F1E8', fontSize: 19, fontWeight: 700, marginBottom: 22, letterSpacing: '-.02em' }}>{t.sup_title}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input style={inp} placeholder={t.sup_name} value={name} onChange={e => setName(e.target.value)} required />
              <input style={inp} type="email" placeholder={t.sup_email} value={email} onChange={e => setEmail(e.target.value)} required />
              <textarea style={{ ...inp, resize: 'vertical', minHeight: 96 }} placeholder={t.sup_msg} value={msg} onChange={e => setMsg(e.target.value)} required />
            </div>
            <button type="submit" disabled={sending} style={{ marginTop: 16, width: '100%', background: '#2F6FED', color: '#fff', border: 'none', borderRadius: 10, padding: '12px', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', opacity: sending ? .7 : 1 }}>
              {sending ? '...' : t.sup_send}
            </button>
          </form>
        )}
      </motion.div>
    </motion.div>
  )
}

function ScreenshotLightbox({ screenshots, idx, setIdx, title }: { screenshots: string[]; idx: number; setIdx: (i: number | null) => void; title: string }) {
  const go = (d: number) => setIdx((idx + d + screenshots.length) % screenshots.length)
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={() => setIdx(null)}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.9)', backdropFilter: 'blur(24px)' }} />
      <button aria-label="Закрыть" onClick={() => setIdx(null)}
        style={{ position: 'absolute', top: 20, right: 20, zIndex: 2, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', color: 'rgba(255,255,255,.6)', width: 40, height: 40, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>×</button>
      <button aria-label="Назад" onClick={(e) => { e.stopPropagation(); go(-1) }}
        style={{ position: 'absolute', left: 20, top: '50%', transform: 'translateY(-50%)', zIndex: 2, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', color: 'rgba(255,255,255,.6)', width: 44, height: 44, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <button aria-label="Вперёд" onClick={(e) => { e.stopPropagation(); go(1) }}
        style={{ position: 'absolute', right: 20, top: '50%', transform: 'translateY(-50%)', zIndex: 2, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', color: 'rgba(255,255,255,.6)', width: 44, height: 44, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
      <motion.div key={idx} initial={{ scale: .96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: .96, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 340, damping: 32 }}
        style={{ position: 'relative', zIndex: 1, maxWidth: 'min(1100px, 90vw)', maxHeight: '86vh' }} onClick={e => e.stopPropagation()}>
        <img src={screenshots[idx]} alt={`Centrio — ${title} ${idx + 1}`}
          style={{ display: 'block', width: '100%', height: '100%', maxHeight: '86vh', objectFit: 'contain', borderRadius: 14, boxShadow: '0 40px 140px rgba(0,0,0,.9)', border: '1px solid rgba(255,255,255,.08)' }} />
        <div style={{ textAlign: 'center', marginTop: 14, color: 'rgba(245,241,232,.4)', fontSize: 13 }}>{idx + 1} / {screenshots.length}</div>
      </motion.div>
    </motion.div>
  )
}

const PROMO_CODE = 'PRO14'

function PromoPopup({ t, onClose }: { t: any; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    navigator.clipboard?.writeText(PROMO_CODE).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: .96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: .96 }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      style={{
        position: 'fixed', right: 20, bottom: 20, zIndex: 250, width: 'min(380px, calc(100vw - 40px))',
        background: 'linear-gradient(165deg, #15151a 0%, #0e0e11 100%)', border: '1px solid rgba(90,169,255,.18)',
        borderRadius: 18, padding: '26px 24px 22px', boxShadow: '0 30px 90px rgba(0,0,0,.65), 0 0 0 1px rgba(255,255,255,.03) inset',
        overflow: 'hidden',
      }}
    >
      <div style={{ position: 'absolute', top: -60, right: -60, width: 180, height: 180, background: 'radial-gradient(ellipse, rgba(90,169,255,.22) 0%, transparent 70%)', filter: 'blur(30px)', pointerEvents: 'none' }} />
      <button onClick={onClose} aria-label={t.sup_close}
        style={{ position: 'absolute', top: 12, right: 12, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.08)', color: 'rgba(255,255,255,.4)', width: 26, height: 26, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, zIndex: 1 }}>×</button>

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(155deg, #3D7FF2 0%, #2059D6 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 8px 20px rgba(47,111,237,.35)' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 12v10H4V12"/><path d="M2 7h20v5H2z"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>
        </div>
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#93C5FF' }}>{t.promo_eyebrow}</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: '#F5F1E8', letterSpacing: '-.01em', marginTop: 2 }}>{t.promo_title}</div>
        </div>
      </div>

      <p style={{ position: 'relative', zIndex: 1, fontSize: 13.5, lineHeight: 1.55, color: 'rgba(245,241,232,.55)', margin: '0 0 18px' }}>{t.promo_sub}</p>

      <div style={{ position: 'relative', zIndex: 1, marginBottom: 16 }}>
        <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'rgba(245,241,232,.35)', marginBottom: 7 }}>{t.promo_code_hint}</div>
        <button onClick={handleCopy} style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          background: 'rgba(90,169,255,.08)', border: '1px dashed rgba(90,169,255,.35)', borderRadius: 10,
          padding: '10px 14px', cursor: 'pointer', fontFamily: 'inherit',
        }}>
          <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: '.06em', color: '#F5F1E8' }}>{PROMO_CODE}</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: copied ? '#5AD98F' : '#93C5FF', display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
            {copied ? (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            )}
            {copied ? t.promo_copied : t.promo_copy}
          </span>
        </button>
      </div>

      <a href={WIN_DOWNLOAD} onClick={onClose} className="btn-p" style={{ position: 'relative', zIndex: 1, display: 'flex', width: '100%', justifyContent: 'center', fontSize: 14, padding: '12px' }}>
        {t.promo_cta}
      </a>
      <p style={{ position: 'relative', zIndex: 1, fontSize: 11.5, color: 'rgba(245,241,232,.32)', textAlign: 'center', margin: '10px 0 0' }}>{t.promo_cta_sub}</p>
    </motion.div>
  )
}

/* ─── Lang switcher ──────────────────────────────────────────────────────── */
function LangSwitcher({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const pathname = usePathname()
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])
  // If this page has a real localized route for the target language, go
  // there (so search engines and the URL bar both reflect the language).
  // Otherwise fall back to the old behavior — swap the text in place,
  // since most pages (pricing, faq, features, most blog posts) don't have
  // translated routes yet.
  const chooseLang = (l: Lang) => {
    setOpen(false)
    const canonical = canonicalPath(pathname || '/')
    if (LOCALIZED_ROUTES.has(canonical)) {
      router.push(localizedHref(canonical, l))
    } else {
      setLang(l)
    }
  }
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(!open)} className="lang-btn" style={{ background: 'transparent', border: '1px solid rgba(255,255,255,.08)', borderRadius: 8, padding: '6px 11px', color: 'rgba(245,241,232,.45)', fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
        <svg className="lang-globe" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'none', flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
        <span className="lang-label">{LANG_LABELS[lang]}</span>
        <svg className="lang-chevron" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, background: '#111113', border: '1px solid rgba(255,255,255,.08)', borderRadius: 10, overflow: 'hidden', zIndex: 50, minWidth: 120, boxShadow: '0 16px 48px rgba(0,0,0,.8)' }}>
          {LANGS.map(l => (
            <button key={l} onClick={() => chooseLang(l)} style={{ display: 'block', width: '100%', padding: '8px 14px', background: l === lang ? 'rgba(47,111,237,.12)' : 'transparent', border: 'none', color: l === lang ? '#93C5FF' : 'rgba(245,241,232,.45)', fontSize: 13, fontWeight: l === lang ? 600 : 400, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
              {LANG_LABELS[l]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── App mockup data ────────────────────────────────────────────────────── */
const MOCK_DATA = [
  {
    name: 'Telegram', color: '#2AABEE', img: '/messengers/telegram.png',
    chats: [
      { name: 'Алексей М.',     msg: 'До встречи! ✓✓',       time: '10:27', unread: 0 },
      { name: 'Рабочий чат',   msg: 'Артём: Готово, смотри', time: '09:54', unread: 3 },
      { name: 'Маша',          msg: 'Спасибо 🙏',             time: 'вчера', unread: 0 },
      { name: 'Дизайн-команда',msg: 'Новый макет загружен',   time: 'вчера', unread: 1 },
    ],
    contact: 'Алексей М.', contactLetter: 'А',
    messages: [
      { text: 'Привет! Когда будет готов проект?',            mine: false, time: '10:14' },
      { text: 'Через час пришлю финальную версию',            mine: true,  time: '10:16' },
      { text: 'Отлично, жду 👍',                             mine: false, time: '10:17' },
      { text: 'Всё, отправил — проверь на почте',            mine: true,  time: '10:25' },
      { text: 'До встречи! ✓✓',                             mine: false, time: '10:27' },
    ],
  },
  {
    name: 'WhatsApp', color: '#25D366', img: '/messengers/whatsapp.png',
    chats: [
      { name: 'Мама',     msg: 'Ты поел? 🍕',           time: '11:03', unread: 2 },
      { name: 'Друзья',   msg: 'Витя: Завтра в 19:00?', time: '10:45', unread: 5 },
      { name: 'Катя',     msg: 'Окей, договорились',     time: '10:30', unread: 0 },
      { name: 'Работа',   msg: 'Не забудь отчёт',        time: 'вчера', unread: 0 },
    ],
    contact: 'Катя', contactLetter: 'К',
    messages: [
      { text: 'Привет! Ты свободен завтра вечером?',         mine: false, time: '10:28' },
      { text: 'Да, а что планируешь?',                       mine: true,  time: '10:29' },
      { text: 'Кино и пицца у Вити 🍕',                     mine: false, time: '10:30' },
      { text: 'Звучит отлично, буду!',                       mine: true,  time: '10:31' },
      { text: 'Окей, договорились 🎉',                       mine: false, time: '10:32' },
    ],
  },
  {
    name: 'Discord', color: '#5865F2', svg: 'discord',
    chats: [
      { name: '# general',      msg: 'vitya: gg wp 🎮',       time: '11:15', unread: 12 },
      { name: '# dev-team',     msg: 'new build dropped!',    time: '11:00', unread: 3 },
      { name: '# design',       msg: 'check the mockups',     time: '10:40', unread: 0 },
      { name: '# announcements',msg: 'v2.1 is live 🚀',       time: 'вчера', unread: 0 },
    ],
    contact: '# general', contactLetter: '#',
    messages: [
      { text: 'yo кто играет сегодня?',                      mine: false, time: '11:10' },
      { text: 'я готов, заходи',                             mine: true,  time: '11:11' },
      { text: 'ждём ещё двоих',                              mine: false, time: '11:12' },
      { text: 'окей, через 10 минут стартуем',               mine: true,  time: '11:13' },
      { text: 'gg wp 🎮',                                    mine: false, time: '11:15' },
    ],
  },
  {
    name: 'ВКонтакте', color: '#0077FF', svg: 'vk',
    chats: [
      { name: 'Дима',          msg: 'Лайкнул твоё фото',   time: '12:01', unread: 1 },
      { name: 'Студенты 2024', msg: 'Саша: когда экзамен?',time: '11:55', unread: 7 },
      { name: 'Настя',         msg: 'Спасибо за совет!',   time: '11:20', unread: 0 },
      { name: 'Одноклассники', msg: 'Встреча 15 июля 🎉',  time: 'вчера', unread: 2 },
    ],
    contact: 'Настя', contactLetter: 'Н',
    messages: [
      { text: 'Привет! Как дела? 😊',                        mine: false, time: '11:18' },
      { text: 'Всё хорошо, спасибо! Как сам?',              mine: true,  time: '11:19' },
      { text: 'Тоже неплохо, готовлюсь к сессии',           mine: false, time: '11:19' },
      { text: 'Удачи! Если что — пиши, помогу',             mine: true,  time: '11:20' },
      { text: 'Спасибо за совет! 🙏',                        mine: false, time: '11:20' },
    ],
  },
  {
    name: 'Gmail', color: '#EA4335', img: '/messengers/gmail.png',
    chats: [
      { name: 'GitHub',  msg: 'New PR review requested',  time: '12:30', unread: 1 },
      { name: 'Stripe',  msg: 'Платёж успешно получен',   time: '12:15', unread: 0 },
      { name: 'Notion',  msg: 'Дмитрий поделился...',     time: '11:50', unread: 0 },
      { name: 'Figma',   msg: 'New comment on your file', time: 'вчера', unread: 3 },
    ],
    contact: 'GitHub', contactLetter: 'G',
    messages: [
      { text: 'New pull request: feat/landing-redesign',     mine: false, time: '12:28' },
      { text: 'Changes look good, approving ✅',             mine: true,  time: '12:29' },
      { text: 'Thanks! Merging to main now',                 mine: false, time: '12:29' },
      { text: 'Deploy pipeline started 🚀',                  mine: false, time: '12:30' },
      { text: 'New PR review requested',                     mine: false, time: '12:30' },
    ],
  },
]

/* ─── App mockup component ───────────────────────────────────────────────── */
function AppMockup() {
  const [activeIdx, setActiveIdx] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const [showTyping, setShowTyping] = useState(false)
  const activeIdxRef = useRef(0)
  const typingRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const switchTo = (idx: number) => {
    activeIdxRef.current = idx
    setActiveIdx(idx)
    if (typingRef.current) clearTimeout(typingRef.current)
    setShowTyping(true)
    typingRef.current = setTimeout(() => setShowTyping(false), 850)
  }

  useEffect(() => {
    if (isPaused) return
    const id = setInterval(() => switchTo((activeIdxRef.current + 1) % MOCK_DATA.length), 2800)
    return () => { clearInterval(id); if (typingRef.current) clearTimeout(typingRef.current) }
  }, [isPaused])

  const active = MOCK_DATA[activeIdx]
  const displayMessages = active.messages.slice(0, showTyping ? -1 : undefined)

  return (
    <div
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      style={{
        position: 'relative',
        background: '#0c0c14',
        border: '1px solid rgba(255,255,255,.12)',
        borderRadius: 14,
        overflow: 'hidden',
        boxShadow: '0 0 0 1px rgba(255,255,255,.04), 0 60px 140px rgba(0,0,0,.9)',
        width: '100%',
        maxWidth: 560,
      }}>
      {/* Progress bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, zIndex: 20, background: 'rgba(255,255,255,.04)', overflow: 'hidden' }}>
        {!isPaused && (
          <div key={`pb-${activeIdx}`} style={{ height: '100%', background: active.color, animation: 'progress-fill 2.8s linear forwards', width: 0 }} />
        )}
      </div>

      {/* Titlebar */}
      <div style={{ background: 'rgba(0,0,0,.5)', padding: '9px 14px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid rgba(255,255,255,.05)' }}>
        <img src="/logo.png" alt="" style={{ width: 16, height: 16, objectFit: 'contain', flexShrink: 0, opacity: .9 }} />
        <span style={{ fontSize: 12, fontWeight: 650, color: 'rgba(245,241,232,.55)', letterSpacing: '-.01em', flexShrink: 0 }}>Centrio</span>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <div style={{ background: 'rgba(255,255,255,.05)', borderRadius: 6, padding: '3px 12px', display: 'flex', alignItems: 'center', gap: 5, width: 160 }}>
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.2)" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <span style={{ fontSize: 9.5, color: 'rgba(255,255,255,.18)' }}>Поиск...</span>
          </div>
        </div>
        <div style={{ width: 50 }} />
      </div>

      <div style={{ display: 'flex', height: 340 }}>

        {/* Icon sidebar — mirrors the real app's rail: apps top-to-bottom, system controls at the end */}
        <div style={{ width: 48, background: 'rgba(0,0,0,.35)', borderRight: '1px solid rgba(255,255,255,.04)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '6px 0', gap: 4, flexShrink: 0 }}>
          {MOCK_DATA.map((app, i) => (
            <div key={i} onClick={() => switchTo(i)} style={{ cursor: 'pointer', position: 'relative' }}>
              <div style={{
                width: 32, height: 32,
                borderRadius: i === activeIdx ? 10 : 16,
                background: app.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'border-radius .25s ease, box-shadow .25s ease',
                boxShadow: i === activeIdx ? `0 0 0 2px ${app.color}55, 0 4px 12px ${app.color}44` : 'none',
                overflow: 'hidden', flexShrink: 0,
              }}>
                {(app as any).img
                  ? <img src={(app as any).img} alt="" style={{ width: 20, height: 20, objectFit: 'contain' }} />
                  : <span style={{ transform: 'scale(.62)', display: 'flex', transformOrigin: 'center' }}>{MessengerSvgs[(app as any).svg]}</span>
                }
              </div>
              {/* Active indicator dot */}
              {i === activeIdx && (
                <div style={{ position: 'absolute', left: -4, top: '50%', transform: 'translateY(-50%)', width: 3, height: 16, borderRadius: 2, background: app.color }} />
              )}
            </div>
          ))}
          <div style={{ width: 32, height: 32, borderRadius: 10, border: '1.5px dashed rgba(255,255,255,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,.2)', fontSize: 16, flexShrink: 0 }}>+</div>

          <div style={{ flex: 1 }} />

          {/* System controls — settings, blocking, split (matches the real app's rail) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center', paddingTop: 4, borderTop: '1px solid rgba(255,255,255,.05)', width: '100%', flexShrink: 0 }}>
            {[
              <svg key="s" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.32)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-2.5.2l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 2.5.2H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
              <svg key="l" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.32)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
              <svg key="sp" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.32)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="12" y1="4" x2="12" y2="20"/></svg>,
            ].map((icon, si) => (
              <div key={si} style={{ width: 24, height: 24, borderRadius: 7, background: 'rgba(255,255,255,.03)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {icon}
              </div>
            ))}
          </div>
        </div>

        {/* Chat list */}
        <div style={{ width: 168, borderRight: '1px solid rgba(255,255,255,.04)', background: 'rgba(0,0,0,.18)', display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden' }}>
          <div style={{ padding: '8px 11px 6px', borderBottom: '1px solid rgba(255,255,255,.04)', flexShrink: 0 }}>
            <AnimatePresence mode="wait">
              <motion.span key={activeIdx}
                initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
                transition={{ duration: 0.18 }}
                style={{ fontSize: 11.5, fontWeight: 700, color: active.color, letterSpacing: '-.01em', display: 'block' }}>
                {active.name}
              </motion.span>
            </AnimatePresence>
          </div>
          <AnimatePresence mode="wait">
            <motion.div key={activeIdx}
              initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              style={{ flex: 1 }}>
              {active.chats.map((c, i) => (
                <div key={i} style={{ padding: '9px 10px', background: i === 0 ? `${active.color}18` : 'transparent', borderLeft: i === 0 ? `2px solid ${active.color}` : '2px solid transparent', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                    <span style={{ fontSize: 11, fontWeight: i === 0 ? 700 : 500, color: i === 0 ? '#F5F1E8' : 'rgba(245,241,232,.65)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                    <span style={{ fontSize: 9, color: 'rgba(245,241,232,.25)', flexShrink: 0, marginLeft: 4 }}>{c.time}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 10, color: 'rgba(245,241,232,.3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{c.msg}</span>
                    {c.unread > 0 && <span style={{ background: active.color, color: '#fff', fontSize: 8.5, fontWeight: 700, borderRadius: 8, minWidth: 15, height: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px', flexShrink: 0 }}>{c.unread}</span>}
                  </div>
                </div>
              ))}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Chat area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {/* Chat header */}
          <div style={{ padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,.04)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <AnimatePresence mode="wait">
              <motion.div key={activeIdx}
                initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.2 }}
                style={{ width: 28, height: 28, borderRadius: '50%', background: active.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                {active.contactLetter}
              </motion.div>
            </AnimatePresence>
            <AnimatePresence mode="wait">
              <motion.div key={activeIdx}
                initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: '#F5F1E8' }}>{active.contact}</div>
                <div style={{ fontSize: 9.5, color: '#22c55e', fontWeight: 500 }}>в сети</div>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'hidden', position: 'relative' }}>
            <AnimatePresence mode="wait">
              <motion.div key={activeIdx}
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {displayMessages.map((m, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: m.mine ? 'flex-end' : 'flex-start' }}>
                    <div style={{ maxWidth: '72%', background: m.mine ? active.color + 'cc' : 'rgba(255,255,255,.06)', borderRadius: m.mine ? '12px 12px 2px 12px' : '12px 12px 12px 2px', padding: '7px 10px', fontSize: 10.5, color: '#fff', lineHeight: 1.45 }}>
                      {m.text}
                      <span style={{ display: 'block', fontSize: 8.5, color: 'rgba(255,255,255,.4)', marginTop: 2, textAlign: 'right' }}>{m.time}</span>
                    </div>
                  </div>
                ))}
                {showTyping && (
                  <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }}
                    style={{ display: 'flex', justifyContent: 'flex-start' }}>
                    <div style={{ background: 'rgba(255,255,255,.06)', borderRadius: '12px 12px 12px 2px', padding: '9px 13px', display: 'flex', gap: 4, alignItems: 'center' }}>
                      {[0, 1, 2].map(di => (
                        <div key={di} style={{ width: 4, height: 4, borderRadius: '50%', background: active.color, animation: `typing-dot 1.1s ease-in-out ${di * 0.18}s infinite` }} />
                      ))}
                    </div>
                  </motion.div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Input */}
          <div style={{ padding: '8px 12px', borderTop: '1px solid rgba(255,255,255,.04)', display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
            <div style={{ flex: 1, background: 'rgba(255,255,255,.05)', borderRadius: 8, padding: '6px 10px', fontSize: 10, color: 'rgba(245,241,232,.2)' }}>Написать сообщение...</div>
            <div style={{ width: 26, height: 26, borderRadius: 8, background: active.color + 'cc', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background .3s' }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Feature icon ───────────────────────────────────────────────────────── */
function FIcon({ name, color = 'rgba(245,241,232,.55)' }: { name: string; color?: string }) {
  const p = { viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: '1.7', width: '20', height: '20', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  if (name === 'grid')   return <svg {...p}><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>
  if (name === 'bell')   return <svg {...p}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
  if (name === 'folder') return <svg {...p}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
  if (name === 'globe')  return <svg {...p}><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
  if (name === 'theme')  return <svg {...p}><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
  if (name === 'lock')   return <svg {...p}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
  if (name === 'cloud')  return <svg {...p}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
  if (name === 'sound')  return <svg {...p}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
  if (name === 'update') return <svg {...p}><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
  if (name === 'split')  return <svg {...p}><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="12" y1="4" x2="12" y2="20"/></svg>
  return null
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════════════════════════════ */
export default function LandingPage() {
  const { lang, t, setLang } = useLang()
  const screenshots = lang === 'ru'
    ? ['/screenshots/ru/1.png', '/screenshots/ru/2.png', '/screenshots/ru/3.png', '/screenshots/ru/4.png', '/screenshots/ru/5.png']
    : ['/screenshots/en/1.png', '/screenshots/en/2.png', '/screenshots/en/3.png', '/screenshots/en/4.png', '/screenshots/en/5.png']
  const [scrolled, setScrolled] = useState(false)
  const [pastHero, setPastHero] = useState(false)
  const [stickyDismissed, setStickyDismissed] = useState(false)
  const [supportOpen, setSupportOpen] = useState(false)
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null)
  const [promoOpen, setPromoOpen] = useState(false)
  const c1 = useAnimatedCounter(15)
  const c2 = useAnimatedCounter(52184)
  const c3 = useAnimatedCounter(4)
  const ssRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (lightboxIdx === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxIdx(null)
      if (e.key === 'ArrowRight') setLightboxIdx(v => v === null ? v : (v + 1) % screenshots.length)
      if (e.key === 'ArrowLeft') setLightboxIdx(v => v === null ? v : (v - 1 + screenshots.length) % screenshots.length)
    }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prevOverflow }
  }, [lightboxIdx, screenshots.length])

  useEffect(() => {
    const fn = () => {
      setScrolled(window.scrollY > 40)
      setPastHero(window.scrollY > window.innerHeight * 0.75)
    }
    window.addEventListener('scroll', fn); return () => window.removeEventListener('scroll', fn)
  }, [])

  useEffect(() => {
    if (localStorage.getItem('centrio_promo_seen')) return
    const timer = setTimeout(() => setPromoOpen(true), 10000)
    return () => clearTimeout(timer)
  }, [])

  const dismissPromo = () => {
    setPromoOpen(false)
    localStorage.setItem('centrio_promo_seen', '1')
  }

  const messengers = [
    { name: 'Telegram',      img: '/messengers/telegram.png', color: '#2AABEE' },
    { name: 'WhatsApp',      img: '/messengers/whatsapp.png', color: '#25D366' },
    { name: 'Discord',       svg: 'discord',                  color: '#5865F2' },
    { name: 'ВКонтакте',     svg: 'vk',                       color: '#0077FF' },
    { name: 'Gmail',         img: '/messengers/gmail.png',     color: '#EA4335' },
    { name: 'Яндекс.Почта',  img: '/messengers/yandex.png',    color: '#FC3F1D' },
    { name: 'Slack',         svg: 'slack',                    color: '#4A154B' },
    { name: 'Instagram',     svg: 'instagram',                color: '#C13584' },
    { name: 'Viber',         svg: 'viber',                    color: '#7360F2' },
    { name: 'Signal',        svg: 'signal',                   color: '#3A76F0' },
    { name: 'Битрикс24',     img: '/messengers/bitrix.png',    color: '#2fc7f7' },
    { name: 'MAX',           img: '/messengers/max.png',       color: '#0087FF' },
    { name: 'Notion',        svg: 'notion',                   color: '#555'    },
    { name: 'Trello',        svg: 'trello',                   color: '#0079BF' },
    { name: 'Telegram Web',  svg: 'telegram_web',             color: '#2AABEE' },
  ]

  const features = [
    { icon: 'grid',   title: t.f1t, desc: t.f1d },
    { icon: 'bell',   title: t.f2t, desc: t.f2d },
    { icon: 'folder', title: t.f3t, desc: t.f3d },
    { icon: 'globe',  title: t.f4t, desc: t.f4d },
    { icon: 'theme',  title: t.f5t, desc: t.f5d },
    { icon: 'lock',   title: t.f6t, desc: t.f6d },
  ]

  const capabilities = [
    { icon: 'grid',   title: t.f1t,  desc: t.f1d,  tier: 'basic' as const },
    { icon: 'folder', title: t.f3t,  desc: t.f3d,  tier: 'basic' as const },
    { icon: 'bell',   title: t.f2t,  desc: t.f2d,  tier: 'basic' as const },
    { icon: 'theme',  title: t.f5t,  desc: t.f5d,  tier: 'basic' as const },
    { icon: 'globe',  title: t.f4t,  desc: t.f4d,  tier: 'basic' as const },
    { icon: 'sound',  title: t.f8t,  desc: t.f8d,  tier: 'basic' as const },
    { icon: 'split',  title: t.f10t, desc: t.f10d, tier: 'pro' as const },
    { icon: 'lock',   title: t.f6t,  desc: t.f6d,  tier: 'pro' as const },
    { icon: 'cloud',  title: t.f7t,  desc: t.f7d,  tier: 'pro' as const },
    { icon: 'update', title: t.f9t,  desc: t.f9d,  tier: 'basic' as const },
  ]

  const C = 'rgba(245,241,232,'

  return (
    <>
      <style>{`
        :root { color-scheme: dark; }
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }
        body {
          background: #0b0a08;
          color: #F5F1E8;
          font-family: var(--font-geist), -apple-system, BlinkMacSystemFont, sans-serif;
          overflow-x: hidden;
          -webkit-font-smoothing: antialiased;
        }
        /* Subtle grid, warmed off pure white */
        body::before {
          content: '';
          position: fixed; inset: 0; z-index: 0; pointer-events: none;
          background-image:
            linear-gradient(rgba(255,235,210,.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,235,210,.025) 1px, transparent 1px);
          background-size: 40px 40px;
          mask-image: radial-gradient(ellipse 80% 80% at 50% 0%, black 30%, transparent 80%);
          -webkit-mask-image: radial-gradient(ellipse 80% 80% at 50% 0%, black 30%, transparent 80%);
        }
        .page { position: relative; z-index: 1; }
        .wrap { max-width: 1140px; margin: 0 auto; padding: 0 24px; }

        /* Keyframes */
        @keyframes mq-l { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
        @keyframes mq-r { 0%{transform:translateX(-50%)} 100%{transform:translateX(0)} }
        @keyframes float { 0%,100%{transform:translateY(0) perspective(1000px) rotateY(-6deg) rotateX(1.5deg)} 50%{transform:translateY(-10px) perspective(1000px) rotateY(-6deg) rotateX(1.5deg)} }
        @keyframes grad-border { 0%,100%{background-position:0% 50%} 50%{background-position:100% 50%} }
        @keyframes progress-fill { from { width: 0% } to { width: 100% } }
        @keyframes typing-dot {
          0%, 60%, 100% { transform: translateY(0); opacity: .3 }
          30% { transform: translateY(-3px); opacity: .95 }
        }
        @keyframes notif-bounce {
          0%   { transform: scale(.82) translateY(12px); opacity: 0 }
          55%  { transform: scale(1.05) translateY(-3px); opacity: 1 }
          75%  { transform: scale(.97) translateY(1px) }
          100% { transform: scale(1) translateY(0) }
        }

        /* Comparison table */
        .cmp-grid { display: grid; grid-template-columns: 1fr 1.1fr 1fr 1fr 1fr; }
        .cmp-header { padding: 12px 14px; font-size: 12px; font-weight: 700; letter-spacing: -.01em; }
        .cmp-cell { padding: 13px 14px; font-size: 12.5px; border-top: 1px solid rgba(255,255,255,.05); }
        .cmp-centrio { background: rgba(255,255,255,.035); border-left: 1px solid rgba(255,255,255,.1); border-right: 1px solid rgba(255,255,255,.1); }
        .cmp-centrio-top { border-top: 2px solid #5AA9FF; border-radius: 10px 10px 0 0; }
        .cmp-centrio-bot { border-bottom: 1px solid rgba(255,255,255,.1); border-radius: 0 0 10px 10px; }
        @media (max-width: 680px) { .cmp-grid { grid-template-columns: 1fr 1fr; } .cmp-hide { display: none !important; } }

        /* Accent word — flat color, no gradient/shimmer. Weight/size carries
           hierarchy, not decoration (matches Linear/Raycast/Arc headline
           treatment — a single confident accent color, not a moving gradient). */
        .gt { color: #5AA9FF; }

        /* Nav — reads as the title bar of the page, echoing the AppMockup
           window chrome below it (same traffic-light dots). */
        .nav { position: fixed; top: 0; left: 0; right: 0; z-index: 100; }
        .nav.sc { background: rgba(11,10,8,.92); backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px); border-bottom: 1px solid rgba(255,255,255,.06); }
        .nlink { font-family: var(--font-geist); color: ${C}.4); font-size: 13.5px; font-weight: 500; text-decoration: none; transition: all .2s; letter-spacing: -.01em; padding: 7px 12px; border-radius: 8px; }
        .nlink:hover { color: #F5F1E8; background: rgba(255,255,255,.05); }
        .win-dots { display: flex; gap: 5px; flex-shrink: 0; }
        .win-dots span { width: 8px; height: 8px; border-radius: 50%; opacity: .75; }
        .nav-div { width: 1px; height: 20px; background: rgba(255,255,255,.08); margin: 0 2px; flex-shrink: 0; }

        /* Buttons */
        .btn-p {
          display: inline-flex; align-items: center; gap: 8px;
          background: linear-gradient(155deg, #3D7FF2 0%, #2F6FED 45%, #2059D6 100%);
          color: #fff; font-weight: 600; font-size: 14px;
          padding: 11px 22px; border-radius: 10px; border: none; cursor: pointer;
          text-decoration: none; transition: all .18s cubic-bezier(.4,0,.2,1); white-space: nowrap; font-family: inherit;
          box-shadow: inset 0 1px 0 rgba(255,255,255,.2), 0 1px 2px rgba(15,45,110,.3), 0 0 0 1px rgba(47,111,237,.15);
        }
        .btn-p:hover { background: linear-gradient(155deg, #4A89F5 0%, #3877EF 45%, #2660DE 100%); transform: translateY(-1px); box-shadow: inset 0 1px 0 rgba(255,255,255,.26), 0 4px 14px rgba(47,111,237,.35), 0 0 0 1px rgba(90,169,255,.3); }
        .btn-p:active { transform: translateY(0); }

        .btn-s {
          display: inline-flex; align-items: center; gap: 8px;
          background: transparent; border: 1px solid rgba(255,255,255,.1);
          color: ${C}.65); font-weight: 500; font-size: 14px; padding: 11px 22px;
          border-radius: 10px; cursor: pointer; text-decoration: none; transition: all .2s; white-space: nowrap;
        }
        .btn-s:hover { border-color: rgba(255,255,255,.22); color: #F5F1E8; background: rgba(255,255,255,.03); }

        /* Cards — two-tier elevation. L1 (.card) is the flat resting tier used
           by every regular tile; L2 (.card-elevated) is a visibly heavier
           surface (brighter bg, stronger border, real ambient shadow) reserved
           for the one tile per section that should read as "the main thing" —
           mirrors Linear's tonal-layering elevation system instead of every
           block sharing one identical flat treatment. */
        .card {
          background: rgba(255,255,255,.03);
          border: 1px solid rgba(255,255,255,.07);
          border-radius: 14px;
          transition: all .3s ease;
        }
        .card:hover { background: rgba(255,255,255,.05); border-color: rgba(255,255,255,.12); }
        .card-elevated {
          position: relative;
          background: rgba(255,255,255,.055);
          border: 1px solid rgba(255,255,255,.1);
          box-shadow: 0 30px 70px rgba(0,0,0,.45);
        }
        .card-elevated:hover { background: rgba(255,255,255,.07); border-color: rgba(255,255,255,.16); }
        /* L3 (.card-highlight) — reserved for exactly one tile: a Pro-gated
           feature that deserves the same accent-blue treatment as the flagship
           icon, without competing with it for "the main thing" attention. */
        .card-highlight {
          background: linear-gradient(155deg, rgba(90,169,255,.09), rgba(255,255,255,.03));
          border: 1px solid rgba(90,169,255,.22);
        }
        .card-highlight:hover { background: linear-gradient(155deg, rgba(90,169,255,.13), rgba(255,255,255,.05)); border-color: rgba(90,169,255,.34); }

        /* Section label — small-caps sans eyebrow, wide tracking carries the
           "label" read instead of leaning on a monospace face for it. */
        .label {
          display: inline-block;
          font-family: var(--font-geist);
          font-size: 11px; font-weight: 700; letter-spacing: .1em;
          text-transform: uppercase; color: #93C5FF; margin-bottom: 14px;
        }
        .sh { font-family: var(--font-display), var(--font-geist); font-size: clamp(26px,3.5vw,46px); font-weight: 700; line-height: 1.1; letter-spacing: -.02em; color: #F5F1E8; }
        .sp { font-size: 15.5px; color: ${C}.38); line-height: 1.85; margin-top: 14px; }

        /* Messenger card */
        .mc {
          display: flex; flex-direction: column; align-items: center; gap: 9px;
          background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.06);
          border-radius: 14px; padding: 18px 14px; min-width: 104px; flex-shrink: 0; transition: all .2s;
        }
        .mc:hover { background: rgba(255,255,255,.06); border-color: rgba(255,255,255,.16); transform: translateY(-3px); }

        /* Marquee */
        .mql { display: flex; gap: 10px; animation: mq-l 42s linear infinite; width: max-content; }
        .mqr { display: flex; gap: 10px; animation: mq-r 36s linear infinite; width: max-content; }
        .mql:hover, .mqr:hover { animation-play-state: paused; }
        .mq-wrap {
          overflow: hidden;
          mask-image: linear-gradient(to right, transparent, black 100px, black calc(100% - 100px), transparent);
          -webkit-mask-image: linear-gradient(to right, transparent, black 100px, black calc(100% - 100px), transparent);
        }

        /* Screenshots gallery — browser-chrome-framed, tilted deck.
           overflow-x MUST be auto (not visible) or the track has no way to
           scroll — frames past the viewport edge were unreachable, so only
           the first ~2 of 5 screenshots were ever visible. */
        .ss-scroll { min-width: 0; flex: 1; overflow-x: auto; overflow-y: visible; padding: 40px 4px 44px; scrollbar-width: none; scroll-snap-type: x proximity; cursor: grab; }
        .ss-scroll:active { cursor: grabbing; }
        .ss-scroll::-webkit-scrollbar { display: none; }
        .ss-track { display: flex; gap: 24px; width: max-content; }
        .ss-nav { display: inline-flex; align-items: center; justify-content: center; width: 38px; height: 38px; border-radius: 50%; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.1); color: ${C}.5); cursor: pointer; transition: all .2s; flex-shrink: 0; }
        .ss-nav:hover { background: rgba(255,255,255,.08); border-color: rgba(255,255,255,.2); color: #F5F1E8; }
        .ss-frame {
          width: min(48vw, 380px); flex-shrink: 0; border-radius: 12px; overflow: hidden;
          scroll-snap-align: center; transition: transform .35s ease;
        }
        .ss-frame:hover { transform: translateY(-10px) scale(1.02); z-index: 2; }
        .ss-frame img { display: block; width: 100%; height: auto; border-radius: 12px; }

        /* OS card */
        .osc {
          display: flex; flex-direction: column; align-items: center; gap: 10px;
          background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.07);
          border-radius: 18px; padding: 28px 36px; text-decoration: none; transition: all .25s;
          color: ${C}.65); min-width: 156px;
          box-shadow: 0 20px 50px rgba(0,0,0,.35);
        }
        .osc:hover { background: rgba(255,255,255,.055); border-color: rgba(255,255,255,.18); transform: translateY(-4px); color: #F5F1E8; box-shadow: 0 30px 70px rgba(0,0,0,.5); }

        /* Divider */
        .div { height: 1px; background: rgba(255,255,255,.06); }

        /* Footer links */
        .fl  { display: block; font-size: 13px; color: ${C}.32); text-decoration: none; margin-bottom: 8px; transition: color .15s; }
        .fl:hover { color: ${C}.7); }
        .flh { font-family: var(--font-geist); font-size: 10.5px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: ${C}.22); margin-bottom: 14px; display: block; }

        /* Features bento — flagship tile spans 2 rows on the left; two stacked
           full-content cards balance it on the right (was two icon-only
           squares with no description — looked broken, half-empty); the
           remaining three features share an even row underneath, all four
           non-flagship tiers now carry the same icon+title+desc content so
           nothing in the grid reads as a placeholder. */
        .feat-grid { display: grid; grid-template-columns: repeat(6, 1fr); grid-auto-rows: minmax(140px, auto); gap: 12px; }
        .feat-0 { grid-column: 1 / 5; grid-row: 1 / 3; }
        .feat-1 { grid-column: 5 / 7; grid-row: 1 / 2; }
        .feat-2 { grid-column: 5 / 7; grid-row: 2 / 3; }
        .feat-3 { grid-column: 1 / 3; grid-row: 3 / 4; }
        .feat-4 { grid-column: 3 / 5; grid-row: 3 / 4; }
        .feat-5 { grid-column: 5 / 7; grid-row: 3 / 4; }

        /* All-capabilities grid */
        .cap-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
        .cap-card { display: flex; align-items: flex-start; gap: 14px; padding: 18px 20px; height: 100%; }
        .cap-card-icon { width: 38px; height: 38px; flex-shrink: 0; border-radius: 10px; background: rgba(90,169,255,.1); border: 1px solid rgba(90,169,255,.22); display: flex; align-items: center; justify-content: center; }

        /* Responsive */
        @media (max-width: 860px) {
          .hero-grid { grid-template-columns: 1fr !important; }
          .mockup-col { display: none !important; }
          .navlinks   { display: none !important; }
          .feat-grid  { grid-template-columns: 1fr 1fr !important; }
          .feat-0     { grid-column: span 2 !important; grid-row: span 2 !important; }
          .feat-1, .feat-2, .feat-3, .feat-4, .feat-5 { grid-column: span 1 !important; grid-row: span 1 !important; }
          .ftcols     { grid-template-columns: 1fr 1fr !important; }
        }
        @media (max-width: 540px) {
          .feat-grid { grid-template-columns: 1fr !important; }
          .feat-0, .feat-1, .feat-2, .feat-3, .feat-4, .feat-5 { grid-column: span 1 !important; }
          .cap-grid  { grid-template-columns: 1fr !important; }
          .dl-wrap   { flex-direction: column !important; align-items: center !important; }
          .ftcols    { grid-template-columns: 1fr !important; }
          .pl-wrap   { flex-direction: column !important; }
        }

        /* Nav right side: collapse to icon-only so it never overflows the
           viewport — mirrors the same breakpoint/approach already proven on
           SiteHeader.tsx (shared header used by every other page). */
        @media (max-width: 560px) {
          .nav-right { gap: 6px !important; }

          .lang-label, .lang-chevron { display: none !important; }
          .lang-globe { display: flex !important; }
          .lang-btn { padding: 7px 9px !important; }

          .lk-text { display: none !important; }
          .lk-icon { display: flex !important; }
          .lk-link { padding: 8px 10px !important; }

          .dl-text { display: none !important; }
          .dl-btn { padding: 9px 11px !important; gap: 0 !important; }
        }

        /* Sticky download banner: prevent horizontal overflow on narrow
           screens — no-wrap text + icon + close button don't fit under
           ~420px, so drop the tagline and tighten spacing/padding first. */
        @media (max-width: 480px) {
          .sticky-dl-tagline { display: none !important; }
          .sticky-dl-bar { padding: 8px 8px 8px 12px !important; gap: 8px !important; }
          .sticky-dl-btn-text { display: none !important; }
          .sticky-dl-btn { padding: 8px !important; }
        }
      `}</style>

      <AnimatePresence>
        {supportOpen && <SupportModal t={t} onClose={() => setSupportOpen(false)} />}
      </AnimatePresence>

      <AnimatePresence>
        {lightboxIdx !== null && (
          <ScreenshotLightbox screenshots={screenshots} idx={lightboxIdx} setIdx={setLightboxIdx} title={t.ss_title} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {promoOpen && <PromoPopup t={t} onClose={dismissPromo} />}
      </AnimatePresence>

      {/* ── STICKY DOWNLOAD BANNER ── */}
      <AnimatePresence>
        {pastHero && !stickyDismissed && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 340, damping: 32 }}
            className="sticky-dl-bar"
            style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 150, background: 'rgba(11,10,8,.96)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 16, padding: '10px 10px 10px 18px', display: 'flex', alignItems: 'center', gap: 12, backdropFilter: 'blur(28px)', boxShadow: '0 8px 48px rgba(0,0,0,.85)', maxWidth: 'calc(100vw - 32px)', whiteSpace: 'nowrap', overflow: 'hidden' }}>
            <img src="/logo.png" alt="" style={{ width: 26, height: 26, objectFit: 'contain', flexShrink: 0 }} />
            <span className="sticky-dl-tagline" style={{ fontSize: 13.5, fontWeight: 500, color: 'rgba(245,241,232,.65)' }}>Все мессенджеры в одном —</span>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: '#F5F1E8', flexShrink: 0 }}>Centrio</span>
            <a href={WIN_DOWNLOAD} className="btn-p sticky-dl-btn" style={{ fontSize: 13, padding: '8px 18px', borderRadius: 9, flexShrink: 0 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              <span className="sticky-dl-btn-text">Скачать бесплатно</span>
            </a>
            <button onClick={() => setStickyDismissed(true)} style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.08)', color: 'rgba(255,255,255,.4)', width: 30, height: 30, borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0, fontFamily: 'inherit' }}>×</button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="page">

        {/* ── NAV ── */}
        <nav className={`nav${scrolled ? ' sc' : ''}`}>
          <div className="wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 62 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
              <div className="win-dots" aria-hidden="true">
                <span style={{ background: '#ef4444' }} />
                <span style={{ background: '#f59e0b' }} />
                <span style={{ background: '#22c55e' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <img src="/logo.png" alt="Centrio" style={{ width: 26, height: 26, objectFit: 'contain' }} />
                <span style={{ fontFamily: 'var(--font-display), var(--font-geist)', fontWeight: 700, fontSize: 17, letterSpacing: '-.02em' }}>Centrio</span>
              </div>
            </div>
            <div className="navlinks" style={{ display: 'flex', gap: 28 }}>
              {([[t.nav_features,'#features'],[t.nav_messengers,'#messengers'],[t.nav_pricing,'#pricing'],[t.nav_download,'#download']] as [string,string][]).map(([l,h]) => (
                <a key={h} href={h} className="nlink">{l}</a>
              ))}
              <Link href="/blog" className="nlink">{t.nav_blog}</Link>
            </div>
            <div className="nav-right" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <LangSwitcher lang={lang} setLang={setLang} />
              <Link href="/auth/login" className="lk-link" style={{ fontSize: 13, fontWeight: 500, color: 'rgba(245,241,232,.42)', textDecoration: 'none', padding: '7px 13px', borderRadius: 8, border: '1px solid rgba(255,255,255,.07)', transition: 'all .2s', display: 'flex', alignItems: 'center', gap: 6 }}
                onMouseEnter={e => { e.currentTarget.style.color='#F5F1E8'; e.currentTarget.style.borderColor='rgba(255,255,255,.15)' }}
                onMouseLeave={e => { e.currentTarget.style.color='rgba(245,241,232,.42)'; e.currentTarget.style.borderColor='rgba(255,255,255,.07)' }}>
                <svg className="lk-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'none', flexShrink: 0 }}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                <span className="lk-text">{t.nav_dashboard}</span>
              </Link>
              <div className="nav-div" aria-hidden="true" />
              <a href="/download" className="btn-p dl-btn" style={{ fontSize: 13, padding: '8px 16px', borderRadius: 9 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                <span className="dl-text">{t.nav_dl_btn}</span>
              </a>
            </div>
          </div>
        </nav>

        {/* ── HERO ── */}
        <section style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', paddingTop: 62, position: 'relative', overflow: 'visible' }}>
          {/* Off-axis glow — lit from the upper-right, not dead-center */}
          <div style={{ position: 'absolute', top: -200, right: '10%', width: 640, height: 420, background: 'radial-gradient(ellipse, rgba(90,169,255,.09) 0%, transparent 68%)', filter: 'blur(70px)', pointerEvents: 'none' }} />

          <div className="wrap" style={{ width: '100%', padding: '80px 24px', overflow: 'visible' }}>
            <div className="hero-grid" style={{ display: 'grid', gridTemplateColumns: '1.08fr .92fr', gap: 44, alignItems: 'center' }}>

              {/* Left — text */}
              <div>
                <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .5, ease: [.22,1,.36,1] }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 100, padding: '4px 14px 4px 8px', fontSize: 12, fontWeight: 500, color: 'rgba(245,241,232,.55)', marginBottom: 28 }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#5AA9FF', display: 'inline-block' }} />
                    <span style={{ fontFamily: 'var(--font-geist)', fontWeight: 600, fontSize: 11.5 }}>v{VERSION}</span> · {t.hero_badge}
                  </div>
                </motion.div>

                <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .55, ease: [.22,1,.36,1], delay: .07 }}
                  style={{ fontFamily: 'var(--font-display), var(--font-geist)', fontSize: 'clamp(38px,4.8vw,68px)', fontWeight: 700, lineHeight: 1.04, letterSpacing: '-.03em', marginBottom: 22 }}>
                  {t.hero_h1a}<br />
                  <span className="gt">{t.hero_h1b}</span>
                </motion.h1>

                <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .5, ease: [.22,1,.36,1], delay: .14 }}
                  style={{ fontSize: 16, color: 'rgba(245,241,232,.45)', lineHeight: 1.8, marginBottom: 36, maxWidth: 440 }}>
                  {t.hero_sub}
                </motion.p>

                <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .5, ease: [.22,1,.36,1], delay: .2 }}
                  style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 48 }}>
                  <a href="/download" className="btn-p">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    {t.hero_cta}
                  </a>
                  <a href="#pricing" className="btn-s">{t.hero_cta2}</a>
                </motion.div>

                {/* Stats */}
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: .35, duration: .5 }}
                  style={{ display: 'flex', gap: 0 }}>
                  {[
                    { ref: c1.ref, val: c1.val, suf: '+', label: t.stat1l },
                    { ref: c2.ref, val: c2.val >= 1000 ? Math.floor(c2.val/1000) : c2.val, suf: c2.val >= 1000 ? 'K+' : '+', label: t.stat2l },
                    { ref: c3.ref, val: c3.val, suf: `.${VERSION.split('.')[2]}`, label: t.stat3l },
                  ].map((s, i) => (
                    <div key={i} style={{ paddingRight: 28, borderRight: i < 2 ? '1px solid rgba(255,255,255,.07)' : 'none', marginRight: i < 2 ? 28 : 0 }}>
                      <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-.04em', color: '#F5F1E8', lineHeight: 1 }}>
                        <span ref={s.ref}>{s.val}</span><span style={{ color: '#93C5FF' }}>{s.suf}</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'rgba(245,241,232,.28)', marginTop: 4, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.06em' }}>{s.label}</div>
                    </div>
                  ))}
                </motion.div>
              </div>

              {/* Right — 3D app mockup */}
              <motion.div
                className="mockup-col"
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: .7, ease: [.22,1,.36,1], delay: .15 }}
                style={{ position: 'relative', display: 'flex', justifyContent: 'flex-end', marginRight: '-6%' }}
              >
                {/* Glow behind mockup */}
                <div style={{ position: 'absolute', inset: -40, background: 'radial-gradient(ellipse 70% 60% at 55% 50%, rgba(90,169,255,.12) 0%, transparent 65%)', filter: 'blur(40px)', pointerEvents: 'none' }} />

                {/* Floating notification */}
                <motion.div
                  initial={{ opacity: 0, scale: .82, y: 12 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ delay: .9, type: 'spring', stiffness: 320, damping: 18 }}
                  style={{ position: 'absolute', top: -16, right: -10, zIndex: 20, background: 'rgba(11,10,8,.95)', border: '1px solid rgba(37,211,102,.25)', borderRadius: 14, padding: '10px 13px', width: 196, backdropFilter: 'blur(20px)', boxShadow: '0 16px 48px rgba(0,0,0,.7)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                    <div style={{ width: 24, height: 24, borderRadius: 7, background: 'linear-gradient(135deg,#25D366,#18a04c)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                      <img src="/messengers/whatsapp.png" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#F5F1E8' }}>WhatsApp</span>
                    <span style={{ marginLeft: 'auto', fontSize: 9, color: 'rgba(245,241,232,.28)' }}>сейчас</span>
                  </div>
                  <p style={{ fontSize: 10.5, color: 'rgba(245,241,232,.45)', lineHeight: 1.45 }}>Маша: Спасибо за помощь! 🙏</p>
                </motion.div>

                {/* Second notification */}
                <motion.div
                  initial={{ opacity: 0, scale: .82, y: -12 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ delay: 1.15, type: 'spring', stiffness: 320, damping: 18 }}
                  style={{ position: 'absolute', bottom: -10, right: -18, zIndex: 20, background: 'rgba(11,10,8,.95)', border: '1px solid rgba(88,101,242,.25)', borderRadius: 14, padding: '10px 13px', width: 188, backdropFilter: 'blur(20px)', boxShadow: '0 16px 48px rgba(0,0,0,.7)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                    <div style={{ width: 24, height: 24, borderRadius: 7, background: 'linear-gradient(135deg,#5865F2,#4752c4)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {MessengerSvgs.discord && <svg viewBox="0 0 24 24" fill="white" width="13" height="13"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-2.5.2.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-2.5.2.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 2.5.2 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 2.5.2.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-2.5.2.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.2.5.2 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.2.5.2 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.2.5.2.2.5.2a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-2.5.2.077.077 0 0 0-.041.107c.2.5.2 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-2.5.2.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>}
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#F5F1E8' }}>Discord</span>
                  </div>
                  <p style={{ fontSize: 10.5, color: 'rgba(245,241,232,.45)', lineHeight: 1.45 }}>Релиз v2.1 готов 🚀</p>
                </motion.div>

                {/* Second window peeking from behind — makes "every messenger,
                    one desktop" literal instead of just claiming it in copy */}
                <div style={{
                  position: 'absolute', top: 30, left: -28, width: '82%', height: 300,
                  background: '#0c0c14', border: '1px solid rgba(255,255,255,.08)', borderRadius: 14,
                  transform: 'rotate(-3deg) scale(.94)', zIndex: 5, opacity: .5,
                  boxShadow: '0 40px 100px rgba(0,0,0,.6)', overflow: 'hidden', pointerEvents: 'none',
                }}>
                  <div style={{ background: 'rgba(0,0,0,.5)', padding: '9px 14px', display: 'flex', gap: 5, borderBottom: '1px solid rgba(255,255,255,.05)' }}>
                    <img src="/logo.png" alt="" style={{ width: 13, height: 13, objectFit: 'contain', opacity: .55 }} />
                  </div>
                </div>

                {/* App window with float animation */}
                <div style={{ animation: 'float 7s ease-in-out infinite', position: 'relative', zIndex: 10, width: '100%' }}>
                  <AppMockup />
                </div>
              </motion.div>

            </div>
          </div>
        </section>

        <div className="div" />

        {/* ── MESSENGERS MARQUEE ── */}
        <section id="messengers" style={{ padding: '72px 0' }}>
          <Reveal>
            <div className="wrap" style={{ textAlign: 'center', marginBottom: 40 }}>
              <div className="label">{t.nav_messengers}</div>
              <h2 className="sh">{t.ms_title}</h2>
              <p className="sp" style={{ maxWidth: 440, margin: '12px auto 0' }}>{t.ms_sub}</p>
            </div>
          </Reveal>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="mq-wrap">
              <div className="mql">
                {[...messengers, ...messengers].map((m, i) => (
                  <div key={i} className="mc">
                    <div style={{ width: 56, height: 56, borderRadius: 15, background: m.color + '1a', border: `1px solid ${m.color}2e`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                      {m.img ? <img src={m.img} alt={m.name} style={{ width: 38, height: 38, objectFit: 'contain' }} /> : <span style={{ transform: 'scale(1.1)', display: 'flex' }}>{MessengerSvgs[m.svg!]}</span>}
                    </div>
                    <span style={{ fontSize: 11.5, fontWeight: 500, color: 'rgba(245,241,232,.4)', whiteSpace: 'nowrap' }}>{m.name}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="mq-wrap">
              <div className="mqr">
                {[...messengers.slice(7), ...messengers.slice(0,7), ...messengers.slice(7), ...messengers.slice(0,7)].map((m, i) => (
                  <div key={i} className="mc">
                    <div style={{ width: 56, height: 56, borderRadius: 15, background: m.color + '1a', border: `1px solid ${m.color}2e`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                      {m.img ? <img src={m.img} alt={m.name} style={{ width: 38, height: 38, objectFit: 'contain' }} /> : <span style={{ transform: 'scale(1.1)', display: 'flex' }}>{MessengerSvgs[m.svg!]}</span>}
                    </div>
                    <span style={{ fontSize: 11.5, fontWeight: 500, color: 'rgba(245,241,232,.4)', whiteSpace: 'nowrap' }}>{m.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <div className="div" />

        {/* ── SCREENSHOTS ── */}
        <section id="screenshots" style={{ padding: '96px 0' }}>
          <div className="wrap">
            <Reveal>
              <div style={{ textAlign: 'center', marginBottom: 40 }}>
                <div className="label">{t.ss_label}</div>
                <h2 className="sh">{t.ss_title}</h2>
                <p className="sp" style={{ maxWidth: 460, margin: '12px auto 0' }}>{t.ss_sub}</p>
              </div>
            </Reveal>
            <Reveal delay={0.08}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button type="button" aria-label="Назад" className="ss-nav" onClick={() => ssRef.current?.scrollBy({ left: -400, behavior: 'smooth' })}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                <div className="ss-scroll" ref={ssRef}>
                  <div className="ss-track">
                    {screenshots.map((src, i) => (
                      <div
                        key={src}
                        className="ss-frame"
                        role="button"
                        tabIndex={0}
                        aria-label={`${t.ss_title} ${i + 1} — ${t.ss_zoom_hint}`}
                        onClick={() => setLightboxIdx(i)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setLightboxIdx(i) } }}
                        style={{ cursor: 'zoom-in' }}
                      >
                        <img src={src} alt={`Centrio — ${t.ss_title} ${i + 1}`} loading="lazy" />
                      </div>
                    ))}
                  </div>
                </div>
                <button type="button" aria-label="Вперёд" className="ss-nav" onClick={() => ssRef.current?.scrollBy({ left: 400, behavior: 'smooth' })}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              </div>
            </Reveal>
          </div>
        </section>

        <div className="div" />

        {/* ── FEATURES ── */}
        <section id="features" style={{ padding: '96px 0' }}>
          <div className="wrap">
            <Reveal>
              <div style={{ maxWidth: 520, marginBottom: 52 }}>
                <div className="label">{t.nav_features}</div>
                <h2 className="sh">{t.feat_title} <span className="gt">{t.feat_title2}</span></h2>
                <p className="sp">{t.feat_sub}</p>
              </div>
            </Reveal>

            <div className="feat-grid">
              {features.map((f, i) => {
                const flagship = i === 0
                const highlight = i === 5
                const tier = flagship ? '-elevated' : highlight ? '-highlight' : ''
                return (
                  <Reveal key={i} delay={i * 0.06} y={16}>
                    <div className={`card${tier} feat-${i}`} style={{ padding: flagship ? '32px 28px' : '24px 22px', height: '100%', borderRadius: flagship ? 20 : 16, display: 'flex', flexDirection: 'column', justifyContent: flagship ? 'flex-end' : 'flex-start', position: 'relative', overflow: 'hidden' }}>
                      {flagship && (
                        <img src="/logo.png" alt="" style={{ position: 'absolute', top: 20, left: 20, width: 20, height: 20, objectFit: 'contain', opacity: .8, zIndex: 1 }} />
                      )}
                      {flagship && (
                        <div style={{ position: 'absolute', top: 18, right: 18, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, pointerEvents: 'none' }}>
                          {messengers.slice(0, 6).map((m, mi) => (
                            <div key={mi} style={{
                              width: 34, height: 34, borderRadius: 10,
                              background: `${m.color}14`, border: `1px solid ${m.color}26`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              opacity: .55, transform: `rotate(${(mi % 2 === 0 ? -1 : 1) * (4 + mi)}deg)`,
                            }}>
                              {(m as any).img
                                ? <img src={(m as any).img} alt="" style={{ width: 17, height: 17, objectFit: 'contain' }} />
                                : <span style={{ transform: 'scale(.5)', display: 'flex' }}>{MessengerSvgs[(m as any).svg]}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                      {highlight && (
                        <span style={{ position: 'absolute', top: 20, right: 20, fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#93C5FF', background: 'rgba(90,169,255,.12)', border: '1px solid rgba(90,169,255,.28)', borderRadius: 100, padding: '4px 9px' }}>Pro</span>
                      )}
                      <div style={{ width: flagship ? 48 : 40, height: flagship ? 48 : 40, borderRadius: flagship ? 13 : 11, background: (flagship || highlight) ? 'rgba(90,169,255,.1)' : 'rgba(255,255,255,.05)', border: (flagship || highlight) ? '1px solid rgba(90,169,255,.22)' : '1px solid rgba(255,255,255,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: flagship ? 22 : 16, position: 'relative', zIndex: 1 }}>
                        <FIcon name={f.icon} color={(flagship || highlight) ? '#5AA9FF' : undefined} />
                      </div>
                      <h3 style={{ fontSize: flagship ? 20 : 16, fontWeight: 650, color: '#F5F1E8', marginBottom: 8, letterSpacing: '-.02em', lineHeight: 1.3, position: 'relative', zIndex: 1 }}>{f.title}</h3>
                      <p style={{ fontSize: flagship ? 14.5 : 13.5, color: 'rgba(245,241,232,.4)', lineHeight: 1.65, maxWidth: flagship ? 360 : 'none', position: 'relative', zIndex: 1 }}>{f.desc}</p>
                    </div>
                  </Reveal>
                )
              })}
            </div>
          </div>
        </section>

        <div className="div" />

        {/* ── COMPARISON ── */}
        <section style={{ padding: '96px 0' }}>
          <div className="wrap">
            <Reveal>
              <div style={{ textAlign: 'center', marginBottom: 52 }}>
                <div className="label">{t.cmp_label}</div>
                <h2 className="sh">{t.cmp_title} <span className="gt">{t.cmp_title2}</span></h2>
                <p className="sp" style={{ maxWidth: 420, margin: '12px auto 0' }}>{t.cmp_sub}</p>
              </div>
            </Reveal>
            <Reveal delay={0.08}>
              <div style={{ overflowX: 'auto' }}>
                <div className="cmp-grid" style={{ minWidth: 560 }}>
                  {/* Header */}
                  <div className="cmp-header" style={{ color: 'rgba(245,241,232,.3)' }}>{t.cmp_col_feature}</div>
                  <div className="cmp-header cmp-centrio cmp-centrio-top" style={{ color: '#C9E4FF', textAlign: 'center' }}>
                    Centrio
                    <span style={{ marginLeft: 6, fontSize: 10, background: 'rgba(47,111,237,.3)', border: '1px solid rgba(47,111,237,.4)', borderRadius: 100, padding: '2px 7px', verticalAlign: 'middle' }}>★ {t.cmp_badge}</span>
                  </div>
                  {['Rambox', 'Franz', 'Wavebox'].map(n => (
                    <div key={n} className="cmp-header cmp-hide" style={{ color: 'rgba(245,241,232,.3)', textAlign: 'center' }}>{n}</div>
                  ))}

                  {/* Rows */}
                  {(() => {
                    type CmpRow = {
                      label: string
                      centrio?: string | boolean; rambox?: string | boolean; franz?: string | boolean; wavebox?: string | boolean
                      ram?: { centrio: number; rambox: number; franz: number; wavebox: number }
                    }
                    const rows: CmpRow[] = [
                      { label: t.cmp_row_price, centrio: t.cmp_free, rambox: `$7+${t.cmp_mo}`, franz: t.cmp_free_star, wavebox: `$15.99${t.cmp_mo}` },
                      { label: t.cmp_row_ram,   ram: { centrio: 200, rambox: 500, franz: 400, wavebox: 600 } },
                      { label: t.cmp_row_ru,    centrio: true, rambox: false, franz: false, wavebox: false },
                      { label: t.cmp_row_lang,  centrio: true, rambox: false, franz: false, wavebox: false },
                      { label: t.cmp_row_free,  centrio: true, rambox: false, franz: false, wavebox: false },
                      { label: t.cmp_row_theme, centrio: true, rambox: true,  franz: false, wavebox: true },
                    ]
                    return rows.map((row, ri, arr) => {
                    const isLast = ri === arr.length - 1
                    const renderVal = (v: boolean | string, isCentrio = false) => {
                      if (typeof v === 'boolean') return v
                        ? <span style={{ color: '#7DD3C0', fontSize: 14, fontWeight: 700 }}>✓</span>
                        : <span style={{ color: 'rgba(245,241,232,.2)', fontSize: 14 }}>✗</span>
                      return <span style={{ color: isCentrio ? '#F5F1E8' : 'rgba(245,241,232,.35)', fontWeight: isCentrio ? 600 : 400 }}>{v}</span>
                    }
                    const renderRam = (mb: number, isCentrio: boolean) => {
                      const maxMb = 600
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                          <span style={{ fontSize: 11.5, fontWeight: isCentrio ? 700 : 500, color: isCentrio ? '#C9E4FF' : 'rgba(245,241,232,.4)' }}>~{mb} MB</span>
                          <div style={{ width: '70%', height: 4, borderRadius: 2, background: 'rgba(255,255,255,.06)', overflow: 'hidden' }}>
                            <div style={{ width: `${(mb / maxMb) * 100}%`, height: '100%', borderRadius: 2, background: isCentrio ? '#5AA9FF' : 'rgba(245,241,232,.22)' }} />
                          </div>
                        </div>
                      )
                    }
                    return (
                      <React.Fragment key={ri}>
                        <div className="cmp-cell" style={{ color: 'rgba(245,241,232,.5)', fontSize: 12.5 }}>{row.label}</div>
                        <div className={`cmp-cell cmp-centrio${isLast ? ' cmp-centrio-bot' : ''}`} style={{ textAlign: 'center' }}>
                          {row.ram ? renderRam(row.ram.centrio, true) : renderVal(row.centrio!, true)}
                        </div>
                        <div className="cmp-cell cmp-hide" style={{ textAlign: 'center' }}>{row.ram ? renderRam(row.ram.rambox, false) : renderVal(row.rambox!)}</div>
                        <div className="cmp-cell cmp-hide" style={{ textAlign: 'center' }}>{row.ram ? renderRam(row.ram.franz, false) : renderVal(row.franz!)}</div>
                        <div className="cmp-cell cmp-hide" style={{ textAlign: 'center' }}>{row.ram ? renderRam(row.ram.wavebox, false) : renderVal(row.wavebox!)}</div>
                      </React.Fragment>
                    )
                  })
                  })()}
                </div>
                <p style={{ fontSize: 11, color: 'rgba(245,241,232,.18)', marginTop: 10, textAlign: 'center' }}>{t.cmp_footnote}</p>
              </div>
            </Reveal>
          </div>
        </section>

        <div className="div" />

        {/* ── PLATFORM ── */}
        <section id="download" style={{ padding: '96px 0' }}>
          <div className="wrap">
            <Reveal>
              <div style={{ textAlign: 'center', marginBottom: 48 }}>
                <div className="label">{t.nav_download}</div>
                <h2 className="sh">{t.dl_platforms_title} <span className="gt">{t.dl_platforms_title2}</span></h2>
                <p className="sp" style={{ maxWidth: 420, margin: '12px auto 0' }}>{t.dl_platforms_sub}</p>
              </div>
            </Reveal>

            <div className="pl-wrap" style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              {([
                { key: 'windows' as const, label: 'Windows', href: '/download/windows', sub: 'Windows 10/11' },
                { key: 'macos'   as const, label: 'macOS',   href: '/download/macos',   sub: 'macOS 12+' },
                { key: 'linux'   as const, label: 'Linux',   href: '/download/linux',   sub: '.deb / AppImage' },
              ]).map((p, i) => (
                <Reveal key={p.key} delay={i * 0.07}>
                  <Link href={p.href} className="osc">
                    <div style={{ color: 'rgba(245,241,232,.4)', transition: 'color .25s' }}>{OsIcons[p.key]}</div>
                    <span style={{ fontSize: 15, fontWeight: 650, letterSpacing: '-.02em' }}>{p.label}</span>
                    <span style={{ fontSize: 12, color: 'rgba(245,241,232,.28)' }}>{p.sub}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(34,197,94,.06)', border: '1px solid rgba(34,197,94,.15)', borderRadius: 100, padding: '3px 10px', marginTop: 2 }}>
                      <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#22c55e' }} />
                      <span style={{ fontSize: 10.5, fontWeight: 600, color: 'rgba(34,197,94,.75)' }}>{t.dl_hero_stable}</span>
                    </div>
                  </Link>
                </Reveal>
              ))}
            </div>

            <Reveal delay={0.2}>
              <div style={{ textAlign: 'center', marginTop: 32 }}>
                <a href={WIN_DOWNLOAD} className="btn-p" style={{ fontSize: 14.5, padding: '13px 32px' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  {t.hero_cta} — Windows {VERSION}
                </a>
                <p style={{ marginTop: 10, fontSize: 12, color: 'rgba(245,241,232,.2)' }}>{t.dl_sub}</p>
              </div>
            </Reveal>
          </div>
        </section>

        <div className="div" />

        {/* ── ALL CAPABILITIES ── */}
        <section id="capabilities" style={{ padding: '96px 0', position: 'relative' }}>
          <div style={{ position: 'absolute', top: '10%', left: '50%', transform: 'translateX(-50%)', width: 900, height: 420, background: 'radial-gradient(ellipse, rgba(47,111,237,.06) 0%, transparent 70%)', filter: 'blur(80px)', pointerEvents: 'none' }} />
          <div className="wrap" style={{ position: 'relative' }}>
            <Reveal>
              <div style={{ textAlign: 'center', marginBottom: 52 }}>
                <div className="label">{t.cap_label}</div>
                <h2 className="sh">{t.cap_title} <span className="gt">{t.cap_title2}</span></h2>
                <p className="sp" style={{ maxWidth: 440, margin: '12px auto 0' }}>{t.cap_sub}</p>
              </div>
            </Reveal>

            <div className="cap-grid">
              {capabilities.map((cItem, i) => (
                <Reveal key={i} delay={i * 0.045} y={14}>
                  <div className="card cap-card">
                    <div className="cap-card-icon">
                      <FIcon name={cItem.icon} color="#5AA9FF" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <h3 style={{ fontSize: 14.5, fontWeight: 650, color: '#F5F1E8', letterSpacing: '-.01em' }}>{cItem.title}</h3>
                        {cItem.tier === 'pro' && (
                          <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.04em', color: '#C9E4FF', background: 'rgba(47,111,237,.16)', border: '1px solid rgba(47,111,237,.3)', borderRadius: 100, padding: '1.5px 7px', flexShrink: 0 }}>PRO</span>
                        )}
                      </div>
                      <p style={{ fontSize: 12.5, color: 'rgba(245,241,232,.35)', lineHeight: 1.55 }}>{cItem.desc}</p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <div className="div" />

        {/* ── PRICING ── */}
        <section id="pricing" style={{ padding: '96px 0', position: 'relative' }}>
          <div style={{ position: 'absolute', top: '20%', left: '50%', transform: 'translateX(-50%)', width: 700, height: 400, background: 'radial-gradient(ellipse, rgba(47,111,237,.08) 0%, transparent 70%)', filter: 'blur(70px)', pointerEvents: 'none' }} />
          <div className="wrap" style={{ position: 'relative' }}>
            <Reveal>
              <div style={{ textAlign: 'center', marginBottom: 52 }}>
                <div className="label">{t.nav_pricing}</div>
                <h2 className="sh">{t.pr_title}</h2>
                <p className="sp" style={{ maxWidth: 420, margin: '12px auto 0' }}>{t.pr_sub}</p>
              </div>
            </Reveal>
            <GlassPricingSection
              title={null} subtitle={null} showAnimatedBackground={false}
              plans={[
                { planName: t.plan_free,  description: t.plan_free_sub,  price: '0 ₽',   features: t.feat_items_free as unknown as string[], disabledFeatures: t.feat_items_no as unknown as string[], buttonText: t.plan_free_btn,  buttonHref: '/download',   buttonVariant: 'secondary' },
                { planName: t.plan_month, description: t.plan_month_sub, price: '199 ₽', period: '/мес', features: t.feat_items_pro as unknown as string[], disabledFeatures: t.feat_items_pro_no as unknown as string[], buttonText: t.plan_month_btn, buttonHref: '/dashboard',  buttonVariant: 'secondary' },
                { planName: t.plan_year,  description: t.plan_year_badge, price: '133 ₽', period: '/мес', savingsBadge: t.plan_year_save, features: t.feat_items_pro_year as unknown as string[], buttonText: t.plan_year_btn, buttonHref: '/dashboard', isPopular: true, buttonVariant: 'primary' },
              ]}
            />
          </div>
        </section>

        <div className="div" />

        {/* ── CTA ── */}
        <section style={{ padding: '96px 0' }}>
          <div className="wrap">
            <Reveal>
              <div style={{ background: 'rgba(47,111,237,.06)', border: '1px solid rgba(47,111,237,.2)', borderRadius: 28, padding: '56px 48px', textAlign: 'center', position: 'relative', overflow: 'hidden', boxShadow: '0 40px 100px rgba(0,0,0,.5), 0 0 0 1px rgba(47,111,237,.06)' }}>
                <div style={{ position: 'absolute', top: -60, left: '50%', transform: 'translateX(-50%)', width: 600, height: 300, background: 'radial-gradient(ellipse, rgba(90,169,255,.12) 0%, transparent 65%)', filter: 'blur(50px)', pointerEvents: 'none' }} />
                <div style={{ position: 'relative', zIndex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 20 }}>
                    <img src="/logo.png" alt="Centrio" style={{ width: 38, height: 38, objectFit: 'contain' }} />
                    <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.03em' }}>Centrio</span>
                  </div>
                  <h2 style={{ fontSize: 'clamp(28px,4vw,52px)', fontWeight: 800, letterSpacing: '-.04em', lineHeight: 1.1, marginBottom: 16, color: '#F5F1E8' }}>{t.dl_title}</h2>
                  <p style={{ fontSize: 15.5, color: 'rgba(245,241,232,.4)', lineHeight: 1.8, marginBottom: 36, maxWidth: 440, margin: '0 auto 36px' }}>{t.dl_sub}</p>
                  <div className="dl-wrap" style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                    <a href={WIN_DOWNLOAD} className="btn-p" style={{ fontSize: 14.5, padding: '13px 30px' }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                      {t.hero_cta}
                    </a>
                    <a href="#pricing" className="btn-s" style={{ fontSize: 14.5, padding: '13px 30px' }}>{t.hero_cta2}</a>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── FOOTER ── */}
        <footer style={{ borderTop: '1px solid rgba(255,255,255,.06)' }}>
          <div className="wrap" style={{ padding: '52px 24px 36px' }}>
            <div className="ftcols" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 44, marginBottom: 44 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <img src="/logo.png" alt="Centrio" style={{ width: 24, height: 24, objectFit: 'contain' }} />
                  <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: '-.02em' }}>Centrio</span>
                </div>
                <p style={{ fontSize: 13, color: 'rgba(245,241,232,.28)', lineHeight: 1.8, maxWidth: 240, marginBottom: 20 }}>Все мессенджеры в одном приложении. Бесплатно для Windows, macOS и Linux.</p>
                {/* Fixed 2026-08-13: was pointing at t.me/centrio_app — a
                    different, noindex/nofollow, empty-bio Telegram handle
                    (confirmed via live curl: og:description empty, no
                    subscriber count, robots noindex). The real public
                    channel (used by lib/telegram-bot.js NEWS_CHAT_ID and the
                    admin news-post tab) is @centrioapp — confirmed live via
                    curl: real bio "Официальная поддержка Centrio...".
                    Same bug class as the /register referral-link mismatch
                    fixed the same day: a link elsewhere in the codebase
                    pointing at the wrong target. */}
                <a href="https://t.me/centrioapp" target="_blank" rel="noopener" style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(245,241,232,.32)', textDecoration: 'none', transition: 'all .2s' }}
                  onMouseEnter={e => { e.currentTarget.style.color='#F5F1E8'; e.currentTarget.style.borderColor='rgba(255,255,255,.15)' }}
                  onMouseLeave={e => { e.currentTarget.style.color='rgba(245,241,232,.32)'; e.currentTarget.style.borderColor='rgba(255,255,255,.07)' }}>
                  <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248l-2.04 9.607c-.145.658-.537.818-2.5.2l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 2.5.2.903.614z"/></svg>
                </a>
              </div>
              <div>
                <span className="flh">Продукт</span>
                <a href="#features" className="fl">{t.nav_features}</a>
                <a href="#messengers" className="fl">{t.nav_messengers}</a>
                <a href="#pricing" className="fl">{t.nav_pricing}</a>
                <Link href="/download/windows" className="fl">Windows</Link>
                <Link href="/download/macos" className="fl">macOS</Link>
                <Link href="/download/linux" className="fl">Linux</Link>
              </div>
              <div>
                <span className="flh">Ресурсы</span>
                <Link href="/blog" className="fl">{t.nav_blog}</Link>
                <Link href="/faq" className="fl">{t.footer_faq}</Link>
                <Link href="/blog/top-apps" className="fl">Топ приложений</Link>
                {COMPARE_LINKS.map(c => (
                  <Link key={c.href} href={c.href} className="fl">{c.label}</Link>
                ))}
              </div>
              <div>
                <span className="flh">Поддержка</span>
                <Link href="/dashboard" className="fl">{t.nav_dashboard}</Link>
                <button onClick={() => setSupportOpen(true)} className="fl" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left', fontFamily: 'inherit', display: 'block', marginBottom: 8 }}>{t.footer_support}</button>
                <Link href="/privacy" className="fl">{t.footer_privacy}</Link>
                <Link href="/terms" className="fl">{t.footer_terms}</Link>
                <Link href="/refund" className="fl">{t.ft_refund}</Link>
              </div>
            </div>
            <div className="div" style={{ marginBottom: 20 }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <p style={{ fontSize: 12, color: 'rgba(245,241,232,.18)' }}>© 2026 Centrio. Все права защищены.</p>
              <p style={{ fontSize: 12, color: 'rgba(245,241,232,.12)' }}>v{VERSION}</p>
            </div>
          </div>
        </footer>

      </div>
    </>
  )
}
