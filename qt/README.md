# 아침묵상 나눔 기록

월·수 아침에 매일성경을 묵상하고 나누는 팀이 인도 순서, 쉰 날, 실장님과 함께한 날을 함께 남기는 앱입니다. 인도자가 기도까지 맡고, 업무로 쉰 날은 차례가 넘어가지 않습니다.

## 열기
- GitHub Pages 주소: `https://harry-gimsong.github.io/PR/qt/`
- 처음 연 사람이 **새 기록장 만들기**를 누르면 `...qt/?room=20자리코드` 링크가 생깁니다. 오른쪽 위 **링크 복사**로 팀즈 단톡방에 올리면, 그 링크를 연 사람은 누구나 로그인 없이 같은 기록을 보고 남길 수 있어요. 한 번 열면 그 브라우저가 기억합니다.
- 링크를 아는 사람은 누구나 기록을 고칠 수 있으니 팀 밖에는 보내지 마세요.
- 휴대폰에서는 "홈 화면에 추가"로 앱처럼 쓸 수 있어요.

## 함께 쓰기 (Firebase)
점심 당번표·가계부·여행 지도·레벨업과 **같은 Firebase 프로젝트**를 씁니다(`qt/firebase-config.js`). 처음 한 번만 Firestore 규칙에 아침묵상 칸(`qts`)을 열어 주면 됩니다.

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
    match /qts/{room}/{rest=**} {
      allow read, write: if room.matches('^[a-z0-9]{20}$');
    }
  }
}
```
(이 단계를 빼먹으면 앱 위쪽에 "Firebase 규칙에 아침묵상(qts) 허용이 필요해요"라고 나옵니다.)

기록은 `qts/{room}/config/team`(인도 순서, 모이는 요일)과 `qts/{room}/sessions/{YYYY-MM-DD}`(그날 기록)에 저장됩니다.

## 기능
| 기능 | 하는 일 |
| --- | --- |
| 오늘의 인도자 | 마지막으로 나눈 사람 다음 차례. 쉰 날은 차례가 그대로 |
| 팀 설정 | 인도자 추가·빼기·순서 바꾸기(↑ ↓ ✕), 모이는 요일(기본 월·수) |
| 사람별 인도 현황 | 인도 횟수와 최근 인도일 |
| 달력 | 나눈 날, 실장님과 함께한 날, 쉰 날, 아직 기록 안 한 모임일을 색으로 구분. 날짜를 누르면 기록·수정 |
| 이어서 나누는 중 | 모임일을 빠짐없이 나눈 연속 횟수. 쉬거나 기록이 빠진 모임일이 있으면 다시 셈 |
| 실장님과 함께한 날 | 날짜·본문·인도자·메모 모아보기 |
| 오늘의 말씀 | 매일성경 오늘 본문(개역개정) 페이지로 바로 가는 버튼 |
| 팀즈 안내문 복사 | 날짜·인도자·본문·말씀 링크를 한 번에 복사 |
