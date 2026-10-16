const { test } = require('node:test');
const assert = require('node:assert/strict');
const model = require('../assets/invoice-ai-model.js');
function current() {
  const fields = Object.fromEntries(Object.keys(model.fieldRules).map(id => [id, '']));
  Object.assign(fields, { 'inv-num': 'INV-2026-001', 'inv-date': '2026-10-16', 'inv-status': 'unpaid', 'pay-mode': 'UPI', tax: '0', disc: '0', 'adv-request': '0', 'adv-request-type': 'percent', 'adv-tog': 'false', 'adv-amt': '0' });
  return { fields, services: [{ n: 'Landing Pages', d: '', q: 3, p: 12000, brands: ['A', 'B', 'C'], byBrand: true }] };
}
const patch = fields => ({ summary: 'Updated requested fields.', questions: [], fields, services: null });
const request = (body, headers = {}, method = 'POST') => new Request('https://invoice.test/.netlify/functions/invoice-assistant', {
  method, headers: { 'content-type': 'application/json', origin: 'https://invoice.test', ...headers }, ...(method === 'POST' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
});
test('AI patch only changes allowed fields and preserves service details', () => {
  const c = current();
  const result = model.patch(patch({ disc: '10', 'cl-name': 'ABC Group', tax: null }), c);
  assert.deepEqual(result.fields, { disc: '10', 'cl-name': 'ABC Group' });
  assert.equal(result.services, null);
  assert.equal(c.fields.disc, '0');
  assert.throws(() => model.patch(patch({ __unknown: 'hello' }), c));
});
test('AI payment requests cannot masquerade as receipts or exceed totals', () => {
  const c = current();
  const result = model.patch(patch({ 'adv-request': '50' }), c);
  assert.equal(result.fields['adv-tog'], undefined);
  assert.throws(() => model.patch(patch({ 'adv-request': '101' }), c));
  assert.throws(() => model.patch(patch({ 'adv-tog': 'true', 'adv-amt': '999999' }), c));
});
test('reject malformed numbers, dates and services', () => {
  for (const fields of [{ tax: '-1' }, { disc: '10%' }, { tax: 'NaN' }, { 'inv-date': '2026-02-30' }, { 'adv-tog': 'yes' }]) assert.throws(() => model.patch(patch(fields), current()));
  for (const bad of [{ p: -1 }, { q: 1.5 }, { p: 1.001 }, { brands: 'ABC' }]) {
    assert.throws(() => model.patch({ ...patch({}), services: [{ ...current().services[0], ...bad }] }, current()));
  }
});
test('brand billing derives quantity; package quantity remains independent', () => {
  const s = current().services[0];
  const a = model.patch({ ...patch({}), services: [{ ...s, q: 9 }] }, current());
  assert.equal(a.services[0].q, 3);
  const b = model.patch({ ...patch({}), services: [{ ...s, q: 1, byBrand: false }] }, current());
  assert.equal(b.services[0].q, 1);
});
test('server validates requests and optional access code before calling Groq', async () => {
  const { createHandler } = await import('../netlify/functions/invoice-assistant.mjs');
  let calls = 0;
  const handler = createHandler({ env: { GROQ_API_KEY: 'test-secret', INVOICE_AI_ACCESS_CODE: 'test-access' }, fetchImpl: async () => { calls++; } });
  assert.equal((await handler(request({}, {}, 'GET'))).status, 405);
  assert.equal((await handler(request({}, { origin: 'https://other.test' }))).status, 403);
  assert.equal((await handler(request({}))).status, 401);
  assert.equal((await handler(request('bad json', { 'x-invoice-access-code': 'test-access' }))).status, 400);
  assert.equal((await handler(request('x'.repeat(100001), { 'x-invoice-access-code': 'test-access' }))).status, 413);
  assert.equal(calls, 0);
});
test('server sends structured state to Groq and returns a validated minimal patch', async () => {
  const { createHandler } = await import('../netlify/functions/invoice-assistant.mjs');
  let sent;
  const handler = createHandler({ env: { GROQ_API_KEY: 'test-secret' }, fetchImpl: async (url, options) => {
    assert.equal(url, 'https://api.groq.com/openai/v1/chat/completions');
    assert.equal(options.headers.Authorization, 'Bearer test-secret');
    sent = JSON.parse(options.body);
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(patch({ disc: '10' })) } }] });
  } });
  const response = await handler(request({ message: 'Discount 10%', invoice: current(), history: [] }));
  assert.equal(response.status, 200);
  assert.equal(sent.response_format.json_schema.strict, true);
  assert.ok(sent.messages[0].content.includes('Landing Page Design'));
  assert.ok(sent.messages[0].content.includes('12000'));
  assert.equal(JSON.parse(sent.messages.at(-1).content).currentInvoice.services[0].p, 12000);
  const body = await response.text();
  assert.equal(JSON.parse(body).fields.disc, '10');
  assert.ok(!body.includes('test-secret'));
});
test('invalid AI output, provider errors and missing configuration stay recoverable', async () => {
  const { createHandler } = await import('../netlify/functions/invoice-assistant.mjs');
  const input = { message: 'Edit invoice', invoice: current(), history: [] };
  const missing = createHandler({ env: {} });
  assert.equal((await missing(request(input))).status, 503);
  for (const providerResponse of [Response.json({}, { status: 429 }), Response.json({ secret: 'do not expose' }, { status: 401 }), Response.json({ choices: [{ finish_reason: 'length', message: { content: '{}' } }] }), Response.json({ choices: [{ finish_reason: 'stop', message: { content: 'invalid' } }] })]) {
    const handler = createHandler({ env: { GROQ_API_KEY: 'test-secret' }, fetchImpl: async () => providerResponse });
    const result = await handler(request(input));
    assert.ok([429, 502].includes(result.status));
    assert.ok(!(await result.text()).includes('do not expose'));
  }
});
