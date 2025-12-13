import { cn } from '@/lib/utils'
import { Wallet } from 'lucide-react'

interface LogoProps {
  className?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  variant?: 'default' | 'white' | 'dark'
  showIcon?: boolean
  iconOnly?: boolean
}

const sizeConfig = {
  sm: { text: 'text-lg', icon: 16, gap: 'gap-1.5' },
  md: { text: 'text-xl', icon: 20, gap: 'gap-2' },
  lg: { text: 'text-3xl', icon: 28, gap: 'gap-2.5' },
  xl: { text: 'text-4xl', icon: 36, gap: 'gap-3' },
}

export function Logo({ 
  className, 
  size = 'md', 
  variant = 'default', 
  showIcon = true,
  iconOnly = false 
}: LogoProps) {
  const config = sizeConfig[size]
  
  const colorClasses = {
    default: 'text-foreground',
    white: 'text-white',
    dark: 'text-secondary'
  }

  if (iconOnly) {
    return (
      <div className={cn(
        'flex items-center justify-center rounded-xl bg-primary text-primary-foreground',
        size === 'sm' && 'w-8 h-8',
        size === 'md' && 'w-10 h-10',
        size === 'lg' && 'w-14 h-14',
        size === 'xl' && 'w-18 h-18',
        className
      )}>
        <Wallet size={config.icon} strokeWidth={2.5} />
      </div>
    )
  }

  return (
    <div className={cn(
      'flex items-center font-bold tracking-tight',
      config.gap,
      config.text,
      colorClasses[variant],
      className
    )}>
      {showIcon && (
        <div className="flex items-center justify-center rounded-lg bg-primary text-primary-foreground p-1.5">
          <Wallet size={config.icon} strokeWidth={2.5} />
        </div>
      )}
      <span>
        <span className="font-extrabold">Spend</span>
        <span className="font-semibold text-primary">Plan</span>
      </span>
    </div>
  )
}

export function LogoIcon({ className, size = 'md' }: Omit<LogoProps, 'variant' | 'showIcon'>) {
  return <Logo className={className} size={size} iconOnly />
}
