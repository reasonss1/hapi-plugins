import { describe, expect, it, mock } from 'bun:test'
import { Hono } from 'hono'
import { MACHINE_CAPABILITIES, type PluginResponse } from '@hapi/protocol'
import type { SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'
import { createPluginRoutes } from './plugins'

const response: PluginResponse = { ok: true, mcp: [], skills: [] }
const request = { action: 'list', agent: 'codex' }

function fixture(options: { namespace?: string; enabled?: boolean; active?: boolean } = {}) {
    const managePlugins = mock(async () => response)
    const engine = {
        managePlugins,
        getMachine: () => ({
            id: 'desktop', namespace: 'owner', active: options.active !== false,
            metadata: { capabilities: options.enabled === false ? [] : [MACHINE_CAPABILITIES.PluginManagement] }
        })
    } as unknown as SyncEngine
    const app = new Hono<WebAppEnv>()
    app.use('*', async (c, next) => {
        c.set('namespace', options.namespace ?? 'owner')
        await next()
    })
    app.route('/api', createPluginRoutes(() => engine))
    const post = (body: unknown) => app.request('/api/machines/desktop/plugins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    })
    return { managePlugins, post }
}

describe('plugin management API', () => {
    it('forwards only validated operations to the selected machine', async () => {
        const { managePlugins, post } = fixture()
        const result = await post(request)
        expect(result.status).toBe(200)
        expect(result.headers.get('Cache-Control')).toBe('no-store')
        expect(await result.json()).toEqual(response)
        expect(managePlugins).toHaveBeenCalledWith('desktop', request)
        expect((await post({ ...request, command: 'other' })).status).toBe(400)
        expect(managePlugins).toHaveBeenCalledTimes(1)
    })

    it('rejects foreign, outdated and offline machines before forwarding', async () => {
        for (const [options, code] of [[{ namespace: 'other' }, 403], [{ enabled: false }, 409], [{ active: false }, 503]] as const) {
            const { managePlugins, post } = fixture(options)
            expect((await post(request)).status).toBe(code)
            expect(managePlugins).not.toHaveBeenCalled()
        }
    })
})
