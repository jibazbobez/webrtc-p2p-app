# Задача 2: Keep-alive запросы к Render.com

## Проблема
Бесплатный тариф Render.com усыпляет сервер через 1 час неактивности. Первый запрос после сна ждёт до 5 минут.

## Решение
Клиент автоматически шлёт HTTP-запрос на сервер раз в час, в случайный момент внутри часа (не строго периодично).

### Серверная часть (`server.js`)
Добавить lightweight endpoint:
```js
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
});
```
Этот endpoint не требует Socket.IO и быстро отвечает, удерживая сервер активным.

### Клиентская часть (`public/script.js`)
Добавить функцию keep-alive с рандомизацией:
```js
function scheduleKeepAlive() {
    // Случайный интервал от 25 до 55 минут (внутри часа, не строго периодично)
    const minMs = 25 * 60 * 1000;
    const maxMs = 55 * 60 * 1000;
    const delay = minMs + Math.random() * (maxMs - minMs);
    setTimeout(async () => {
        try {
            await fetch(`${window.location.origin}/health`, { cache: 'no-store' });
            console.log('[KEEP-ALIVE] Ping sent to server');
        } catch (e) {
            console.warn('[KEEP-ALIVE] Ping failed', e);
        }
        scheduleKeepAlive(); // Планируем следующий
    }, delay);
}
```

Запускать при загрузке страницы (`window.addEventListener('load', ...)`).

### Важные нюансы
- Использовать `setTimeout` рекурсивно, а не `setInterval` — так интервал меняется каждый раз.
- Диапазон 25–55 минут: гарантированно внутри часа, но не фиксировано.
- `fetch` с `cache: 'no-store'` чтобы браузер не кэшировал.
- Запрос идёт на тот же origin (Render.com), поэтому CORS не нужен.

## Этапы
- [ ] 2.1. Добавить GET `/health` route в `server.js`
- [ ] 2.2. Добавить функцию `scheduleKeepAlive()` в `public/script.js`
- [ ] 2.3. Запустить keep-alive при `load` событии
- [ ] 2.4. Логирование для отладки
- [ ] 2.5. Тестирование: проверить что запрос уходит (Network tab)

## Файлы для правки
- `server.js`
- `public/script.js`
