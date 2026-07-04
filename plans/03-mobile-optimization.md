# Задача 3: Оптимизация видеосигнала на мобильных устройствах

## Проблема
Перегрев матрицы камеры и быстрый разряд батареи из-за высокого разрешения трансляции.

## Текущее состояние
В [`public/script.js`](public/script.js:66) `mobileMediaConstraints`:
```js
width: { ideal: 640 },
height: { ideal: 480 },
frameRate: { ideal: 24, max: 30 }
```
640x480@24fps — всё ещё тяжело для мобильных, особенно при длительных звонках.

## Решение
1. **Снизить разрешение и частоту кадров:**
   ```js
   const mobileMediaConstraints = {
       audio: true,
       video: {
           width: { ideal: 480 },
           height: { ideal: 360 },
           frameRate: { ideal: 15, max: 20 }
       }
   };
   ```
   480x360@15fps — достаточно для видео-звонка, сильно снижает нагрузку.

2. **Ограничить битрейт через `RTCRtpSender.setParameters()`:**
   После создания peer connection установить максимальный битрейт для видео-трека:
   ```js
   async function limitVideoBitrate(pc, maxBitrate) {
       const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
       if (sender) {
           const params = sender.getParameters();
           if (!params.encodings) params.encodings = [{}];
           params.encodings[0].maxBitrate = maxBitrate;
           await sender.setParameters(params);
       }
   }
   ```
   Для мобильных: `maxBitrate = 300000` (300 kbps).
   Для десктопа: `maxBitrate = 1500000` (1.5 Mbps) — оставить высокое качество.

3. **Применить `contentHint = 'motion'`** — уже есть в коде, оставить.

4. **Опционально:** на мобильных отключить audio processing overhead — оставить echoCancellation/noiseSuppression (уже по умолчанию).

## Этапы
- [ ] 3.1. Снизить `mobileMediaConstraints` до 480x360@15fps
- [ ] 3.2. Добавить функцию `limitVideoBitrate(pc, maxBitrate)`
- [ ] 3.3. Вызывать `limitVideoBitrate` в `createPeerConnection` с разными значениями для mobile/desktop
- [ ] 3.4. Применить ограничение битрейта и при `replaceTrack` (screen share / camera switch)
- [ ] 3.5. Тестирование на мобильном устройстве — проверить температуру и расход батареи

## Файлы для правки
- `public/script.js`
