# Mihomo 覆写脚本（ndsjs）

## 简介
`buding.js` 是一个用于 Mihomo / Clash.Meta 的覆写（override）脚本。它通过导出的 `main(config)` 函数直接修改传入的配置对象，统一定义代理组、规则集订阅以及路由顺序，确保不同场景（AIGC、Telegram、Google、区域优选等）具有明确、可维护的分流策略。

脚本的所有变更点集中在以下三个部分：
1. 重写 `proxy-groups`，提供 10 组节点选择/探测策略。
2. 覆盖或补全 `rule-providers`，共 14 个规则集，全部为 HTTP 类型、YAML 格式、每日（86400 秒）更新。
3. 重新定义 `rules`，通过 15 条规则串联全部规则集，末尾使用 `MATCH,PROXY` 兜底。

## 代理组定义
所有代理组都会继承脚本中的 `exclude-filter`：`(?i)GB|Traffic|Expire|Premium|频道|订阅|ISP|流量|到期|重置`，避免消耗流量或套餐节点被自动选入。下表列出了每个分组的细节：

| 名称 | 类型 | 图标 | include-all | 过滤器 | interval | proxies | 说明 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PROXY | select | https://testingcf.jsdelivr.net/gh/Orz-3/mini@master/Color/Static.png | true | — | — | AUTO / HK AUTO / SG AUTO / JP AUTO / US AUTO | 用户手动选择的主出口，作为其他规则的兜底。 |
| AUTO | url-test | https://testingcf.jsdelivr.net/gh/Orz-3/mini@master/Color/Urltest.png | true | — | 300s | 自动收集到的全部节点 | 全局自动测速，延迟最低者优先。 |
| AIGC | select | https://testingcf.jsdelivr.net/gh/Orz-3/mini@master/Color/OpenAI.png | — | — | — | SG AUTO / JP AUTO / US AUTO | 专供 OpenAI、Copilot、Claude、Bard、Bing 等 AI 服务。 |
| Telegram | select | https://testingcf.jsdelivr.net/gh/Orz-3/mini@master/Color/Telegram.png | — | — | — | HK / SG / JP / US AUTO | Telegram/MTProto 优选，保留多地区备份。 |
| Google | select | https://testingcf.jsdelivr.net/gh/Orz-3/mini@master/Color/Google.png | — | — | — | HK / SG / JP / US AUTO | Google 相关域名/地址流向，避免走国内直连。 |
| HK AUTO | url-test | https://testingcf.jsdelivr.net/gh/Orz-3/mini@master/Color/HK.png | true | `(?i)香港|Hong Kong|HK|🇭🇰` | 300s | 匹配到的香港节点 | 区域自动测速，供手动/其他分组引用。 |
| SG AUTO | url-test | https://testingcf.jsdelivr.net/gh/Orz-3/mini@master/Color/SG.png | true | `(?i)新加坡|Singapore|🇸🇬` | 300s | 匹配到的新加坡节点 | 同上，锁定新加坡。 |
| JP AUTO | url-test | https://testingcf.jsdelivr.net/gh/Orz-3/mini@master/Color/JP.png | true | `(?i)日本|Japan|🇯🇵` | 300s | 匹配到的日本节点 | 同上，锁定日本。 |
| US AUTO | url-test | https://testingcf.jsdelivr.net/gh/Orz-3/mini@master/Color/US.png | true | `(?i)美国|USA|🇺🇸` | 300s | 匹配到的美国节点 | 同上，锁定美国。 |
| GLOBAL | select | https://testingcf.jsdelivr.net/gh/Orz-3/mini@master/Color/Global.png | true | — | — | AUTO / HK / SG / JP / US AUTO | 备选全局代理组，可供特定规则或手动选择。 |

## 规则集订阅（rule-providers）
脚本首先确保 `config['rule-providers']` 存在，再使用 `Object.assign` 将以下 14 个订阅写入/覆盖。所有订阅的公共属性：`type: http`、`format: yaml`、`interval: 86400` 秒，并写入 `./ruleset/*.yaml` 本地缓存。

