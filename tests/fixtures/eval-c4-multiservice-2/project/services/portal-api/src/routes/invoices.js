'use strict';

const { serializeInvoice } = require('../serializers/invoice-serializer');
const { NotFoundError } = require('../errors');

function registerInvoiceRoutes(router, { invoicesView }) {
  router.get('/invoices/:customerId', async (ctx) => {
    const invoices = invoicesView.invoicesForCustomer(ctx.params.customerId);
    return {
      statusCode: 200,
      body: {
        customerId: ctx.params.customerId,
        invoices: invoices.map(serializeInvoice),
      },
    };
  });

  router.get('/invoices/:customerId/:invoiceId', async (ctx) => {
    const invoice = invoicesView.invoiceById(ctx.params.invoiceId);
    if (!invoice || invoice.customerId !== ctx.params.customerId) {
      throw new NotFoundError(
        `invoice ${ctx.params.invoiceId} not found for customer ${ctx.params.customerId}`
      );
    }
    return { statusCode: 200, body: serializeInvoice(invoice) };
  });
}

module.exports = { registerInvoiceRoutes };
