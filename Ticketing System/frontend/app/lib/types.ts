export interface Role {
  id: number
  name: string
  is_super: boolean
  permissions: string[]
  user_count: number
  created_at: string
}

export interface PermissionCatalogAction {
  key: string
  action: string
  label: string
}

export interface PermissionCatalogModule {
  module: string
  module_label: string
  actions: PermissionCatalogAction[]
}

export interface User {
  id: number
  email: string
  first_name: string
  last_name: string
  full_name: string
  phone: string
  role: number
  role_detail: Role
  assignable_roles: number[]
  assignable_roles_detail: Role[]
  department: number | null
  department_name: string | null
  avatar: string | null
  idle_timeout_minutes: number | null
  effective_idle_timeout_minutes: number
  is_active: boolean
  is_deleted?: boolean
  deleted_alias?: string
  date_joined: string
}

export interface VaultEntry {
  id: number
  title: string
  username: string
  url: string
  comment: string
  has_password: boolean
  created_at: string
  updated_at: string
}

export interface Department {
  id: number
  name: string
  description: string
  email: string
  manager: number | null
  manager_name: string | null
  auto_assign_to: number | null
  auto_assign_to_name: string | null
  routing_mode: 'manager' | 'pool'
  mention_scope: 'department' | 'all'
  is_active: boolean
  member_count: number
  sla_policies: SLAPolicy[]
  categories: { id: number; name: string; color: string; slug: string }[]
  created_at: string
  updated_at: string
}

export interface TicketCategory {
  id: number
  name: string
  slug: string
  description: string
  color: string
  is_active: boolean
  order: number
  department_ids: number[]
  department_names: { id: number; name: string }[]
}

export interface TicketFormConfig {
  category_required: boolean
  priority_required: boolean
  department_required: boolean
  location_required: boolean
}

export interface SystemSettings {
  id: number
  // Organisation
  company_name: string
  company_logo: string | null
  company_logo_url: string | null
  company_tagline: string
  company_email: string
  company_phone: string
  company_website: string
  company_address: string
  // Portal
  portal_name: string
  portal_welcome: string
  support_hours: string
  login_headline: string
  login_highlights: { icon: string; text: string }[]
  powered_by_text: string
  // Security
  default_idle_timeout_minutes: number
  // Appearance
  primary_color: string
  favicon: string | null
  favicon_url: string | null
  // Ticket Numbering
  ticket_prefix: string
  ticket_separator: string
  ticket_include_year: boolean
  ticket_year_format: 'YYYY' | 'YY'
  ticket_seq_digits: number
  ticket_reset_yearly: boolean
  ticket_number_preview: string
  // Email SMTP
  email_enabled: boolean
  email_host: string
  email_port: number
  email_use_tls: boolean
  email_use_ssl: boolean
  email_host_user: string
  email_host_password: string
  email_timeout: number
  // Email Identity
  email_sender_name: string
  email_sender_address: string
  email_reply_to: string
  email_footer: string
  // Notification toggles
  notify_on_ticket_created: boolean
  notify_on_ticket_assigned: boolean
  notify_on_status_updated: boolean
  notify_on_comment_added: boolean
  notify_on_ticket_resolved: boolean
  notify_on_sla_breach: boolean
}

export interface SLAPolicy {
  id: number
  department: number | null
  priority: 'critical' | 'high' | 'medium' | 'low'
  priority_display: string
  response_time_minutes: number
  resolution_time_minutes: number
  response_time_display: string
  resolution_time_display: string
}

export interface TicketParticipant {
  id: number
  user: number
  user_detail: User
  invited_by: number | null
  invited_by_detail: User | null
  status: 'active' | 'contributed' | 'exited'
  status_display: string
  invited_at: string
}

export interface MentionUser {
  id: number
  full_name: string
  email: string
  role: string
  department_name: string | null
  avatar: string | null
}

export interface Ticket {
  id: number
  ticket_number: string
  title: string
  description: string
  category: string
  category_display: string
  priority: 'critical' | 'high' | 'medium' | 'low'
  priority_display: string
  status: string
  status_display: string
  requester: number
  requester_detail: User
  department: number | null
  department_detail: Department | null
  assigned_to: number | null
  assigned_to_detail: User | null
  sla_response_due: string | null
  sla_resolution_due: string | null
  first_response_at: string | null
  resolved_at: string | null
  closed_at: string | null
  is_sla_response_breached: boolean
  is_sla_resolution_breached: boolean
  location: string
  comments: Comment[]
  attachments: Attachment[]
  participants: TicketParticipant[]
  created_at: string
  updated_at: string
}

export interface Comment {
  id: number
  ticket: number
  author: number
  author_detail: User
  body: string
  is_internal: boolean
  attachments: Attachment[]
  created_at: string
  updated_at: string
}

export interface Attachment {
  id: number
  download_url: string
  filename: string
  file_size: number
  content_type: string
  uploaded_at: string
  uploaded_by: number
}

export interface Notification {
  id: number
  ticket: number | null
  ticket_number: string | null
  notification_type: string
  notification_type_display: string
  title: string
  message: string
  is_read: boolean
  created_at: string
}

export interface EmailTemplate {
  id: number
  notification_type: string
  label: string
  is_custom: boolean
  subject: string
  body: string
  default_subject: string
  default_body: string
  placeholders: string[]
  updated_at: string
}

export interface DirectoryField {
  id: number
  tab: number
  name: string
  order: number
  created_at: string
}

export interface DirectoryTab {
  id: number
  name: string
  order: number
  custom_fields: DirectoryField[]
  entry_count: number
  created_at: string
}

export interface StaffDirectoryEntry {
  id: number
  tab: number | null
  tab_name: string | null
  values: Record<string, string>
  created_at: string
  updated_at: string
}

export interface PortalCategory {
  id: number
  name: string
  order: number
  allowed_roles: number[]
  allowed_role_names: string[]
  portal_count: number
  created_at: string
}

export interface Portal {
  id: number
  name: string
  url: string
  category: number | null
  category_name: string | null
  favicon_url: string | null
  created_by: number | null
  created_by_name: string | null
  created_at: string
  updated_at: string
}

export interface PaginatedResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export interface DashboardSummary {
  total: number
  new: number
  open: number
  pending: number
  resolved: number
  closed: number
  sla_breached: number
  assigned_to_me?: number
}

export const PRIORITY_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 border-red-200',
  high: 'bg-orange-100 text-orange-700 border-orange-200',
  medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  low: 'bg-green-100 text-green-700 border-green-200',
}

export const STATUS_COLORS: Record<string, string> = {
  new: 'bg-blue-100 text-blue-700 border-blue-200',
  assigned: 'bg-purple-100 text-purple-700 border-purple-200',
  in_progress: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  pending_user: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  pending_vendor: 'bg-orange-100 text-orange-700 border-orange-200',
  escalated: 'bg-red-100 text-red-700 border-red-200',
  resolved: 'bg-green-100 text-green-700 border-green-200',
  closed: 'bg-gray-100 text-gray-700 border-gray-200',
  reopened: 'bg-pink-100 text-pink-700 border-pink-200',
}
