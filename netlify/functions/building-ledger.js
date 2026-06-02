export async function handler(event) {
  try {
    const q = event.queryStringParameters || {};
    const serviceKey = process.env.BUILDING_API_KEY;
    const apiBase = process.env.BUILDING_API_URL || "https://apis.data.go.kr/1613000/BldRgstService_v2/getBrTitleInfo";

    if (!serviceKey) return json(500, { error: "BUILDING_API_KEY 환경변수가 설정되지 않았습니다." });

    const sigunguCd = q.sigunguCd;
    const bjdongCd = q.bjdongCd;
    const platGbCd = q.platGbCd || "0";
    const bun = pad4(q.bun || "");
    const ji = pad4(q.ji || "0");

    if (!sigunguCd || !bjdongCd || !bun) {
      return json(400, { error: "sigunguCd, bjdongCd, bun 값이 필요합니다." });
    }

    const url = new URL(apiBase);
    url.searchParams.set("serviceKey", serviceKey);
    url.searchParams.set("sigunguCd", sigunguCd);
    url.searchParams.set("bjdongCd", bjdongCd);
    url.searchParams.set("platGbCd", platGbCd);
    url.searchParams.set("bun", bun);
    url.searchParams.set("ji", ji);
    url.searchParams.set("numOfRows", "20");
    url.searchParams.set("pageNo", "1");
    url.searchParams.set("_type", "json");

    const res = await fetch(url.toString());
    const text = await res.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return json(502, { error: "건축물대장 API 응답을 JSON으로 해석하지 못했습니다.", raw: text.slice(0, 500) });
    }

    const header = data?.response?.header || {};
    if (header.resultCode && header.resultCode !== "00") {
      return json(502, { error: header.resultMsg || "건축물대장 API 오류", code: header.resultCode });
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

    return json(200, { items });
  } catch (err) {
    return json(500, { error: err.message });
  }
}

function pad4(v) {
  return String(v || "0").replace(/\D/g, "").padStart(4, "0").slice(-4);
}

function normalizeDate(v) {
  const s = String(v || "").replace(/\D/g, "");
  if (s.length !== 8) return "";
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
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