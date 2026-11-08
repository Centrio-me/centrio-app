'use client'
import '../dashboard/dashboard-design.css'
import './team-design.css'
import { Brand } from '@/components/centrio/brand'

// Корпоративная версия (TEAM) — Phase 1 self-service console.
// См. Obsidian → Centrio → Корпоративная версия (план + журнал реализации).
// Scope reminder: organizations, seats, membership, invites, self-service
// seat billing, audit log. Org policy (whitelist/forced settings), SSO,
// silent-deploy are Phase 2+ — NOT here.
//
// NOTE on deploy path: flat local checkout, deployed to
// /var/www/centrio-web/src/app/team/page.tsx (same "-server.tsx" naming
// convention as dashboard-server.tsx/admin-server.tsx — see deploy-frontend.js).
//
// Phase 1 MVP simplification: a user belongs to at most one org (enforced in
// org-routes.js, not at the schema level), so this is a single flat page —
// no /team/[slug] dynamic route.

import { useEffect, useState, useCallback, Suspense, type CSSProperties } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { api } from '@/lib/api'
import { encryptForDevice, vaultSupported } from '@/lib/vaultCrypto'
import { useLang, type Lang } from '@/lib/i18n'
import { basePath, translatedHref } from '@/lib/locales'
import QuickRepliesPanel from './QuickRepliesPanel'
import AlertsPanel from './AlertsPanel'
import TasksPanel from './TasksPanel'
import StructurePanel from './StructurePanel'
import LiveBoard from './LiveBoard'
import ReportsPanel from './ReportsPanel'
import { LIVE_STR } from './live-strings'
// Same font family as dashboard/page.tsx (Geist, via .dash-shell in
// dashboard-design.css) — dropped the separate Montserrat load 2026-09-28 so
// /team stops looking like a different app skin from /dashboard.

