# 验证记录

验证日期：2026-10-28（Asia/Shanghai）。

## 已通过

| 检查 | 结果 | 验证内容 |
|---|---|---|
| 真实PostgreSQL后端测试 | 27 passed | 规则、历史还原、奖励保留、并发完成/候选/选择、事务回滚、重复收藏、统计日期、会话/权限/CSRF、图片和密码原样保存 |
| 开发环境Playwright | 3 passed | 任务到图鉴闭环、刷新恢复候选、多账号/双标签页/延迟响应、360px手机、后台账号与图片上传 |
| 生产环境Playwright | 1 passed | HTTPS安全Cookie、实际Nginx静态构建、Service Worker、离线提示与联网恢复、账号API不进入缓存 |
| 前端构建 | 通过 | TypeScript、Vite生产构建、静态SW及离线脚本语法检查 |
| 后端静态检查 | 通过 | Ruff检查与格式化 |
| Docker镜像构建 | 通过 | api、migrate、web三个最终镜像，使用锁文件安装 |
| 空schema迁移 | 通过 | 初始17张表与历史保护触发器 |
| 用户业务库迁移 | 通过 | localhost:5432/kidstodo，沿用用户提供的账号 |
| Compose恢复演练 | 通过 | 两套随机命名栈，真实pg_dump/pg_restore与图片归档，恢复12张图片，候选和获得记录一致 |
| 恢复后幂等 | 通过 | 重放已领取选项返回原获得记录，数量仍为1 |
| 非空恢复保护 | 通过 | 再次恢复到非空目标被拒绝，未覆盖已有数据 |
| 生产TLS配置 | 通过 | Nginx语法、HTTPS健康检查、HSTS、Secure/HttpOnly Cookie |
| 本地入口 | 通过 | http://localhost:18170 与同源代理后的API健康检查 |

后端测试使用专用PostgreSQL18容器中的随机schema；浏览器测试使用单独schema和图片目录。Compose演练使用随机项目名、隔离数据库和图片卷，结束后清理。没有向用户业务库写入测试儿童、测试任务或测试获得记录。

生产TLS演练使用一次性自签证书，浏览器仅在该测试配置中信任测试证书；实际应用没有关闭TLS验证，正式部署应配置有效证书。PWA验收执行的是构建产物，不以Vite开发页面代替。

本机构建初次受失效的127.0.0.1:7890代理阻断，使用临时、仅绑定本机的构建代理后成功；未修改系统代理或Docker daemon配置。临时代理和测试容器在验收后清理。

## 本地初始状态

已初始化应用管理员和12张原创示例卡。管理员随机凭据存于`.cache/local-admin.txt`，权限0600且被Git忽略，不在文档或日志中记录密码。首先登录管理后台创建儿童账号，再进入儿童应用；可以添加并切换多个儿童账号。

本地端口18170是因为5173等常用端口已有其他服务，未停止或覆盖那些服务。后端在127.0.0.1:8000，前端通过Vite同源代理访问。

## 复现

```bash
# 从项目根目录启动独立测试数据库；事先配置.env
docker compose --profile test up -d test-db
cd backend
TEST_DATABASE_URL=postgresql+psycopg://kids:kids@localhost:55432/kidstodo_test uv run pytest -q
uv run ruff check app tests alembic
cd ../frontend
npm run build
npm run test:e2e
cd ..
# 先构建api/migrate/web；浏览器已安装Chromium或指定本机Chrome
docker compose build
PLAYWRIGHT_CHANNEL=chrome backend/.venv/bin/python scripts/verify_restore.py
```

正式域名发布、监护人体系和原生App属于后续部署/功能范围，未擅自创建外部服务。

## 儿童端 App 风格改版（2026-10-28）

- 今日页重构为小兔进度卡、奖励条和单列任务；四项底部导航、手机底部弹窗、图鉴双列卡片、独立儿童登录界面。
- 任务名称可直接打开编辑；说明、颜色和排序放入“更多设置”。保留独立的完成按钮及服务端确认流程。
- `npm run build` 通过（TypeScript、Service Worker 语法与 Vite 构建）。
- 真实 PostgreSQL 上的 3 项 Playwright 回归全部通过：任务/领奖/图鉴、多账号/双标签页/退出、管理员内容与账号管理。
- Chrome 检查日历、图鉴、奖励页在 360、390、768、1440px 宽度均无横向溢出，运行期间无页面 JavaScript 错误；查看了登录、今日、日历、图鉴、选卡和任务表单实际截图。
- 测试使用隔离 schema 与示例账号，没有向应用数据库写入测试任务或奖励。


## PAD 今日布局与周历（2026-10-28）

- 今日页在至少 1000px 宽度下使用双栏，进度/奖励与任务列表并列，保留手机单列。
- 周历从只显示每日计数的月历改为任务 × 七天表格；复用只读每日接口，七天并行获取，全周展示任务状态、计划时间与每日奖励。
- Playwright 验证真实数据的已完成/待完成/奖励已收藏，下一周的 21 个计划实例、上一周的空安排、返回本周与详情弹窗；390px 局部滚动和固定任务首列、1194px 今日双栏均通过。
- 已查看 PAD 今日、PAD 周历与手机横向滚动截图；构建和 3 项完整浏览器回归通过。

### 周历调整为每日独立任务列

移除共享任务名首列，每个日期内按服务端顺序独立展示任务卡片（名称、图标、计划时间、状态），无任务日期单独显示空状态。每日奖励、周切换和详情入口保留。前端构建及 3 项 Playwright 回归通过；验证七个日期列分别包含任务名称，未来七天各自显示三项任务，空周显示七个空状态，窄屏可横向滚动且无固定首列。已查看 1194px PAD 与 390px 手机截图。
