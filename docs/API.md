# API 契约

前缀 `/api/v1`。完整请求/响应JSON Schema由实际应用导出到 `openapi.json`，前端 `src/api/generated.ts` 由其生成。后端启动后可在 `/docs` 交互查看。

## 通用约定

儿童业务接口携带 `X-Account-ID`，必须是当前浏览器会话已认证且未失效的账号。管理接口仅接受独立管理员会话。写操作带 `Origin` 与 `X-CSRF-Token`，Cookie由浏览器自动携带，不把认证凭证保存到浏览器存储。

分页默认page=1、page_size=20，最大100；返回items/total/page/page_size。日期YYYY-MM-DD，时间ISO8601，规则时间为上海本地HH:mm。列表查询不修改业务事实；活跃与会话最近访问仅作为元数据。

## 认证

| Method | Path | 输入 | 输出/说明 |
|---|---|---|---|
| GET | /auth/csrf?scope=child或admin | 无 | csrf_token；建立或恢复对应Cookie会话 |
| POST | /auth/accounts | username,password | user、accounts、csrf_token、expires_at；加入儿童账号 |
| GET | /auth/accounts | Cookie | accounts，未登录返回空列表 |
| DELETE | /auth/accounts/{user_id} | CSRF | 204，仅退出该已登录账号 |
| POST | /auth/logout | CSRF | 204，退出全部儿童账号 |
| POST | /admin/auth/login | username,password、管理员scope的CSRF | 管理员认证，与儿童会话分离 |
| POST | /admin/auth/logout | 管理员CSRF | 204，不退出儿童账号 |
| GET | /me | 儿童上下文 | user、server_today、timezone |
| GET | /admin/me | 管理员 | user、server_today、timezone |

账号最多10个，成功登录轮换Cookie和CSRF；前端保存最新CSRF。密码错误五次限制15分钟。账号禁用和密码重置使已认证资格失效。

## 任务与日历

| Method | Path | 输入 | 输出 |
|---|---|---|---|
| GET | /me/tasks | state、分页 | Page<TaskPublic> |
| POST | /me/tasks | TaskInput | task、day，201 |
| PATCH | /me/tasks/{task_id} | TaskInput的部分字段 | 新版本task、更新后的day |
| DELETE | /me/tasks/{task_id} | 无 | 归档，204，重复归档仍成功 |
| POST | /me/days/{date}/prepare | 日期不晚于今天 | DayPublic，幂等创建实例 |
| GET | /me/days/{date} | 任意日期 | DayPublic，未来is_preview=true |
| PUT | /me/task-instances/{id}/completion | completed:boolean | DayPublic，只允许今天 |
| GET | /me/calendar | from、to，最多62天 | days，每日progress/reward/is_preview |

TaskInput必填name、rule_type、start_date；可选description、icon、color、sort_order、state、end_date、planned_time、weekdays。name最多60字、description最多500字。icon/color使用预设；weekly需1～7的非空星期组合；once结束日期规范为开始日期。

```json
{
  "name": "阅读20分钟",
  "icon": "book",
  "color": "mint",
  "rule_type": "weekly",
  "start_date": "2026-10-28",
  "weekdays": [1, 3, 5],
  "planned_time": "19:30"
}
```

DayPublic含business_date、server_today、timezone、prepared、is_preview、tasks、progress和reward。实例含任务版本资料、instance_id、completed_at、planned_time_passed。未物化日的instance_id为null，不能直接打卡。

```json
{
  "business_date": "2026-10-28",
  "server_today": "2026-10-28",
  "timezone": "Asia/Shanghai",
  "is_preview": false,
  "prepared": true,
  "tasks": [],
  "progress": { "total": 0, "completed": 0 },
  "reward": { "state": "locked", "id": null, "earned_at": null }
}
```

奖励已解锁后，当前progress可以不是全部完成；二者含义独立。

## 奖励与收藏

| Method | Path | 输入 | 输出 |
|---|---|---|---|
| GET | /me/rewards | state=pending/available/drawing/claimed、分页 | Page<RewardItem> |
| POST | /me/rewards/{id}/draw-session | 无 | DrawPublic，创建或恢复固定候选 |
| PUT | /me/draw-sessions/{id}/selection | option_id | AcquisitionPublic，包含card快照和当前quantity |
| GET | /me/collection | category_id、set_id、rarity、owned_only、分页 | Page<OwnedCard>，含未收藏启用卡与已收藏归档卡 |
| GET | /me/collection/sets | 无 | items，含total、owned_unique |
| GET | /me/collection/cards/{id} | 无 | 卡片、数量、首次/最后获得时间、acquisitions |
| GET | /catalog/categories | 儿童上下文 | 启用分类及卡片集 |

