LoadCheckoutPaymentContext(function (Checkout, PaymentOptions) {

    function onElementAvailable(selector, cb, timeoutMs = 5000) {
      const elNow = document.querySelector(selector);
      if (elNow) return cb(elNow);
    
      const obs = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) { obs.disconnect(); cb(el); }
      });
    
      obs.observe(document.documentElement, { childList: true, subtree: true });
    
      setTimeout(() => obs.disconnect(), timeoutMs);
    }

    
    // let urlApp = "https://nuvemshop-app.mundipagg.com"; // NOSONAR
    // let urlToken = "https://api.mundipagg.com/core/v1/tokens"; // NOSONAR

    
    let urlApp = "https://nuvemshop.app.stg.pagar.me"; // NOSONAR
    let urlToken = "https://stgapi.mundipagg.com/core/v1/tokens"; // NOSONAR
    
    var installments = null;
    let currentCheckoutTotalPrice = Checkout.getData('order.cart.prices.total');

    //if (typeof document.currentScript != "undefined") {
    //    urlApp = document.currentScript.src.replace("/assets/pagarme.js", "");
    //}

    // if (urlApp.includes("stg")) {
    //     urlToken = "https://stgapi.mundipagg.com/core/v1/tokens"; // NOSONAR
    // }

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
    
    const PagarmeVoucherPayment = new PaymentOptions.ModalPayment({
        id: "pagarme_payment_voucher",
        name: "Vale alimentação ou refeição",
        version: 'v2',
        scripts: scriptUrl,
        
        onLoad: Checkout.utils.throttle(async function () {
            const publicKey = await getPublickKey(urlApp, this.methodConfig.payment_provider_id);
        }),

        onSubmit: async function (callback) {
            let pagarmeItems = Checkout.getData('order.cart.lineItems').map(item => {
                return {
                    amount: parseFloat(item.price),
                    description: item.name,
                    quantity: item.quantity,
                    product_id: item.product_id
                };
            });
        
            let customer = {
                "first_name": Checkout.getData('order.billingAddress.first_name'),
                "last_name": Checkout.getData('order.billingAddress.last_name'),
                "id_number": Checkout.getData('order.billingAddress.id_number'),
                "email": Checkout.getData('order.contact.email'),
                "phone": Checkout.getData('order.billingAddress.phone')
            }
        
            let payment_method_checkout = 'voucher'
            
            let payment = {
                "amount": Checkout.getData('order.cart.prices.total'),
                "shipping": Checkout.getData('order.cart.prices.shipping'),
                "currency": Checkout.getData('order.cart.currency'),
                "success_url": Checkout.getData('callbackUrls.success'),
                "failure_url": Checkout.getData('callbackUrls.failure'),
                "card_brand": ""
            };
        
            const pagarmeOrder = {
                "order_id": Checkout.getData('order.cart.id'),
                "code": Checkout.getData('order.cart.id'),
                "payment_providerId": this.methodConfig.payment_provider_id,
                "items": pagarmeItems,
                "payment": payment,
                "payment_method_checkout": payment_method_checkout,
                "shipping_address": Checkout.getData('order.shippingAddress'),
                "billing_address": Checkout.getData('order.billingAddress'),
                "customer": customer,
                "has_shippable_products": Checkout.getData('order.cart.hasShippableProducts'),
                "shipping_type": Checkout.getData('order.cart.shipping.type')
            }

            const publicKey = await getPublickKey(urlApp, this.methodConfig.payment_provider_id);

            let headers = new Headers();
            headers.append("Accept", "application/json, text/javascript");
            headers.append("Content-Type", "application/json");
        
        
            let cardExpiration = Checkout.getData('form.cardExpiration').split("/");        
            let requestOptions = {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                "type": "card",
                "card": {
                        "number": '4000000000000010',
                        "holder_name": 'TESTE VOUCHER',
                        "holder_document": '13975392754',
                        "exp_month": '12',
                        "exp_year": '30',
                        "cvv": '123'
                    }
                }),
            };
        
            let cardObject = await fetch(`${urlToken}?appId=${publicKey.value}`, requestOptions);
            if (!cardObject.ok) {
                return Checkout.showErrorCode("card_info_invalid");
            }

            cardObject = await cardObject.json();

            pagarmeOrder.card_token = cardObject.id;
            pagarmeOrder.payment.card_brand = cardObject.card.brand;

            return processPaymentRequest(Checkout, pagarmeOrder);
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
