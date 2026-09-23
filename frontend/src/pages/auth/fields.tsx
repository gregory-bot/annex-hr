import { useState } from 'react'
import { Eye, EyeOff, LoaderCircle } from 'lucide-react'
import { Button, type ButtonProps } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

export function Field({ id, label, error, hint, children, action }: { id?: string; label: string; error?: string; hint?: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {action}
      </div>
      {children}
      {error ? (
        <p id={id ? `${id}-error` : undefined} role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : (
        hint && <div className="text-xs text-muted-foreground">{hint}</div>
      )}
    </div>
  )
}

export function PasswordInput({ id, value, onChange, placeholder = '••••••••', invalid, autoComplete = 'current-password' }: { id: string; value: string; onChange: (v: string) => void; placeholder?: string; invalid?: boolean; autoComplete?: string }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        aria-invalid={invalid || undefined}
        className={cn('pr-10', invalid && 'border-danger')}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground transition hover:text-foreground"
        aria-label={show ? 'Hide password' : 'Show password'}
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  )
}

/** Suffix input for `{slug}.annexhr.com`. */
export function WorkspaceInput({ id, value, onChange, invalid }: { id: string; value: string; onChange: (v: string) => void; invalid?: boolean }) {
  return (
    <div
      className={cn(
        'flex h-10 w-full overflow-hidden rounded-lg border border-input bg-card text-sm transition-colors focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10',
        invalid && 'border-danger focus-within:border-danger',
      )}
    >
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
        placeholder="annex"
        autoComplete="organization"
        autoCapitalize="none"
        spellCheck={false}
        aria-invalid={invalid || undefined}
        className="min-w-0 flex-1 bg-transparent px-3 outline-none placeholder:text-muted-foreground/70"
      />
      <span className="flex items-center border-l bg-muted px-3 text-muted-foreground">.annexhr.com</span>
    </div>
  )
}

export function SubmitButton({ loading, children, loadingText, className, ...props }: ButtonProps & { loading?: boolean; loadingText?: string }) {
  return (
    <Button type="submit" size="lg" disabled={loading || props.disabled} className={cn('w-full', className)} {...props}>
      {loading && <LoaderCircle className="animate-spin" />}
      {loading ? (loadingText ?? 'Please wait…') : children}
    </Button>
  )
}

export function passwordStrength(pw: string) {
  let score = 0
  if (pw.length >= 8) score++
  if (pw.length >= 12) score++
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++
  if (/\d/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  const level = Math.min(4, score)
  const label = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'][level]!
  return { level, label }
}

export function StrengthMeter({ password }: { password: string }) {
  const { level, label } = passwordStrength(password)
  const tone = level <= 1 ? 'bg-danger' : level === 2 ? 'bg-warning' : 'bg-success'
  return (
    <div className="grid grid-cols-1 gap-1.5" aria-live="polite">
      <div className="grid grid-cols-4 gap-1">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className={cn('h-1 rounded-full transition-colors duration-300', password && level >= i ? tone : 'bg-muted')} />
        ))}
      </div>
      <div className="text-xs text-muted-foreground">
        {password ? (
          <>
            Strength: <span className="font-medium text-foreground">{label}</span> · use 8+ characters with numbers & symbols
          </>
        ) : (
          'Use 8+ characters with a mix of letters, numbers & symbols'
        )}
      </div>
    </div>
  )
}
