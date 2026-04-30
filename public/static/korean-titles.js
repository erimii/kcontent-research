// ============================================================
// 한국어 원제 매핑 — Reddit·MDL은 영문 제목만 노출하므로 수동 매핑
//
// 추가 규칙:
//  1) 고확신 작품·배우만 등록 (불확실하면 등록하지 말 것)
//  2) 키는 lowercase + 공백 trim 적용 (renderer가 동일하게 정규화해 매칭)
//  3) 신작은 검증 후 추가
// ============================================================

// 작품 매핑 — 영문(소문자) → 한국어 원제
window.K_DRAMA_TITLE_MAP = {
  // 글로벌 메가히트
  'squid game': '오징어 게임',
  'squid game season 2': '오징어 게임 시즌 2',
  'crash landing on you': '사랑의 불시착',
  'goblin': '도깨비',
  'guardian: the lonely and great god': '도깨비',
  'descendants of the sun': '태양의 후예',
  'the glory': '더 글로리',
  'vincenzo': '빈센조',
  'mr. sunshine': '미스터 션샤인',
  'mr sunshine': '미스터 션샤인',
  'kingdom': '킹덤',
  'sweet home': '스위트홈',
  'all of us are dead': '지금 우리 학교는',
  'move to heaven': '무브 투 헤븐',
  'extraordinary attorney woo': '이상한 변호사 우영우',
  'reborn rich': '재벌집 막내아들',
  'mr. queen': '철인왕후',
  'mr queen': '철인왕후',
  'pachinko': '파친코',

  // 로맨스 클래식
  'boys over flowers': '꽃보다 남자',
  "it's okay to not be okay": '사이코지만 괜찮아',
  'hometown cha-cha-cha': '갯마을 차차차',
  'hometown cha cha cha': '갯마을 차차차',
  'itaewon class': '이태원 클라쓰',
  'business proposal': '사내맞선',
  'twenty-five twenty-one': '스물다섯 스물하나',
  'twenty five twenty one': '스물다섯 스물하나',
  'reply 1988': '응답하라 1988',
  'reply 1997': '응답하라 1997',
  'reply 1994': '응답하라 1994',
  'strong woman do bong-soon': '힘쎈여자 도봉순',
  'strong woman do bong soon': '힘쎈여자 도봉순',
  'strong girl nam-soon': '힘쎈여자 강남순',
  'strong girl nam soon': '힘쎈여자 강남순',
  "queen of tears": '눈물의 여왕',
  'my love from the star': '별에서 온 그대',
  'when the camellia blooms': '동백꽃 필 무렵',
  'while you were sleeping': '당신이 잠든 사이에',
  'her private life': '그녀의 사생활',
  'because this is my first life': '이번 생은 처음이라',
  "what's wrong with secretary kim": '김비서가 왜 그럴까',
  'something in the rain': '밥 잘 사주는 예쁜 누나',

  // 의학·법정·범죄
  'hospital playlist': '슬기로운 의사생활',
  'hospital playlist season 2': '슬기로운 의사생활 시즌 2',
  'doctor cha': '닥터 차정숙',
  'romantic doctor teacher kim': '낭만닥터 김사부',
  'dr. romantic': '낭만닥터 김사부',
  'dr romantic': '낭만닥터 김사부',
  'flower of evil': '악의 꽃',
  'beyond evil': '괴물',
  'voice': '보이스',
  'tunnel': '터널',
  'signal': '시그널',
  'mouse': '마우스',
  'penthouse': '펜트하우스',
  'sky castle': '스카이 캐슬',

  // 사극·판타지
  'the red sleeve': '옷소매 붉은 끝동',
  'mr. queen': '철인왕후',
  'love in the moonlight': '구르미 그린 달빛',
  'rookie historian goo hae-ryung': '신입사관 구해령',
  'tale of the nine tailed': '구미호뎐',
  'alchemy of souls': '환혼',
  'lovers of the red sky': '홍천기',
  'mr. sunshine': '미스터 션샤인',

  // 시리즈·시즌
  "yumi's cells": '유미의 세포들',
  "yumi's cells season 2": '유미의 세포들 시즌 2',
  "yumi's cells season 3": '유미의 세포들 시즌 3',
  'true beauty': '여신강림',

  // 액션·스릴러
  'taxi driver': '모범택시',
  'taxi driver 2': '모범택시 2',
  'vagabond': '배가본드',
  'big mouth': '빅마우스',
  'narco-saints': '수리남',
  'narco saints': '수리남',
  'mask girl': '마스크걸',
  'gyeongseong creature': '경성크리처',
  'd.p.': 'D.P.',
  'dp': 'D.P.',
  'a killer paradox': '살인자ㅇ난감',
  "moving": '무빙',

  // 코미디·일상
  'the uncanny counter': '경이로운 소문',
  'oh my venus': '오 마이 비너스',
  'cinderella and four knights': '신데렐라와 네 명의 기사',
  'doom at your service': '어느 날 우리 집 현관으로 멸망이 들어왔다',
  'lovestruck in the city': '도시남녀의 사랑법',
  'start-up': '스타트업',
  'startup': '스타트업',
  "tomorrow's class will be a holiday": '내일은 휴강',
  'romance is a bonus book': '로맨스는 별책부록',
  'extracurricular': '인간수업',
  'queen of mystery': '추리의 여왕',
  'because this is our first life': '이번 생은 처음이라',
  'a model family': '모범 가족',
  'happiness': '해피니스',
  'twinkling watermelon': '반짝이는 워터멜론',

  // 2025-2026 신작
  'doctor on the edge': '닥터 섬보이',  // 2026-06 예정
}

