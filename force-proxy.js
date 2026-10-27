/**
 * force-proxy.js
 *
 * Clash Verge Rev / Clash Party / Mihomo Party / Sparkle 覆写脚本。
 * 指定域名或进程强制走真实出国出口，不开全局，不被订阅更新冲掉。
 *
 * 用法：导入本文件后只改下面 CONFIG。多订阅共用同一份脚本。
 */

// ========== 只改这里 ==========
var CONFIG = {
  // Grok Bot / xAI。后缀匹配含子域，例如 grok.com → auth.grok.com、connectors-gateway.grok.com
  domainSuffix: [
    "grok.com",
    "grokusercontent.com",
    "grokipedia.com",
    "x.ai",
    "spacex.ai",
  ],
  domainKeyword: [],
  domain: [],
  // macOS 进程名（Grok Bot.app 的可执行文件是 "Grok Bot"，Helper 也要算进去）
  processName: [
    "Grok Bot",
    "Grok Bot Helper",
    "Grok Bot Helper (GPU)",
    "Grok Bot Helper (Renderer)",
    "Grok Bot Helper (Plugin)",
  ],
  // Mihomo / Clash Meta 正则，一条盖住所有 Grok Bot 进程
  processNameRegex: ["(?i)Grok Bot"],
  outbound: "",
  groupName: "Grok Bot",
  rejectQuic: true,
  enableSniffer: true,
  allowDirectFallback: false,
};
// ========== 改到这里 ==========

var BUILTIN = /^(DIRECT|REJECT|REJECT-DROP|PASS|COMPATIBLE)$/i;

function log(msg) {
  if (typeof console !== "undefined" && console.log) {
    console.log(msg);
  }
}

function hasTargets(opt) {
  return (
    opt.domainSuffix.length +
      opt.domainKeyword.length +
      opt.domain.length +
      opt.processName.length +
      opt.processNameRegex.length >
    0
  );
}

function mergeOpt(opt) {
  opt = opt || {};
  return {
    domainSuffix: opt.domainSuffix || [],
    domainKeyword: opt.domainKeyword || [],
    domain: opt.domain || [],
    processName: opt.processName || [],
    processNameRegex: opt.processNameRegex || [],
    outbound: opt.outbound || "",
    groupName: opt.groupName || "Grok Bot",
    rejectQuic: !!opt.rejectQuic,
    enableSniffer: opt.enableSniffer !== false,
    allowDirectFallback: !!opt.allowDirectFallback,
  };
}

function nameLooksDirect(name) {
  if (/直连|漏网|兜底|拦截|广告|屏蔽/.test(name)) return true;
  if (/(^|[^A-Za-z])(direct|reject|block)([^A-Za-z]|$)/i.test(name)) return true;
  return false;
}

function nameLooksProxy(name) {
  if (/节点选择|手动选择|代理模式|全球代理|国外|外网/.test(name)) return true;
  if (/(^|[^A-Za-z])(proxy|proxies)([^A-Za-z]|$)/i.test(name)) return true;
  if (/🚀|✈️/.test(name)) return true;
  return false;
}

function isSelectish(group) {
  var t = String((group && group.type) || "select").toLowerCase();
  return (
    t === "select" ||
    t === "url-test" ||
    t === "fallback" ||
    t === "load-balance" ||
    t === "smart"
  );
}

function firstProxy(group) {
  if (!group || !group.proxies || !group.proxies.length) return "";
  return String(group.proxies[0]);
}

function canBeOutbound(group) {
  if (!group || !group.name) return false;
  if (!isSelectish(group)) return false;
  if (nameLooksDirect(group.name) && !nameLooksProxy(group.name)) return false;
  var first = firstProxy(group);
  if (first && BUILTIN.test(first)) return false;
  return true;
}

function groupMap(groups) {
  var map = {};
  for (var i = 0; i < groups.length; i++) {
    if (groups[i] && groups[i].name) map[groups[i].name] = groups[i];
  }
  return map;
}

function findMatchTarget(rules) {
  if (!rules || !rules.length) return "";
  for (var i = rules.length - 1; i >= 0; i--) {
    var parts = String(rules[i] || "").split(",");
    if (parts.length >= 2 && parts[0].trim().toUpperCase() === "MATCH") {
      return parts[1].trim();
    }
  }
  return "";
}

function pickOutbound(config, opt) {
  opt = mergeOpt(opt);
  if (opt.outbound) return opt.outbound;

  var groups = (config && config["proxy-groups"]) || [];
  var proxies = (config && config.proxies) || [];
  var rules = (config && config.rules) || [];
  var byName = groupMap(groups);
  var i;
  var g;

  var matchName = findMatchTarget(rules);
  if (matchName && canBeOutbound(byName[matchName])) return matchName;

  for (i = 0; i < groups.length; i++) {
    g = groups[i];
    if (g && nameLooksProxy(g.name) && canBeOutbound(g)) return g.name;
  }

  for (i = 0; i < groups.length; i++) {
    g = groups[i];
    if (
      g &&
      String(g.type || "select").toLowerCase() === "select" &&
      canBeOutbound(g)
    ) {
      return g.name;
    }
  }

  for (i = 0; i < groups.length; i++) {
    if (canBeOutbound(groups[i])) return groups[i].name;
  }

  for (i = 0; i < proxies.length; i++) {
    if (proxies[i] && proxies[i].name && !BUILTIN.test(proxies[i].name)) {
      return proxies[i].name;
    }
  }

  throw new Error("force-proxy: 找不到能出国的出口组或节点");
}

