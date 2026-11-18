import { RPC_METHODS } from '@hapi/protocol/rpcMethods'
import { z } from 'zod'
import type { RpcRegistry } from '../../rpcRegistry'
import type { CliSocketWithData } from '../../socketTypes'

const rpcRegisterSchema = z.object({
    method: z.string().min(1)
})

const rpcUnregisterSchema = z.object({
    method: z.string().min(1)
})

export function registerRpcHandlers(
    socket: CliSocketWithData,
    rpcRegistry: RpcRegistry,
    authorizedMachineId: string | null
): void {
    socket.on('rpc-register', (data: unknown) => {
        const parsed = rpcRegisterSchema.safeParse(data)
        if (!parsed.success) {
            return
        }
        // Only the authenticated target machine may receive uploaded Skills and
        // MCP configuration. A socket in another namespace cannot claim the RPC.
        const suffix = `:${RPC_METHODS.ManagePlugins}`
        if (parsed.data.method.endsWith(suffix)
            && (!authorizedMachineId || parsed.data.method !== `${authorizedMachineId}${suffix}`)) return
        rpcRegistry.register(socket, parsed.data.method)
    })

    socket.on('rpc-unregister', (data: unknown) => {
        const parsed = rpcUnregisterSchema.safeParse(data)
        if (!parsed.success) {
            return
        }
        rpcRegistry.unregister(socket, parsed.data.method)
    })
}
