import type { Employee } from '@/data/types'
import { TODAY, daysUntil } from '@/lib/utils'

/** Days until this person's next birthday, comparing month/day to TODAY. */
export function daysToBirthday(birthday: string) {
  const [, m, d] = birthday.split('-')
  const year = Number(TODAY.slice(0, 4))
  let next = `${year}-${m}-${d}`
  if (daysUntil(next) < 0) next = `${year + 1}-${m}-${d}`
  return { days: daysUntil(next), date: next }
}

export function upcomingBirthdays(employees: Employee[], withinDays = 30) {
  return employees
    .filter((e) => e.status !== 'Exited')
    .map((e) => ({ employee: e, ...daysToBirthday(e.birthday) }))
    .filter((b) => b.days <= withinDays)
    .sort((a, b) => a.days - b.days)
}

export function firstName(name: string) {
  return name.split(' ')[0] ?? name
}

export function greeting() {
  return 'Good morning'
}
