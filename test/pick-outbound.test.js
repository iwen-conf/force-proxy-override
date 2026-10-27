const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  pickOutbound,
  canBeOutbound,
  nameLooksDirect,
  nameLooksProxy,
  applyForceProxy,
  buildForceRules,
  stripConflicting,
  ruleKey,
} = require("../force-proxy.js");

describe("name classifiers", () => {
  it("treats 漏网之鱼 / 直连 as direct-like", () => {
    assert.equal(nameLooksDirect("漏网之鱼"), true);
    assert.equal(nameLooksDirect("GLOBAL 直连"), true);
    assert.equal(nameLooksDirect("广告拦截"), true);
    assert.equal(nameLooksDirect("DIRECT"), true);
  });

  it("does not treat Redirect or 节点选择 as direct-like", () => {
    assert.equal(nameLooksDirect("Redirect"), false);
    assert.equal(nameLooksDirect("🚀 节点选择"), false);
    assert.equal(nameLooksDirect("PROXY"), false);
  });

  it("recognizes common proxy group names", () => {
    assert.equal(nameLooksProxy("🚀 节点选择"), true);
    assert.equal(nameLooksProxy("PROXY"), true);
    assert.equal(nameLooksProxy("代理模式"), true);
    assert.equal(nameLooksProxy("♻️ 自动选择"), false);
  });
});

describe("canBeOutbound", () => {
  it("rejects groups whose first item is DIRECT", () => {
    assert.equal(
      canBeOutbound({
        name: "漏网之鱼",
        type: "select",
        proxies: ["DIRECT", "HK"],
      }),
      false
    );
  });

  it("accepts 节点选择 whose first item is a real group", () => {
    assert.equal(
      canBeOutbound({
        name: "🚀 节点选择",
        type: "select",
        proxies: ["自动选择", "DIRECT"],
      }),
      true
    );
  });

  it("accepts include-all url-test with empty proxies list", () => {
    assert.equal(
      canBeOutbound({
        name: "AUTO",
        type: "url-test",
        "include-all": true,
        proxies: [],
      }),
      true
    );
  });
});

describe("pickOutbound", () => {
  const groups = [
    {
      name: "漏网之鱼",
      type: "select",
      proxies: ["DIRECT", "HK-1"],
    },
    {
      name: "🚀 节点选择",
      type: "select",
      proxies: ["自动选择", "HK-1", "US-1"],
    },
    {
      name: "自动选择",
      type: "url-test",
      proxies: ["HK-1", "US-1"],
    },
  ];
  const proxies = [{ name: "HK-1" }, { name: "US-1" }];

  it("uses MATCH target when that group can be an outbound", () => {
    const name = pickOutbound({
      "proxy-groups": groups,
      proxies: proxies,
      rules: ["DOMAIN-SUFFIX,cn,DIRECT", "MATCH,🚀 节点选择"],
    });
    assert.equal(name, "🚀 节点选择");
  });

  it("skips MATCH 漏网之鱼 and falls back to 节点选择", () => {
    const name = pickOutbound({
      "proxy-groups": groups,
      proxies: proxies,
      rules: ["GEOIP,CN,DIRECT", "MATCH,漏网之鱼"],
    });
    assert.equal(name, "🚀 节点选择");
  });

  it("honors a hardcoded outbound name", () => {
    const name = pickOutbound(
      { "proxy-groups": groups, proxies: proxies, rules: ["MATCH,漏网之鱼"] },
      { outbound: "自动选择" }
    );
    assert.equal(name, "自动选择");
  });

  it("picks the first outbound-capable select when names do not match", () => {
    const name = pickOutbound({
      "proxy-groups": [
        { name: "国内", type: "select", proxies: ["DIRECT"] },
        { name: "家宽", type: "select", proxies: ["Home-1"] },
      ],
      proxies: [{ name: "Home-1" }],
      rules: ["MATCH,国内"],
    });
    assert.equal(name, "家宽");
  });

  it("falls back to the first node when there is no usable group", () => {
    const name = pickOutbound({
      "proxy-groups": [
        { name: "直连", type: "select", proxies: ["DIRECT"] },
      ],
      proxies: [{ name: "SS-HK" }],
      rules: ["MATCH,直连"],
    });
    assert.equal(name, "SS-HK");
  });

  it("throws when nothing can go abroad", () => {
    assert.throws(
      () =>
        pickOutbound({
          "proxy-groups": [{ name: "直连", type: "select", proxies: ["DIRECT"] }],
          proxies: [],
          rules: ["MATCH,直连"],
        }),
      /找不到能出国/
    );
  });
});

