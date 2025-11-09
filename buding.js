function main(config) {
  const ICON_BASE = "https://testingcf.jsdelivr.net/gh/Orz-3/mini@master/Color";
  const URL_TEST_ENDPOINT = "https://cp.cloudflare.com/generate_204";
  const BAD_KEYWORDS = ["GB", "Traffic", "Expire", "Premium", "频道", "订阅", "ISP", "流量", "到期", "重置", "剩余", "套餐"];
  const BAD_PATTERN = BAD_KEYWORDS.map(escapeRegExp).join("|");
  const BAD_FILTER_STRING = `(?i)${BAD_KEYWORDS.join("|")}`;
  const BAD_REGEX = new RegExp(BAD_PATTERN, "i");

  const regionBlueprints = [
    createRegionTemplate("HK", `${ICON_BASE}/HK.png`, ["香港", "Hong Kong", "HK", "🇭🇰"]),
    createRegionTemplate("SG", `${ICON_BASE}/SG.png`, ["新加坡", "Singapore", "🇸🇬"]),
    createRegionTemplate("JP", `${ICON_BASE}/JP.png`, ["日本", "Japan", "🇯🇵"]),
    createRegionTemplate("US", `${ICON_BASE}/US.png`, ["美国", "USA", "US", "🇺🇸"]),
    createRegionTemplate("Taiwan", `${ICON_BASE}/TW.png`, ["台湾", "台灣", "Taiwan", "TW", "🇹🇼"]),
    createRegionTemplate("India", `${ICON_BASE}/IN.png`, ["印度", "India", "IN", "🇮🇳"]),
    createRegionTemplate("Korea", `${ICON_BASE}/KR.png`, ["韩国", "Korea", "South Korea", "KR", "🇰🇷"]),
    createRegionTemplate("Turkey", `${ICON_BASE}/TR.png`, ["土耳其", "Turkey", "Türkiye", "TR", "🇹🇷"]),
  ];
  const otherBlueprint = {
    name: "OTHER",
    icon: `${ICON_BASE}/Global.png`,
    filter: "(?i).*",
  };
  const regionKeywordPattern = regionBlueprints.map((item) => item.pattern).join("|");
  const otherExcludeFilter = `(?i)${BAD_KEYWORDS.join("|")}${regionKeywordPattern ? `|${regionKeywordPattern}` : ""}`;
  const providerNames = config["proxy-providers"]
    ? Object.keys(config["proxy-providers"]).filter((name) => typeof name === "string" && name.length > 0)
    : [];
  const canUseProviders = providerNames.length > 0;

  if (Array.isArray(config.proxies)) {
    config.proxies = config.proxies.filter(
      (proxy) => proxy && typeof proxy.name === "string" && !BAD_REGEX.test(proxy.name)
    );
  }

  const proxyNames = Array.isArray(config.proxies)
    ? config.proxies.map((proxy) => proxy && proxy.name).filter((name) => typeof name === "string")
    : [];
  const usableProxyNames = proxyNames;
  const canInspectProxies = usableProxyNames.length > 0;
  const remainingNames = canInspectProxies ? new Set(usableProxyNames) : null;

  const regionAutoGroups = [];
  const regionSelectGroups = [];
  const regionSelectNames = [];
  const regionAutoNames = [];

  regionBlueprints.forEach((blueprint) => {
    const nodes = canInspectProxies ? pullRegionNodes(blueprint.regex) : [];
    const shouldCreate = canInspectProxies ? nodes.length > 0 : true;
    if (!shouldCreate) {
      return;
    }
    const selectName = blueprint.name;
    const autoName = `${blueprint.name} AUTO`;
    regionSelectNames.push(selectName);
    regionAutoNames.push(autoName);
    const autoGroup = createAutoGroup(autoName, blueprint.icon, blueprint.filter, BAD_FILTER_STRING, nodes);
    const selectGroup = createSelectGroup(
      selectName,
      blueprint.icon,
      autoName,
      blueprint.filter,
      BAD_FILTER_STRING,
      nodes
    );
    regionAutoGroups.push(autoGroup);
    regionSelectGroups.push(selectGroup);
  });

  const otherNodes = canInspectProxies && remainingNames ? Array.from(remainingNames) : [];
  const shouldCreateOther = canInspectProxies ? otherNodes.length > 0 : true;
  if (shouldCreateOther) {
    const otherSelectName = otherBlueprint.name;
    const otherAutoName = `${otherBlueprint.name} AUTO`;
    regionSelectNames.push(otherSelectName);
    regionAutoNames.push(otherAutoName);
    const otherAutoGroup = createAutoGroup(
      otherAutoName,
      otherBlueprint.icon,
      otherBlueprint.filter,
      otherExcludeFilter,
      otherNodes
    );
    const otherSelectGroup = createSelectGroup(
      otherSelectName,
      otherBlueprint.icon,
      otherAutoName,
      otherBlueprint.filter,
      otherExcludeFilter,
      otherNodes
    );
    regionAutoGroups.push(otherAutoGroup);
    regionSelectGroups.push(otherSelectGroup);
  }

  const availableRegionGroups = new Set([...regionSelectNames, ...regionAutoNames]);
  const FALLBACK_GROUP = "漏网之鱼";
  const dedupedProxyList = dedupe(["DIRECT", ...regionSelectNames, ...regionAutoNames]);
  const scenarioGroupNames = [
    FALLBACK_GROUP,
    "AIGC",
    "Telegram",
    "Google",
    "GitHub",
    "Streaming",
    "Apple",
  ];
  const proxyGroup = {
    icon: `${ICON_BASE}/Static.png`,
    name: FALLBACK_GROUP,
    type: "select",
    proxies: dedupedProxyList,
  };
  const pickRegionGroups = (candidates, fallback) => {
    const filtered = candidates.filter((name) => availableRegionGroups.has(name));
    return filtered.length ? filtered : fallback;
  };
  const regionCandidates = (names) => names.flatMap((name) => [`${name} AUTO`, name]);
  const streamingRegions = ["HK", "SG", "JP", "US", "Korea", "Taiwan", "Turkey", "OTHER"];
  const aigcGroup = {
    icon: `${ICON_BASE}/OpenAI.png`,
    name: "AIGC",
    type: "select",
    proxies: pickRegionGroups(
      regionCandidates(["SG", "JP", "US", "Korea", "India", "Taiwan", "Turkey", "OTHER"]),
      [FALLBACK_GROUP]
    ),
  };
  const telegramGroup = {
    icon: `${ICON_BASE}/Telegram.png`,
    name: "Telegram",
    type: "select",
    proxies: pickRegionGroups(
      regionCandidates(["HK", "SG", "JP", "US", "Korea", "Taiwan", "Turkey", "OTHER"]),
      [FALLBACK_GROUP]
    ),
  };
  const googleGroup = {
    icon: `${ICON_BASE}/Google.png`,
    name: "Google",
    type: "select",
    proxies: pickRegionGroups(regionCandidates(streamingRegions), [FALLBACK_GROUP]),
  };
  const githubGroup = {
    icon: `${ICON_BASE}/Github.png`,
    name: "GitHub",
    type: "select",
    proxies: pickRegionGroups(regionCandidates(streamingRegions), [FALLBACK_GROUP]),
  };
  const streamingGroup = {
    icon: `${ICON_BASE}/Netflix.png`,
    name: "Streaming",
    type: "select",
    proxies: pickRegionGroups(regionCandidates(streamingRegions), [FALLBACK_GROUP]),
  };
  const appleCandidates = pickRegionGroups(regionCandidates(streamingRegions), [FALLBACK_GROUP]);
  const appleGroup = {
    icon: `${ICON_BASE}/Apple.png`,
    name: "Apple",
    type: "select",
    proxies: dedupe([...appleCandidates, "DIRECT"]),
  };
  const globalMembers = dedupe([...regionAutoNames, ...regionSelectNames, ...scenarioGroupNames]);
  const globalGroup = {
    icon: `${ICON_BASE}/Global.png`,
    "include-all": true,
    "exclude-filter": BAD_FILTER_STRING,
    name: "GLOBAL",
    type: "select",
    proxies: globalMembers,
  };

  config["proxy-groups"] = [
    ...regionAutoGroups,
    ...regionSelectGroups,
    proxyGroup,
    aigcGroup,
    telegramGroup,
    googleGroup,
    githubGroup,
    streamingGroup,
    appleGroup,
    globalGroup,
  ];

  function pullRegionNodes(regex) {
    if (!remainingNames) {
      return [];
    }
    const matched = [];
    for (const name of Array.from(remainingNames)) {
      if (regex.test(name)) {
        matched.push(name);
        remainingNames.delete(name);
      }
    }
    return matched;
  }

  function createSelectGroup(name, icon, autoName, filter, excludeFilter, nodes) {
    const group = {
      icon,
      name,
      type: "select",
    };
    if (canInspectProxies) {
      group.proxies = [autoName, ...nodes];
    } else {
      group["exclude-filter"] = excludeFilter;
      if (filter) {
        group.filter = filter;
      }
      if (!canUseProviders) {
        group["include-all"] = true;
      }
      group.proxies = [autoName];
    }
    return group;
  }

  function createAutoGroup(name, icon, filter, excludeFilter, nodes) {
    const group = {
      icon,
      name,
      type: "url-test",
      interval: 300,
      url: URL_TEST_ENDPOINT,
    };
    if (canInspectProxies) {
      group.proxies = nodes;
    } else {
      group["exclude-filter"] = excludeFilter;
      if (filter) {
        group.filter = filter;
      }
      if (canUseProviders) {
        group.use = providerNames;
      } else {
        group["include-all"] = true;
      }
    }
    return group;
  }

  function createRegionTemplate(name, icon, keywords) {
    const pattern = keywords.map(escapeRegExp).join("|");
    return {
      name,
      icon,
      pattern,
      filter: `(?i)${pattern}`,
      regex: new RegExp(pattern, "i"),
    };
  }

  function dedupe(list) {
    const seen = new Set();
    return list.filter((item) => {
      if (!item || seen.has(item)) {
        return false;
      }
      seen.add(item);
      return true;
    });
  }

  function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  if (!config['rule-providers']) {
    config['rule-providers'] = {};
  }
  config["rule-providers"] = Object.assign(config["rule-providers"], {
    private: {
      url: "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/private.yaml",
      path: "./ruleset/private.yaml",
      behavior: "domain",
      interval: 86400,
      format: "yaml",
      type: "http",
    },
    cn_domain: {
      url: "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/cn.yaml",
      path: "./ruleset/cn_domain.yaml",
      behavior: "domain",
      interval: 86400,
      format: "yaml",
      type: "http",
    },
    telegram_domain: {
      url: "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/telegram.yaml",
      path: "./ruleset/telegram_domain.yaml",
      behavior: "domain",
      interval: 86400,
      format: "yaml",
      type: "http",
    },
    google_domain: {
      url: "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/google.yaml",
      path: "./ruleset/google_domain.yaml",
      behavior: "domain",
      interval: 86400,
      format: "yaml",
      type: "http",
    },
    "geolocation-!cn": {
      url: "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/geolocation-!cn.yaml",
      path: "./ruleset/geolocation-!cn.yaml",
      behavior: "domain",
      interval: 86400,
      format: "yaml",
      type: "http",
    },
    cn_ip: {
      url: "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geoip/cn.yaml",
      path: "./ruleset/cn_ip.yaml",
      behavior: "ipcidr",
      interval: 86400,
      format: "yaml",
      type: "http",
    },
    telegram_ip: {
      url: "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geoip/telegram.yaml",
      path: "./ruleset/telegram_ip.yaml",
      behavior: "ipcidr",
      interval: 86400,
      format: "yaml",
      type: "http",
    },
    google_ip: {
      url: "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geoip/google.yaml",
      path: "./ruleset/google_ip.yaml",
      behavior: "ipcidr",
      interval: 86400,
      format: "yaml",
      type: "http",
    },
    github: {
      url: "https://raw.githubusercontent.com/stabey/ndsjs/main/rules/github.yaml",
      path: "./ruleset/github.yaml",
      behavior: "classical",
      interval: 86400,
      format: "yaml",
      type: "http",
    },
    bing: {
      url: "https://testingcf.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Clash/Bing/Bing.yaml",
      path: "./ruleset/bing.yaml",
      behavior: "classical",
      interval: 86400,
      format: "yaml",
      type: "http",
    },
    copilot: {
      url: "https://testingcf.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Clash/Copilot/Copilot.yaml",
      path: "./ruleset/copilot.yaml",
      behavior: "classical",
      interval: 86400,
      format: "yaml",
      type: "http",
    },
    claude: {
      url: "https://testingcf.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Clash/Claude/Claude.yaml",
      path: "./ruleset/claude.yaml",
      behavior: "classical",
      interval: 86400,
      format: "yaml",
      type: "http",
    },
    bard: {
      url: "https://testingcf.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Clash/BardAI/BardAI.yaml",
      path: "./ruleset/bard.yaml",
      behavior: "classical",
      interval: 86400,
      format: "yaml",
      type: "http",
    },
    openai: {
      url: "https://testingcf.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Clash/OpenAI/OpenAI.yaml",
      path: "./ruleset/openai.yaml",
      behavior: "classical",
      interval: 86400,
      format: "yaml",
      type: "http",
    },
    steam: {
      url: "https://testingcf.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Clash/Steam/Steam.yaml",
      path: "./ruleset/steam.yaml",
      behavior: "classical",
      interval: 86400,
      format: "yaml",
      type: "http",
    },
    streaming_media: {
      url: "https://raw.githubusercontent.com/stabey/ndsjs/main/rules/streaming-media.yaml",
      path: "./ruleset/streaming-media.yaml",
      behavior: "classical",
      interval: 86400,
      format: "yaml",
      type: "http",
    },
    apple: {
      url: "https://raw.githubusercontent.com/stabey/ndsjs/main/rules/apple.yaml",
      path: "./ruleset/apple.yaml",
      behavior: "classical",
      interval: 86400,
      format: "yaml",
      type: "http",
    },
    steam_cn: {
      url: "https://testingcf.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Clash/SteamCN/SteamCN.yaml",
      path: "./ruleset/steam_cn.yaml",
      behavior: "classical",
      interval: 86400,
      format: "yaml",
      type: "http",
    },
  });

  config["rules"] = [
    "RULE-SET,private,DIRECT",
    "RULE-SET,streaming_media,Streaming",
    "RULE-SET,apple,Apple",
    "RULE-SET,bing,AIGC",
    "RULE-SET,copilot,AIGC",
    "RULE-SET,bard,AIGC",
    "RULE-SET,openai,AIGC",
    "RULE-SET,claude,AIGC",
    "RULE-SET,steam_cn,DIRECT",
    "RULE-SET,steam,漏网之鱼",
    "RULE-SET,telegram_domain,Telegram",
    "RULE-SET,telegram_ip,Telegram",
    "RULE-SET,google_domain,Google",
    "RULE-SET,google_ip,Google",
    "RULE-SET,github,GitHub",
    "RULE-SET,geolocation-!cn,漏网之鱼",
    "RULE-SET,cn_domain,DIRECT",
    "RULE-SET,cn_ip,DIRECT",
    "MATCH,漏网之鱼",
  ];
  return config;
}
