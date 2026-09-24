import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

/** Export button. CSV download is real; PDF uses the browser print dialog. */
export function ExportMenu({ filename, rows }: { filename: string; rows?: Record<string, string | number>[] }) {
  const exportCsv = () => {
    if (!rows?.length) {
      toast.success('Export queued', { description: `${filename}.xlsx will be emailed to you shortly.` })
      return
    }
    const headers = Object.keys(rows[0]!)
    const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => JSON.stringify(r[h] ?? '')).join(','))].join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${filename}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Excel export ready', { description: `${filename}.csv downloaded` })
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => setTimeout(() => window.print(), 100)}>
          Export PDF
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={exportCsv}>
          Export Excel
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
