import { expect, it } from 'bun:test'
import { RPC_METHODS } from '@hapi/protocol/rpcMethods'
import { RpcRegistry } from '../../rpcRegistry'
import type { CliSocketWithData } from '../../socketTypes'
import { registerRpcHandlers } from './rpcHandlers'

it('only lets the authenticated runner register for its plugin operations', () => {
    const registry = new RpcRegistry()
    const connect = (id: string, machine: string | null) => {
        const events = new Map<string, (data: unknown) => void>()
        const socket = { id, on: (event: string, callback: (data: unknown) => void) => events.set(event, callback) }
        registerRpcHandlers(socket as unknown as CliSocketWithData, registry, machine)
        return (method: string) => events.get('rpc-register')!({ method })
    }
    const method = `selected:${RPC_METHODS.ManagePlugins}`
    connect('runner-socket', 'selected')(method)
    connect('other-machine-socket', 'other')(method)
    connect('session-socket', null)(method)
    expect(registry.getSocketIdForMethod(method)).toBe('runner-socket')
})
