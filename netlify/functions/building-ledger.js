export async function handler(event) {
  try {
    const q = event.queryStringParameters || {};
    const serviceKey = (process.env.BUILDING_API_KEY || "").trim();

    const apiBase =
      process.env.BUILDING_API_URL ||
      "http://apis.data.go.kr/1613000/BldRgstService_v2/getBrTitleInfo";

    if (!serviceKey) {
      console.error("[building-ledger] BUILDING_API_KEY 없음");
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
      ji
    });

    if (!sigunguCd || !bjdongCd || !bun) {
      return json(400, {
        error: "sigunguCd, bjdongCd, bun 값이 필요합니다.",
        received: { sigunguCd, bjdongCd, bun, ji }
      });
    }

    const params = new URLSearchParams();
    params.set("sigunguCd", sigunguCd);
    params.set("bjdongCd", bjdongCd);
    params.set("platGbCd", platGbCd);
    params.set("bun", bun);
    params.set("ji", ji);
    params.set("numOfRows", "20");
    params.set("pageNo", "1");
    params.set("_type", "json");

    const url = `${apiBase}?serviceKey=${safeServiceKey(serviceKey)}&${params.toString()}`;

    console.log("[building-ledger] 키 없는 URL 요청", {
      apiBase,
      sigunguCd,
      bjdongCd,
      platGbCd,
      bun,
      ji
    });

    const res = await fetch(url);
    const text = await res.text();

    console.log("[building-ledger] 응답", {
      status: res.status,
      preview: text.slice(0, 300)
    });

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      const xmlMsg =
        extractXmlTag(text, "returnAuthMsg") ||
        extractXmlTag(text, "errMsg") ||
        extractXmlTag(text, "resultMsg") ||
        extractXmlTag(text, "cmmMsgHeader");

      console.error("[building-ledger] JSON 파싱 실패", {
        status: res.status,
        xmlMsg,
        raw: text.slice(0, 1000)
      });

      return json(502, {
        error: "건축물대장 API 응답을 JSON으로 해석하지 못했습니다.",
        status: res.status,
        message: xmlMsg || "공공데이터 API가 JSON이 아닌 응답을 반환했습니다.",
        raw: text.slice(0, 1000)
      });
    }

    const header = data?.response?.header || {};
    const resultCode = String(header.resultCode || "");
    const resultMsg = String(header.resultMsg || "");

    if (resultCode && resultCode !== "00") {
      console.error("[building-ledger] API resultCode 오류", {
        resultCode,
        resultMsg,
        header
      });

      return json(502, {
        error: resultMsg || "건축물대장 API 오류",
        code: resultCode,
        header
      });
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

    return json(200, {
      items,
      count: items.length
    });
  } catch (err) {
    console.error("[building-ledger] server error", err);

    return json(500, {
      error: err?.message || "건축물대장 함수 내부 오류가 발생했습니다."
    });
  }
}

function safeServiceKey(key) {
  const trimmed = String(key || "").trim();

  if (/%[0-9A-Fa-f]{2}/.test(trimmed)) {
    return trimmed;
  }

  return encodeURIComponent(trimmed);
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

function extractXmlTag(text, tagName) {
  const match = String(text || "").match(
    new RegExp(`<${tagName}>(.*?)</${tagName}>`, "is")
  );
  return match ? match[1].trim() : "";
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*"
    },
    body: JSON.stringify(body)
  };
}
