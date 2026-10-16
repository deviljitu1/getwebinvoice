(function () {
  'use strict';
  const form = document.getElementById('ai-form');
  const prompt = document.getElementById('ai-prompt');
  const status = document.getElementById('ai-status');
  const send = document.getElementById('ai-send');
  const undo = document.getElementById('ai-undo');
  const history = [];
  let busy = false, lastEdit = null, pending = null;
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  function snapshot() {
    const fields = {};
    for (const id of Object.keys(InvoiceAIModel.fieldRules)) {
      const el = document.getElementById(id);
      fields[id] = id === 'adv-tog' ? String(el.checked) : el.value;
    }
    return { fields, services: svcs.map(({ n, d, q, p, brands, byBrand }) => ({ n, d, q, p, brands: [...brands], byBrand })) };
  }
  function message(role, content) {
    const list = document.getElementById('ai-messages');
    const item = document.createElement('div');
    item.className = 'ai-message ai-' + role;
    const label = document.createElement('strong');
    label.textContent = role === 'user' ? 'You' : 'Invoice Assistant';
    const body = document.createElement('p');
    body.textContent = content;
    item.append(label, body); list.append(item);
    while (list.children.length > 12) list.firstElementChild.remove();
    list.scrollTop = list.scrollHeight;
  }
  function write(fields, services) {
    for (const [id, value] of Object.entries(fields)) {
      const el = document.getElementById(id);
      if (id === 'adv-tog') el.checked = value === 'true';
      else el.value = value;
    }
    if (services !== null) {
      svcs = services.map(s => ({ ...s, brands: [...s.brands], id: ++ctr }));
      renderSvcs();
    }
    document.getElementById('adv-blk').classList.toggle('show', document.getElementById('adv-tog').checked);
    if (Object.keys(fields).some(id => id.startsWith('cl-'))) document.getElementById('cl-preset').value = '';
    if (Object.keys(fields).some(id => id.startsWith('pay-'))) document.getElementById('pay-preset').value = '';
    refresh();
  }
  function apply(patch) {
    const before = snapshot();
    const checked = InvoiceAIModel.patch(patch, InvoiceAIModel.snapshot(before));
    write(checked.fields, checked.services);
    const after = snapshot();
    if (!same(before, after)) { lastEdit = { before, after }; undo.disabled = false; }
    pending = null; document.getElementById('ai-pending').hidden = true;
  }
  function describe(patch) {
    const lines = Object.entries(patch.fields).map(([id, value]) => InvoiceAIModel.fieldRules[id].label + ': ' + (value || '(clear)'));
    if (patch.services !== null) lines.push('Services: ' + (patch.services.map(s => `${s.n || 'Unnamed service'} — ${s.q} × ₹${fmt(s.p)}${s.brands.length ? ' (' + s.brands.join(', ') + ')' : ''}`).join('; ') || '(remove all)'));
    return lines.join('\n');
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const instruction = prompt.value.trim();
    if (busy || !instruction) return;
    if (pending) { status.textContent = 'Apply or discard the pending suggestion first.'; return; }
    let current;
    try { current = InvoiceAIModel.snapshot(snapshot()); }
    catch { status.textContent = 'Correct invalid amounts or dates in the form first, then try again.'; return; }
    busy = true; send.disabled = true; undo.disabled = true;
    const download = document.querySelector('[onclick="dlPDF()"]');
    download.disabled = true;
    status.textContent = 'Working on your invoice… You can keep editing the form.';
    message('user', instruction);
    try {
      const response = await fetch('/.netlify/functions/invoice-assistant', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Invoice-Access-Code': document.getElementById('ai-access-code').value },
        signal: AbortSignal.timeout(35000),
        body: JSON.stringify({ message: instruction, invoice: current, history: history.slice(-8) }),
      });
      if (!response.ok) {
        if (response.status === 401) document.getElementById('ai-access').open = true;
        const data = await response.json().catch(() => ({}));
        throw Error(response.status === 429 ? 'Please wait a minute before asking again.' : data.error || 'The assistant is unavailable right now. Your invoice is unchanged.');
      }
      const patch = InvoiceAIModel.patch(await response.json(), current);
      const now = snapshot();
      const conflicts = Object.keys(patch.fields).some(id => now.fields[id] !== current.fields[id] && now.fields[id] !== patch.fields[id]) ||
        patch.services !== null && !same(now.services, current.services);
      const answer = [patch.summary, ...patch.questions].filter(Boolean).join('\n');
      history.push({ role: 'user', content: instruction.slice(0, 3000) }, { role: 'assistant', content: answer.slice(0, 3000) });
      if (history.length > 8) history.splice(0, history.length - 8);
      if (conflicts) {
        pending = patch;
        document.getElementById('ai-pending').hidden = false;
        document.getElementById('ai-changes').textContent = describe(patch);
        status.textContent = 'You edited the same details while I was working. Review the suggestions before applying them.';
      } else {
        apply(patch);
        status.textContent = Object.keys(patch.fields).length || patch.services !== null ? 'Invoice updated. Review it or tell me what to change next.' : 'No fields changed. Reply with the missing details below.';
      }
      message('assistant', answer || 'Tell me what you would like to change.');
      if (prompt.value.trim() === instruction) prompt.value = '';
    } catch (error) {
      status.textContent = error.name === 'TimeoutError' || error.name === 'AbortError' ? 'The request timed out. Your invoice is unchanged; try again.' : error.message;
    } finally {
      busy = false; send.disabled = false; undo.disabled = !lastEdit;
      download.disabled = false;
    }
  });
  document.getElementById('ai-apply').addEventListener('click', () => {
    if (!pending) return;
    try { apply(pending); status.textContent = 'Suggestions applied. Your invoice is still editable.'; }
    catch { status.textContent = 'These suggestions no longer fit the current amounts. Discard them and ask again.'; }
  });
  document.getElementById('ai-discard').addEventListener('click', () => {
    pending = null; document.getElementById('ai-pending').hidden = true;
    status.textContent = 'Suggestions discarded. Your manual changes are preserved.';
  });
  undo.addEventListener('click', () => {
    if (!lastEdit || busy) return;
    const now = snapshot(), fields = {};
    for (const id of Object.keys(now.fields)) {
      if (lastEdit.before.fields[id] !== lastEdit.after.fields[id] && now.fields[id] === lastEdit.after.fields[id]) fields[id] = lastEdit.before.fields[id];
    }
    const services = !same(lastEdit.before.services, lastEdit.after.services) && same(now.services, lastEdit.after.services) ? lastEdit.before.services : null;
    write(fields, services);
    lastEdit = null; undo.disabled = true;
    history.length = 0;
    status.textContent = 'Last AI edit undone where unchanged since. Your newer manual edits are preserved.';
  });
  document.querySelectorAll('[data-ai-example]').forEach(button => button.addEventListener('click', () => {
    prompt.value = button.dataset.aiExample; prompt.focus();
  }));
  prompt.addEventListener('keydown', event => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); form.requestSubmit(); }
  });
})();
