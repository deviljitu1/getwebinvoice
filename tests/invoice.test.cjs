const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function invoice(file, values = {}, services = [{ p: 12000, q: 3 }]) {
  const inputs = {
    disc: { value: '0' }, tax: { value: '0' },
    'adv-tog': { checked: false }, 'adv-amt': { value: '0' },
    'adv-request': { value: '0' }, 'adv-request-type': { value: 'percent' },
  };
  for (const [id, value] of Object.entries(values)) {
    inputs[id] = typeof value === 'boolean' ? { checked: value } : { value: String(value) };
  }
  Object.values(inputs).forEach(input => { input.validity = { badInput: false }; });
  const context = vm.createContext({ document: {
    addEventListener() {}, getElementById(id) { return inputs[id]; },
  } });
  const html = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  for (const [, body] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) vm.runInContext(body, context);
  vm.runInContext('svcs = ' + JSON.stringify(services), context);
  return JSON.parse(JSON.stringify(vm.runInContext('calculateInvoice()', context)));
}

for (const file of ['index.html', 'dist/index.html']) {
  test(file + ': three landing pages with no advance', () => {
    const c = invoice(file);
    assert.equal(c.total, 36000);
    assert.equal(c.dueNow, 36000);
    assert.deepEqual(c.errors, []);
  });
  test(file + ': 50% advance requested is not received', () => {
    const c = invoice(file, { 'adv-request': 50 });
    assert.equal(c.requested, 18000);
    assert.equal(c.received, 0);
    assert.equal(c.dueNow, 18000);
    assert.equal(c.later, 18000);
  });
  test(file + ': partial advance and completed advance', () => {
    const c = invoice(file, { 'adv-request': 50, 'adv-tog': true, 'adv-amt': 5000 });
    assert.equal(c.dueNow, 13000);
    assert.equal(c.balance, 31000);
    assert.equal(c.later, 18000);
    const paidAdvance = invoice(file, { 'adv-request': 50, 'adv-tog': true, 'adv-amt': 18000 });
    assert.equal(paidAdvance.dueNow, 0);
    assert.equal(paidAdvance.later, 18000);
  });
  test(file + ': fixed advance and full payment', () => {
    assert.equal(invoice(file, { 'adv-request-type': 'amount', 'adv-request': 7000 }).dueNow, 7000);
    const paid = invoice(file, { 'adv-tog': true, 'adv-amt': 36000 });
    assert.equal(paid.balance, 0);
    assert.equal(paid.dueNow, 0);
  });
  test(file + ': discount then tax, rounded to paise', () => {
    const c = invoice(file, { disc: 10, tax: 18, 'adv-request': 50 }, [{ p: 199.99, q: 3 }]);
    assert.equal(c.sub, 599.97);
    assert.equal(c.dAmt, 60);
    assert.equal(c.taxAmt, 97.19);
    assert.equal(c.total, 637.16);
    assert.equal(c.dueNow, 318.58);
  });
  test(file + ': invalid percentages, negative prices and overpayments', () => {
    for (const values of [{ disc: 101 }, { tax: -1 }, { 'adv-request': 101 },
      { 'adv-request-type': 'amount', 'adv-request': 40000 }, { 'adv-tog': true, 'adv-amt': 40000 }]) {
      assert.ok(invoice(file, values).errors.length);
    }
    assert.ok(invoice(file, {}, [{ p: -10, q: 1 }]).errors.length);
    assert.ok(invoice(file, {}, [{ p: 10, q: 0 }]).errors.length);
  });
  test(file + ': hidden received amount does not reduce the balance', () => {
    assert.equal(invoice(file, { 'adv-tog': false, 'adv-amt': 5000 }).balance, 36000);
  });
}
