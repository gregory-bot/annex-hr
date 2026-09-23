import { CalendarDays } from 'lucide-react'
import { DayPicker, type DateRange } from 'react-day-picker'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn, formatDate } from '@/lib/utils'

const dayPickerClasses = {
  root: 'text-sm',
  months: 'flex flex-col gap-4 sm:flex-row',
  month_caption: 'flex h-8 items-center justify-center font-semibold',
  nav: 'absolute right-3 top-3 flex gap-1',
  button_previous: 'inline-flex size-7 items-center justify-center rounded-md hover:bg-muted',
  button_next: 'inline-flex size-7 items-center justify-center rounded-md hover:bg-muted',
  chevron: 'size-4 fill-foreground',
  weekdays: 'flex',
  weekday: 'w-9 text-[11px] font-medium text-muted-foreground',
  week: 'mt-1 flex',
  day: 'size-9 p-0 text-center',
  day_button: 'size-9 rounded-lg text-sm hover:bg-muted transition-colors',
  selected: '[&>button]:bg-primary [&>button]:text-white [&>button]:hover:bg-primary',
  range_middle: '[&>button]:!bg-accent [&>button]:!text-accent-foreground',
  today: '[&>button]:font-bold [&>button]:text-primary',
  outside: 'opacity-40',
  disabled: 'opacity-30',
}

export function DatePicker({ value, onChange, placeholder = 'Pick a date', className }: { value?: Date; onChange: (d?: Date) => void; placeholder?: string; className?: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className={cn('flex h-10 w-full items-center gap-2 rounded-lg border border-input bg-card px-3 text-left text-sm focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10', !value && 'text-muted-foreground', className)}>
          <CalendarDays className="size-4 text-muted-foreground" />
          {value ? formatDate(value) : placeholder}
        </button>
      </PopoverTrigger>
      <PopoverContent className="relative w-auto p-3" align="start">
        <DayPicker mode="single" selected={value} onSelect={onChange} classNames={dayPickerClasses} />
      </PopoverContent>
    </Popover>
  )
}

export function DateRangePicker({ value, onChange, placeholder = 'Select dates', className }: { value?: DateRange; onChange: (r?: DateRange) => void; placeholder?: string; className?: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className={cn('flex h-10 w-full items-center gap-2 rounded-lg border border-input bg-card px-3 text-left text-sm focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10', !value?.from && 'text-muted-foreground', className)}>
          <CalendarDays className="size-4 text-muted-foreground" />
          {value?.from ? (value.to ? `${formatDate(value.from)} – ${formatDate(value.to)}` : formatDate(value.from)) : placeholder}
        </button>
      </PopoverTrigger>
      <PopoverContent className="relative w-auto p-3" align="start">
        <DayPicker mode="range" selected={value} onSelect={onChange} classNames={dayPickerClasses} numberOfMonths={1} />
      </PopoverContent>
    </Popover>
  )
}

export { dayPickerClasses }
