# 小小成长家

面向儿童的任务管理与卡片收藏应用。支持多个儿童账号同时登录、每日计划、三选一奖励、跨天补领、卡片图鉴与独立应用管理后台。

## 本地运行

需要 Python 3.12、uv、Node.js 24、PostgreSQL 18。当前默认连接为用户提供的 `localhost:5432/kidstodo`，用户名和密码均为 `kids`。该配置仅用于本地开发。

本次环境中5173已有其他服务，已将私有`.env`的APP_ORIGIN配置为`http://localhost:18170`，前端启动时对应使用`--port 18170`。下面命令以新环境默认5173为例，端口必须与APP_ORIGIN一致。

```bash
cp .env.example .env
cd backend
uv sync --locked
uv run alembic upgrade head
uv run python ../scripts/init_local.py
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
```

另开终端，在项目根目录执行：

```bash
nvm use 24
cd frontend
npm ci
npm run dev -- --port 5173 --strictPort
```

打开儿童应用 <http://localhost:5173>，或管理后台 <http://localhost:5173/admin/login>。

初始化工具使用随机密码创建管理员，凭据保存在项目的 `.cache/local-admin.txt`，权限为 `0600`，不会提交到 Git。工具不会覆盖已有管理员。首次进入后台后创建儿童账号，再回儿童端登录；可以继续添加其他儿童账号。

也可以手动创建管理员，密码通过安全交互输入：

```bash
cd backend
uv run python -m app.cli create-admin --username your-admin
uv run python -m app.cli seed-cards
```

上传资源统一保存在项目根目录的 `data/media`，不受启动目录影响。示例卡是程序绘制的原创几何插画，没有外部素材依赖。OpenAPI 在后端 `/docs`；静态契约保存在 `docs/openapi.json`。

## 验证

数据库并发测试必须运行在真实 PostgreSQL 上。测试会创建随机 schema 并在结束时删除，要求测试数据库账号有 CREATE 权限。不要把测试 URL 指向业务数据库。

```bash
# 启动专用、临时测试数据库；需先配置 .env
docker compose --profile test up -d test-db
cd backend
TEST_DATABASE_URL=postgresql+psycopg://kids:kids@localhost:55432/kidstodo_test uv run pytest -q
uv run ruff check app tests alembic
cd ../frontend
npm run build
npx playwright install chromium
npm run test:e2e
```

若使用本机已安装的 Chrome，可运行 `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e`。浏览器测试使用独立 schema、临时图片目录，以及 18173/18174 端口，不创建业务库测试账号。测试中出现的固定密码仅属于这些临时账号。

开发时，儿童端「奖励」页面提供「体验抽卡动效」入口。即使当天奖励已经领完，也可以用现有卡片反复预览三选一、翻转揭晓和飞入图鉴的完整动画。预览只读取卡片，不消耗奖励、不写入收藏；正式构建不显示此入口。卡片库需至少有三张可用卡片。

抽卡动效和预览入口的浏览器测试使用固定接口数据，无需测试数据库：

```bash
cd frontend
PLAYWRIGHT_CHANNEL=chrome npm run test:draw
```

今日任务已合并到日历页，左下角可切换“今日 / 日历”，底部主导航统一为日历、图鉴、奖励。原首页仍会打开日历的今日模式。

切换栏右侧的“管理”入口在两种模式下均可使用。日历中点击今天的任务可直接完成或取消完成；点击今天及未来日期的空白处可添加任务，默认选中该日期、只做一次。过去的日期保留查看记录。

模式切换、任务操作和四种尺寸的布局可单独验证，无需启动数据库；此测试使用固定接口数据，不替代真实后端回归：

```bash
cd frontend
PLAYWRIGHT_CHANNEL=chrome npm run test:layout
```

接口变更后，从项目根目录更新契约与前端类型：

```bash
backend/.venv/bin/python scripts/export_openapi.py
backend/.venv/bin/python scripts/export_database.py
cd frontend
npm run api:generate
npm run build
```

## Docker 部署

```bash
cp .env.example .env
# 修改 POSTGRES_PASSWORD 和 SECRET_KEY；随机密码使用 URL 安全字符
docker compose up --build -d
docker compose exec api python -m app.cli create-admin --username your-admin
docker compose exec api python -m app.cli seed-cards
```

默认访问 <http://localhost:8080>。Compose 内使用独立 PostgreSQL 数据卷，主机端口默认 5433，不占用本地已有的 5432 数据库。数据库和图片分别持久化到命名卷；迁移成功后才启动 API。开发时 HTTP 允许非 Secure Cookie。

生产环境（需要支持`!override`的Docker Compose v2；本机验证版本2.40.0）：

1. 在 `infra/certs/fullchain.pem` 和 `infra/certs/privkey.pem` 放入有效证书，不提交证书私钥。
2. 设置随机 `SECRET_KEY`、强数据库密码、`COMPOSE_APP_ORIGIN=https://你的域名`、`APP_ENV=production`、`COOKIE_SECURE=true`。
3. 使用 `docker compose -f compose.yaml -f compose.production.yaml up --build -d`。
4. HTTP 会转向 HTTPS。生产模式会拒绝不安全的来源与密钥配置。

## 备份与恢复

Compose 部署使用以下脚本；备份期间暂停 API，确保数据库与图片来自同一写入边界，结束后恢复原运行状态。

```bash
scripts/backup.sh data/backups/my-backup
# 在空目标上先启动 db，再恢复；脚本拒绝非空数据库或非空图片卷
docker compose up -d db
scripts/restore.sh data/backups/my-backup --confirm-empty-target
docker compose up -d
```

备份包含数据库 custom dump、图片归档、SHA256 校验与时间清单。使用生产覆盖文件时，通过 `COMPOSE_FILE=compose.yaml:compose.production.yaml` 让脚本使用同一套 Compose 配置。本机直接运行时应使用本机 `pg_dump` 和 `data/media` 做同样的成套备份。

`scripts/verify_restore.py` 可在专用测试容器中执行完整数据库和图片恢复演练。收藏汇总出现异常时，可在维护期间执行 `python -m app.cli rebuild-collection`，根据不可变获得记录重建。

## 文档与边界

完整需求、架构、数据库、API、交互和任务清单在 `docs/`。首版为家庭自用的信任式任务管理：儿童可以编辑自己的任务；同一设备已登录的儿童之间可以直接切换。奖励一旦解锁永久保留，过去的任务不能补打卡解锁奖励。

参见 `docs/VERIFICATION.md` 获取已执行检查及环境限制。Docker 镜像拉取需要本机 Docker daemon 的代理正常；项目不修改系统代理配置。
