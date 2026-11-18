import { MACHINE_CAPABILITIES, PluginRequestSchema, PLUGIN_REQUEST_MAX_BYTES } from '@hapi/protocol'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { RpcTargetMissingError } from '../../sync/rpcGateway'
import type { SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'
import { requireMachine, requireSyncEngine } from './guards'

export function createPluginRoutes(getSyncEngine: () => SyncEngine | null): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()
    app.post('/machines/:id/plugins', bodyLimit({
        maxSize: PLUGIN_REQUEST_MAX_BYTES,
        onError: (c) => c.json({ error: 'Request body too large' }, 413)
    }), async (c) => {
        c.header('Cache-Control', 'no-store')
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) return engine
        const machine = requireMachine(c, engine, c.req.param('id'))
        if (machine instanceof Response) return machine
        if (!machine.active) return c.json({ error: 'Runner is offline' }, 503)
        if (!machine.metadata?.capabilities?.includes(MACHINE_CAPABILITIES.PluginManagement)) {
            return c.json({ error: 'This runner does not support plugin management' }, 409)
        }
        const parsed = PluginRequestSchema.safeParse(await c.req.json().catch(() => null))
        if (!parsed.success) return c.json({ error: 'Invalid plugin request' }, 400)
        try {
            return c.json(await engine.managePlugins(machine.id, parsed.data))
        } catch (error) {
            return error instanceof RpcTargetMissingError
                ? c.json({ error: 'Runner is unavailable' }, 503)
                : c.json({ error: 'Plugin operation failed' }, 500)
        }
    })
    return app
}
