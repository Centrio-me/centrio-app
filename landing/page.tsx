'use client'

import React, { useState, useEffect, useRef, type ReactElement } from 'react'
import Link from 'next/link'
import { useLang, LANGS, LANG_LABELS, type Lang } from '@/lib/i18n'
import { motion, AnimatePresence, useInView } from 'framer-motion'
import { GlassPricingSection, type PricingCardProps } from '@/components/ui/animated-glassy-pricing'
import { COMPARE_LINKS, LOCALIZED_ROUTES, canonicalPath, localizedHref } from '@/lib/site-nav'
import { useRouter, usePathname } from 'next/navigation'

const VERSION = '2.7.0'
const WIN_DOWNLOAD = `https://download.centrio.me/Centrio%20Setup%20${VERSION}.exe`

/* ─── SVG icons ──────────────────────────────────────────────────────────── */
const MessengerSvgs: Record<string, ReactElement> = {
  // BUGFIX (2026-09-08, "часть иконок некрасивая" — live user request): все
  // path'ы ниже были повреждены — десятичные числа в координатах кое-где
  // схлопнулись в бессмысленный повторяющийся паттерн вроде "2.5.2" (похоже
  // на след неудачного find/replace в незапамятной сессии), из-за чего
  // фигуры рендерились рваными кривыми вместо логотипов. Восстановлены
  // из оригинального источника (simple-icons) — те же лого, что и были
  // задуманы, просто с корректными координатами.
  discord:      <svg viewBox="0 0 24 24" fill="white" width="26" height="26"><path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/></svg>,
  vk:           <svg viewBox="0 0 24 24" fill="white" width="26" height="26"><path d="m9.489.004.729-.003h3.564l.73.003.914.01.433.007.418.011.403.014.388.016.374.021.36.025.345.03.333.033c1.74.196 2.933.616 3.833 1.516.9.9 1.32 2.092 1.516 3.833l.034.333.029.346.025.36.02.373.025.588.012.41.013.644.009.915.004.98-.001 3.313-.003.73-.01.914-.007.433-.011.418-.014.403-.016.388-.021.374-.025.36-.03.345-.033.333c-.196 1.74-.616 2.933-1.516 3.833-.9.9-2.092 1.32-3.833 1.516l-.333.034-.346.029-.36.025-.373.02-.588.025-.41.012-.644.013-.915.009-.98.004-3.313-.001-.73-.003-.914-.01-.433-.007-.418-.011-.403-.014-.388-.016-.374-.021-.36-.025-.345-.03-.333-.033c-1.74-.196-2.933-.616-3.833-1.516-.9-.9-1.32-2.092-1.516-3.833l-.034-.333-.029-.346-.025-.36-.02-.373-.025-.588-.012-.41-.013-.644-.009-.915-.004-.98.001-3.313.003-.73.01-.914.007-.433.011-.418.014-.403.016-.388.021-.374.025-.36.03-.345.033-.333c.196-1.74.616-2.933 1.516-3.833.9-.9 2.092-1.32 3.833-1.516l.333-.034.346-.029.36-.025.373-.02.588-.025.41-.012.644-.013.915-.009ZM6.79 7.3H4.05c.13 6.24 3.25 9.99 8.72 9.99h.31v-3.57c2.01.2 3.53 1.67 4.14 3.57h2.84c-.78-2.84-2.83-4.41-4.11-5.01 1.28-.74 3.08-2.54 3.51-4.98h-2.58c-.56 1.98-2.22 3.78-3.8 3.95V7.3H10.5v6.92c-1.6-.4-3.62-2.34-3.71-6.92Z"/></svg>,
  slack:        <svg viewBox="0 0 24 24" fill="white" width="24" height="24"><path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/></svg>,
  instagram:    <svg viewBox="0 0 24 24" fill="white" width="24" height="24"><path d="M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077"/></svg>,
  viber:        <svg viewBox="0 0 24 24" fill="white" width="24" height="24"><path d="M11.4 0C9.473.028 5.333.344 3.02 2.467 1.302 4.187.696 6.7.633 9.817.57 12.933.488 18.776 6.12 20.36h.003l-.004 2.416s-.037.977.61 1.177c.777.242 1.234-.5 1.98-1.302.407-.44.972-1.084 1.397-1.58 3.85.326 6.812-.416 7.15-.525.776-.252 5.176-.816 5.892-6.657.74-6.02-.36-9.83-2.34-11.546-.596-.55-3.006-2.3-8.375-2.323 0 0-.395-.025-1.037-.017zm.058 1.693c.545-.004.88.017.88.017 4.542.02 6.717 1.388 7.222 1.846 1.675 1.435 2.53 4.868 1.906 9.897v.002c-.604 4.878-4.174 5.184-4.832 5.395-.28.09-2.882.737-6.153.524 0 0-2.436 2.94-3.197 3.704-.12.12-.26.167-.352.144-.13-.033-.166-.188-.165-.414l.02-4.018c-4.762-1.32-4.485-6.292-4.43-8.895.054-2.604.543-4.738 1.996-6.173 1.96-1.773 5.474-2.018 7.11-2.03zm.38 2.602c-.167 0-.303.135-.304.302 0 .167.133.303.3.305 1.624.01 2.946.537 4.028 1.592 1.073 1.046 1.62 2.468 1.633 4.334.002.167.14.3.307.3.166-.002.3-.138.3-.304-.014-1.984-.618-3.596-1.816-4.764-1.19-1.16-2.692-1.753-4.447-1.765zm-3.96.695c-.19-.032-.4.005-.616.117l-.01.002c-.43.247-.816.562-1.146.932-.002.004-.006.004-.008.008-.267.323-.42.638-.46.948-.008.046-.01.093-.007.14 0 .136.022.27.065.4l.013.01c.135.48.473 1.276 1.205 2.604.42.768.903 1.5 1.446 2.186.27.344.56.673.87.984l.132.132c.31.308.64.6.984.87.686.543 1.418 1.027 2.186 1.447 1.328.733 2.126 1.07 2.604 1.206l.01.014c.13.042.265.064.402.063.046.002.092 0 .138-.008.31-.036.627-.19.948-.46.004 0 .003-.002.008-.005.37-.33.683-.72.93-1.148l.003-.01c.225-.432.15-.842-.18-1.12-.004 0-.698-.58-1.037-.83-.36-.255-.73-.492-1.113-.71-.51-.285-1.032-.106-1.248.174l-.447.564c-.23.283-.657.246-.657.246-3.12-.796-3.955-3.955-3.955-3.955s-.037-.426.248-.656l.563-.448c.277-.215.456-.737.17-1.248-.217-.383-.454-.756-.71-1.115-.25-.34-.826-1.033-.83-1.035-.137-.165-.31-.265-.502-.297zm4.49.88c-.158.002-.29.124-.3.282-.01.167.115.312.282.324 1.16.085 2.017.466 2.645 1.15.63.688.93 1.524.906 2.57-.002.168.13.306.3.31.166.003.305-.13.31-.297.025-1.175-.334-2.193-1.067-2.994-.74-.81-1.777-1.253-3.05-1.346h-.024zm.463 1.63c-.16.002-.29.127-.3.287-.008.167.12.31.288.32.523.028.875.175 1.113.422.24.245.388.62.416 1.164.01.167.15.295.318.287.167-.008.295-.15.287-.317-.03-.644-.215-1.178-.58-1.557-.367-.378-.893-.574-1.52-.607h-.018z"/></svg>,
  signal:       <svg viewBox="0 0 24 24" fill="white" width="24" height="24"><path d="M12 0q-.934 0-1.83.139l.17 1.111a11 11 0 0 1 3.32 0l.172-1.111A12 12 0 0 0 12 0M9.152.34A12 12 0 0 0 5.77 1.742l.584.961a10.8 10.8 0 0 1 3.066-1.27zm5.696 0-.268 1.094a10.8 10.8 0 0 1 3.066 1.27l.584-.962A12 12 0 0 0 14.848.34M12 2.25a9.75 9.75 0 0 0-8.539 14.459c.074.134.1.292.064.441l-1.013 4.338 4.338-1.013a.62.62 0 0 1 .441.064A9.7 9.7 0 0 0 12 21.75c5.385 0 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25m-7.092.068a12 12 0 0 0-2.59 2.59l.909.664a11 11 0 0 1 2.345-2.345zm14.184 0-.664.909a11 11 0 0 1 2.345 2.345l.909-.664a12 12 0 0 0-2.59-2.59M1.742 5.77A12 12 0 0 0 .34 9.152l1.094.268a10.8 10.8 0 0 1 1.269-3.066zm20.516 0-.961.584a10.8 10.8 0 0 1 1.27 3.066l1.093-.268a12 12 0 0 0-1.402-3.383M.138 10.168A12 12 0 0 0 0 12q0 .934.139 1.83l1.111-.17A11 11 0 0 1 1.125 12q0-.848.125-1.66zm23.723.002-1.111.17q.125.812.125 1.66c0 .848-.042 1.12-.125 1.66l1.111.172a12.1 12.1 0 0 0 0-3.662M1.434 14.58l-1.094.268a12 12 0 0 0 .96 2.591l-.265 1.14 1.096.255.36-1.539-.188-.365a10.8 10.8 0 0 1-.87-2.35m21.133 0a10.8 10.8 0 0 1-1.27 3.067l.962.584a12 12 0 0 0 1.402-3.383zm-1.793 3.848a11 11 0 0 1-2.345 2.345l.664.909a12 12 0 0 0 2.59-2.59zm-19.959 1.1L.357 21.48a1.8 1.8 0 0 0 2.162 2.161l1.954-.455-.256-1.095-1.953.455a.675.675 0 0 1-.81-.81l.454-1.954zm16.832 1.769a10.8 10.8 0 0 1-3.066 1.27l.268 1.093a12 12 0 0 0 3.382-1.402zm-10.94.213-1.54.36.256 1.095 1.139-.266c.814.415 1.683.74 2.591.961l.268-1.094a10.8 10.8 0 0 1-2.35-.869zm3.634 1.24-.172 1.111a12.1 12.1 0 0 0 3.662 0l-.17-1.111q-.812.125-1.66.125a11 11 0 0 1-1.66-.125"/></svg>,
  notion:       <svg viewBox="0 0 24 24" fill="white" width="22" height="22"><path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.139c-.093-.514.28-.887.747-.933zM1.936 1.035l13.31-.98c1.634-.14 2.055-.047 3.082.7l4.249 2.986c.7.513.934.653.934 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.047-1.448-.093-1.962-.747l-3.129-4.06c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.447-1.632z"/></svg>,
  trello:       <svg viewBox="0 0 24 24" fill="white" width="24" height="24"><path d="M21.147 0H2.853A2.86 2.86 0 000 2.853v18.294A2.86 2.86 0 002.853 24h18.294A2.86 2.86 0 0024 21.147V2.853A2.86 2.86 0 0021.147 0zM10.34 17.287a.953.953 0 01-.953.953h-4a.954.954 0 01-.954-.953V5.38a.953.953 0 01.954-.953h4a.954.954 0 01.953.953zm9.233-5.467a.944.944 0 01-.953.947h-4a.947.947 0 01-.953-.947V5.38a.953.953 0 01.953-.953h4a.954.954 0 01.953.953z"/></svg>,
  telegram_web: <svg viewBox="0 0 24 24" fill="white" width="24" height="24"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>,
  // ChatGPT/Claude (2026-09-08, live user request — заменить нижние 2 лого
  // на орбите на AI-ассистентов вместо Signal/Viber).
  chatgpt: <svg viewBox="0 0 24 24" fill="white" width="24" height="24"><path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z"/></svg>,
  claude:  <svg viewBox="0 0 24 24" fill="white" width="24" height="24"><path d="m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z"/></svg>,
}

