import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-sm shadow-primary/20 hover:bg-primary/90',
        secondary: 'bg-muted text-foreground hover:bg-muted/70 border border-border',
        outline: 'border border-input bg-card hover:bg-muted text-foreground',
        ghost: 'hover:bg-muted text-foreground',
        soft: 'bg-accent text-accent-foreground hover:bg-accent/80',
        destructive: 'bg-danger text-white hover:bg-danger/90',
        link: 'text-primary underline-offset-4 hover:underline px-0 h-auto',
        white: 'bg-white text-[#111827] hover:bg-white/90 shadow-sm',
      },
      size: {
        default: 'h-9 px-4',
        sm: 'h-8 px-3 text-xs rounded-md',
        lg: 'h-11 px-6 text-[15px]',
        xl: 'h-12 px-7 text-base rounded-xl',
        icon: 'size-9',
        'icon-sm': 'size-8 rounded-md',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
  },
)
Button.displayName = 'Button'
