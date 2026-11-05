const BEIJING_TZ = 'Asia/Shanghai'
const DAY_MS = 24 * 60 * 60 * 1000

/** 把 Date 格式化成北京时间 YYYY-MM-DD */
export const formatBeijingDate = (date: Date): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: BEIJING_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)

/** 解析 YYYY-MM-DD 为 UTC 零点，避免本地时区干扰日期加减 */
const parseDateOnly = (date: string): Date => {
  const [year, month, day] = date.split('-').map(Number)
  if (!year || !month || !day) throw new Error(`非法日期: ${date}`)
  return new Date(Date.UTC(year, month - 1, day))
}

/** 在 YYYY-MM-DD 上加减天数 */
export const addDays = (date: string, days: number): string =>
  new Date(parseDateOnly(date).getTime() + days * DAY_MS).toISOString().slice(0, 10)

/** 判断 YYYY-MM-DD 是否为周二 */
export const isTuesday = (date: string): boolean => parseDateOnly(date).getUTCDay() === 2

/** 最近一个已经到来的周二（北京时间）；周二当天返回当天 */
export const getLatestTuesday = (now = new Date()): string => {
  const today = formatBeijingDate(now)
  const day = parseDateOnly(today).getUTCDay() // 0=周日, 2=周二
  const daysSinceTuesday = (day - 2 + 7) % 7
  return addDays(today, -daysSinceTuesday)
}

/**
 * 发布窗口：发布日的前 7 天。
 * 例如 2026-06-02 发布，覆盖 2026-05-26 00:00 至 2026-06-01 23:59（北京时间）。
 */
export const getPublishWindow = (publishDate: string, days = 7) => ({
  startDate: addDays(publishDate, -days),
  endDate: addDays(publishDate, -1),
})

export const getWeekRangeLabel = (publishDate: string, days = 7): string => {
  const { startDate, endDate } = getPublishWindow(publishDate, days)
  return `${startDate} 至 ${endDate}`
}