// 배우 매핑 — 영문(소문자) → 한국어 이름
window.K_ACTOR_NAME_MAP = {
  // 톱 여배우
  'iu': '아이유',
  'park bo-young': '박보영',
  'park bo young': '박보영',
  'kim go-eun': '김고은',
  'kim go eun': '김고은',
  'kim tae-ri': '김태리',
  'kim tae ri': '김태리',
  'song hye-kyo': '송혜교',
  'song hye kyo': '송혜교',
  'son ye-jin': '손예진',
  'son ye jin': '손예진',
  'jun ji-hyun': '전지현',
  'jun ji hyun': '전지현',
  'kim hee-ae': '김희애',
  'kim hee ae': '김희애',
  'park shin-hye': '박신혜',
  'park shin hye': '박신혜',
  'park min-young': '박민영',
  'park min young': '박민영',
  'shin min-a': '신민아',
  'shin min a': '신민아',
  'lee young-ae': '이영애',
  'lee young ae': '이영애',
  'bae suzy': '배수지',
  'suzy': '수지',
  'han hyo-joo': '한효주',
  'han hyo joo': '한효주',
  'han so-hee': '한소희',
  'han so hee': '한소희',
  'kim sejeong': '김세정',
  'kim se-jeong': '김세정',
  'kim ji-won': '김지원',
  'kim ji won': '김지원',
  'jeon do-yeon': '전도연',
  'jeon do yeon': '전도연',
  'lim ji-yeon': '임지연',
  'lim ji yeon': '임지연',
  'go yoon-jung': '고윤정',
  'go yoon jung': '고윤정',

  // 톱 남배우
  'lee min-ho': '이민호',
  'lee min ho': '이민호',
  'song joong-ki': '송중기',
  'song joong ki': '송중기',
  'hyun bin': '현빈',
  'gong yoo': '공유',
  'park seo-joon': '박서준',
  'park seo joon': '박서준',
  'lee jong-suk': '이종석',
  'lee jong suk': '이종석',
  'kim soo-hyun': '김수현',
  'kim soo hyun': '김수현',
  'ji chang-wook': '지창욱',
  'ji chang wook': '지창욱',
  'park hyung-sik': '박형식',
  'park hyung sik': '박형식',
  'rain': '비',
  'park bo-gum': '박보검',
  'park bo gum': '박보검',
  'jung hae-in': '정해인',
  'jung hae in': '정해인',
  'cha eun-woo': '차은우',
  'cha eun woo': '차은우',
  'song kang': '송강',
  'lee do-hyun': '이도현',
  'lee do hyun': '이도현',
  'kim woo-bin': '김우빈',
  'kim woo bin': '김우빈',
  'lee dong-wook': '이동욱',
  'lee dong wook': '이동욱',
  'so ji-sub': '소지섭',
  'so ji sub': '소지섭',
  'lee jung-jae': '이정재',
  'lee jung jae': '이정재',
  'kim nam-gil': '김남길',
  'kim nam gil': '김남길',
  'yoo ah-in': '유아인',
  'yoo ah in': '유아인',
  'jeon ji-hyun': '전지현',
  'jeon ji hyun': '전지현',
  'choi woo-shik': '최우식',
  'choi woo shik': '최우식',
  'byeon woo-seok': '변우석',
  'byeon woo seok': '변우석',
  'lee je-hoon': '이제훈',
  'lee je hoon': '이제훈',
  'nam joo-hyuk': '남주혁',
  'nam joo hyuk': '남주혁',
  'lomon': '로몬',
}

// 정규화 + 매핑 lookup 헬퍼 (검증된 매핑만 사용 — 직역 폴백 없음)
window.koTitle = function (raw) {
  if (!raw) return raw
  const key = String(raw).toLowerCase().trim().replace(/\s+/g, ' ')
  const ko = (window.K_DRAMA_TITLE_MAP || {})[key]
  return ko ? `${raw} (${ko})` : raw
}
window.koActor = function (raw) {
  if (!raw) return raw
  const key = String(raw).toLowerCase().trim().replace(/\s+/g, ' ')
  const ko = (window.K_ACTOR_NAME_MAP || {})[key]
  return ko ? `${raw} (${ko})` : raw
}
