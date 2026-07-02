'use client'
import { useEffect, useState } from 'react'
import api from '@/app/lib/api'
import { DirectoryTab } from '@/app/lib/types'
import { useHasPerm } from '@/app/lib/store'
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card'
import { MasterUpload } from '@/app/components/ui/master-upload'
import { BookOpen, Link as LinkIcon, Users as UsersIcon } from 'lucide-react'

function MasterRow({ icon: Icon, title, description, children }: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3.5">
      <div className="flex items-start gap-3 min-w-0">
        <Icon className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-800">{title}</p>
          <p className="text-xs text-gray-400 mt-0.5">{description}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">{children}</div>
    </div>
  )
}

export function MastersSection() {
  const canImportDirectory = useHasPerm('directory_tabs', 'add')
  const canImportPortals = useHasPerm('directory_portals', 'add')
  const canImportUsers = useHasPerm('users', 'add')

  const [dirTabs, setDirTabs] = useState<DirectoryTab[]>([])

  useEffect(() => {
    api.get('/directory/tabs/').then((res) => setDirTabs(res.data.results ?? res.data))
  }, [])

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Master Upload</CardTitle>
          <p className="text-xs text-gray-400 mt-1">
            Download a ready-made Excel template for a page, fill it in, then upload it back to bulk create or
            update records. Uploading again with the same key column (shown in the template's Instructions sheet)
            updates existing rows instead of duplicating them.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-gray-100">
            {canImportUsers && (
              <MasterRow icon={UsersIcon} title="Users" description="Bulk create or update user accounts.">
                <MasterUpload label="Users" templateUrl="/auth/users/template/" importUrl="/auth/users/import/" />
              </MasterRow>
            )}

            {canImportPortals && (
              <MasterRow icon={LinkIcon} title="Portals" description="Bulk create or update portal links and their categories.">
                <MasterUpload label="Portals" templateUrl="/directory/portals/template/" importUrl="/directory/portals/import/" />
              </MasterRow>
            )}

            {canImportDirectory && dirTabs.map((t) => (
              <MasterRow
                key={t.id}
                icon={BookOpen}
                title={`Directory — ${t.name}`}
                description={`Bulk create or update entries for the "${t.name}" tab (${t.custom_fields.length} column${t.custom_fields.length === 1 ? '' : 's'}).`}
              >
                <MasterUpload
                  label={`Directory — ${t.name}`}
                  templateUrl={`/directory/entries/template/?tab=${t.id}`}
                  importUrl="/directory/entries/import/"
                  extraFields={{ tab: t.id }}
                />
              </MasterRow>
            ))}

            {canImportDirectory && dirTabs.length === 0 && (
              <p className="px-4 py-6 text-center text-gray-400 text-sm">
                No directory tabs yet — create one from Settings → Directory first.
              </p>
            )}

            {!canImportUsers && !canImportPortals && !canImportDirectory && (
              <p className="px-4 py-6 text-center text-gray-400 text-sm">
                You don't have permission to bulk-import any of these yet.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
