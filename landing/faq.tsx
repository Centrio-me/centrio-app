'use client';

import Link from 'next/link';
import { useState } from 'react';
import { SiteNav, SiteFooter } from '@/components/ui/site-shell';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://api.centrio.me';

const faqs = [
  { q: 'Как установить Centrio на Windows?', a: 'Скачайте установщик Centrio Setup.exe со страницы загрузки, запустите его и следуйте инструкциям. Установка занимает около 1 минуты. Если Windows SmartScreen показывает предупреждение — нажмите «Подробнее» → «Запустить в любом случае»: файл безопасен.' },
  { q: 'Какие мессенджеры поддерживает Centrio?', a: 'Centrio поддерживает более 100 сервисов: Telegram, WhatsApp, Discord, VK, Slack, Microsoft Teams, Zoom, Skype, Viber, Signal, Instagram DM, Gmail, Notion, Trello и многие другие. Список постоянно пополняется.' },
  { q: 'Что такое Centrio Pro и сколько стоит?', a: 'Centrio Pro — расширенная подписка. Стоимость: 199 ₽/месяц или 1 490 ₽/год (экономия 37%). Pro включает: неограниченное число сервисов, облачную синхронизацию, темы, папки, прокси и приоритетную поддержку.' },
  { q: 'Как отменить подписку Pro?', a: 'Отменить можно в любой момент: Centrio → Настройки → Аккаунт → Управление подпиской → Отменить. Доступ к Pro сохраняется до конца оплаченного периода. Возврат средств — в течение 7 дней.' },
  { q: 'Есть ли мобильная версия?', a: 'Мобильная версия в разработке. Планируется выпуск для iOS и Android. Следите за обновлениями!' },
  { q: 'Что такое облачная синхронизация?', a: 'Облачная синхронизация (Pro) сохраняет ваши настройки в зашифрованном облаке. При установке на новом устройстве всё восстановится автоматически после входа в аккаунт.' },
  { q: 'Поддерживает ли Centrio прокси?', a: 'Да. В настройках каждого сервиса можно задать индивидуальный прокси (HTTP, HTTPS, SOCKS4, SOCKS5), а также глобальный для всего приложения.' },
  { q: 'Каковы системные требования?', a: 'Windows 10/11, 64-bit, от 200 МБ RAM, 150 МБ места на диске. Centrio основан на Electron и работает как нативное приложение.' },
  { q: 'Обновляется ли Centrio автоматически?', a: 'Да. Centrio проверяет обновления при каждом запуске и устанавливает их в фоне. Обновление применится при следующем перезапуске.' },
  { q: 'Насколько безопасен Centrio?', a: 'Centrio работает как контейнер для веб-версий мессенджеров — как браузер. Мы не имеем доступа к переписке. Сеансы хранятся локально, данные третьим лицам не передаются.' },
  { q: 'Можно ли подключить несколько аккаунтов?', a: 'Да! Например, два Telegram — личный и рабочий. В бесплатной версии до 3 сервисов, в Pro — без ограничений.' },
  { q: 'Почему Centrio лучше браузера?', a: 'Нативные уведомления Windows, работа в фоне, горячие клавиши, папки для группировки, меньше ресурсов чем десятки вкладок, постоянный вход в каждый сервис.' },
  { q: 'Как настроить уведомления?', a: 'Клик по иконке сервиса → ⚙ Настройки — там можно включить/отключить звук, всплывающие оповещения и бейджи. В глобальных настройках есть режим «Не беспокоить».' },
  { q: 'Как связаться с поддержкой?', a: 'Email: support@centrio.me · Telegram: @centrioapp. Время ответа: до 24 ч для бесплатных пользователей, до 4 ч для Pro.' },
];

// FAQPage structured data, generated straight from the `faqs` array above so
// it can never drift out of sync with what's actually rendered on the page.
// Added 2026-08-13 — every blog post that has a FAQ section already emits
// this (see blog-telegram-vpn-block.tsx), but /faq itself — the single page
// most likely to earn a rich "People also ask" snippet — never did.
const BREADCRUMB_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Главная', item: 'https://centrio.me/' },
    { '@type': 'ListItem', position: 2, name: 'FAQ', item: 'https://centrio.me/faq' },
  ],
};

