# Задача 1: Исправить демонстрацию экрана на десктопе

## Проблема
В [`public/script.js`](public/script.js:595) функция `startScreenShare()`:
1. Вызывает `sender.replaceTrack(screenTrack)` **без `await`** — возможна race condition.
2. Создаёт дополнительный контейнер `local-screen-share` и добавляет его в `videosContainer`.
3. Функция [`updateUIAfterScreenShare()`](public/script.js:671) перемещает контейнеры между `presenter-area` и `participant-sidebar`, но из-за ограничения комнаты в 2 участника и порядка элементов логика ломается — пиру уходит камера вместо экрана.

## Корневая причина
- `replaceTrack` возвращает Promise, который не ожидается. Если трек экрана ещё не готов, замена не происходит.
- Локальный контейнер `local-screen-share` создаётся как отдельное окно, что конфликтует с логикой "2 окна на комнату" в `updateUIAfterScreenShare` — функция ищет контейнер по id, но порядок добавления в DOM может приводить к тому, что локальное видео с камерой остаётся в `participant-sidebar` и его трек не заменяется.

## Решение
1. **Замена трека с `await`:**
   ```js
   for (const peerId in peerConnections) {
       const sender = peerConnections[peerId].getSenders().find(s => s.track && s.track.kind === 'video');
       if (sender) {
           await sender.replaceTrack(screenTrack);
       }
   }
   ```
2. **Не создавать отдельное окно для локального screen share.** Вместо этого:
   - Заменить `srcObject` локального `<video id="local-video">` на `screenStream` на время демонстрации.
   - Показать индикатор "Вы демонстрируете экран" поверх локального видео.
   - При остановке — вернуть `localStream` в `localVideo`.
3. Это убирает третье окно и решает проблему с layout.
4. На стороне пира: входящий трек уже заменяется через `ontrack` / `replaceTrack` — пир увидит экран в своём контейнере `video-${sharerId}`.

## Этапы
- [ ] 1.1. Изучить текущую логику `startScreenShare` / `stopScreenShare` / `updateUIAfterScreenShare`
- [ ] 1.2. Переработать `startScreenShare`: заменить локальное видео на screen stream, убрать создание `local-screen-share` контейнера
- [ ] 1.3. Добавить `await` к `replaceTrack`
- [ ] 1.4. Переработать `stopScreenShare`: вернуть камеру в локальное видео
- [ ] 1.5. Упростить `updateUIAfterScreenShare` — убрать поиск `local-screen-share`
- [ ] 1.6. Проверить CSS presenter-mode — убедиться, что контейнер пира-шарера корректно попадает в `presenter-area`
- [ ] 1.7. Тестирование: 2 браузера, проверить что пиру уходит экран

## Файлы для правки
- `public/script.js`
- `public/css/styles.css` (опционально — индикатор демонстрации экрана)
