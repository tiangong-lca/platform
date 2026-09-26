---
title: TianGong Next 新增或补齐单一产品语言——最终交付 Goal
docType: goal
scope: repo
status: template
authoritative: false
owner: next
targetRepo: tiangong-lca/platform
project: https://github.com/users/tiangong-lca/projects/1
language: zh-CN
version: 3.7
translationGovernance: autonomous-context-grounded
referenceDataLocalization: official-first-version-locked
languageExtensibilityContract: registry-manifest-derived-no-business-hardcoding
issueSplitContract: platform-reference-resources-page-e2e
humanCheckpoint: final-online-release-only
selectorContract: umi-native-flag-and-native-label
whenToUse:
  - when adding one canonical product language to TianGong Next
  - when backfilling missing capabilities for any already-active product language
  - when resuming an existing language-delivery Goal from a verified checkpoint
whenToUpdate:
  - when locale registry, selector, runtime activation, validation, release, or workspace handoff rules change
  - when route/static views, query-driven views, their access context, or user-visible copy ownership changes
  - when content-language, classification, location, reference-resource, provenance, or fallback rules change
  - when the production-effective action or allowed human checkpoint changes
checkPaths:
  - docs/agents/i18n-language-delivery-goal.md
  - config/routes.ts
  - src/services/general/localeRegistry.ts
  - src/services/general/contentLanguageRegistry.ts
  - src/services/general/localeCapabilities.ts
  - src/services/general/data.ts
  - src/services/general/util.ts
  - src/components/LangTextItem/**
  - src/services/classifications/**
  - src/services/locations/**
  - src/services/referenceResources/**
  - src/components/ClassificationCacheMonitor/**
  - src/components/LocationCacheMonitor/**
  - src/components/RightContent/index.tsx
  - src/pages/Welcome.tsx
  - src/pages/User/Login/Components/LoginTopActions.tsx
  - src/locales/*/pages_home.ts
  - src/services/general/runtimeLocale.ts
  - public/classifications/**
  - public/locations/**
  - scripts/i18n/**
  - scripts/typescript-native-parser.*
  - docs/plans/i18n/fallback-contract.json
  - docs/plans/i18n/route-view-coverage.json
  - docs/plans/i18n/semantic-e2e-evidence.schema.json
  - playwright.config.ts
  - config/docs-capture/**
  - tests/e2e/i18n/**
  - .github/workflows/i18n-semantic-e2e.yml
  - .github/workflows/build.yml
  - package.json
lastReviewedAt: 2026-09-26
lastReviewedCommit: cfa0cf890f6e8f15c7088200e889f15f1eee3732
lastReviewedNote: 'Reviewed Platform #1109 follow-up: shared review views remove one duplicate ProTable and locale-materialized implementation surface; generated locale artifacts were refreshed idempotently, while language, validation, gate, and testing policy remain unchanged.'
baselineObservedAt: 2026-07-18
related:
  - ../../AGENTS.md
  - ../../.docpact/config.yaml
  - ./repo-validation.md
  - ./public-classifications-gz-usage.md
  - ../plans/i18n-de-DE/README.md
---

# TianGong Next 新增或补齐单一产品语言——最终交付 Goal

## 0. Goal 指令

本 Goal 用于把一种新语言完整交付到 TianGong Next，或补齐任一已激活语言尚未交付的能力：从 locale 契约、内容语言读写、上下文建模、全量界面翻译、分类/地点参考数据、路由/静态视图及其全部 URL 状态、已有语言质量修订、运行时接入、测试、`dev` 集成，一直推进到 `main`、生产发布和根 workspace 精确指针集成。

本文件是可复用模板，不是已经实例化的某一种语言任务。调用时必须提供目标语言英文名、中文名、原生菜单名和 canonical locale；与 canonical locale 对应的 Umi 原生国旗及其最终菜单呈现由执行者在只读 C0 预检中从当前框架 locale metadata 核验。其余可从仓库、框架和 workflow 唯一推导的字段也由执行者填写。仍有输入占位时不得开始写操作。

本版本采用以下执行原则：

1. 新语言翻译在任何阶段都不需要人工审核、批准、签字或确认。
2. 翻译质量由完整上下文、结构审计、术语证据、真实调用点、跨语言对照和自动化验证保证。
3. 除最终线上版本发布前的唯一一次确认外，其余正常环节全部自主推进，不设置中间人工确认点。
4. 在上下文分析中发现已有中文、德语或其他现有语言存在可明确判定的错误、遗漏、过时表达或术语不一致时，可直接修订，不需要额外人工确认。
5. 只有最终候选即将执行真正使 production URL 生效的动作时，才向用户请求一次发布确认。按当前 workflow，该动作是合并 `dev -> main` promote PR；该确认不是翻译审核。
6. 分类、地点和其他受管参考数据必须优先采用同版本、同代码体系的官方译本；没有官方译本时必须完成项目翻译和自动证据审校，不能以 English fallback、旧版官方标签或 `-` 作为交付结果。
7. 每次新增或补齐语言都必须对 registry 中全部现有语言运行同一能力审计；不得只验证目标语言，也不得把 UI catalog parity 当作内容语言、参考数据或页面覆盖已经完成。
8. 后续新增语言只在 typed registries、capability join 和 reference-resource overlay 中注册；业务页面、下拉框、详情标签、测试循环和证据不得散落硬编码语言数组，新增 registry locale 必须自动扩展审计并使旧的浏览器证据失效。

将本文件用于 Goal 模式时采用以下指令：

> 以本文件为完整执行目标。对所有翻译和既有译文修订进行自主、上下文完备的判断；把 UI catalog、内容语言读写、分类/地点参考数据、route/static view、query/hash/path 驱动的每个可见状态和组件内文案一并纳入翻译范围，并对 registry 中全部现有语言执行相同能力审计，但不得借 i18n 工作新增匿名路由、放宽认证守卫或改变登录重定向；不得创建或等待任何人工翻译审阅。持续推进到真正 production-effective action 之前的唯一最终发布确认点。确认后自主执行该动作及剩余的发布监控、生产 smoke、根 workspace 集成和清理。复用所有仍有效的检查点，不重复翻译、验证、门禁或远端工作。

术语约定：除阶段 J 明确写出的“最终线上发布确认”外，文中的“确认、核验、验证”均指执行者通过代码、工具或远端状态自主核验，不表示向人提问。

---

## 1. 启动输入与默认授权

### 1.1 产品语言契约

| 字段 | 本次值 | 规则 |
| --- | --- | --- |
| 产品语言英文名 | `<TARGET_LANGUAGE_EN>` | 例如 `French` |
| 产品语言中文名 | `<TARGET_LANGUAGE_ZH>` | 例如 `法语` |
| 菜单原生名称 | `<TARGET_LANGUAGE_NATIVE>` | 例如 `Français`；不附加国家名或地区限定 |
| Umi 原生国旗 | `<TARGET_FLAG_EMOJI>` | 例如 `🇫🇷`；由 canonical locale 对应的 Umi locale metadata 提供 |
| 预期菜单项 | `<TARGET_FLAG_EMOJI> <TARGET_LANGUAGE_NATIVE>` | 例如 `🇫🇷 Français`；国旗只作视觉识别，不建立地区变体 |
| 唯一规范 locale | `<CANONICAL_LOCALE>` | BCP 47，例如 `fr-FR` |
| 基础语言码 | `<LANGUAGE_CODE>` | 例如 `fr` |
| Ant Design adapter | `<ANTD_LOCALE_ADAPTER>` | 例如 `fr_FR`；只是框架适配器 |
| Day.js adapter | `<DAYJS_LOCALE_ADAPTER>` | 例如 `fr`；只是框架适配器 |
| Intl locale | `<INTL_LOCALE>` | 通常等于规范 locale |
| 输入别名 | `<LOCALE_ALIASES>` | `xx`、常见 `xx-*`、underscore/POSIX 形式全部归一到规范 locale |
| 书写方向 | `<WRITING_DIRECTION>` | `ltr` 或 `rtl` |
| 地区策略 | `single-standard` | 只维护一种产品语言，不建立国家/地区变体包 |
| 文档 fallback | `<DOCS_FALLBACK_LOCALE>` | 没有目标语言文档时通常使用英文 |
| 法律内容 fallback | `<LEGAL_FALLBACK_LOCALE>` | 不构造不存在的目标语言 URL |
| 内容读取优先级 | `<CONTENT_READ_LANGUAGES>` | 例如 `fr -> en`；必须与 UI locale 分开声明 |
| 内容编辑能力 | `<CONTENT_AUTHORING_CAPABILITY>` | 目标基础语言码必须在当前 TIDAS/ILCD language enum 中可验证；不因 UI fallback 自动禁用 |
| 服务查询语言 | `<SERVICE_QUERY_LANGUAGE>` | 后端没有原生能力时允许显式 fallback，但必须可观察、可测试 |
| 分类资源能力 | `<CLASSIFICATION_CAPABILITY>` | 必需资源达到 `official` 或 `project-reviewed`，不得以 silent English fallback 完成 |
| 地点资源能力 | `<LOCATION_CAPABILITY>` | 同分类资源；代码、层级和顺序保持不变，只本地化名称 |

规范 locale 是应用、存储和运行时标识，不代表只服务某个国家。Ant Design 的下划线名、Day.js 的语言码、导入报告 schema key 都只是边界 adapter，不是第二个产品语言。

每个 registry locale 都必须生成以下能力矩阵，不能从“UI 已激活”推断其他能力已经存在：

| 能力 | 合法状态 | 激活要求 |
| --- | --- | --- |
| `uiMessages` | `native` / `missing` | 必须为 `native` |
| `contentRead` | `native` / `declared-fallback` / `missing` | 必须明确优先级，禁止隐式回退 |
| `contentAuthoring` | `native` / `unsupported-by-contract` | 由当前 schema/enum 和产品合同共同决定，并有验证证据 |
| `serviceQuery` | `native` / `declared-fallback` / `unsupported` | 非 native 时必须记录请求语言、实际语言和用户影响 |
| `classifications` | `official` / `project-reviewed` / `missing` | 所有必需分类资源不得为 `missing` |
| `locations` | `official` / `project-reviewed` / `missing` | 不得为 `missing` |

新增语言交付和现有语言补齐使用同一矩阵。当前 registry 中的语言只作为运行时发现结果参与审计；脚本、测试和资源清单不得复制固定的 `en/zh/de/fr` 数组。

### 1.2 交付输入

| 字段 | 本次值 | 规则 |
| --- | --- | --- |
| GitHub Project 项 | `<PROJECT_ITEM_URL_OR_ID>` | 优先复用；不存在时可填 `CREATE_IF_MISSING` |
| 语言平台化 Issue | `<LANGUAGE_PLATFORM_ISSUE_URL_OR_ID>` | registry、能力矩阵、内容语言组件、resolver 和反硬编码门禁 |
| 分类资源本地化 Issue | `<REFERENCE_LOCALIZATION_ISSUE_URL_OR_ID>` | 分类/地点版本、来源、译文、Manifest、缓存和完整性门禁 |
| 页面清扫与 E2E Issue | `<PAGE_SWEEP_E2E_ISSUE_URL_OR_ID>` | 对全部现有语言扫描 route/view/dialog/drawer/状态并完成浏览器证明 |
| workspace 集成记录 | `<WORKSPACE_ITEM_OR_EXISTING_PARENT>` | 复用现有父项或集成批次 |
| workspace 集成 | `<WORKSPACE_INTEGRATION_REQUIRED>` | 默认 `yes` |
| 工作分支 | `<WORK_BRANCH>` | 从当前分支契约规定的日常主干创建 |
| package 版本策略 | `<EXPLICIT_VERSION_OR_SELECT_AT_FREEZE>` | 可预先指定；否则冻结时选择，只修改一次 |
| dependency policy | `<NO_NEW_DEPENDENCIES_OR_PREAPPROVED_EXACT_LIST>` | 默认 `NO_NEW_DEPENDENCIES`；确需新增时必须在 Goal 启动授权中列出精确 package/version/rationale |
| release owner | `<RELEASE_OWNER>` | 一个版本只有一个 owner/branch |
| promote batch 策略 | `<PROMOTE_BATCH_POLICY>` | 必须审计完整 `dev...main`，不能只看语言 PR |
| canonical Release 终态 | `<CANONICAL_RELEASE_TERMINAL_STATE>` | 从当前 workflow 读取；观察基线为 Draft + 全部规定资产成功 |
| 使线上生效的动作 | `<PRODUCTION_EFFECTIVE_ACTION>` | 从当前 workflow 读取；观察基线为合并 promote PR 后的 `main` push |
| 生产 URL/项目 | `<PRODUCTION_URL_AND_PROJECT>` | 用于发布核验和 smoke |
| smoke matrix | `<SMOKE_ROLE_MATRIX>` | 匿名登录流程、受保护路由的匿名重定向、代表性已登录共享路径、真实角色分支及凭据可用性 |
| 回滚目标 | `<PREVIOUS_MAIN_SHA_OR_TAG>` | 发布前稳定版本 |
| 回滚 runbook | `<ROLLBACK_RUNBOOK_OR_NOT_AVAILABLE>` | 不存在时明确 `NOT_AVAILABLE` |
| 回滚 owner | `<ROLLBACK_OWNER>` | 生产回归负责人 |
| 检查点文件 | `<CHECKPOINT_STORE>` | 默认 `.local/i18n/<locale>/checkpoint.json` |

### 1.3 Goal 批准后自动获得的执行权限

用户批准本 Goal 后，以下范围内的正常操作不再单独请求确认：

- 创建/更新 Project、Issue、分支、commit 和阶段边界记录；
- 修改 locale、共享 registry、i18n 工具、运行时 adapter、选择器、测试和必要文档；
- 修改内容语言组件、分类/地点资源、资源 Manifest、缓存清单及其确定性生成和校验工具；
- 基于明确上下文修订任一现有语言的错误、遗漏和术语不一致；
- managed push、创建/更新 feature PR、处理 CI 和 review feedback；
- required checks 通过后合并 feature PR 到 `dev`；
- 创建并更新 `dev -> main` promote PR；
- 执行 dev/预生产 smoke、重跑无 tracked 变化的失败 job；
- 最终发布确认后合并 promote PR、监控发布、执行生产 smoke；
- 更新和合并根 workspace integration PR；
- 更新最终 Project 状态、清理已合并分支和本任务临时文件、同步 workspace。

唯一需要人工确认的正常动作是：执行当前 workflow 中真正使 production URL 生效的动作。这里的 production-effective action 定义为“第一个可能改变任何真实生产用户可见服务状态，或启动不可撤销/外部可见生产 rollout 的动作”。

如果当前 Next workflow 在 exact dev Release PR 已完成非浏览器 release gate 后，由 `main` push 验证该 proof 并创建 tag、部署 Web 和准备 Draft Release，那么这些副作用与 `main` 合并仍是一个不可拆分的发布单元，唯一确认位于 promote PR 合并前。main-target PR 上的 proof/identity check 是合并前阻断证据，不改变 production-effective action 的位置。若未来 `main` 合并不再使线上生效，则 main 合并继续自主执行，并把唯一确认移动到真正的 production deploy/promote/publish 动作之前。执行者必须先只读审计 workflow，不能猜测线上生效点。

如果 feature、promote、release 或 root integration 的 branch protection 强制人工批准，这属于仓库外部治理阻塞，不是本 Goal 设计的正常确认节点。不得主动增加这类 gate，也不得绕过已存在的保护规则。

### 1.4 唯一人工确认的绑定范围

最终线上发布确认必须绑定以下精确候选：

```text
(package version,
 promote PR URL,
 promote head SHA/tree,
 完整 dev...main batch digest,
 canonical release 自动副作用,
 production-effective action,
 production target,
 rollback target/runbook)
```

确认前向用户提供一份简短发布摘要，只询问一次“是否发布这个精确线上候选”。

- 若确认：自主执行绑定的 production-effective action，并完成自动发布、生产 smoke、根集成和收尾。
- 该确认同时允许在生产 smoke 失败时执行候选中预先列明的安全 rollback runbook；不得再请求第二次回滚确认。
- 若拒绝：停在 production-effective action 尚未执行的状态；按当前 workflow 即 promote PR 未合并。不得回滚已完成的翻译、测试或非生产步骤。
- 若确认后只有同一 SHA 的网络、缓存或 job 瞬时失败：可自主重试，不需要再次确认。
- 若确认后的 tracked 内容、版本、promote tree 或发布批次变化：原确认失效；新的线上候选只在发布前重新确认一次。
- 翻译、术语、feature PR、`dev` 合并、测试、版本准备和根集成计划都不是人工确认点。

### 1.5 C0 fail-fast

任何写操作前，执行者通过只读预检补齐第 1 节的技术事实，并验证：

- 所有输入占位已经实例化；
- canonical locale 可由 `Intl.getCanonicalLocales` 解析；
- locale/alias 不与现有语言 registry 冲突；
- Ant Design、Day.js 和 Intl adapter 在当前依赖中可解析，或已有明确显式适配方案；
- 目标基础语言码是否属于当前 TIDAS/ILCD language enum 已由实际 SDK/schema 验证，而不是从 UI fallback 推断；
- 全部现有 registry locale 的能力矩阵已经生成，`missing`、`declared-fallback` 和硬编码热点有明确 owner Issue；
- CPC、ISIC、ILCD classification、ILCD flow categorization、ILCD locations 等必需参考资源已锁定精确 edition/source URL/license/retrievedAt/structure digest；无法确认版本的旧文件不能直接进入翻译阶段；
- 同版本、同代码体系的官方目标语言译本可用性已经从官方发布者核验；旧版本或相关体系的译名只能作为术语证据，不能伪装成本版本官方译本；
- 本次不新增 npm dependency；若确实不可避免，精确 package/version/rationale 已在本 Goal 启动时获得治理所需授权；
- Release 终态来自当前 workflow/policy，而不是模板臆测；
- production、smoke、版本、release owner、promote batch、rollback 和 checkpoint 信息完整；
- 当前 `main` 自动副作用已经被识别；
- 真正使 production URL 生效的动作已经被识别；
- 本 Goal 的唯一人工节点确实位于该动作之前，而不是机械绑定某个固定 Git 名称。

C0 不做翻译评审，也不请求翻译确认。技术事实能够从仓库、官方文档和运行环境确定时，由执行者直接完成。

---

## 2. 上下文完备合同

### 2.1 平台语境

所有消息默认属于 TianGong LCA 平台系统界面。翻译必须理解其所在的生命周期评价、数据管理、TIDAS/ILCD、计算、审核、发布或协作场景，不能把消息当作通用网站文案处理。

### 2.2 每条消息的必需上下文

每个翻译单元必须具备以下 dossier；任何必需项缺失时标记 `BLOCKED_CONTEXT`，先补证据，不猜译：

- message ID、owner module、当前 source SHA；
- canonical English；
- 现有 Chinese；
- 德语及其他所有现有语言的当前译文；
- 直接 callsite，或已审计的 dynamic message family/producer/fallback；
- 页面、组件、路由、UI role，例如按钮、标题、字段、提示、错误、日志事件；
- 当前状态、相邻文案、前后状态转换和用户可见后果；
- LCA/TIDAS/ILCD/产品术语和可信来源；
- ICU plural/select、变量、rich-text tag、插值样例和换行；
- 必须保留的品牌、代码 token、枚举、文件名、URL、缩写、单位和数字格式；
- 长度、换行、窄屏、表格列、弹窗、RTL/bidi 和暗色主题风险；
- 目标语言候选、选择理由、风险级别和验证方式。

其他语言的既有译文是重要比较证据，但不是绝对权威。多语言发生冲突时，优先级为：

1. 真实运行行为、callsite 和用户后果；
2. canonical English 的产品语义；
3. Chinese 和其他现有语言的共同语义；
4. LCA/TIDAS/ILCD 及语言权威术语；
5. 页面布局和目标语言自然表达。

### 2.3 禁止机械直译

以下做法不满足上下文完备：

- 只根据英文或中文单句逐字替换；
- 把 Chinese 句法套入目标语言；
- 只依赖机器翻译/LLM 首个候选；
- 不看按钮后果、错误触发条件或相邻状态；
- 忽略其他现有语言暴露出的术语模式或历史错误；
- 为追求 key parity 填入语义不明的占位文案；
- 用运行时 fallback 掩盖缺失翻译。

### 2.4 自动上下文闭环

`BLOCKED_CONTEXT` 不触发人工翻译审核。执行者继续从以下来源补足：

- 代码调用点、类型、测试、路由和运行时交互；
- 英文、中文及所有现有 locale；
- glossary、style guide、TIDAS schema 和 LCA/ILCD 标准；
- Git 历史、Issue/PR 中非个人化的产品决策；
- 真实页面和浏览器状态；
- 相关官方文档和稳定领域来源。

如果穷尽证据后仍无法确定新语言所需的产品语义，不得猜译或发布。将其记录为“源语义不可判定”的产品阻塞，而不是向人请求选择某个译法。

### 2.5 路由/静态视图与 URL 状态覆盖合同

“静态视图”只描述内容形态，不表示匿名公开，也不表示可以跳过 i18n。本 Goal 只定义翻译覆盖，不拥有认证/授权策略：语言交付不得新增匿名路由、扩大匿名 allowlist、绕过 session/access guard、改变登录重定向或让受保护内容在重定向前挂载。匿名可达范围必须复用仓库当前认证合同；观察基线中 SPA 仅登录、找回密码和重置密码流程可匿名访问，其他已配置路由、redirect 和未匹配路径均须先通过 session guard。登录流程依赖的 `/terms_of_use.html` 与 `/privacy_notice.html` 是 SPA 外唯一允许匿名直出的静态 HTML 法律文件；它们不构成新增 SPA 匿名路由或其他静态页面的授权。

所有登录流程视图、受保护的欢迎/介绍/指南/帮助/onboarding 视图，以及登录后以固定内容为主的页面，都属于全量翻译范围。同一个 React 页面只要因 URL 或交互状态显示不同内容，就必须按不同 view state 独立建模、翻译和验证。受保护内容的翻译 proof 使用有效会话；匿名 proof 只验证登录流程，以及受保护入口跳转到 canonical login 且没有渲染受保护内容。

执行者必须从路由配置、页面实现、导航调用和浏览器行为生成 `route-view coverage matrix`，至少记录：

| 字段             | 要求                                                                   |
| ---------------- | ---------------------------------------------------------------------- |
| `route`          | canonical path 及 redirect 来源                                        |
| `viewState`      | query、hash、path segment、tab、modal/drawer、feature state 或默认分支 |
| `trigger`        | 精确 URL、参数值或用户操作                                             |
| `component`      | route component 和实际渲染子组件                                       |
| `accessContext`  | 记录现有匿名/已登录/角色前置条件；只能反映认证合同，不能授权新公开范围 |
| `copySources`    | locale keys、组件内对象/数组/常量、静态 metadata、API/fallback 等      |
| `visibleStates`  | 正常、空、加载、失败、禁用、fallback 和响应式状态                      |
| `targetCoverage` | 目标 locale 的来源、结构审计和零遗漏结果                               |
| `proof`          | focused test、浏览器断言或 visual smoke                                |

观察基线至少包含以下三个受保护入口/状态；未来发现的其他 route/static view 或 view 参数必须自动追加，不能把此列表当作匿名白名单：

- 匿名访问 `/`、`/welcome`、`/welcome?view=carbon-footprint` 时统一跳转 canonical login，且不渲染 Welcome 内容；
- 已登录访问 `/` redirect 后的最终页面；
- 已登录访问 `/welcome` 的默认 overview；
- 已登录访问 `/welcome?view=carbon-footprint` 的 carbon-footprint guide。

每个状态的覆盖必须包含标题、正文、指标卡、按钮、链接、步骤、schema/字段说明、modal/drawer/tab、视频说明与加载/失败/fallback、tooltip、通知、空状态、图片 `alt`、ARIA label 和其他用户可见或辅助技术可读文案。以下来源一律不能因为不在标准 locale leaf module 中而漏掉：

- 页面组件内按语言维护的对象、数组、常量或 JSX literal；
- `history.push`、`URLSearchParams`、query/hash/path 分支才可达的内容；
- 配置、静态 metadata、服务返回映射和 fallback 文案；
- 只在错误、loading、媒体不可用、窄屏或特定交互状态出现的内容。

用户可见的组件内 `en`/`zh` 双语 map（例如观察基线 `Welcome.tsx` 的本地内容结构）不得继续被当作完整实现。优先迁移到标准 locale catalog；若因结构原因保留在组件外部的 typed content source，也必须由 canonical locale registry 驱动、包含目标 locale、接受 exact topology/context audit，并禁止用未声明的 English/Chinese fallback 掩盖缺失。语言切换、刷新或直接打开带 query 的 URL 都必须保持相同 view state，只改变语言，不得退回 overview 或丢失参数。

### 2.6 参考数据本地化与来源合同

以下资源属于语言交付的正式范围，不是 UI catalog 之外的可选附件：

- CPC classification；
- ISIC classification；
- ILCD classification；
- ILCD flow categorization；
- ILCD locations；
- 后续加入 `REFERENCE_RESOURCE_MANIFEST` 且被产品页面消费的其他受管参考资源。

每种资源、每个目标语言按以下优先级处理：

1. 同一 edition/version、同一代码/ID 体系、由该标准官方维护者发布的目标语言版本；
2. 经精确 code/meaning correspondence 证明可复用的官方 crosswalk 或相关官方分类术语，只用于已证明等价的条目；
3. 对其余条目进行项目翻译，并使用 LCA/ILCD 术语、真实页面语境和其他语言交叉复核。

禁止把旧版 CPC/ISIC、NACE/WZ 或其他相关体系中“代码看起来相同”的标签直接覆盖到当前版本，也禁止将项目译文标记为官方。每个资源 Manifest 至少记录：

| 字段 | 要求 |
| --- | --- |
| `resourceId` / `edition` | 稳定资源标识和精确版本；文件名不能代替版本证据 |
| `structureSource` | authority、source URL、retrievedAt、license/usage terms、source digest |
| `baseLocale` / `structureDigest` | 基础结构语言及作用域节点身份/层级/顺序摘要 |
| `overlays.<language>` | `official`、`official-crosswalk`、`project-translated` 或 `project-reviewed` |
| `coverage` | expected/translated/blank/extra/duplicate 数量和摘要 |
| `evidence` | 来源、术语证据、生成器版本、review digest 和测试 |

实现优先保存“稳定基础结构 + 按资源作用域稳定节点身份的语言覆盖”，不得为每种语言维护会独立漂移的完整树，也不得默认使用全局 `Map<id, label>`。只有在一个已冻结 resource/dataType scope 内证明 ID 唯一时，才可单独以 ID 为键；否则稳定键至少包含 `resourceId + canonicalDataType + ancestry/source position + occurrence identity`。构建期发现重复或歧义键必须 fail closed，不能覆盖其中一个标签。翻译只能改变名称/说明，不得改变 ID、代码、父子关系、顺序或数据类型。构建和压缩必须确定性生成；缓存版本、预热文件列表和完整性摘要从 Manifest 派生，不再手写文件数组。

开发期间允许在明确记录为 `missing` 时暂时显示基础语言以便排查，但正式激活和 Goal 完成要求所有必需条目达到 `official` 或 `project-reviewed`，作用域节点身份覆盖率 100%，且页面不得显示 `-`、空名称或无提示的 English fallback。现有 Chinese、English、German、French 以及未来 registry locale 使用同一规则和同一审计器。

---

## 3. 全自动翻译质量模型

### 3.1 无人工翻译审核

本 Goal 明确禁止创建或等待以下流程：

- Pilot 人工确认；
- 全目录人工审批；
- delta 人工审批；
- Reviewer/Admin/Member 翻译签字；
- GitHub attestation、reviewer onboarding 或权限验证；
- ignored Markdown/XLSX 人工确认单；
- 记录审批人、日期、选择、回复或 response digest 的 checker。

可以执行自动化/AI 二次复核，但它是上下文和证据检查，不是人工批准。

### 3.2 两阶段自主翻译

每个非重叠模块采用两阶段处理：

1. **上下文翻译阶段**：基于完整 dossier、glossary 和 style guide 生成自然、准确的目标语言候选。
2. **独立证据复核阶段**：由不同执行上下文的自动化 reviewer 检查语义、UI role、术语、ICU/token、跨语言一致性和布局风险。

复核分歧不能靠投票决定，必须回到 callsite、产品后果和术语证据。高风险消息必须经过独立复核；低风险重复模式可由经过验证的 family rule 批量处理并抽样验证。

### 3.3 自动质量门槛

进入运行时激活前必须达到：

- exact key/module/spread-order parity；
- 零 missing/extra message；
- 零 ICU、placeholder、rich-text tag 或 technical token mismatch；
- 零未解释 `BLOCKED_CONTEXT`；
- 零未处理的明确术语冲突；
- 所有 dynamic families 有可验证 producer/fallback；
- 所有高风险消息有独立证据复核结果；
- 目标语言 style/glossary consistency checks 通过；
- 全部 registry locale 的能力矩阵无未归属 `missing`；目标交付要求的 content authoring/read、分类和地点能力均已达到声明状态；
- 每个必需参考资源都有锁定版本、来源、授权、结构摘要和 100% 作用域节点身份覆盖，ID/代码/层级/顺序不漂移且歧义键 fail closed；
- 没有通过复制 English/Chinese 来伪造完成度。

这些是机器可检查或证据可复现的完成条件，不需要人类认可。

---

## 4. 持续质量优化与已有译文自动修订

### 4.1 自动修订授权

在构建目标语言上下文、跨语言对照或运行时测试时，如果发现已有 locale 存在可明确判定的问题，执行者可直接修订，包括但不限于：

- 缺失 message、错误 fallback 或错误 locale 分支；
- 与 canonical English/callsite 明确不符的误译；
- Chinese、German 或其他语言中的遗漏、反义、对象错误、动作后果错误；
- 同一 LCA/TIDAS 概念在不同模块中的术语不一致；
- 已过时的产品名、字段名、数据结构名或流程名；
- ICU、变量、plural/select、rich-text tag、token、单位或数字格式错误；
- 把按钮译成状态、把字段译成动作等 UI role 错误；
- 明显不自然、会误导用户或破坏布局的机械直译；
- 选择器、文档、法律、数据或服务 fallback 与实际能力不一致。

这些修订不需要人工审核，也不需要额外授权。

### 4.2 “可明确判定”的证据标准

语义型自动修订至少需要以下三方证据收敛：canonical source、真实 callsite/运行行为，以及 Chinese/其他语言共同语义或领域 glossary/标准之一。纯结构错误（例如缺 key、ICU 参数或 token mismatch）可以由精确结构不变量单独证明。

可使用的证据包括：

- canonical English 与代码行为；
- Chinese/其他 locale 的共同语义；
- UI role、用户操作后果和相邻状态；
- LCA/TIDAS/ILCD 术语来源；
- 类型、schema、enum、测试或运行时样例；
- 现有 glossary/style rule；
- 可复现的布局、格式化或 fallback 失败。

纯个人偏好、可互换同义词或无法证明用户影响的风格变化，不作为大范围 churn 的理由。若证据不能明确支持某个修订，对现有译文保持不变并记录为非阻塞候选；不得把不确定性伪装成质量提升。

### 4.3 修订记录

每个已有译文修订生成紧凑、非个人化 correction dossier：

- locale/message ID/module；
- before/after；
- `errorType`；
- callsite/source/term evidence；
- 用户影响；
- 受影响 message 闭包；
- focused validation；
- source/catalog digest。

Git 只跟踪实际修订和紧凑 correction ledger/digest，不提交巨大逐消息渲染包。

如果产品功能被明确移除，baseline message 可以随全部 locale 和生产调用点一起删除，但必须在 correction ledger 的 `retiredMessages` 中绑定 tracked Issue 和删除原因。检查器必须同时证明该 message 存在于不可变 baseline、已从当前 catalog 完全消失、没有重复 retirement；这不会修改或重新解释历史 German evidence，也不能把已退休文案作为兼容资源继续保留。

### 4.4 规则变化的传递闭包

glossary、style rule、context override、dynamic family 或 source semantics 改变时，必须通过 usage index 找出所有受影响 locale/message。能证明完整闭包时只修订该闭包；无法证明时扩大自动审计范围，直到确认没有遗漏。

这不是人工 delta 审批。修订后的闭包通过相同的上下文、结构和运行时验证即可继续。

### 4.5 持续优化循环

每次 inventory/context 构建、每个翻译 batch、runtime smoke、最终 quality audit 和生产 smoke 都触发以下循环：

```text
构建跨语言上下文
  -> 发现新语言候选与既有译文异常
  -> 以 callsite/source/术语证据分类
  -> 自动修订可明确判定的问题
  -> 计算跨模块、跨 locale 影响闭包
  -> focused checks + cross-locale audit
  -> 更新紧凑质量 manifest
  -> 继续下一批
```

因此新增语言不仅不降低已有语言质量，还应在有明确证据时持续消除历史翻译债务。

---

## 5. 当前架构与一次性通用化

### 5.1 观察基线

观察基线 `v0.0.51@1122df8d` 有 `zh-CN`、`en-US`、`de-DE`、`fr-FR` 四种活跃 UI locale，每种 30 个 leaf modules、3,026 条消息，并包含 17 个 dynamic families/39 个动态调用点；当前 UI catalog 结构审计为零 violation。该结果只证明 catalog 结构，不证明内容语言、分类、地点或所有页面状态已经本地化。观察基线同时存在以下已确认缺口：内容语言选项和 `LangTextItem` 显示仍只识别 `en/zh`；分类与地点资源/加载器仍只声明 `en/zh`；德语和法语的数据语言被整体回退为 English；English/Chinese 地点代码集合不一致；Chinese ILCD classification 还存在额外数据组/结构差异；通用 per-locale activation 命令不能对 English/Chinese 完整执行。未来执行时必须从 registries 和资源 Manifest 重新生成语言、数量、资源和菜单项，并先裁决这些既有语言差异，不得硬编码本段历史规模。

### 5.2 必查入口

- `src/locales/<locale>.ts` 与同名 leaf modules；
- `config/routes.ts`、redirect、页面内 `history.push`/link 和 URL 参数解析；
- `src/pages/Welcome.tsx`、`src/locales/*/pages_home.ts`，以及 route-view matrix 发现的其他 route/static view；
- `src/services/general/runtimeLocale.ts`；
- `src/services/general/localeRegistry.ts`、`src/services/general/data.ts`、`src/services/general/util.ts`；
- `src/components/LangTextItem/**` 及所有调用点；
- `src/services/classifications/**`、`src/services/locations/**`；
- `src/components/ClassificationCacheMonitor/**`、`src/components/LocationCacheMonitor/**`；
- `public/classifications/**`、`public/locations/**` 及其生成器/Manifest；
- `src/components/RightContent/index.tsx` 与 `src/global.less`；
- `config/config.ts`、`config/defaultSettings.ts`；
- `src/app.tsx`；
- `src/services/general/api.ts`、`src/services/general/util.ts`；
- `src/components/ImportTidasPackage/index.tsx`；
- `src/pages/User/Login/**`；
- `scripts/i18n/**`、`tests/helpers/i18n/**`、locale/runtime/selector/login/import-report/route-view tests。

### 5.3 Typed registries、资源 Manifest 与派生能力

不能把 UI locale、TIDAS 内容语言和参考资源文件压成一个 `dataLanguage` 字段。共享事实分为三个 source of truth：

1. `LOCALE_REGISTRY`：canonical UI locale、native label、aliases、writing direction、Ant Design/Day.js/Intl adapter、环境和 selector adapter；
2. `CONTENT_LANGUAGE_REGISTRY`：基础语言码、TIDAS/ILCD enum 支持、读取优先级、编辑能力、服务查询能力和显式 fallback；
3. `REFERENCE_RESOURCE_MANIFEST`：分类/地点 resource ID、edition、基础结构、各语言 overlay、来源/授权/digest/coverage 和缓存资产。

当前实现中第三项的可编辑 source of truth 是 `src/services/referenceResources/reference-resource-manifest.json` 与 `src/services/referenceResources/data/**`；`src/services/referenceResources/generatedManifest.ts`、`public/classifications/*.gz` 和 `public/locations/*.gz` 都是确定性派生物。任何参考资源变更必须运行 `pnpm reference-data:write` 后以 `pnpm reference-data:check` 复核，禁止手改派生文件；任何 production-effective workflow 还必须通过 `pnpm reference-data:production:check`，不能用非生产结构闭包检查替代版权与 native delivery readiness。

`LOCALE_CAPABILITY_MATRIX` 由三者连接计算，不在第四处复制布尔值。`SupportedAppLocale`、`SupportedContentLanguage`、选择器顺序、`LangTextItem` options/labels、alias normalization、文档链接、格式化、服务查询、分类/地点 resolver、缓存预热文件列表和参数化测试都必须从这些 source of truth 派生。

选择器国旗继续由 Umi locale metadata 所有，不在 registry 中复制第二份自定义图片或 emoji 映射。语言展示名称由 registry/Intl 统一解析，不允许在详情组件中使用 `en ? English : zh ? 简体中文 : '-'`。不得继续复制 `if (locale === 'de-DE')`、`lang === 'zh'`、`'en' | 'zh'`、固定语言 options 或固定资源文件数组；只有 registry/resolver/boundary adapter 中的精确受控映射可以出现语言码。

### 5.4 通用化审计和工具

当前 German 专用资产是历史兼容层，不得为新语言复制整套 `german-*` 脚本、测试和数十万行派生证据。公共能力应最小参数化为类似：

```bash
pnpm i18n:locale:audit --locale <CANONICAL_LOCALE>
pnpm i18n:locale:manifest:write --locale <CANONICAL_LOCALE>
pnpm i18n:locale:artifacts:write
pnpm i18n:locale:artifacts:idempotence
pnpm i18n:evidence:canonical:check --path <artifact>
pnpm i18n:context:check --locale <CANONICAL_LOCALE>
pnpm i18n:locale:quality:check --locale <CANONICAL_LOCALE>
pnpm i18n:corrections:check
pnpm i18n:locale:activation:check --locale <CANONICAL_LOCALE>
pnpm i18n:locale:production:check --locale <CANONICAL_LOCALE>
pnpm i18n:platform:audit
pnpm i18n:hardcoding:audit
```

实际命令以实现后的 `package.json` 为准。共享 inventory、dynamic-family registry、language discovery、resource discovery 和 parser 只能有一个 source of truth；语言特有内容仅保留 glossary、style guide、必要 context override、locale files、参考数据 overlay 和紧凑 quality/activation manifest。

仓库 source-analysis 工具使用单一 TypeScript `7.0.2` compiler/API track，不保留 TypeScript 6 alias 或 `tsc6`。`scripts/typescript-native-parser.mjs` 与其 `scripts/typescript-native-parser.d.mts` 声明是唯一允许导入 `typescript/unstable/*` 的边界；所有 i18n audit、locale delivery 和测试 helper 只能导入该 adapter，不得直接导入 `typescript` 或 unstable 子路径。adapter 必须复用一个 native API session，同时为每次输入替换并释放虚拟 source，保持 `createSourceFile`、`parseJsonText`、AST traversal/parent/text range、TSX node guards 和 syntactic diagnostics 的兼容语义。TypeScript 升级前后必须运行 adapter contract 与全部受影响的 i18n/source-analysis focused proof，不能以加入旧 compiler 作为兼容方案。

Prettier 只负责格式化，不再通过 Compiler API 组织 imports；Oxlint 负责 unused 与 deprecated API correctness。不得为语言脚本恢复 ESLint、自定义 deprecated scanner 或 `prettier-plugin-organize-imports`。

semantic evidence reporter 必须直接把外部 artifact 写成仓库 canonical JSON，不允许先输出临时形态再依赖格式化器修正。格式策略必须从 repository-owned canonical path 解析并与实际输出目的地解耦，因此容器挂载的 `/e2e-output` 或 ignored `.local/**` 也必须一次写出可由同一 canonical checker 原样接受的 bytes。locale artifact generator 必须在一次 invocation 中按显式依赖图 `context -> structuralValidation -> quality -> activation` 处理全部 registry locale；任何 generator、evidence input 或摘要合同变化后，都必须连续生成两次并证明第二次执行前后的精确 Git diff 不变。幂等检查使用 detached clone 隔离 ambient worktree state 时，必须显式复制生成器读取的 remote refs（当前包括 `refs/remotes/origin/main`），不能依赖源 checkout 恰好存在同名本地分支。

CI 必须包含反硬编码门禁：扫描业务代码中的 locale/language 二元条件、固定 supported-locale union、手写语言下拉数组、缓存资产数组、`locale || 'en-US'` / `locale ?? 'zh-CN'` 一类逻辑或空值默认，以及“非 zh 即 en”归一逻辑。下载报告等导出完整 HTML 文档的根 `<html lang>` 与 `dir` 也属于运行时语言能力，必须从 registry/runtime policy 动态派生；门禁必须拒绝嵌入模板中的固定根语言元数据。允许项必须落在最小 allowlist，并说明它是外部 adapter、canonical source、历史冻结验证，或故意 fail-closed 的产品支持语言快照门禁；新增语言后，不修改业务页面即可让 registry 驱动的测试发现其所有必需能力。

### 5.5 German 历史确认与未来自动修订的边界迁移

当前 German Pilot/catalog/delta checker 曾把 active German copy 变化绑定到 ignored 人工确认。该历史机制不能继续约束本 Goal 发现的 post-baseline German correction，否则会与“已有译文自主修订、无需人审”冲突。

在任何 German 自动修订发生前，阶段 B 必须完成一次受控迁移：

1. pin 当前已接受 German baseline SHA、catalog/runtime digest 和历史 scope；
2. 历史 `i18n:de:pilot`、catalog/delta confirmation 只验证其冻结 snapshot，不再覆盖未来 active copy；
3. 为 post-baseline German change 建立自动 correction overlay，至少绑定 `baselineSha`、message IDs、before/after、evidence、affected closure、tests 和 correction digest；
4. active German runtime validation 改由通用 context/correction/activation gate 验证 exact topology、ICU/token、source delta 和 overlay，不读取人工确认文件；
5. 如果现有 `german-runtime-activation.mjs` 或 repo gate 仍以 active copy hash 要求人审，先拆分 frozen-history verifier 与 active automated gate；
6. 同步更新 `AGENTS.md`、`docs/agents/repo-validation.md`、scripts、tests 和相关 i18n contract，明确历史确认只属于 frozen scope；
7. clean runner 必须在没有 `.local/**confirmation*` 时验证当前 German active bundle 和所有 post-baseline corrections。

迁移不删除或伪造历史人工证据，也不为新修订创建新的人工确认。若该技术迁移失败，记录为 validation architecture blocker；不得退回人工 delta 审批来绕过。

### 5.6 Umi 原生国旗选择器

所有 locale 选项统一遵循以下合同：

- 复用 `UmiSelectLang` 的原生 locale 数据和渲染，保留其 `icon` 国旗；
- 共享 Header 的 Umi `SelectLang` 必须使用 `reload={false}`，在当前 document 内更新 locale，而不是以整页 reload 掩盖挂载态刷新或旧请求竞态；
- 菜单项精确显示“国旗 + 语言原生名称”，例如当前基线的 `🇨🇳 简体中文`、`🇺🇸 English`、`🇩🇪 Deutsch`；
- label 不附加国家名或地区限定；必要时只规范化 label，不删除或替换 Umi `icon`；
- 国旗由 canonical locale 的 Umi metadata 决定，只是视觉标识，不表示建立同一语言的国家/地区变体；
- 不用自定义 PNG、SVG、CSS 伪元素、地球图标或第二套 emoji 映射替代框架原生国旗；
- 登录后共享 Header 直接使用原生 Umi/ProLayout action 行为，不增加改变 hover frame 高度的外层 action wrapper；
- 登录流程入口允许使用局部、可访问的紧凑 action frame；已登录 Welcome 使用其现有认证上下文；两者都不得改变下拉菜单的原生 locale icon/label 数据；
- 在匿名登录流程和代表性已登录共享 Header/Welcome 中验证真实可见菜单、图标对齐、hover frame、键盘交互、同 document identity/URL 保持，以及延迟旧 locale 参考资源响应不能覆盖当前 locale。

### 5.7 fallback contract

为文档、法律、内容读取/编辑、服务查询、分类、地点、服务错误、导入/导出 schema、环境标题和报告下载生成可观察表：

| 字段                | 内容                               |
| ------------------- | ---------------------------------- |
| `surface`           | 页面、服务或输出                   |
| `requestedLocale`   | 用户请求 locale                    |
| `resolvedLocale`    | 实际内容语言                       |
| `urlOrPayload`      | URL、请求参数、schema key 或消息源 |
| `userDisclosure`    | 是否说明使用 fallback              |
| `forbiddenBehavior` | 不存在 URL、伪本地化数据等禁止行为 |
| `test`              | 精确断言                           |

fallback 必须按 capability 声明，不能由一个全局 `dataLanguage` 代替。文档、法律或服务查询可以在合同允许时显式回退；目标交付要求的内容编辑、分类和地点能力不得借 fallback 宣称完成。任何 runtime fallback 都必须有 telemetry/diagnostic 或用户可观察说明，并在激活 gate 中证明不会掩盖缺失资源。

### 5.8 路由/视图清单与静态文案所有权

locale inventory 和 route-view inventory 必须交叉校验：前者证明标准消息包结构完整，后者证明真实可达界面没有漏译。工具应从 `config/routes.ts` 开始，继续追踪 redirect、页面中的 link/`history.push`、`URLSearchParams`/hash/path 分支以及 modal/tab/drawer 入口，并对每个状态收集第 2.5 节规定的所有文案来源。

`/welcome` 与 `/welcome?view=carbon-footprint` 即使复用同一组件，也必须是两个独立 coverage rows，并记录 `authenticated-session-required`；这只保证已登录状态下的翻译覆盖，不授予匿名访问。只验证 `pages.welcome.*` key parity 不足以证明完成：组件本地 content map、媒体状态、动作文案和辅助技术文本也必须进入同一审计。新增语言实现完成后，任何用户在满足既有 access context 后可达的静态状态都不得出现未声明的 English/Chinese fallback 或只在目标 locale 下缺失的内容分支。

### 5.9 RTL 条件合同

若目标语言为 RTL，自动把以下内容纳入 scope：document `dir`、Ant Design direction、logical CSS、浮层 portal、表格/菜单/弹窗/抽屉、数字与技术 token 的 bidi、图标镜像规则、明暗主题和窄屏 visual smoke。若为 LTR，记录 `not applicable`，不做无关改造。

### 5.10 语言硬编码门禁

语言字面量只允许出现在 typed registry/Manifest 声明、第三方 adapter 或外部 schema 边界、locale/参考资源翻译 payload，以及带 owner、理由和测试的精确 allowlist。CI 必须拒绝：

- 业务代码中的 `locale === 'xx'`、`lang === 'xx'` 和语言二元 ternary；
- 业务消费者中的 `locale || 'xx-XX'`、`locale ?? 'xx-XX'` 等逻辑或空值语言默认；默认 locale 必须由 typed registry/runtime policy 导出；
- `'en' | 'zh'` 等固定 supported-language union；
- 手写语言下拉数组、语言显示名称分支；
- 手写分类/地点文件 map 或缓存预热文件数组；
- “中文使用 zh，其他全部使用 en”一类归一化；
- 下载报告等导出完整 HTML 中固定的根 `<html lang="xx-XX">`，或没有从同一 locale definition 派生 `lang` 与 `dir` 的实现；
- 只覆盖当前语言数量、跳过 registry locale 或单独只为目标语言运行的测试循环。

门禁输出精确文件和行号；allowlist 必须最小、可解释、可测试。测试通常从 registry 动态派生支持语言；如果某个测试有意保留固定支持语言数组，以便新增或删除产品语言时强制人工更新产品合同，该数组必须在测试旁明确标注为 fail-closed 产品快照门禁，不得被业务消费者复用，也不得伪装成参数化覆盖。新增 registry locale 后，catalog、内容能力、参考资源或参数化测试任一缺失都必须 fail closed。

### 5.11 Playwright 语义 E2E 与生产数据边界

当前浏览器执行合同使用 `@playwright/test` `1.62.1`，canonical 入口为 `pnpm test:e2e:i18n`，配置位于 `playwright.config.ts`，测试与 ledger/reporter helper 位于 `tests/e2e/i18n/**`。候选前端必须由 `pnpm start:main` 在 loopback URL 启动并连接 production backend；`E2E_BASE_URL` 指向真实生产前端时必须 fail closed。

独立 workflow `.github/workflows/i18n-semantic-e2e.yml` 是可选的手动 hermetic qualification 边界：

- 日常 PR、普通 `dev` push、release PR、promote PR 和 publication 都不自动触发或要求浏览器 E2E；仅 `workflow_dispatch` 由 operator 选择仍开放的业务 PR 分支或 exact SHA；
- 该 workflow 一律不接收生产凭据、不写生产数据，每次真实执行预构建候选与固定 closed simulator 的 content-addressed hermetic qualification，覆盖 Chromium 全矩阵及 Firefox/WebKit 关键场景；
- 应在 `release:to-dev` 前、业务 PR 仍可修改时按风险选择运行；失败直接在同一 PR 修复并重跑。它是人工选择的验收信号，不属于 release proof。

完整已登录 candidate-local + production-backend 闭包只能在用户明确授权的本地 operator session 中运行。该 session 从运行时提供凭据并设置 `E2E_AUTHENTICATED=true`；两个 production-write guard 分别是 `E2E_ALLOW_PRODUCTION_DATA=true` 和 `E2E_PRODUCTION_WRITE_CONFIRMATION=I_AUTHORIZE_ONE_CODEX_E2E_PRODUCTION_PROCESS`，生成 verified external evidence 还必须单独设置 `E2E_WRITE_VERIFIED_EVIDENCE=true`。执行者同时验证前端为 fresh loopback candidate、浏览器实际只访问 tracked production backend。不得把凭据、这些 opt-in 或写权限迁移到任何 semantic E2E GitHub Actions event。

route-view matrix 的每一 row 必须拥有稳定 `executableAssertionId`。观察合同共 58 个 assertion ID；每个 ID 除 live route scenario 外，还必须闭合其 `executableTarget.requiredScenarios` 声明的匿名保护、fallback/refresh、状态机、authoring、响应式、持久化或参考数据刷新场景。Chromium 执行完整 route/view 矩阵，登录/语言选择器、团队内容语言录入和流程数据生命周期等关键场景在 Chromium、Firefox、WebKit 三种引擎中执行。locale 和可编辑内容语言集合必须从 `LOCALE_REGISTRY` 与 `CONTENT_LANGUAGE_REGISTRY` 动态派生；新增 registry locale 会自动扩大期望集合并使旧证据失效，不得人工修改旧证据继续使用。

生产写入只允许随机 UUID 且 marker 以 `codex-e2e` 开头的数据。任何 create 之前必须先持久化 ignored intent ledger，绑定精确 `id + table + version + marker + createAttempted`。任何 delete 之前必须按 UUID 读取 production row，并同时验证 `common:UUID` 的确切 ILCD 路径、当前 authenticated owner，以及 `baseName`、`treatmentStandardsRoutes`、`mixAndLocationTypes`、`functionalUnitFlowProperties`、`generalComment` 五个确切字段路径中每个 registry authoring language 的 `@xml:lang`/exact-marker 配对；散落在其他位置的 marker 不构成 attestation。任一不符都拒绝删除，禁止扩大查询或模糊清理。只有完成上述 row attestation 后才能逐个删除 exact-ID versions，并验证 `created=cleaned`、`leaked=0`；前一次 ledger 未清零时不得创建下一条。截图、trace、video、持久化 auth state 和任何 credential-bearing artifact 全部禁用。

上述截图禁令只约束本 Goal 的 i18n semantic E2E 证据边界。docs-impact 只读截图由 workspace 的独立通用引擎执行；Next 只在 `config/docs-capture/profile.v1.json` 提供与精确 render-target commit 绑定的 runtime/readiness、登录/身份、认证写请求和稳定 locator 合同。该引擎的 PNG 不得被复用为本 Goal 的 semantic E2E 或生产数据闭包证据。

browser proof 不进入 Git。手动 workflow 使用行为输入与浏览器环境合同计算 qualification key，在固定 `.invalid` backend profile 对预构建候选执行完整 closed-simulator qualification，并上传短期 artifact；它不读取 deployment `.env` 或 `origin/main:.env`，也不复用 Actions proof cache。根应用 release version 与 deployment-only metadata 不进入行为 identity，而 source、public asset、qualification config、runtime、test/shared-helper、Git mode/type 或环境合同变化都会生成新 key。禁止通过 tracked receipt、evidence、digest compatibility 或 waiver 文件维护复用状态。exact dev Release PR 只聚合 static/full 非浏览器 gate，并生成绑定 main baseline、dev base/head/tree、version、PR、run attempt 与 artifact 的独立 release proof。

显式 production-readiness command 可以读取 ignored `.local/**` 或其他外部 authenticated evidence，并严格验证当前 backend、route contract、原始 `pnpm-lock.yaml`、`pnpm-workspace.yaml` 安装策略、runtime assets、test/source digest 与 cleanup closure。该 operator-only 证据不替代非浏览器 release proof，也不得复制进 source branch。计划中的 assertion 文案或匿名重定向只能证明其声明的 access boundary，不能冒充已登录页面内部本地化证据。

---

## 6. 证据与检查点

### 6.1 tracked 紧凑证据

建议只跟踪：

- locale contract/registry；
- content-language registry 与全语言 capability matrix/digest；
- reference-resource manifests、官方来源/授权记录、结构摘要和语言 overlay coverage/digest；
- source manifest digest；
- shared dynamic-family registry；
- route-view coverage manifest/digest；
- semantic E2E evidence schema、route-view proof contract 和外部 artifact 路径策略；
- glossary/style guide/context override；
- context-completeness schema 和自动检查结果摘要；
- existing-translation correction ledger；
- target quality manifest；
- runtime activation manifest；
- 精确 CI-safe check commands。

不得为每种语言复制多个巨大、同义的 context ledger 或 review rendering。完整 dossier 可以根据固定 source SHA 和紧凑输入按需本地生成。

### 6.2 local checkpoint

`.local/i18n/<canonical-locale>/checkpoint.json` 至少包含：

- schema version、locale、Issue；
- source SHA/manifest digest；
- capability matrix digest；
- reference-resource edition/structure/overlay digests；
- route-view coverage digest；
- semantic E2E evidence/contract/test/source digest 与 `created/cleaned/leaked` 计数；
- context/glossary/style digest；
- translated catalog digest；
- correction ledger digest；
- activation digest；
- delivery SHA/tree/version；
- completed checkpoints；
- feature/promote/root PR；
- main/tag/deployment/root target SHA。

它不包含人工翻译审批状态，因为本 Goal 没有该状态。

### 6.3 续跑检查点

| 检查点 | 完成证据 | 失效时只重做 |
| --- | --- | --- |
| C0 输入/契约 | 参数、registry/capability decision digest、三个 owner Issues | 契约影响范围 |
| C1 source/context | source SHA、message inventory、route-view matrix、参考资源 edition/source/structure digest、context schema/digest | source/route/resource delta/context 闭包 |
| C2 autonomous catalog | target catalog/reference overlay digest、零 blocked、100% resource coverage、quality report | 变化 message/resource/rule 闭包 |
| C3 existing-locale repair | 全语言 capability audit、correction ledger/resource repair digest | 新发现或变化闭包 |
| C4 runtime activation | activation manifest、capability/reference-data gates、50-ID semantic E2E closure、focused proof | 运行时影响范围 |
| C5 delivery freeze | immutable SHA、clean proof、full gate | 受控 tracked 变化 |
| C6 dev delivery | 三个 feature PR/dev merge SHAs | 远端实际未完成阶段 |
| C7 release candidate | promote PR/version/batch digest | 变化的线上候选 |
| C8 online release | final confirmation tuple、main/tag/run/smoke | 失败 job 或新 patch |
| C9 workspace closeout | root PR/pointer/Project/workspace state | 未完成的收尾范围 |

恢复时验证 SHA/digest，从第一个失效点继续。不得因跨会话、远端分支移动或心理上的“再确认”从头翻译。

---

## 7. 执行阶段

三个 Next Issue 共同实现本 Goal，默认依赖为“语言平台化 -> 分类资源本地化 -> 页面清扫与最终 E2E”；分类官方来源研究和页面 inventory 可以提前并行：

- 阶段 A/B/F 中的 registries、能力矩阵、resolver、缓存派生和反硬编码门禁属于“语言平台化”Issue；
- 阶段 A/C/D/F 中的来源冻结、Manifest、overlay、加载与缓存验证属于“分类资源本地化”Issue；
- 阶段 C/E/G 中的全语言页面 inventory、修复、布局和浏览器证明属于“页面清扫与 E2E”Issue；
- 阶段 H–K 汇总三个 Issue 的不可变交付候选。三个 Issue/PR 全部完成前，Project 协调项不得完成。

### 阶段 A：只读预检、去重和基线冻结

1. 读取 workspace/Next 当前 `AGENTS.md`、Docpact config、分支契约、local lifecycle、Next build/release workflow。
2. 从当前 registry、依赖和 workflow 补齐第 1 节技术输入，执行 C0。
3. 检查根与 Next 的 branch、HEAD、remote、status、submodule；保留全部用户 dirty/untracked 内容。
4. fetch/prune 后查询同 locale/同 scope 的 Project、三个 owner Issues、branch、PR、version、tag、release、deployment 和 root integration。
5. 去重键按阶段补齐，最终为 `(activeLocaleSet, issueSet, sourceSha, catalogDigest, referenceDigest, deliveryTree, version, rootTargetSha)`。
6. 优先级为 `merged delivery > canonical open PR > 同 Issue remote branch > new work`；同一版本只能有一个 release owner。
7. 根据当前 branch contract 确认 feature base、routine PR target、promote 和 root integration 路径。
8. 检查当前 Node、lockfile、Ant Design、Umi、Day.js；按 workspace 规则只查询一次当前版本官方 adapter 文档。
9. pin source SHA、全部 active locale 的 catalog/内容能力 inventory，以及参考资源 edition/source/structure inventory，不让浮动 `origin/dev` 反复重写基线。
10. 创建或复用并交叉链接“语言平台化、分类资源本地化、页面清扫与 E2E”三个 Issue，按 Project workflow 分类；实现开始时更新相应状态，不请求人工开始确认。

阶段输出：唯一任务记录、基线 SHA/digest、分支/发布模型、已完成检查点和去重结果。

### 阶段 B：共享 i18n 能力最小通用化

1. 按第 5.3 节建立 UI locale、内容语言和参考资源三个 typed source of truth，以及派生 capability matrix/resolvers。
2. 让语言选项、显示名称、分类/地点 resolver、缓存清单、locale audit/tests 从 registry/Manifest 发现语言和资源，不再硬编码当前语言或 German 路径。
3. 提取所有语言实际复用的 manifest、context、quality、reference-data 和 activation 公共能力，并启用第 5.10 节门禁。
4. 在阶段 C/E 可能产生任何 German 修订前，完成第 5.5 节的验证边界迁移：历史 checker 只验证 frozen snapshot，post-baseline active German 走自动 correction overlay/gate。
5. 更新 `AGENTS.md`、`docs/agents/repo-validation.md`、scripts 和 tests，使当前 active German copy 不再因为 correction 变化要求新的 private human confirmation。
6. 证明 registry 中全部 active locale 的 context/quality/capability/reference-data/activation 命令都可参数化执行且不读取 `.local/**confirmation*`；历史 checker 只能在 frozen-snapshot 模式中使用。
7. 不修改 prepush receipt、Jest/coverage worker 或 hook，除非有独立最小复现证明当前实现失败。
8. 默认零新增 npm dependency；若实现需要未在 Goal 启动时精确批准的新依赖，按 repo 治理报告外部阻塞，不临时增加第二个人工确认点。
9. 若启动时已精确批准依赖，按 workspace 规则核验与当前技术栈兼容的最新稳定版本，并在最终 diff 中证明只增加批准清单内的 package/version。

阶段输出：可配置的 locale/审计基础，现有语言 focused tests 通过。

### 阶段 C：构建跨语言上下文和质量基线

1. 生成全量 message inventory、module topology、spread order、ICU/token 签名和 dynamic families。
2. 从 routes、redirect、页面导航和 URL/交互状态分支生成第 2.5 节的 route-view coverage matrix；观察基线必须明确包含 `/`、`/welcome` 和 `/welcome?view=carbon-footprint` 的现有 access context、匿名登录重定向与已登录内容状态。
3. 对每个 route/view state 收集 locale keys、组件内对象/数组/常量、JSX literal、静态 metadata、媒体/错误/fallback 和辅助技术文案，证明没有只按 key inventory 才会漏掉的来源。
4. 对每条消息和非标准 catalog content unit 收集 English、Chinese、German 和所有其他现有语言译文。
5. 建立 callsite/dynamic producer、UI role、状态转换、用户后果和相邻文案索引。
6. 建立 LCA/TIDAS/ILCD glossary、目标语言 style guide、technical token allowlist。
7. 建立 term/rule usage index、fallback contract；RTL 时建立 RTL matrix。
8. 为每个必需参考资源冻结 edition/source/license/structure digest，核验同版官方译本并生成全部 active locale 的 source/coverage matrix。
9. 发现 source locale、内容能力或参考资源自身问题时，只有证据明确才直接修复；catalog audit 干净不代表跳过其他能力审计。
10. 标记并通过进一步研究消除 `BLOCKED_CONTEXT`；缺失 route/view/reference coverage 同样视为上下文未完成。

阶段输出：上下文完备 message inventory、route-view coverage matrix、glossary/style、usage index、fallback/RTL contract 和 source digest。

### 阶段 D：自主完成目标语言全目录

1. 按用户任务/功能模块把 leaf modules 和 route/view states 分成互不重叠 owner lanes。
2. 基于完整 dossier 翻译；不得按字母顺序或孤立 message ID 盲目批量直翻。
3. 同时翻译标准 locale modules 和 route-view matrix 中发现的组件本地/静态 content；`/welcome` overview 与 `/welcome?view=carbon-footprint` guide 必须各自覆盖完整可见状态。
4. 优先把组件本地语言 map 收敛到 locale catalog；确需保留的 typed content source 必须接入 registry、目标 locale 和相同 audit，禁止无声明 fallback。
5. 同时完成目标语言的内容语言能力和必需 reference overlays；没有同版官方译本时立即进入项目翻译，不得等待或改用英文完成。
6. 每个 batch 运行 exact key、ICU、token、glossary、context、dynamic-family、route-view、resource structure 和 coverage checks。
7. 高风险 batch 由不同自动化 reviewer 做独立证据复核；分歧回到 callsite/术语证据解决。
8. 交叉检查相邻状态、成功/失败、按钮/标题、单复数、页面不同 view、资源标签和模块间术语。
9. source baseline 之后的新消息、静态内容、route/view state 或参考资源形成自动 delta，只翻译和验证变化闭包。
10. 达到第 3.3 节全部自动质量门槛。

本阶段没有 Pilot、人工确认单、全目录批准或 delta 批准。

阶段输出：完整目标 locale、零 blocked、quality manifest 和 batch validation summary。

### 阶段 E：全 active locale 持续修订

1. 对 registry 动态发现的全部 active locale 运行相同 catalog、content、reference-resource、fallback、route/view 和 activation 审计；不得豁免此前上线的语言。
2. 按第 4.2 节判断是否证据明确。
3. 对明确问题直接修改对应 Chinese/German/French/English/其他 locale，包括分类/地点缺译、ID 集合或来源状态错误；German post-baseline change 必须写入第 5.5 节的自动 correction overlay，不得回到 private human delta review。
4. 通过 usage index 计算并修订受影响闭包。
5. 运行该 locale/模块 focused checks 和 cross-locale audit。
6. 更新 correction ledger；不创建人工审核任务。
7. 对证据不足、不会阻断目标语言的疑点保持原值并记录非阻塞候选，避免主观 churn。

阶段输出：已修复的历史翻译问题、correction ledger、跨语言一致性结果。

### 阶段 F：运行时激活

1. 增加顶层 locale entry 和所有 leaf modules，镜像当前规范 topology/spread order；同时接入 route-view matrix 中所有非标准 catalog content source。
2. 将目标语言加入对应 registries/Manifest，接入 Umi、Ant Design、Day.js、Intl、storage、内容读写、service runtime 和参考资源 resolver。
3. 所有 `xx`/`xx-*`/underscore/POSIX aliases 归一到唯一 canonical locale。
4. 接入 docs/legal/content/service/classification/location/import/export/environment fallback contract。
5. 所有共享 selector 复用 Umi 原生 locale icon，按“国旗 + native label”显示；只规范化 label/顺序/支持范围，不删除 icon 或引入自定义国旗实现。
6. 验证浏览器首选、旧缓存迁移、切换、刷新、未知 locale fallback。
7. 在有效会话下，对直接打开和语言切换后的 `/welcome`、`/welcome?view=carbon-footprint` 及所有发现的受保护静态 view 验证 URL/view state 保持、文案切换和零未声明 fallback；匿名访问同一入口只验证跳登录且不渲染受保护内容。
8. RTL 时完成 direction、logical layout、portal 和 bidi 接入。
9. 只有 capability matrix 中 required cells 全部达到目标状态，且全部 active locale 的共用 gates 通过，才允许激活；在 activation manifest 记录精确 CI-safe structure/capability/reference-data/route-view/focused clean commands。

阶段输出：运行时可用的新语言、明确 fallback、Umi 原生国旗 selector、现有语言无回归。

### 阶段 G：迭代期精准验证

内容仍变化时只执行受影响证明：

- locale/context/quality/correction audit；
- 全部 registry locale 的 capability/reference-data/hardcoding audit；
- route-view coverage audit，覆盖所有 route/static path、redirect、query/hash/path/交互状态及其现有 access context；
- runtimeLocale、formatting、storage、docs/data fallback tests；
- selector、Header、login/welcome、import report 和受影响组件 tests；
- 内容语言下拉/详情语言名、分类/地点下拉、筛选、详情显示、切换、刷新和缓存升级 tests；
- 受影响文件 lint/type checks；
- 必要的一次 production build；
- 匿名登录流程和一个代表性已登录 shared Header browser smoke；匿名访问 `/`、`/welcome`、`/welcome?view=carbon-footprint` 及代表性未匹配/大小写变体路径时，必须逐项证明跳转 canonical login 且未挂载受保护内容；
- 在有效会话下，对 Welcome overview 与 carbon-footprint guide 验证标题、正文、动作、步骤/schema、modal、媒体 loading/error/fallback、语言切换及带 query 刷新；
- 对 route-view matrix 发现的其他静态页面执行同级 focused browser proof，不能只验证示例 URL；浏览器矩阵从 registry 遍历全部 active locale，而不是只测本次目标语言；
- 以 `pnpm test:e2e:i18n` 执行 `playwright.config.ts` 与 `tests/e2e/i18n/**`：Chromium 覆盖全部 58 个稳定 assertion ID，Chromium/Firefox/WebKit 共同覆盖关键登录/selector、team authoring 和 process lifecycle 场景；除全局 candidate rendered probe 外，每个新登录 page/context 必须通过共享 route-ready marker 完成有界等待，保留 `failOnFlakyTests`，禁止 fixed sleep、全局 action timeout 放宽或重跑碰运气；
- 日常 PR/`dev` push 不自动触发 semantic browser E2E；按风险在业务 PR 仍开放时通过 `workflow_dispatch` 对其分支或 exact SHA 运行无生产凭据、无写入的 hermetic qualification，覆盖 Chromium 全矩阵及 Firefox/WebKit 关键场景；该证明不参与 release proof；完整已登录 proof 只允许明确授权的本地 operator session，并对 local `pnpm start:main` candidate + production backend 设置 authenticated mode、两个 production-write guards 和 verified-evidence opt-in；
- 生产数据仅创建 UUID-scoped `codex-e2e` tuple；create 前写 intent ledger，delete 前验证 production row UUID、authenticated owner 和五个 multilingual fields × 全部 registry authoring languages 的 exact marker closure，随后精确清理并证明 `created=cleaned`、`leaked=0`；禁止 screenshot/trace/video/auth artifact；
- Header 的 Umi `SelectLang` 以 `reload={false}` 在同 document 内切换；验证 document identity/URL 保持、mounted reference label 刷新，以及延迟旧 locale 响应不会覆盖当前 locale；
- semantic evidence 必须绑定 route contract、50-ID/required-scenario closure、registry locale/browser 集合及 source/test digests；新增 registry locale、可执行依赖 lock 或任一其他绑定输入变化后旧证据自动失效；仅根应用 release version metadata 变化且原始 evidence lock 可从记录 commit 验真、确定性依赖投影完全相同时不失效；
- 只有真实角色条件分支才扩大角色 smoke；共享路径不重复 Member/Reviewer/Admin；
- 原生国旗 selector、长文案、明暗主题、窄屏和 RTL 条件 visual smoke。

Umi/Jest/coverage/build 共享 `.umi-test`，必须串行。只读上下文研究和互斥 leaf module 翻译可并行。

阶段输出：focused proof、完整 route-view browser smoke、自动质量问题清零。

### 阶段 H：冻结业务候选、clean proof 和一次本地最终门禁

1. 再次检查竞争 PR、version、tag、release、release owner 和 root integration。
2. 冻结 locale、全语言能力矩阵、参考资源 source/edition/structure/overlay digests、hardcoding audit、已有语言修订、runtime、tests、docs 和 manifests。
3. 选择/确认唯一 package version，但此阶段不手工修改；最终 version bump 由阶段 I 的确定性 `release:to-dev` 命令一次完成。
4. 最后一次生成 source/route-view/quality/correction/capability/reference-resource/activation manifests；semantic evidence reporter 直接写 repository-canonical JSON，随后用一次 `pnpm i18n:locale:artifacts:write` 按 `context -> structuralValidation -> quality -> activation` 生成全部 registry locale 摘要，并运行 `pnpm i18n:locale:artifacts:idempotence` 证明连续两次生成保持精确 Git diff 不变；在明确授权的本地 operator session 中以 authenticated mode、两个 production-write guards 和 verified-evidence opt-in 执行 semantic E2E closure，生成不含凭据的 digest-bound evidence，证明 candidate/backend target、50-ID/registry/browser closure、create intent、pre-delete UUID/owner/五字段全语言 marker attestation 与 `created=cleaned`、`leaked=0`；运行 exact focused checks，随后运行 `pnpm i18n:locale:all:production:check`，任何 owned blocker、证据漂移或数据泄漏都必须使本阶段失败，不得进入 `release:to-dev`。
5. 提交干净、不可变 delivery HEAD，不夹带其他 repo/submodule 改动。
6. 在该 SHA 的 fresh detached worktree/clone：
   - 使用当前受支持 Node；
   - `pnpm install --frozen-lockfile`；
   - 断言目标新 locale 没有创建、读取或依赖任何人工 translation review 文件；
   - 历史 German frozen confirmation 兼容逻辑可以仍在仓库中，但不得成为本次新语言或 clean runner 的输入；
   - 审计 activation/full-gate 命令依赖图，确保不读取 `.local/**confirmation*`；
   - 运行 `pnpm i18n:audit`；
   - 运行 activation manifest 记录的 CI-safe checks；
   - 确认输出不依赖人工批准；
   - 不运行第二套完整 coverage。
7. 使用受控 push 让 hook 执行该 HEAD 唯一一次本地 full gate：

```bash
pnpm push:checked <正常 git push 参数>
```

8. 若门禁成功但 Git transport 失败，只执行：

```bash
pnpm push:retry
```

9. 只有受控 tracked 输入、依赖、Node/toolchain 或 gate config 改变，才为新 HEAD 再跑一次。Project/Issue 文本、只读检查和 tree-identical merge 不使其失效。

阶段输出：delivery SHA、clean proof、一次业务交付本地 full gate 和成功 push。后续纯 version/Docpact release commit 不重复该本地 full gate。

### 阶段 I：feature PR 到 dev，全程自主

1. 按依赖顺序为三个 owner Issues 创建/更新 feature PR 到当前 routine target（观察模型通常是 `dev`），每个 PR 关闭对应 Issue；必要的来源研究和 inventory 可以并行，但最终 E2E 依赖平台与资源 PR。
2. PR 分别说明语言平台、参考资源、页面/E2E 的边界，并共同覆盖目标 locale、全语言能力矩阵、context contract、自动质量模型、已有语言修订、runtime/fallback、验证和回滚。
3. CI、自动化 review 或已有 code review feedback 发现问题时在同一分支自主修复；只重跑受影响 proof，tracked HEAD 变化后按阶段 H 处理。不得主动建立额外 human PR approval gate；如果未来 branch protection 强制人工批准且无法绕过，应作为外部治理阻塞报告，不能弱化保护规则。
   - semantic E2E remote policy：PR、`dev` push 不自动运行浏览器矩阵；在业务 PR 仍开放时按风险通过 `workflow_dispatch` 手动运行始终无生产凭据且不写数据的 hermetic qualification；release SHA 不强制调用；完整 production-backend 已登录闭包只使用明确授权的本地 operator session，不能把用户凭据或生产写权限放入任何 semantic E2E GitHub job。
4. 三个 PR required checks 通过后，在最终页面/E2E 业务 PR 仍开放时手动运行 hermetic browser qualification；若失败就在该 PR 修复并重跑。通过后按依赖顺序自主合并到 `dev`，不请求翻译或合并确认。
5. 执行 dev smoke；匿名态覆盖登录流程和受保护入口跳登录，已登录态完整覆盖 route-view matrix，特别是 `/welcome` 与 `/welcome?view=carbon-footprint`；若角色走同一 selector 代码路径，只做代表性 smoke。
6. 枚举完整 `dev...main` commits/paths/batch members，确认版本/tag/release 唯一。
7. 确认阶段 4 的 browser evidence 决策和结果已经记录，随后用 `release:to-dev --apply` 创建唯一确定性 version PR 到 `dev`。该命令的 restricted push 只跑 Docpact 与 static preflight；exact dev Release PR 必须完成一次非浏览器 static/full gate 并生成 release proof，不运行或要求浏览器 E2E。
8. dev Release PR 合并后，用 `release:promote-dev-to-main --apply` 创建唯一 immutable promote PR。其本地 push 与 `Main Candidate / Release Gate` 只验证 exact dev release proof、main/dev lineage 和 tree identity，不重跑 candidate acceptance 或浏览器 E2E。
9. 重新审计 production-effective action：若 promote merge 会直接上线，停在其合并前进入阶段 J；若 promote merge 已不再上线，则自主合并到 `main`，继续完成所有非生产生效准备，只在真实 deploy/promote/publish 动作前进入阶段 J。

阶段输出：feature PR/dev SHA、dev smoke、promote/main 当前状态，以及紧邻真实 production-effective action 的精确 release candidate tuple。

### 阶段 J：唯一人工节点——最终线上发布确认

当且仅当以下条件全部满足时，向用户请求一次最终发布确认：

- dev Release PR 的非浏览器 release proof 已通过，且 promote PR 的 proof/identity required check 已通过；
- version、promote SHA/tree 和完整 batch digest 已冻结；
- 业务 delivery HEAD 的本地 final gate、clean proof、适用时的手动 browser evidence 与 exact dev candidate release proof 已通过；
- 自动翻译质量门槛、全部 active locale capability/reference-data/hardcoding audit、已有语言 correction audit、runtime/browser smoke 已通过；
- canonical workflow 自动副作用和 Release 终态已确认；
- production target、rollback target/runbook 已明确。

确认必须紧邻 `<PRODUCTION_EFFECTIVE_ACTION>` 之前。按当前观察 workflow，该动作是合并已就绪的 `dev -> main` promote PR；如果 workflow 已变化，则以只读审计得到的真实 production-effective action 为准，之前所有非生产生效步骤继续自主推进。

提供简短摘要：

```markdown
- 版本：<VERSION>
- Promote PR / SHA：<URL> / <SHA>
- dev...main 批次：<DIGEST + MEMBERS>
- 新语言：<LOCALE + MESSAGE/MODULE COUNT>
- 全语言能力/参考资源：<ACTIVE LOCALES + REQUIRED CELLS + RESOURCE COVERAGE/DIGEST>
- 路由/静态视图：<ROUTE/VIEW COUNT + ACCESS-CONTEXT PROOF + 已登录 `/welcome`/`carbon-footprint` PROOF>
- 自动修订已有译文：<COUNT + LOCALES + CATEGORIES>
- 验证：<LOCAL GATE / CLEAN PROOF / CI / SMOKE>
- 发布副作用：<TAG / RELEASE GATE / WEB / DRAFT ASSETS>
- 线上生效动作：<PRODUCTION_EFFECTIVE_ACTION>
- 生产目标：<URL/PROJECT>
- 回滚：<TARGET / RUNBOOK OR NOT_AVAILABLE>
- 问题：是否确认发布以上精确线上候选？
```

不得在此要求用户逐条审核翻译。用户只确认“是否把这个已自动验证的精确候选发布上线”。

阶段输出：绑定 release tuple 的一次确认，或停在 production-effective action 尚未执行的安全状态（当前 workflow 为未合并 promote PR）。

### 阶段 K：确认后的发布、生产和根集成

最终发布确认后不再请求其他正常确认：

1. 执行已确认的 production-effective action。按当前观察 workflow，即合并 promote PR 到 `main`；canonical workflow 验证 exact dev candidate release proof 后创建 tag，并继续 Web/Draft Release workflow，不再重复 static/full acceptance，也不运行浏览器 E2E。若 workflow 已变化，执行阶段 J 绑定的真实动作。
2. 监控全部 jobs 到终态。业务 delivery HEAD 的本地 gate、适用时的业务 PR 手动 browser evidence 与 exact dev Release PR 非浏览器 gate 是保留边界；main-target PR 和 post-merge main 只做 proof/identity verification。
3. 同一 SHA 的瞬时 cache/network/job 失败只重跑失败 job；不重跑已成功 Gate/资产 job。
4. 若需要 tracked 修复或新 patch，回到受影响检查点并为新的线上候选再次执行阶段 J。
5. tag 一旦创建不可移动或复用。
6. 验证 Web 生产部署、当前 release matrix、Electron/其他资产以及 Draft/Published 实际状态。
7. 在生产对全部 active locale 执行语言选择、内容语言读写/显示、分类/地点显示、持久化、formatting、fallback 和 Umi 原生国旗 selector smoke；匿名态验证登录流程及受保护入口跳转 canonical login，已登录态按冻结的 route-view matrix 逐项验证 route/static view，至少包含 `/` redirect、`/welcome` overview、`/welcome?view=carbon-footprint` guide 及其关键正常/加载/失败/fallback 状态。
8. 生产关键回归时暂停根集成；有批准 runbook 就按预先定义流程执行并验证，没有 runbook 则交给 rollback owner，不自行猜测平台操作。
9. 生产通过后，检查现有 root integration batch，复用已包含 exact Next main SHA 的 PR。
10. 根 repo 只 pin Next `main` 精确发布 SHA，完成 pointer validation、PR/merge、Project 收口。
11. 常规 dev→main tree-identical promote 不做无意义 main→dev backmerge；只有 main hotfix/实际分叉才回合并。
12. 清理已合并分支和本任务临时文件，同步 Next/root，保留用户无关 dirty/untracked 内容。

阶段输出：main/tag/release/deployment/production smoke、root pointer、Project 终态和本地同步结果。

---

## 8. 验证与失效矩阵

| 变化 | 当下最小动作 | 人工翻译审核 | 本地 full gate | 最终发布确认 |
| --- | --- | --- | --- | --- |
| 未冻结目标候选变化 | batch context/ICU/token/term check | 永不需要 | 不跑 | 不涉及 |
| 新增 source message | 自动翻译 source delta + context closure | 永不需要 | 冻结后一次 | 候选 tuple 尚未确认则不涉及 |
| canonical English/Chinese 语义变化 | 重算受影响 message 的跨 locale context/translation 闭包 | 永不需要 | 冻结后一次 | 若 tuple 已确认则失效 |
| 已有译文明确定错误 | correction dossier + affected locale checks | 永不需要 | 冻结后一次 | 确认前纳入 tuple |
| glossary/style/context rule 变化 | usage index 求跨 locale 闭包 | 永不需要 | 冻结后一次 | 若 tuple 已确认则失效 |
| route/static view、access context、query view 或组件本地文案变化 | 更新 route-view matrix + 认证边界 proof + 受影响状态翻译/浏览器 proof | 永不需要 | 冻结后一次 | 若 tuple 已确认且 tracked tree 变化则失效 |
| registry/content capability 变化 | 重算全部 active locale 能力闭包、参数化 proof 和 hardcoding audit；旧 semantic E2E evidence 自动失效 | 永不需要 | 冻结后一次 | 若 tuple 已确认则失效 |
| Playwright config/spec、50-ID route contract、source/test digest 或 ledger 规则变化 | 重跑无凭据 browser scope，再在明确授权的本地 operator session 中以 authenticated mode、两个 write guards 和 evidence opt-in 执行完整 closure | 永不需要 | tracked HEAD 变化则一次 | 若 tuple 已确认则失效 |
| 仅 root release version metadata 变化 | restricted release-candidate push 跑 Docpact/static preflight；dev Release PR 生成非浏览器 release proof | 永不需要 | 本地不跑；dev full gate 一次 | browser evidence 不失效；release proof 仍绑定 exact candidate |
| 参考资源 edition/source/overlay 变化 | 重算结构、来源、授权、全语言覆盖、缓存和消费端 proof | 永不需要 | 冻结后一次 | 若 tuple 已确认则失效 |
| runtime/selector/fallback 变化 | focused tests + browser smoke | 永不需要 | 冻结后一次 | 若 tuple 已确认则失效 |
| package version/promote tree/batch/production-effective action 变化 | version/batch/workflow consistency + proof identity | 永不需要 | version/promotion 本地不跑；若 identity 改变则新 dev non-browser gate | 已有确认失效，发布前重确认一次 |
| Issue/PR/Project 文本变化 | 远端状态核验 | 永不需要 | 不跑 | 不失效 |
| 门禁成功、transport 失败 | `pnpm push:retry` | 永不需要 | 不重跑 | 不失效 |
| 同 SHA release job 瞬时失败 | 只重跑失败 job | 永不需要 | 不重跑 | 不失效 |
| tag 后 tracked 修复/新 patch | 受影响检查点 + 新版本 | 永不需要 | 新 HEAD 一次 | 新候选重确认一次 |
| tree-identical merge | 核对 tree/CI | 永不需要 | 不重跑 | 不失效 |
| root pointer 集成 | exact child main SHA validation | 永不需要 | Next gate 不重跑 | 发布后不再确认 |

正常 broad-gate 预算：迭代期 0 次；真实业务 delivery HEAD 的本地受管 full gate 1 次；适用时在开放业务 PR 上手动 hermetic browser qualification 1 次；exact dev Release PR clean-runner 非浏览器 gate 1 次；main-target PR 与 `main` exact-release 的 full gate 均为 0 次，只验证 proof/identity。若本次工作仅创建确定性 version/Docpact release commit，则它自身的本地 broad gate 和 browser gate 均为 0 次。显式 tag/`workflow_dispatch` recovery 可额外执行一次 fresh 非浏览器 gate，但不属于正常路径。

---

## 9. 明确禁止的流程与重复工作

- 不创建任何 Pilot、catalog 或 delta 人工翻译审批。
- 不生成 ignored 人工确认 Markdown/XLSX。
- 不把“用户没有审核翻译”当作 blocker。
- 不在 feature PR、`dev` merge、promote PR 创建、根集成或清理前请求人工确认。
- 不把最终发布确认拆成 main、tag、Web、Release、资产等多轮确认。
- 不因发现已有译文错误而等待原翻译者或 reviewer 批准。
- 不依据孤立字符串机械直译，也不把其他语言的历史错误传播到新语言。
- 不把 locale key/module parity 当成 route/static view 翻译完成；必须同时审计 route-view matrix、组件内 content 和条件状态。
- 不得让 i18n Goal、route-view matrix、生成器或翻译实现新增匿名路由、放宽认证守卫、改变登录重定向或把“静态内容”解释为公开页面。
- 不只 smoke `/welcome` 基础 URL；每个 query/hash/path/交互 view 都要独立覆盖，观察基线必须包含 `?view=carbon-footprint`。
- 不为新语言复制 German 专用 reviewer、script、manifest 和巨型派生资产。
- 不把旧版本或相近分类的官方译文直接当成当前版本官方译文，也不把项目译文标记为 `official`。
- 不用 English fallback、空字符串或 `-` 掩盖 required 分类/地点译文缺失。
- 不在 registries/Manifest/adapter allowlist 外写语言码判断、固定语言数组、固定资源 map 或缓存文件表。
- 不只检查目标语言；所有 active locale 必须经过同一 catalog、capability、reference-resource、页面和 activation 审计。
- 不因当前 UI catalog audit 干净而跳过 English/Chinese/German/French 或未来语言的其他能力审计。
- 不把 planned browser assertion、匿名重定向或手工编辑的 JSON 当作 semantic execution evidence；必须通过 58 个稳定 ID 的 digest/closure 校验。
- 不给任何 semantic E2E GitHub Actions event（包括 `workflow_dispatch`）注入生产凭据或授权生产写入；完整写入测试只在明确授权的本地 operator session 中设置 `E2E_AUTHENTICATED=true`、两个 production-write guards 和独立 verified-evidence opt-in。
- 不在 create intent ledger 持久化之前写生产，不创建非 `codex-e2e` 或非 UUID-scoped 测试数据，不在 delete 前缺少 production row UUID + authenticated owner + 五字段全 registry authoring-language exact marker 校验时删除，不按名称模糊清理，不在 `leaked>0` 时继续创建，也不保存/上传 screenshot、trace、video 或 auth state。
- 不手工跑 `prepush:gate` 后立即让 push hook 再跑一遍。
- 不在成功门禁后的 transport failure 中重跑测试。
- 不并发执行共享 `.umi-test` 的 Umi/Jest/coverage/build。
- 不在冻结前反复 bump version。
- 不创建竞争版本 PR、release owner 或 root integration PR。
- 不删除或用 CSS 隐藏 Umi locale icon，也不以自定义图片、SVG、地球图标或第二套 emoji 映射替代原生国旗。
- 不只断言 locale key 或 label 就宣称选择器完成；必须验证真实可见的“国旗 + 原生名称”、稳定顺序和 action frame 对齐。
- 不只 smoke 一个 selector 入口；至少覆盖匿名登录流程和代表性已登录共享路径。
- 不硬编码历史 German 消息、模块、Pilot 或资产数量。
- 不移动 immutable tag、不 force-push protected branch、不破坏用户本地内容。

---

## 10. 停止与恢复规则

### 10.1 不应停止的情况

以下情况不得暂停等待人工确认：

- 目标语言 batch 完成；
- 发现并修复已有译文错误；
- glossary/style 自动收敛；
- feature PR 准备、CI 通过或 dev 可合并；
- promote PR 创建；
- root integration 准备；
- ignored/local checkpoint 更新；
- 同一 SHA 的网络、缓存或 job 瞬时失败。

### 10.2 唯一正常暂停点

阶段 J 的最终线上发布确认是唯一正常暂停点。它只确认精确 release tuple 是否上线，不审核翻译内容。

### 10.3 异常阻塞

以下不是“人工确认流程”，但可能造成真实阻塞：

- 新语言必需消息的产品语义在穷尽代码、现有语言、标准和运行时证据后仍不可判定；
- 参考资源准确 edition、稳定 ID 语义、官方来源或授权在穷尽证据后仍无法安全确定；“没有官方翻译”本身不是 blocker，必须进入项目翻译路径；
- CI/发布连续三次同类失败且无清晰修复；
- 缺少必要 secret、生产凭据或仓库权限；
- 实现需要 Goal 启动时未精确批准的新 npm dependency；
- German active validation 无法从人工 delta gate 迁移到 frozen-history + automated correction gate；
- 分支/版本/tag/release/root pointer 存在无法安全判定的竞争状态；
- 生产 smoke 发现关键回归且没有可执行 rollback runbook；
- 工作会覆盖用户现有改动，无法安全隔离；
- 需要扩展到本 Goal 之外的 repo 业务逻辑或破坏性操作。

阻塞时报告证据和唯一缺口，不通过请求“请审核这条翻译”来规避自主判断。恢复后从 C0–C9 第一个失效检查点继续。

---

## 11. 最终验收标准

### 11.1 上下文与翻译

- [ ] 每条目标语言消息都有第 2.2 节完整 dossier。
- [ ] 每条候选都参考 canonical English、Chinese、所有现有语言和真实 callsite/dynamic producer。
- [ ] 零未解释 `BLOCKED_CONTEXT`。
- [ ] 零 missing/extra key、module/topology/spread-order mismatch。
- [ ] route-view coverage matrix 覆盖所有 route/static view、redirect、query/hash/path/交互状态和现有 access context；`/`、`/welcome`、`/welcome?view=carbon-footprint` 均有独立完整记录，且没有因此获得匿名访问。
- [ ] locale catalog、组件内对象/数组/常量、媒体/错误/fallback 和辅助技术文案均已纳入目标语言；不存在未审计的 `en`/`zh` 本地 content map 或未声明 fallback。
- [ ] 零 ICU/placeholder/tag/token mismatch。
- [ ] glossary/style/术语一致，所有高风险消息完成独立自动证据复核。
- [ ] 没有任何人工翻译审批、确认单或 reviewer gate。

### 11.2 持续质量优化

- [ ] 已从 registry 动态发现并对现有所有 locale 执行相同 catalog、content、reference-resource、fallback、route/view 和 activation 检测。
- [ ] 可明确判定的错误、遗漏和术语不一致已直接修订。
- [ ] 每个修订都有 compact correction dossier 和 focused proof。
- [ ] 规则变化已计算跨 locale 传递闭包，没有只修局部造成新不一致。
- [ ] 证据不足的主观改写未造成无意义 churn。
- [ ] German 历史 confirmation 仅保留 frozen-snapshot 语义；所有 post-baseline German 修订由自动 correction overlay/gate 验证，无新人工确认。

### 11.3 分类、地点与参考资源

- [ ] registry 中每个 active locale 都有完整 capability row，不仅检查目标语言。
- [ ] 每项 required 资源都有准确 edition、发布者、URL、授权、source digest 和 structure digest。
- [ ] 同 edition/version、同代码体系的官方译本优先；不存在时已有完整项目译本和独立自动证据复核，最终状态为 `project-reviewed`，而不是 English fallback、旧版官方标签或 `-`。
- [ ] 旧版/crosswalk 只作逐项证据，没有冒充当前版 `official`。
- [ ] 每个 active locale × required resource 为 100% resource-scoped node identity 覆盖，零空值、未知节点、代码集差异或层级/顺序漂移；重复/歧义键在构建期 fail closed，不会被全局 ID map 覆盖。
- [ ] required 分类和地点在正式环境不存在 English fallback、`-` 或空名称。
- [ ] 缓存资源列表和版本从 Manifest 派生，压缩构建可重现。
- [ ] 现有 English/Chinese/German/French 及未来 registry locale 均由同一检查器验证；观察基线中发现的任何既有语言资源差异已经修复或以确切证据裁决。

### 11.4 运行时与 UI

- [ ] 一个 canonical locale/消息包，所有 aliases 正确归一，无国家变体。
- [ ] Ant Design、Day.js、Intl、storage、content、service、reference-resource 和 environment adapter 正确。
- [ ] docs/legal/content/service/classification/location/import/export fallback contract 全部通过。
- [ ] 内容语言下拉和详情语言名称由 registry 派生，所有声明可编辑语言均可录入/显示，不再出现非中英文即 `-`。
- [ ] selector 在所有共享入口保留 Umi 原生国旗，并精确显示“国旗 + native label”；无国家/地区限定文本、地球 fallback 或自定义图片/SVG/emoji 映射。
- [ ] 登录后 Header 使用原生 Umi/ProLayout action 行为及 `SelectLang reload={false}`；匿名登录流程和已登录 Welcome 的 action frame 与相邻图标等高、对齐且可键盘操作，同 document identity/URL 保持，延迟旧 locale 参考资源响应不会覆盖当前 locale。
- [ ] 切换、刷新、浏览器首选、旧缓存、未知 locale fallback 正确。
- [ ] 有效会话下直接打开或切换语言后，所有受保护静态视图的 path/query/view state 保持不变；Welcome overview 与 carbon-footprint guide 的正常、加载、失败/fallback 和关键交互均显示目标语言；匿名访问这些入口只到 canonical login。
- [ ] 明暗主题、窄屏、长文本和 RTL 条件矩阵通过。
- [ ] 既有 locale 行为无回归，自动修订项达到预期。
- [ ] `pnpm test:e2e:i18n` 使用 `@playwright/test` `1.62.1`、`playwright.config.ts` 和 `tests/e2e/i18n/**`，local `pnpm start:main` candidate 指向 production backend 且 Playwright base URL 只允许 loopback。
- [ ] 58 个稳定 route/view assertion ID 及其 target-declared required scenarios 全部闭合；Chromium 完成全矩阵，登录/selector、team authoring 和 process lifecycle 关键场景在 Chromium/Firefox/WebKit 通过。
- [ ] locale/content-language 循环从 registries 派生；新增语言无需改业务硬编码，并会自动使旧 semantic evidence 失效。
- [ ] 日常 PR/普通 `dev` push 不自动触发浏览器矩阵；按风险在仍开放的业务 PR 上通过 `workflow_dispatch` 手动运行无凭据、无生产写的 hermetic qualification，覆盖 Chromium 全矩阵及 Firefox/WebKit 关键场景；exact dev Release PR 只运行非浏览器 static/full gate，main-target PR 与正常 post-merge main 仅验证 release proof；完整 authenticated closure 只在明确授权的本地 operator session 中以 authenticated mode、两个 production-write guards 和 verified-evidence opt-in 执行。
- [ ] 只创建 UUID-scoped `codex-e2e` 数据；create 前已写 intent ledger，delete 前已验证 production row UUID、authenticated owner 及五个 multilingual fields × 全 registry authoring languages exact markers，精确删除后 `created=cleaned`、`leaked=0`；没有 screenshot/trace/video/auth artifact。
- [ ] tracked evidence 的 schema、ID/locale/browser closure 和 cleanup counts 通过常规结构校验；显式 production readiness 对当前 backend/route/source/test bindings 全部 fail-closed 校验通过。

### 11.5 工程与发布

- [ ] 迭代期没有重复 broad gate。
- [ ] version 在冻结时只 bump 一次，release owner/tag 唯一。
- [ ] 目标新 locale 不创建或依赖任何人工审批输入；clean worktree 通过 CI-safe activation proof，命令依赖图不读取 `.local/**confirmation*`。
- [ ] 全部 active locale 的 common activation/full-gate 路径都可执行且不读取 private confirmation；Next 治理文档和测试已反映该边界。
- [ ] 语言硬编码门禁为零违规；新增语言不需要修改业务页面语言分支、固定 options 或资源文件数组。
- [ ] “语言平台化、分类资源本地化、页面清扫与 E2E”三个 Issue 及对应 PR 全部完成，并在 Project 中分类和闭合依赖。
- [ ] delivery HEAD 通过一次 `push:checked`；transport failure 只用 `push:retry`。
- [ ] feature PR 自主合并到 routine target，promote PR/候选已冻结。
- [ ] exact dev Release PR 的非浏览器 gate 已对 main/dev base、candidate head/tree/version 通过；main-target PR 的 proof/identity check 已阻断任何基线或 tree 漂移；适用的 browser evidence 已在业务 PR 阶段闭合。
- [ ] 只在最终线上发布前请求一次人工确认，且绑定 exact release tuple。
- [ ] 唯一确认紧邻真实 production-effective action；workflow 漂移时没有机械停在错误的 Git 步骤。
- [ ] 确认后 production-effective action、main proof verification、tag/Web/assets/production smoke 完成，且 tag 只在 exact dev release proof 与 main identity 验证通过后创建，未增加正常确认点、重复 full gate 或晚期 browser gate。
- [ ] root workspace 指向 Next `main` exact release SHA，Project/Issue/PR 状态完成。
- [ ] 分支/临时文件已清理，workspace 已同步，无关用户内容保留。

---

## 12. 最终报告格式

```markdown
# <TARGET_LANGUAGE_NATIVE> 最终交付报告

- 产品 locale：<CANONICAL_LOCALE>，所有 <LANGUAGE_CODE>-* aliases 归一到此
- 全语言能力矩阵：<ACTIVE LOCALES / REQUIRED CELLS / DECLARED FALLBACK CELLS / DIGEST>
- 翻译范围：<MESSAGE COUNT> 条 / <MODULE COUNT> 个模块 / 零 BLOCKED_CONTEXT
- 参考资源：<RESOURCE / EDITION / SOURCE STATUS / PER-LOCALE COVERAGE / STRUCTURE + OVERLAY DIGESTS>
- 路由/静态视图范围：<ROUTE COUNT> 条路由 / <VIEW STATE COUNT> 个状态 / <ROUTE-VIEW DIGEST>，含 access context、已登录 `/welcome` 与 `/welcome?view=carbon-footprint`
- 上下文证据：English + Chinese + <OTHER LOCALES> + callsites/dynamic families + LCA/TIDAS glossary
- 已有译文自动优化：<COUNT / LOCALES / ERROR CATEGORIES / CORRECTION DIGEST>
- 人工翻译审核：无；本 Goal 不设人工翻译审批
- package/tag：<VERSION / TAG>
- 三个交付 Issue：<LANGUAGE PLATFORM / REFERENCE LOCALIZATION / PAGE SWEEP E2E + PR/SHA>
- 硬编码门禁：<ZERO VIOLATIONS / ALLOWLIST>
- Semantic E2E：<50-ID CLOSURE / CHROMIUM FULL MATRIX / THREE-BROWSER CRITICAL / EVIDENCE DIGEST / CREATED=CLEANED, LEAKED=0>
- Next dev：<THREE FEATURE PRS / SHA>
- 最终发布确认：<CONFIRMED RELEASE TUPLE>
- 线上生效动作：<PRODUCTION_EFFECTIVE_ACTION>
- Next main：<PROMOTE PR / SHA>
- 生产：<RUN / URL / RELEASE DRAFT OR PUBLISHED / ASSET MATRIX>
- 验证：<QUALITY AUDIT / CLEAN PROOF / LOCAL GATE / CI / BROWSER / PRODUCTION SMOKE>
- 根 workspace：<INTEGRATION PR / ROOT SHA / NEXT POINTER SHA>
- workspace：<SYNCED STATE + PRESERVED UNRELATED CHANGES>
- 后续项：<NONE OR TRACKED URLS>
```

---

## 13. Reader Test

新 agent 只读本文件后必须能明确回答：

- 翻译或已有译文修订是否需要任何人工审核？
- 唯一人工确认发生在哪里，绑定哪些 release facts？
- workflow 漂移后，如何把唯一确认移动到真正使线上生效的动作之前？
- main 合并与自动非浏览器 Release Gate proof verification、门禁后 tag、Web/Draft Release 为什么仍是一个确认单元？
- 每条消息的完整 LCA 平台上下文包括什么？
- 如何在不改变认证合同的前提下，证明已登录 `/welcome`、`/welcome?view=carbon-footprint` 及其他 route/static query view 都已翻译，而不只依赖 locale key parity？
- 如何证明匿名访问受保护路由只会到 canonical login，且 i18n 证据没有成为授权来源？
- 组件内 `en`/`zh` content map、媒体失败文案和 ARIA/alt 文案如何进入同一覆盖合同？
- English、Chinese 和其他既有语言分别承担什么证据角色？
- 何时可以直接修改已有译文，何时应保持不变避免主观 churn？
- German 历史 confirmation 如何只验证 frozen snapshot，而不阻断未来自主 correction？
- glossary 变化如何传播到所有受影响 locale/message？
- 哪些步骤使用自动独立 reviewer，但不构成人工审批？
- 什么变化会使本地 full gate失效？什么变化会使最终发布确认失效？
- 同 SHA release job 失败为什么不需要重新确认？
- 如何从 C0–C9 续跑而不重译？
- Umi 原生国旗 selector、single-standard locale、fallback 和 RTL 如何验收？
- 为什么同版官方译本优先，而旧版或相关分类只能作为 crosswalk/术语证据？
- 没有官方译本时为什么必须项目翻译，而不是 English fallback？
- 如何证明所有既有 active locale 与目标语言使用同一 capability/reference/page 检查标准？
- 哪些语言事实属于 UI locale registry、content-language registry 和 reference-resource Manifest？
- 如何阻止下一种语言再次引入固定 union、下拉数组、文件 map、缓存列表和语言特判？
- 为什么新增 registry locale 会自动扩大 Playwright 期望集合并使旧 semantic evidence 失效？
- 为什么日常 PR/`dev` push 不自动运行 semantic browser E2E，而是在业务 PR 仍开放时按风险通过 `workflow_dispatch` 手动运行无凭据、无写入、预构建候选的 hermetic qualification；为什么 release stages 不消费该证明，同时 authenticated closure 必须留在明确授权的本地 operator session，并使用 authenticated mode、两个 production-write guards 与独立 evidence opt-in？
- 58 个 assertion ID、Chromium 全矩阵、三浏览器关键场景和 digest/ledger closure 如何共同防止 prose-only 或伪造浏览器证据？
- 为什么生产测试数据只能是 UUID-scoped `codex-e2e` tuple，必须 create 前写 intent、delete 前验证 UUID/owner/五字段全语言 markers，并且最终 `created=cleaned`、`leaked=0`？
- `SelectLang reload={false}` 如何让 same-document locale refresh 与旧请求 race 成为可验证合同，而不是由整页 reload 掩盖？
- 三个 Issue 如何分工、依赖并共同组成最终候选？
- 生产通过后为什么无需再次确认 root integration？

任何读者如果仍认为需要 Pilot、全目录人工批准、delta 确认、dev 合并确认或 root 集成确认，说明文档存在歧义，必须先修正。

---

## 14. Goal 完成判定

当且仅当第 11 节全部满足、三个 Issue/PR 全部完成、所有 active locale 的 capability/reference-resource/page audit 无未解决缺口、唯一最终线上发布确认已执行、阶段 K 完成并生成最终报告，Goal 才能标记为 `complete`。

如果最终发布尚未确认，Goal 保持在 C7“release candidate ready”，不能标记完成，也不能丢弃已经有效的翻译、修订、测试和 `dev` 交付证据。