DrawPublic含id、reward_id、state、selected_option_id和options；选项含id、position、card快照。客户端只能提交选项ID，不能任意指定卡片ID。

创建候选多次返回同一会话；重复选择同一选项返回原获得记录；改选返回409。候选不足三张返回503，奖励仍available；既有候选不因卡片下架失效。

## 应用管理

| Method | Path | 输入 | 输出 |
|---|---|---|---|
| GET | /admin/users | q、status、分页 | Page<UserPublic> |
| POST | /admin/users | username、display_name、password、avatar_key | 新儿童账号，201 |
| GET | /admin/users/{id} | 无 | 儿童资料 |
| PATCH | /admin/users/{id} | display_name、avatar_key、status、password，均可选 | 更新资料 |
| GET | /admin/users/{id}/days | from、to，最多31天且不晚于今天 | days详细记录 |
| GET | /admin/users/{id}/collection | 分页 | 已收藏卡片 |
| GET | /admin/stats | from、to，最多31天且不晚于今天 | total_users、disabled_users、days指标 |
| GET | /admin/draw-sessions | user_id、state、from、to、分页 | 会话、用户、奖励日期、候选、选择、实际完成时间 |
| POST | /admin/media | multipart file | id、url、width、height，201 |

用户名为3～40位ASCII字母、数字、点、下划线、横线，大小写不区分；密码8～128位；昵称最多40字。API仅创建儿童，管理员通过维护CLI创建。

内容维护三组资源：`/admin/card-categories`、`/admin/card-sets`、`/admin/cards`，均提供GET列表、POST创建、GET /{id}详情、PATCH /{id}编辑、DELETE /{id}归档。

| 资源 | 创建字段 |
|---|---|
| 分类 | name；可选sort_order、status |
| 卡片集 | name、category_id；可选description、cover_asset_id、sort_order、status |
| 卡片 | name、set_id、image_asset_id；可选description、rarity、draw_weight、sort_order、status |

稀有度common/rare/epic/legendary，权重1～10000。上传先返回图片资源ID，再用于内容表单；拒绝SVG和远程URL。归档保留所有历史，可经编辑恢复内容启用状态。

## 错误和幂等

```json
{"error":{"code":"DAY_CLOSED","message":"只能修改今天的任务记录","request_id":"..."}}
```

| HTTP | code | 场景 |
|---|---|---|
| 401 | UNAUTHENTICATED / INVALID_CREDENTIALS | 会话失效、账号密码错误 |
| 403 | ACCOUNT_NOT_AUTHENTICATED | 缺少当前账号或不在会话内 |
| 403 | INVALID_ORIGIN / CSRF_INVALID | 来源或CSRF不匹配 |
| 404 | NOT_FOUND | 资源不存在或不属于当前账号 |
| 409 | DAY_CLOSED / FUTURE_PREVIEW_ONLY | 日期不允许修改或物化 |
| 409 | TASK_ARCHIVED / TASK_NOT_INCLUDED | 任务已归档或不在今日计划 |
| 409 | ALREADY_SELECTED | 已选择其他选项 |
| 409 | ACCOUNT_LIMIT / USERNAME_TAKEN / CONFLICT | 账号上限、用户名或约束冲突 |
| 413 | IMAGE_TOO_LARGE | 文件或像素超限 |
| 422 | VALIDATION_ERROR / INVALID_START_DATE / INVALID_REFERENCE / INVALID_OPTION / INVALID_IMAGE / INVALID_DATE_RANGE | 输入无效 |
| 429 | LOGIN_THROTTLED | 登录失败限制，Retry-After=900 |
| 503 | CARD_POOL_UNAVAILABLE | 可抽卡不足三张 |

完成操作提交明确布尔状态，重复提交不重复计数；奖励/会话/获得记录使用唯一约束。跨零点请求在取得儿童行锁后按服务端日期校验，不能自动补记到另一日期。
