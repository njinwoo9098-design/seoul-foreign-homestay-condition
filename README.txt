서울시자치구 외도민신청조건 - Netlify API 연동형

중요:
- API 키는 이 ZIP 안에 넣지 않았습니다.
- Netlify 환경변수에만 저장하세요.

Netlify 환경변수:
JUSO_API_KEY=주소검색 API 승인키
BUILDING_API_KEY=건축물대장 API 인증키

선택 환경변수:
BUILDING_API_URL=건축물대장 표제부 조회 최신 엔드포인트
기본값: https://apis.data.go.kr/1613000/BldRgstService_v2/getBrTitleInfo

사용:
1. ZIP 압축 해제
2. seoul-foreign-homestay-condition-netlify-api 폴더를 Netlify Drop에 업로드
3. Netlify 환경변수 2개 입력
4. 재배포
5. 앱 상단에서 지번 입력 후 “건축물대장 자동조회” 클릭