| Provider Key | 行为 (behavior) | 下载地址 (url) | 本地路径 | 主要用途 |
| --- | --- | --- | --- | --- |
| private | domain | https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/private.yaml | ./ruleset/private.yaml | 私有局域网和常见内网域名，直接放行。 |
| cn_domain | domain | https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/cn.yaml | ./ruleset/cn_domain.yaml | 中国大陆域名集合，用于 DIRECT。 |
| telegram_domain | domain | https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/telegram.yaml | ./ruleset/telegram_domain.yaml | Telegram 相关域名，指向 Telegram 代理组。 |
| google_domain | domain | https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/google.yaml | ./ruleset/google_domain.yaml | Google 域名路由至 Google 代理组。 |
| geolocation-!cn | domain | https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/geolocation-!cn.yaml | ./ruleset/geolocation-!cn.yaml | 非中国大陆域名，默认走 PROXY。 |
| cn_ip | ipcidr | https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geoip/cn.yaml | ./ruleset/cn_ip.yaml | 中国大陆 IP，DIRECT。 |
| telegram_ip | ipcidr | https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geoip/telegram.yaml | ./ruleset/telegram_ip.yaml | Telegram IP 段，Telegram 代理组。 |
| google_ip | ipcidr | https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geoip/google.yaml | ./ruleset/google_ip.yaml | Google IP 段，Google 代理组。 |
| bing | classical | https://testingcf.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Clash/Bing/Bing.yaml | ./ruleset/bing.yaml | Bing AI / 搜索，归类到 AIGC。 |
| copilot | classical | https://testingcf.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Clash/Copilot/Copilot.yaml | ./ruleset/copilot.yaml | Microsoft Copilot，AIGC 代理。 |
| claude | classical | https://testingcf.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Clash/Claude/Claude.yaml | ./ruleset/claude.yaml | Anthropic Claude，AIGC 代理。 |
| bard | classical | https://testingcf.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Clash/BardAI/BardAI.yaml | ./ruleset/bard.yaml | Google Bard / Gemini，AIGC 代理。 |
| openai | classical | https://testingcf.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Clash/OpenAI/OpenAI.yaml | ./ruleset/openai.yaml | OpenAI API/Web，AIGC 代理。 |
| steam | classical | https://testingcf.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Clash/Steam/Steam.yaml | ./ruleset/steam.yaml | Steam 平台，走 PROXY。 |

> 注：`ruleset` 目录需可写，以缓存订阅文件并供 Mihomo 增量更新。

## 路由规则顺序
脚本将 `config.rules` 覆盖为下述 15 条，顺序即匹配优先级：
1. `RULE-SET,private,DIRECT` — 内网/私有域名直接放行。
2. `RULE-SET,bing,AIGC`
3. `RULE-SET,copilot,AIGC`
4. `RULE-SET,bard,AIGC`
5. `RULE-SET,openai,AIGC`
6. `RULE-SET,claude,AIGC`
7. `RULE-SET,steam,PROXY`
8. `RULE-SET,telegram_domain,Telegram`
9. `RULE-SET,telegram_ip,Telegram`
10. `RULE-SET,google_domain,Google`
11. `RULE-SET,google_ip,Google`
12. `RULE-SET,geolocation-!cn,PROXY`
13. `RULE-SET,cn_domain,DIRECT`
14. `RULE-SET,cn_ip,DIRECT`
15. `MATCH,PROXY` — 兜底走主代理组。

AIGC 相关规则优先，Telegram/Google 次之，随后是全局非大陆与大陆分流，最终由 PROXY 收尾。

## 使用方式
1. 确认使用的是支持 JS 覆写的 Mihomo/Clash.Meta 版本（2023.09+ 推荐）。
2. 将 `buding.js` 放入 `mihomo`/`clash` 的覆写目录，并在主配置中引入，例如：
   ```yaml
   # config.yaml
   parsers:
     - url: https://example.com/sub.yaml
       yaml:
         prepend-proxy-groups: []
         prepend-rules: []
       script:
         # 指向 buding.js
         code: |
           {{ readFile "./buding.js" }}
   ```
   或者在支持 `script-path` 的客户端里直接引用 `buding.js`。
3. 首次运行后会在 `./ruleset` 目录缓存订阅文件，保持客户端具备写权限。
4. 如需调整节点筛选规则，可编辑相应 `proxy-groups` 的 `filter`、`proxies` 或 `interval` 并重新加载配置。

## 自定义建议
- 需要添加新的服务时，可在 `rule-providers` 里新增订阅并在 `rules` 中插入相应条目，注意排在既有规则前，以免被更宽泛的规则抢先匹配。
- 若节点命名习惯不同，可适当修改 `exclude-filter` 或区域 `filter`，避免漏选或误选。
- `AUTO`/区域 `url-test` 默认 300 秒测速一次，可根据网络情况调整。较低的间隔会增加流量消耗。

脚本的完整逻辑位于 `buding.js`，通过 `return config;` 将覆写结果交回 Mihomo，便于与原订阅进行拼接或覆盖。
