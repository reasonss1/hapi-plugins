# Plugins: MCP and Skills

Open **Settings → Plugins** to configure a connected Runner. The first version supports Codex and Claude Code. Pick the device and the agent type before making changes. Start a new agent session to use the updated configuration.

## Enable management on a trusted Runner

Start the Runner with `HAPI_ENABLE_PLUGIN_MANAGEMENT=1`. Only enable this on a Runner you administer, attached to a namespace whose users can be trusted to run code under the Runner's OS account: a local MCP command is executable software, and a Skill can tell the agent to run scripts. Keep separate OS accounts or containers for parties that must not share native agent configuration and Skills. If a supervisor manages your Runner, add the variable to its environment and restart it through that supervisor.

```sh
HAPI_ENABLE_PLUGIN_MANAGEMENT=1 hapi runner start
```

For PowerShell:

```powershell
$env:HAPI_ENABLE_PLUGIN_MANAGEMENT = '1'
hapi runner start
```

This mode applies to sessions started with the same Runner environment. If you start a session from a separate terminal, it must inherit the same opt-in and use the same HAPI home and access credential. Changing the Hub access credential makes the previous MCP registry unavailable to the new credential. To turn off management, restart the Runner without the variable; previously uploaded native Skills remain installed.

## Connect an MCP service

- **HTTP endpoint**: enter the Streamable HTTP URL, for example `https://mcp.example.com/mcp`. Use HTTPS for a remote service. Local development supports e.g. `http://127.0.0.1:3000/mcp`; loopback refers to the selected Runner. Set up accounts according to the service and agent's authentication flow. HAPI's form does not collect credentials or custom headers; if the server needs these features, use the agent's own MCP configuration or an authorized connector on the Runner. URLs with embedded credentials or query parameters are rejected.
- **Local command (stdio)**: enter the executable on the selected Runner and provide each argument on a separate line. The command starts under the agent when the session loads tools. Paste only the executable in the program field; the arguments field supplies its argument list. On Windows, use a native executable such as `node.exe` with the package's entry point if a package-manager shim is unavailable to the agent.

Once added, a server is enabled for new sessions. The list shows saved configuration, rather than claiming the server is connected. Ask an agent in a new session to list or call a read-only tool to test it. Disable or remove the entry to omit it from future sessions; close running sessions if access needs to stop immediately. HAPI-managed tool server names begin with `hapi-plugin-`. Other servers configured directly in the agent remain in the agent's native settings.

### Microsoft To Do and multiple topics

Microsoft To Do can be connected through an existing MCP service, such as [jordanburke/microsoft-todo-mcp-server](https://github.com/jordanburke/microsoft-todo-mcp-server). The service operator sets up the server and its Microsoft authentication. Before adding the endpoint to HAPI, verify that your client supports the server's authentication and that each user is authorized for the intended To Do account.

The same HTTP service can be connected on several Runner/agent pairs. Each new session, including a topic using that Runner and agent type, receives the configured tools. Separate HAPI topics don't automatically map to separate Microsoft accounts or task lists. A topic that must not get the tools should use a separate Runner/agent configuration without the connection. Native client configuration can also supply tools independently of this page.

If multiple agents use the same To Do account, they can work from the same list. For a first trial, have one dispatcher assign tasks and handle writes, and have other agents read and report back. Server-side read-only credentials or tool restrictions are needed if you want to enforce that division. MCP tool access alone does not implement ownership, prevent duplicate claims, or record human acceptance.

## Install a Skill

Upload a `SKILL.md` file, or select a folder with `SKILL.md` at its root to keep companion files. The manifest must contain a `name` and a `description`. The installer preserves folders and file contents, refuses to overwrite an existing skill directory, and accepts up to 100 files totaling 2 MiB. Read the Skill and its scripts before installing it. Browser uploads do not retain executable permission bits; invoke companion scripts through their interpreter where needed.

For Codex the destination is the user's `.agents/skills` directory; for Claude Code it's the `skills` directory under its user configuration (`CLAUDE_CONFIG_DIR`, default `~/.claude`). These are native, device user settings, so a Skill can also be discovered by sessions of that user outside HAPI. The page lists user-visible skills; project-specific skills depend on the session directory. To remove a Skill, remove its installed directory on the device.
