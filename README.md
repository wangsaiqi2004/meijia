# Nail Note 美甲效果预览站

在 `jimbb/chatgpt-image-portal` 的真实源码及历史上改造，使用独立的 New API 网关转发图片请求。上游说明与授权信息保留在下方；当前美甲站使用 `Dockerfile.nail` 和 `docker-compose.nail.yml`。

API 密钥只通过服务器私有配置或受保护的网关管理入口设置，不提交到仓库，也不回显到页面和日志。

## 功能

- 店老板和店员上传手部照片，选择 12 款内置图片或自传参考图，补充风格描述后生成、对比和下载。
- 默认真实沟通模式。提示词保留原手型、肤色、纹理、瑕疵、原甲型和甲长，并限制为常见美甲工艺。AI 仍可能改变细节，施工前需由美甲师确认。
- 管理员开店、停用、设置 VIP、充值、导出兑换码、维护款式库和查看店铺用量。无公开注册或在线支付。
- 整数点数、事务扣点、并发上限、幂等提交及失败/超时退款。原始上传照片默认保存 7 天，成品清除 EXIF。
- 手机、平板与桌面布局。
- 店老板可在工作台「管理款式」添加本店专属款式、移除不做的款式及恢复内置款式；本店设置不影响其他店，店员只可使用不能管理。
- 原手、成品、历史图片可点击全屏查看与缩放；放大查看采用独立高细节预览，下载仍为原始高清 PNG。

## 本地启动

需要 Node.js 24。复制 `.env.example` 到 `web/.env`，设置数据库、管理员账号和至少 12 位随机密码。所有真实凭证均不得提交。

```powershell
cd web
npm ci
npx prisma generate
$env:DATABASE_URL='file:./nail.db'
$env:NAIL_DATA_DIR='../data'
$env:ADMIN_USERNAME='nailadmin'
$env:ADMIN_PASSWORD='<自行设置的至少12位随机密码>'
New-Item -ItemType File -Path prisma/nail.db
npx prisma migrate deploy
npm run db:seed
npm run dev -- --port 19129
```

首次初始化只创建管理员和 12 个款式，避免预置公开密码。登录 `/admin` 点击“开通店铺”，填写老板账号、密码和初始点数。老板在 `/shop` 创建店员。开发环境只有显式设置 `NAIL_MOCK_IMAGES=true` 才返回演示图；生产环境缺少密钥会报错并退款。

## 生产部署

```sh
git clone --recurse-submodules https://github.com/wangsaiqi2004/meijia.git
cd meijia
cp .env.example .env
# 在服务器私有 .env 中填写随机密码、密钥与 CRON_SECRET。
install -d -o 1000 -g 1000 /www/nail-note/data
install -d /www/nail-note/gateway
docker build -f deploy/Dockerfile.gateway -t new-api-nail:rc47-codexing .
docker compose --env-file .env -f docker-compose.nail.yml build nail-app
docker compose --env-file .env -f docker-compose.nail.yml up -d nail-gateway
```

通过 SSH 隧道进入独立网关 `127.0.0.1:19126`，初始化管理员、关闭注册、添加 OpenAI 兼容渠道，配置图片模型价格并创建受限令牌。把渠道上游设为供应商地址，把站点 `IMAGE_API_BASE_URL` 设为 `http://nail-gateway:3000/v1`，`IMAGE_API_KEY` 设为网关令牌，再启动站点：

```sh
docker compose --env-file .env -f docker-compose.nail.yml up -d
```

站点仅绑定 `127.0.0.1:19125`，网关仅绑定 `127.0.0.1:19126`。`deploy/nail-note.conf` 是使用现有 Nginx 独立监听 `19127` 的示例，安装前确认端口空闲，执行 `nginx -t` 后 reload。域名和 HTTPS 由部署者配置；HTTPS 生效后将 `COOKIE_SECURE=true`。

当前供应商实际模型名为 `gpt-image-2.5-sunburst`；旧文档中的 `sunbrust` 无效。1K 为 `1024x1536`，4K 为 `2160x3840`。多图固定为手部照在前、款式图在后。New API 的供应商兼容补丁仅使该渠道使用重复 `image` 字段，其他渠道沿用上游行为。

`TEXT_MODEL` 留空时不请求施工说明；供应商当前没有可用文本模型。接入文本模型时需同时配置网关渠道、令牌模型范围和价格。

数据目录为 `/www/nail-note/data`，网关数据目录为 `/www/nail-note/gateway`。升级前备份 SQLite 数据库与图片，可使用 SQLite 在线备份接口；恢复时停站后替换数据并恢复文件属主 `1000:1000`。清理容器每分钟处理超时退款，每天清理过期会话和超过 7 天的原图。

## 验证

```powershell
cd web
$env:DATABASE_URL='file:./ledger-test.db'
New-Item -ItemType File -Path prisma/ledger-test.db
npx prisma migrate deploy
npm run test:nail
npx tsc --noEmit
npm run build
```

