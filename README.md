# Xbox Game Pass Calendar

Xbox Wire의 공식 Game Pass 업데이트 글에서 추가 예정 게임을 파싱해 월간 달력으로 보여주는 Vite + React + TypeScript 웹앱입니다.

## Commands

```bash
npm run dev
npm run fetch:gamepass
npm run build
npm run preview
```

## Data

`npm run fetch:gamepass`는 `https://news.xbox.com/en-us/xbox-game-pass/`에서 “Coming to Xbox Game Pass” 글을 찾고, 각 글의 `Available Today`와 `Coming Soon` 섹션만 파싱합니다.

결과는 `src/data/gamepass-events.json`에 저장되며 웹앱은 이 정적 JSON을 읽습니다. `Leaving`, `Game Updates`, `In-Game Benefits`, `Free Play Days`는 v1 범위에서 제외했습니다.

## Automation

GitHub Actions workflow `.github/workflows/update-gamepass.yml` runs daily at 09:15 UTC and can also be started manually. It refreshes `src/data/gamepass-events.json`, runs lint/build, and commits the JSON when it changes.
