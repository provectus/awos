'use strict';

// Legacy order-confirmation notifications, kept from the pre-queue era when
// the gateway emailed customers directly. The mail relay was decommissioned;
// messages are spooled to disk for an operator to flush manually.

const fs = require('node:fs');
const path = require('node:path');
const { nowIso } = require('../../../../packages/shared/src/clock');
const {
  formatOneLine,
} = require('../../../../packages/shared/src/models/address');

const SPOOL_DIR = path.resolve(process.cwd(), 'var', 'mail-spool');
const FROM_ADDRESS = 'notifications@shiplog.example';

function renderConfirmationEmail(order) {
  const lines = [
    `From: ${FROM_ADDRESS}`,
    `To: ${order.customerEmail}`,
    `Subject: Your ShipLog order ${order.id} is confirmed`,
    `Date: ${nowIso()}`,
    '',
    `Hi,`,
    '',
    `We received your order ${order.id}. It will ship to:`,
    `  ${formatOneLine(order.shippingAddress)}`,
    '',
    'Items:',
    ...order.items.map((item) => `  - ${item.quantity} x ${item.sku}`),
    '',
    'Thanks for shipping with ShipLog.',
  ];
  return lines.join('\r\n');
}

function spoolConfirmation(order) {
  fs.mkdirSync(SPOOL_DIR, { recursive: true });
  const file = path.join(SPOOL_DIR, `${Date.now()}-${order.id}.eml`);
  fs.writeFileSync(file, renderConfirmationEmail(order));
  return file;
}

function pendingNotifications() {
  if (!fs.existsSync(SPOOL_DIR)) return [];
  return fs.readdirSync(SPOOL_DIR).filter((name) => name.endsWith('.eml'));
}

module.exports = {
  renderConfirmationEmail,
  spoolConfirmation,
  pendingNotifications,
};
