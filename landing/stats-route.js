const router = require('express').Router()
const authMiddleware = require('../middleware/auth')
const prisma = require('../utils/prisma')

// POST /api/stats/track — Electron app sends heartbeat
// Body: { service?, appTime, serviceTime?, notifCount?, msgSent?, msgReceived?, date? }
router.post('/track', authMiddleware, async (req, res) => {
  try {
    const { service, appTime = 0, serviceTime = 0, notifCount = 0, msgSent = 0, msgReceived = 0, date } = req.body
    const today = date ? new Date(date) : new Date()
    today.setHours(0, 0, 0, 0)

    // Upsert daily stat (aggregate per day per service)
    const existing = await prisma.usageStat.findFirst({
      where: {
        userId: req.user.id,
        service: service || null,
        date: { gte: today, lt: new Date(today.getTime() + 86400000) }
      }
    })

    if (existing) {
      await prisma.usageStat.update({
        where: { id: existing.id },
        data: {
          appTime:     { increment: appTime },
          serviceTime: { increment: serviceTime },
          notifCount:  { increment: notifCount },
          msgSent:     { increment: msgSent },
          msgReceived: { increment: msgReceived },
        }
      })
    } else {
      await prisma.usageStat.create({
        data: {
          userId: req.user.id,
          service: service || null,
          date: today,
          appTime, serviceTime, notifCount, msgSent, msgReceived
        }
      })
    }

    res.json({ ok: true })
  } catch (err) {
    console.error('Stats track error:', err)
    res.status(500).json({ error: 'Ошибка записи статистики' })
  }
})

// GET /api/stats/summary — Dashboard summary
router.get('/summary', authMiddleware, async (req, res) => {
  try {
    const now = new Date()
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0)
    const weekStart  = new Date(now); weekStart.setDate(now.getDate() - 6); weekStart.setHours(0, 0, 0, 0)
    const monthStart = new Date(now); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0)

    const [todayStats, weekStats, allStats, serviceStats, weekDays, appNotifReceived] = await Promise.all([
      // Today
      prisma.usageStat.aggregate({
        where: { userId: req.user.id, date: { gte: todayStart } },
        _sum: { appTime: true, notifCount: true, msgSent: true, msgReceived: true }
      }),
      // This week
      prisma.usageStat.aggregate({
        where: { userId: req.user.id, date: { gte: weekStart } },
        _sum: { appTime: true, notifCount: true, msgSent: true, msgReceived: true }
      }),
      // All time
      prisma.usageStat.aggregate({
        where: { userId: req.user.id },
        _sum: { appTime: true, notifCount: true, msgSent: true, msgReceived: true }
      }),
      // Per-service breakdown (all time, by appTime when serviceTime is 0)
      prisma.usageStat.groupBy({
        by: ['service'],
        where: { userId: req.user.id, service: { not: null } },
        _sum: { serviceTime: true, appTime: true, notifCount: true },
        orderBy: { _sum: { serviceTime: 'desc' } },
        take: 10
      }),
      // Last 7 days activity for chart
      prisma.usageStat.groupBy({
        by: ['date'],
        where: { userId: req.user.id, date: { gte: weekStart } },
        _sum: { appTime: true },
        orderBy: { date: 'asc' }
      }),
      // Count system notifications received by user
      prisma.appNotificationRead.count({ where: { userId: req.user.id } })
    ])

    // Build last 7 days chart data
    const chartData = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(now.getDate() - i)
      d.setHours(0, 0, 0, 0)
      const found = weekDays.find(w => {
        const wd = new Date(w.date); wd.setHours(0,0,0,0)
        return wd.getTime() === d.getTime()
      })
      chartData.push({
        date: d.toISOString().slice(0, 10),
        label: d.toLocaleDateString('ru-RU', { weekday: 'short' }),
        minutes: Math.round((found?._sum?.appTime || 0) / 60)
      })
    }

    // Streak: consecutive days with activity
    const allDays = await prisma.usageStat.findMany({
      where: { userId: req.user.id, appTime: { gt: 0 } },
      select: { date: true },
      distinct: ['date'],
      orderBy: { date: 'desc' }
    })
    let streak = 0
    const today0 = todayStart.getTime()
    for (let i = 0; i < allDays.length; i++) {
      const d = new Date(allDays[i].date); d.setHours(0,0,0,0)
      if (d.getTime() === today0 - i * 86400000) streak++
      else break
    }

    res.json({
      today: {
        appTime:    todayStats._sum.appTime    || 0,
        notifCount: todayStats._sum.notifCount || 0,
        msgSent:    todayStats._sum.msgSent    || 0,
        msgReceived:todayStats._sum.msgReceived|| 0,
      },
      week: {
        appTime:    weekStats._sum.appTime    || 0,
        notifCount: weekStats._sum.notifCount || 0,
        msgSent:    weekStats._sum.msgSent    || 0,
        msgReceived:weekStats._sum.msgReceived|| 0,
      },
      total: {
        appTime:    allStats._sum.appTime    || 0,
        notifCount: allStats._sum.notifCount || 0,
        msgSent:    allStats._sum.msgSent    || 0,
        msgReceived:allStats._sum.msgReceived|| 0,
      },
      streak,
      services: serviceStats.map(s => ({
        name: s.service,
        // Use serviceTime if tracked, fallback to appTime (older clients send appTime per service)
        minutes: Math.round(((s._sum.serviceTime || 0) > 0 ? (s._sum.serviceTime || 0) : (s._sum.appTime || 0)) / 60),
        notifCount: s._sum.notifCount || 0
      })),
      chart: chartData,
      appNotifReceived: appNotifReceived || 0
    })
  } catch (err) {
    console.error('Stats summary error:', err)
    res.status(500).json({ error: 'Ошибка получения статистики' })
  }
})

module.exports = router