// Self-contained team-console copy — kept local rather than merged into the
// shared src/lib/i18n.ts dict, same reasoning as DASH_STR in
// dashboard-server.tsx (see that file's comment). Every user-visible string
// from the original Russian-only page becomes a ru/en key pair here; ru
// values are copied verbatim from the original so existing Russian users see
// zero change.
const TEAM_STR = {
  ru: {
    // Roles / tiers (values only — object KEYS elsewhere stay OWNER/ADMIN/MEMBER/START/BUSINESS)
    roleOwner: 'Владелец', roleAdmin: 'Администратор', roleMember: 'Участник',
    tierStart: 'TEAM Старт', tierBusiness: 'TEAM Бизнес',

    // Audit log descriptions
    auditOrgCreate: (name: string) => `Организация создана («${name}»)`,
    auditMemberInvite: (email: string, role: string) => `Приглашение отправлено: ${email} (${role})`,
    auditMemberAccept: (email: string, role: string) => `${email} присоединился к организации (${role})`,
    auditMemberRemove: (who: string) => `Участник удалён: ${who}`,
    auditMemberRole: (who: string, role: string) => `Роль изменена: ${who} → ${role}`,
    auditSeatsPurchase: (seats: number, months: number) => `Куплено мест: ${seats} (оплата за ${months} мес.)`,
    auditOrgRename: (name: string) => `Организация переименована («${name}»)`,
    auditCanAddPerm: (who: string, on: boolean) => `Разрешение «может добавлять свои мессенджеры» для ${who}: ${on ? 'включено' : 'выключено'}`,
    auditLogoUpdate: 'Логотип организации обновлён',
    auditLogoRemove: 'Логотип организации сброшен',
    auditSettingsUpdate: 'Общие настройки организации обновлены',
    auditVpnOn: 'Общий VPN для команды настроен',
    auditVpnOff: 'Общий VPN для команды отключён',
    auditMsgAssign: (name: string) => `Сотруднику назначен мессенджер «${name}»`,
    auditQuickReplyCreate: (t: string) => `Добавлен быстрый ответ «${t}»`,
    auditQuickReplyUpdate: (t: string) => `Изменён быстрый ответ «${t}»`,
    auditQuickReplyDelete: 'Удалён быстрый ответ',
    auditAlertsOn: 'Оповещения «Клиент ждёт ответа» включены или изменены',
    auditAlertsOff: 'Оповещения «Клиент ждёт ответа» выключены',
    auditAlertsTelegramOff: 'Telegram отключён от оповещений',
    auditMsgUpdate: 'Назначенный мессенджер изменён',
    auditMsgRemove: 'Назначенный мессенджер удалён',
    auditInviteCancel: (email: string) => `Приглашение отменено: ${email}`,
    auditCustomLinkCreate: (name: string) => `Создана своя ссылка «${name}»`,
    auditCustomLinkRemove: (name: string) => `Своя ссылка удалена «${name}»`,

    // Errors / form messages
    errEnterOrgName: 'Введите название организации',
    errCreateOrgFailed: 'Не удалось создать организацию',
    errEnterValidEmail: 'Введите корректный email',
    inviteSentTo: (email: string) => `Приглашение отправлено на ${email}`,
    errInviteFailed: 'Не удалось отправить приглашение',
    confirmRemoveMember: 'Удалить участника из организации?',
    errRemoveMemberFailed: 'Не удалось удалить участника',
    errChangePermFailed: 'Не удалось изменить разрешение',
    errChangeRoleFailed: 'Не удалось изменить роль',
    errCreatePaymentFailed: 'Не удалось создать платёж',
    errRenameFailed: 'Не удалось переименовать',
    errImageOnly: 'Можно загрузить только изображение',
    errFileTooLarge: 'Файл слишком большой (максимум 5 МБ)',
    logoUpdated: 'Логотип обновлён',
    errUploadLogoFailed: 'Не удалось загрузить логотип',
    logoResetDefault: 'Логотип сброшен на стандартный',
    errRemoveLogoFailed: 'Не удалось удалить логотип',
    vpnSaved: 'Общий VPN сохранён',
    vpnDisabled: 'Общий VPN отключён',
    errSaveVpnFailed: 'Не удалось сохранить VPN',
    errDisableVpnFailed: 'Не удалось отключить VPN',
    themeAppliedAll: 'Тема будет применена у всех сотрудников',
    themeForceDisabled: 'Принудительная тема отключена',
    errSaveSettingsFailed: 'Не удалось сохранить настройки',
    errAssignFillFields: 'Заполните сотрудника и выберите мессенджер (или впишите свой)',
    msgAssigned: 'Мессенджер назначен',
    errAssignFailed: 'Не удалось назначить мессенджер',
    errDeleteAssignmentFailed: 'Не удалось удалить мессенджер',

    // Nav
    navNow: 'Сейчас', navReports: 'Отчёты',
    auditStrict: (who: string, on: boolean) => `Строгий режим для ${who}: ${on ? 'включён' : 'выключен'}`,
    auditCommand: (kind: string, who: string, name: string | null) => `${({ pause: 'Выключен мессенджер', resume: 'Включён мессенджер', reload: 'Перезагружен мессенджер', relogin: 'Попросили войти заново', wipe: 'Завершены рабочие сеансы' } as Record<string, string>)[kind] || kind}${name ? ` «${name}»` : ''}: ${who}`,
    auditNote: (who: string | null) => (who ? `Сообщение сотруднику ${who}` : 'Сообщение всей команде'),
    auditDaily: 'Сводка за день отправлена в Telegram',
    auditExpiry: (days: number) => (days === 0 ? 'Напоминание: подписка заканчивается сегодня' : `Напоминание: подписка заканчивается через ${days} дн.`),
    navOverview: 'Обзор', navMembers: 'Участники', navBilling: 'Места и оплата', navManage: 'Управление', navAudit: 'Журнал действий', navReplies: 'Быстрые ответы', navAlerts: 'Оповещения', navTasks: 'Задачи', navFolders: 'Папки',

    // No-org state
    backToDashboard: 'В личный кабинет',
    teamStartTitle: 'Centrio TEAM Старт',
    teamStartDesc: 'Организация — это общий биллинг мест для команды: пригласите коллег по email, управляйте ролями и оплачивайте места самостоятельно, без договора и менеджера.',
    perSeatMonth: 'место / мес',
    perSeatMonthYearly: 'место / мес при годовой оплате',
    fromSeatsNote: (min: number) => `От ${min} мест. Для 50+ мест — напишите на sales@centrio.me.`,
    freeSeatsNote: (min: number) => `Минимум ${min} мест для начала — все оплачиваются сразу, без бесплатного периода. Добавляйте места по мере роста команды. Отменить можно в любой момент.`,
    orgNameLabel: 'Название организации',
    orgNamePlaceholder: 'Например, ООО «Ромашка»',
    creatingOrgBtn: 'Создаём…',
    createOrgBtn: 'Создать организацию',

    // Sidebar / chrome — same wording as dashboard/page.tsx for a 1:1 match
    orgLabel: 'Организация', yourRole: 'Ваша роль:', personalCabinet: 'Личный кабинет',
    teamNav: 'Команда', cabinetLabel: 'Команда', skipToContent: 'К содержимому',
    openProfile: 'Открыть профиль', logoutAccount: 'Выйти из аккаунта', logout: 'Выйти',

    // Payment banner
    confirmingPayment: 'Подтверждаем оплату мест…',
    paymentConfirmed: 'Оплата подтверждена — места добавлены в организацию.',

    // Overview
    overviewTitle: 'Обзор',
    teamNameLabel: 'Название команды',
    savingBtn: 'Сохраняем…', saveBtn: 'Сохранить', cancelBtn: 'Отмена', renameBtn: 'Переименовать',
    seatsUsedLabel: 'мест занято', seatsFreeLabel: 'свободно', paidUntilLabel: 'оплачено до',
    onboardTitle: 'Начало работы', onboardDoneNote: 'Готово — команда полностью настроена',
    onboardStep1: 'Пригласите сотрудников', onboardStep1Hint: 'Добавьте коллег в организацию — это займёт минуту',
    onboardStep2: 'Назначьте мессенджеры', onboardStep2Hint: 'Выберите сотрудника и перетащите на него нужный мессенджер',
    onboardStep3: 'Добавьте логотип компании', onboardStep3Hint: 'Свой логотип вместо стандартного Centrio увидят все сотрудники',
    onboardGoBtn: 'Перейти',
    seatsExpiringSoon: (days: number) => `Оплаченные места закончатся через ${days} ${days === 1 ? 'день' : days < 5 ? 'дня' : 'дней'} — продлите, чтобы сотрудники не потеряли доступ к Team.`,
    seatsExpiredNote: 'Срок оплаченных мест истёк — продлите, чтобы не потерять доступ к Team.',
    renewSeatsBtn: 'Продлить места', buySeatsShortBtn: 'Купить места',
    modeRenewLabel: 'Продлить срок', modeAddLabel: 'Добавить места',
    renewHint: (n: number) => `Продлеваем подписку для ваших ${n} мест. Количество мест не меняется.`,
    addHint: (days: number) => `Новые места подключатся сразу и будут действовать до конца оплаченного периода — осталось ${days} дн. Цена пересчитана за оставшиеся дни.`,
    orgDescOpen: 'Организация «', orgDescMid: '» на тарифе ',
    autoRenewOnNote: ' Автопродление мест включено.', autoRenewOffNote: ' Автопродление мест выключено.',
    orgDescTail: 'Перейдите во вкладку «Участники», чтобы пригласить коллег, или «Места и оплата», чтобы докупить места.',
    teamStatsTitle: 'Статистика по команде',
    teamStatsSub: 'Вовлечённость считается по статусу прочтения — Centrio не видит содержимое переписки.',
    employeesLabel: 'сотрудников', assignedMessengersLabel: 'назначено мессенджеров',
    totalUnreadLabel: 'непрочитано всего', engagementLabel: 'вовлечённость',
    loadingEllipsis: 'Загрузка…', noEmployeesYet: 'В организации пока нет сотрудников.',
    messengersCountSuffix: 'мессенджер(ов)',
    unreadCountSuffix: (n: number) => `${n} непрочитано`,
    loginInLabel: 'Вход выполнен', loginOutLabel: 'Нужен вход', loginNeverLabel: 'Не открывали', loginUnknownLabel: 'Вход не определён', loginMissingCount: (n: number) => `нет входа: ${n}`,
    loginHint: 'Вход определяется по странице мессенджера у сотрудника в приложении Centrio. Пока вход не выполнен, сообщений нет, и «0 непрочитанных» не означает «прочитано».',
    allRead: 'всё прочитано', noDataStatus: 'нет данных', activeStatus: 'активен', inactiveStatus: 'давно не заходил',

    // Members
    membersTab: 'Участники',
    coworkerEmailLabel: 'Email коллеги', roleLabel: 'Роль',
    memberSearchPlaceholder: 'Поиск по имени или email…', noMembersFound: 'Никого не найдено',
    sendingBtn: 'Отправляем…', inviteBtn: 'Пригласить',
    noFreeSeatsMsg: 'Нет свободных мест — купите ещё во вкладке «Места и оплата».',
    removeBtn: 'Удалить',
    messengerPaletteTitle: 'Мессенджеры',
    messengerPaletteHint: 'Перетащите мессенджер на карточку сотрудника, чтобы назначить — или нажмите «+ мессенджер» внутри карточки.',
    dropHereLabel: 'Отпустите здесь, чтобы назначить',
    addMessengerBtn: 'мессенджер',
    assignedCountSuffix: (n: number) => `${n} назнач.`,
    pendingInvitesTitle: 'Приглашения ожидают принятия',
    cancelInviteBtn: 'Отменить', confirmCancelInvite: 'Отменить это приглашение?',
    sentOnPrefix: 'отправлено', invitedAsPrefix: 'как',
    addLinkBtn: 'своя ссылка', createBtn: 'Создать',
    customLinkNamePlaceholder: 'Например, CRM или Wiki',
    noCustomLinks: 'Своих ссылок пока нет',

    // Billing
    totalSeatsLabel: 'всего мест', usedLabel: 'занято',
    buyMoreSeatsTitle: 'Купить дополнительные места',
    period1MonthLabel: '1 месяц', period1YearLabel: '1 год',
    perSeatSuffix: '/место', perSeatMonthlySuffix: '/место в мес.',
    seatsCountLabel: 'Количество мест',
    fromToSeats: (min: number, max: number) => `от ${min} до ${max}`,
    totalToPayLabel: 'Итого к оплате',
    proceedingToPayment: 'Переходим к оплате…', payBtn: 'Оплатить',
    moreThan50SeatsNote: 'Больше 50 мест? Напишите на sales@centrio.me для индивидуальных условий.',
    ownerOnlyPurchaseNote: 'Покупка мест доступна только владельцу организации.',

    // Manage
    manageTab: 'Управление',
    logoTitle: 'Логотип программы',
    logoDesc: 'Заменяет стандартный логотип Centrio в приложении у всех сотрудников организации.',
    defaultLogoLabel: 'по умолч.', uploadingBtn: 'Загружаем…', uploadLogoBtn: 'Загрузить логотип', resetBtn: 'Сбросить',
    vpnTitle: 'Общий VPN для команды',
    vpnDesc: 'Ссылка-подписка на VPN, которую приложение подключит автоматически у всех сотрудников (если у них ещё нет собственного активного VPN).',
    nameLabel: 'Название', vpnNamePlaceholder: 'Например, Офис',
    subscriptionLinkLabel: 'Ссылка на подписку', vpnLinkPlaceholder: 'vless://... или https://.../sub',
    disableBtn: 'Отключить',
    themeTitle: 'Единая тема оформления',
    themeDesc: 'Применяется у всех сотрудников организации. «Не задано» — каждый выбирает тему сам.',
    themeNotSet: 'Не задано', themeDark: 'Тёмная', themeLight: 'Светлая',
    assignedMessengersTitle: 'Мессенджеры сотрудников',
    assignedMessengersDesc: 'Назначьте сотруднику мессенджер — он появится у него в приложении. Сотрудник по-прежнему входит в сервис под своим аккаунтом.',
    employeeLabel: 'Сотрудник', chooseEllipsis: 'Выберите…', messengerLabel: 'Мессенджер', customOption: 'Свой вариант…',
    linkLabel: 'Ссылка', assignNamePlaceholder: 'Например, CRM',
    addingBtn: 'Добавляем…', assignBtn: 'Назначить',
    assignHint: 'Ниже, у каждого сотрудника — и его список мессенджеров, и статус прочтения (только прочитано / не прочитано, содержимое переписки Centrio не видит и не хранит).',
    canAddOwnLabel: 'Может добавлять свои мессенджеры',
    nothingAssigned: 'Ничего не назначено', removeShortBtn: 'Убрать',
    vaultBtn: 'Доступ', vaultSavedChip: 'доступ сохранён', vaultTitle: (name: string, who: string) => `Вход в «${name}» — ${who}`,
    vaultInfo: 'Логин и пароль шифруются в вашем браузере ключом устройства сотрудника и уходят только в зашифрованном виде: сервер Centrio прочитать их не может. Сотрудник пароль не увидит — приложение само подставит его в форму входа на назначенном сайте. Сохранённый пароль нельзя прочитать обратно, при необходимости введите его заново.',
    vaultLogin: 'Логин', vaultPassword: 'Пароль', vaultSave: 'Сохранить и передать', vaultRemove: 'Удалить доступ', vaultClose: 'Закрыть', vaultSaving: 'Шифруем…',
    vaultDevices: 'Устройства сотрудника', vaultDeviceShared: 'доступ передан', vaultDeviceNot: 'ещё нет', vaultNoDevices: 'У сотрудника пока нет зарегистрированных устройств. Пусть обновит Centrio и войдёт в аккаунт, затем повторите.',
    vaultDone: (n: number) => `Готово: доступ передан на устройств: ${n}`, vaultFillBoth: 'Введите логин и пароль', vaultFail: 'Не удалось сохранить доступ', vaultRemoved: 'Доступ удалён', vaultNoCrypto: 'Этот браузер не поддерживает защищённое шифрование',
    auditCredSet: (who: string, name: string, n: number) => `Сохранён доступ в «${name}» для ${who} (устройств: ${n})`, auditCredDelete: (who: string, name: string) => `Удалён доступ в «${name}» у ${who}`, auditCredUsed: (who: string, name: string) => `${who} использовал(а) сохранённый вход в «${name}»`, auditVaultDevice: (who: string) => `${who}: зарегистрировано устройство для хранилища паролей`,
    assignVpnLabel: 'VPN для новых назначений', vpnModeAuto: 'Рекомендуемое: российские сервисы без VPN, остальные с VPN', vpnModeOn: 'Всегда с VPN', vpnModeOff: 'Всегда без VPN', assignVpnHint: 'Применяется к новым назначениям. У уже назначенных переключайте кнопкой «VPN» в строке мессенджера. Сотрудник не сможет это изменить.', vpnToggleOn: 'VPN: вкл', vpnToggleOff: 'VPN: выкл', errVpnToggle: 'Не удалось изменить настройку VPN',
    whoReadsTitle: 'Кто читает сообщения',
    noDataYetEmployee: 'Пока нет данных — сотрудник ещё не открывал приложение с этой версией.',
    readLabel: 'прочитано',

    // Audit
    auditTab: 'Журнал действий', noRecordsYet: 'Пока нет записей.',
    chooseLanguage: 'Выбрать язык',
  },
  en: {
    roleOwner: 'Owner', roleAdmin: 'Administrator', roleMember: 'Member',
    tierStart: 'TEAM Start', tierBusiness: 'TEAM Business',

    auditOrgCreate: (name: string) => `Organization created ("${name}")`,
    auditMemberInvite: (email: string, role: string) => `Invitation sent: ${email} (${role})`,
    auditMemberAccept: (email: string, role: string) => `${email} joined the organization (${role})`,
    auditMemberRemove: (who: string) => `Member removed: ${who}`,
    auditMemberRole: (who: string, role: string) => `Role changed: ${who} → ${role}`,
    auditSeatsPurchase: (seats: number, months: number) => `Seats purchased: ${seats} (paid for ${months} mo.)`,
    auditOrgRename: (name: string) => `Organization renamed ("${name}")`,
    auditCanAddPerm: (who: string, on: boolean) => `"Can add own messengers" permission for ${who}: ${on ? 'enabled' : 'disabled'}`,
    auditLogoUpdate: 'Organization logo updated',
    auditLogoRemove: 'Organization logo reset',
    auditSettingsUpdate: 'Organization general settings updated',
    auditVpnOn: 'Shared team VPN configured',
    auditVpnOff: 'Shared team VPN disabled',
    auditMsgAssign: (name: string) => `Messenger "${name}" assigned to employee`,
    auditQuickReplyCreate: (t: string) => `Quick reply "${t}" added`,
    auditQuickReplyUpdate: (t: string) => `Quick reply "${t}" updated`,
    auditQuickReplyDelete: 'Quick reply deleted',
    auditAlertsOn: '"Client is waiting" alerts turned on or changed',
    auditAlertsOff: '"Client is waiting" alerts turned off',
    auditAlertsTelegramOff: 'Telegram disconnected from alerts',
    auditMsgUpdate: 'Assigned messenger updated',
    auditMsgRemove: 'Assigned messenger removed',
    auditInviteCancel: (email: string) => `Invitation cancelled: ${email}`,
    auditCustomLinkCreate: (name: string) => `Custom link "${name}" created`,
    auditCustomLinkRemove: (name: string) => `Custom link "${name}" removed`,

    errEnterOrgName: 'Enter an organization name',
    errCreateOrgFailed: 'Failed to create organization',
    errEnterValidEmail: 'Enter a valid email',
    inviteSentTo: (email: string) => `Invitation sent to ${email}`,
    errInviteFailed: 'Failed to send invitation',
    confirmRemoveMember: 'Remove this member from the organization?',
    errRemoveMemberFailed: 'Failed to remove member',
    errChangePermFailed: 'Failed to change permission',
    errChangeRoleFailed: 'Failed to change role',
    errCreatePaymentFailed: 'Failed to create payment',
    errRenameFailed: 'Failed to rename',
    errImageOnly: 'Only image files can be uploaded',
    errFileTooLarge: 'File is too large (max 5 MB)',
    logoUpdated: 'Logo updated',
    errUploadLogoFailed: 'Failed to upload logo',
    logoResetDefault: 'Logo reset to default',
    errRemoveLogoFailed: 'Failed to remove logo',
    vpnSaved: 'Shared VPN saved',
    vpnDisabled: 'Shared VPN disabled',
    errSaveVpnFailed: 'Failed to save VPN',
    errDisableVpnFailed: 'Failed to disable VPN',
    themeAppliedAll: 'The theme will be applied for all employees',
    themeForceDisabled: 'Forced theme disabled',
    errSaveSettingsFailed: 'Failed to save settings',
    errAssignFillFields: 'Fill in the employee and choose a messenger (or enter your own)',
    msgAssigned: 'Messenger assigned',
    errAssignFailed: 'Failed to assign messenger',
    errDeleteAssignmentFailed: 'Failed to remove messenger',

    navNow: 'Now', navReports: 'Reports',
    auditStrict: (who: string, on: boolean) => `Strict mode for ${who}: ${on ? 'on' : 'off'}`,
    auditCommand: (kind: string, who: string, name: string | null) => `${({ pause: 'Messenger turned off', resume: 'Messenger turned on', reload: 'Messenger reloaded', relogin: 'Asked to sign in again', wipe: 'Work sessions ended' } as Record<string, string>)[kind] || kind}${name ? ` “${name}”` : ''}: ${who}`,
    auditNote: (who: string | null) => (who ? `Message to ${who}` : 'Message to the whole team'),
    auditDaily: 'Daily summary sent to Telegram',
    auditExpiry: (days: number) => (days === 0 ? 'Reminder: the subscription ends today' : `Reminder: the subscription ends in ${days} days`),
    navOverview: 'Overview', navMembers: 'Members', navBilling: 'Seats & billing', navManage: 'Manage', navAudit: 'Audit log', navReplies: 'Quick replies', navAlerts: 'Alerts', navTasks: 'Tasks', navFolders: 'Folders',

    backToDashboard: 'Back to dashboard',
    teamStartTitle: 'Centrio TEAM Start',
    teamStartDesc: 'An organization is shared seat billing for your team: invite colleagues by email, manage roles, and pay for seats yourself — no contract, no account manager.',
    perSeatMonth: 'seat / mo',
    perSeatMonthYearly: 'seat / mo when billed yearly',
    fromSeatsNote: (min: number) => `From ${min} seats. For 50+ seats, email sales@centrio.me.`,
    freeSeatsNote: (min: number) => `A minimum of ${min} seats to get started, all paid upfront — no free tier. Add more seats as your team grows. Cancel anytime.`,
    orgNameLabel: 'Organization name',
    orgNamePlaceholder: 'e.g. Acme LLC',
    creatingOrgBtn: 'Creating…',
    createOrgBtn: 'Create organization',

    orgLabel: 'Organization', yourRole: 'Your role:', personalCabinet: 'Dashboard',
    teamNav: 'Team', cabinetLabel: 'Team', skipToContent: 'Skip to content',
    openProfile: 'Open profile', logoutAccount: 'Log out of account', logout: 'Log out',

    confirmingPayment: 'Confirming seat payment…',
    paymentConfirmed: 'Payment confirmed — seats have been added to the organization.',

    overviewTitle: 'Overview',
    teamNameLabel: 'Team name',
    savingBtn: 'Saving…', saveBtn: 'Save', cancelBtn: 'Cancel', renameBtn: 'Rename',
    seatsUsedLabel: 'seats used', seatsFreeLabel: 'free', paidUntilLabel: 'paid until',
    onboardTitle: 'Getting started', onboardDoneNote: "You're all set — the team is fully configured",
    onboardStep1: 'Invite employees', onboardStep1Hint: 'Add coworkers to the organization — takes a minute',
    onboardStep2: 'Assign messengers', onboardStep2Hint: 'Pick an employee and drag the messenger you need onto them',
    onboardStep3: 'Add your company logo', onboardStep3Hint: "Your own logo instead of Centrio's default — every employee will see it",
    onboardGoBtn: 'Go',
    seatsExpiringSoon: (days: number) => `Paid seats run out in ${days} day${days === 1 ? '' : 's'} — renew so employees don't lose Team access.`,
    seatsExpiredNote: "Paid seats have expired — renew to avoid losing Team access.",
    renewSeatsBtn: 'Renew seats', buySeatsShortBtn: 'Buy seats',
    modeRenewLabel: 'Extend period', modeAddLabel: 'Add seats',
    renewHint: (n: number) => `We extend the subscription for your ${n} seats. The number of seats does not change.`,
    addHint: (days: number) => `New seats are active at once and last until the end of the paid period — ${days} days left. The price is prorated for the remaining days.`,
    orgDescOpen: 'The organization "', orgDescMid: '" is on the ',
    autoRenewOnNote: ' Seat auto-renewal is enabled.', autoRenewOffNote: ' Seat auto-renewal is disabled.',
    orgDescTail: 'Go to the "Members" tab to invite colleagues, or "Seats & billing" to buy more seats.',
    teamStatsTitle: 'Team statistics',
    teamStatsSub: 'Engagement is measured by read status — Centrio does not see message contents.',
    employeesLabel: 'employees', assignedMessengersLabel: 'messengers assigned',
    totalUnreadLabel: 'total unread', engagementLabel: 'engagement',
    loadingEllipsis: 'Loading…', noEmployeesYet: 'No employees in the organization yet.',
    messengersCountSuffix: 'messenger(s)',
    unreadCountSuffix: (n: number) => `${n} unread`,
    loginInLabel: 'Signed in', loginOutLabel: 'Sign-in needed', loginNeverLabel: 'Never opened', loginUnknownLabel: 'Sign-in unknown', loginMissingCount: (n: number) => `not signed in: ${n}`,
    loginHint: "Sign-in is detected from the messenger page inside the employee's Centrio app. Until they are signed in no messages arrive, and “0 unread” does not mean “read”.",
    allRead: 'all read', noDataStatus: 'no data', activeStatus: 'active', inactiveStatus: 'inactive for a while',

    membersTab: 'Members',
    coworkerEmailLabel: "Coworker's email", roleLabel: 'Role',
    memberSearchPlaceholder: 'Search by name or email…', noMembersFound: 'No one found',
    sendingBtn: 'Sending…', inviteBtn: 'Invite',
    noFreeSeatsMsg: 'No free seats — buy more in the "Seats & billing" tab.',
    removeBtn: 'Remove',
    messengerPaletteTitle: 'Messengers',
    messengerPaletteHint: 'Drag a messenger onto an employee card to assign it — or click "+ messenger" inside the card.',
    dropHereLabel: 'Drop here to assign',
    addMessengerBtn: 'messenger',
    assignedCountSuffix: (n: number) => `${n} assigned`,
    pendingInvitesTitle: 'Invitations awaiting acceptance',
    cancelInviteBtn: 'Cancel', confirmCancelInvite: 'Cancel this invitation?',
    sentOnPrefix: 'sent', invitedAsPrefix: 'as',
    addLinkBtn: 'custom link', createBtn: 'Create',
    customLinkNamePlaceholder: 'e.g. CRM or Wiki',
    noCustomLinks: 'No custom links yet',

    totalSeatsLabel: 'total seats', usedLabel: 'used',
    buyMoreSeatsTitle: 'Buy additional seats',
    period1MonthLabel: '1 month', period1YearLabel: '1 year',
    perSeatSuffix: '/seat', perSeatMonthlySuffix: '/seat per mo.',
    seatsCountLabel: 'Number of seats',
    fromToSeats: (min: number, max: number) => `from ${min} to ${max}`,
    totalToPayLabel: 'Total to pay',
    proceedingToPayment: 'Redirecting to payment…', payBtn: 'Pay',
    moreThan50SeatsNote: 'More than 50 seats? Email sales@centrio.me for custom terms.',
    ownerOnlyPurchaseNote: 'Only the organization owner can purchase seats.',

    manageTab: 'Manage',
    logoTitle: 'App logo',
    logoDesc: 'Replaces the default Centrio logo in the app for all employees in the organization.',
    defaultLogoLabel: 'default', uploadingBtn: 'Uploading…', uploadLogoBtn: 'Upload logo', resetBtn: 'Reset',
    vpnTitle: 'Shared team VPN',
    vpnDesc: "A VPN subscription link the app will connect automatically for all employees (if they don't already have their own active VPN).",
    nameLabel: 'Name', vpnNamePlaceholder: 'e.g. Office',
    subscriptionLinkLabel: 'Subscription link', vpnLinkPlaceholder: 'vless://... or https://.../sub',
    disableBtn: 'Disable',
    themeTitle: 'Unified theme',
    themeDesc: 'Applied for all employees in the organization. "Not set" — everyone picks their own theme.',
    themeNotSet: 'Not set', themeDark: 'Dark', themeLight: 'Light',
    assignedMessengersTitle: 'Employee messengers',
    assignedMessengersDesc: "Assign a messenger to an employee — it will appear in their app. The employee still signs in to the service with their own account.",
    employeeLabel: 'Employee', chooseEllipsis: 'Choose…', messengerLabel: 'Messenger', customOption: 'Custom…',
    linkLabel: 'Link', assignNamePlaceholder: 'e.g. CRM',
    addingBtn: 'Adding…', assignBtn: 'Assign',
    assignHint: "Below, for each employee — their list of messengers and read status (read/unread only — Centrio does not see or store message contents).",
    canAddOwnLabel: 'Can add their own messengers',
    nothingAssigned: 'Nothing assigned', removeShortBtn: 'Remove',
    vaultBtn: 'Access', vaultSavedChip: 'access saved', vaultTitle: (name: string, who: string) => `Sign-in to “${name}” — ${who}`,
    vaultInfo: "The login and password are encrypted in your browser with the employee's device key and sent only in encrypted form: the Centrio server cannot read them. The employee never sees the password — the app types it into the sign-in form of the assigned site. A saved password cannot be read back; enter it again if needed.",
    vaultLogin: 'Login', vaultPassword: 'Password', vaultSave: 'Save and share', vaultRemove: 'Remove access', vaultClose: 'Close', vaultSaving: 'Encrypting…',
    vaultDevices: "Employee's devices", vaultDeviceShared: 'access shared', vaultDeviceNot: 'not yet', vaultNoDevices: 'The employee has no registered devices yet. Ask them to update Centrio and sign in, then try again.',
    vaultDone: (n: number) => `Done: access shared to ${n} device(s)`, vaultFillBoth: 'Enter a login and a password', vaultFail: 'Could not save the access', vaultRemoved: 'Access removed', vaultNoCrypto: 'This browser does not support secure encryption',
    auditCredSet: (who: string, name: string, n: number) => `Access to “${name}” saved for ${who} (devices: ${n})`, auditCredDelete: (who: string, name: string) => `Access to “${name}” removed for ${who}`, auditCredUsed: (who: string, name: string) => `${who} used the saved sign-in to “${name}”`, auditVaultDevice: (who: string) => `${who}: a device was registered for the password vault`,
    assignVpnLabel: 'VPN for new assignments', vpnModeAuto: 'Recommended: Russian services without VPN, others with VPN', vpnModeOn: 'Always with VPN', vpnModeOff: 'Always without VPN', assignVpnHint: 'Applies to new assignments. For ones already assigned, use the “VPN” button on the messenger row. Employees cannot change it.', vpnToggleOn: 'VPN: on', vpnToggleOff: 'VPN: off', errVpnToggle: 'Could not change the VPN setting',
    whoReadsTitle: 'Who reads messages',
    noDataYetEmployee: "No data yet — the employee hasn't opened the app with this version.",
    readLabel: 'read',

    auditTab: 'Audit log', noRecordsYet: 'No records yet.',
    chooseLanguage: 'Choose language',
  },
} as const

