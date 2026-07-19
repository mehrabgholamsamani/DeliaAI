/* global document, window, URL, fetch, SpeechSynthesisUtterance, FormData, navigator */
(() => {
  const script = document.currentScript;
  const key = script?.dataset.business || script?.dataset.deliaKey;
  if (!key || document.querySelector('[data-delia-widget]')) return;
  const api = new URL(script.src).origin + '/api/public/widget';
  const root = document.createElement('div');
  root.dataset.deliaWidget = 'true';
  const shadow = root.attachShadow({ mode: 'closed' });
  document.body.append(root);
  let config, sessionId, selectedService, selectedSlot, draft;
  const state = { open: false, messages: [], slots: [], booking: null, handoff: false };
  const css = `
    :host{all:initial}*{box-sizing:border-box}button,input{font:inherit}.launcher{position:fixed;right:22px;bottom:22px;width:58px;height:58px;border:0;border-radius:18px;background:var(--delia,#111210);box-shadow:0 12px 30px #11121055;color:#fff;cursor:pointer;font:700 23px Arial}.panel{position:fixed;right:22px;bottom:92px;width:min(380px,calc(100vw - 28px));height:min(570px,calc(100vh - 120px));background:#fff;border:1px solid #e5e5df;border-radius:20px;box-shadow:0 20px 55px #1112102b;overflow:hidden;display:flex;flex-direction:column;font-family:Inter,Arial,sans-serif;color:#181916}.head{background:var(--delia,#111210);color:#fff;padding:17px 18px;display:flex;justify-content:space-between;align-items:center}.head strong{font-size:15px}.head span{font-size:12px;opacity:.75}.close{border:0;background:transparent;color:#fff;font-size:20px;cursor:pointer}.body{flex:1;overflow:auto;background:#fafaf7;padding:15px}.message{max-width:86%;padding:10px 12px;border-radius:14px;margin:0 0 9px;line-height:1.4;font-size:13px}.assistant{background:#fff;border:1px solid #e5e5df;border-top-left-radius:4px}.visitor{background:var(--delia,#111210);color:#fff;margin-left:auto;border-top-right-radius:4px}.services,.slots{display:flex;gap:7px;flex-wrap:wrap;margin:10px 0}.services button,.slots button,.book button{border:1px solid #deded8;background:#fff;border-radius:9px;padding:8px 9px;font-size:12px;cursor:pointer;text-align:left}.services button:hover,.slots button:hover{border-color:var(--delia,#111210)}.services small{display:block;color:#696965;margin-top:3px}.book{background:#fff;border:1px solid #e5e5df;border-radius:12px;padding:12px;margin-top:10px}.book h4{margin:0 0 8px;font-size:13px}.book input{width:100%;padding:9px;border:1px solid #ddd;border-radius:8px;margin:4px 0}.book button{background:var(--delia,#111210);color:#fff;border-color:var(--delia,#111210);width:100%;margin-top:6px}.handoff{background:transparent;border:0;color:#555;text-decoration:underline;cursor:pointer;font-size:11px;display:block;margin:14px auto}.composer{display:flex;gap:7px;border-top:1px solid #e8e8e2;background:#fff;padding:11px}.composer input{border:1px solid #d9d9d4;border-radius:10px;flex:1;min-width:0;padding:10px}.composer button{border:0;border-radius:10px;background:var(--delia,#111210);color:#fff;cursor:pointer;padding:0 12px}.mic{background:#f1f1ed!important;color:#222!important}.note{font-size:11px;color:#767670;text-align:center;margin:8px}.loading{padding:22px;text-align:center;color:#676762;font-size:13px}`;
  const call = async (path, options = {}) => {
    const response = await fetch(api + path, { ...options, headers: { 'content-type': 'application/json', ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof data.message === 'string' ? data.message : 'Something went wrong.');
    return data;
  };
  const escape = (value) => String(value).replace(/[&<>"]/g, (character) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' })[character]);
  const add = (role, text) => { state.messages.push({ role, text }); render(); if (role === 'assistant') speak(text); };
  const speak = (text) => { if ('speechSynthesis' in window) { window.speechSynthesis.cancel(); window.speechSynthesis.speak(new SpeechSynthesisUtterance(text)); } };
  const render = () => {
    const messages = state.messages.map((m) => `<p class="message ${m.role}">${escape(m.text)}</p>`).join('');
    const services = config?.services?.length ? `<div class="services">${config.services.map((service) => `<button data-service="${service.id}"><b>${escape(service.name)}</b><small>${service.durationMinutes} min · ${escape(service.priceLabel)}</small></button>`).join('')}</div>` : '';
    const slots = state.slots.length ? `<p class="note">Choose a time</p><div class="slots">${state.slots.map((slot) => `<button data-slot="${slot.startAt}">${new Date(slot.startAt).toLocaleString([], { weekday:'short', hour:'numeric', minute:'2-digit' })}</button>`).join('')}</div>` : '';
    const booking = state.booking ? `<form class="book" id="delia-book"><h4>${draft ? 'Confirm your appointment' : 'Your details'}</h4>${draft ? `<p class="note">${escape(draft.confirmationText)}</p><button>Confirm booking</button>` : `<input name="name" placeholder="Your name" required><input name="email" type="email" placeholder="Email" required><input name="phone" placeholder="Phone number" required><button>Review booking</button>`}</form>` : '';
    const handoff = state.handoff ? `<form class="book" id="delia-handoff"><h4>Ask for a human callback</h4><input name="name" placeholder="Your name" required><input name="email" type="email" placeholder="Email" required><input name="phone" placeholder="Phone number" required><input name="message" placeholder="How can we help?" required><button>Request callback</button></form>` : '<button class="handoff">Need to speak with a person?</button>';
    shadow.innerHTML = `<style>${css}</style><button class="launcher" aria-label="Open Delia">✦</button>${state.open ? `<section class="panel"><header class="head"><div><strong>${escape(config?.businessName || 'Delia')}</strong><br><span>AI receptionist · online</span></div><button class="close" aria-label="Close">×</button></header><main class="body">${!config ? '<p class="loading">Starting Delia…</p>' : messages + services + slots + booking + handoff}<p class="note">Powered by Delia</p></main><form class="composer"><input placeholder="Type a message…" ${!sessionId ? 'disabled' : ''}><button title="Send">↑</button><button type="button" class="mic" title="Speak">◉</button></form></section>` : ''}`;
    shadow.querySelector('.launcher')?.addEventListener('click', open);
    shadow.querySelector('.close')?.addEventListener('click', () => { state.open = false; render(); });
    shadow.querySelectorAll('[data-service]').forEach((button) => button.addEventListener('click', () => selectService(button.dataset.service)));
    shadow.querySelectorAll('[data-slot]').forEach((button) => button.addEventListener('click', () => { selectedSlot = button.dataset.slot; state.booking = true; render(); }));
    shadow.querySelector('.composer')?.addEventListener('submit', send);
    shadow.querySelector('.mic')?.addEventListener('click', listen);
    shadow.querySelector('#delia-book')?.addEventListener('submit', book);
    shadow.querySelector('.handoff')?.addEventListener('click', () => { state.handoff = true; render(); });
    shadow.querySelector('#delia-handoff')?.addEventListener('submit', requestHandoff);
  };
  const open = async () => {
    state.open = true; render();
    if (config) return;
    try {
      config = await call(`/config?key=${encodeURIComponent(key)}`);
      shadow.host.style.setProperty('--delia', config.brandColor);
      const started = await call('/sessions', { method: 'POST', body: JSON.stringify({ key }) });
      sessionId = started.sessionId;
      add('assistant', started.reply.displayText || config.greeting);
    } catch (error) { state.messages = [{ role: 'assistant', text: error.message || 'Delia is unavailable right now.' }]; render(); }
  };
  const send = async (event) => {
    event.preventDefault(); const input = shadow.querySelector('.composer input'); const message = input?.value.trim(); if (!message || !sessionId) return;
    input.value = ''; add('visitor', message);
    try { const result = await call('/chat', { method: 'POST', body: JSON.stringify({ key, sessionId, message }) }); add('assistant', result.reply.displayText); }
    catch (error) { add('assistant', error.message || 'Please try again.'); }
  };
  const selectService = async (serviceId) => {
    selectedService = config.services.find((service) => service.id === serviceId); state.slots = []; add('visitor', `I’d like to book ${selectedService.name}.`);
    try { const start = new Date().toISOString().slice(0, 10); const result = await call(`/availability?key=${encodeURIComponent(key)}&serviceId=${encodeURIComponent(serviceId)}&start=${start}&days=7`); state.slots = result.days.flatMap((day) => day.slots).filter((slot) => slot.available).slice(0, 8); add('assistant', state.slots.length ? 'Absolutely — choose a time that works for you.' : 'I’m sorry, there are no available times in the next week.'); }
    catch (error) { add('assistant', error.message || 'I could not load availability.'); }
  };
  const book = async (event) => {
    event.preventDefault(); if (!selectedService || !selectedSlot) return;
    try {
      if (!draft) { const form = new FormData(event.currentTarget); const payload = { name: form.get('name'), email: form.get('email'), phone: form.get('phone'), serviceId: selectedService.id, appointmentAt: selectedSlot }; draft = await call('/actions/prepare', { method: 'POST', body: JSON.stringify({ key, sessionId, action: 'CREATE_BOOKING', payload }) }); render(); }
      else { const result = await call('/actions/confirm', { method: 'POST', body: JSON.stringify({ key, sessionId, draftId: draft.draftId, confirmed: true }) }); state.booking = null; draft = null; state.slots = []; add('assistant', `You’re all set for ${new Date(result.booking.appointmentAt).toLocaleString()}. Is there anything else I can help with?`); }
    } catch (error) { add('assistant', error.message || 'I could not complete that booking.'); }
  };
  const requestHandoff = async (event) => {
    event.preventDefault();
    try { const form = new FormData(event.currentTarget); await call('/handoff', { method: 'POST', body: JSON.stringify({ key, sessionId, name: form.get('name'), email: form.get('email'), phone: form.get('phone'), message: form.get('message') }) }); state.handoff = false; add('assistant', 'Thanks — the team has your details and will get back to you soon.'); }
    catch (error) { add('assistant', error.message || 'I could not send that request.'); }
  };
  const listen = () => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) return add('assistant', 'Voice input is not available in this browser. You can type your message instead.');
    const recognition = new Recognition(); recognition.lang = navigator.language || 'en-US'; recognition.interimResults = false; recognition.maxAlternatives = 1;
    recognition.onresult = () => { const input = shadow.querySelector('.composer input'); input.value = recognition.results[0][0].transcript; shadow.querySelector('.composer').requestSubmit(); };
    recognition.onerror = () => add('assistant', 'I didn’t catch that. Please try again or type your message.'); recognition.start();
  };
  render();
})();