function unique(list) {
  var seen = {};
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var item = list[i];
    if (!item || seen[item]) continue;
    seen[item] = true;
    out.push(item);
  }
  return out;
}

function ensureForceGroup(config, outbound, opt) {
  var groups = config["proxy-groups"] || [];
  var names = [outbound];
  for (var i = 0; i < groups.length; i++) {
    var n = groups[i] && groups[i].name;
    if (!n || n === outbound || n === opt.groupName) continue;
    if (canBeOutbound(groups[i])) names.push(n);
  }
  if (opt.allowDirectFallback) names.push("DIRECT");

  var group = {
    name: opt.groupName,
    type: "select",
    proxies: unique(names),
  };

  var idx = -1;
  for (var k = 0; k < groups.length; k++) {
    if (groups[k] && groups[k].name === opt.groupName) {
      idx = k;
      break;
    }
  }
  if (idx >= 0) groups[idx] = group;
  else groups.unshift(group);
  config["proxy-groups"] = groups;
  return group;
}

function ruleKey(rule) {
  var parts = String(rule || "").split(",");
  if (parts.length < 2) return String(rule || "");
  return parts[0].trim().toUpperCase() + "," + parts[1].trim().toLowerCase();
}

function buildForceRules(opt, groupName) {
  opt = mergeOpt(opt);
  groupName = groupName || opt.groupName;
  var rules = [];
  var i;
  if (opt.rejectQuic) {
    for (i = 0; i < opt.domainSuffix.length; i++) {
      rules.push(
        "AND,((DOMAIN-SUFFIX," +
          opt.domainSuffix[i] +
          "),(NETWORK,udp),(DST-PORT,443)),REJECT"
      );
    }
    for (i = 0; i < opt.domain.length; i++) {
      rules.push(
        "AND,((DOMAIN," +
          opt.domain[i] +
          "),(NETWORK,udp),(DST-PORT,443)),REJECT"
      );
    }
  }
  for (i = 0; i < opt.domain.length; i++) {
    rules.push("DOMAIN," + opt.domain[i] + "," + groupName);
  }
  for (i = 0; i < opt.domainSuffix.length; i++) {
    rules.push("DOMAIN-SUFFIX," + opt.domainSuffix[i] + "," + groupName);
  }
  for (i = 0; i < opt.domainKeyword.length; i++) {
    rules.push("DOMAIN-KEYWORD," + opt.domainKeyword[i] + "," + groupName);
  }
  for (i = 0; i < opt.processName.length; i++) {
    rules.push("PROCESS-NAME," + opt.processName[i] + "," + groupName);
  }
  for (i = 0; i < opt.processNameRegex.length; i++) {
    rules.push("PROCESS-NAME-REGEX," + opt.processNameRegex[i] + "," + groupName);
  }
  return rules;
}

function stripConflicting(rules, forceRules) {
  var keys = {};
  for (var i = 0; i < forceRules.length; i++) {
    keys[ruleKey(forceRules[i])] = true;
  }
  var out = [];
  for (var j = 0; j < rules.length; j++) {
    if (!keys[ruleKey(rules[j])]) out.push(rules[j]);
  }
  return out;
}

function ensureSniffer(config) {
  var s = config.sniffer || {};
  s.enable = true;
  if (s["parse-pure-ip"] == null) s["parse-pure-ip"] = true;
  if (!s.sniff) {
    s.sniff = {
      TLS: { ports: [443, 8443] },
      HTTP: { ports: [80, "8080-8880"] },
    };
  }
  config.sniffer = s;
}

function applyForceProxy(config, profileName, opt) {
  if (!config || typeof config !== "object") return config;
  opt = mergeOpt(opt);
  if (!hasTargets(opt)) {
    log("[force-proxy] CONFIG 是空的，没有写入规则");
    return config;
  }

  var outbound = pickOutbound(config, opt);
  ensureForceGroup(config, outbound, opt);
  var forceRules = buildForceRules(opt, opt.groupName);
  config.rules = forceRules.concat(stripConflicting(config.rules || [], forceRules));

  if (opt.processName.length || opt.processNameRegex.length) {
    var mode = config["find-process-mode"];
    if (!mode || String(mode).toLowerCase() === "off") {
      config["find-process-mode"] = "strict";
    }
  }

  if (opt.enableSniffer) ensureSniffer(config);

  log(
    "[force-proxy] profile=" +
      (profileName || "") +
      " outbound=" +
      outbound +
      " group=" +
      opt.groupName +
      " rules=" +
      forceRules.length
  );
  return config;
}

function main(config, profileName) {
  return applyForceProxy(config, profileName, CONFIG);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    CONFIG: CONFIG,
    main: main,
    applyForceProxy: applyForceProxy,
    pickOutbound: pickOutbound,
    canBeOutbound: canBeOutbound,
    nameLooksDirect: nameLooksDirect,
    nameLooksProxy: nameLooksProxy,
    buildForceRules: buildForceRules,
    stripConflicting: stripConflicting,
    ruleKey: ruleKey,
  };
}
