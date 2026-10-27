# 强制走代理覆写（不开全局）

指定网站或应用一定走代理，其它流量仍按原规则分流。规则写在覆写里，更新订阅不会丢。

适用：Clash Verge Rev、Clash Party / Mihomo Party、Sparkle、Stash、Surge、Quantumult X。任意订阅。

## 下载

| 客户端 | 导入地址 |
|---|---|
| Clash Verge Rev / Clash Party / Mihomo Party / Sparkle（推荐） | https://raw.githubusercontent.com/iwen-conf/force-proxy-override/main/force-proxy.js |
| Clash Party YAML | https://raw.githubusercontent.com/iwen-conf/force-proxy-override/main/clash-party.yaml |
| Clash Verge Rev Merge | https://raw.githubusercontent.com/iwen-conf/force-proxy-override/main/clash-verge.yaml |
| Stash | https://raw.githubusercontent.com/iwen-conf/force-proxy-override/main/stash/force-proxy.stoverride |
| Stash 一键安装 | https://link.stash.ws/install-override/raw.githubusercontent.com/iwen-conf/force-proxy-override/main/stash/force-proxy.stoverride |
| Surge 模块 | https://raw.githubusercontent.com/iwen-conf/force-proxy-override/main/surge/force-proxy.sgmodule |
| Quantumult X | https://raw.githubusercontent.com/iwen-conf/force-proxy-override/main/quantumultx/force-proxy.conf |

GitHub raw 打不开时用 jsDelivr：

```
https://cdn.jsdelivr.net/gh/iwen-conf/force-proxy-override@main/force-proxy.js
```

默认强制：`github.com`、`githubusercontent.com`、`githubassets.com`、`openai.com`、`chatgpt.com`。导入后改域名列表即可。

## 要过两道关

流量要走上代理，得同时满足：

1. **入口关**：这个应用的流量得先进入代理（进不去就直接从本地网络出去了）。
2. **路由关**：进来以后，规则得把它分到一个真正出国的出口，而不是直连。

只做其中一个都不算强制。出问题先判断卡在哪一关。

JS 覆写管路由关，并且会自动挑出口组。入口关要在客户端里自己开。

## 推荐：JS 覆写（自动挑出口）

`force-proxy.js` 在每个订阅里按这个顺序挑组：

1. 兜底 `MATCH` 指向的组，如果能当出口 → 用它
2. 否则找名字像「节点选择 / 代理 / Proxy」的选择组
3. 否则找第一个能当出口的选择组
4. 都没有 → 用第一个节点

「能当出口」= 名字不含直连 / 漏网 / 兜底 / 拦截，且第一项不是 `DIRECT` / `REJECT`。

然后会：

- 建一个策略组 `强制代理`，默认选中刚挑到的出口
- 把域名规则插到规则表最前面
- 删掉同域名的旧规则，避免被「国内直连」抢走
- 打开域名嗅探（应用直连 IP 时仍能按域名匹配）

### Clash Party / Mihomo Party / Sparkle

1. 覆写 → 右上角 ＋ → 用上面的 JS 链接导入。
2. 打开脚本，改顶部 `CONFIG.domainSuffix`（要强制的域名）。
3. 订阅管理 → 该订阅 → 编辑信息 → 覆写里勾上这份脚本。多个订阅都勾上。
4. 保存后按提示重启内核。

### Clash Verge Rev

1. 设置 → 配置 → 全局扩展脚本，把 `force-proxy.js` 全文贴进去。  
   或者：配置文件页 → 新建 Script → 贴脚本 → 挂到对应订阅。
2. 改 `CONFIG.domainSuffix`。
3. 保存并重启。

### 改哪些域名 / 应用

打开脚本最上面的 `CONFIG`：

```javascript
domainSuffix: ["github.com", "openai.com"], // 后缀，含子域
domainKeyword: [],                         // 关键字
domain: [],                                // 精确域名
processName: [],                           // 进程名或包名
outbound: "",                              // 留空自动挑；也可写死组名
rejectQuic: false,                         // true = 这些域名的 UDP/443 改走 TCP
enableSniffer: true,
allowDirectFallback: false,                // true = 强制代理组末尾加 DIRECT
```

应用直连 IP、规则匹配不到域名时，保持 `enableSniffer: true`。应用卡住、连不上时把 `rejectQuic` 改成 `true`。

## YAML / Stash / Surge / Quantumult X

这几份**不会**自动挑组。规则指向 `强制代理` 或 `PROXY`。导入后确认：

- 组名在你的订阅里存在，或覆写已经建了 `强制代理`
- 该组第一项不是 `DIRECT`

Stash 数组默认插到原配置前面，所以规则会先于订阅规则命中。

## 入口关（客户端里勾）

JS 解决不了「流量根本没进代理」。另外检查：

- 用**分应用白名单**，只让目标应用进代理，其它直连。
- 关掉「允许应用绕过代理 / VPN」。
- 应用走 IPv6 而你没开 IPv6 时，那部分流量进不来。
- 改完这类设置，软件提示重启时要点确认。

## 验证，别凭感觉

1. 打开目标应用，随便操作一下。
2. 在连接 / 请求日志里搜它的域名。
3. 那一行应该是：命中 `DOMAIN-SUFFIX,...强制代理` → 出口组 → 具体节点。
4. 显示直连，或指向「漏网之鱼」，说明出口组选错了，把 `CONFIG.outbound` 写成你订阅里真正出国的组名。
5. 日志里搜不到这个应用：入口关没过。
6. 多个订阅都要各切过去验证一次。

## 常见坑

| 现象 | 多半原因 |
|---|---|
| 规则命中了，但实际直连 | 出口组默认选的是 DIRECT |
| 日志里搜不到这个应用 | 没勾进代理、被绕过、走了 IPv6 |
| 只有部分域名走了代理 | 应用还访问了别的域名 / CDN，把日志里的域名补进 `domainSuffix` |
| 应用卡住、连不上 | 节点不支持 UDP/QUIC，把 `rejectQuic` 改为 `true` |
| 改完设置后代理断了 | 需要点「重启」让配置生效，断几秒是正常的 |
| 更新订阅后规则没了 | 规则写在了订阅文件里，改用这份覆写 |
| 换了订阅后又失效 | 新订阅没挂脚本 |

## 本地测试

```bash
node --test test/*.test.js
```

## 许可

MIT
