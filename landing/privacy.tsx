'use client'
import Link from 'next/link';
import { SiteNav, SiteFooter } from '@/components/ui/site-shell';

const pS: React.CSSProperties = { color: 'rgba(255,255,255,0.55)', lineHeight: 1.8, fontSize: 15, marginBottom: 14 };
const ulS: React.CSSProperties = { color: 'rgba(255,255,255,0.55)', lineHeight: 1.8, fontSize: 15, paddingLeft: 22, marginBottom: 14 };
const h2S: React.CSSProperties = { fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 16, marginTop: 48, paddingBottom: 12, borderBottom: '1px solid rgba(168,85,247,0.15)', letterSpacing: '-.01em' };
const strongS: React.CSSProperties = { color: 'rgba(255,255,255,0.85)' };

export default function PrivacyPage() {
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
            Политика конфиденциальности
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 14 }}>
            Дата последнего обновления: <span style={{ color: 'rgba(255,255,255,0.55)' }}>6 августа 2026 года</span>
          </p>
          <p style={{ ...pS, marginTop: 20, fontSize: 16 }}>
            Настоящая Политика описывает, как <strong style={strongS}>ИП Козловский Артём Сергеевич</strong> (далее — «Centrio», «мы») собирает, использует и защищает информацию при использовании приложения Centrio и связанных сервисов.
          </p>
        </div>

        {/* Content */}
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 20, padding: '36px 40px' }}>
          <h2 style={h2S}>1. Какие данные мы собираем</h2>
          <p style={pS}><strong style={strongS}>1.1 Данные аккаунта.</strong> При регистрации или входе через Google / Яндекс OAuth мы получаем адрес электронной почты, имя пользователя и аватар. Пароли не хранятся — аутентификация выполняется через защищённые OAuth-протоколы.</p>
          <p style={pS}><strong style={strongS}>1.2 Данные об использовании:</strong></p>
          <ul style={ulS}>
            <li>Список подключённых сервисов (названия, без содержимого переписок)</li>
            <li>Время последнего входа</li>
            <li>Статус подписки и дата оформления</li>
            <li>Версия приложения и история обновлений</li>
          </ul>
          <p style={pS}><strong style={strongS}>1.3 Технические данные.</strong> IP-адрес и User-Agent — для защиты от злоупотреблений. Не используются для профилирования.</p>
          <p style={pS}><strong style={strongS}>1.4 Данные синхронизации (Pro).</strong> Список мессенджеров, настройки тем, порядок вкладок — в зашифрованном виде.</p>
          <p style={pS}><strong style={strongS}>1.5 Что мы НЕ собираем.</strong> Содержимое переписок, пароли от мессенджеров, файлы с устройства, данные о платёжных картах.</p>

          <h2 style={h2S}>2. Как мы используем данные</h2>
          <ul style={ulS}>
            <li>Аутентификация и управление аккаунтом</li>
            <li>Предоставление функций облачной синхронизации (Pro)</li>
            <li>Отправка технических уведомлений об обновлениях</li>
            <li>Защита от несанкционированного доступа</li>
            <li>Улучшение приложения на основе агрегированной статистики</li>
          </ul>
          <p style={pS}>Мы не продаём ваши данные и не передаём их рекламным сетям.</p>

          <h2 style={h2S}>3. Хранение и безопасность</h2>
          <p style={pS}><strong style={strongS}>3.1 Серверы</strong> расположены на территории Российской Федерации.</p>
          <p style={pS}><strong style={strongS}>3.2 Шифрование.</strong> Все данные передаются по HTTPS/TLS. Синхронизированные данные хранятся в зашифрованном виде.</p>
          <p style={pS}><strong style={strongS}>3.3 Локальные данные.</strong> Сеансы мессенджеров хранятся на вашем устройстве в изолированном хранилище. У нас нет к ним доступа.</p>
          <p style={pS}><strong style={strongS}>3.4 Меры защиты:</strong></p>
          <ul style={ulS}>
            <li>Двухфакторная аутентификация для административных панелей</li>
            <li>JWT-токены с автоматическим обновлением</li>
            <li>Принцип минимальных привилегий для сотрудников</li>
          </ul>

          <h2 style={h2S}>4. Передача данных третьим лицам</h2>
          <p style={pS}>Мы не продаём и не передаём личные данные третьим лицам, кроме:</p>
          <ul style={ulS}>
            <li><strong style={strongS}>OAuth-провайдеры</strong> (Google, Яндекс) — только для аутентификации</li>
            <li><strong style={strongS}>Платёжные провайдеры</strong> — обработка платежей через сертифицированных партнёров</li>
            <li><strong style={strongS}>Требования закона</strong> — по официальному запросу уполномоченных органов</li>
          </ul>

          <h2 style={h2S}>5. Ваши права</h2>
          <ul style={ulS}>
            <li><strong style={strongS}>Доступ:</strong> получить копию ваших данных</li>
            <li><strong style={strongS}>Исправление:</strong> обновить неточные данные в профиле</li>
            <li><strong style={strongS}>Удаление:</strong> запросить удаление аккаунта и всех данных</li>
            <li><strong style={strongS}>Портативность:</strong> экспортировать данные в машиночитаемом формате</li>
            <li><strong style={strongS}>Отзыв согласия:</strong> прекратить синхронизацию в настройках</li>
          </ul>
          <p style={pS}>Для реализации прав: <strong style={strongS}>support@centrio.me</strong></p>

          <h2 style={h2S}>6. Cookie</h2>
          <p style={pS}>Электронное приложение Centrio не использует cookie. Веб-сайт centrio.me использует только технически необходимые cookie для поддержки сессии.</p>

          <h2 style={h2S}>7. Дети</h2>
          <p style={pS}>Сервис не предназначен для лиц младше 13 лет. Если нам стало известно о сборе данных ребёнка — мы немедленно удаляем их.</p>

          <h2 style={h2S}>8. Изменения политики</h2>
          <p style={pS}>При существенных изменениях мы уведомим вас по email и через уведомление в приложении не менее чем за 7 дней до вступления в силу.</p>

          <h2 style={h2S}>9. Контакты</h2>
          <p style={pS}>По вопросам обработки данных — <strong style={strongS}>support@centrio.me</strong></p>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
