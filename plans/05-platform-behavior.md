# Задача 5: Поведение мобильной и десктопной версий

## Текущее состояние (уже реализовано)

### Десктоп
- Переключение камеры на фронтальную **заблокировано**: функция [`switchCamera()`](public/script.js:713) содержит проверку `if (!localStream || !isMobile()) return;` — на десктопе ничего не делает.
- Кнопка `feature-btn` на десктопе работает как "Share your screen" (см. [`joinRoom()`](public/script.js:182)).

### Мобильная
- Демонстрация экрана **недоступна**: CSS правило [`styles.css:502`](public/css/styles.css:502) скрывает кнопку:
  ```css
  body.mobile-device #feature-btn[data-feature="screenshare"] { display: none; }
  ```
- Смена камеры **доступна**: `feature-btn` на мобиле получает `data-feature="switchcamera"` и иконку `icon_switch_camera.svg`.

## Что проверить / доработать
- [ ] 5.1. Убедиться, что `isMobile()` корректно определяет современные мобильные браузеры (Chrome mobile, Safari iOS).
- [ ] 5.2. Проверить, что на десктопе с touch-экраном не срабатывает мобильный режим (currently по userAgent — корректно).
- [ ] 5.3. На iPad (iPadOS 13+ userAgent = Mac) — `isMobile()` вернёт false. Решение: добавить проверку `navigator.maxTouchPoints > 1` для iPad, но оставить screen share доступным (iPad поддерживает `getDisplayMedia`).
- [ ] 5.4. Финальное тестирование обеих платформ.

## Файлы для правки
- `public/script.js` (функция `isMobile`, опционально)
