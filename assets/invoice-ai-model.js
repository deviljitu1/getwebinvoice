(function (root) {
  'use strict';
  const fieldRules = {
    'inv-num': { label: 'Invoice number', max: 100 },
    'inv-date': { label: 'Invoice date', date: true },
    'inv-status': { label: 'Status', options: ['unpaid', 'overdue'] },
    'cl-name': { label: 'Client name', max: 300 },
    'cl-email': { label: 'Client email', max: 300 },
    'cl-phone': { label: 'Client phone', max: 100 },
    'cl-addr': { label: 'Client address', max: 2000 },
    'pay-mode': { label: 'Payment method', options: ['UPI', 'Bank Transfer', 'Cash', 'Cheque'] },
    'pay-name': { label: 'Account name', max: 300 },
    'pay-upi': { label: 'Payment number', max: 200 },
    'pay-upi-id': { label: 'UPI ID', max: 200 },
    'pay-bank': { label: 'Bank information', max: 1000 },
    tax: { label: 'Tax', number: 100 },
    disc: { label: 'Discount', number: 100 },
    'adv-request': { label: 'Advance requested', number: 1e10 },
    'adv-request-type': { label: 'Advance type', options: ['percent', 'amount'] },
    'adv-tog': { label: 'Record received payment', options: ['true', 'false'] },
    'adv-amt': { label: 'Payment received', number: 1e10 },
    'adv-ref': { label: 'Payment reference', max: 1000 },
    'inv-note': { label: 'Payment terms / note', max: 4000 },
  };
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  function text(value, max = 4000) {
    if (typeof value !== 'string' || value.length > max) throw Error('Invalid or oversized text.');
    return value;
  }
  function field(id, value) {
    const rule = fieldRules[id];
    if (!rule) throw Error('Unknown invoice field.');
    text(value, rule.max || 100);
    if (rule.options && !rule.options.includes(value)) throw Error('Invalid ' + rule.label + '.');
    if (rule.number !== undefined && (value.trim() !== '' && !/^\d+(\.\d{1,2})?$/.test(value) || !Number.isFinite(Number(value)) || Number(value) > rule.number)) throw Error('Invalid ' + rule.label + '.');
    if (rule.date && value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) throw Error('Invalid invoice date.');
    return value;
  }
  function services(value) {
    if (!Array.isArray(value) || value.length > 100) throw Error('Use at most 100 services.');
    return value.map(s => {
      if (!object(s) || typeof s.byBrand !== 'boolean' || !Number.isInteger(s.q) || s.q < 1 || s.q > 10000 || !Number.isFinite(s.p) || s.p < 0 || s.p > 1e9 || Math.abs(s.p * 100 - Math.round(s.p * 100)) > 0.001) throw Error('Invalid service quantity or price.');
      if (!Array.isArray(s.brands) || s.brands.length > 100) throw Error('Use at most 100 brands per service.');
      const brands = s.brands.map(brand => text(brand, 300));
      return { n: text(s.n, 500), d: text(s.d, 2000), q: s.byBrand && brands.length ? brands.length : s.q, p: s.p, brands, byBrand: s.byBrand };
    });
  }
  function snapshot(value) {
    if (!object(value) || !object(value.fields)) throw Error('Invalid invoice state.');
    const fields = {};
    for (const id of Object.keys(fieldRules)) fields[id] = field(id, value.fields[id]);
    return { fields, services: services(value.services) };
  }
  function patch(value, current) {
    if (!object(value) || !object(value.fields) || !Array.isArray(value.questions) || value.questions.length > 8) throw Error('Invalid AI response.');
    const fields = {};
    for (const [id, v] of Object.entries(value.fields)) {
      if (!fieldRules[id]) throw Error('Unknown invoice field.');
      if (v !== null) fields[id] = field(id, v);
    }
    const nextServices = value.services === null ? null : services(value.services);
    const next = { fields: { ...current.fields, ...fields }, services: nextServices === null ? current.services : nextServices };
    const round = n => Math.round(n * 100) / 100;
    const sub = round(next.services.reduce((sum, s) => sum + round(s.p * s.q), 0));
    const discounted = round(sub - round(sub * Number(next.fields.disc) / 100));
    const total = round(discounted + round(discounted * Number(next.fields.tax) / 100));
    const received = next.fields['adv-tog'] === 'true' ? Number(next.fields['adv-amt']) : 0;
    const requested = Number(next.fields['adv-request']);
    if (total > 1e10 || received > total || (next.fields['adv-request-type'] === 'percent' ? requested > 100 : requested > total)) throw Error('The suggested payment amounts exceed the invoice total. Please clarify the amounts.');
    return { summary: text(value.summary, 2000), questions: value.questions.map(q => text(q, 1000)), fields, services: nextServices };
  }
  const serviceSchema = {
    type: 'object', additionalProperties: false,
    properties: { n: { type: 'string' }, d: { type: 'string' }, q: { type: 'integer' }, p: { type: 'number' }, brands: { type: 'array', items: { type: 'string' } }, byBrand: { type: 'boolean' } },
    required: ['n', 'd', 'q', 'p', 'brands', 'byBrand'],
  };
  const schema = {
    type: 'object', additionalProperties: false,
    properties: {
      summary: { type: 'string' }, questions: { type: 'array', items: { type: 'string' } },
      fields: { type: 'object', additionalProperties: false, properties: Object.fromEntries(Object.keys(fieldRules).map(id => [id, { type: ['string', 'null'] }])), required: Object.keys(fieldRules) },
      services: { type: ['array', 'null'], items: serviceSchema },
    }, required: ['summary', 'questions', 'fields', 'services'],
  };
  const api = { fieldRules, snapshot, patch, schema };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.InvoiceAIModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
