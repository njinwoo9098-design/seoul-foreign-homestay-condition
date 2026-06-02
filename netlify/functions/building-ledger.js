export async function handler(event) {
  try {
    if (event.httpMethod === "OPTIONS") {
      return json(200, { ok: true });
    }

    const q = event.queryStringParameters || {};

    const rawServiceKey = process.env.BUILDING_API_KEY || "";
    const cleanServiceKey = rawServiceKey.replace(/\s/g, "");

    if (!cleanServiceKey) {
      return json(500, {
        error: "BUILDING_API_KEY 환경변수가 설정되지 않았습니다."
      });
    }

    const sigunguCd = String(q.sigunguCd || "").trim();
    const bjdongCd = String(q.bjdongCd || "").trim();
    const platGbCd = String(q.platGbCd || "0").trim();
    const bun = pad4(q.bun || "");
    const ji = pad4(q.ji || "0");

    console.log("[building-ledger] params", {
      sigunguCd,
      bjdongCd,
      platGbCd,
      bun,
      ji,
      keyLength: cleanServiceKey.length,
      keyHasPercentEncoding: /%[0-9A-Fa-f]{2}/.test(cleanServiceKey),
      keyHadWhitespace: rawServiceKey !== cleanServiceKey
    });

    if (!sigunguCd || !bjdongCd || !bun) {
      return json(400, {
        error: "sigunguCd, bjdongCd, bun 값이 필요합니다.",
        received: { sigunguCd, bjdongCd, bun, ji }
      });
    }

    const bases = unique([
      process.env.BUILDING_API_URL,
      "https://apis.data.go.kr/1613000/BldRgstService_v2/getBrTitleInfo",
      "http://apis.data.go.kr/1613000/BldRgstService_v2/getBrTitleInfo"
    ].filter(Boolean));

    const serviceKeys = makeServiceKeyCandidates(cleanServiceKey);

    const attempts = [];

    for (const apiBase of bases) {
      for (const serviceKey of serviceKeys) {
        const result = await callBuildingApi({
          apiBase,
          serviceKey,
          sigunguCd,
          bjdongCd,
          platGbCd,
          bun,
          ji
        });

        attempts.push({
          apiBase,
          keyMode: result.keyMode,
          status: result.status,
          ok: result.ok,
          preview: result.preview
        });

        if (result.ok) {
          return json(200, result.body);
        }
      }
    }

    return json(502, {
      error: "건축물대장 API 조회에 실패했습니다.",
      message: "공공데이터포털 직접 테스트는 성공했으므로 Netlify 환경변수 BUILDING_API_KEY 값의 줄바꿈/공백/인코딩 문제 가능성이 큽니다.",
      attempts
    });
  } catch (err) {
    console.error("[building-ledger] server error", err);
    return json(500, {
      error: err?.message || "건축물대장 함수 내부 오류가 발생했습니다."
    });
  }
}

async function callBuildingApi({
  apiBase,
  serviceKey,
  sigunguCd,
  bjdongCd,
  platGbCd,
  bun,
  ji
}) {
  const params = new URLSearchParams();
  params.set("sigunguCd", sigunguCd);
  params.set("bjdongCd", bjdongCd);
  params.set("platGbCd", platGbCd);
  params.set("bun", bun);
  params.set("ji", ji);
  params.set("numOfRows", "1");
  params.set("pageNo", "1");
  params.set("_type", "json");

  const url = `${apiBase}?serviceKey=${serviceKey.value}&${params.toString()}`;

  console.log("[building-ledger] request", {
    apiBase,
    keyMode: serviceKey.mode,
    sigunguCd,
    bjdongCd,
    platGbCd,
    bun,
    ji
  });

  const res = await fetch(url);
  const text = await res.text();

  console.log("[building-ledger] response", {
    apiBase,
    keyMode: serviceKey.mode,
    status: res.status,
    preview: text.slice(0, 300)
  });

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return {
      ok: false,
      status: res.status,
      keyMode: serviceKey.mode,
      preview: text.slice(0, 300)
    };
  }

  const header = data?.response?.header || {};
  const resultCode = String(header.resultCode || "");
  const resultMsg = String(header.resultMsg || "");

  if (resultCode && resultCode !== "00") {
    return {
      ok: false,
      status: res.status,
      keyMode: serviceKey.mode,
      preview: `${resultCode} / ${resultMsg}`
    };
  }

  const rawItems = data?.response?.body?.items?.item;
  const list = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];

  const items = list.map((item) => ({
    buildingName: item.bldNm || "",
    platPlc: item.platPlc || "",
    newPlatPlc: item.newPlatPlc || "",
    dongName: item.dongNm || "",
    structure: item.strctCdNm || item.etcStrct || "",
    approvalDate: normalizeDate(item.useAprDay || ""),
    mainUse: item.mainPurpsCdNm || "",
    grndFlrCnt: item.grndFlrCnt || "",
    ugrndFlrCnt: item.ugrndFlrCnt || ""
  }));

  return {
    ok: true,
    status: res.status,
    keyMode: serviceKey.mode,
    preview: "NORMAL SERVICE",
    body: {
      items,
      count: items.length
    }
  };
}

function makeServiceKeyCandidates(key) {
  const candidates = [];

  candidates.push({
    mode: "raw",
    value: key
  });

  candidates.push({
    mode: "encodeURIComponent",
    value: encodeURIComponent(key)
  });

  try {
    const decoded = decodeURIComponent(key);
    candidates.push({
      mode: "decodeURIComponent_then_encodeURIComponent",
      value: encodeURIComponent(decoded)
    });

    candidates.push({
      mode: "decoded_raw",
      value: decoded
    });
  } catch {
    // 이미 디코딩 키면 여기서 무시
  }

  const seen = new Set();
  return candidates.filter((item) => {
    if (!item.value || seen.has(item.value)) return false;
    seen.add(item.value);
    return true;
  });
}

function pad4(v) {
  return String(v || "0")
    .replace(/\D/g, "")
    .padStart(4, "0")
    .slice(-4);
}

function normalizeDate(v) {
  const s = String(v || "").replace(/\D/g, "");
  if (s.length !== 8) return "";
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

function unique(arr) {
  return [...new Set(arr)];
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET, OPTIONS"
    },
    body: JSON.stringify(body)
  };
}
