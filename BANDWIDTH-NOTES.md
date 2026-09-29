# Catan bandwidth, performance, and deployment report

## 2026-09-29 v13 补充：为什么3 MB资源仍会消耗大量流量

下面早期报告的数字对应当时源码与模型。v13 已重新运行离线测量，最新四人群岛初始状态为 **15,569 字节**，其中地图 `board` 为 **12,365 字节**，港口为701字节。不变的地图约占初始状态79%；现有协议仍在每次状态变更时重发完整状态，转发给其他玩家和观众。资源文件并不是每局带宽的全部。

当前源码确认：

- 全局 `/api/messages` 每4秒请求一次，约900次/小时；“我的”组件挂载时另每3秒请求一次，未依据页面可见性停用。管理员响应包含全部可见私信和玩家名单。每次都是完整列表，而非仅新消息；实际传输还受HTTP缓存、304和压缩影响，不能直接把请求次数全部当成完整下载。
- 大厅每3秒获取房间列表，服务器返回的房间含完整 `gameState`，而列表只需要摘要。大厅标签隐藏时组件仍挂载；真正进入游戏后会卸载，不能把大厅轮询算进整小时对局。
- 对局操作、建造模式切换、交易反应等重复传完整状态；过往交易记录随状态累积。加入房间和手动同步还存在重复全量响应。
- 图片和音效采用带内容哈希的本地地址并设长期缓存；同一来源、同一资源、缓存有效时可复用。新域名、清缓存、资源版本变化会重新下载。程序JS、CSS、图标也占首次流量。

四位真人、群岛、80个总回合、一小时、无观众、562次本地更新加56次交易更新的**工作量模型**：资源已缓存时，整局服务器出站约45 MB；四人全部冷加载时约63 MB。这不是线上实测账单，也不是“每个玩家63 MB”。聊天历史很长、观众多、重连或对局时间增加时可能更高；一人加AI不能直接套四真人模型。最终构建与本地四客户端协议已复测，消息样本仅2条（647字节）；假设消息响应为1 KB时模型约46/65 MB。完整参数见 `BANDWIDTH-V13.json`。

本地四客户端实测：普通状态上行会向其余三客户端广播；交易反应与成交会向四客户端广播；中局状态样本约20.7 KB。WebSocket扩展为空，即未协商消息压缩。空闲约9秒仅见ping/pong，无定时全量对局状态；因此不能把动画每帧更新或心跳误当成每帧发送整张地图。上述测量没有接入线上账号或读取线上聊天记录。

优化建议，按优先级：

1. 消息改为单一订阅：首次加载必要历史，之后推送新消息/未读变化；滚动才分页加载旧记录；断线后按游标补齐，消除重复轮询，不降低私信及时性。
2. 房间列表只发摘要（人数、阶段、房间名等），隐藏页暂停不必要轮询，返回时立即更新；不要发送地图和玩家手牌。
3. 地图/港口在开局或重连时发送一次；后续只发送变化字段或经过验证的动作，并使用版本号、丢失检测和全量恢复，不能用降低同步频率代替正确的协议设计。
4. 已完成/取消交易不随每次更新无限累积；历史单独保存/按需加载。移除重连和加入房间时重复的全量副本，保留可靠恢复。
5. 在测试CPU、内存、延迟后启用适当的JSON/WebSocket压缩。初始状态gzip实验值1,655字节只是本地压缩实验，不能当作当前线上WebSocket流量或承诺整体节省比例。

本次只诊断这些带宽路径，未实施以上协议和消息架构改造。Render计费包含HTTP响应和公共WebSocket下行，也包含服务主动发往公网的通信；上传入站不计该出站额度。以Render控制台Network Metrics的HTTP、WebSocket、Service-Initiated分类测量优化前后，并把服务器整房间出站与单玩家收发区分开。

