# 점심 당번표 🍚

김해리 · 한체리 · 김JK 세 명이 매주 수요일 팀식 식당을 순서대로 고르고, 누가 언제 어디를 골랐는지 함께 남기는 앱입니다.

## 열기
- GitHub Pages 주소: `https://harry-gimsong.github.io/PR/lunch/`
- 처음엔 **팀에서 받은 링크**(`...lunch/?room=20자리코드`)로 열어야 같은 당번표에 들어갑니다. 한 번 열면 그 브라우저가 기억해요.
- 휴대폰에서는 "홈 화면에 추가"로 앱처럼 쓸 수 있어요.

## 함께 쓰기 (Firebase)
가계부·여행 지도·레벨업과 **같은 Firebase 프로젝트**를 씁니다(`lunch/firebase-config.js`). 처음 한 번만 Firestore 규칙에 점심 당번표 칸을 열어 주면 됩니다.

https://console.firebase.google.com → 여행 지도 프로젝트 → **Firestore Database → 규칙** 탭에서 아래 내용으로 바꾸고 **게시**
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /maps/{room} {
      allow read, write: if room.matches('^[a-z0-9]{20}$');
    }
    match /budgets/{room}/{rest=**} {
      allow read, write: if room.matches('^[a-z0-9]{20}$');
    }
    match /levelups/{room}/{rest=**} {
      allow read, write: if room.matches('^[a-z0-9]{20}$');
    }
    match /lunches/{room}/{rest=**} {
      allow read, write: if room.matches('^[a-z0-9]{20}$');
    }
  }
}
```
(이 단계를 빼먹으면 앱 위쪽에 "Firebase 규칙에 점심 당번표(lunches) 허용이 필요해요"라고 나옵니다.)

- 링크를 처음 연 사람이 당번표를 만들면 순서(한체리 → 김해리 → 김JK, 이번 차례 김해리)와 2026-10-28 ~ 2027-06-30 매주 수요일 일정(2027-05-05 어린이날은 쉬는 날)이 자동으로 들어갑니다.
- 오른쪽 위 **팀원에게 링크 복사**로 같은 링크를 보내면 됩니다. 링크를 아는 사람은 누구나 기록을 고칠 수 있으니 팀 밖에는 보내지 마세요.

## 기능
| 기능 | 하는 일 |
| --- | --- |
| 이번 차례 / 다음 차례 | 다음 팀식 날짜에 고를 사람과 그다음 사람 |
| 명단 · 순서 | 세 명의 순번, 지금까지 고른 횟수, ← → 로 순서 바꾸기 |
| 건너뛰기 · 바꾸기 | 이번 사람을 건너뛰거나, 다른 사람과 차례를 맞바꾸기 (이력에 남음) |
| 기록 | 식당 + 별점을 적으면 자동으로 다음 차례로 |
| 팀식 일정 | 2026-10-28 ~ 2027-06-30 매주 수요일. "쉬는 날로" 누르면 그 주는 순번에서 빠짐 |
| 또 먹어요? | 2주 안에 같은 식당을 적으면 경고 |
| 식당 순위 | 자주 간 순 / 별점 순 |
| 랜덤 추천 | 지난 식당 중 2주 안에 안 간 곳을 별점 가중치로 추천 |
| 이번 주 추천 | 매주 화요일 오후, 수요일 날씨·기온과 버드나루로 13 근처 맛집 평점·리뷰로 3곳 추천 |
