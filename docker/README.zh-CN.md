# 使用 Docker 自托管 Supabase（中文）

这是 `docker` 目录的中文说明。官方自托管基础说明请参考英文文档：

- [README.md](./README.md)
- [Self-Hosting with Docker](https://supabase.com/docs/guides/self-hosting/docker)

## 项目同步流程

本项目常用两类同步：

- 同步 Edge Functions 代码
- 同步数据库结构快照 `docker/volumes/db/init/data.sql`

## 1) 同步 Edge Functions

脚本：`docker/pull-edge-functions.sh`

行为：

- 必须指定一个已经评审的完整 Edge commit SHA，不跟随会移动的 ref
- 将该 ref 解析为唯一 commit
- 用 `supabase/functions/` 对 `docker/volumes/functions/` 做可删除陈旧文件的完整镜像同步
- 在 `docker/volumes/functions/.source-revision.json` 记录仓库与解析后的 commit

执行命令：

```bash
cd /path/to/tiangong-lca-next
./docker/pull-edge-functions.sh --ref <reviewed-40-character-edge-commit>
```

只有在明确进行本地仓库或 fork 验证时才覆盖源仓库：

```bash
./docker/pull-edge-functions.sh \
  --repo /path/to/tiangong-lca-edge-functions \
  --ref <reviewed-40-character-edge-commit>
```

脚本从自身位置解析目标目录，因此可以从其他工作目录调用。同步会删除 Edge 精确版本中不存在的镜像文件；提交前必须审查完整生成 diff。

## 2) 从已评审的 Database 空库重建生成 data.sql

脚本：`docker/scripts/sync-migrations-to-data-sql.sh`

要求：

- 只使用由已评审 `database-engine` 迁移重建的隔离本地空库，不加载业务 seed、Auth 用户、OAuth 客户端、任务或数据集，不能连接生产或共享 Dev。
- `DATABASE_SOURCE_ROOT` 指向干净的 Database checkout，`DATABASE_SOURCE_COMMIT` 为已评审完整 SHA；脚本核对源码身份与数据库迁移头。
- `REMOTE_DB_URL` 保留旧变量名，但只接受 `localhost`、`127.0.0.1`、`host.docker.internal`；容器客户端通常使用最后一个地址与隔离数据库端口。远端或无效连接串会在连接前被拒绝，且不会打印凭据。

执行命令：

```bash
cd /path/to/tiangong-lca-next
DATABASE_SOURCE_ROOT=/path/to/database-engine \
DATABASE_SOURCE_COMMIT=<reviewed-40-character-database-commit> \
REMOTE_DB_URL='postgresql://postgres:<local-password>@host.docker.internal:54322/postgres' \
  ./docker/scripts/sync-migrations-to-data-sql.sh
```

仅检查（不写文件，保留相同源码环境变量）：

```bash
./docker/scripts/sync-migrations-to-data-sql.sh --check
```

脚本行为：

- 核对源库只有迁移初始目录，并把精确 commit/迁移头记录进快照
- 使用 `pg_dump --schema-only` 拉取本地完整 schema dump
- 自动执行 `docker/desensitize_data.sql.sh` 脱敏
- 保留 `api`、`private`、`public`、`util`、`archive`、`pgmq` 与必要业务扩展
- 导出三个受约束的 Database 执行角色及有效成员关系、OAuth pre-request 设置、Database 自有的 Auth 到私有用户表同步触发器与九个允许的迁移静态目录；不复制任何用户、业务行或凭据目录
- 由 `postgres` 通过 `pgmq.create` 重建两个已审核的持久化队列，再恢复 Database 自有的 embedding 可见性 fence；仅复制 `pgmq.meta` 不能创建扩展拥有的队列与归档表
- 保留撤销 PUBLIC 函数执行权的全局默认 ACL，并在恢复源码授权前清除底座更宽的 public-schema 默认授权；PG17 的仅管理创建者成员关系不会转换为 PG15 运行权限，无法安全表达的 INHERIT/SET 组合在导出前失败
- 去掉由 Supabase 底座负责的 schema/object（例如 `auth`、`extensions`、`graphql*`、`storage`、`supabase_functions`）以及明显的 PG17 dump 噪音（如 `\restrict`、`\unrestrict`、`SET transaction_timeout = 0;`）
- 写入 `docker/volumes/db/init/data.sql`

Docker 仍使用 PostgreSQL 15.8。过滤器只在表 ACL 块移除 PG17 的 `MAINTAIN` 权限标记，不授予替代权限，不修改函数体，保留权威源码的函数空白。Auth/Storage 自身迁移和 webhook 底座仍由已锁定的服务与初始化流程负责。

当前配对为 Edge `ceff9c4893e6fa9ab2b6e163c57b9d6428cbde37` 与 Database `e9888c9385356ee6df66c2910a99e29f9fa7e08c`（迁移头 `20260905170004`）。两个 Hybrid 入口向 V2 RPC 转发可见性与选定团队上下文，Process 还转发数据集类型；省略模式或显式 `latest` 的 Process/Flow 请求保留旧 RPC 参数与 Edge 阈值重试，`matched` 模式继续由 V2 数据库 RPC 回退。快照契约同时检查配对与三个执行角色。

此文件仅用于**全新安装初始化**，不是现有数据卷的升级脚本。已有安装应备份后走 Database 自身迁移流程，并在 `PGRST_DB_SCHEMAS` 中包含 `api`；不得暴露 `private`、`util` 或 `archive`。提交前运行两次生成（第二次 `--check`）、快照契约测试，并在隔离的锁定 Docker 数据库及正常 Auth 迁移上验证恢复。

默认脱敏规则：

- `"x_key":"<任意值>"` -> `"x_key":"edge-functions-key"`
- `"apikey":"sb_secret_..."` -> `"apikey":"edge-functions-key"`
- 其他 `sb_secret_*` -> `sb_secret_REDACTED`

兼容入口（已废弃）：

- `docker/scripts/sync-lca-migrations-to-data-sql.sh` 会转发到新脚本

## 外呼目标检查与已有数据库卷

`desensitize_data.sql.sh` 需要仓库要求的 Node.js 版本及 `scripts/validate-sql-egress.cjs`。默认与 `--strict` 调用都会拒绝已知官方 Production／共享 Dev HTTP 目标和旧非 FT webhook 调用模式；全部检查通过后才原子替换输出。拒绝时保留已有目标文件或原地输入，不创建备份，不输出 SQL 行和凭据值。`--strict` 额外拒绝残留的凭据模式。注释、schema 描述及仅用于拒绝／环境识别的项目标识常量保持有效。这是针对字面量和简单拼接的意外配置检查，不是任意动态 SQL、间接域名或后续配置的沙箱。

新初始化文件不会升级已有数据卷。恢复旧 dump 或重新接通旧数据库前：

1. **在 PostgreSQL／pg_net 启动前阻断该数据库的外部网络访问**，使用隔离副本或操作员控制的环境；普通 Compose 启动后再检查可能晚于排队 HTTP 的发送。
2. 只读检查触发器端点名和目标配置，不展示请求队列 headers、body 或凭据值。通过 Database owner 的迁移流程升级已有卷，不把 fresh-install 初始化文件当原地升级脚本。
3. 按数据库 owner 的流程处理旧触发器及排队请求，并配置同实例内部后端或明确拥有的自定义后端及其凭据。
4. 确认目标与 FT 路由符合预期后再恢复外部网络；保留其他服务与数据。

应用默认使用本地／自定义后端；官方 Main／共享 Dev 需要 `DEV.md` 中的显式 profile。导入数据库的 Vault 值是独立配置面。本次修改不会自动迁移或隔离已经运行的外部数据库。