账务测试覆盖并发、幂等、余额不足、VIP 定价、兑换和退款。生产验收还应检查真实生图、下载、角色隔离，以及手机/平板/桌面截图。

## 来源与授权

- 界面基础：`jimbb/chatgpt-image-portal`，起点 `11062e8`，保留原 Git 历史及根目录 LICENSE。
- 网关：`QuantumNous/new-api`，子模块 `vendor/new-api` 固定 `e835b1b`（v1.0.0-rc.47）。补丁 `deploy/new-api-codexing.patch`；网关遵循其 AGPL-3.0 及 NOTICE。部署者应向网络用户提供对应源码。
- 内置款式图为本项目调用已授权图片服务生成的参考素材，出处记在 `web/public/styles/SOURCES.md`。
- API 密钥、服务器凭据、数据库、客户照片、测试截图都不进入仓库。

---

# ChatGPT Image Portal（上游说明）

Self-hosted image generation and editing portal with a browser workspace, an OpenAI-compatible API, account pools, external image providers, image history, reference sets, grid crops, masks, retries, and a managed gallery.

This is an independently maintained source fork of [jiawen-afk/chatgpt2api](https://github.com/jiawen-afk/chatgpt2api), derived from [basketikun/chatgpt2api](https://github.com/basketikun/chatgpt2api). It is not affiliated with OpenAI. Some integrations use unofficial endpoints that can change without notice. Use only accounts and content you are authorized to use and follow applicable service terms.

## Quick start

Requirements: Docker Engine and Docker Compose v2.

```sh
git clone https://github.com/OWNER/REPOSITORY.git
cd chatgpt-image-portal
cp config.example.json config.json
cp .env.example .env
docker compose up -d --build
```

In PowerShell, use `Copy-Item config.example.json config.json` and
`Copy-Item .env.example .env`. Set a long random `CHATGPT2API_AUTH_KEY` in
`.env`; never use an example value. Open `http://localhost:3000`. The default
compose binds to localhost and builds this source tree. API requests use
`Authorization: Bearer YOUR_PORTAL_KEY` at `http://localhost:3000/v1`.

See [deployment](docs/deployment.md), [features](docs/features.md), and the
[API reference](docs/api.md).

## Changes in this fork snapshot

The published source includes the complete evolved local portal snapshot,
including the uncommitted CPA and prompt-library work that was present when it
was published. The main additions over the earlier base are:

- External image-provider routing with model aliases, asynchronous polling,
  fallback ordering, keep-forever tasks, and automatic retry targets.
- Grid and per-reference workflows with crop ranges, cell previews,
  Ctrl/⌘ multi-select, compressed-image tolerance, face-aware preselection,
  reference roles/context, optional prompts, and send-count previews.
- Named reference sets, browser-local image history, image-manager prompt
  lookup, faster gallery loading, account cooldown handling, and automatic
  resume after temporary account recovery.
- CPA-backed account synchronization as an optional source of truth, including
  remote OAuth/refresh/delete operations, quota-unknown handling, token
  rotation, and an administrator-controlled image-account allowlist.
- A prompt-library page and `/api/prompts`, which groups successful task prompts
  and links them back to the image workspace.
- Traditional Chinese locale support, safer JSON persistence, download retry
  handling, and the tests and documentation needed to maintain these changes.

The exact feature history is recorded in [CHANGELOG.md](CHANGELOG.md). The
source comparison was made before publication against the evolved local
checkout; publication-only changes are documented in
[docs/fork-notes.md](docs/fork-notes.md).

## Development

Requires Python 3.13+, [uv](https://docs.astral.sh/uv/), Node.js 22+, and Bun.

```sh
cp config.example.json config.json
uv sync --frozen
uv run main.py
```

In another terminal:

```sh
cd web
bun install --frozen-lockfile
bun run dev
```

The backend listens on `127.0.0.1:8000`. Build production web files with
`bun run build`.

## Checks

```sh
uv sync --frozen
uv run python scripts/run_unit_tests.py
node --test web/test/*.cjs
cd web && bun run build && bunx tsc --noEmit
```

The selected Python suite is offline and excludes manual scripts that call a
running portal or external services. Passing it does not prove login, quota, or
real image generation.

## Privacy and security

The repository contains sanitized source and examples only. `config.json`,
`.env`, `data/`, databases, exports, build output, credentials, account data,
personal prompts, images, and local Git history are excluded. Logs and task
records can contain prompts, account identifiers, and upstream errors. Admin
exports contain credentials. Read [SECURITY.md](SECURITY.md) and
[docs/privacy.md](docs/privacy.md) before deployment.

## Layout

- `api/`: FastAPI routers
- `services/`: accounts, providers, tasks, proxy, storage, and backups
- `web/`: Next.js application
- `test/`: unit and manual integration tests
- `docs/`: deployment, API, feature, privacy, and fork notes

Contributions: [CONTRIBUTING.md](CONTRIBUTING.md). License: [MIT](LICENSE).
