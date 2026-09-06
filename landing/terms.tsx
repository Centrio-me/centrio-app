'use client'
import Link from 'next/link';
import { SiteNav, SiteFooter } from '@/components/ui/site-shell';

const pS: React.CSSProperties = { color: 'rgba(255,255,255,0.55)', lineHeight: 1.8, fontSize: 15, marginBottom: 14 };
const ulS: React.CSSProperties = { color: 'rgba(255,255,255,0.55)', lineHeight: 1.8, fontSize: 15, paddingLeft: 22, marginBottom: 14 };
const h2S: React.CSSProperties = { fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 16, marginTop: 48, paddingBottom: 12, borderBottom: '1px solid rgba(168,85,247,0.15)', letterSpacing: '-.01em' };
const strongS: React.CSSProperties = { color: 'rgba(255,255,255,0.85)' };

export default function TermsPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#06060f', color: '#e2e2e2', fontFamily: "'Inter', -apple-system, sans-serif" }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background:#06060f; }
        li { margin-bottom:4px; }
      `}</style>

      <SiteNav />

      <main style={{ maxWidth: 820, margin: '0 auto', padding: '64px 24px 96px', paddingTop: 90 }}>
        {/* Header */}
        <div style={{ marginBottom: 52, paddingBottom: 32, borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.2)', borderRadius: 50, padding: '5px 14px', fontSize: 12, fontWeight: 600, color: '#c084fc', marginBottom: 20, letterSpacing: '.04em', textTransform: 'uppercase' }}>
            Правовые документы
          </div>
          <h1 style={{ fontSize: 'clamp(28px,4.5vw,46px)', fontWeight: 900, letterSpacing: '-.03em', marginBottom: 14, color: '#fff', lineHeight: 1.1 }}>
            Условия использования
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 14 }}>
            Дата последнего обновления: <span style={{ color: 'rgba(255,255,255,0.55)' }}>6 августа 2026 года</span>
          </p>
          <p style={{ ...pS, marginTop: 20, fontSize: 16 }}>
            Используя приложение Centrio, вы соглашаетесь с настоящими Условиями использования, заключёнными с <strong style={strongS}>ИП Козловским Артёмом Сергеевичем</strong>. Пожалуйста, внимательно прочитайте их перед использованием сервиса.
          </p>
        </div>

        {/* Content */}
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 20, padding: '36px 40px' }}>
          <h2 style={h2S}>1. Описание сервиса</h2>
          <p style={pS}>Centrio — это десктопное приложение (Windows), которое позволяет объединить несколько веб-версий мессенджеров и онлайн-сервисов в одном окне. Приложение работает как оболочка (container) над веб-приложениями третьих сторон.</p>

          <h2 style={h2S}>2. Регистрация и аккаунт</h2>
          <p style={pS}><strong style={strongS}>2.1</strong> Для использования облачной синхронизации (Pro) требуется аккаунт Centrio. Регистрация доступна через email или OAuth (Google, Яндекс).</p>
          <p style={pS}><strong style={strongS}>2.2</strong> Вы несёте ответственность за сохранность данных своего аккаунта и за все действия, совершённые под вашим аккаунтом.</p>
          <p style={pS}><strong style={strongS}>2.3</strong> Вы обязуетесь указать корректный email-адрес и своевременно обновлять его при изменении.</p>

          <h2 style={h2S}>3. Допустимое использование</h2>
          <p style={pS}>При использовании Centrio запрещается:</p>
          <ul style={ulS}>
            <li>Нарушать законы Российской Федерации или международное право</li>
            <li>Распространять вредоносное программное обеспечение</li>
            <li>Осуществлять несанкционированный доступ к системам третьих лиц</li>
            <li>Реверс-инжинирить или декомпилировать приложение</li>
            <li>Использовать приложение для рассылки спама или незаконной рекламы</li>
          </ul>

          <h2 style={h2S}>4. Подписка и оплата</h2>
          <p style={pS}><strong style={strongS}>4.1 Бесплатная версия</strong> позволяет подключить до 3 сервисов без временных ограничений.</p>
          <p style={pS}><strong style={strongS}>4.2 Centrio Pro</strong> предоставляет расширенный функционал по подписке (месячной или годовой). Стоимость указана на странице <Link href="/pricing" style={{ color: '#c084fc' }}>centrio.me/pricing</Link>.</p>
          <p style={pS}><strong style={strongS}>4.3 Отмена подписки.</strong> Вы можете отменить подписку в любой момент. Оплаченный период истекает в конце текущего срока, новых списаний не будет.</p>
          <p style={pS}><strong style={strongS}>4.4 Возврат средств</strong> возможен в течение 14 дней с момента оплаты при обращении в поддержку.</p>

          <h2 style={h2S}>5. Интеллектуальная собственность</h2>
          <p style={pS}>Все права на приложение Centrio, его дизайн и логотип принадлежат ИП Козловскому Артёму Сергеевичу. Использование наших товарных знаков без письменного разрешения запрещено.</p>
          <p style={pS}>Третьи стороны (мессенджеры, сервисы), отображаемые в Centrio, имеют собственные товарные знаки, которые принадлежат их правообладателям.</p>

          <h2 style={h2S}>6. Ограничение ответственности</h2>
          <p style={pS}>Centrio предоставляется «как есть» (as is). Мы не несём ответственности:</p>
          <ul style={ulS}>
            <li>За доступность и работу сторонних сервисов (Telegram, WhatsApp и др.)</li>
            <li>За потерю данных, вызванную действиями третьих лиц</li>
            <li>За косвенные убытки, упущенную выгоду</li>
          </ul>
          <p style={pS}>Наша ответственность ограничена суммой, уплаченной вами за подписку за последние 12 месяцев.</p>

          <h2 style={h2S}>7. Прекращение доступа</h2>
          <p style={pS}>Мы вправе приостановить или прекратить доступ к аккаунту при нарушении настоящих Условий. При этом оплаченная часть подписки возвращается пропорционально.</p>

          <h2 style={h2S}>8. Изменение условий</h2>
          <p style={pS}>Мы уведомим вас об изменениях не позднее чем за 7 дней по email или в приложении. Продолжение использования после вступления изменений в силу означает согласие с ними.</p>

          <h2 style={h2S}>9. Применимое право</h2>
          <p style={pS}>Настоящие Условия регулируются законодательством Российской Федерации. Споры решаются в судах общей юрисдикции по месту нахождения ИП Козловского Артёма Сергеевича.</p>

          <h2 style={h2S}>10. Контакты</h2>
          <p style={pS}>По всем вопросам — <strong style={strongS}>support@centrio.me</strong></p>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
