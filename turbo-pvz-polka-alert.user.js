// ==UserScript==
// @name         Турбо ПВЗ: забор с полки
// @namespace    turbo-pvz-local
// @version      1.3.0
// @description  Звук и уведомление, когда в GetBadges значение больше 0
// @match        https://turbo-pvz.ozon.ru/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(() => {
  'use strict';

  // ---- настройки ----
  const BADGES_PATH = 'MicroFFSelectorApi/GetBadges';
  const BADGES_URL = '/p-api/wms-selector/MicroFFSelectorApi/GetBadges';
  const FIELD = 'select';            // поле ответа: select или transfer
  const POLL_IDLE_MS = 10000;        // товара нет: проверять каждые 10 с
  const POLL_BUSY_MS = 120000;       // товар есть: проверять раз в 2 минуты, чтобы не спамить
  const NOTICE_MS = 30000;           // уведомление пропадает через 30 с
  const SOUND_URL = 'https://st.ozone.ru/s3/turbo-pvz-ui-bucket/mp3/error.mp3';
  const TEXT = 'Нужно провести забор товара с полки!';

  // Последний GetBadges, который отправила сама страница: его заголовки и тело
  // повторяем в своих запросах, так авторизация приложения уходит так же, как у страницы
  let captured = null;

  const toObject = (h) => {
    const out = {};
    if (!h) return out;
    if (h instanceof Headers) h.forEach((v, k) => { out[k] = v; });
    else if (Array.isArray(h)) h.forEach(([k, v]) => { out[k] = v; });
    else Object.keys(h).forEach((k) => { out[k] = h[k]; });
    return out;
  };

  // Перехват до старта страницы. Запросы страницы уходят без изменений
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    try {
      const url = typeof input === 'string' ? input : input && input.url;
      if (url && url.includes(BADGES_PATH)) {
        const h = init && init.headers ? init.headers : input && input.headers;
        captured = {
          headers: toObject(h),
          body: init && typeof init.body === 'string' ? init.body : null,
        };
      }
    } catch (e) {
      // не мешаем запросу страницы
    }
    return nativeFetch(input, init);
  };

  const XHRProto = XMLHttpRequest.prototype;
  const nativeOpen = XHRProto.open;
  const nativeSetHeader = XHRProto.setRequestHeader;
  const nativeSend = XHRProto.send;
  XHRProto.open = function (method, url) {
    this.__polkaUrl = String(url);
    this.__polkaHeaders = {};
    return nativeOpen.apply(this, arguments);
  };
  XHRProto.setRequestHeader = function (name, value) {
    if (this.__polkaHeaders) this.__polkaHeaders[name] = value;
    return nativeSetHeader.apply(this, arguments);
  };
  XHRProto.send = function (body) {
    if (this.__polkaUrl && this.__polkaUrl.includes(BADGES_PATH)) {
      captured = {
        headers: this.__polkaHeaders || {},
        body: typeof body === 'string' ? body : null,
      };
    }
    return nativeSend.apply(this, arguments);
  };

  const start = () => {
    const audio = new Audio(SOUND_URL);
    let notice = null;
    let noticeTimer = null;
    let soundPending = false;        // звук заблокирован браузером, ждём клика

    // Подсказка в уведомлении, если звук заблокирован
    const updateHint = () => {
      if (!notice) return;
      let hint = notice.querySelector('.polka-hint');
      if (soundPending) {
        if (!hint) {
          hint = document.createElement('div');
          hint.className = 'polka-hint';
          hint.style.cssText = 'font-size:12px;opacity:.8;margin-top:4px;';
          notice.querySelector('.polka-text').appendChild(hint);
        }
        hint.textContent = 'Звук заблокирован браузером: кликни по странице';
      } else if (hint) {
        hint.remove();
      }
    };

    const playSound = () => {
      audio.currentTime = 0;
      audio.play()
        .then(() => { soundPending = false; updateHint(); })
        .catch((e) => {
          soundPending = true;
          updateHint();
          console.warn('[polka] звук заблокирован браузером, нужен клик по странице:', e.message);
        });
    };

    // Chrome не даёт играть звук, пока пользователь не нажал что-нибудь на странице.
    // Если звук был заблокирован, проигрываем его при первом клике или нажатии клавиши
    const onGesture = () => {
      if (soundPending) playSound();
    };
    document.addEventListener('click', onGesture, true);
    document.addEventListener('keydown', onGesture, true);

    const hideNotice = () => {
      clearTimeout(noticeTimer);
      if (notice) notice.remove();
      notice = null;
    };

    const showNotice = () => {
      if (!notice) {
        notice = document.createElement('div');
        notice.className = 'ozi__dark__dark__dkYC4 ozi__notification-template__notification__L414N ozi-body-500 ozi__notification-template__enteractive__L414N ozi__notification-template__alert__L414N ozi__notification-template__popup__L414N ozi__notification-template__hasIcon__L414N';
        notice.style.cssText = 'position:fixed;top:16px;right:16px;z-index:99999;max-width:420px;';
        notice.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" class="ozi__notification-template__icon__L414N" viewBox="0 0 24 24"><path fill="currentColor" d="M12 20c5.584 0 9 0 9-3 0-3.5-5.5-14-9-14S3 13.5 3 17c0 3 3.416 3 9 3M11 8a1 1 0 1 1 2 0v4a1 1 0 1 1-2 0zm2 8a1 1 0 1 1-2 0 1 1 0 0 1 2 0"></path></svg>
          <div class="polka-text"></div>
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" class="ozi__icon__cursor__pvBjg ozi__notification-template__closeIcon__L414N" viewBox="0 0 24 24"><path fill="currentColor" fill-rule="evenodd" d="M16.293 6.293a1 1 0 1 1 1.414 1.414L13.414 12l4.293 4.293a1 1 0 1 1-1.414 1.414L12 13.414l-4.293 4.293a1 1 0 1 1-1.414-1.414L10.586 12 6.293 7.707a1 1 0 1 1 1.414-1.414L12 10.586z" clip-rule="evenodd"></path></svg>`;
        notice.querySelector('.polka-text').textContent = TEXT;
        notice.querySelector('.ozi__notification-template__closeIcon__L414N').addEventListener('click', hideNotice);
        document.body.appendChild(notice);
        updateHint();
      }
      // каждый показ живёт 30 секунд, потом пропадает сам
      clearTimeout(noticeTimer);
      noticeTimer = setTimeout(hideNotice, NOTICE_MS);
    };

    const fetchValue = async () => {
      const res = await nativeFetch(BADGES_URL, {
        method: 'POST',
        headers: captured.headers,
        body: captured.body || JSON.stringify({ maxValue: 100 }),
        credentials: 'same-origin',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return Number(data[FIELD]) || 0;
    };

    const tick = async () => {
      let next = POLL_IDLE_MS;
      // пока страница не отправила GetBadges, взять заголовки неоткуда
      if (captured) {
        try {
          const value = await fetchValue();
          if (value > 0) {
            playSound();
            showNotice();
            next = POLL_BUSY_MS;   // товар есть: следующая проверка через 2 минуты
          } else {
            hideNotice();
          }
        } catch (e) {
          const hint = e.message === 'HTTP 401' ? ' — сессия истекла, войди в Турбо ПВЗ заново' : '';
          console.warn('[polka] GetBadges:', e.message + hint);
        }
      }
      setTimeout(tick, next);
    };

    console.info('[polka] скрипт запущен, жду GetBadges от страницы');
    tick();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