const OsIcons = {
  windows: <svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32"><path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/></svg>,
  macos:   <svg viewBox="0 0 24 24" fill="currentColor" width="30" height="30"><path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/></svg>,
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

function Reveal({ children, delay = 0, y = 24, className }: { children: React.ReactNode; delay?: number; y?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-8% 0px' })
  return (
    <motion.div ref={ref} className={className}
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
  if (name === 'shield') return <svg {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
  if (name === 'play')   return <svg {...p}><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>
  if (name === 'assistant') return <svg {...p}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z"/></svg>
  if (name === 'notes')  return <svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
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

  // REDESIGN (2026-09-08, "некрасиво бегут иконки, часть иконок некрасивая... есть
  // варианты поменять полностью?" — live user request): бегущая строка
  // (marquee) заменена сперва на статичный мокап окна приложения (не
  // понравился — "стиль общий некрасивый"), затем на выбранный пользователем
  // вариант "Орбита": лого Centrio в центре, реальные логотипы сервисов на
  // двух концентрических окружностях вокруг + радиальная сетка (кольца и
  // спицы) на фоне, иконки мягко "парят" (float) с разной задержкой.
  // Позиции считаются тригонометрией (angle→x/y) при рендере — так проще
  // менять число иконок в кольце, чем вручную подбирать проценты для каждой.
  const orbitInner = (['Telegram', 'WhatsApp', 'ВКонтакте', 'MAX', 'Gmail'] as const)
    .map((name) => messengers.find((m) => m.name === name)!)
  // Нижние две позиции внешнего кольца (2026-09-08, live user request —
  // "снизу 2 логотипа поменяй на ChatGPT и Claude") — были Signal/Viber,
  // не входят в общий messengers[] (это не мессенджеры Centrio, а
  // AI-ассистенты), поэтому заданы отдельными литералами той же формы.
  const orbitOuter = [
    messengers.find((m) => m.name === 'Discord')!,
    messengers.find((m) => m.name === 'Instagram')!,
    messengers.find((m) => m.name === 'Slack')!,
    { name: 'ChatGPT', svg: 'chatgpt', color: '#10A37F' },
    { name: 'Claude', svg: 'claude', color: '#D97757' },
    messengers.find((m) => m.name === 'Яндекс.Почта')!,
    messengers.find((m) => m.name === 'Битрикс24')!,
    messengers.find((m) => m.name === 'Notion')!,
  ]

  function orbitPos(i: number, count: number, radiusPct: number, phase: number) {
    const angle = (i / count) * 2 * Math.PI - Math.PI / 2 + phase
    const x = 50 + radiusPct * Math.cos(angle)
    const y = 50 + radiusPct * Math.sin(angle)
    return { left: `${x}%`, top: `${y}%` }
  }

  // REDESIGN (2026-09-08, "собери возможности в один блок" — live user
  // request): merges the old `features` (6 bento tiles) and `capabilities`
  // (14-item grid, which literally repeated every `features` entry — see
  // the removed comment above the old array) into ONE ordered list driving
  // the new alternating .feat-row section below. `mock` selects which
  // hand-built mockup renders in the visual panel — 'icon' is the generic
  // fallback (a single real FIcon in a glowing badge, see FEATURES ── JSX);
  // the rest have bespoke mockups worth the extra markup because they're
  // the flagship/most-visual capabilities. `glow` is an "R,G,B" triplet fed
  // straight into the panel's --glow custom property (see .ft-visual::before).
  const featuresFull = [
    { icon: 'grid',      title: t.f1t,  desc: t.f1d,  tier: 'basic' as const, mock: 'sidebar', glow: '90,169,255' },
    { icon: 'assistant', title: t.f13t, desc: t.f13d, tier: 'pro' as const,   mock: 'chat',     glow: '139,92,246' },
    { icon: 'notes',     title: t.f14t, desc: t.f14d, tier: 'pro' as const,   mock: 'notes',    glow: '245,197,66' },
    { icon: 'shield',    title: t.f11t, desc: t.f11d, tier: 'basic' as const, mock: 'vpn',      glow: '103,232,249' },
    { icon: 'play',      title: t.f12t, desc: t.f12d, tier: 'basic' as const, mock: 'icon',     glow: '244,126,176' },
    { icon: 'folder',    title: t.f3t,  desc: t.f3d,  tier: 'pro' as const,   mock: 'icon',     glow: '74,222,128' },
    { icon: 'bell',      title: t.f2t,  desc: t.f2d,  tier: 'basic' as const, mock: 'icon',     glow: '90,169,255' },
    { icon: 'theme',     title: t.f5t,  desc: t.f5d,  tier: 'basic' as const, mock: 'icon',     glow: '253,186,116' },
    { icon: 'globe',     title: t.f4t,  desc: t.f4d,  tier: 'basic' as const, mock: 'icon',     glow: '103,232,249' },
    { icon: 'sound',     title: t.f8t,  desc: t.f8d,  tier: 'basic' as const, mock: 'icon',     glow: '165,180,252' },
    { icon: 'split',     title: t.f10t, desc: t.f10d, tier: 'pro' as const,   mock: 'split',    glow: '139,92,246' },
    { icon: 'lock',      title: t.f6t,  desc: t.f6d,  tier: 'pro' as const,   mock: 'icon',     glow: '6,182,212' },
    { icon: 'cloud',     title: t.f7t,  desc: t.f7d,  tier: 'pro' as const,   mock: 'icon',     glow: '148,163,184' },
    { icon: 'update',    title: t.f9t,  desc: t.f9d,  tier: 'basic' as const, mock: 'icon',     glow: '148,163,184' },
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

        /* Section label — small-caps sans eyebrow, wide tracking carries the
           "label" read instead of leaning on a monospace face for it. */
        .label {
          display: inline-block;
          font-family: var(--font-geist);
          font-size: 11px; font-weight: 700; letter-spacing: .1em;
          text-transform: uppercase; color: #93C5FF; margin-bottom: 14px;
        }
        .sh { font-family: var(--font-display), var(--font-geist); font-size: clamp(28px,3.8vw,48px); font-weight: 400; line-height: 1.16; letter-spacing: .002em; color: #F5F1E8; }
        .sp { font-size: 15.5px; font-weight: 300; color: ${C}.38); line-height: 1.85; margin-top: 14px; }

        /* Services orbit layout (redesign v3 — text column left, orbit right,
           see comment above orbitInner in the component body). */
        .orbit-layout { display: flex; align-items: center; gap: 56px; }
        .orbit-text { flex: 0 0 340px; }
        .orbit-visual { flex: 1; min-width: 0; }
        @media (max-width: 860px) {
          .orbit-layout { flex-direction: column; text-align: center; gap: 32px; }
          .orbit-text { flex: none; }
          .orbit-text .sp { margin-left: auto; margin-right: auto; }
        }

        /* Services orbit (redesign v2 — see comment above orbitInner in the
           component body). Icons are positioned with inline left/top % (see
           orbitPos()) computed from real trig, not hand-picked percentages —
           .orbit-ic below only supplies the *centering* transform, which the
           float keyframe re-states at every step so the animation doesn't
           clobber it. */
        /* BUGFIX ("как будто вышло не так" — live user report, orbit shrank
           to a ~126px square instead of filling the column): aspect-ratio
           on a flex-item's DESCENDANT interacts badly with flex: 1 (=
           flex-basis 0%) on .orbit-visual — Chromium resolves the flex
           item's intrinsic size against the aspect-ratio child before
           flex-grow gets to distribute the row's free space, so the whole
           column collapsed to content-size instead of filling the row.
           Swapped aspect-ratio for the classic padding-top square hack
           (already used by .orbit-ring below) — height comes from an
           in-flow ::before, which has no such interaction with flex-grow. */
        .orbit {
          position: relative; width: 100%; max-width: 620px;
          margin: 24px auto 0;
        }
        .orbit::before { content: ''; display: block; padding-top: 100%; }
        .orbit-grid {
          position: absolute; inset: 0; border-radius: 50%; pointer-events: none;
          background:
            repeating-conic-gradient(from 0deg, rgba(90,169,255,.05) 0deg 1px, transparent 1px 30deg),
            radial-gradient(circle at 50% 50%, rgba(90,169,255,.05), transparent 70%);
          -webkit-mask-image: radial-gradient(circle at 50% 50%, black 60%, transparent 100%);
                  mask-image: radial-gradient(circle at 50% 50%, black 60%, transparent 100%);
        }
        .orbit-ring {
          position: absolute; left: 50%; top: 50%; height: 0; transform: translate(-50%,-50%);
          border-radius: 50%; border: 1px dashed rgba(255,255,255,.09); pointer-events: none;
        }
        .orbit-core {
          position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%); z-index: 5;
          width: 76px; height: 76px; border-radius: 22px;
          background: linear-gradient(135deg, rgba(90,169,255,.18), rgba(139,92,246,.14));
          border: 1px solid rgba(90,169,255,.35); display: flex; align-items: center; justify-content: center;
          box-shadow: 0 0 0 14px rgba(90,169,255,.05), 0 20px 50px rgba(0,0,0,.45);
        }
        .orbit-core img { width: 36px; height: 36px; object-fit: contain; }
        .orbit-ic {
          position: absolute; z-index: 4; border-radius: 16px; display: flex; align-items: center;
          justify-content: center; overflow: hidden; transform: translate(-50%,-50%);
          animation: orbit-float 5.5s ease-in-out infinite;
        }
        .orbit-ic-lg { width: 60px; height: 60px; }
        .orbit-ic-sm { width: 46px; height: 46px; }
        .orbit-ic img { width: 58%; height: 58%; object-fit: contain; }
        .orbit-svg { display: flex; width: 55%; height: 55%; }
        .orbit-svg svg { width: 100%; height: 100%; }
        @keyframes orbit-float {
          0%, 100% { transform: translate(-50%,-50%) translateY(0); }
          50%      { transform: translate(-50%,-50%) translateY(-9px); }
        }
        .orbit-more {
          text-align: center; margin-top: 18px;
          font-size: 12.5px; color: rgba(245,241,232,.32);
        }
        @media (max-width: 640px) {
          .orbit-ic-lg { width: 48px; height: 48px; }
          .orbit-ic-sm { width: 36px; height: 36px; }
          .orbit-core { width: 60px; height: 60px; border-radius: 18px; }
          .orbit-core img { width: 28px; height: 28px; }
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

        /* REDESIGN (2026-09-08, "собери возможности в один блок... типографику
           из этого блока" — live user request): the old 6-tile bento grid
           (.feat-grid/.feat-0..5) and the separate "ALL CAPABILITIES" section
           below it (.cap-grid/.cap-card) duplicated each other — every single
           .feat-grid tile reappeared verbatim inside .cap-grid (see the old
           capabilities array literally starting with the same f1t/f1d as
           features[0]). Replaced both with ONE alternating-row section
           (.feat-row) covering all 14 capabilities, each with its own real
           icon/logo visual and atmospheric glow — see featuresFull above. */
        .feat-row { position: relative; display: grid; grid-template-columns: 1fr 1fr; gap: 44px; align-items: center; padding: 44px 0; border-top: 1px solid rgba(255,255,255,.08); }
        .feat-row:first-of-type { border-top: none; }
        .feat-row.rev .ft-text { order: 2; }
        .feat-row.rev .ft-visual { order: 1; }
        .feat-row.compact { padding: 32px 0; }

        .pro { display: inline-block; font-size: 10px; font-weight: 700; letter-spacing: .04em; color: #C9E4FF; background: rgba(47,111,237,.16); border: 1px solid rgba(47,111,235,.3); border-radius: 100px; padding: 2px 8px; text-transform: uppercase; }
        .fh { font-family: var(--font-display), var(--font-geist); font-size: 23px; font-weight: 400; letter-spacing: .005em; line-height: 1.26; margin: 0 0 10px; color: #F5F1E8; }
        .feat-row.compact .fh { font-size: 19px; }
        .fd { font-size: 13.5px; font-weight: 300; color: ${C}.5); line-height: 1.7; margin: 0; max-width: 380px; }

        /* Glow: a large soft haze behind the visual panel that dissolves
           gradually rather than a tight halo hugging the edge — colour comes
           from --glow set inline per row (see FEATURES_FULL glow values). */
        .ft-visual {
          position: relative; z-index: 1; background: linear-gradient(160deg, rgba(255,255,255,.03), rgba(255,255,255,.008));
          border: 1px solid rgba(255,255,255,.09); border-radius: 18px; padding: 22px;
          min-height: 190px; display: flex; align-items: center; justify-content: center;
          box-shadow: 0 20px 50px -18px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.06);
        }
        .feat-row.compact .ft-visual { min-height: 130px; padding: 18px; }
        .ft-visual::before {
          content: ''; position: absolute; z-index: -1;
          top: 50%; left: 50%; width: 620px; height: 620px; transform: translate(-50%,-50%);
          background: radial-gradient(circle, rgba(var(--glow),.28) 0%, rgba(var(--glow),.15) 22%, rgba(var(--glow),.06) 42%, rgba(var(--glow),.02) 62%, transparent 78%);
          filter: blur(34px); pointer-events: none;
        }

        /* generic icon showcase — real line-icon (FIcon), never emoji */
        .icon-badge { width: 62px; height: 62px; border-radius: 18px; display: flex; align-items: center; justify-content: center; background: rgba(var(--glow),.12); border: 1px solid rgba(var(--glow),.32); box-shadow: 0 0 30px -6px rgba(var(--glow),.4); }
        .feat-row.compact .icon-badge { width: 48px; height: 48px; border-radius: 14px; }

        /* mock: sidebar of services (real brand PNG/SVG via messengers[]) */
        .mock-sidebar { width: 100%; background: rgba(13,13,22,.8); backdrop-filter: blur(8px); border: 1px solid rgba(255,255,255,.08); border-radius: 14px; padding: 14px; box-shadow: 0 1px 0 rgba(255,255,255,.05) inset; }
        .ft-srow { display: flex; align-items: center; gap: 11px; padding: 9px 8px; border-radius: 9px; }
        .ft-srow.active { background: rgba(90,169,255,.1); box-shadow: 0 0 0 1px rgba(90,169,255,.18); }
        .ft-sicon { width: 30px; height: 30px; border-radius: 9px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; overflow: hidden; }
        .ft-sicon img { width: 17px; height: 17px; object-fit: contain; }
        .ft-sicon svg { width: 17px; height: 17px; }
        .ft-sname { font-size: 12.5px; font-weight: 400; flex: 1; color: #F5F1E8; }
        .ft-sbadge { font-size: 10px; font-weight: 600; color: #fff; border-radius: 8px; padding: 1px 6px; }

        /* mock: assistant chat */
        .mock-chat { width: 100%; display: flex; flex-direction: column; gap: 10px; }
        .ft-bubble { border-radius: 12px; padding: 11px 14px; font-size: 12.5px; font-weight: 350; line-height: 1.55; max-width: 88%; }
        .ft-bubble.user { background: rgba(90,169,255,.16); border: 1px solid rgba(90,169,255,.3); align-self: flex-end; color: #dbeafe; box-shadow: 0 0 24px -6px rgba(90,169,255,.35); margin-left: auto; }
        .ft-bubble.ai { background: rgba(255,255,255,.045); border: 1px solid rgba(255,255,255,.08); color: rgba(245,241,232,.82); }
        .ft-chip-row { display: flex; gap: 6px; flex-wrap: wrap; }
        .ft-chip { font-size: 10.5px; font-weight: 400; color: #c4b5fd; background: rgba(139,92,246,.12); border: 1px solid rgba(139,92,246,.28); border-radius: 100px; padding: 3px 9px; }

        /* mock: notes */
        .mock-notes { width: 100%; display: flex; flex-direction: column; gap: 10px; }
        .ft-note { background: rgba(13,13,22,.8); border: 1px solid rgba(255,255,255,.08); border-radius: 12px; padding: 14px 16px; border-left: 3px solid; }
        .ft-note h5 { margin: 0 0 4px; font-size: 13px; font-weight: 500; color: #F5F1E8; }
        .ft-note p { margin: 0; font-size: 11.5px; font-weight: 300; color: ${C}.3); }
        .ft-swatches { display: flex; gap: 6px; margin-bottom: 12px; }
        .ft-sw { width: 14px; height: 14px; border-radius: 50%; box-shadow: 0 0 10px -1px currentColor; }

        /* mock: vpn server list */
        .mock-vpn { width: 100%; background: rgba(13,13,22,.8); border: 1px solid rgba(255,255,255,.08); border-radius: 14px; padding: 6px; }
        .ft-vrow { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 9px; }
        .ft-vrow.sel { background: rgba(90,169,255,.1); box-shadow: 0 0 0 1px rgba(90,169,255,.2); }
        .ft-vdot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
        .ft-vname { font-size: 12.5px; font-weight: 400; flex: 1; color: #F5F1E8; }
        .ft-vping { font-size: 11px; font-weight: 500; font-variant-numeric: tabular-nums; }

        /* mock: split screen */
        .mock-split { width: 100%; height: 130px; display: grid; grid-template-columns: 1fr 1fr; gap: 3px; border-radius: 14px; overflow: hidden; border: 1px solid rgba(255,255,255,.08); }
        .ft-spane { display: flex; flex-direction: column; gap: 8px; padding: 14px; }
        .ft-spane.a { background: rgba(90,169,255,.06); }
        .ft-spane.b { background: rgba(139,92,246,.06); }
        .ft-sbub { height: 9px; border-radius: 5px; background: rgba(245,241,232,.14); }
        .ft-sbub.short { width: 60%; }

        /* Responsive */
        @media (max-width: 860px) {
          .hero-grid { grid-template-columns: 1fr !important; }
          .mockup-col { display: none !important; }
          .navlinks   { display: none !important; }
          .feat-row   { grid-template-columns: 1fr !important; gap: 32px !important; padding: 48px 0 !important; }
          .feat-row.rev .ft-text { order: 1 !important; } .feat-row.rev .ft-visual { order: 2 !important; }
          .ftcols     { grid-template-columns: 1fr 1fr !important; }
        }
        @media (max-width: 540px) {
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
                <span style={{ fontWeight: 700, fontSize: 17, letterSpacing: '-.02em' }}>Centrio</span>
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
                  style={{ fontFamily: 'var(--font-display), var(--font-geist)', fontSize: 'clamp(40px,5.2vw,74px)', fontWeight: 400, lineHeight: 1.08, letterSpacing: '.001em', marginBottom: 22 }}>
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
                      {MessengerSvgs.discord && <svg viewBox="0 0 24 24" fill="white" width="13" height="13"><path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286Z"/></svg>}
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

        {/* ── SERVICES ORBIT (redesign v3, see comment above orbitInner) ── */}
        <section id="messengers" style={{ padding: '72px 0' }}>
          <div className="wrap orbit-layout">
            {/* BUGFIX (2026-09-08, "как будто вышло не так" — orbit had
                collapsed to a ~126px square: .orbit-text/.orbit-visual carried
                the flex-item sizing rules, but Reveal renders its OWN
                unclassed motion.div around {children} — THAT div, not the one
                one level in, was the real direct child of the flex container,
                so `flex: 1`/`flex: 0 0 340px` on the inner divs did nothing
                and both columns fell back to shrink-to-fit content sizing.
                Fix: className on Reveal itself, so the styled div IS the flex
                item — see Reveal's className prop above. */}
            <Reveal className="orbit-text">
              <div className="label">{t.nav_messengers}</div>
              <h2 className="sh">{t.ms_title}</h2>
              <p className="sp" style={{ maxWidth: 380, margin: '12px 0 0' }}>{t.ms_sub}</p>
            </Reveal>

            <Reveal delay={0.08} className="orbit-visual">
              <div className="orbit">
                <div className="orbit-grid" />
                <div className="orbit-ring" style={{ width: '46%', paddingBottom: '46%' }} />
                <div className="orbit-ring" style={{ width: '84%', paddingBottom: '84%' }} />

                <div className="orbit-core">
                  <img src="/logo.png" alt="Centrio" />
                </div>

                {orbitInner.map((m, i) => {
                  const pos = orbitPos(i, orbitInner.length, 23, 0)
                  return (
                    <div key={m.name} className="orbit-ic orbit-ic-lg" style={{ ...pos, animationDelay: `${i * 0.35}s`, background: m.color + '22', border: `1px solid ${m.color}3a` }}>
                      {m.img ? <img src={m.img} alt={m.name} /> : <span className="orbit-svg">{MessengerSvgs[m.svg!]}</span>}
                    </div>
                  )
                })}

                {orbitOuter.map((m, i) => {
                  const pos = orbitPos(i, orbitOuter.length, 42, 0.22)
                  return (
                    <div key={m.name} className="orbit-ic orbit-ic-sm" style={{ ...pos, animationDelay: `${0.15 + i * 0.3}s`, background: m.color + '1a', border: `1px solid ${m.color}2e` }}>
                      {m.img ? <img src={m.img} alt={m.name} /> : <span className="orbit-svg">{MessengerSvgs[m.svg!]}</span>}
                    </div>
                  )
                })}
              </div>
              <div className="orbit-more">+90 других сервисов</div>
            </Reveal>
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

        {/* ── FEATURES (redesign — all 14 capabilities, see featuresFull) ── */}
        <section id="features" style={{ padding: '96px 0' }}>
          <div className="wrap">
            <Reveal>
              <div style={{ maxWidth: 560, marginBottom: 24 }}>
                <div className="label">{t.nav_features}</div>
                <h2 className="sh">{t.feat_title} <span className="gt">{t.feat_title2}</span></h2>
                <p className="sp">{t.feat_sub}</p>
              </div>
            </Reveal>

            {featuresFull.map((f, i) => (
              <Reveal key={i} delay={0.04} y={16} className={`feat-row ${i % 2 ? 'rev' : ''} ${f.mock === 'icon' ? 'compact' : ''}`}>
                <div className="ft-text">
                  <h3 className="fh">
                    {f.title}
                    {f.tier === 'pro' && <span className="pro" style={{ marginLeft: 10, verticalAlign: 'middle' }}>Pro</span>}
                  </h3>
                  <p className="fd">{f.desc}</p>
                </div>
                <div className="ft-visual" style={{ '--glow': f.glow } as React.CSSProperties}>
                  {f.mock === 'sidebar' && (
                    <div className="mock-sidebar">
                      {([
                        { name: 'Telegram', color: '#2AABEE', badge: 12 },
                        { name: 'WhatsApp', color: '#25D366', badge: 3 },
                        { name: 'ВКонтакте', color: '#0077FF' },
                        { name: 'Discord', color: '#5865F2' },
                        { name: 'Gmail', color: '#EA4335', badge: 5 },
                      ] as { name: string; color: string; badge?: number }[]).map((s, si) => {
                        const m = messengers.find((mm) => mm.name === s.name)!
                        return (
                          <div key={s.name} className={`ft-srow ${si === 0 ? 'active' : ''}`}>
                            <div className="ft-sicon" style={{ background: s.color + '22' }}>
                              {m.img ? <img src={m.img} alt={s.name} /> : <span>{MessengerSvgs[m.svg!]}</span>}
                            </div>
                            <div className="ft-sname">{s.name}</div>
                            {s.badge && <span className="ft-sbadge" style={{ background: s.color }}>{s.badge}</span>}
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {f.mock === 'chat' && (
                    <div className="mock-chat">
                      <div className="ft-bubble user">{t.feat_ai_q}</div>
                      <div className="ft-chip-row"><span className="ft-chip">Telegram</span><span className="ft-chip">Slack</span><span className="ft-chip">Gmail</span></div>
                      <div className="ft-bubble ai">{t.feat_ai_a}</div>
                    </div>
                  )}
                  {f.mock === 'notes' && (
                    <div className="mock-notes">
                      <div className="ft-swatches">
                        {['#f5c542', '#4caf7d', '#5aa9ff', '#f47eb0'].map((c) => (
                          <span key={c} className="ft-sw" style={{ background: c, color: c }} />
                        ))}
                      </div>
                      <div className="ft-note" style={{ borderLeftColor: '#f5c542' }}><h5>{t.feat_note1t}</h5><p>{t.feat_note1d}</p></div>
                      <div className="ft-note" style={{ borderLeftColor: '#5aa9ff' }}><h5>{t.feat_note2t}</h5><p>{t.feat_note2d}</p></div>
                    </div>
                  )}
                  {f.mock === 'vpn' && (
                    <div className="mock-vpn">
                      {([
                        { name: 'Frankfurt · Gemeni 1', ping: 18, c: '#4ade80', sel: true },
                        { name: 'Amsterdam · NL', ping: 34, c: '#4ade80' },
                        { name: 'Warsaw · PL', ping: 81, c: '#facc15' },
                        { name: 'Stockholm · SE', ping: 156, c: '#f87171' },
                      ] as { name: string; ping: number; c: string; sel?: boolean }[]).map((v) => (
                        <div key={v.name} className={`ft-vrow ${v.sel ? 'sel' : ''}`}>
                          <span className="ft-vdot" style={{ background: v.c }} />
                          <div className="ft-vname">{v.name}</div>
                          <span className="ft-vping" style={{ color: v.c }}>{v.ping} ms</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {f.mock === 'split' && (
                    <div className="mock-split">
                      <div className="ft-spane a"><div className="ft-sbub" /><div className="ft-sbub short" /><div className="ft-sbub" /></div>
                      <div className="ft-spane b"><div className="ft-sbub" /><div className="ft-sbub" /><div className="ft-sbub short" /></div>
                    </div>
                  )}
                  {f.mock === 'icon' && (
                    <div className="icon-badge" style={{ '--glow': f.glow } as React.CSSProperties}>
                      <FIcon name={f.icon} color={`rgb(${f.glow})`} />
                    </div>
                  )}
                </div>
              </Reveal>
            ))}
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
                  <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
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
