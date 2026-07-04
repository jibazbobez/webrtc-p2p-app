# Задача 4: Проверка работоспособности TURN-серверов

## Текущий список TURN-серверов в [`public/script.js`](public/script.js:83)
1. `stun:stun.l.google.com:19302` (и 1-4) — Google STUN
2. `stun:stun.sipnet.ru:3478`, `stun:stun.gmx.net`, `stun:stun.ekiga.net`, `stun:stun.fwdnet.net`, `stun:stun.ideasip.com` — публичные STUN
3. `stun:stun.relay.metered.ca:80` — Metered STUN
4. `turn:global.relay.metered.ca:80` (UDP/TCP/443/TLS) — Metered TURN (основной, с credentials)
5. `turn:141.144.195.147:8000?transport=tcp`, `turn:185.158.112.58:8000?transport=tcp` — TURN с credentials `20250908`/`SpehIEurpH573oTvpoHb`
6. `turn:turn.bistri.com:80` — публичный TURN (`homeo`/`homeo`)

## Метод проверки
WebRTC не предоставляет прямого API для проверки TURN-серверов. Варианты:

### Вариант A: Логирование ICE gathering (рекомендуется)
Добавить логирование в `createPeerConnection`:
```js
pc.onicecandidate = event => {
    if (event.candidate && event.candidate.candidate) {
        const c = event.candidate.candidate;
        if (c.includes('relay')) {
            console.log(`[ICE] RELAY candidate: ${c}`);
        }
    }
};
```
Собрать логи в реальном звонке за NAT — посмотреть, какие TURN-серверы дают relay candidates.

### Вариант B: Тестовый скрипт Trickle ICE
Использовать https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/ с каждым сервером вручную.

### Вариант C: Упростить конфиг
Убрать явно нерабочие/устаревшие:
- `turn:turn.bistri.com:80` — часто оффлайн, убрать.
- `stun:stun.fwdnet.net`, `stun:stun.ideasip.com` — старые, могут не отвечать.
- Оставить Metered (основной, с credentials) + Google STUN + 2 TURN на 141.144.195.147 / 185.158.112.58.

## Этапы
- [ ] 4.1. Добавить расширенное логирование ICE candidates (relay-кандидаты)
- [ ] 4.2. Провести тестовый звонок за NAT, собрать логи
- [ ] 4.3. Проанализировать, какие TURN дали relay candidates
- [ ] 4.4. Убрать нерабочие серверы из `iceConfig`
- [ ] 4.5. Оставить логирование relay candidates в проде для мониторинга

## Файлы для правки
- `public/script.js` (`iceConfig`, `createPeerConnection`)
