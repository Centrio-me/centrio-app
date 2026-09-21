const jwt = require('jsonwebtoken')
const { v4: uuidv4 } = require('uuid')
const prisma = require('./prisma')

// Генерация access токена.
// BUGFIX ("прерывает сессию" — и в клиентском личном кабинете, и в админке):
// 15 минут был слишком короткий срок в сочетании с тем, что refreshToken
// намеренно не сохраняется в localStorage (см. authStore.ts — защита от XSS,
// живёт только в памяти). Любая полная перезагрузка страницы позже 15 минут
// после входа означала принудительный logout, поскольку обновить accessToken
// было уже нечем. 4 часа — разумный компромисс: закрывает подавляющее
// большинство обрывов сессии в течение обычного рабочего дня, не меняя
// принципиально модель угроз (это всё ещё bearer-токен с ограниченным сроком
// жизни, отзываемые refresh-сессии остаются как backstop). Полноценное
// решение — httpOnly-cookie для refreshToken — требует отдельной, более
// крупной переделки (CORS с credentials, cookie-parser, и desktop-приложение
// по-прежнему не может использовать cookie для своего centrio://auth
// deep-link-флоу, см. authStore.ts).
const generateAccessToken = (userId) => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: '4h' }
  )
}

// Лимит активных устройств (сессий) по плану — применяется только к
// НЕ-мобильным сессиям (desktop/web). Мобильный компаньон получает
// отдельный, фиксированный слот (MOBILE_DEVICE_LIMIT) независимо от
// тарифа — вход в мобильное приложение не должен вытеснять единственную
// разрешённую FREE-пользователю десктопную сессию, и наоборот.
const MAX_DEVICES = { FREE: 1, PRO: 5, TEAM: 5 }
const MOBILE_DEVICE_LIMIT = 1

// Генерация refresh токена (30 дней)
const generateRefreshToken = async (userId, deviceInfo, ipAddress, isMobile = false) => {
  const token = uuidv4()
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 30)

  // Удаляем предыдущие сессии с таким же deviceInfo И тем же типом
  // устройства (одно устройство — одна сессия того же типа)
  if (deviceInfo) {
    await prisma.session.deleteMany({
      where: { userId, deviceInfo, isMobile }
    })
  }

  if (isMobile) {
    const activeMobileSessions = await prisma.session.findMany({
      where: { userId, isMobile: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true }
    })

    if (activeMobileSessions.length >= MOBILE_DEVICE_LIMIT) {
      const excess = activeMobileSessions.length - MOBILE_DEVICE_LIMIT + 1
      const toRemove = activeMobileSessions.slice(0, excess).map(s => s.id)
      await prisma.session.deleteMany({ where: { id: { in: toRemove } } })
    }
  } else {
    // Ограничение по количеству устройств в зависимости от плана.
    // При превышении лимита освобождаем место, удаляя самые старые сессии
    // (пользователь просто "перелогинивается" на новом устройстве, старое отваливается).
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true } })
    const limit = MAX_DEVICES[user?.plan] || MAX_DEVICES.FREE

    const activeSessions = await prisma.session.findMany({
      where: { userId, isMobile: false },
      orderBy: { createdAt: 'asc' },
      select: { id: true }
    })

    if (activeSessions.length >= limit) {
      const excess = activeSessions.length - limit + 1
      const toRemove = activeSessions.slice(0, excess).map(s => s.id)
      await prisma.session.deleteMany({ where: { id: { in: toRemove } } })
    }
  }

  await prisma.session.create({
    data: {
      userId,
      refreshToken: token,
      deviceInfo,
      ipAddress,
      isMobile,
      expiresAt
    }
  })

  // Обновить lastSeenAt пользователя
  await prisma.user.update({
    where: { id: userId },
    data: { lastSeenAt: new Date() }
  })

  return token
}

// Обновление токенов
const refreshTokens = async (refreshToken, deviceInfo, ipAddress) => {
  const session = await prisma.session.findUnique({
    where: { refreshToken },
    include: { user: true }
  })

  if (!session || session.expiresAt < new Date()) {
    if (session) {
      await prisma.session.delete({ where: { id: session.id } })
    }
    throw new Error('Refresh токен недействителен или истёк')
  }

  // Удаляем старую сессию
  await prisma.session.delete({ where: { id: session.id } })

  // Создаём новые токены — сохраняем тип устройства исходной сессии
  // (мобильная сессия остаётся мобильной при обновлении токена, и
  // наоборот), иначе refresh со стороны мобильного приложения начал бы
  // конкурировать за десктопный лимит устройств.
  const newAccessToken = generateAccessToken(session.userId)
  const newRefreshToken = await generateRefreshToken(session.userId, deviceInfo, ipAddress, session.isMobile)

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    user: session.user
  }
}

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  refreshTokens
}