// Same RU/EN-only switcher as dashboard/page.tsx's CabinetLangSwitcher —
// duplicated (not imported) since it's a few lines and each page already
// gets `pathname`/`s` from its own useLang()/usePathname() calls.
function CabinetLangSwitcher({ pathname, chooseLanguageLabel }: { pathname: string; chooseLanguageLabel: string }) {
  const base = basePath(pathname)
  const isEn = pathname.split('/')[1] === 'en'
  const linkStyle = (active: boolean): CSSProperties => ({
    padding: '5px 11px', fontSize: 11, fontWeight: 600, letterSpacing: '.02em', borderRadius: 6, textDecoration: 'none',
    color: active ? '#0b0f1a' : 'rgba(255,255,255,0.45)', background: active ? '#87b7ff' : 'transparent',
  })
  return (
    <div role="group" aria-label={chooseLanguageLabel} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, padding: 3, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, background: 'rgba(255,255,255,0.03)' }}>
      <a href={translatedHref(base, 'ru')} style={linkStyle(!isEn)}>RU</a>
      <a href={translatedHref(base, 'en')} style={linkStyle(isEn)}>EN</a>
    </div>
  )
}

type TeamStrings = typeof TEAM_STR['ru']

// ── Types ─────────────────────────────────────────────────────────────────
interface OrgSummary {
  orgId: string
  orgName: string
  orgSlug: string
  orgRole: 'OWNER' | 'ADMIN' | 'MEMBER'
  orgTier: 'START' | 'BUSINESS'
  orgSeatLimit: number
  orgSeatsUsed: number
  orgSeatsExpiresAt?: string | null
  orgAutoRenewSeats?: boolean
  orgIsOwner?: boolean
  orgLogoUrl?: string | null
  orgProSeat?: boolean
}

// FEATURE (2026-09-10, TEAM owner-control epic — see chat log). Backend:
// landing/org-routes.js (PATCH/DELETE .../logo, GET/PATCH .../vpn,
// GET/PATCH .../settings, .../messenger-assignments, .../messenger-stats).
interface MessengerAssignment {
  id: string
  userId: string
  name: string
  url: string
  icon?: string | null
  color?: string | null
  useVpn?: boolean
  credentialAvailable?: boolean
}

interface MessengerStat {
  userId: string
  messengerKey: string
  messengerName: string
  unreadCount: number
  lastReadAt?: string | null
  lastMessageAt?: string | null
  loginState?: 'in' | 'out' | null
  notLoggedInSince?: string | null
  lastLoggedInAt?: string | null
  user: { id: string; name?: string | null; email: string } | null
}

// Org-level reusable link template (2026-09-28) — distinct from
// MessengerAssignment, which is a per-employee assignment, not a template.
interface CustomLink {
  id: string
  name: string
  url: string
}

// Sent-but-not-yet-accepted invite (2026-09-28, live request: pending
// invites should be visible and cancellable).
interface PendingInvite {
  id: string
  email: string
  role: 'ADMIN' | 'MEMBER'
  createdAt: string
  expiresAt: string
}

interface Member {
  userId: string
  email: string
  name?: string | null
  role: 'OWNER' | 'ADMIN' | 'MEMBER'
  joinedAt: string
  // FEATURE (2026-09-17, live request — "Даже галка нужна - может добавлять
  // свои или нет"): gates whether this employee can add their own
  // messengers on top of the owner-assigned defaults below.
  canAddOwnMessengers?: boolean
  // TEAM control (2026-11-08): the employee works only in the assigned messengers
  strictMode?: boolean
}

interface AuditLog {
  id: string
  actorUserId: string
  action: string
  metaJson: any
  createdAt: string
}

type Msg = { type: 'ok' | 'err'; text: string } | null

// ── Constants ────────────────────────────────────────────────────────────
const TIER_COLOR = '#437cff'

// Mirrors SEAT_PLANS in landing/org-routes.js — keep the numbers in sync by
// hand (no shared module between the Express API and this Next.js app in
// this repo layout; see the identical sync-by-comment convention already
// used between org-routes.js and auto-renew-cron.js).
// PRICING (2026-09-29, live decision): Team seats now priced above personal
// Pro (199₽/мес, ≈133₽/мес yearly) rather than below it — matches how
// Rambox prices its Teams tier at ~2× individual Pro (see the Rambox
// pricing research done for this decision). Was 179/149.
const SEAT_PLANS = {
  month: { pricePerSeat: 389, months: 1, label: '1 месяц' },
  year: { pricePerSeat: 349, months: 12, label: '1 год' }, // billed as 4188₽/место (349×12)
} as const
// EU/US card billing (2026-09-29, live decision: "В ЛК тоже нужно цены
// менять везде... Оплата там есть eu-картами. Тоже сделай" — mirrors the
// marketing site's own €4 personal-Pro pricing scheme, same €8/€7 the
// Team pricing card on the EN/FR/IT/ZH sites shows). Shown instead of
// SEAT_PLANS, and paid via FRIDE instead of YooKassa, whenever the
// cabinet's own language is English — see seatPlansDisplay/currencySymbol
// below and handleBuySeats's provider branch.
const SEAT_PLANS_EU = {
  month: { pricePerSeat: 8, months: 1, label: '1 month' },
  year: { pricePerSeat: 7, months: 12, label: '1 year' }, // billed as €84/seat (7×12)
} as const
const MIN_SEATS = 5
const MAX_SEATS_SELF_SERVICE = 49

// FEATURE (2026-09-17, live request — "Добавлять мессенджеры нужно из
// списка. Возьми наши. Прямо с иконками. Это очень трудно - вот так вбивать
// каждый"): same icon set as the desktop app's own popular-messenger picker
// (renderer/constants.js), copied to public/messengers/ so both surfaces
// show the identical brand icons rather than favicon guesses.
type LoginKind = 'in' | 'out' | 'never' | 'unknown'

// "Never opened" = the assignment has no stat row at all; "unknown" = an older app version that does not report sign-in.
function loginKindOf(stat: MessengerStat | undefined): LoginKind {
  if (!stat) return 'never'
  if (stat.loginState === 'in') return 'in'
  if (stat.loginState === 'out') return 'out'
  return 'unknown'
}

function minutesSince(iso?: string | null): number {
  if (!iso) return 0
  return Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
}

function formatSince(minutes: number): string {
  if (minutes < 60) return `${minutes} мин`
  const h = Math.floor(minutes / 60)
  if (h < 24) return `${h} ч`
  return `${Math.floor(h / 24)} дн`
}

const POPULAR_MESSENGERS: { name: string; url: string; icon: string; vpn: boolean }[] = [
  { name: 'Telegram', url: 'https://web.telegram.org/k/', icon: '/messengers/telegram.png', vpn: true },
  { name: 'WhatsApp', url: 'https://web.whatsapp.com', icon: '/messengers/whatsapp.png', vpn: true },
  { name: 'VK', url: 'https://vk.com/im', icon: '/messengers/vk.png', vpn: false },
  { name: 'MAX', url: 'https://web.max.ru/', icon: '/messengers/max.png', vpn: false },
  { name: 'Viber', url: 'https://web.viber.com', icon: '/messengers/viber.png', vpn: true },
  { name: 'Skype', url: 'https://web.skype.com', icon: '/messengers/skype.png', vpn: true },
  { name: 'Slack', url: 'https://app.slack.com', icon: '/messengers/slack.png', vpn: true },
  { name: 'Discord', url: 'https://discord.com/app', icon: '/messengers/discord.png', vpn: true },
  { name: 'Mail.ru', url: 'https://mail.ru', icon: '/messengers/mailru.png', vpn: false },
  { name: 'Yandex Mail', url: 'https://mail.yandex.ru', icon: '/messengers/yandex.png', vpn: false },
  { name: 'Gmail', url: 'https://mail.google.com', icon: '/messengers/gmail.png', vpn: true },
  { name: 'Rambler', url: 'https://mail.rambler.ru', icon: '/messengers/rambler.png', vpn: false },
  { name: 'Bitrix24', url: 'https://www.bitrix24.ru', icon: '/messengers/bitrix.png', vpn: false },
  { name: 'AmoCRM', url: 'https://www.amocrm.ru', icon: '/messengers/amocrm.png', vpn: false },
  { name: 'Zoom', url: 'https://zoom.us/wc', icon: '/messengers/zoom.png', vpn: true },
  { name: 'Google Meet', url: 'https://meet.google.com', icon: '/messengers/googlemeet.png', vpn: true },
]

// ── Icons ────────────────────────────────────────────────────────────────
const IcoTeamBig = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
    <circle cx="9" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.6"/>
    <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
    <path d="M16 5.2c1.5.3 2.6 1.6 2.6 3.1 0 1.5-1.1 2.8-2.6 3.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
    <path d="M17.5 14.3c2.1.6 3.5 2.4 3.5 4.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
  </svg>
)
const IcoNow = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="3" fill="currentColor"/>
    <path d="M6.3 6.3a8 8 0 0 0 0 11.4M17.7 6.3a8 8 0 0 1 0 11.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
  </svg>
)
const IcoReports = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
  </svg>
)
const IcoOverview = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8"/>
    <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8"/>
    <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8"/>
    <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8"/>
  </svg>
)
const IcoUsers = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <circle cx="8.5" cy="7.5" r="3" stroke="currentColor" strokeWidth="1.8"/>
    <path d="M2 20c0-3.3 2.9-6 6.5-6s6.5 2.7 6.5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    <path d="M15 5.4c1.4.3 2.4 1.5 2.4 2.9s-1 2.6-2.4 2.9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    <path d="M16.5 14.3c2 .5 3.5 2.2 3.5 4.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
  </svg>
)
const IcoCard = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <rect x="1" y="4" width="22" height="16" rx="3" stroke="currentColor" strokeWidth="1.8"/>
    <line x1="1" y1="10" x2="23" y2="10" stroke="currentColor" strokeWidth="1.8"/>
  </svg>
)
const IcoShield = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
  </svg>
)
const IcoManage = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
  </svg>
)
const IcoReplies = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    <path d="M13 7l-3 4h4l-3 4"/>
  </svg>
)
const IcoFolders = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
  </svg>
)
const IcoTasks = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 11l3 3L22 4"/>
    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
  </svg>
)
const IcoBell = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
  </svg>
)
const IcoCrown = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
    <path d="M3 8.5l4.5 3L12 4l4.5 7.5 4.5-3-2 10.5H5L3 8.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round"/>
  </svg>
)
const IcoCheck = ({ color = '#22c55e' }: { color?: string }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
    <path d="M20 6L9 17L4 12" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)
const IcoTrash = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
    <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m3 0-.8 12.1a2 2 0 0 1-2 1.9H8.8a2 2 0 0 1-2-1.9L6 7h12Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
  </svg>
)
const IcoChevron = ({ open }: { open: boolean }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .18s ease', flexShrink: 0 }}>
    <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)
const IcoPlus = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
  </svg>
)
const IcoSend = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
    <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)
const IcoBack = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
    <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)
// Same icon as dashboard/page.tsx's IcoLogout — kept visually identical.
const IcoLogout = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    <polyline points="16 17 21 12 16 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    <line x1="21" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
  </svg>
)
// Same values as dashboard/page.tsx's PLAN_COLORS/PLAN_LABELS — the
// usercard badge below shows the member's EFFECTIVE plan (org seat OR
// personal plan, see PLAN_COLORS/orgProSeat usage in the sidebar), so it
// needs the same color/label mapping dashboard uses for consistency.
const PLAN_COLORS: Record<string, string> = { FREE: '#64748b', PRO: '#3b82f6', TEAM: '#06b6d4' }
const PLAN_LABELS: Record<string, string> = { FREE: 'Free', PRO: 'Pro', TEAM: 'Team' }

// ── Helpers ──────────────────────────────────────────────────────────────
function fmtDate(iso: string | null | undefined, dateLocale = 'ru-RU') {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(dateLocale, { day: '2-digit', month: 'long', year: 'numeric' })
}
function shortId(id: string) { return id ? `${id.slice(0, 8)}…` : '—' }

function describeAudit(log: AuditLog, byUser: Record<string, Member>, lang: Lang = 'ru') {
  const s = TEAM_STR[lang === 'en' ? 'en' : 'ru']
  const roleLabels: Record<string, string> = { OWNER: s.roleOwner, ADMIN: s.roleAdmin, MEMBER: s.roleMember }
  const meta = log.metaJson || {}
  switch (log.action) {
    case 'org.create': return s.auditOrgCreate(meta.name || '')
    case 'member.invite': return s.auditMemberInvite(meta.email, roleLabels[meta.role] || meta.role)
    case 'member.accept': return s.auditMemberAccept(meta.email, roleLabels[meta.role] || meta.role)
    case 'member.remove': {
      const who = byUser[meta.userId]?.email || shortId(meta.userId)
      return s.auditMemberRemove(who)
    }
    case 'member.role': {
      const who = byUser[meta.userId]?.email || shortId(meta.userId)
      return s.auditMemberRole(who, roleLabels[meta.role] || meta.role)
    }
    case 'seats.purchase': return s.auditSeatsPurchase(meta.seats, meta.months)
    case 'org.rename': return s.auditOrgRename(meta.name || '')
    case 'credential.set': {
      const who = byUser[meta.userId]?.email || shortId(meta.userId)
      return s.auditCredSet(who, String(meta.name || ''), Number(meta.devices || 0))
    }
    case 'credential.delete': {
      const who = byUser[meta.userId]?.email || shortId(meta.userId)
      return s.auditCredDelete(who, String(meta.name || ''))
    }
    case 'credential.used': {
      const who = byUser[log.actorUserId]?.email || shortId(log.actorUserId)
      return s.auditCredUsed(who, String(meta.name || ''))
    }
    case 'vault.device': {
      const who = byUser[log.actorUserId]?.email || shortId(log.actorUserId)
      return s.auditVaultDevice(who)
    }
    case 'member.strict': {
      const who = byUser[meta.userId]?.email || shortId(meta.userId)
      return s.auditStrict(who, !!meta.strictMode)
    }
    case 'command.pause': case 'command.resume': case 'command.reload': case 'command.relogin': case 'command.wipe': {
      const who = byUser[meta.userId]?.email || shortId(meta.userId)
      return s.auditCommand(log.action.slice(8), who, meta.name || null)
    }
    case 'note.create': return s.auditNote(meta.toUserId ? (byUser[meta.toUserId]?.email || shortId(meta.toUserId)) : null)
    case 'daily.sent': return s.auditDaily
    case 'expiry.notice': return s.auditExpiry(Number(meta.days) || 0)
    case 'member.canAddOwnMessengers': {
      const who = byUser[meta.userId]?.email || shortId(meta.userId)
      return s.auditCanAddPerm(who, !!meta.canAddOwnMessengers)
    }
    case 'org.logo.update': return s.auditLogoUpdate
    case 'org.logo.remove': return s.auditLogoRemove
    case 'org.settings.update': return s.auditSettingsUpdate
    case 'org.vpn.update': return meta.hasLink ? s.auditVpnOn : s.auditVpnOff
    case 'org.messenger.assign': return s.auditMsgAssign(meta.name || '')
    case 'org.messenger.update': return s.auditMsgUpdate
    case 'org.messenger.remove': return s.auditMsgRemove
    case 'member.invite_cancel': return s.auditInviteCancel(meta.email || '')
    case 'customlink.create': return s.auditCustomLinkCreate(meta.name || '')
    case 'customlink.delete': return s.auditCustomLinkRemove(meta.name || '')
    // Server-side action names (routes/org.js) — the org.* variants above
    // never matched what the API actually logs, so these rows showed raw codes.
    case 'org.logo': return meta.logoUrl ? s.auditLogoUpdate : s.auditLogoRemove
    case 'settings.update': return s.auditSettingsUpdate
    case 'vpn.update': return meta.hasLink ? s.auditVpnOn : s.auditVpnOff
    case 'messenger.assign': return s.auditMsgAssign(meta.name || '')
    case 'messenger.unassign': return s.auditMsgRemove
    case 'quickReply.create': return s.auditQuickReplyCreate(meta.title || '')
    case 'quickReply.update': return s.auditQuickReplyUpdate(meta.title || '')
    case 'quickReply.delete': return s.auditQuickReplyDelete
    case 'alerts.update': return meta.enabled ? s.auditAlertsOn : s.auditAlertsOff
    case 'alerts.telegramUnlink': return s.auditAlertsTelegramOff
    default: return log.action
  }
}

