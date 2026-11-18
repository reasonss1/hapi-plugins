import { cloneElement, useId, useState, type FormEvent, type ReactElement } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
    MACHINE_CAPABILITIES, PLUGIN_SKILL_MAX_BYTES, PLUGIN_SKILL_MAX_FILES, PluginMcpConfigSchema, PluginNameSchema,
    type PluginAgent, type PluginRequest
} from '@hapi/protocol'
import type { ApiClient } from '@/api/client'
import { SettingsPageContent, SettingsSection } from '@/components/settings/SettingsPrimitives'
import { useMachines } from '@/hooks/queries/useMachines'
import { getMachineTitle } from '@/hooks/useMachineLabels'
import { useAppContext } from '@/lib/app-context'
import { useTranslation } from '@/lib/use-translation'

const inputClass = 'w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-2 py-2 text-sm text-[var(--app-fg)] focus-visible:outline-[var(--app-link)]'
const buttonClass = 'rounded-lg border border-[var(--app-border)] px-3 py-1.5 text-sm text-[var(--app-link)] hover:bg-[var(--app-subtle-bg)] disabled:opacity-50'
const noteClass = 'text-sm text-[var(--app-hint)]'

function Field(props: { label: string; children: ReactElement<{ id?: string }> }) {
    const id = useId()
    return <div className="space-y-1 text-sm">
        <label htmlFor={id} className="block font-medium">{props.label}</label>
        {cloneElement(props.children, { id })}
    </div>
}

async function encodeSkillFiles(files: File[]) {
    return await Promise.all(files.map(async (file) => {
        const bytes = new Uint8Array(await file.arrayBuffer())
        let binary = ''
        for (let offset = 0; offset < bytes.length; offset += 8192) {
            binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
        }
        const relative = file.webkitRelativePath
        return { path: relative ? relative.slice(relative.indexOf('/') + 1) : file.name, data: btoa(binary) }
    }))
}