const FAQ_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map((f) => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
};

function AccordionItem({ q, a, index }: { q: string; a: string; index: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: index < faqs.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
      <button
        onClick={() => setOpen(!open)}
        className="faq-accordion-btn"
        style={{ width: '100%', background: 'none', border: 'none', color: '#fff', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', fontSize: 15, fontWeight: 600, gap: 16, lineHeight: 1.4, transition: 'color .2s' }}
      >
        <span style={{ color: open ? '#c084fc' : '#fff' }}>{q}</span>
        <div style={{ width: 26, height: 26, borderRadius: '50%', background: open ? 'rgba(168,85,247,0.2)' : 'rgba(255,255,255,0.06)', border: '1px solid ' + (open ? 'rgba(168,85,247,0.4)' : 'rgba(255,255,255,0.1)'), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all .2s' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={open ? '#c084fc' : 'rgba(255,255,255,0.5)'} strokeWidth="2.5" style={{ transition: 'transform .25s', transform: open ? 'rotate(45deg)' : 'none' }}>
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </div>
      </button>
      {open && (
        <div className="faq-accordion-body" style={{ padding: '0 28px 22px', color: 'rgba(255,255,255,0.55)', lineHeight: 1.75, fontSize: 14.5 }}>
          {a}
        </div>
      )}
    </div>
  );
}

export default function FAQPage() {
  const [supportOpen, setSupportOpen] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', question: '' });
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError('');
    try {
      const res = await fetch(`${API}/api/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Не удалось отправить сообщение');
      }
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось отправить сообщение, попробуйте позже');
    } finally {
      setSending(false);
    }
  };

  const inp: React.CSSProperties = { width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '11px 14px', color: '#fff', fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' };

  return (
    <div style={{ minHeight: '100vh', background: '#06060f', color: '#e2e2e2', fontFamily: "'Inter', -apple-system, sans-serif", overflowX: 'hidden' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSONLD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB_JSONLD) }} />
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes pulse-glow { 0%,100%{opacity:.18} 50%{opacity:.38} }
        .glow-orb { position:absolute; border-radius:50%; filter:blur(120px); animation:pulse-glow 7s ease-in-out infinite; pointer-events:none; }
        .faq-accordion-btn { padding: 20px 28px; }
        @media (max-width: 560px) {
          .faq-accordion-btn { padding: 16px 18px !important; font-size: 14px !important; }
          .faq-accordion-body { padding: 0 18px 18px !important; }
        }
      `}</style>

      <SiteNav active="/faq" />

      <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
        <div className="glow-orb" style={{ width: 550, height: 550, background: '#7c3aed', opacity: .12, top: -180, left: -120 }} />
        <div className="glow-orb" style={{ width: 400, height: 400, background: '#a855f7', opacity: .07, bottom: 100, right: -100, animationDelay: '3.5s' }} />
      </div>

      {/* Hero */}
      <section style={{ position: 'relative', maxWidth: 860, margin: '0 auto', padding: '80px 24px 56px', textAlign: 'center', paddingTop: 66 }}>
        <div style={{ paddingTop: 24 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.22)', borderRadius: 50, padding: '6px 18px', fontSize: 13, fontWeight: 500, color: '#c084fc', marginBottom: 22 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            {faqs.length} вопросов и ответов
          </div>
          <h1 style={{ fontSize: 'clamp(32px,5vw,54px)', fontWeight: 900, letterSpacing: '-.03em', lineHeight: 1.1, marginBottom: 18, color: '#fff' }}>
            Часто задаваемые{' '}
            <span style={{ background: 'linear-gradient(135deg,#c084fc,#a855f7,#38bdf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>вопросы</span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 17, lineHeight: 1.75, maxWidth: 500, margin: '0 auto' }}>
            Всё о Centrio — установка, функции, подписка и безопасность.
          </p>
        </div>
      </section>

      {/* FAQ Accordion */}
      <section style={{ position: 'relative', maxWidth: 860, margin: '0 auto 72px', padding: '0 24px' }}>
        <div style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 22, overflow: 'hidden', backdropFilter: 'blur(8px)' }}>
          {faqs.map((item, i) => (
            <AccordionItem key={i} q={item.q} a={item.a} index={i} />
          ))}
        </div>
      </section>

      {/* Support CTA */}
      <section style={{ maxWidth: 860, margin: '0 auto 80px', padding: '0 24px', textAlign: 'center' }}>
        <div style={{ background: 'linear-gradient(135deg, rgba(109,40,217,0.1) 0%, rgba(168,85,247,0.07) 100%)', border: '1px solid rgba(168,85,247,0.2)', borderRadius: 22, padding: '52px 32px', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 0%, rgba(168,85,247,0.1), transparent 60%)', pointerEvents: 'none' }} />
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="1.6" style={{ marginBottom: 18 }}>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <h2 style={{ fontSize: 26, fontWeight: 800, marginBottom: 12, color: '#fff', letterSpacing: '-.02em' }}>Всё ещё есть вопросы?</h2>
          <p style={{ color: 'rgba(255,255,255,0.45)', marginBottom: 30, fontSize: 15, lineHeight: 1.7, maxWidth: 400, margin: '0 auto 30px' }}>
            Наша команда поддержки ответит в течение 24 часов. Pro-подписчики — приоритет.
          </p>
          <button
            onClick={() => setSupportOpen(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 9, background: 'linear-gradient(135deg,#7c3aed,#a855f7)', color: '#fff', border: 'none', borderRadius: 12, padding: '14px 32px', fontSize: 15, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 24px rgba(168,85,247,0.4)', transition: 'all .22s' }}
            onMouseEnter={e => { e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='0 8px 36px rgba(168,85,247,0.55)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow='0 4px 24px rgba(168,85,247,0.4)'; }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            Написать в поддержку
          </button>
        </div>
      </section>

      <SiteFooter />

      {/* Support Modal */}
      {supportOpen && (
        <div onClick={() => setSupportOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} />
          <div onClick={e => e.stopPropagation()} style={{ position: 'relative', zIndex: 1, background: '#070d1f', border: '1px solid rgba(168,85,247,0.25)', borderRadius: 20, padding: '36px 32px', width: '100%', maxWidth: 460, boxShadow: '0 24px 80px rgba(0,0,0,0.8)' }}>
            <button onClick={() => setSupportOpen(false)} style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,0.06)', border: 'none', color: 'rgba(255,255,255,0.5)', width: 32, height: 32, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>×</button>
            {sent ? (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <p style={{ color: '#fff', fontSize: 17, fontWeight: 700, marginBottom: 8 }}>Сообщение отправлено!</p>
                <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 14, marginBottom: 24 }}>Ответим на <strong style={{ color: 'rgba(255,255,255,0.7)' }}>{form.email}</strong> в течение 24 часов.</p>
                <button onClick={() => { setSupportOpen(false); setSent(false); setForm({ name: '', email: '', question: '' }); }} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', borderRadius: 10, padding: '10px 24px', cursor: 'pointer', fontSize: 14 }}>Закрыть</button>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <h3 style={{ color: '#fff', fontSize: 20, fontWeight: 700, marginBottom: 24 }}>Написать в поддержку</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <input style={inp} placeholder="Ваше имя" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
                  <input style={inp} type="email" placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
                  <textarea style={{ ...inp, resize: 'vertical', minHeight: 100 }} placeholder="Ваш вопрос или проблема..." value={form.question} onChange={e => setForm({ ...form, question: e.target.value })} required />
                </div>
                {error && (
                  <p style={{ color: '#f87171', fontSize: 13.5, marginTop: 14, lineHeight: 1.5 }}>{error}</p>
                )}
                <button type="submit" disabled={sending} style={{ marginTop: 20, width: '100%', background: 'linear-gradient(135deg,#7c3aed,#a855f7)', color: '#fff', border: 'none', borderRadius: 12, padding: '13px', fontWeight: 700, fontSize: 15, cursor: 'pointer', opacity: sending ? 0.7 : 1 }}>
                  {sending ? 'Отправка...' : 'Отправить'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
