import {
  CheckCircle2, Clock, ShieldCheck, Zap,
  Users, Mail, Bell, Lock, Star, Globe, Settings, Heart,
  TrendingUp, Database, Headset, Sparkles, type LucideIcon,
} from 'lucide-react'

// Fixed icon palette - keys must match LOGIN_HIGHLIGHT_ICONS in backend/branding/models.py
export const LOGIN_ICON_MAP: Record<string, LucideIcon> = {
  zap: Zap, clock: Clock, shield: ShieldCheck, check: CheckCircle2,
  users: Users, mail: Mail, bell: Bell, lock: Lock, star: Star,
  globe: Globe, settings: Settings, heart: Heart,
  'trending-up': TrendingUp, database: Database, headset: Headset, sparkles: Sparkles,
}

export const LOGIN_ICON_OPTIONS = Object.keys(LOGIN_ICON_MAP)

export const DEFAULT_LOGIN_HIGHLIGHTS = [
  { icon: 'zap', text: 'Auto-assign tickets to the right team instantly' },
  { icon: 'clock', text: 'SLA tracking with real-time breach alerts' },
  { icon: 'shield', text: 'Full audit trail and role-based access' },
  { icon: 'check', text: 'Email notifications at every step' },
]

export const DEFAULT_LOGIN_HEADLINE = 'Resolve faster.\nWork smarter.'
