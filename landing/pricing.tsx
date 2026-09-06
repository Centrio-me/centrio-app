'use client'

import { useState } from 'react'
import Link from 'next/link'
import { SiteNav, SiteFooter } from '@/components/ui/site-shell'
import { CHANGELOG } from './changelog-data'

const BREADCRUMB_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Главная', item: 'https://centrio.me/' },
    { '@type': 'ListItem', position: 2, name: 'Тарифы', item: 'https://centrio.me/pricing' },
  ],
}

export default function PricingPage() {
  const [annual, setAnnual] = useState(true)

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB_JSONLD) }} />
      <style>{`
        :root { color-scheme: dark; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #06060f; color: #e2e2e2; font-family: 'Inter', -apple-system, sans-serif; overflow-x: hidden; }
        .container { max-width: 1100px; margin: 0 auto; padding: 0 28px; }
        .gradient-text { background: linear-gradient(135deg, #f0abfc 0%, #a855f7 40%, #38bdf8 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
        @keyframes pulse-glow { 0%,100% { opacity:.3; } 50% { opacity:.65; } }
        .hero-glow { position:absolute; border-radius:50%; filter:blur(130px); animation:pulse-glow 5s ease-in-out infinite; pointer-events:none; }

        .plan-card {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 20px; padding: 36px 32px;
          transition: all .3s; flex: 1; position: relative;
        }
        .plan-card.featured {
          background: rgba(168,85,247,0.08);
          border-color: rgba(168,85,247,0.4);
          box-shadow: 0 0 60px rgba(168,85,247,0.12);
        }
        .plan-card.featured:hover {
          box-shadow: 0 0 80px rgba(168,85,247,0.2);
          border-color: rgba(168,85,247,0.6);
        }

        .check-row { display:flex; align-items:flex-start; gap:12px; }
        .check-icon { width:20px; height:20px; border-radius:50%; flex-shrink:0; margin-top:1px; display:flex; align-items:center; justify-content:center; }
        .check-icon.ok { background:rgba(34,197,94,0.12); border:1px solid rgba(34,197,94,0.3); }
        .check-icon.no { background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); }

        .btn-buy {
          display:block; width:100%; text-align:center; font-weight:700; font-size:15px;
          padding:14px; border-radius:12px; cursor:pointer; text-decoration:none;
          transition:all .22s; border:none;
        }
        .btn-buy.primary { background:linear-gradient(135deg,#8b5cf6,#a855f7); color:#fff; box-shadow:0 4px 28px rgba(168,85,247,.4); }
        .btn-buy.primary:hover { transform:translateY(-2px); box-shadow:0 8px 40px rgba(168,85,247,.6); }
        .btn-buy.ghost { background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.14); color:#e2e2e2; }
        .btn-buy.ghost:hover { background:rgba(255,255,255,0.1); transform:translateY(-2px); }

        .toggle-wrap { display:inline-flex; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); border-radius:50px; padding:4px; gap:4px; }
        .toggle-btn { padding:8px 22px; border-radius:50px; font-size:14px; font-weight:500; cursor:pointer; transition:all .2s; border:none; }
        .toggle-btn.active { background:rgba(168,85,247,0.25); color:#c084fc; border:1px solid rgba(168,85,247,0.4); }
        .toggle-btn.inactive { background:transparent; color:rgba(255,255,255,0.4); }

        .faq-item { border-bottom:1px solid rgba(255,255,255,0.07); padding:20px 0; }
        .faq-q { font-size:16px; font-weight:600; color:#fff; cursor:pointer; display:flex; justify-content:space-between; align-items:center; gap:12px; }
        .faq-a { font-size:14px; color:rgba(255,255,255,0.5); line-height:1.75; margin-top:12px; }

        .changelog-wrap { max-height:520px; overflow-y:auto; border:1px solid rgba(255,255,255,0.08); border-radius:16px; background:rgba(255,255,255,0.02); padding:8px 24px; }
        .changelog-entry { padding:18px 0; border-bottom:1px solid rgba(255,255,255,0.06); }
        .changelog-entry:last-child { border-bottom:none; }
        .changelog-version { font-size:14px; font-weight:700; color:#a855f7; margin-bottom:8px; }
        .changelog-note { font-size:13.5px; color:rgba(255,255,255,0.55); line-height:1.65; margin:6px 0 0; padding-left:16px; position:relative; }
        .changelog-note::before { content:'—'; position:absolute; left:0; color:rgba(255,255,255,0.25); }

        .compare-row { display:grid; grid-template-columns: 1fr 1fr 1fr; gap:0; border-bottom:1px solid rgba(255,255,255,0.06); }
        .compare-cell { padding:14px 16px; font-size:14px; }
        .compare-row:nth-child(odd) .compare-cell { background:rgba(255,255,255,0.02); }

        @media (max-width: 768px) {
          .container { padding: 0 18px; }
          .plan-card { padding: 28px 22px; }
          .compare-cell { padding: 12px 8px; font-size: 12.5px; }
          .changelog-wrap { padding: 8px 16px; max-height: 420px; }
        }
        @media (max-width: 480px) {
          .compare-cell { padding: 10px 6px; font-size: 11.5px; }
          .toggle-btn { padding: 8px 14px; font-size: 13px; }
        }
      `}</style>

      <SiteNav active="/pricing" />

      {/* HERO */}
      <section style={{position:'relative',padding:'140px 0 80px',textAlign:'center',overflow:'hidden',paddingTop:66+74}}>
        <div className="hero-glow" style={{width:600,height:600,background:'#8b5cf6',opacity:.09,top:-100,left:'50%',transform:'translateX(-50%)'}} />
        <div style={{position:'absolute',inset:0,backgroundImage:'radial-gradient(rgba(168,85,247,0.06) 1px, transparent 1px)',backgroundSize:'44px 44px',opacity:.7,pointerEvents:'none'}} />
        <div className="container" style={{position:'relative',zIndex:2}}>
          <div style={{display:'inline-flex',alignItems:'center',gap:8,background:'rgba(168,85,247,0.1)',border:'1px solid rgba(168,85,247,0.25)',borderRadius:50,padding:'7px 18px',fontSize:13,fontWeight:500,color:'#c084fc',marginBottom:24}}>
            ✨ Centrio Pro — расширенные возможности
          </div>
          <h1 style={{fontSize:'clamp(38px,5vw,62px)',fontWeight:900,color:'#fff',letterSpacing:'-.03em',lineHeight:1.1,marginBottom:16}}>
            Выбери свой план
          </h1>
          <p style={{fontSize:18,color:'rgba(255,255,255,0.45)',maxWidth:500,margin:'0 auto 40px',lineHeight:1.75}}>
            Базовые функции бесплатны навсегда. Pro открывает всё без ограничений.
          </p>

          {/* Toggle */}
          <div className="toggle-wrap">
            <button className={`toggle-btn ${annual ? 'inactive' : 'active'}`} onClick={() => setAnnual(false)}>Месяц</button>
            <button className={`toggle-btn ${annual ? 'active' : 'inactive'}`} onClick={() => setAnnual(true)}>
              Год
              <span style={{marginLeft:8,fontSize:11,background:'rgba(34,197,94,0.2)',color:'#4ade80',border:'1px solid rgba(34,197,94,0.3)',borderRadius:50,padding:'2px 8px',fontWeight:700}}>−34%</span>
            </button>
          </div>
        </div>
      </section>

      {/* PLANS */}
      <section style={{padding:'0 0 96px'}}>
        <div className="container">
          <div style={{display:'flex',gap:20,alignItems:'stretch',flexWrap:'wrap'}}>

            {/* FREE */}
            <div className="plan-card">
              <div style={{marginBottom:24}}>
                <div style={{fontSize:13,fontWeight:600,letterSpacing:'.1em',textTransform:'uppercase',color:'rgba(255,255,255,0.35)',marginBottom:10}}>Базовый</div>
                <div style={{display:'flex',alignItems:'baseline',gap:6,marginBottom:6}}>
                  <span style={{fontSize:48,fontWeight:900,color:'#fff',letterSpacing:'-.03em'}}>0 ₽</span>
                </div>
                <div style={{fontSize:14,color:'rgba(255,255,255,0.35)'}}>Навсегда бесплатно</div>
              </div>
              <Link href="/download" className="btn-buy ghost" style={{marginBottom:28}}>Скачать бесплатно</Link>
              <div style={{display:'flex',flexDirection:'column',gap:12}}>
                {[
                  [true, 'До 5 мессенджеров'],
                  [true, 'Тёмная и светлая тема'],
                  [true, 'Уведомления'],
                  [true, 'Прокси-поддержка'],
                  [false, 'Неограниченные мессенджеры'],
                  [false, 'Облачная синхронизация'],
                  [false, 'Папки и группировка'],
                  [false, 'Приоритетная поддержка'],
                  [false, 'Ранний доступ к функциям'],
                ].map(([ok, text], i) => (
                  <div key={i} className="check-row">
                    <div className={`check-icon ${ok ? 'ok' : 'no'}`}>
                      {ok
                        ? <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                        : <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      }
                    </div>
                    <span style={{fontSize:14,color:ok?'rgba(255,255,255,0.65)':'rgba(255,255,255,0.25)',lineHeight:1.5}}>{text as string}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* PRO */}
            <div className="plan-card featured">
              {/* Badge */}
              <div style={{position:'absolute',top:-1,left:'50%',transform:'translateX(-50%)',background:'linear-gradient(135deg,#8b5cf6,#a855f7)',color:'#fff',fontSize:11,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',padding:'5px 18px',borderRadius:'0 0 12px 12px',whiteSpace:'nowrap'}}>
                ⚡ Рекомендуем
              </div>
              <div style={{marginBottom:24,marginTop:12}}>
                <div style={{fontSize:13,fontWeight:600,letterSpacing:'.1em',textTransform:'uppercase',color:'#c084fc',marginBottom:10}}>Pro</div>
                <div style={{display:'flex',alignItems:'baseline',gap:6,marginBottom:6}}>
                  <span style={{fontSize:48,fontWeight:900,color:'#fff',letterSpacing:'-.03em'}}>
                    {annual ? '133' : '199'} ₽
                  </span>
                  <span style={{fontSize:15,color:'rgba(255,255,255,0.35)'}}>/мес</span>
                </div>
                <div style={{fontSize:14,color:'rgba(255,255,255,0.4)'}}>
                  {annual
                    ? <><span style={{color:'rgba(255,255,255,0.25)',textDecoration:'line-through',marginRight:8}}>2 388 ₽</span><span style={{color:'#4ade80',fontWeight:600}}>1 590 ₽/год</span></>
                    : '199 ₽ в месяц, отмена в любой момент'
                  }
                </div>
              </div>
              <Link href="/dashboard" className="btn-buy primary" style={{marginBottom:28}}>
                {annual ? 'Купить на год — 1 590 ₽' : 'Купить на месяц — 199 ₽'}
              </Link>
              <div style={{display:'flex',flexDirection:'column',gap:12}}>
                {[
                  [true, 'Неограниченные мессенджеры', false],
                  [true, 'Облачная синхронизация', true],
                  [true, 'Папки и группировка', false],
                  [true, 'Тёмная и светлая тема', false],
                  [true, 'Уведомления', false],
                  [true, 'Прокси-поддержка', false],
                  [true, 'Приоритетная поддержка', true],
                  [true, 'Ранний доступ к функциям', true],
                  [true, 'Обновления на весь срок подписки', false],
                ].map(([ok, text, highlight], i) => (
                  <div key={i} className="check-row">
                    <div className="check-icon ok">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                    </div>
                    <span style={{fontSize:14,color:highlight?'#c4b5fd':'rgba(255,255,255,0.65)',lineHeight:1.5,fontWeight:highlight?600:400}}>{text as string}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* Payment note */}
          <div style={{textAlign:'center',marginTop:40,fontSize:13,color:'rgba(255,255,255,0.25)',display:'flex',alignItems:'center',justifyContent:'center',gap:20,flexWrap:'wrap'}}>
            <span>Безопасная оплата</span>
            <span>·</span>
            <span>Карты РФ, иностранные карты</span>
            <span>·</span>
            <span>Мгновенная активация</span>
            <span>·</span>
            <span>Отмена в любое время</span>
          </div>
        </div>
      </section>

      {/* COMPARE TABLE */}
      <section style={{padding:'0 0 96px',background:'rgba(168,85,247,0.02)'}}>
        <div className="container">
          <h2 style={{fontSize:'clamp(26px,3vw,38px)',fontWeight:800,color:'#fff',textAlign:'center',marginBottom:48,letterSpacing:'-.02em'}}>
            Сравнение планов
          </h2>
          <div style={{borderRadius:16,border:'1px solid rgba(255,255,255,0.08)',overflow:'hidden'}}>
            {/* Header */}
            <div className="compare-row" style={{background:'rgba(255,255,255,0.04)'}}>
              <div className="compare-cell" style={{fontWeight:600,color:'rgba(255,255,255,0.5)',fontSize:13}}>Функция</div>
              <div className="compare-cell" style={{fontWeight:700,color:'rgba(255,255,255,0.5)',textAlign:'center'}}>Базовый</div>
              <div className="compare-cell" style={{fontWeight:700,color:'#c084fc',textAlign:'center'}}>Pro ⚡</div>
            </div>
            {[
              ['Мессенджеры', 'До 5', 'Без ограничений'],
              ['Папки', '—', '✓'],
              ['Облачная синхронизация', '—', '✓'],
              ['Уведомления', '✓', '✓'],
              ['Тёмная / светлая тема', '✓', '✓'],
              ['Прокси', '✓', '✓'],
              ['Приоритетная поддержка', '—', '✓'],
              ['Ранний доступ к функциям', '—', '✓'],
              ['Обновления', 'Базовые', 'Все обновления'],
            ].map(([feature, free, pro], i) => (
              <div key={i} className="compare-row">
                <div className="compare-cell" style={{color:'rgba(255,255,255,0.6)'}}>{feature}</div>
                <div className="compare-cell" style={{textAlign:'center',color:free === '—' ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.5)'}}>{free}</div>
                <div className="compare-cell" style={{textAlign:'center',color:pro === '✓' ? '#4ade80' : '#c084fc',fontWeight:600}}>{pro}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Changelog */}
      <section style={{padding:'0 0 96px'}}>
        <div className="container" style={{maxWidth:720}}>
          <h2 style={{fontSize:'clamp(26px,3vw,38px)',fontWeight:800,color:'#fff',textAlign:'center',marginBottom:16,letterSpacing:'-.02em'}}>
            История изменений
          </h2>
          <p style={{fontSize:14,color:'rgba(255,255,255,0.4)',textAlign:'center',marginBottom:32}}>
            Полный список изменений по версиям — то же самое, что видно в приложении
          </p>
          <div className="changelog-wrap">
            {CHANGELOG.map((entry) => (
              <div className="changelog-entry" key={entry.version}>
                <div className="changelog-version">v{entry.version}</div>
                {entry.notes.map((note, i) => (
                  <p className="changelog-note" key={i}>{note}</p>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section style={{padding:'0 0 96px'}}>
        <div className="container" style={{maxWidth:720}}>
          <h2 style={{fontSize:'clamp(26px,3vw,38px)',fontWeight:800,color:'#fff',textAlign:'center',marginBottom:48,letterSpacing:'-.02em'}}>
            Частые вопросы
          </h2>
          {[
            ['Как активировать Pro?', 'После оплаты войдите в аккаунт Centrio в приложении — подписка активируется автоматически. Все устройства с этим аккаунтом получат Pro-статус.'],
            ['Можно ли отменить подписку?', 'Да, в любой момент. Подписка продолжит действовать до конца оплаченного периода. Автопродления нет без вашего согласия.'],
            ['Какие способы оплаты принимаются?', 'Карты Visa / Mastercard / МИР, а также популярные российские и международные способы оплаты. Платёж проходит через защищённый шлюз.'],
            ['Что будет с данными при окончании Pro?', 'Ваши данные не удаляются. При возврате к базовому тарифу папки и синхронизация перестанут обновляться, но всё сохранится локально.'],
            ['Есть ли пробный период?', 'Базовая версия бесплатна навсегда — это и есть возможность попробовать приложение без ограничений по времени.'],
          ].map(([q, a], i) => (
            <FaqItem key={i} q={q as string} a={a as string} />
          ))}
        </div>
      </section>

      <SiteFooter />
    </>
  )
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="faq-item">
      <div className="faq-q" onClick={() => setOpen(!open)}>
        {q}
        <svg style={{flexShrink:0,transition:'transform .25s',transform:open?'rotate(180deg)':'rotate(0)'}} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      {open && <div className="faq-a">{a}</div>}
    </div>
  )
}
