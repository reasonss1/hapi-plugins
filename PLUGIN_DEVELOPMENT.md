# 插件开发交接

## 仓库与当前状态

- 协作仓库：[reasonss1/hapi-plugins](https://github.com/reasonss1/hapi-plugins)。
- 功能集成分支及当前默认分支：`feat/plugins-todo`。
- 上游：[tiann/hapi](https://github.com/tiann/hapi)。源码基于 v0.36.0 发布提交 `8ff6bd12fae6da205cb50edb9710470c0c0429e6`，保留来源历史和原有许可证。
- 首版方向：设置中的通用 MCP 接入和 Skill 安装，支持 Codex 和 Claude Code，见[用户指引](docs/guide/plugins.md)。微软 To Do 可使用第三方服务；HaPi 不在首版实现微软授权、任务同步或任务验收。
- 现有线上部署和其他本地修复不属于这个功能分支。向上游提案、发布或部署单独安排。

## 开始开发

仓库公开，任何人均可克隆源码：

```sh
git clone --branch feat/plugins-todo https://github.com/reasonss1/hapi-plugins.git
cd hapi-plugins
git switch -c feat/your-task
```

先阅读 [AGENTS.md](AGENTS.md) 和 [首版设计](docs/design/plugins-todo.md)。`AGENTS.md` 中的验证、命名空间隔离、会话与进程约束继续适用。

每位 Agent 使用自己的 clone 或 worktree 和任务分支。提交 PR 时以本仓库的 `feat/plugins-todo` 为目标分支。不要在同一个工作目录同时写代码；涉及 shared 协议、数据库迁移或通用插件接口时，先在当前任务中同步约定。

直接推送需要仓库写权限；其他贡献者可先 fork，再从自己的仓库提交 PR。

其他机器克隆后，`origin` 指向协作仓库；需要跟踪上游时可以另外执行：

```sh
git remote add upstream https://github.com/tiann/hapi.git
```

## 后续可选的 To Do 工作流

1. 可视化插件管理：每个插件有独立条目、状态和配置入口，首个优先插件是 Microsoft To Do。
2. To Do 工作台的布局和交互尽量接近微软 To Do；每个任务右侧增加 Agent 图标，可查看领取、阶段和成果。
3. 拆解内容先供用户审阅，获批后写入 To Do。Agent 提交成果，最终完成由人工验收。
4. 任务、执行状态和必要上下文可跨 Agent、会话和执行设备交接；工作区文件另行交接。
5. 插件支持 MCP 和其他 API，能力范围按 Agent 的实际接入能力声明；先做可验证的首版。

## 后续工作流的建议拆分

| 范围 | 主要接入点 | 依赖 |
| --- | --- | --- |
| 最小插件注册与配置 | `shared/`、`hub/src/` | 先约定插件 ID、状态、权限和配置结构 |
| 插件管理与 To Do 页面 | `web/src/routes/`、设置导航、`web/src/router.tsx` | 可先做明确标注的页面原型，再接真实 API |
| Microsoft OAuth 与 Graph 连接器 | Hub 内独立模块 | 账号配置由操作者提供，凭据不进入 Git |
| 持久任务、领取与人工验收 | Hub store/API、shared 协议 | 接口与状态流程需先约定 |
| Agent 工具与设备接力 | `cli/src/` 中对应 Agent 的桥接 | 依赖任务 API；先验证两种 Agent、两台 Runner |

这些是建议拆分，尚未分配负责人。改动共享文件前确认其他 Agent 正在处理的范围。

## 安装、验证和已知前置项

项目要求 Bun 1.4.4；按仓库 README 和 `AGENTS.md` 安装与运行。常用检查：

```sh
bun install --frozen-lockfile
bun run typecheck:hub
bun run typecheck:web
bun run test:hub
bun run test:web
```

根据实际改动范围选择检查；跨包变更遵循 `AGENTS.md` 的完整验证要求。

本机另有 `8735877`（passkey reflect-metadata 修复），尚未合入这个功能分支。启动时若遇到对应问题，先单独核实是否需要前置修复，不把已有修补混成插件功能。

后续 To Do 工作流的验收目标：电脑 A 的 Agent 处理部分任务，电脑 B 上另一种 Agent 经显式交接后继续，用户在手机查看成果并验收，HAPI 与 To Do 最终一致。