官方依据：[Render出站带宽](https://render.com/docs/outbound-bandwidth)、[流量分类监控](https://render.com/docs/service-metrics)。

本版已修复下方旧审计中交易回应/成交的调用者权限、重复成交和资源不足检查；其他旧风险不能据此视为全部已修复。

Local measurements dated 2026-09-29 (Asia/Shanghai), with the release model and socket protocol revalidated at `2026-09-28T17:53:52.667Z` after the final build and authorization changes. Source hashes were unchanged during this run. Results combine measured socket payloads and asset sizes with an explicit one-hour workload model. Production traffic and hosting invoices were not measured.

## 中文摘要

四人群岛地图、每局一小时的模型估算：资源已缓存时，服务器每局出站流量约 **44.32 MB**；四位玩家均首次加载时约 **62.41 MB**。每位玩家下载与上传合计约 **14.60 / 19.12 MB**。按假设的 **5 GB 出站额度**，约可支持 **112 / 80 局**；将估算用量乘以 1.2 留出余量后，约为 **94 / 66 局**。5 GB 不是所有 Render 套餐的统一额度。

主要流量来自完整游戏状态的重复广播、消息轮询和首次资源下载；观战人数与历史记录增长会进一步增加用量。强盗阶段的侧栏卡顿主要线索是棋盘绘制负担，现已采用独立标记图层和命令式动画。游戏更新已有房间成员校验，开局已有房主校验，但部分其他 socket 事件的权限检查和客户端决定游戏结果的信任风险仍需处理。

For the default four-human archipelago case, the model estimates **44.32 MB server outbound per one-hour game with assets cached**, or **62.41 MB with all four clients loading assets fresh**. Average player traffic, download plus upload, is **14.60 MB cached / 19.12 MB fresh**. These are workload estimates built from measured payloads, not an observed hour or a hosting bill. Under the assumed **5 GB outbound budget**, that is about **112 cached / 80 fresh games**, or **94 / 66** after multiplying estimated usage by 1.2 for planning margin.

## Reproduce

From the repository root:

```powershell
node scripts/measure-bandwidth.mjs --offline
node scripts/measure-bandwidth.mjs --require-demo --url http://127.0.0.1:5174
```

The first command makes no requests. The second expects an already-running local demo, verifies `/api/demo/session`, opens four independent sockets, joins a unique `bw-measure-<UUID>` room, sends a small fixed sequence, observes nine idle seconds, and resets **only its own room** before disconnecting. It never calls `/api/demo/reset`, enumerates other rooms, or contacts an external origin. Invalid/non-loopback targets are rejected before any request. It prints JSON and writes no output files. `--require-demo` fails when the demo or expected event contract is unavailable; default mode reports that failure and still produces offline estimates.

The script uses installed TypeScript to transpile `useCatanGame`, `types`, and `constants` in memory, then invokes the real hook under React server rendering. It supplies an empty browser query string for the hook's debug check, and seeded randomness (`20260929`). Initial snapshots are actual `initGame` outputs. Effects do not execute under server rendering. Mid/end-game fixtures use actual board coordinates and the actual trade-offer shape, but occupancy and action counts are explicitly modeled; they are not claimed to be legal played games. The gameplay rule requiring a settlement when connecting shipping routes to roads on landing remains unchanged.

For the live sample, the generated four-player archipelago initial snapshot and three representative phase fixtures were round-tripped through the local demo server. The script measures UTF-8 JSON and Socket.IO/Engine.IO packets; it asserts returned state equality and broadcast counts. It records source SHA-256 values at the beginning/end, asset hashes and modification dates. These identify files on disk, not a guarantee that a long-running server has loaded their latest revision. Initial-state reproducibility depends on the same game generator and JS/runtime behavior.

## Measured snapshot sizes

All values below are bytes. `gzip` is a local compression experiment, **not** the observed WebSocket transfer size.

| Initial snapshot | Hexes | JSON UTF-8 | gzip(JSON) |
| --- | ---: | ---: | ---: |
| Standard, 4 humans | 37 | 9,588 | 1,282 |
| Standard, 6 humans | 61 | 14,739 | 1,565 |
| Archipelago, 4 humans | 70 | 15,469 | 1,634 |
| Archipelago, 6 humans | 88 | 19,615 | 1,885 |

The four-player archipelago initial state's SHA-256 is `37ac2840950281949ea1827a93002149d07ebd43faa2443df2587dd1d84d9bde`. Its `board` value is 12,365 bytes, `ports` 701, and `players` 1,513, excluding each field's key punctuation. Thus the unchanged board dominates early full-state updates. The report breaks out every field; field-value sizes alone do not sum to the complete object because object keys/separators add bytes.

| Local round-trip fixture | JSON | `game_state_updated` packet | Packet plus server WS frame |
| --- | ---: | ---: | ---: |
| Initial archipelago | 15,469 | 15,494 | 15,498 |
| Mid-game main | 20,376 | 20,401 | 20,405 |
| Same fixture, robber | 20,378 | 20,403 | 20,407 |
| Same fixture, robber with `playingDevCard: knight` | 20,404 | 20,429 | 20,433 |

The initial row's update encoding is calculated from the measured initial payload; its actual live start arrived as `game_init` with entry metadata, **15,503 packet bytes per recipient**. Robber/knight rows change only the indicated fields to isolate payload size, rather than reenact all card effects.

Observed live transport was `websocket` after the normal polling upgrade, with an empty negotiated extensions string: **no per-message deflate**. The Engine.IO handshake reported `pingInterval=8000`, `pingTimeout=12000`, and `maxPayload=1000000`. Installed Engine.IO enables HTTP polling compression by default above its threshold, but the server does not opt into WebSocket compression. Do not apply the gzip column to the WebSocket budget. Polling fallback needs separate accounting for HTTP headers, batching, compression, and long polls.

The local smoke sequence measured:

- Four `update_game_state` uploads, 82,054 packet bytes total, with three recipients per upload.
- One trade reaction and one finalization, 91 and 82 upload packet bytes (the measurement UUID room ID is longer than a typical six-digit room ID). Each triggered a full snapshot to all four clients.
- One `request_sync`, returning both `game_state_updated` and `room_state`; the measured room wrapper was 21,341 JSON bytes / 21,358 packet bytes and contained another copy of the state.
- In total, **21** `game_state_updated` deliveries, 431,308 packet bytes: `4 * 3 + 2 * 4 + 1`. Start produced four `game_init` deliveries totaling 62,012 bytes. Join/settings/sync also produced 16 room-state deliveries, 30,050 bytes.
- During the 9,008 ms idle sample, only one Engine.IO ping/pong pair per socket was observed, with **zero periodic full-state updates**. This is a protocol smoke check, not a browser background-performance test.

An event text packet is `4` (Engine.IO message) plus the Socket.IO event encoding, usually `2[event,...args]`. The script uses the installed encoder rather than JS character length. A server WebSocket frame adds 2/4/10 bytes depending on payload length; client frames add another four mask bytes. At 8-second heartbeats, 450 pairs/hour cost approximately 1,350 server-outbound bytes and 3,150 client-outbound bytes per connection at this framing layer. TLS records, TCP/IP, retransmits, handshake headers, and provider-specific billing are not measured here.

## Actual send paths and frequencies

| Path | Frequency / fanout | Source anchor |
| --- | --- | --- |
| Local game change | Whole `gameState` on each committed local state change; server sends to every other socket in the room, including spectators | `App.tsx` effect calling `sendGameState`; `socketService.ts:245`; `server.ts` `update_game_state` |
| Remote game change | `isRemoteUpdateRef` normally suppresses immediate echo | `App.tsx` game listeners and send effect |
| Dice | Roll and later resolution can be separate changes | `useCatanGame.ts` `rollDice`, `resolveDiceRoll` |
| Build selection | `activeBuildMode` is in synchronized state, so changing mode can upload a complete snapshot even before construction | `useCatanGame.ts:2755` `setBuildModeSync` |
| Robber/knight | Action transitions are state changes; token animation frames do not themselves change synchronized `gameState` | `playDevCard`, `moveRobber`, `selectStealTarget`, `stealResource` |
| Trade reaction/finalize | Small command upload, full snapshot broadcast to every socket including sender | Server `react_to_trade`, `finalize_trade` |
| Join/reconnect while playing | Joining socket gets two `room_state` copies plus `game_init`; existing recipients get one room-state broadcast | Server `join_room` explicit emit plus room-wide emit |
| Manual sync | One complete state plus one complete room object to requester | Server `request_sync` |
| Private/system messages | Immediate fetch plus every 4 seconds while the authenticated App is mounted, including gameplay | App `checkUnread` / `setInterval(checkUnread, 4000)` |
| Lobby room list | Immediate fetch plus every 3 seconds while `GameRoomsTab` is mounted; full room objects include gameState | `GameRoomsTab.tsx:71`; server `get_active_rooms` |
| Active-room discovery | Every 10 seconds, but early return while in a room/game | App `checkUserRoom` |
| Health | Every 5 minutes from the browser; conditional reserved-room server self-ping every 10 minutes | App `keepAliveInterval`; `server.ts:1283` |

There is no 60 Hz socket stream and the periodic game-state sync effect is intentionally empty. Network lag alone does not explain the strong phase-specific sidebar difference: the isolated robber state grew by only 2 bytes, and the knight variant by 28 bytes relative to main.

## One-hour assumptions and replication

The model has 80 **total** turns, not 80 per player (45 seconds/turn including setup/activity). Four/six-player comparisons hold turn count fixed; six-player setup and construction counts increase as described below. Humans are separate connected sockets; browser-run bots are not additional network recipients. Baseline spectators are zero. Upload work is averaged equally among humans for the per-player table; a bot-processing host may upload a larger fraction.

| Modeled local state commits | Count |
| --- | ---: |
| Initial dice roll/resolution, order, setup placements, setup mode changes | 8 + 1 + 16 + 16 = 41 |
| Normal dice rolls and resolution | 160 |
| End turns | 80 |
| Construction and build-mode changes | 64 + 45 = 109 |
| Bank trades | 24 |
| Development activations and other effects | 20 |
| About 13 sevens: phase transitions, discards, moves, targets, steals | 66 |
| Six knights: moves, targets, steals; activations counted above | 18 |
| Gold selections | 8 |
| Trade proposals/cancellations | 24 |
| Miscellaneous state changes | 12 |
| **Total local full-state uploads, U** | **562** |
| **Small trade commands causing full-state broadcast, T** | **40 reactions + 16 finalizations = 56** |

Four-player fixtures grow linearly from 8 to 20 settlement/city locations, 8 to 40 roads, 0 to 12 ships for archipelago, 0 to 8 city upgrades, and 0 to 20 retained completed offers. This implies 64 archipelago construction commits after setup. Standard uses the same commit budget for comparison despite having no ships, making that part conservative. Placement validity and scoring are not simulated. Six-player fixtures start with 12 settlement/road locations and end with 30 settlement/city locations, 60 roads, 18 ships and 12 upgrades; the model adds 20 setup/initial-roll commits and 32 construction commits, for **614 local uploads**. Four-player average/end JSON sizes are **14,223 / 17,832 bytes standard** and **20,382 / 24,278 archipelago**. Six-player values are **20,498 / 24,692 standard** and **25,809 / 30,457 archipelago**.

For H humans, Q spectators, and N=H+Q connections, ordinary update egress is `sum(update packets) * (N-1)`, while trade-update egress is `T * average(update packet) * N`. Ordinary ingress is just one copy per action. Therefore multiplying a player's own upload by four is not the correct full-game accounting. Spectators receive all ordinary updates because they are never the excluded sender.

The script also budgets a game start, **one reconnect and one manual sync per human**, disconnect room-state broadcasts, room metadata (1,200 bytes/wrapper), and a small startup/control upload allowance. Reconnect uses late-game sizes conservatively: each reconnect generates `(N+1)` room wrappers across the room plus one game-init snapshot. Manual sync adds two snapshot copies to its requester. These recovery counts are assumptions, not measured incidence.

Local demo `/api/messages` returned **647 body bytes for two messages**; health returned **15 bytes**. The assumptions match `scripts/measure-bandwidth.mjs`: **901 message responses** means one immediate fetch plus `3600 / 4 = 900` interval ticks; **12 health responses** means `3600 / 300 = 12` ticks with no immediate health fetch. These counts conservatively include the tick at the one-hour endpoint; a session ending just before it has one fewer interval request. Response headers are budgeted at **500 bytes**, and each request including headers at **700 bytes**, for `(901 + 12) * 700 = 639,100` HTTP upload bytes per client-hour.

The baseline assumes HTTP **status 200** with complete response bodies. Browser/proxy revalidation using Express ETags can produce 304 responses and reduce unchanged-body traffic; browser timer suspension can reduce frequency. There is no measured production compression/cache trace. The model excludes browsing outside the game, actual user message sends, admin actions, large custom boards, deployment downloads, unrelated services, and database-provider traffic.

| Game | Avg player download MB | Avg player upload MB | Player total cached / fresh MB | Game outbound cached / fresh MB |
| --- | ---: | ---: | ---: | ---: |
| Standard, 4 humans | 8.06 | 2.65 | 10.71 / 15.24 | 32.25 / 50.34 |
| Standard, 6 humans | 13.09 | 2.75 | 15.84 / 20.37 | 78.57 / 105.70 |
| Archipelago, 4 humans | 11.08 | 3.52 | 14.60 / 19.12 | 44.32 / 62.41 |
| Archipelago, 6 humans | 16.20 | 3.29 | 19.49 / 24.02 | 97.20 / 124.34 |

Units are decimal: MB=1,000,000 bytes, GB=1,000,000,000 bytes. Client total includes both directions; the server outbound budget uses only server-to-client traffic. Small protocol/control allowances are modeled, not invoice precision. More actions, spectators, restored long histories, or a larger board increase totals.

## Assets and cache

File inventory at measurement time:

| Files | Count | Raw bytes | Locally gzipped bytes |
| --- | ---: | ---: | ---: |
| Manifest game images | 28 | 1,872,252 | 1,870,401 |
| Manifest audio | 6 | 1,000,784 | 914,730 |
| Release dist JS/CSS | 3 | 1,281,512 | 354,301 |
| HTML, web manifest, current 192/512 icons | 4 | 367,709 | 365,169 |
| **Total** | **41** | **4,522,257** | **3,504,601** |

The inventory reads the existing production `dist` output and unique public manifest assets once; it does not rebuild or double-count the copies in `dist/assets/images` and `audio`. Vite development module/HMR downloads are excluded from production estimates. A normal tab may not fetch both install icons, so the shell budget is conservative. Obsolete and unreferenced large icons are excluded. The script reports filenames, dates, and hashes so the figures can be refreshed after a new build.

`assetPreloader` requests all game images and starts audio preloading; `assetCache.ts` stores successful media responses in versioned Cache Storage and memory. Server media routes set one-year immutable caching. Cache hits for unchanged media need no download body. Fresh budget assumes all listed bytes are fetched once per client, including both current install icons. Cached budget assumes unchanged bundles/media remain available with no replacement body downloads; revalidation/handshake overhead is small but not exactly captured. Cache clearing, eviction, a new device, versioned media-cache replacement, or a changed bundle moves the affected files back into the fresh column. The ordinary dist route does not set the media route's immutable policy. Gzip totals are potential savings, not evidence that the production edge applies compression.

## Long histories, spectators, and 5 GB

**The current GameState has no persistent text `logs` array.** Browser/server console logs are not automatically socket payloads. However `tradeOffers` accumulates through `proposeTrade`; finalization/cancellation marks entries without pruning. Ten completed modeled offers occupy 2,451 bytes; twenty occupy approximately 4.9 KB and are retransmitted with every subsequent full state.

The script separately tests a hypothetical text history that grows from zero to 1,000 or 5,000 entries across the same 562 commits. Each entry has an ID, timestamp, player ID and UTF-8 message, approximately 189-190 bytes including array separators. This is a sensitivity exercise, not a claim that today's game transmits that log. Restoring a game with a history already present for the entire hour costs more than this linear-growth model.

| Four-human archipelago sensitivity | End JSON bytes | Game outbound cached / fresh MB | 5 GB games cached / fresh |
| --- | ---: | ---: | ---: |
| Current schema, no spectators | 24,278 | 44.32 / 62.41 | 112 / 80 |
| Two connected spectators | 24,278 | 72.07 / 99.20 | 69 / 50 |
| Hypothetical growing 1,000-entry log | 213,177 | 232.95 / 251.04 | 21 / 19 |
| Hypothetical growing 5,000-entry log | 973,177 | 991.43 / 1,009.52 | 5 / 4 |

The 5,000-entry fixture approaches the observed 1,000,000-byte Engine.IO limit. About 6,000 similarly sized entries would exceed it and can cause update rejection/disconnect, not merely higher bandwidth. It is not reasonable to extrapolate successful gameplay beyond that limit without changing the protocol. The two-spectator case adds about **13.87 MB downloaded per spectator-hour** with cached assets, plus tiny heartbeat uploads and their HTTP polling requests.

Private-message history is a different, already-existing source of growth: `/api/messages` loads and returns the visible message history without pagination. At 901 complete responses/hour, bodies of **1,024 / 100,000 / 1,000,000 bytes**, exactly as modeled in the script, imply **1.37 / 90.55 / 901.45 MB downloaded per player-hour** including the modeled 500-byte response headers. These assume full bodies with HTTP status 200; successful unchanged-response revalidation reduces them. A ten-room lobby with 20 KB state/room can return roughly 200 KB every three seconds: one immediate fetch plus 1,200 interval ticks gives approximately **240.2 MB per idle lobby viewer-hour**, before protocol overhead. `GameRoomsTab` is not mounted in gameplay, so that lobby scenario is **not** added to the baseline game table.

| Game | 5 GB games cached / fresh | With 1.2 usage multiplier cached / fresh |
| --- | ---: | ---: |
| Standard, 4 humans | 155 / 99 | 129 / 82 |
| Standard, 6 humans | 63 / 47 | 53 / 39 |
| Archipelago, 4 humans | 112 / 80 | 94 / 66 |
| Archipelago, 6 humans | 51 / 40 | 42 / 33 |

Formula: `floor(5,000,000,000 / modeled_game_outbound_bytes)`. The margin column uses `floor(5e9 / (1.2 * usage))`; it is not a measured network overhead percentage or a guarantee. Existing monthly usage and unrelated traffic reduce the available quota. **5 GB is an assumed account cap, not a claim about every Render plan.** Plan and billing semantics should be checked against the account and [Render outbound bandwidth documentation](https://render.com/docs/outbound-bandwidth).

## Rendering findings

In the earlier implementation, `RobberToken` and `PirateToken` each ran a `requestAnimationFrame` loop calling React `setPulse` only in `phase === 'robber'`. Both tokens lived in the same Konva layer as the full board. Every pulse changed shape attributes and invalidated that layer, competing for main-thread time with sidebar touch/scroll work. Knight activation explicitly selects the same robber phase (`useCatanGame.ts:2142`). A token's local React state does **not** by itself prove that all of `App` rerenders, but drawing the containing board layer is the material cost. Memoizing hex React components alone would not isolate canvas drawing.

The current implementation uses `TokenPulse` with `Konva.Animation` and separate `board-terrain` / `board-markers` layers. This directly addresses repeated full-board drawing; the bandwidth measurements do not quantify its effect on frame time or sidebar scrolling. The inspected source did not contain `Konva.Filters`/`filters=` on these nodes. Shadows, DPR-dependent cache creation during drag/zoom, and DOM backdrop blur are secondary candidates only if profiling still shows a problem; there is no evidence here to justify broad removal. `RotatedScroll` updates `scrollTop` imperatively and has no phase-specific state mutation.

Two other source-backed observations are worth checking before larger optimization:

- `useCatanGame.ts:2637` advances `rolling_7` in an effect on every mounted client. Combined with App's one-update `isRemoteUpdateRef` suppression, a remote `rolling_7` render can schedule a second local state change after the suppression is consumed. Each human client may then rebroadcast the derived discard/robber snapshot. This depends on event timing/batching and was **not** exercised by the standalone socket harness. At 13 sevens, up to 39 extra ordinary broadcasts in a four-human game would add roughly 2.4 MB egress at a 20 KB state. Browser verification is needed before assigning that transition to a single client. Baseline counts assume one owner.
- `socketService` logs complete incoming payload arguments, and App still recomputes board-related render work on full state replacement. Those can increase DevTools/main-thread overhead, but they do not create a per-frame network stream. Their timing impact requires profiling.

## Production trust and lifecycle findings

Current authorization checks distinguish game updates and game starts from the remaining exposed handlers. `update_game_state` now requires a socket currently joined to the requested room and mapped to a non-disconnected room player; spectator-only and unjoined sockets fail that gate. It also requires a state with a players array. `start_game` now requires the room's host socket, no existing game state, and successful game-start validation. These are membership/start checks, not full validation of the acting player's turn or subsequent gameplay transitions.

- **P1: Other socket handlers still lack caller authorization.** `request_sync` has no membership check; `react_to_trade` and `finalize_trade` do not bind the caller to the relevant player or trade initiator. `admin_delete_room` and `admin_update_sound_settings` lack server-side admin checks. `get_active_rooms` trusts a supplied `isAdmin` flag when deciding the room-list limit, and `get_my_active_room` accepts supplied player ID/name lookups. Some additional controls, such as `update_settings` and `reserve_room`, compare a supplied host ID without binding it to the calling socket. Optional `join_room(..., authToken)` verifies ranked identity while allowing legacy unauthenticated play; it is not a mandatory authentication gate for every event. HTTP auth/admin middleware does not protect socket handlers. Each handler needs permissions tied to the socket's server-side identity, membership and role.
- **P1: Hidden state and client-authoritative outcomes remain risks.** Whole snapshots contain other players' resources, development cards, and the development-deck order, and are sent to spectators and inside room-list responses. Unchecked `request_sync` also exposes complete state. Although unjoined/spectator-only sockets can no longer upload game state, a permitted room player still supplies the snapshot used for game state and winner processing. Membership and ranked-identity checks do not verify legal moves, resource changes or victory conditions. Trade finalization also lacks resource-sufficiency and accepted-offer checks. Public/private state separation and server-side action validation are needed to address these risks.
- **P1 when unset: JWT fallback secret.** `server.ts` falls back to a constant signing secret. A production process should require a configured secret. Whether the deployed environment sets one is outside the available evidence.
- **Account recovery conflict:** `LoginScreen` reuses `/api/send-code` for forgotten passwords, but that route rejects every already-registered email before issuing a code. This prevents the normal reset flow for existing accounts. Separately, missing email-service configuration returns a message suggesting any six digits while registration still requires the stored random value. These existing account behaviors were inspected, not changed in this release. Verification expiry currently relies on the MongoDB TTL index rather than an explicit age check in the consuming endpoints.
- **Room expiry differs from transport liveness.** `server.ts:1263` checks inactivity every minute and deletes unreserved rooms after ten minutes without `touchRoom`. Engine.IO ping/pong and browser `/api/health` do not call `touchRoom`; connected clients can therefore retain live transport while a quiet room expires. Reservation affects this cleanup but does not persist a room across a process restart.
- **Restart durability:** active rooms are stored in a process-local Map. Explicit saved-game routes exist, but normal active rooms are not automatically reconstructed after a restart. Completed-game records and localStorage room IDs are not an active-state backup. Sleep prevention does not provide restart durability.

## Render hosting considerations

According to [Render free-service documentation](https://render.com/docs/free), a free service can idle after 15 minutes without inbound traffic; qualifying traffic includes HTTP requests and messages on existing WebSocket connections. Waking typically takes about a minute. The 750 free instance hours per month are shared, and a free service may restart at any time.

The App already fetches health every five minutes. The server already attempts a self-ping every ten minutes only when a room is reserved and `RENDER_EXTERNAL_URL` or `PUBLIC_URL` is set. Browser background throttling, suspension, closed tabs, network loss, process sleep and platform restarts mean those timers do **not** guarantee permanent availability. A sleeping/stopped process cannot use its own timer to wake itself. Health requests also do not solve the separate room cleanup/persistence issues above.

For scale only, an external health request every ten minutes for 30 days would make `30 * 24 * 6 = 4,320` requests. At an **illustrative 1,000-byte response**, that is **4.32 MB response traffic**, before headers/protocol overhead. The measured local health body was only 15 bytes, but the illustration is not a deployed billing measurement or a recommendation to configure recurring keepalive.