describe("applyForceProxy", () => {
  function baseConfig() {
    return {
      proxies: [{ name: "HK-1", type: "ss" }],
      "proxy-groups": [
        {
          name: "漏网之鱼",
          type: "select",
          proxies: ["DIRECT", "HK-1"],
        },
        {
          name: "节点选择",
          type: "select",
          proxies: ["HK-1"],
        },
      ],
      rules: [
        "DOMAIN-SUFFIX,github.com,DIRECT",
        "GEOIP,CN,DIRECT",
        "MATCH,漏网之鱼",
      ],
    };
  }

  it("prepends rules that point at 强制代理, not 漏网之鱼", () => {
    const config = applyForceProxy(baseConfig(), "airport-a", {
      domainSuffix: ["github.com", "openai.com"],
    });
    assert.equal(config.rules[0], "DOMAIN-SUFFIX,github.com,强制代理");
    assert.equal(config.rules[1], "DOMAIN-SUFFIX,openai.com,强制代理");
    assert.ok(config.rules.indexOf("DOMAIN-SUFFIX,github.com,DIRECT") === -1);
    assert.equal(config.rules[config.rules.length - 1], "MATCH,漏网之鱼");
    assert.equal(config["proxy-groups"][0].name, "强制代理");
    assert.equal(config["proxy-groups"][0].proxies[0], "节点选择");
    assert.ok(config["proxy-groups"][0].proxies.indexOf("漏网之鱼") === -1);
  });

  it("keeps MATCH fallback after the force rules so the rest of traffic is unchanged", () => {
    const config = applyForceProxy(baseConfig(), "", {
      domainSuffix: ["github.com"],
    });
    assert.ok(config.rules.indexOf("GEOIP,CN,DIRECT") >= 0);
    assert.ok(config.rules.indexOf("MATCH,漏网之鱼") >= 0);
  });

  it("inserts QUIC reject rules ahead of the domain rules", () => {
    const config = applyForceProxy(baseConfig(), "", {
      domainSuffix: ["openai.com"],
      rejectQuic: true,
    });
    assert.match(config.rules[0], /^AND,\(\(DOMAIN-SUFFIX,openai.com\)/);
    assert.equal(config.rules[1], "DOMAIN-SUFFIX,openai.com,强制代理");
  });

  it("turns on sniffer and process matching when asked", () => {
    const config = applyForceProxy(baseConfig(), "", {
      domainSuffix: ["github.com"],
      processName: ["Telegram"],
      enableSniffer: true,
    });
    assert.equal(config.sniffer.enable, true);
    assert.equal(config["find-process-mode"], "strict");
    assert.ok(config.rules.indexOf("PROCESS-NAME,Telegram,强制代理") >= 0);
  });

  it("is a no-op when CONFIG has no targets", () => {
    const before = baseConfig();
    const config = applyForceProxy(before, "", { domainSuffix: [] });
    assert.equal(config.rules[0], "DOMAIN-SUFFIX,github.com,DIRECT");
    assert.equal(config["proxy-groups"][0].name, "漏网之鱼");
  });
});

describe("rule helpers", () => {
  it("keys DOMAIN-SUFFIX rules without the outbound", () => {
    assert.equal(
      ruleKey("DOMAIN-SUFFIX,GitHub.com,DIRECT"),
      "DOMAIN-SUFFIX,github.com"
    );
  });

  it("strips an old same-domain rule so the new one wins", () => {
    const force = buildForceRules(
      { domainSuffix: ["github.com"], domain: [], domainKeyword: [], processName: [], rejectQuic: false },
      "强制代理"
    );
    const kept = stripConflicting(
      ["DOMAIN-SUFFIX,github.com,DIRECT", "GEOIP,CN,DIRECT"],
      force
    );
    assert.deepEqual(kept, ["GEOIP,CN,DIRECT"]);
  });
});
