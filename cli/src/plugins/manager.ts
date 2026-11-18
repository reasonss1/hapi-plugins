import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join, resolve, dirname } from 'node:path'
import { z } from 'zod'
import { parse as parseYaml } from 'yaml'
import { withSettingsFileLock } from '@hapi/protocol/settingsFileLock'
import {
    PLUGIN_MCP_LIMIT, PLUGIN_SKILL_MAX_BYTES, PluginMcpEntrySchema, PluginNameSchema,
    type PluginAgent, type PluginMcpEntry, type PluginRequest, type PluginResponse
} from '@hapi/protocol'
import { listSkills, MAX_SKILL_FILE_BYTES, getUserSkillsRoots } from '@/modules/common/skills'

const entries = z.array(PluginMcpEntrySchema).max(PLUGIN_MCP_LIMIT)
const registrySchema = z.strictObject({ codex: entries, claude: entries })
type Registry = z.infer<typeof registrySchema>
type Failure = Extract<PluginResponse, { ok: false }>['error']

class PluginError extends Error {
    constructor(readonly code: Failure) { super(code) }
}

function isMissing(error: unknown): boolean {
    return (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT'
}

export function pluginsEnabled(): boolean {
    return process.env.HAPI_ENABLE_PLUGIN_MANAGEMENT === '1'
}

function pathKey(path: string): string {
    return path.normalize('NFC').toLowerCase()
}

const windowsDeviceName = /^(?:con|prn|aux|nul|conin\$|conout\$|com[0-9¹²³]|lpt[0-9¹²³])(?:\.|$)/i

function skillFiles(files: Extract<PluginRequest, { action: 'installSkill' }>['files']) {
    const keys = new Set<string>()
    const folders = new Set<string>()
    let total = 0
    const decoded = files.map(({ path, data }) => {
        const segments = path.split('/')
        for (const segment of segments) {
            if (!segment || /^\.{1,2}$/.test(segment) || /[<>:"\\|?*\x00-\x1f\x7f]/.test(segment)
                || /[. ]$/.test(segment) || windowsDeviceName.test(segment)
                || pathKey(segment) === '.git') throw new PluginError('invalidSkill')
        }
        if (keys.has(pathKey(path))) throw new PluginError('invalidSkill')
        keys.add(pathKey(path))
        for (let length = 1; length < segments.length; length += 1) {
            folders.add(pathKey(segments.slice(0, length).join('/')))
        }
        const content = Buffer.from(data, 'base64')
        if (content.toString('base64') !== data) throw new PluginError('invalidSkill')
        total += content.length
        if (total > PLUGIN_SKILL_MAX_BYTES) throw new PluginError('limit')
        return { segments, content }
    })
    if ([...folders].some((folder) => keys.has(folder))) throw new PluginError('invalidSkill')
    const manifest = decoded.find(({ segments }) => segments.length === 1 && segments[0] === 'SKILL.md')
    if (!manifest || manifest.content.length > MAX_SKILL_FILE_BYTES) throw new PluginError('invalidSkill')
    let parsed: unknown
    try {
        const text = new TextDecoder('utf-8', { fatal: true }).decode(manifest.content)
        const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)
        parsed = match ? parseYaml(match[1], { maxAliasCount: 0 }) : null
    } catch {
        throw new PluginError('invalidSkill')
    }
    const metadata = z.object({ name: PluginNameSchema, description: z.string().trim().min(1).max(1024) }).safeParse(parsed)
    if (!metadata.success || windowsDeviceName.test(metadata.data.name)) throw new PluginError('invalidSkill')
    return { name: metadata.data.name, decoded }
}

async function installSkill(root: string, files: Extract<PluginRequest, { action: 'installSkill' }>['files']): Promise<string> {
    const { name, decoded } = skillFiles(files)
    await mkdir(root, { recursive: true, mode: 0o700 })
    const destination = join(root, name)
    await withSettingsFileLock(destination, async () => {
        const absent = await lstat(destination).then(() => false, (error) => {
            if (isMissing(error)) return true
            throw error
        })
        if (!absent) throw new PluginError('exists')
        const staging = await mkdtemp(join(root, '.hapi-install-'))
        try {
            for (const { segments, content } of decoded) {
                const path = join(staging, ...segments)
                await mkdir(dirname(path), { recursive: true, mode: 0o700 })
                await writeFile(path, content, { flag: 'wx', mode: 0o600 })
            }
            await rename(staging, destination)
        } finally {
            await rm(staging, { recursive: true, force: true })
        }
    })
    return name
}

export class PluginManager {
    private readonly path: string

    constructor(
        home: string,
        token: string,
        private readonly enabled = pluginsEnabled(),
        private readonly skillRoot = (agent: PluginAgent) => resolve(getUserSkillsRoots(agent)[agent === 'codex' ? 0 : 1])
    ) {
        // HAPI_HOME separates runner installations. A full credential digest also
        // separates different hub credentials/namespaces in the same HAPI_HOME.
        const scope = createHash('sha256').update(token).digest('hex')
        this.path = join(home, 'plugins', `${scope}.json`)
    }

    private async read(): Promise<Registry> {
        try {
            return registrySchema.parse(JSON.parse(await readFile(this.path, 'utf8')))
        } catch (error) {
            if (isMissing(error)) return { codex: [], claude: [] }
            throw error
        }
    }

    async enabledMcp(agent: PluginAgent): Promise<PluginMcpEntry[]> {
        return this.enabled ? (await this.read())[agent].filter(({ enabled }) => enabled) : []
    }

    async manage(request: PluginRequest): Promise<PluginResponse> {
        if (!this.enabled) return { ok: false, error: 'disabled' }
        try {
            const { agent } = request
            let installed: string | undefined
            if (request.action === 'installSkill') {
                installed = await installSkill(this.skillRoot(agent), request.files)
            } else if (request.action !== 'list') {
                await mkdir(dirname(this.path), { recursive: true, mode: 0o700 })
                await withSettingsFileLock(this.path, async () => {
                    const all = await this.read()
                    const group = all[agent]
                    const index = group.findIndex(({ name }) => name === (request.action === 'addMcp' ? request.entry.name : request.name))
                    if (request.action === 'addMcp') {
                        if (index !== -1) throw new PluginError('exists')
                        if (group.length >= PLUGIN_MCP_LIMIT) throw new PluginError('limit')
                        group.push(request.entry)
                    } else if (index === -1) {
                        throw new PluginError('notFound')
                    } else if (request.action === 'toggleMcp') {
                        group[index].enabled = request.enabled
                    } else {
                        group.splice(index, 1)
                    }
                    const temporary = `${this.path}.${randomUUID()}.tmp`
                    try {
                        await writeFile(temporary, JSON.stringify(all), { flag: 'wx', mode: 0o600 })
                        await rename(temporary, this.path)
                    } finally {
                        await rm(temporary, { force: true })
                    }
                })
            }
            const [registry, skills] = await Promise.all([this.read(), listSkills(undefined, { flavor: agent })])
            return {
                ok: true,
                mcp: registry[agent].map(({ name, enabled, config }) => ({ name, enabled, transport: config.transport })),
                skills: skills.map(({ name }) => name),
                ...(installed ? { installed } : {})
            }
        } catch (error) {
            // Do not put raw file paths, arguments, or parse errors into the Hub or logs.
            return { ok: false, error: error instanceof PluginError ? error.code : 'failed' }
        }
    }
}
