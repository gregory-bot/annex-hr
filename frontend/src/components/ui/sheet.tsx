import * as React from 'react'
import * as SheetPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export const Sheet = SheetPrimitive.Root
export const SheetTrigger = SheetPrimitive.Trigger
export const SheetClose = SheetPrimitive.Close

const sideClasses = {
  right: 'inset-y-0 right-0 h-full w-full sm:max-w-lg border-l data-[state=open]:animate-[slideInRight_.25s_cubic-bezier(.2,.8,.2,1)]',
  left: 'inset-y-0 left-0 h-full w-[85%] max-w-xs border-r data-[state=open]:animate-[slideInLeft_.25s_cubic-bezier(.2,.8,.2,1)]',
  bottom: 'inset-x-0 bottom-0 max-h-[88dvh] rounded-t-2xl border-t data-[state=open]:animate-[slideInUp_.25s_cubic-bezier(.2,.8,.2,1)]',
}

export const SheetContent = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content> & { side?: keyof typeof sideClasses; hideClose?: boolean }
>(({ side = 'right', className, children, hideClose, ...props }, ref) => (
  <SheetPrimitive.Portal>
    <SheetPrimitive.Overlay className="fixed inset-0 z-50 bg-[#0b0d12]/40 backdrop-blur-[2px] data-[state=open]:animate-[fadeIn_.15s_ease-out]" />
    <SheetPrimitive.Content
      ref={ref}
      className={cn('fixed z-50 flex flex-col overflow-y-auto bg-card shadow-2xl scrollbar-thin', sideClasses[side], className)}
      {...props}
    >
      {children}
      {!hideClose && (
        <SheetPrimitive.Close className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground">
          <X className="size-4" />
          <span className="sr-only">Close</span>
        </SheetPrimitive.Close>
      )}
    </SheetPrimitive.Content>
  </SheetPrimitive.Portal>
))
SheetContent.displayName = 'SheetContent'

export const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => <SheetPrimitive.Title ref={ref} className={cn('text-lg font-semibold', className)} {...props} />)
SheetTitle.displayName = 'SheetTitle'

export const SheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
))
SheetDescription.displayName = 'SheetDescription'
