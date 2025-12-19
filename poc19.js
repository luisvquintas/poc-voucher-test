LoadCheckoutPaymentContext(function (Checkout, PaymentOptions) {

    // Função para carregar o CSS e JS da biblioteca via CDN
    function loadStoneVoucherModal(callback) {
        // Carregar CSS
        var css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = 'https://cdn.jsdelivr.net/gh/luisvquintas/stone-voucher-modal-poc@main/dist/frontend.css';
        document.head.appendChild(css);

        // Carregar JS
        var script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/gh/luisvquintas/stone-voucher-modal-poc@main/dist/stone-voucher-modal.umd.js';
        script.onload = function () {
            if (callback) callback();
        };
        document.body.appendChild(script);
    }

    // let urlApp = "https://nuvemshop-app.mundipagg.com"; // NOSONAR
    // let urlToken = "https://api.mundipagg.com/core/v1/tokens"; // NOSONAR
    // let env = "production";


    let urlApp = "https://nuvemshop.app.stg.pagar.me"; // NOSONAR
    let urlToken = "https://stgapi.mundipagg.com/core/v5/tokens"; // NOSONAR
    let env = "staging";

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
            // Carregar a biblioteca StoneVoucherModal
            loadStoneVoucherModal();
        }),

        onSubmit: async function (callback) {
            try {
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

                window.StoneVoucherModal.open({
                    amount: Checkout.getData('totalPrice'),
                    currency: 'BRL',
                    voucherTypes: ['alimentação', 'refeição'],
                    voucherBrands: ['pluxee', 'vr', 'alelo', 'ticket'],
                    publicKey: publicKey.value,  // Public Key dinâmica da Pagar.me
                    env,               // Usar 'production' em produção

                    onSuccess: function (data) {
                        console.log('Token gerado:', data.card_token);
                        console.log('Bandeira:', data.card_brand);

                        pagarmeOrder.card_token = data.card_token;
                        pagarmeOrder.payment.card_brand = data.card_brand;

                        return processPaymentRequest(Checkout, pagarmeOrder);
                    },

                    onError: function (error) {
                        console.error('Erro:', error.error);
                        return Checkout.showErrorCode("card_info_invalid");
                    },

                    onClose: function () {
                        console.log('Modal fechado');
                        // Usuário fechou sem completar
                    }
                });


            } catch (e) {
                console.error('Erro no voucher:', e);
                return Checkout.showErrorCode("unknown_error");
            }
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
