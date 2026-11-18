# HAPI 插件管理与 Microsoft To Do 首版草案

状态：后续可选的 To Do 工作流设计。当前首版以 [MCP 接入和 Skill 安装](../guide/plugins.md) 为范围，Microsoft To Do 通过现成 MCP 服务接入。本文中的待办工作台、领取、接力和人工验收未实现。

## 分支与维护方式

- 功能分支：`feat/plugins-todo`。
- 源码协作仓库：[`reasonss1/hapi-plugins`](https://github.com/reasonss1/hapi-plugins)，开发入口见[交接说明](../../PLUGIN_DEVELOPMENT.md)。
- 起点：上游 v0.36.0 发布提交 `8ff6bd12fae6da205cb50edb9710470c0c0429e6`，来自本机已有 Git 历史；创建分支时未核对远端最新 main。
- 使用独立 Git worktree，保留现有部署源码及其他分支。设备管理、翻译确认按钮等已有本地改动不属于本功能。
- 源码提交到独立 GitHub 仓库供其他 Agent 协作。后续可分别提交通用插件入口和 To Do 集成供上游评估；若上游不接收，在独立分支持续维护。向上游创建 issue、提 PR 或部署另行确定。
- 后续启动验证前，单独评估本机已有的 `8735877`（passkey reflect-metadata 修复）是否需要作为前置修复；不将其包装成插件功能。

## 已明确的产品需求

1. HAPI 中台提供可视化插件管理；新增插件后，管理列表出现对应条目，用户能找到并使用其能力。
2. 插件接入方式可包括 MCP 和其他 API，能力可供不同 Agent 调用。首个优先插件是 Microsoft To Do。
3. To Do 工作台的布局和交互尽量贴近微软 To Do，包含任务列表、任务行和任务详情。
4. 每个任务右侧新增 Agent 小图标，能看出任务是否已被领取，以及执行进度和提交结果。图标不只依赖颜色表达状态。
5. Agent 可读取待办、拆解用户需求；在用户批准具体拆解内容后，才写入 To Do。
6. Agent 可报告执行进度、提交成果；最终任务完成由人工确认。
7. 任务和必要上下文可在不同 Agent、会话和执行设备之间交接。

## 建议的页面组织

这些路径是设计建议，实施时结合实际导航评审。

### 插件管理：`/settings/plugins`

沿用现有设置页的桌面侧栏与移动端列表布局。每个插件展示名称、用途、启用状态、连接状态和配置入口。首版仅注册 Microsoft To Do，之后的连接器复用同一个列表和详情框架。

To Do 的配置项包括连接账号、断开账号、选择可访问列表、允许的读写与执行能力。缺少应用配置或未授权时明确显示待配置/未连接。

启用且提供界面的插件，在中台的插件工作区入口出现对应项；To Do 打开任务工作台。只提供工具的 MCP 插件可以没有独立工作台，不要求每个插件强行增加一个页面。

### To Do 工作台：`/plugins/microsoft-todo`

- 桌面：列表导航、任务列表、任务详情；移动端将导航和详情收起到独立面板。
- 任务行保留熟悉的标题、完成勾选、重要性等操作；右侧增加 Agent 图标与必要的状态标记。
- 点击 Agent 图标查看当前负责人、关联会话、最近阶段、阻塞、产物和验收操作。查看详情不自动触发领取或执行。
- Agent 状态建议包含未领取、已领取、执行中、阻塞、待验收、已完成。界面区分执行完成与人工验收完成。
- 人工可确认完成或退回继续处理。用户主动将普通待办标记完成时，保留 To Do 原本的操作体验；对 Agent 提交的成果，展示足够信息让用户决定是否接受。

## 任务、执行和外部同步

### 持久任务与共享上下文

HAPI 使用稳定的内部 task ID，关联微软账号、外部 list/task ID、多个 session、执行轮次与负责人。任务不依赖某个会话存活。

最小上下文包含目标、约束、获批的拆解、验收条件、已完成步骤、关键决策、产物引用、阻塞和下一步；标明来源及更新时间。交接时按任务读取，必要时回溯源会话，不默认复制所有聊天。

代码和文件通过可访问的提交、PR 或附件交接；会话同步不能替代工作区同步。不迁移模型内部状态。设计实施时复用现有 Work Graph 的协作事件和产物引用，明确它与业务任务状态的关系；`session_jobs` 仍只表示真实后台进程。

### 批准与验收

建议流程：`draft → approved → running → awaiting_review → completed`，另有阻塞、取消和退回路径。

- 批准绑定具体拆解内容及版本；内容发生实质变化时不得沿用旧批准创建新任务。
- 一个任务有一个当前执行负责人，允许为可并行子任务分别指派 Agent。领取需要原子处理和版本检查。
- Agent 可读任务、报告阶段、提交结果和请求验收；Agent 领取执行的任务，最终完成以 HAPI 的人工验收记录为准。
- 外部完成信号先记录为同步变化或待确认，不能仅凭 Graph 状态变化推断操作者一定是人。是否允许 To Do 勾选直接作为人工验收入口，待产品决定。
- 连接器持有微软凭据，Agent 不持有原始 token 或可绕过验收规则的不受限 Graph 更新通道。
- 进度使用阶段和证据；只有存在可核实的工作量时才展示百分比。

### Microsoft To Do 的映射

- 首版建议采用用户 OAuth 授权，读取用 `Tasks.Read`，需要写入时使用 `Tasks.ReadWrite`。
- 独立可执行工作拆为独立任务；简单步骤可用 checklist。HAPI 保存依赖、执行归属和验收条件。
- To Do 显示最新进度摘要、待验收提示和 HAPI 详情链接。完整执行日志保存在 HAPI。更新时保留用户自己的任务正文。
- To Do 没有原生评论流或 `awaiting_review` 状态；不要把所需界面建立在不存在的接口之上。
- 使用外部绑定映射及 `linkedResource` 关联 HAPI 任务。微软 task ID 默认可能在跨列表移动后变化，不作为内部主键。
- HAPI 内部事件即时刷新界面；外部使用变更通知和 delta 增量对账，显示同步中、成功或失败。通知存在分钟级延迟，不能作为实时执行反馈通道。
- 同一任务写入串行处理；创建操作使用幂等记录避免重试重复创建。保留人工修改，冲突时展示差异；外部删除、移动或完成不能静默丢弃 HAPI 执行记录。

## 最小插件边界

插件至少声明稳定 ID、名称、版本、用途、配置与连接状态、工具能力、运行位置和可选界面入口。

第一版采用内置连接器或独立服务，预留 MCP adapter 接口。云服务连接器可集中运行，本机文件、浏览器和开发工具留在指定 Runner。调用携带经过验证的用户、命名空间、任务和 session 身份，在执行端检查权限。

各 Agent 的 MCP 注入能力不同。首版只声明经过验证的支持范围，优先验证两种 Agent、两台 Runner；未支持项明确显示限制。启停、撤销授权和任务读取都必须遵守命名空间隔离。

## 实施顺序与验收建议

1. 确定插件管理与 To Do 工作台的界面草图，落实任务右侧 Agent 图标的状态和点击行为。
2. 实现最小插件注册、配置和管理入口；用真实状态区分未配置、未连接、已连接、已停用。
3. 接入微软账号与指定列表，实现读取、拆解预览和批准后创建。
4. 实现 Agent 领取、阶段回报、结果提交和人工验收，随后同步外部完成状态。
5. 验证不同 Agent 和设备接力，再以第二个连接器检验插件接口可复用性。

首版完成标准：电脑 A 的 Agent 领取任务并执行一部分，电脑 B 上另一种 Agent 能在显式交接后继续，用户在手机查看成果、确认或退回，HAPI 与 To Do 最终一致。

还需验证：重复领取只有一个成功；重试不重复创建；未经批准不能写入拆解；Agent 无法自行绕过人工验收；人工编辑不被覆盖；网络断开和授权撤销显示真实状态；跨命名空间访问被拒绝。

首版暂不扩展任意代码安装器、公共插件市场分发、复杂自动调度或全部 Agent 兼容。自动领取还是人工指派、是否接受 To Do 勾选作为验收入口、多账号支持，以及原生客户端接入顺序，保留为产品决定。

## 源码接入点与依据

- 设置导航：[categories.ts](../../web/src/routes/settings/categories.ts)、[SettingsNav.tsx](../../web/src/components/settings/SettingsNav.tsx)、[router.tsx](../../web/src/router.tsx)。
- 现有协作模型：[Work Graph](../../shared/src/workGraph.ts)；现有能力见 [Agent 文档](../guide/agents.md) 和 [会话进程进度](../guide/session-jobs.md)。
- [Microsoft To Do 任务模型](https://learn.microsoft.com/en-us/graph/api/resources/todotask?view=graph-rest-1.0)。
- [更新任务及权限](https://learn.microsoft.com/en-us/graph/api/todotask-update?view=graph-rest-1.0)。
- [关联外部任务入口](https://learn.microsoft.com/en-us/graph/api/resources/linkedresource?view=graph-rest-1.0)。
- [增量同步](https://learn.microsoft.com/en-us/graph/api/todotask-delta?view=graph-rest-1.0) 与 [变更通知及延迟](https://learn.microsoft.com/en-us/graph/change-notifications-overview)。