function PluginSettings(props: { api: ApiClient; machineId: string; agent: PluginAgent }) {
    const { t } = useTranslation()
    const [name, setName] = useState('')
    const [transport, setTransport] = useState<'http' | 'stdio'>('http')
    const [url, setUrl] = useState('')
    const [command, setCommand] = useState('')
    const [args, setArgs] = useState('')
    const [files, setFiles] = useState<File[]>([])
    const [fileSelection, setFileSelection] = useState(0)
    const [error, setError] = useState('')
    const [status, setStatus] = useState('')
    const [removing, setRemoving] = useState<string | null>(null)
    const queryClient = useQueryClient()
    const { api, machineId, agent } = props
    const key = ['machine-plugins', machineId, agent] as const
    const query = useQuery({
        queryKey: key,
        queryFn: () => api.managePlugins(machineId, { action: 'list', agent }),
        retry: false
    })
    const mutation = useMutation({
        mutationFn: async (request: PluginRequest | File[]) => {
            const payload = Array.isArray(request)
                ? { action: 'installSkill' as const, agent, files: await encodeSkillFiles(request) }
                : request
            return await api.managePlugins(machineId, payload)
        },
        onMutate: async () => {
            await queryClient.cancelQueries({ queryKey: key })
            setError('')
            setStatus('')
        },
        onSuccess: (result, request) => {
            if (!result.ok) {
                setError(t(`settings.plugins.error.${result.error}`))
                if (result.error === 'disabled') queryClient.setQueryData(key, result)
                return
            }
            queryClient.setQueryData(key, result)
            if (Array.isArray(request)) {
                setFiles([])
                setFileSelection((previous) => previous + 1)
                setStatus(t('settings.plugins.installed', { name: result.installed ?? '' }))
            } else {
                if (request.action === 'addMcp') {
                    setName('')
                    setUrl('')
                    setCommand('')
                    setArgs('')
                }
                setRemoving(null)
                setStatus(t('settings.plugins.saved'))
            }
        },
        onError: () => setError(t('settings.plugins.requestFailed'))
    })

    function addMcp(event: FormEvent) {
        event.preventDefault()
        const parsedName = PluginNameSchema.safeParse(name.trim())
        const config = PluginMcpConfigSchema.safeParse(transport === 'http'
            ? { transport, url: url.trim() }
            : { transport, command: command.trim(), args: args ? args.split(/\r?\n/) : [] })
        if (!parsedName.success || !config.success) {
            setError(t('settings.plugins.invalidMcp'))
            setStatus('')
            return
        }
        mutation.mutate({ action: 'addMcp', agent, entry: { name: parsedName.data, config: config.data, enabled: true } })
    }

    function upload(event: FormEvent) {
        event.preventDefault()
        if (!files.length) return
        if (files.length > PLUGIN_SKILL_MAX_FILES || files.reduce((total, file) => total + file.size, 0) > PLUGIN_SKILL_MAX_BYTES) {
            setError(t('settings.plugins.error.limit'))
            setStatus('')
            return
        }
        mutation.mutate(files)
    }

    if (query.isPending) return <p className={noteClass} role="status">{t('loading')}</p>
    if (query.isError || !query.data?.ok) {
        return <div className="space-y-2">
            <p role="alert" className={noteClass}>
                {query.data?.ok === false ? t(`settings.plugins.error.${query.data.error}`) : t('settings.plugins.requestFailed')}
            </p>
            <button type="button" className={buttonClass} disabled={query.isFetching} onClick={() => void query.refetch()}>{t('settings.plugins.retry')}</button>
        </div>
    }
    const busy = mutation.isPending
    const { mcp, skills } = query.data

    return <>
        <SettingsSection title="MCP" description={t('settings.plugins.mcpDescription')}>
            {mcp.map((entry) => <div key={entry.name} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <div className="min-w-0">
                    <div className="break-all font-medium">{entry.name}</div>
                    <div className={noteClass}>{entry.transport === 'stdio' ? 'stdio' : 'HTTP'} · {t(entry.enabled ? 'settings.plugins.enabled' : 'settings.plugins.disabled')}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button type="button" className={buttonClass} disabled={busy} onClick={() => mutation.mutate({ action: 'toggleMcp', agent, name: entry.name, enabled: !entry.enabled })}>
                        {t(entry.enabled ? 'settings.plugins.disable' : 'settings.plugins.enable')}
                    </button>
                    {removing === entry.name ? <>
                        <button type="button" className={buttonClass} disabled={busy} onClick={() => mutation.mutate({ action: 'removeMcp', agent, name: entry.name })}>
                            {t('settings.plugins.confirmRemove')}
                        </button>
                        <button type="button" className={buttonClass} disabled={busy} onClick={() => setRemoving(null)}>{t('settings.plugins.cancel')}</button>
                    </> : <button type="button" className={buttonClass} disabled={busy} onClick={() => setRemoving(entry.name)}>{t('settings.plugins.remove')}</button>}
                </div>
            </div>)}
            <form onSubmit={addMcp} className="p-3">
                <fieldset disabled={busy} className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Field label={t('settings.plugins.name')}><input className={inputClass} required maxLength={48} placeholder="microsoft-todo" value={name} onChange={(event) => setName(event.target.value)} /></Field>
                        <Field label={t('settings.plugins.transport')}><select className={inputClass} value={transport} onChange={(event) => setTransport(event.target.value === 'stdio' ? 'stdio' : 'http')}>
                            <option value="http">{t('settings.plugins.http')}</option>
                            <option value="stdio">{t('settings.plugins.stdio')}</option>
                        </select></Field>
                    </div>
                    {transport === 'http' ? <Field label={t('settings.plugins.url')}><input className={inputClass} type="url" required maxLength={512} placeholder="http://127.0.0.1:3000/mcp" value={url} onChange={(event) => setUrl(event.target.value)} /></Field> : <>
                        <Field label={t('settings.plugins.command')}><input className={inputClass} required maxLength={512} value={command} onChange={(event) => setCommand(event.target.value)} /></Field>
                        <Field label={t('settings.plugins.args')}><textarea className={inputClass} rows={3} maxLength={24 * 513} value={args} onChange={(event) => setArgs(event.target.value)} /></Field>
                    </>}
                    <button className={buttonClass} type="submit">{t('settings.plugins.add')}</button>
                </fieldset>
            </form>
        </SettingsSection>
        <SettingsSection title="Skills" description={t('settings.plugins.skillDescription')}>
            {skills.length > 0 ? <ul className="flex flex-wrap gap-2 p-3" aria-label={t('settings.plugins.availableSkills')}>
                {skills.map((skill) => <li key={skill} className="max-w-full break-all rounded-md bg-[var(--app-subtle-bg)] px-2 py-1 text-xs">{skill}</li>)}
            </ul> : null}
            <form onSubmit={upload} className="p-3">
                <fieldset disabled={busy} className="space-y-3">
                    <div key={fileSelection} className="grid gap-3 sm:grid-cols-2">
                        <Field label={t('settings.plugins.skillFile')}><input className={inputClass} type="file" accept=".md" onChange={(event) => setFiles(Array.from(event.target.files ?? []))} /></Field>
                        <Field label={t('settings.plugins.skillFolder')}><input className={inputClass} type="file" {...{ webkitdirectory: '' }} multiple onChange={(event) => setFiles(Array.from(event.target.files ?? []))} /></Field>
                    </div>
                    {files.length > 0 ? <div className={noteClass}>{t('settings.plugins.filesSelected', { count: files.length })}</div> : null}
                    <button className={buttonClass} disabled={!files.length} type="submit">{t('settings.plugins.install')}</button>
                </fieldset>
            </form>
        </SettingsSection>
        <div aria-live="polite">
            {busy ? <p className={noteClass}>{t('loading')}</p> : null}
            {error ? <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
            {status ? <p className={noteClass}>{status}</p> : null}
        </div>
    </>
}

export default function SettingsPluginsPage() {
    const { t } = useTranslation()
    const { api } = useAppContext()
    const { machines, isLoading, error, refetch } = useMachines(api, true)
    const [machineId, setMachineId] = useState('')
    const [agent, setAgent] = useState<PluginAgent>('codex')
    const machine = machineId ? machines.find(({ id }) => id === machineId) : machines[0]
    const supportsPlugins = machine?.metadata?.capabilities?.includes(MACHINE_CAPABILITIES.PluginManagement)

    return <SettingsPageContent description={t('settings.plugins.description')}>
        {isLoading ? <p className={noteClass} role="status">{t('loading.machines')}</p> : null}
        {error ? <div className="space-y-2">
            <p role="alert" className={noteClass}>{t('settings.plugins.requestFailed')}</p>
            <button className={buttonClass} type="button" onClick={() => void refetch()}>{t('settings.plugins.retry')}</button>
        </div> : null}
        {machines.length === 0 && !isLoading && !error ? <p className={noteClass}>{t('settings.machines.empty')}</p> : null}
        {machines.length > 0 && api ? <>
            <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t('settings.plugins.device')}><select className={inputClass} value={machine?.id ?? ''} onChange={(event) => setMachineId(event.target.value)}>
                    {!machine ? <option value="" disabled>{t('settings.plugins.deviceOffline')}</option> : null}
                    {machines.map((option) => <option key={option.id} value={option.id}>{getMachineTitle(option)}</option>)}
                </select></Field>
                <Field label={t('settings.plugins.agent')}><select className={inputClass} value={agent} onChange={(event) => setAgent(event.target.value === 'claude' ? 'claude' : 'codex')}>
                    <option value="codex">Codex</option><option value="claude">Claude Code</option>
                </select></Field>
            </div>
            {machine ? (supportsPlugins
                ? <PluginSettings key={`${machine.id}:${agent}`} api={api} machineId={machine.id} agent={agent} />
                : <p className={noteClass}>{t('settings.plugins.upgrade')}</p>) : null}
        </> : null}
    </SettingsPageContent>
}
