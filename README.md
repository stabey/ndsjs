# Mihomo 覆写脚本（ndsjs）

## 简介
`buding.js` 是一个用于 Mihomo / Clash.Meta 的覆写（override）脚本。它通过导出的 `main(config)` 函数直接修改传入的配置对象，统一定义代理组、规则集订阅以及路由顺序，确保不同场景（AIGC、Telegram、Google、区域优选等）具有明确、可维护的分流策略。

脚本的所有变更点集中在以下三个部分：
1. 重写 `proxy-groups`，把基础分组与地区分组全部脚本化，根据订阅节点实时生成。
2. 覆盖或补全 `rule-providers`，共 14 个规则集，全部为 HTTP 类型、YAML 格式、每日（86400 秒）更新。
3. 重新定义 `rules`，通过 15 条规则串联全部规则集，末尾使用 `MATCH,PROXY` 兜底。

## 代理组定义
脚本现在把代理结构拆成“基础分组 + 地区分组”两部分，所有 `include-all` 类分组都会带上统一的 `exclude-filter`：`(?i)GB|Traffic|Expire|Premium|频道|订阅|ISP|流量|到期|重置`，避免把流量包节点加入自动选择。

- 基础分组固定 6 个（PROXY/AUTO/AIGC/Telegram/Google/GLOBAL），负责常见场景调度。
- 地区分组成对出现：`地区`（select 手动挑选） + `地区 AUTO`（url-test 自动测速）。当脚本检测到订阅中有对应节点才会写入；若缺少节点则整个分组直接省略。
- “其他”分组会把未命中任何地区关键词的节点统统接管，确保长尾地区也有单独的入口。

> 检测逻辑基于 `config.proxies` 中的节点名称。如果订阅只提供 `proxy-providers` 而暂未给出具体节点，脚本会自动退回旧的 `include-all + filter` 方案，此时代码无法判断哪些地区为空，分组会全部显示。

### 基础分组

| 名称 | 类型 | 关键字段 | 说明 |
| --- | --- | --- | --- |
| PROXY | select | `include-all: true`，`proxies = AUTO + 动态地区组（地区与地区 AUTO，去重）` | 用户主用出站。即使不进入地区分组也能直接在此选择 AUTO 或特定地区。 |
| AUTO | url-test | `include-all: true`，`interval: 300s` | 全局自动测速，延迟最低者优先。 |
| AUTO SELECT | select | `proxies = AUTO + 全部原始节点（可用时）`，否则回落到 `include-all` | 为 AUTO 增加手动挑选入口，避免自动测速强制切换。 |
| AIGC | select | `proxies = {SG/JP/US/Korea/India/Malaysia/OTHER AUTO} ∩ 可用组`，若均不存在则回落到 `PROXY` | 专供 OpenAI、Copilot、Claude、Bard、Bing 等 AI 服务。 |
| Telegram | select | `proxies = {HK/SG/JP/US/Korea/OTHER AUTO} ∩ 可用组`，无可用项时指向 `PROXY` | Telegram / MTProto 优选出口。 |
| Google | select | 同 Telegram，优先使用 HK/SG/JP/US/Korea/Other 的 AUTO 组 | Google 域名和 IP 的专用出口。 |
| GLOBAL | select | `include-all: true`，`proxies = AUTO + 所有地区 AUTO` | 作为备用全局出站，保留所有区域的自动测速结果。 |

> 除了上表的 `AUTO SELECT`，每个地区的 `url-test` 组也会配套生成一个同名（去掉 AUTO 的）`select` 组，保证所有 AUTO 都具备“手动锁定”入口。

### 地区分组

每个地区都包含一对分组：
- `地区`：`select` 类型，首个选项为 `地区 AUTO`，其余为脚本在订阅中识别出的真实节点，方便手动锁定。
- `地区 AUTO`：`url-test` 类型，仅包含同地区节点，300 秒测速一次。
- 仅当脚本在订阅节点名称中匹配到对应关键词时才会把该对分组写入配置；否则整对分组都会被省略（不会显示在客户端里）。

包含的地区与关键词如下：

| 地区 | 分组名称 | 匹配关键词（filter） | 说明 |
| --- | --- | --- | --- |
| 香港 | `HK` / `HK AUTO` | `(?i)香港|Hong Kong|HK|🇭🇰` | 识别所有香港节点，供 Telegram/Google 等优先选用。 |
| 新加坡 | `SG` / `SG AUTO` | `(?i)新加坡|Singapore|🇸🇬` | 添加非 AUTO 组后可在 SG 内部手动切换具体节点。 |
| 日本 | `JP` / `JP AUTO` | `(?i)日本|Japan|🇯🇵` | 同上。 |
| 美国 | `US` / `US AUTO` | `(?i)美国|USA|US|🇺🇸` | 同上。 |
| 马来西亚 | `Malaysia` / `Malaysia AUTO` | `(?i)马来|Malaysia|MY|🇲🇾` | 新增地区，方便 AIGC 或其他需求使用东南亚节点。 |
| 印度 | `India` / `India AUTO` | `(?i)印度|India|IN|🇮🇳` | 新增地区。 |
| 韩国 | `Korea` / `Korea AUTO` | `(?i)韩国|Korea|South Korea|KR|🇰🇷` | 新增地区。 |
| 其他 | `OTHER` / `OTHER AUTO` | `(?i).*`（配合 `exclude-filter` 排除上述所有地区） | 收拢未命中任何地区关键词的节点，保持长尾地区可用；同样会在没有节点时自动隐藏。 |

所有地区 AUTO 组都会使用和基础组一致的 `exclude-filter`，避免把 GB/Traffic/Expire 等节点加入测速列表。

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
- 地区分组在 `buding.js` 顶部的 `regionBlueprints` 数组维护，新增/删除地区只需增改对应的图标与关键词，同时“其他”分组会自动把剩余节点全部收入。
- `AUTO`/区域 `url-test` 默认 300 秒测速一次，可根据网络情况调整。较低的间隔会增加流量消耗。

脚本的完整逻辑位于 `buding.js`，通过 `return config;` 将覆写结果交回 Mihomo，便于与原订阅进行拼接或覆盖。
