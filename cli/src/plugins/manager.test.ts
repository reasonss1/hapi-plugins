import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { PluginRequestSchema, type PluginMcpEntry } from '@hapi/protocol'
import { PluginManager } from './manager'

const stdio: PluginMcpEntry = { name: 'sample', enabled: true, config: { transport: 'stdio', command: 'node', args: ['server.js'] } }
const manifest = '---\nname: sample-skill\ndescription: Example skill\n---\nUse the accompanying reference.\n'
const file = (path: string, text: string) => ({ path, data: Buffer.from(text).toString('base64') })

describe('Runner plugin manager', () => {
    let home: string
    let manager: PluginManager
    beforeEach(async () => {
        home = await mkdtemp(join(tmpdir(), 'hapi-plugin-test-'))
        vi.stubEnv('HOME', home)
        vi.stubEnv('CLAUDE_CONFIG_DIR', join(home, '.claude'))
        vi.stubEnv('CODEX_HOME', join(home, '.codex'))
        manager = new PluginManager(home, 'fixture:alice', true)
    })
    afterEach(async () => {
        vi.unstubAllEnvs()
        await rm(home, { recursive: true, force: true })
    })

    it('opts in explicitly and scopes persisted MCP entries to the credential and agent', async () => {
        const request = { action: 'addMcp', agent: 'codex', entry: stdio } as const
        const disabled = new PluginManager(home, 'fixture:alice', false)
        expect(await disabled.manage(request)).toEqual({ ok: false, error: 'disabled' })
        const saved = await manager.manage(request)
        expect(saved).toMatchObject({ ok: true, mcp: [{ name: 'sample', enabled: true, transport: 'stdio' }] })
        expect(JSON.stringify(saved)).not.toContain('server.js')
        const same = new PluginManager(home, 'fixture:alice', true)
        expect(await same.enabledMcp('codex')).toEqual([stdio])
        expect(await same.enabledMcp('claude')).toEqual([])
        expect(await disabled.enabledMcp('codex')).toEqual([])
        expect(await new PluginManager(home, 'fixture:bob', true).enabledMcp('codex')).toEqual([])
        expect(await same.manage(request)).toEqual({ ok: false, error: 'exists' })
        await same.manage({ action: 'toggleMcp', name: 'sample', agent: 'codex', enabled: false })
        expect(await manager.enabledMcp('codex')).toEqual([])
        await same.manage({ action: 'toggleMcp', name: 'sample', agent: 'codex', enabled: true })
        expect(await manager.enabledMcp('codex')).toEqual([stdio])
        expect(await same.manage({ action: 'removeMcp', name: 'sample', agent: 'codex' })).toMatchObject({ ok: true, mcp: [] })
    })

    it('keeps simultaneous settings changes', async () => {
        const results = await Promise.all(['first', 'second'].map((name) =>
            manager.manage({ action: 'addMcp', agent: 'codex', entry: { ...stdio, name } })))
        expect(results.every(({ ok }) => ok)).toBe(true)
        expect((await manager.enabledMcp('codex')).map(({ name }) => name).sort()).toEqual(['first', 'second'])
    })

    it('installs a complete Skill into the selected agent’s user directory and discovers it', async () => {
        const request = { action: 'installSkill', agent: 'claude', files: [file('SKILL.md', manifest), file('references/notes.md', 'reference')] } as const
        expect(await manager.manage({ ...request, files: [...request.files] })).toMatchObject({ ok: true, installed: 'sample-skill', skills: ['sample-skill'] })
        const destination = join(home, '.claude/skills/sample-skill')
        expect(await readFile(join(destination, 'references/notes.md'), 'utf8')).toBe('reference')
        expect(await manager.manage({ ...request, files: [file('SKILL.md', manifest + 'replacement')] })).toEqual({ ok: false, error: 'exists' })
        expect(await readFile(join(destination, 'SKILL.md'), 'utf8')).toBe(manifest)
        expect(await manager.manage({ ...request, agent: 'codex', files: [...request.files] })).toMatchObject({ ok: true, installed: 'sample-skill' })
        expect(await readFile(join(home, '.agents/skills/sample-skill/SKILL.md'), 'utf8')).toBe(manifest)
    })

    it('rejects escaping, ambiguous and invalid Skill uploads before writing', async () => {
        const root = join(home, '.agents/skills')
        for (const path of ['../escape', 'C:/outside', 'nested\\escape', 'AUX.txt', '.git/config', 'skill.md']) {
            expect(await manager.manage({ action: 'installSkill', agent: 'codex', files: [file('SKILL.md', manifest), file(path, 'bad')] })).toEqual({ ok: false, error: 'invalidSkill' })
        }
        const bad = await manager.manage({ action: 'installSkill', agent: 'codex', files: [file('SKILL.md', 'missing metadata')] })
        expect(bad).toEqual({ ok: false, error: 'invalidSkill' })
        await expect(readFile(join(root, 'sample-skill/SKILL.md'))).rejects.toMatchObject({ code: 'ENOENT' })
        await expect(readFile(join(root, '..', 'escape'))).rejects.toMatchObject({ code: 'ENOENT' })
    })

    it.skipIf(process.platform === 'win32')('does not overwrite a symlink into an external directory', async () => {
        const root = join(home, '.agents/skills')
        const external = join(home, 'external')
        await mkdir(root, { recursive: true })
        await mkdir(external)
        await symlink(external, join(root, 'sample-skill'))
        expect(await manager.manage({ action: 'installSkill', agent: 'codex', files: [file('SKILL.md', manifest)] })).toEqual({ ok: false, error: 'exists' })
        await expect(readFile(join(external, 'SKILL.md'))).rejects.toMatchObject({ code: 'ENOENT' })
    })

    it('accepts local HTTP and rejects URLs with embedded credentials', () => {
        const parse = (url: string) => PluginRequestSchema.safeParse({ action: 'addMcp', agent: 'codex', entry: { ...stdio, config: { transport: 'http', url } } }).success
        expect(parse('http://127.0.0.1:9000/mcp')).toBe(true)
        expect(parse('https://example.test/mcp')).toBe(true)
        expect(parse('http://example.test/mcp')).toBe(false)
        expect(parse('https://user:password@example.test/mcp')).toBe(false)
        expect(parse('https://example.test/mcp?secret=token')).toBe(false)
    })
})
