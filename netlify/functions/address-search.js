export async function handler(event) {
  try {
    const keyword = (event.queryStringParameters?.keyword || "").trim();
    const confmKey = process.env.JUSO_API_KEY;

    if (!confmKey) return json(500, { error: "JUSO_API_KEY 환경변수가 설정되지 않았습니다." });
    if (!keyword) return json(400, { error: "keyword 값이 필요합니다." });

    const url = new URL("https://business.juso.go.kr/addrlink/addrLinkApi.do");
    url.searchParams.set("confmKey", confmKey);
    url.searchParams.set("currentPage", "1");
    url.searchParams.set("countPerPage", "10");
    url.searchParams.set("keyword", keyword);
    url.searchParams.set("resultType", "json");
    url.searchParams.set("hstryYn", "N");
    url.searchParams.set("firstSort", "none");

    const res = await fetch(url.toString());
    const text = await res.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return json(502, { error: "주소검색 API 응답을 JSON으로 해석하지 못했습니다.", raw: text.slice(0, 500) });
    }

    const common = data?.results?.common || {};
    if (common.errorCode && common.errorCode !== "0") {
      return json(502, { error: common.errorMessage || "주소검색 API 오류", code: common.errorCode });
    }

    const juso = data?.results?.juso || [];
    const addresses = juso.map((item) => {
      const admCd = String(item.admCd || "");
      const lnbrMnnm = String(item.lnbrMnnm || "0").replace(/\D/g, "");
      const lnbrSlno = String(item.lnbrSlno || "0").replace(/\D/g, "");
      const mtYn = String(item.mtYn || "0");

      return {
        roadAddr: item.roadAddr || "",
        jibunAddr: item.jibunAddr || "",
        siNm: item.siNm || "",
        sggNm: item.sggNm || "",
        emdNm: item.emdNm || "",
        admCd,
        bdMgtSn: item.bdMgtSn || "",
        mtYn,
        lnbrMnnm,
        lnbrSlno,
        sigunguCd: admCd.slice(0, 5),
        bjdongCd: admCd.slice(5, 10),
        platGbCd: mtYn === "1" ? "1" : "0",
        bun: pad4(lnbrMnnm),
        ji: pad4(lnbrSlno)
      };
    });

    return json(200, { addresses });
  } catch (err) {
    return json(500, { error: err.message });
  }
}

function pad4(v) {
  return String(v || "0").replace(/\D/g, "").padStart(4, "0").slice(-4);
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