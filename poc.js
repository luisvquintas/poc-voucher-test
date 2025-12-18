LoadCheckoutPaymentContext(function (Checkout, PaymentOptions) {
    let urlApp = "https://nuvemshop-app.mundipagg.com"; // NOSONAR
    let urlToken = "https://api.mundipagg.com/core/v1/tokens"; // NOSONAR

    var installments = null;
    let currentCheckoutTotalPrice = Checkout.getData('order.cart.prices.total');

    if (typeof document.currentScript != "undefined") {
        urlApp = document.currentScript.src.replace("/assets/pagarme.js", "");
    }

    if (urlApp.includes("stg")) {
        urlToken = "https://stgapi.mundipagg.com/core/v1/tokens"; // NOSONAR
    }

    let scriptUrl = `${urlApp}/assets/base.js`

    const PagarmeBoletoPayment = new PaymentOptions.Transparent.BoletoPayment({
        id: 'pagarme_payment_boleto',
        version: 'v2',
        scripts: scriptUrl,
        onSubmit: function () {
            let pagarmeOrder = createBaseOrderObject(Checkout, this.methodConfig);

            return processPaymentRequest(Checkout, pagarmeOrder);
        }
    });

    const PagarmeCreditCardPayment = new PaymentOptions.Transparent.CardPayment({
        id: "pagarme_payment_credit_card",
        version: 'v2',
        scripts: scriptUrl,

        fields:
        {
            card_holder_id_types: [{
                code: 'CPF',
                name: 'CPF/CNPJ'
            }],
            card_holder_id_number: true
        },

        onLoad: Checkout.utils.throttle(async function () {
            let installmentsResponse = await getInstallments(urlApp, Checkout, this.methodConfig.payment_provider_id);
            installments = installmentsResponse;
            Checkout.setInstallments(installments);
        }),

        onDataChange: Checkout.utils.throttle(async function () {

            currentCheckoutTotalPrice = await updateInstallmentsAndReturnTotalPrice(urlApp, this.methodConfig, Checkout, currentCheckoutTotalPrice);

        }, 100),

        onSubmit: async function (callback) {
            let pagarmeOrder = createBaseOrderObject(Checkout, this.methodConfig);

            pagarmeOrder.payment.amount = Checkout.getData('totalPrice');

            let isCardInfoValidObject = validateCardInfo(Checkout);
            if (!isCardInfoValidObject.isValid) {
                return Checkout.showErrorCode(isCardInfoValidObject.error_code);
            }

            const publicKey = await getPublickKey(urlApp, this.methodConfig.payment_provider_id);
            let cardObject = await getCardId(urlToken, publicKey.value, Checkout);
            if (!cardObject.ok) {
                return Checkout.showErrorCode("card_info_invalid");
            }

            cardObject = await cardObject.json();

            pagarmeOrder.card_token = cardObject.id;
            pagarmeOrder.payment.card_brand = cardObject.card.brand;

            return processPaymentRequest(Checkout, pagarmeOrder);
        }
    });
    
    const PagarmeVoucherPayment = new PaymentOptions.Transparent.CardPayment({
        id: "pagarme_payment_voucher",
        name: "Vale alimentação ou refeição",
        version: 'v2',
        scripts: scriptUrl,

        fields:
        {
            card_holder_id_types: [{
                code: 'CPF',
                name: 'CPF/CNPJ'
            }],
            card_holder_id_number: true
        },

        onLoad: Checkout.utils.throttle(async function () {
            alert('PoC Voucher');            
        }),

        onSubmit: async function (callback) {
            let pagarmeOrder = createBaseOrderObject(Checkout, this.methodConfig);

            console.log('pagarmeOrder', pagarmeOrder)

            alert('PoC Voucher - submit')
        }
    });

    const PagarmeExternalPayment = new PaymentOptions.ExternalPayment({
        id: "pagarme_payment_external",
        version: 'v2',
        scripts: scriptUrl,

        onSubmit: function () {
            let pagarmeOrder = createBaseOrderObject(Checkout, this.methodConfig);

            pagarmeOrder.payment_method_checkout = "checkout"

            return processPaymentRequest(Checkout, pagarmeOrder);
        },
    });

    const PagarmePixPayment = new PaymentOptions.Transparent.PixPayment({
        id: 'pagarme_payment_pix',
        version: 'v2',
        scripts: scriptUrl,

        onSubmit: function () {
            let pagarmeOrder = createBaseOrderObject(Checkout, this.methodConfig);

            return processPaymentRequest(Checkout, pagarmeOrder);
        }
    });

    Checkout.addPaymentOption(PagarmeCreditCardPayment);
    Checkout.addPaymentOption(PagarmeVoucherPayment);
    Checkout.addPaymentOption(PagarmeBoletoPayment);
    Checkout.addPaymentOption(PagarmeExternalPayment);
    Checkout.addPaymentOption(PagarmePixPayment);
});
