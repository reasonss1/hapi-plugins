import { z } from 'zod'

export const PluginAgentSchema = z.enum(['codex', 'claude'])
export type PluginAgent = z.infer<typeof PluginAgentSchema>

export const PluginNameSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(48)
const mcpText = z.string().max(512).regex(/^[^\x00-\x1f\x7f]*$/)
const endpoint = z.string().max(512).refine((url) => {
    try {
        const value = new URL(url)
        return !value.username && !value.password && !value.search && !value.hash
            && (value.protocol === 'https:' || (value.protocol === 'http:'
                && ['localhost', '127.0.0.1', '[::1]'].includes(value.hostname)))
    } catch {
        return false
    }
})

export const PluginMcpConfigSchema = z.discriminatedUnion('transport', [
    z.strictObject({ transport: z.literal('http'), url: endpoint }),
    z.strictObject({
        transport: z.literal('stdio'),
        command: mcpText.refine((command) => command.trim().length > 0),
        args: z.array(mcpText).max(24)
    })
])
export type PluginMcpConfig = z.infer<typeof PluginMcpConfigSchema>
export const PluginMcpEntrySchema = z.strictObject({
    name: PluginNameSchema,
    enabled: z.boolean(),
    config: PluginMcpConfigSchema
})
export type PluginMcpEntry = z.infer<typeof PluginMcpEntrySchema>
export const PLUGIN_MCP_LIMIT = 24
export const PLUGIN_SKILL_MAX_BYTES = 2 * 1024 * 1024
export const PLUGIN_SKILL_MAX_FILES = 100
export const PLUGIN_REQUEST_MAX_BYTES = 3 * 1024 * 1024

export const PluginRequestSchema = z.discriminatedUnion('action', [
    z.strictObject({ action: z.literal('list'), agent: PluginAgentSchema }),
    z.strictObject({ action: z.literal('addMcp'), agent: PluginAgentSchema, entry: PluginMcpEntrySchema }),
    z.strictObject({ action: z.literal('toggleMcp'), agent: PluginAgentSchema, name: PluginNameSchema, enabled: z.boolean() }),
    z.strictObject({ action: z.literal('removeMcp'), agent: PluginAgentSchema, name: PluginNameSchema }),
    z.strictObject({
        action: z.literal('installSkill'), agent: PluginAgentSchema,
        files: z.array(z.strictObject({
            path: z.string().min(1).max(240),
            data: z.string().max(Math.ceil(PLUGIN_SKILL_MAX_BYTES / 3) * 4).regex(/^[A-Za-z0-9+/]*={0,2}$/)
        })).min(1).max(PLUGIN_SKILL_MAX_FILES)
    })
])
export type PluginRequest = z.infer<typeof PluginRequestSchema>

// Summaries deliberately omit commands, arguments, URLs and Skill contents.
export const PluginResponseSchema = z.discriminatedUnion('ok', [
    z.object({ ok: z.literal(true), mcp: z.array(PluginMcpEntrySchema.pick({ name: true, enabled: true }).extend({
        transport: z.enum(['stdio', 'http'])
    })), skills: z.array(z.string()), installed: z.string().optional() }),
    z.object({ ok: z.literal(false), error: z.enum([
        'disabled', 'exists', 'notFound', 'limit', 'invalidSkill', 'failed'
    ]) })
])
export type PluginResponse = z.infer<typeof PluginResponseSchema>