// ── Main ─────────────────────────────────────────────────────────────────
// useSearchParams() (?payment=success after a YooKassa redirect) requires a
// Suspense boundary at build time, same reasoning as dashboard-server.tsx.
export default function TeamPage() {
  return (
    <Suspense fallback={null}>
      <TeamPageInner />
    </Suspense>
  )
}

function TeamPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname() || '/team'
  const paymentStatus = searchParams.get('payment')
  const { user, _hasHydrated, setUser, logout } = useAuthStore()
  const { lang } = useLang()
  const s = TEAM_STR[lang === 'en' ? 'en' : 'ru']
  const seatPlansDisplay = lang === 'en' ? SEAT_PLANS_EU : SEAT_PLANS
  const currencySymbol = lang === 'en' ? '€' : '₽'
  const dateLocale = lang === 'en' ? 'en-US' : 'ru-RU'
  const ROLE_LABELS: Record<string, string> = { OWNER: s.roleOwner, ADMIN: s.roleAdmin, MEMBER: s.roleMember }
  const TIER_LABELS: Record<string, string> = { START: s.tierStart, BUSINESS: s.tierBusiness }

  const [tab, setTab] = useState<'now' | 'reports' | 'overview' | 'members' | 'billing' | 'audit' | 'manage' | 'replies' | 'alerts' | 'tasks' | 'folders'>(() => {
    const requested = searchParams.get('tab')
    return requested === 'alerts' || requested === 'replies' || requested === 'tasks' || requested === 'folders' || requested === 'now' || requested === 'reports' ? requested : 'overview'
  })
  const [org, setOrg] = useState<OrgSummary | null>((user?.orgSummary as OrgSummary) ?? null)

  // Create-org (no-org state)
  const [orgNameDraft, setOrgNameDraft] = useState('')
  const [creatingOrg, setCreatingOrg] = useState(false)
  const [createOrgMsg, setCreateOrgMsg] = useState<Msg>(null)

  // Members
  const [members, setMembers] = useState<Member[]>([])
  // UX (2026-09-28, "список сотрудников неудобен при росте команды" — live
  // request): client-side filter by name/email, no new API call needed —
  // the members list is already fully loaded for this tab.
  const [memberSearch, setMemberSearch] = useState('')
  const [loadingMembers, setLoadingMembers] = useState(false)

  // Invite
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'MEMBER' | 'ADMIN'>('MEMBER')
  const [inviting, setInviting] = useState(false)
  const [inviteMsg, setInviteMsg] = useState<Msg>(null)

  // Member row actions
  const [removingUserId, setRemovingUserId] = useState<string | null>(null)
  const [roleUpdatingUserId, setRoleUpdatingUserId] = useState<string | null>(null)
  const [memberActionMsg, setMemberActionMsg] = useState<Msg>(null)

  // Billing / seats
  const [seatsPeriod, setSeatsPeriod] = useState<'month' | 'year'>('month')
  const [seatsCount, setSeatsCount] = useState(MIN_SEATS)
  const [buyMode, setBuyMode] = useState<'renew' | 'add'>('renew')
  const [buyingSeats, setBuyingSeats] = useState(false)
  const [buyMsg, setBuyMsg] = useState<Msg>(null)
  const [paymentBanner, setPaymentBanner] = useState<'checking' | 'ok' | null>(paymentStatus === 'success' ? 'checking' : null)

  // Audit
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [loadingAudit, setLoadingAudit] = useState(false)

  // Переименование команды (2026-09-11, "сделать в ЛК возможность изменить
  // названия команды" — live user request)
  const [renamingOrg, setRenamingOrg] = useState(false)
  const [orgRenameDraft, setOrgRenameDraft] = useState('')
  const [savingOrgRename, setSavingOrgRename] = useState(false)
  const [orgRenameMsg, setOrgRenameMsg] = useState<Msg>(null)

  // ── Управление (2026-09-10, TEAM owner-control epic) ──────────────────
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [logoMsg, setLogoMsg] = useState<Msg>(null)

  const [vpnName, setVpnName] = useState('')
  const [vpnLink, setVpnLink] = useState('')
  const [savingVpn, setSavingVpn] = useState(false)
  const [vpnMsg, setVpnMsg] = useState<Msg>(null)

  const [forcedTheme, setForcedTheme] = useState<string>('')
  const [savingSettings, setSavingSettings] = useState(false)
  const [settingsMsg, setSettingsMsg] = useState<Msg>(null)

  const [permUpdatingUserId, setPermUpdatingUserId] = useState<string | null>(null)
  const [assignments, setAssignments] = useState<MessengerAssignment[]>([])
  const [loadingAssignments, setLoadingAssignments] = useState(false)
  const [assignName, setAssignName] = useState('')
  const [assignUrl, setAssignUrl] = useState('')
  const [assignPreset, setAssignPreset] = useState('')
  const [vaultTarget, setVaultTarget] = useState<{ assignment: MessengerAssignment; memberName: string } | null>(null)
  const [vaultLogin, setVaultLogin] = useState('')
  const [vaultPassword, setVaultPassword] = useState('')
  const [vaultShow, setVaultShow] = useState(false)
  const [vaultBusy, setVaultBusy] = useState(false)
  const [vaultMsg, setVaultMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [vaultDevices, setVaultDevices] = useState<{ id: string; name?: string | null; shared: boolean }[] | null>(null)
  const [assignVpnMode, setAssignVpnMode] = useState<'auto' | 'on' | 'off'>('auto')
  const resolveVpn = (preset?: { vpn?: boolean }) => assignVpnMode === 'on' ? true : assignVpnMode === 'off' ? false : (preset?.vpn ?? true)
  const [savingAssignment, setSavingAssignment] = useState(false)
  const [assignMsg, setAssignMsg] = useState<Msg>(null)

  const [stats, setStats] = useState<MessengerStat[]>([])
  const [loadingStats, setLoadingStats] = useState(false)

  // ── Employees redesign (2026-09-28, "перетаскивание, раскрытие
  // пользователей, внутри пользователей настраивать мессенджеров" — live
  // user request): expandable per-employee cards on the Members tab now
  // carry everything that used to live split across Members (roster) and
  // Manage (assignment/stats) — plus drag-a-preset-onto-a-card assignment.
  const [expandedUserIds, setExpandedUserIds] = useState<Set<string>>(new Set())
  const [addingMessengerFor, setAddingMessengerFor] = useState<string | null>(null)
  const [dragOverUserId, setDragOverUserId] = useState<string | null>(null)
  const [quickAssigningUserId, setQuickAssigningUserId] = useState<string | null>(null)

  // Custom link catalog (2026-09-28, "давать свои собственные ссылки...
  // создавать ссылки для перетягивания" — live request): org-level,
  // reusable, drag-and-drop-able just like the built-in messenger presets.
  const [customLinks, setCustomLinks] = useState<CustomLink[]>([])
  const [loadingCustomLinks, setLoadingCustomLinks] = useState(false)
  const [addingCustomLink, setAddingCustomLink] = useState(false)
  const [customLinkName, setCustomLinkName] = useState('')
  const [customLinkUrl, setCustomLinkUrl] = useState('')
  const [savingCustomLink, setSavingCustomLink] = useState(false)

  // Pending invites (2026-09-28, "отправленные приглашения мы должны
  // видеть" — live request): sent-but-not-accepted invites, with cancel.
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([])
  const [loadingPendingInvites, setLoadingPendingInvites] = useState(false)
  const [cancelingInviteId, setCancelingInviteId] = useState<string | null>(null)

  useEffect(() => {
    if (_hasHydrated && !user) router.push(lang === 'en' ? '/en/auth/login' : '/auth/login')
  }, [user, _hasHydrated, router])

  // Keep local org state in sync if the store's copy changes elsewhere
  // (e.g. a fresh /api/auth/me on another tab writes a newer orgSummary).
  useEffect(() => {
    setOrg((user?.orgSummary as OrgSummary) ?? null)
  }, [user?.orgSummary])

  const refreshOrg = useCallback(async () => {
    if (!org?.orgId || !user) return
    try {
      const { data } = await api.get(`/api/org/${org.orgId}`)
      if (data?.success) {
        setOrg(data.data)
        setUser({ ...user, orgSummary: data.data })
      }
    } catch {
      // best-effort — keep showing the last known org state
    }
  }, [org?.orgId, user, setUser])

  useEffect(() => {
    if (org?.orgId) refreshOrg()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org?.orgId])

  const loadMembers = useCallback(async () => {
    if (!org?.orgId) return
    setLoadingMembers(true)
    try {
      const { data } = await api.get(`/api/org/${org.orgId}/members`)
      if (data?.success) setMembers(data.data)
    } catch {} finally { setLoadingMembers(false) }
  }, [org?.orgId])

  useEffect(() => { loadMembers() }, [loadMembers])

  useEffect(() => {
    if (tab !== 'audit' || !org?.orgId) return
    setLoadingAudit(true)
    api.get(`/api/org/${org.orgId}/audit`)
      .then(({ data }) => { if (data?.success) setAuditLogs(data.data) })
      .catch(() => {})
      .finally(() => setLoadingAudit(false))
  }, [tab, org?.orgId])

  useEffect(() => {
    // FEATURE (2026-09-17, "На странице Обзор - должна быть статистика"):
    // assignments + read-status stats now also feed the Overview tab's
    // engagement summary, not just the Manage tab's per-employee cards.
    // Shared VPN / forced theme stay Manage-only — nothing to show on
    // Overview for those.
    // FEATURE (2026-09-28, employees redesign): the Members tab's
    // expandable cards now also show assigned messengers + read status
    // inline, so it needs the same data.
    if (!(tab === 'manage' || tab === 'overview' || tab === 'members') || !org?.orgId) return

    if (tab === 'manage') {
      api.get(`/api/org/${org.orgId}/vpn`).then(({ data }) => {
        if (data?.success && data.data) {
          setVpnName(data.data.name || '')
          setVpnLink(data.data.link || '')
        }
      }).catch(() => {})

      api.get(`/api/org/${org.orgId}/settings`).then(({ data }) => {
        if (data?.success && data.data?.theme) setForcedTheme(data.data.theme)
      }).catch(() => {})
    }

    setLoadingAssignments(true)
    api.get(`/api/org/${org.orgId}/messenger-assignments`)
      .then(({ data }) => { if (data?.success) setAssignments(data.data) })
      .catch(() => {})
      .finally(() => setLoadingAssignments(false))

    if (canManage) {
      setLoadingStats(true)
      api.get(`/api/org/${org.orgId}/messenger-stats`)
        .then(({ data }) => { if (data?.success) setStats(data.data) })
        .catch(() => {})
        .finally(() => setLoadingStats(false))
    }

    if (tab === 'members' && canManage) {
      setLoadingCustomLinks(true)
      api.get(`/api/org/${org.orgId}/custom-links`)
        .then(({ data }) => { if (data?.success) setCustomLinks(data.data) })
        .catch(() => {})
        .finally(() => setLoadingCustomLinks(false))

      setLoadingPendingInvites(true)
      api.get(`/api/org/${org.orgId}/invites`)
        .then(({ data }) => { if (data?.success) setPendingInvites(data.data) })
        .catch(() => {})
        .finally(() => setLoadingPendingInvites(false))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, org?.orgId])

  // Best-effort confirmation after the YooKassa redirect. There's no
  // paymentId in the return_url (YooKassa doesn't reliably append one — see
  // the identical situation in payment-success.tsx), so this just polls the
  // org summary a few times to pick up the webhook's (or, if that's not
  // wired up yet — see org-routes.js's operational-blocker comment — a
  // manual GET /api/org/:orgId's own recompute) eventual result.
  useEffect(() => {
    if (paymentStatus !== 'success' || !org?.orgId) return
    let cancelled = false
    ;(async () => {
      for (let i = 0; i < 5 && !cancelled; i++) {
        await refreshOrg()
        await new Promise(r => setTimeout(r, 2500))
      }
      if (!cancelled) setPaymentBanner('ok')
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentStatus, org?.orgId])

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreateOrgMsg(null)
    const name = orgNameDraft.trim()
    if (!name) { setCreateOrgMsg({ type: 'err', text: s.errEnterOrgName }); return }
    setCreatingOrg(true)
    try {
      const { data } = await api.post('/api/org', { name })
      if (data?.success && user) {
        const created: OrgSummary = {
          orgId: data.data.id,
          orgName: data.data.name,
          orgSlug: data.data.slug,
          orgRole: 'OWNER',
          orgTier: data.data.tier,
          orgSeatLimit: data.data.seatLimit,
          orgSeatsUsed: 1,
          orgIsOwner: true,
        }
        setOrg(created)
        setUser({ ...user, orgSummary: created })
        setTab('members')
      }
    } catch (err: any) {
      setCreateOrgMsg({ type: 'err', text: err.response?.data?.error || s.errCreateOrgFailed })
    } finally {
      setCreatingOrg(false)
    }
  }

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setInviteMsg(null)
    const email = inviteEmail.trim().toLowerCase()
    if (!email || !email.includes('@')) { setInviteMsg({ type: 'err', text: s.errEnterValidEmail }); return }
    if (!org) return
    setInviting(true)
    try {
      const { data } = await api.post(`/api/org/${org.orgId}/invites`, { email, role: inviteRole })
      if (data?.success) {
        setInviteMsg({ type: 'ok', text: s.inviteSentTo(email) })
        setInviteEmail('')
        setInviteRole('MEMBER')
        setPendingInvites(prev => [{ id: data.data.id, email: data.data.email, role: data.data.role, createdAt: new Date().toISOString(), expiresAt: data.data.expiresAt }, ...prev])
        refreshOrg()
      }
    } catch (err: any) {
      setInviteMsg({ type: 'err', text: err.response?.data?.error || s.errInviteFailed })
    } finally {
      setInviting(false)
    }
  }

  const handleRemoveMember = async (userId: string) => {
    if (!org) return
    if (!window.confirm(s.confirmRemoveMember)) return
    setRemovingUserId(userId)
    setMemberActionMsg(null)
    try {
      await api.delete(`/api/org/${org.orgId}/members/${userId}`)
      setMembers(prev => prev.filter(m => m.userId !== userId))
      refreshOrg()
    } catch (err: any) {
      setMemberActionMsg({ type: 'err', text: err.response?.data?.error || s.errRemoveMemberFailed })
    } finally {
      setRemovingUserId(null)
    }
  }

  const handleToggleCanAdd = async (userId: string, value: boolean) => {
    if (!org) return
    setPermUpdatingUserId(userId)
    const prevMembers = members
    setMembers(list => list.map(m => m.userId === userId ? { ...m, canAddOwnMessengers: value } : m))
    try {
      await api.patch(`/api/org/${org.orgId}/members/${userId}`, { canAddOwnMessengers: value })
    } catch {
      setMembers(prevMembers)
      setAssignMsg({ type: 'err', text: s.errChangePermFailed })
    } finally {
      setPermUpdatingUserId(null)
    }
  }

  const handleToggleStrict = async (userId: string, value: boolean) => {
    if (!org) return
    setPermUpdatingUserId(userId)
    const prevMembers = members
    setMembers(list => list.map(m => m.userId === userId ? { ...m, strictMode: value } : m))
    try {
      await api.patch(`/api/org/${org.orgId}/members/${userId}`, { strictMode: value })
    } catch {
      setMembers(prevMembers)
      setAssignMsg({ type: 'err', text: s.errChangePermFailed })
    } finally {
      setPermUpdatingUserId(null)
    }
  }

  const handleChangeRole = async (userId: string, role: 'ADMIN' | 'MEMBER') => {
    if (!org) return
    setRoleUpdatingUserId(userId)
    setMemberActionMsg(null)
    try {
      await api.patch(`/api/org/${org.orgId}/members/${userId}`, { role })
      setMembers(prev => prev.map(m => m.userId === userId ? { ...m, role } : m))
    } catch (err: any) {
      setMemberActionMsg({ type: 'err', text: err.response?.data?.error || s.errChangeRoleFailed })
    } finally {
      setRoleUpdatingUserId(null)
    }
  }

  // PRICING (2026-09-29, live decision: "Оплата там есть eu-картами. Тоже
  // сделай"): an English-language cabinet bills in EUR via FRIDE (org.js's
  // /seats/create-payment-fride, mirroring how the marketing site's own
  // EN/FR/IT/ZH pages only ever show € pricing) instead of RUB via
  // YooKassa — same split the personal dashboard's price headline already
  // uses (lang === 'en' ? '4' : '199'), just extended to Team seats, which
  // never had it at all before this change.
  const handleBuySeats = async () => {
    if (!org) return
    setBuyMsg(null)
    setBuyingSeats(true)
    try {
      const endpoint = lang === 'en' ? 'create-payment-fride' : 'create-payment'
      const { data } = await api.post(`/api/org/${org.orgId}/seats/${endpoint}`, { seats: seatsCount, period: seatsPeriod, ...(orgActive ? { mode: buyMode } : {}) })
      const redirectUrl = data?.data?.confirmationUrl || data?.data?.paymentUrl
      if (data?.success && redirectUrl) {
        window.location.href = redirectUrl
      } else {
        setBuyMsg({ type: 'err', text: s.errCreatePaymentFailed })
        setBuyingSeats(false)
      }
    } catch (err: any) {
      setBuyMsg({ type: 'err', text: err.response?.data?.error || s.errCreatePaymentFailed })
      setBuyingSeats(false)
    }
  }

  const handleRenameOrg = async () => {
    if (!org) return
    const name = orgRenameDraft.trim()
    if (!name) { setOrgRenameMsg({ type: 'err', text: s.errEnterOrgName }); return }
    setSavingOrgRename(true)
    setOrgRenameMsg(null)
    try {
      const { data } = await api.patch(`/api/org/${org.orgId}`, { name })
      if (data?.success) {
        setOrg(data.data)
        if (user) setUser({ ...(user as any), orgSummary: data.data })
        setRenamingOrg(false)
      } else {
        setOrgRenameMsg({ type: 'err', text: data?.error || s.errRenameFailed })
      }
    } catch (err: any) {
      setOrgRenameMsg({ type: 'err', text: err.response?.data?.error || s.errRenameFailed })
    } finally {
      setSavingOrgRename(false)
    }
  }

  // ── Управление (2026-09-10, TEAM owner-control epic) — handlers ───────
  // BUGFIX (2026-09-17, live report: "Лого не подгружается. Файл не
  // загружен, пишет. Разные форматы пробовали" — the format never mattered,
  // the body was never being parsed as multipart at all): the shared `api`
  // axios instance (src/lib/api.ts) is created with a hardcoded
  // `headers: {'Content-Type': 'application/json'}` default. That default
  // persists even when the request body is a FormData object — axios does
  // NOT reliably strip an explicitly-set instance-level Content-Type in
  // favor of the browser's own multipart boundary (a well-known axios
  // gotcha, unrelated to the axios version comment that used to be here).
  // The request went out as literally `Content-Type: application/json`
  // with a raw FormData body — multer/busboy on the API side can't parse
  // that as multipart at all, so `req.file` stayed undefined and the API
  // (org.js) correctly reported "Файл не загружен" no matter what image
  // format was picked. Fix: explicitly clear Content-Type on THIS call so
  // axios/the browser sets the correct `multipart/form-data; boundary=...`
  // header itself.
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !org || uploadingLogo) return
    if (!file.type.startsWith('image/')) { setLogoMsg({ type: 'err', text: s.errImageOnly }); return }
    if (file.size > 5 * 1024 * 1024) { setLogoMsg({ type: 'err', text: s.errFileTooLarge }); return }

    setUploadingLogo(true)
    setLogoMsg(null)
    try {
      const formData = new FormData()
      formData.append('logo', file)
      const { data } = await api.patch(`/api/org/${org.orgId}/logo`, formData, { headers: { 'Content-Type': undefined } })
      if (data?.success) {
        const updated = { ...org, orgLogoUrl: data.data.logoUrl }
        setOrg(updated)
        if (user) setUser({ ...(user as any), orgSummary: updated })
        setLogoMsg({ type: 'ok', text: s.logoUpdated })
      }
    } catch (err: any) {
      setLogoMsg({ type: 'err', text: err.response?.data?.error || s.errUploadLogoFailed })
    } finally {
      setUploadingLogo(false)
    }
  }

  const handleRemoveLogo = async () => {
    if (!org) return
    setUploadingLogo(true)
    setLogoMsg(null)
    try {
      await api.delete(`/api/org/${org.orgId}/logo`)
      const updated = { ...org, orgLogoUrl: null }
      setOrg(updated)
      if (user) setUser({ ...(user as any), orgSummary: updated })
      setLogoMsg({ type: 'ok', text: s.logoResetDefault })
    } catch (err: any) {
      setLogoMsg({ type: 'err', text: err.response?.data?.error || s.errRemoveLogoFailed })
    } finally {
      setUploadingLogo(false)
    }
  }

  const handleSaveVpn = async () => {
    if (!org) return
    setSavingVpn(true)
    setVpnMsg(null)
    try {
      const { data } = await api.patch(`/api/org/${org.orgId}/vpn`, { name: vpnName.trim() || null, link: vpnLink.trim() || null })
      if (data?.success) setVpnMsg({ type: 'ok', text: data.data ? s.vpnSaved : s.vpnDisabled })
    } catch (err: any) {
      setVpnMsg({ type: 'err', text: err.response?.data?.error || s.errSaveVpnFailed })
    } finally {
      setSavingVpn(false)
    }
  }

  const handleClearVpn = async () => {
    setVpnName('')
    setVpnLink('')
    if (!org) return
    setSavingVpn(true)
    setVpnMsg(null)
    try {
      await api.patch(`/api/org/${org.orgId}/vpn`, { name: null, link: null })
      setVpnMsg({ type: 'ok', text: s.vpnDisabled })
    } catch (err: any) {
      setVpnMsg({ type: 'err', text: err.response?.data?.error || s.errDisableVpnFailed })
    } finally {
      setSavingVpn(false)
    }
  }

  const handleSaveTheme = async (theme: string) => {
    if (!org) return
    setForcedTheme(theme)
    setSavingSettings(true)
    setSettingsMsg(null)
    try {
      const settings = theme ? { theme } : null
      await api.patch(`/api/org/${org.orgId}/settings`, { settings })
      setSettingsMsg({ type: 'ok', text: theme ? s.themeAppliedAll : s.themeForceDisabled })
    } catch (err: any) {
      setSettingsMsg({ type: 'err', text: err.response?.data?.error || s.errSaveSettingsFailed })
    } finally {
      setSavingSettings(false)
    }
  }

  const handleAddAssignment = async (e: React.FormEvent, userId: string) => {
    e.preventDefault()
    if (!org) return
    const name = assignName.trim()
    const url = assignUrl.trim()
    if (!userId || !name || !url) { setAssignMsg({ type: 'err', text: s.errAssignFillFields }); return }
    setSavingAssignment(true)
    setAssignMsg(null)
    try {
      const presetIdx = assignPreset !== '' && assignPreset !== 'custom' ? Number(assignPreset) : -1
      const icon = presetIdx >= 0 ? `${window.location.origin}${POPULAR_MESSENGERS[presetIdx].icon}` : undefined
      const { data } = await api.post(`/api/org/${org.orgId}/messenger-assignments`, { userId, name, url, icon, useVpn: resolveVpn(presetIdx >= 0 ? POPULAR_MESSENGERS[presetIdx] : undefined) })
      if (data?.success) {
        setAssignments(prev => [...prev, data.data])
        setAssignName('')
        setAssignUrl('')
        setAssignPreset('')
        setAddingMessengerFor(null)
        setAssignMsg({ type: 'ok', text: s.msgAssigned })
      }
    } catch (err: any) {
      setAssignMsg({ type: 'err', text: err.response?.data?.error || s.errAssignFailed })
    } finally {
      setSavingAssignment(false)
    }
  }

  const closeVault = () => {
    setVaultTarget(null); setVaultLogin(''); setVaultPassword(''); setVaultShow(false); setVaultMsg(null); setVaultDevices(null)
  }

  const openVault = async (assignment: MessengerAssignment, memberName: string) => {
    if (!org) return
    setVaultTarget({ assignment, memberName }); setVaultLogin(''); setVaultPassword(''); setVaultShow(false); setVaultMsg(null); setVaultDevices(null)
    try {
      const { data } = await api.get(`/api/org/${org.orgId}/messenger-assignments/${assignment.id}/credentials/status`)
      setVaultDevices(data?.data?.devices || [])
    } catch { setVaultDevices([]) }
  }

  const saveVault = async () => {
    if (!org || !vaultTarget) return
    if (!vaultSupported()) { setVaultMsg({ type: 'err', text: s.vaultNoCrypto }); return }
    if (!vaultLogin.trim() || !vaultPassword) { setVaultMsg({ type: 'err', text: s.vaultFillBoth }); return }
    setVaultBusy(true); setVaultMsg(null)
    try {
      const { assignment } = vaultTarget
      const { data: keysRes } = await api.get(`/api/org/${org.orgId}/members/${assignment.userId}/device-keys`)
      const keys: { id: string; publicKey: string }[] = keysRes?.data || []
      if (keys.length === 0) { setVaultMsg({ type: 'err', text: s.vaultNoDevices }); return }
      const entries = await Promise.all(keys.map(async k => ({
        deviceKeyId: k.id,
        blob: await encryptForDevice({ u: vaultLogin.trim(), p: vaultPassword }, k.publicKey, `${org.orgId}|${assignment.id}|${k.id}`)
      })))
      await api.put(`/api/org/${org.orgId}/messenger-assignments/${assignment.id}/credentials`, { entries })
      setAssignments(list => list.map(a => a.id === assignment.id ? { ...a, credentialAvailable: true } : a))
      setVaultLogin(''); setVaultPassword(''); setVaultShow(false)
      setVaultDevices(keys.map(k => ({ id: k.id, shared: true })))
      setVaultMsg({ type: 'ok', text: s.vaultDone(entries.length) })
    } catch (err: any) {
      setVaultMsg({ type: 'err', text: err?.response?.data?.error || s.vaultFail })
    } finally { setVaultBusy(false) }
  }

  const removeVault = async () => {
    if (!org || !vaultTarget) return
    setVaultBusy(true); setVaultMsg(null)
    try {
      await api.delete(`/api/org/${org.orgId}/messenger-assignments/${vaultTarget.assignment.id}/credentials`)
      const id = vaultTarget.assignment.id
      setAssignments(list => list.map(a => a.id === id ? { ...a, credentialAvailable: false } : a))
      setVaultDevices(list => (list || []).map(d => ({ ...d, shared: false })))
      setVaultMsg({ type: 'ok', text: s.vaultRemoved })
    } catch (err: any) {
      setVaultMsg({ type: 'err', text: err?.response?.data?.error || s.vaultFail })
    } finally { setVaultBusy(false) }
  }

  const handleToggleAssignmentVpn = async (id: string, value: boolean) => {
    if (!org) return
    const prev = assignments
    setAssignments(list => list.map(a => a.id === id ? { ...a, useVpn: value } : a))
    try {
      await api.patch(`/api/org/${org.orgId}/messenger-assignments/${id}`, { useVpn: value })
    } catch {
      setAssignments(prev)
      setAssignMsg({ type: 'err', text: s.errVpnToggle })
    }
  }

  const handleDeleteAssignment = async (id: string) => {
    if (!org) return
    try {
      await api.delete(`/api/org/${org.orgId}/messenger-assignments/${id}`)
      setAssignments(prev => prev.filter(a => a.id !== id))
    } catch {
      setAssignMsg({ type: 'err', text: s.errDeleteAssignmentFailed })
    }
  }

  // Drag-and-drop assignment (2026-09-28): dropping a messenger preset from
  // the palette directly onto an employee card assigns it immediately,
  // without opening the inline form — same endpoint as handleAddAssignment,
  // just with the preset's own name/url/icon instead of the shared draft
  // state (which stays free for the manual per-card form).
  const handleQuickAssign = async (userId: string, presetIdx: number) => {
    if (!org) return
    const preset = POPULAR_MESSENGERS[presetIdx]
    if (!preset) return
    setQuickAssigningUserId(userId)
    setAssignMsg(null)
    try {
      const icon = `${window.location.origin}${preset.icon}`
      const { data } = await api.post(`/api/org/${org.orgId}/messenger-assignments`, { userId, name: preset.name, url: preset.url, icon, useVpn: resolveVpn(preset) })
      if (data?.success) {
        setAssignments(prev => [...prev, data.data])
        setExpandedUserIds(prev => new Set(prev).add(userId))
      }
    } catch (err: any) {
      setAssignMsg({ type: 'err', text: err.response?.data?.error || s.errAssignFailed })
    } finally {
      setQuickAssigningUserId(null)
    }
  }

  const toggleExpanded = (userId: string) => {
    setExpandedUserIds(prev => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  // Same idea as handleQuickAssign, but for a saved custom link template
  // instead of a POPULAR_MESSENGERS preset — dragged onto an employee card,
  // creates a regular assignment from the template's name/url.
  const handleQuickAssignCustom = async (userId: string, link: CustomLink) => {
    if (!org) return
    setQuickAssigningUserId(userId)
    setAssignMsg(null)
    try {
      const { data } = await api.post(`/api/org/${org.orgId}/messenger-assignments`, { userId, name: link.name, url: link.url, useVpn: resolveVpn() })
      if (data?.success) {
        setAssignments(prev => [...prev, data.data])
        setExpandedUserIds(prev => new Set(prev).add(userId))
      }
    } catch (err: any) {
      setAssignMsg({ type: 'err', text: err.response?.data?.error || s.errAssignFailed })
    } finally {
      setQuickAssigningUserId(null)
    }
  }

  const handleAddCustomLink = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!org) return
    const name = customLinkName.trim()
    const url = customLinkUrl.trim()
    if (!name || !url) return
    setSavingCustomLink(true)
    try {
      const { data } = await api.post(`/api/org/${org.orgId}/custom-links`, { name, url })
      if (data?.success) {
        setCustomLinks(prev => [...prev, data.data])
        setCustomLinkName('')
        setCustomLinkUrl('')
        setAddingCustomLink(false)
      }
    } catch (err: any) {
      setAssignMsg({ type: 'err', text: err.response?.data?.error || s.errAssignFailed })
    } finally {
      setSavingCustomLink(false)
    }
  }

  const handleDeleteCustomLink = async (id: string) => {
    if (!org) return
    try {
      await api.delete(`/api/org/${org.orgId}/custom-links/${id}`)
      setCustomLinks(prev => prev.filter(c => c.id !== id))
    } catch {
      setAssignMsg({ type: 'err', text: s.errDeleteAssignmentFailed })
    }
  }

  const handleCancelInvite = async (id: string) => {
    if (!org) return
    setCancelingInviteId(id)
    try {
      await api.delete(`/api/org/${org.orgId}/invites/${id}`)
      setPendingInvites(prev => prev.filter(i => i.id !== id))
      refreshOrg()
    } catch (err: any) {
      setMemberActionMsg({ type: 'err', text: err.response?.data?.error || s.errInviteFailed })
    } finally {
      setCancelingInviteId(null)
    }
  }

  // ?tab=alerts / ?tab=replies from an email or Telegram link: fall back to
  // Overview once the role is known and it doesn't grant that tab.
  useEffect(() => {
    const role = org?.orgRole
    if (!role) return
    if ((tab === 'alerts' && role !== 'OWNER') || ((tab === 'replies' || tab === 'tasks' || tab === 'folders' || tab === 'now' || tab === 'reports') && role === 'MEMBER')) setTab('overview')
  }, [org?.orgRole, tab])

  if (!_hasHydrated || (_hasHydrated && !user)) {
    return (
      <div className="dash-shell" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 38, height: 38, border: '3px solid rgba(67,124,255,0.25)', borderTopColor: TIER_COLOR, borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
      </div>
    )
  }

  const byUser = Object.fromEntries(members.map(m => [m.userId, m]))
  // While the paid period is alive an order is either a renewal (same seats, longer period) or a top-up (more seats for the rest of the period)
  const orgActive = !!(org?.orgSeatsExpiresAt && new Date(org.orgSeatsExpiresAt).getTime() > Date.now())
  const orgDaysLeft = orgActive ? Math.max(1, Math.ceil((new Date(org.orgSeatsExpiresAt as string).getTime() - Date.now()) / 86400000)) : 0
  const addMode = orgActive && buyMode === 'add'
  const renewMode = orgActive && buyMode === 'renew'
  const minSeatsNow = addMode ? 1 : MIN_SEATS
  const maxSeatsNow = addMode ? Math.max(1, MAX_SEATS_SELF_SERVICE - (org?.orgSeatLimit || 0)) : MAX_SEATS_SELF_SERVICE
  const totalPrice = addMode
    ? Math.max(1, Math.round(seatPlansDisplay.month.pricePerSeat * seatsCount * Math.min(1, orgDaysLeft / 30)))
    : renewMode
      ? seatPlansDisplay[seatsPeriod].pricePerSeat * (org?.orgSeatLimit || 0) * (seatsPeriod === 'year' ? 12 : 1)
      : seatPlansDisplay[seatsPeriod].pricePerSeat * seatsCount * (seatsPeriod === 'year' ? 12 : 1)
  const canManage = org?.orgRole === 'OWNER' || org?.orgRole === 'ADMIN'
  const isOwner = org?.orgRole === 'OWNER'
  const freeSeats = org ? Math.max(0, org.orgSeatLimit - org.orgSeatsUsed) : 0

  const NAV: {key:typeof tab;label:string;Icon:React.ComponentType}[] = [
    ...(canManage ? [{ key: 'now' as const, label: s.navNow, Icon: IcoNow }] : []),
    { key: 'overview', label: s.navOverview, Icon: IcoOverview },
    { key: 'members', label: s.navMembers, Icon: IcoUsers },
    { key: 'billing', label: s.navBilling, Icon: IcoCard },
    ...(isOwner ? [{ key: 'manage' as const, label: s.navManage, Icon: IcoManage }] : []),
    ...(canManage ? [{ key: 'tasks' as const, label: s.navTasks, Icon: IcoTasks }] : []),
    ...(canManage ? [{ key: 'folders' as const, label: s.navFolders, Icon: IcoFolders }] : []),
    ...(canManage ? [{ key: 'replies' as const, label: s.navReplies, Icon: IcoReplies }] : []),
    ...(isOwner ? [{ key: 'alerts' as const, label: s.navAlerts, Icon: IcoBell }] : []),
    ...(canManage ? [{ key: 'reports' as const, label: s.navReports, Icon: IcoReports }] : []),
    ...(canManage ? [{ key: 'audit' as const, label: s.navAudit, Icon: IcoShield }] : []),
  ] as const

  return (
    <div className="dash-shell team-shell">
      {!org ? (
        // ════════════════ NO-ORG STATE: create org ════════════════
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, position: 'relative', zIndex: 1 }}>
          <div className="glass-card" style={{ maxWidth: 520, width: '100%', padding: 40 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 10 }}>
              <a href={lang === 'en' ? '/en/dashboard' : '/dashboard'} className="btn-ghost" style={{ display: 'inline-flex', padding: '7px 12px', fontSize: 12.5 }}>
                <IcoBack /> {s.backToDashboard}
              </a>
              <CabinetLangSwitcher pathname={pathname} chooseLanguageLabel={s.chooseLanguage} />
            </div>
            <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(67,124,255,0.12)', border: '1px solid rgba(67,124,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#87b7ff', marginBottom: 20 }}>
              <IcoTeamBig />
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-.03em', marginBottom: 10 }}>{s.teamStartTitle}</h1>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', lineHeight: 1.65, marginBottom: 16 }}>
              {s.teamStartDesc}
            </p>
            {/* UX (2026-09-28, "создание организации ничего не объясняет
                про пробный период" — live request): создание организации
                само по себе бесплатно (MIN_SEATS мест без карты, без
                Payment-записи — см. POST /api/org на сервере) — это не
                очевидно из одних только цен ниже, легко подумать, что
                платёж спишется сразу. */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', marginBottom: 20, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 10 }}>
              <IcoCheck />
              <p style={{ fontSize: 12.5, color: '#a7e8c4', lineHeight: 1.55 }}>{s.freeSeatsNote(MIN_SEATS)}</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 28 }}>
              <div className="mini-stat">
                <div className="mini-stat-value" style={{ color: '#87b7ff' }}>{seatPlansDisplay.month.pricePerSeat} {currencySymbol}</div>
                <div className="mini-stat-label">{s.perSeatMonth}</div>
              </div>
              <div className="mini-stat">
                <div className="mini-stat-value" style={{ color: '#87b7ff' }}>{seatPlansDisplay.year.pricePerSeat} {currencySymbol}</div>
                <div className="mini-stat-label">{s.perSeatMonthYearly}</div>
              </div>
            </div>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginBottom: 20 }}>
              {s.fromSeatsNote(MIN_SEATS)}
            </p>
            <form onSubmit={handleCreateOrg}>
              <label className="field-label">{s.orgNameLabel}</label>
              <input
                className="field-input"
                value={orgNameDraft}
                onChange={e => setOrgNameDraft(e.target.value)}
                placeholder={s.orgNamePlaceholder}
                maxLength={80}
                style={{ marginBottom: 14 }}
              />
              {createOrgMsg && <div className={`form-msg ${createOrgMsg.type}`} style={{ marginBottom: 14 }}>{createOrgMsg.text}</div>}
              <button type="submit" className="btn-primary" disabled={creatingOrg} style={{ width: '100%' }}>
                {creatingOrg ? s.creatingOrgBtn : s.createOrgBtn}
              </button>
            </form>
          </div>
        </div>
      ) : (
        // ════════════════ HAS-ORG STATE — same dash-shell markup as
        // dashboard/page.tsx (dash-sidebar/dash-brand/dash-nav/dash-usercard/
        // dash-topbar), so a TEAM owner switching between /dashboard and
        // /team sees the identical chrome, not a different app skin. Only
        // the nav items and main content differ; org name/tier moved into
        // the topbar breadcrumb (matching how dashboard's own breadcrumb
        // shows "Личный кабинет / <tab>") instead of living in the sidebar.
        <>
          <a className="dash-skip" href="#team-content">{s.skipToContent}</a>
          <aside className="dash-sidebar">
            <a href={lang === 'en' ? '/en/dashboard' : '/dashboard'} className="dash-brand" aria-label="Centrio">
              <Brand />
            </a>

            <nav className="dash-nav" aria-label={s.teamNav}>
              <div className="dash-menu-label">{s.orgLabel}</div>
              {NAV.map(({ key, label, Icon }) => (
                <button
                  key={key}
                  className={`nav-item${tab === key ? ' active' : ''}`}
                  onClick={() => setTab(key)}
                  aria-current={tab === key ? 'page' : undefined}
                >
                  <Icon />
                  <span>{label}</span>
                  {tab === key && <span className="dash-nav-indicator" aria-hidden="true" />}
                </button>
              ))}
              <div className="dash-menu-label dash-team-label">{s.cabinetLabel}</div>
              <a href={lang === 'en' ? '/en/dashboard' : '/dashboard'} className="nav-item dash-team-link">
                <IcoBack />
                {s.personalCabinet}
              </a>
            </nav>

            <div className="dash-usercard">
              <button
                onClick={() => { router.push(lang === 'en' ? '/en/dashboard' : '/dashboard') }}
                aria-label={s.openProfile}
                className="dash-user-button"
              >
                <div className="avatar-ring-sm">
                  <div className="avatar-ring-sm-inner">
                    {user?.avatar ? <img src={user.avatar} alt="" className="avatar-img" /> : (user?.name || user?.email || '?').charAt(0).toUpperCase()}
                  </div>
                </div>
                <div style={{ overflow: 'hidden', flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 550, color: '#eaf0fb', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {user?.name || user?.email?.split('@')[0]}
                  </div>
                  <span className="badge" style={(() => { const pc = org.orgProSeat ? PLAN_COLORS.PRO : (PLAN_COLORS[(user as any)?.plan] || PLAN_COLORS.FREE); return { background: `${pc}22`, color: pc, border: `1px solid ${pc}44`, display: 'inline-flex', alignItems: 'center', gap: 4 } })()}>
                    {org.orgProSeat ? <IcoCrown /> : null} {org.orgProSeat ? PLAN_LABELS.PRO : (PLAN_LABELS[(user as any)?.plan] || PLAN_LABELS.FREE)}
                  </span>
                </div>
              </button>
              <button aria-label={s.logoutAccount} className="btn-ghost dash-logout" onClick={() => { logout(); router.push(lang === 'en' ? '/en' : '/') }}>
                <IcoLogout /> {s.logout}
              </button>
            </div>
          </aside>

          <main className="dash-main" id="team-content">
            <div className="dash-topbar">
              <div className="dash-breadcrumb">
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>{org.orgName}</span>
                <span aria-hidden="true">/</span>
                <strong>{NAV.find(item => item.key === tab)?.label}</strong>
              </div>
              <div className="dash-topbar-right">
                <CabinetLangSwitcher pathname={pathname} chooseLanguageLabel={s.chooseLanguage} />
                <span className="dash-account-plan" style={{ borderColor: `${TIER_COLOR}44`, color: TIER_COLOR }}>{TIER_LABELS[org.orgTier]} · {s.yourRole} {ROLE_LABELS[org.orgRole]}</span>
              </div>
            </div>
            <div className="dash-content">
            {paymentBanner && (
              <div className="glass-card" style={{
                padding: '14px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12,
                borderColor: paymentBanner === 'ok' ? 'rgba(34,197,94,0.35)' : 'rgba(67,124,255,0.3)',
              }}>
                {paymentBanner === 'checking'
                  ? <div style={{ width: 16, height: 16, border: '2px solid rgba(67,124,255,0.3)', borderTopColor: '#74a0ff', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
                  : <IcoCheck />}
                <span style={{ fontSize: 13.5 }}>
                  {paymentBanner === 'checking' ? s.confirmingPayment : s.paymentConfirmed}
                </span>
              </div>
            )}

            {tab === 'overview' && (
              <>
                <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <IcoOverview /> {s.overviewTitle}
                </div>

                {/* UX (2026-09-28, "Overview ныряет в настройки, нет
                    сводки" — live request): сводка по местам теперь идёт
                    первым делом, до редактируемой карточки с названием —
                    владелец сразу видит "сколько занято/свободно/до какого
                    числа оплачено", а не форму переименования. */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 20 }}>
                  <div className="mini-stat"><div className="mini-stat-value">{org.orgSeatsUsed}/{org.orgSeatLimit}</div><div className="mini-stat-label">{s.seatsUsedLabel}</div></div>
                  <div className="mini-stat"><div className="mini-stat-value">{freeSeats}</div><div className="mini-stat-label">{s.seatsFreeLabel}</div></div>
                  <div className="mini-stat"><div className="mini-stat-value" style={{ fontSize: 15 }}>{fmtDate(org.orgSeatsExpiresAt, dateLocale)}</div><div className="mini-stat-label">{s.paidUntilLabel}</div></div>
                </div>

                {/* FEATURE (2026-09-29, "как сделать подписку Team более
                    привлекательной и удобной" — live request): a proactive
                    heads-up before paid seats lapse, so nobody discovers it
                    only after employees silently lose Team access. Only
                    meaningful when there's a real expiry date and
                    auto-renew isn't already handling it, and only
                    actionable by the owner (billing is owner-only). */}
                {isOwner && !org.orgAutoRenewSeats && org.orgSeatsExpiresAt && (() => {
                  const daysLeft = Math.ceil((new Date(org.orgSeatsExpiresAt).getTime() - Date.now()) / 86400000)
                  if (daysLeft > 7) return null
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 16px', marginBottom: 16, background: daysLeft <= 0 ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)', border: `1px solid ${daysLeft <= 0 ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.3)'}`, borderRadius: 12 }}>
                      <p style={{ flex: 1, minWidth: 200, fontSize: 13, color: daysLeft <= 0 ? '#fca5a5' : '#fcd34d', lineHeight: 1.5 }}>
                        {daysLeft <= 0 ? s.seatsExpiredNote : s.seatsExpiringSoon(daysLeft)}
                      </p>
                      <button className="btn-primary" onClick={() => setTab('billing')}>{s.renewSeatsBtn}</button>
                    </div>
                  )
                })()}

                {/* FEATURE (same request): a self-hiding "getting started"
                    checklist — derived entirely from data already loaded
                    for this tab, no extra state or backend flag needed. It
                    disappears once every relevant step is done, so it never
                    becomes stale nagging for an org that's already set up. */}
                {canManage && (() => {
                  const hasEmployees = members.filter(m => m.role !== 'OWNER').length > 0
                  const hasAssignments = assignments.length > 0
                  const hasLogo = !!org.orgLogoUrl
                  const steps = [
                    { done: hasEmployees, label: s.onboardStep1, hint: s.onboardStep1Hint, tab: 'members' as const },
                    { done: hasAssignments, label: s.onboardStep2, hint: s.onboardStep2Hint, tab: 'members' as const },
                    ...(isOwner ? [{ done: hasLogo, label: s.onboardStep3, hint: s.onboardStep3Hint, tab: 'manage' as const }] : []),
                  ]
                  if (steps.every(st => st.done)) return null
                  return (
                    <div className="glass-card" style={{ padding: 22, marginBottom: 16 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 14 }}>{s.onboardTitle}</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {steps.map((st, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, opacity: st.done ? 0.5 : 1 }}>
                            <div style={{
                              width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              background: st.done ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.06)',
                              border: st.done ? '1px solid rgba(34,197,94,0.4)' : '1px solid rgba(255,255,255,0.15)',
                            }}>
                              {st.done ? <IcoCheck /> : <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{i + 1}</span>}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13.5, fontWeight: 700, textDecoration: st.done ? 'line-through' : 'none' }}>{st.label}</div>
                              {!st.done && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{st.hint}</div>}
                            </div>
                            {!st.done && (
                              <button className="btn-ghost" style={{ flexShrink: 0 }} onClick={() => setTab(st.tab)}>{s.onboardGoBtn}</button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })()}

                {isOwner && (
                  <div className="glass-card" style={{ padding: 20, marginBottom: 16 }}>
                    {renamingOrg ? (
                      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                        <div style={{ flex: '1 1 220px' }}>
                          <label className="field-label">{s.teamNameLabel}</label>
                          <input
                            className="field-input"
                            value={orgRenameDraft}
                            onChange={e => setOrgRenameDraft(e.target.value)}
                            maxLength={80}
                            autoFocus
                            onKeyDown={e => { if (e.key === 'Enter') handleRenameOrg() }}
                          />
                        </div>
                        <button className="btn-primary" disabled={savingOrgRename} onClick={handleRenameOrg}>
                          {savingOrgRename ? s.savingBtn : s.saveBtn}
                        </button>
                        <button
                          className="btn-danger"
                          disabled={savingOrgRename}
                          onClick={() => { setRenamingOrg(false); setOrgRenameMsg(null) }}
                        >
                          {s.cancelBtn}
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 2 }}>{s.teamNameLabel}</div>
                          <div style={{ fontSize: 16, fontWeight: 800 }}>{org.orgName}</div>
                        </div>
                        <button
                          className="btn-primary"
                          onClick={() => { setOrgRenameDraft(org.orgName); setRenamingOrg(true) }}
                        >
                          {s.renameBtn}
                        </button>
                      </div>
                    )}
                    {orgRenameMsg && <div className={`form-msg ${orgRenameMsg.type}`} style={{ marginTop: 10 }}>{orgRenameMsg.text}</div>}
                  </div>
                )}

                <div className="glass-card" style={{ padding: 26, marginBottom: canManage ? 20 : 0 }}>
                  <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.55)', lineHeight: 1.7 }}>
                    {s.orgDescOpen}{org.orgName}{s.orgDescMid}{TIER_LABELS[org.orgTier]}.
                    {org.orgAutoRenewSeats ? s.autoRenewOnNote : s.autoRenewOffNote}
                    {' '}{s.orgDescTail}
                  </p>
                </div>

                {/* FEATURE (2026-09-17, "должна быть статистика. По
                    организации, по сотрудникам, по вовлечённости" — live
                    request): reuses the same assignments/stats state the
                    Manage tab's per-employee cards already fetch (both now
                    load on Overview too, see the loading effect above) —
                    just a different, summarized view of the same data. */}
                {canManage && (
                  <div className="glass-card" style={{ padding: 26 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>{s.teamStatsTitle}</div>
                    <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.45)', marginBottom: 16 }}>
                      {s.teamStatsSub}
                    </p>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 20 }}>
                      <div className="mini-stat">
                        <div className="mini-stat-value">{members.filter(m => m.role !== 'OWNER').length}</div>
                        <div className="mini-stat-label">{s.employeesLabel}</div>
                      </div>
                      <div className="mini-stat">
                        <div className="mini-stat-value">{assignments.length}</div>
                        <div className="mini-stat-label">{s.assignedMessengersLabel}</div>
                      </div>
                      <div className="mini-stat">
                        <div className="mini-stat-value">{stats.reduce((sum, st) => sum + st.unreadCount, 0)}</div>
                        <div className="mini-stat-label">{s.totalUnreadLabel}</div>
                      </div>
                      <div className="mini-stat">
                        <div className="mini-stat-value">
                          {stats.length > 0 ? `${Math.round(100 * stats.filter(st => st.unreadCount === 0).length / stats.length)}%` : '—'}
                        </div>
                        <div className="mini-stat-label">{s.engagementLabel}</div>
                      </div>
                    </div>

                    {loadingStats || loadingAssignments ? (
                      <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13.5 }}>{s.loadingEllipsis}</div>
                    ) : members.filter(m => m.role !== 'OWNER').length === 0 ? (
                      <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13.5 }}>{s.noEmployeesYet}</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {members.filter(m => m.role !== 'OWNER').map(m => {
                          const ownAssignments = assignments.filter(a => a.userId === m.userId)
                          const ownStats = stats.filter(st => st.userId === m.userId)
                          const unread = ownStats.reduce((sum, st) => sum + st.unreadCount, 0)
                          const noLoginCount = ownAssignments.filter(a => loginKindOf(ownStats.find(st => st.messengerKey === a.id)) !== 'in').length
                          const lastActivityTs = ownStats.reduce((max, st) => {
                            const ts = new Date(st.lastReadAt || st.lastMessageAt || 0).getTime()
                            return ts > max ? ts : max
                          }, 0)
                          const activeRecently = lastActivityTs > 0 && (Date.now() - lastActivityTs) < 3 * 24 * 60 * 60 * 1000
                          return (
                            <div key={m.userId} className="audit-row" style={{ alignItems: 'center' }}>
                              <span>{m.name || m.email} · {ownAssignments.length} {s.messengersCountSuffix} · {noLoginCount > 0 ? <span style={{ color: '#ef4444', fontWeight: 700 }}>{s.loginMissingCount(noLoginCount)}</span> : unread > 0 ? s.unreadCountSuffix(unread) : s.allRead}</span>
                              <span style={{ flexShrink: 0, fontWeight: 700, color: lastActivityTs === 0 ? 'rgba(255,255,255,0.35)' : activeRecently ? '#22c55e' : '#f59e0b' }}>
                                {lastActivityTs === 0 ? s.noDataStatus : activeRecently ? s.activeStatus : s.inactiveStatus}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {tab === 'members' && (
              <>
                <div className="section-title"><IcoUsers /> {s.membersTab} ({members.length})</div>

                {canManage && (
                  <div className="glass-card" style={{ padding: 22, marginBottom: 20 }}>
                    <form onSubmit={handleInvite} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                      <div style={{ flex: '1 1 240px' }}>
                        <label className="field-label">{s.coworkerEmailLabel}</label>
                        <input className="field-input" type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="coworker@company.com" />
                      </div>
                      {isOwner && (
                        <div>
                          <label className="field-label">{s.roleLabel}</label>
                          <select className="field-select" value={inviteRole} onChange={e => setInviteRole(e.target.value as 'MEMBER' | 'ADMIN')}>
                            <option value="MEMBER">{s.roleMember}</option>
                            <option value="ADMIN">{s.roleAdmin}</option>
                          </select>
                        </div>
                      )}
                      <button type="submit" className="btn-primary" disabled={inviting || freeSeats <= 0}>
                        <IcoSend /> {inviting ? s.sendingBtn : s.inviteBtn}
                      </button>
                    </form>
                    {freeSeats <= 0 && (
                      <div className="form-msg err" style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span style={{ flex: 1 }}>{s.noFreeSeatsMsg}</span>
                        {/* UX (2026-09-29): a real button that jumps straight
                            to Billing instead of just naming the tab — one
                            click instead of "now go find it yourself". */}
                        <button type="button" className="btn-primary" style={{ flexShrink: 0 }} onClick={() => setTab('billing')}>{s.buySeatsShortBtn}</button>
                      </div>
                    )}
                    {inviteMsg && <div className={`form-msg ${inviteMsg.type}`} style={{ marginTop: 10 }}>{inviteMsg.text}</div>}
                  </div>
                )}

                {memberActionMsg && <div className={`form-msg ${memberActionMsg.type}`} style={{ marginBottom: 12 }}>{memberActionMsg.text}</div>}
                {assignMsg && <div className={`form-msg ${assignMsg.type}`} style={{ marginBottom: 12 }}>{assignMsg.text}</div>}

                {canManage && !loadingPendingInvites && pendingInvites.length > 0 && (
                  <div className="glass-card" style={{ padding: '14px 18px', marginBottom: 20 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 10 }}>{s.pendingInvitesTitle} ({pendingInvites.length})</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {pendingInvites.map(inv => (
                        <div key={inv.id} className="member-row">
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.email}</div>
                            <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.4)' }}>
                              {s.sentOnPrefix} {fmtDate(inv.createdAt, dateLocale)} · {s.invitedAsPrefix} {ROLE_LABELS[inv.role]}
                            </div>
                          </div>
                          <button
                            className="btn-danger"
                            disabled={cancelingInviteId === inv.id}
                            onClick={() => { if (window.confirm(s.confirmCancelInvite)) handleCancelInvite(inv.id) }}
                          >
                            <IcoTrash /> {cancelingInviteId === inv.id ? '…' : s.cancelInviteBtn}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {canManage && (
                  <div className="glass-card" style={{ padding: '14px 18px', marginBottom: 20 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>{s.messengerPaletteTitle}</div>
                    <p style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.4)', marginBottom: 12 }}>{s.messengerPaletteHint}</p>
                    <label className="field-label" htmlFor="assign-vpn-mode">{s.assignVpnLabel}</label>
                    <select id="assign-vpn-mode" className="field-select" value={assignVpnMode} onChange={e => setAssignVpnMode(e.target.value as 'auto' | 'on' | 'off')} style={{ marginBottom: 6 }}>
                      <option value="auto">{s.vpnModeAuto}</option>
                      <option value="on">{s.vpnModeOn}</option>
                      <option value="off">{s.vpnModeOff}</option>
                    </select>
                    <p style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.4)', marginBottom: 12 }}>{s.assignVpnHint}</p>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      {POPULAR_MESSENGERS.map((preset, i) => (
                        <div
                          key={preset.name}
                          draggable
                          onDragStart={e => { e.dataTransfer.setData('text/plain', String(i)); e.dataTransfer.effectAllowed = 'copy' }}
                          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 9, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', cursor: 'grab', fontSize: 12.5, userSelect: 'none' }}
                          title={preset.name}
                        >
                          {/* draggable=false on the <img>: browsers make <img>
                              natively draggable by default, which hijacks the
                              parent chip's own drag (starting an image-URL
                              drag instead of ours) — this was the actual
                              cause of "перетаскивание не работает". */}
                          <img src={preset.icon} alt="" width={16} height={16} draggable={false} style={{ borderRadius: 4, objectFit: 'contain', pointerEvents: 'none' }} />
                          {preset.name}
                        </div>
                      ))}
                      {customLinks.map(link => (
                        <div
                          key={link.id}
                          draggable
                          onDragStart={e => { e.dataTransfer.setData('text/plain', `custom:${link.id}`); e.dataTransfer.effectAllowed = 'copy' }}
                          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 9, background: 'rgba(67,124,255,0.08)', border: '1px solid rgba(67,124,255,0.2)', cursor: 'grab', fontSize: 12.5, userSelect: 'none' }}
                          title={link.url}
                        >
                          {link.name}
                          <button
                            type="button"
                            onClick={() => handleDeleteCustomLink(link.id)}
                            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', padding: 0, display: 'flex' }}
                            title={s.removeShortBtn}
                          >
                            <IcoTrash />
                          </button>
                        </div>
                      ))}
                      {!addingCustomLink && (
                        <button type="button" className="btn-ghost" style={{ padding: '6px 10px', fontSize: 12.5 }} onClick={() => setAddingCustomLink(true)}>
                          <IcoPlus /> {s.addLinkBtn}
                        </button>
                      )}
                    </div>
                    {addingCustomLink && (
                      <form onSubmit={handleAddCustomLink} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 12 }}>
                        <div style={{ flex: '1 1 160px' }}>
                          <label className="field-label">{s.nameLabel}</label>
                          <input className="field-input" value={customLinkName} onChange={e => setCustomLinkName(e.target.value)} placeholder={s.customLinkNamePlaceholder} />
                        </div>
                        <div style={{ flex: '2 1 220px' }}>
                          <label className="field-label">{s.linkLabel}</label>
                          <input className="field-input" value={customLinkUrl} onChange={e => setCustomLinkUrl(e.target.value)} placeholder="https://..." />
                        </div>
                        <button type="submit" className="btn-primary" disabled={savingCustomLink || !customLinkName.trim() || !customLinkUrl.trim()}>
                          {savingCustomLink ? s.addingBtn : s.createBtn}
                        </button>
                        <button type="button" className="btn-ghost" onClick={() => { setAddingCustomLink(false); setCustomLinkName(''); setCustomLinkUrl('') }}>{s.cancelBtn}</button>
                      </form>
                    )}
                  </div>
                )}

                {members.length > 6 && (
                  <input
                    className="field-input"
                    value={memberSearch}
                    onChange={e => setMemberSearch(e.target.value)}
                    placeholder={s.memberSearchPlaceholder}
                    style={{ marginBottom: 14 }}
                  />
                )}

                {loadingMembers ? (
                  <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13.5 }}>{s.loadingEllipsis}</div>
                ) : (() => {
                  const q = memberSearch.trim().toLowerCase()
                  const filtered = q ? members.filter(m => (m.name || '').toLowerCase().includes(q) || m.email.toLowerCase().includes(q)) : members
                  if (filtered.length === 0) return <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13.5 }}>{s.noMembersFound}</div>
                  return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {filtered.map(m => {
                      const canRemove = canManage && m.role !== 'OWNER' && !(m.role === 'ADMIN' && !isOwner)
                      const canDrop = canManage && m.role !== 'OWNER'
                      const expanded = expandedUserIds.has(m.userId)
                      const own = assignments.filter(a => a.userId === m.userId)
                      const ownStats = stats.filter(st => st.userId === m.userId)
                      const unreadTotal = ownStats.reduce((sum, st) => sum + (st.unreadCount > 0 ? 1 : 0), 0)
                      const noLoginTotal = own.filter(a => loginKindOf(ownStats.find(st => st.messengerKey === a.id)) !== 'in').length
                      const isDragTarget = canDrop && dragOverUserId === m.userId
                      return (
                        <div
                          key={m.userId}
                          className="member-row"
                          style={{
                            flexDirection: 'column', alignItems: 'stretch', gap: 0, cursor: 'default',
                            outline: isDragTarget ? '2px dashed #437cff' : 'none', outlineOffset: 2,
                            background: isDragTarget ? 'rgba(67,124,255,0.08)' : undefined,
                          }}
                          onDragOver={canDrop ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; if (dragOverUserId !== m.userId) setDragOverUserId(m.userId) } : undefined}
                          onDragLeave={canDrop ? () => setDragOverUserId(prev => (prev === m.userId ? null : prev)) : undefined}
                          onDrop={canDrop ? (e) => {
                            e.preventDefault()
                            setDragOverUserId(null)
                            const idxStr = e.dataTransfer.getData('text/plain')
                            if (idxStr === '') return
                            if (idxStr.startsWith('custom:')) {
                              const link = customLinks.find(c => c.id === idxStr.slice(7))
                              if (link) handleQuickAssignCustom(m.userId, link)
                            } else {
                              handleQuickAssign(m.userId, Number(idxStr))
                            }
                          } : undefined}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', width: '100%' }} onClick={() => toggleExpanded(m.userId)}>
                            <div className="member-avatar">{(m.name || m.email).charAt(0).toUpperCase()}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name || m.email}</div>
                              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{m.email}</div>
                            </div>
                            {own.length > 0 && (
                              <span className="badge" style={{ background: 'rgba(67,124,255,0.1)', color: '#87b7ff' }}>{s.assignedCountSuffix(own.length)}</span>
                            )}
                            {canManage && own.length > 0 && noLoginTotal > 0 && (
                              <span className="badge" style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>{s.loginMissingCount(noLoginTotal)}</span>
                            )}
                            {canManage && unreadTotal > 0 && (
                              <span className="badge" style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }}>{s.unreadCountSuffix(unreadTotal)}</span>
                            )}
                            {isOwner && m.role !== 'OWNER' ? (
                              <select
                                className="field-select"
                                value={m.role}
                                disabled={roleUpdatingUserId === m.userId}
                                onClick={e => e.stopPropagation()}
                                onChange={e => handleChangeRole(m.userId, e.target.value as 'ADMIN' | 'MEMBER')}
                                style={{ padding: '7px 10px', fontSize: 12.5 }}
                              >
                                <option value="MEMBER">{s.roleMember}</option>
                                <option value="ADMIN">{s.roleAdmin}</option>
                              </select>
                            ) : (
                              <span className="badge" style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)' }}>
                                {m.role === 'OWNER' && <IcoCrown />} {ROLE_LABELS[m.role]}
                              </span>
                            )}
                            {canRemove && (
                              <button className="btn-danger" disabled={removingUserId === m.userId} onClick={e => { e.stopPropagation(); handleRemoveMember(m.userId) }}>
                                <IcoTrash /> {removingUserId === m.userId ? '…' : s.removeBtn}
                              </button>
                            )}
                            <IcoChevron open={expanded} />
                          </div>

                          {isDragTarget && (
                            <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 8, background: 'rgba(67,124,255,0.12)', color: '#87b7ff', fontSize: 12, textAlign: 'center' }}>
                              {s.dropHereLabel}
                            </div>
                          )}

                          {expanded && (
                            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                              {canManage && m.role === 'MEMBER' && (
                                <label title={LIVE_STR[lang === 'en' ? 'en' : 'ru'].strictHint} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'rgba(255,255,255,0.75)', cursor: permUpdatingUserId === m.userId ? 'wait' : 'pointer' }}>
                                  <input
                                    type="checkbox"
                                    checked={m.strictMode === true}
                                    disabled={permUpdatingUserId === m.userId}
                                    onChange={e => handleToggleStrict(m.userId, e.target.checked)}
                                  />
                                  {LIVE_STR[lang === 'en' ? 'en' : 'ru'].strict}
                                </label>
                              )}
                              {canManage && m.role !== 'OWNER' && m.strictMode !== true && (
                                <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'rgba(255,255,255,0.55)', cursor: permUpdatingUserId === m.userId ? 'wait' : 'pointer' }}>
                                  <input
                                    type="checkbox"
                                    checked={m.canAddOwnMessengers !== false}
                                    disabled={permUpdatingUserId === m.userId}
                                    onChange={e => handleToggleCanAdd(m.userId, e.target.checked)}
                                  />
                                  {s.canAddOwnLabel}
                                </label>
                              )}

                              {own.length === 0 ? (
                                <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.35)' }}>{s.nothingAssigned}</div>
                              ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                  {own.map(a => {
                                    const stat = ownStats.find(st => st.messengerKey === a.id)
                                    return (
                                      <div key={a.id} className="member-row">
                                        {a.icon && <img src={a.icon} alt="" width={22} height={22} style={{ borderRadius: 6, flexShrink: 0, objectFit: 'contain' }} />}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                          <div style={{ fontSize: 14, fontWeight: 700 }}>{a.name}</div>
                                          <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.4)' }}>{a.url}</div>
                                        </div>
                                        {canManage && (() => {
                                          const kind = loginKindOf(stat)
                                          const color = kind === 'in' ? '#22c55e' : kind === 'out' ? '#ef4444' : 'rgba(255,255,255,0.45)'
                                          const label = kind === 'in' ? s.loginInLabel : kind === 'out' ? `${s.loginOutLabel} · ${formatSince(minutesSince(stat?.notLoggedInSince))}` : kind === 'never' ? s.loginNeverLabel : s.loginUnknownLabel
                                          return (
                                            <>
                                              <span title={s.loginHint} style={{ fontSize: 11.5, fontWeight: 700, color, flexShrink: 0 }}>{label}</span>
                                              {stat && kind === 'in' && (
                                                <span style={{ fontSize: 11.5, fontWeight: 700, color: stat.unreadCount > 0 ? '#f59e0b' : '#22c55e', flexShrink: 0 }}>
                                                  {stat.unreadCount > 0 ? s.unreadCountSuffix(stat.unreadCount) : s.readLabel}
                                                </span>
                                              )}
                                            </>
                                          )
                                        })()}
                                        {canManage && (
                                          <button
                                            type="button"
                                            onClick={() => openVault(a, m.name || m.email)}
                                            style={{ flexShrink: 0, padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: '1px solid', borderColor: a.credentialAvailable ? 'rgba(34,197,94,0.5)' : 'rgba(255,255,255,0.18)', background: a.credentialAvailable ? 'rgba(34,197,94,0.12)' : 'transparent', color: a.credentialAvailable ? '#22c55e' : 'rgba(255,255,255,0.7)' }}
                                          >
                                            {a.credentialAvailable ? `🔑 ${s.vaultSavedChip}` : `🔑 ${s.vaultBtn}`}
                                          </button>
                                        )}
                                        {canManage && (
                                          <button
                                            type="button"
                                            onClick={() => handleToggleAssignmentVpn(a.id, a.useVpn === false)}
                                            style={{ flexShrink: 0, padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: '1px solid', borderColor: a.useVpn === false ? 'rgba(255,255,255,0.18)' : 'rgba(90,169,255,0.55)', background: a.useVpn === false ? 'transparent' : 'rgba(90,169,255,0.15)', color: a.useVpn === false ? 'rgba(255,255,255,0.55)' : '#8fbdff' }}
                                          >
                                            {a.useVpn === false ? s.vpnToggleOff : s.vpnToggleOn}
                                          </button>
                                        )}
                                        {canManage && (
                                          <button className="btn-danger" onClick={() => handleDeleteAssignment(a.id)}><IcoTrash /> {s.removeShortBtn}</button>
                                        )}
                                      </div>
                                    )
                                  })}
                                </div>
                              )}

                              {canManage && m.role !== 'OWNER' && (
                                addingMessengerFor === m.userId ? (
                                  <form
                                    onSubmit={e => handleAddAssignment(e, m.userId)}
                                    style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}
                                  >
                                    <div style={{ flex: '1 1 160px' }}>
                                      <label className="field-label">{s.messengerLabel}</label>
                                      <select
                                        className="field-select"
                                        value={assignPreset}
                                        onChange={e => {
                                          const v = e.target.value
                                          setAssignPreset(v)
                                          if (v === 'custom') {
                                            setAssignName('')
                                            setAssignUrl('')
                                          } else if (v.startsWith('link:')) {
                                            const link = customLinks.find(c => c.id === v.slice(5))
                                            if (link) { setAssignName(link.name); setAssignUrl(link.url) }
                                          } else if (v !== '') {
                                            const preset = POPULAR_MESSENGERS[Number(v)]
                                            setAssignName(preset.name)
                                            setAssignUrl(preset.url)
                                          }
                                        }}
                                      >
                                        <option value="">{s.chooseEllipsis}</option>
                                        {POPULAR_MESSENGERS.map((preset, i) => (
                                          <option key={preset.name} value={i}>{preset.name}</option>
                                        ))}
                                        {customLinks.map(link => (
                                          <option key={link.id} value={`link:${link.id}`}>{link.name}</option>
                                        ))}
                                        <option value="custom">{s.customOption}</option>
                                      </select>
                                    </div>
                                    {assignPreset === 'custom' && (
                                      <>
                                        <div style={{ flex: '1 1 140px' }}>
                                          <label className="field-label">{s.nameLabel}</label>
                                          <input className="field-input" value={assignName} onChange={e => setAssignName(e.target.value)} placeholder={s.assignNamePlaceholder} />
                                        </div>
                                        <div style={{ flex: '2 1 200px' }}>
                                          <label className="field-label">{s.linkLabel}</label>
                                          <input className="field-input" value={assignUrl} onChange={e => setAssignUrl(e.target.value)} placeholder="https://..." />
                                        </div>
                                      </>
                                    )}
                                    <button type="submit" className="btn-primary" disabled={savingAssignment || !assignPreset}>{savingAssignment ? s.addingBtn : s.assignBtn}</button>
                                    <button type="button" className="btn-ghost" onClick={() => { setAddingMessengerFor(null); setAssignPreset(''); setAssignName(''); setAssignUrl('') }}>{s.cancelBtn}</button>
                                  </form>
                                ) : (
                                  <button
                                    type="button"
                                    className="btn-ghost"
                                    style={{ alignSelf: 'flex-start' }}
                                    disabled={quickAssigningUserId === m.userId}
                                    onClick={() => { setAddingMessengerFor(m.userId); setAssignPreset(''); setAssignName(''); setAssignUrl('') }}
                                  >
                                    <IcoPlus /> {s.addMessengerBtn}
                                  </button>
                                )
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  )
                })()}
              </>
            )}

            {tab === 'billing' && (
              <>
                <div className="section-title"><IcoCard /> {s.navBilling}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 20 }}>
                  <div className="mini-stat"><div className="mini-stat-value">{org.orgSeatLimit}</div><div className="mini-stat-label">{s.totalSeatsLabel}</div></div>
                  <div className="mini-stat"><div className="mini-stat-value">{org.orgSeatsUsed}</div><div className="mini-stat-label">{s.usedLabel}</div></div>
                  <div className="mini-stat"><div className="mini-stat-value" style={{ fontSize: 15 }}>{fmtDate(org.orgSeatsExpiresAt, dateLocale)}</div><div className="mini-stat-label">{s.paidUntilLabel}</div></div>
                </div>

                {isOwner ? (
                  <div className="glass-card" style={{ padding: 26 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 16 }}>{orgActive ? s.navBilling : s.buyMoreSeatsTitle}</div>
                    {orgActive && (
                      <>
                        <div className="period-toggle" style={{ marginBottom: 10 }}>
                          <button className={buyMode === 'renew' ? 'active' : ''} onClick={() => setBuyMode('renew')}>{s.modeRenewLabel}</button>
                          <button className={buyMode === 'add' ? 'active' : ''} onClick={() => { setBuyMode('add'); setSeatsCount(c => Math.min(Math.max(1, c), Math.max(1, MAX_SEATS_SELF_SERVICE - (org?.orgSeatLimit || 0)))) }}>{s.modeAddLabel}</button>
                        </div>
                        <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.5)', marginBottom: 16, lineHeight: 1.5 }}>{buyMode === 'renew' ? s.renewHint(org?.orgSeatLimit || 0) : s.addHint(orgDaysLeft)}</p>
                      </>
                    )}
                    {!addMode && <div className="period-toggle" style={{ marginBottom: 16 }}>
                      <button className={seatsPeriod === 'month' ? 'active' : ''} onClick={() => setSeatsPeriod('month')}>{s.period1MonthLabel} · {seatPlansDisplay.month.pricePerSeat}{currencySymbol}{s.perSeatSuffix}</button>
                      <button className={seatsPeriod === 'year' ? 'active' : ''} onClick={() => setSeatsPeriod('year')}>{s.period1YearLabel} · {seatPlansDisplay.year.pricePerSeat}{currencySymbol}{s.perSeatMonthlySuffix}</button>
                    </div>}
                    {!renewMode && (
                      <>
                        <label className="field-label">{s.seatsCountLabel}</label>
                        <div className="stepper" style={{ marginBottom: 18 }}>
                          <button type="button" disabled={seatsCount <= minSeatsNow} onClick={() => setSeatsCount(c => Math.max(minSeatsNow, c - 1))}>−</button>
                          <div style={{ fontSize: 18, fontWeight: 800, minWidth: 32, textAlign: 'center' }}>{seatsCount}</div>
                          <button type="button" disabled={seatsCount >= maxSeatsNow} onClick={() => setSeatsCount(c => Math.min(maxSeatsNow, c + 1))}>+</button>
                          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{s.fromToSeats(minSeatsNow, maxSeatsNow)}</span>
                        </div>
                      </>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                      <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>{s.totalToPayLabel}</span>
                      <span style={{ fontSize: 22, fontWeight: 900, color: '#87b7ff' }}>{totalPrice.toLocaleString(dateLocale)} {currencySymbol}</span>
                    </div>
                    {buyMsg && <div className={`form-msg ${buyMsg.type}`} style={{ marginBottom: 14 }}>{buyMsg.text}</div>}
                    <button className="btn-primary" style={{ width: '100%' }} disabled={buyingSeats} onClick={handleBuySeats}>
                      {buyingSeats ? s.proceedingToPayment : s.payBtn}
                    </button>
                    <p style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.3)', marginTop: 12 }}>
                      {s.moreThan50SeatsNote}
                    </p>
                  </div>
                ) : (
                  <div className="glass-card" style={{ padding: 26 }}>
                    <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.5)' }}>{s.ownerOnlyPurchaseNote}</p>
                  </div>
                )}
              </>
            )}

            {tab === 'manage' && isOwner && (
              <>
                <div className="section-title"><IcoManage /> {s.manageTab}</div>

                <div className="glass-card" style={{ padding: 26, marginBottom: 20 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>{s.logoTitle}</div>
                  <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.45)', marginBottom: 16 }}>{s.logoDesc}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ width: 56, height: 56, borderRadius: 14, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                      {org.orgLogoUrl ? <img src={org.orgLogoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{s.defaultLogoLabel}</span>}
                    </div>
                    <label className="btn-primary" style={{ cursor: uploadingLogo ? 'not-allowed' : 'pointer', opacity: uploadingLogo ? 0.55 : 1 }}>
                      {uploadingLogo ? s.uploadingBtn : s.uploadLogoBtn}
                      <input type="file" accept="image/*" onChange={handleLogoUpload} disabled={uploadingLogo} style={{ display: 'none' }} />
                    </label>
                    {org.orgLogoUrl && (
                      <button className="btn-danger" disabled={uploadingLogo} onClick={handleRemoveLogo}>{s.resetBtn}</button>
                    )}
                  </div>
                  {logoMsg && <div className={`form-msg ${logoMsg.type}`} style={{ marginTop: 12 }}>{logoMsg.text}</div>}
                </div>

                <div className="glass-card" style={{ padding: 26, marginBottom: 20 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>{s.vpnTitle}</div>
                  <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.45)', marginBottom: 16 }}>{s.vpnDesc}</p>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                    <div style={{ flex: '1 1 200px' }}>
                      <label className="field-label">{s.nameLabel}</label>
                      <input className="field-input" value={vpnName} onChange={e => setVpnName(e.target.value)} placeholder={s.vpnNamePlaceholder} />
                    </div>
                    <div style={{ flex: '2 1 320px' }}>
                      <label className="field-label">{s.subscriptionLinkLabel}</label>
                      <input className="field-input" value={vpnLink} onChange={e => setVpnLink(e.target.value)} placeholder={s.vpnLinkPlaceholder} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button className="btn-primary" disabled={savingVpn || !vpnLink.trim()} onClick={handleSaveVpn}>{savingVpn ? s.savingBtn : s.saveBtn}</button>
                    {vpnLink && <button className="btn-danger" disabled={savingVpn} onClick={handleClearVpn}>{s.disableBtn}</button>}
                  </div>
                  {vpnMsg && <div className={`form-msg ${vpnMsg.type}`} style={{ marginTop: 12 }}>{vpnMsg.text}</div>}
                </div>

                <div className="glass-card" style={{ padding: 26, marginBottom: 20 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>{s.themeTitle}</div>
                  <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.45)', marginBottom: 16 }}>{s.themeDesc}</p>
                  <select className="field-select" value={forcedTheme} disabled={savingSettings} onChange={e => handleSaveTheme(e.target.value)} style={{ maxWidth: 240 }}>
                    <option value="">{s.themeNotSet}</option>
                    <option value="embedded">{s.themeDark}</option>
                    <option value="light">{s.themeLight}</option>
                  </select>
                  {settingsMsg && <div className={`form-msg ${settingsMsg.type}`} style={{ marginTop: 12 }}>{settingsMsg.text}</div>}
                </div>

                {/* MOVED (2026-09-28, employees redesign): per-employee
                    messenger assignment + read-status now lives on the
                    Members tab, inside each employee's expandable card —
                    consolidated there with role/remove/canAddOwnMessengers
                    so everything about an employee is in one place, plus
                    drag-and-drop assignment from a messenger palette. */}
                <div className="glass-card" style={{ padding: 26 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>{s.assignedMessengersTitle}</div>
                  <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.45)' }}>{s.assignedMessengersDesc}</p>
                  <button type="button" className="btn-ghost" style={{ marginTop: 12 }} onClick={() => setTab('members')}>
                    <IcoUsers /> {s.navMembers}
                  </button>
                </div>
              </>
            )}

            {tab === 'now' && canManage && (
              <>
                <div className="section-title"><IcoNow /> {s.navNow}</div>
                <LiveBoard orgId={org.orgId} lang={lang === 'en' ? 'en' : 'ru'} members={members} />
              </>
            )}

            {tab === 'reports' && canManage && (
              <>
                <div className="section-title"><IcoReports /> {s.navReports}</div>
                <ReportsPanel orgId={org.orgId} lang={lang === 'en' ? 'en' : 'ru'} />
              </>
            )}

            {tab === 'replies' && canManage && (
              <>
                <div className="section-title"><IcoReplies /> {s.navReplies}</div>
                <QuickRepliesPanel orgId={org.orgId} lang={lang === 'en' ? 'en' : 'ru'} canEdit={canManage} />
              </>
            )}

            {tab === 'folders' && canManage && (
              <>
                <div className="section-title"><IcoFolders /> {s.navFolders}</div>
                <StructurePanel orgId={org.orgId} lang={lang === 'en' ? 'en' : 'ru'} />
              </>
            )}

            {tab === 'tasks' && canManage && (
              <>
                <div className="section-title"><IcoTasks /> {s.navTasks}</div>
                <TasksPanel orgId={org.orgId} lang={lang === 'en' ? 'en' : 'ru'} currentUserId={user?.id ?? null} />
              </>
            )}

            {tab === 'alerts' && isOwner && (
              <>
                <div className="section-title"><IcoBell /> {s.navAlerts}</div>
                <AlertsPanel
                  orgId={org.orgId}
                  lang={lang === 'en' ? 'en' : 'ru'}
                  seatsActive={!!org.orgSeatsExpiresAt && new Date(org.orgSeatsExpiresAt) > new Date()}
                />
              </>
            )}

            {tab === 'audit' && canManage && (
              <>
                <div className="section-title"><IcoShield /> {s.auditTab}</div>
                <div className="glass-card" style={{ padding: '10px 26px' }}>
                  {loadingAudit ? (
                    <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13.5, padding: '16px 0' }}>{s.loadingEllipsis}</div>
                  ) : auditLogs.length === 0 ? (
                    <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13.5, padding: '16px 0' }}>{s.noRecordsYet}</div>
                  ) : (
                    auditLogs.map(log => (
                      <div key={log.id} className="audit-row">
                        <span>{describeAudit(log, byUser, lang)}</span>
                        <span style={{ color: 'rgba(255,255,255,0.35)', flexShrink: 0 }}>{new Date(log.createdAt).toLocaleString(dateLocale)}</span>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
            </div>
          </main>
        </>
      )}
      {vaultTarget && (
        <div role="dialog" aria-modal="true" aria-label={s.vaultTitle(vaultTarget.assignment.name, vaultTarget.memberName)} onClick={e => { if (e.target === e.currentTarget && !vaultBusy) closeVault() }} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.62)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: 520, padding: 24, maxHeight: '92vh', overflowY: 'auto' }}>
            <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 10 }}>{s.vaultTitle(vaultTarget.assignment.name, vaultTarget.memberName)}</div>
            <p style={{ fontSize: 12.5, lineHeight: 1.6, color: 'rgba(255,255,255,0.55)', marginBottom: 16 }}>{s.vaultInfo}</p>
            <div className="ca-field" style={{ marginBottom: 12 }}>
              <label className="field-label" htmlFor="vault-login">{s.vaultLogin}</label>
              <input id="vault-login" className="field-input" type="text" autoComplete="off" spellCheck={false} value={vaultLogin} onChange={e => setVaultLogin(e.target.value)} />
            </div>
            <div className="ca-field" style={{ marginBottom: 12 }}>
              <label className="field-label" htmlFor="vault-password">{s.vaultPassword}</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input id="vault-password" className="field-input" style={{ flex: 1 }} type={vaultShow ? 'text' : 'password'} autoComplete="new-password" spellCheck={false} value={vaultPassword} onChange={e => setVaultPassword(e.target.value)} />
                <button type="button" className="btn-secondary" onClick={() => setVaultShow(v => !v)} aria-pressed={vaultShow} style={{ flexShrink: 0 }}>{vaultShow ? '🙈' : '👁'}</button>
              </div>
            </div>
            {vaultDevices && (
              <div style={{ margin: '14px 0', fontSize: 12.5 }}>
                <div style={{ color: 'rgba(255,255,255,0.45)', marginBottom: 6 }}>{s.vaultDevices}</div>
                {vaultDevices.length === 0 ? (
                  <div style={{ color: '#f59e0b' }}>{s.vaultNoDevices}</div>
                ) : vaultDevices.map(d => (
                  <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '4px 0' }}>
                    <span>{d.name || '—'}</span>
                    <span style={{ color: d.shared ? '#22c55e' : 'rgba(255,255,255,0.4)', fontWeight: 700 }}>{d.shared ? s.vaultDeviceShared : s.vaultDeviceNot}</span>
                  </div>
                ))}
              </div>
            )}
            {vaultMsg && <div role="alert" style={{ margin: '10px 0', fontSize: 13, color: vaultMsg.type === 'ok' ? '#22c55e' : '#ef4444' }}>{vaultMsg.text}</div>}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
              <button type="button" className="btn-primary" disabled={vaultBusy} onClick={saveVault}>{vaultBusy ? s.vaultSaving : s.vaultSave}</button>
              {vaultTarget.assignment.credentialAvailable && <button type="button" className="btn-danger" disabled={vaultBusy} onClick={removeVault}>{s.vaultRemove}</button>}
              <button type="button" className="btn-secondary" disabled={vaultBusy} onClick={closeVault} style={{ marginLeft: 'auto' }}>{s.vaultClose}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
