LoadCheckoutPaymentContext(function (Checkout, PaymentOptions) {

    async function ensureTokenizeScriptLoaded(publicAppId) {
      const src = "https://checkout.mundipagg.com/v1/tokenizecard.js";
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) return;
    
      await new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = src;
        s.async = true;
        s.setAttribute("data-pagarmecheckout-app-id", publicAppId);
        s.onload = resolve;
        s.onerror = () => reject(new Error("Falha ao carregar tokenizecard.js"));
        document.head.appendChild(s);
      });
    }
    
    let urlApp = "https://nuvemshop-app.mundipagg.com"; // NOSONAR
    let urlToken = "https://api.mundipagg.com/core/v1/tokens"; // NOSONAR

    var installments = null;
    let currentCheckoutTotalPrice = Checkout.getData('order.cart.prices.total');

    //if (typeof document.currentScript != "undefined") {
    //    urlApp = document.currentScript.src.replace("/assets/pagarme.js", "");
    //}

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
    
    const PagarmeVoucherPayment = new PaymentOptions.ModalPayment({
        id: "pagarme_payment_voucher",
        name: "Vale alimentação ou refeição",
        version: 'v2',
        scripts: scriptUrl,
        
        onLoad: Checkout.utils.throttle(async function () {
            const publicKey = await getPublickKey(urlApp, this.methodConfig.payment_provider_id);
            await ensureTokenizeScriptLoaded(publicKey.value);
            
            document.querySelector('.payment-option-content').innerHTML = '<div><input type="text" name="card-exp-month" data-pagarmecheckout-element="exp_month"> <input type="text" name="card-exp-year" data-pagarmecheckout-element="exp_year"></div><div class="checkout-method"><div class="input-creditcard"><div class="form-group"><div class="has-float-label"><input class="form-control inspectletIgnore" autocomplete="cc-number" autocapitalize="on" placeholder=" " id="payment.creditCard.cardNumber" name="payment.creditCard.cardNumber" type="tel" aria-labelledby="label_payment.creditCard.cardNumber" value="" data-pagarmecheckout-element="number"><label class="input-label" id="label_payment.creditCard.cardNumber" for="payment.creditCard.cardNumber">Número do cartão</label></div></div></div><div class="row third-gutters"><div class="form-group col-12 col-sm-6 col-md-5"><div class="has-float-label"><input class="form-control inspectletIgnore" autocomplete="cc-name" autocapitalize="on" placeholder=" " id="payment.creditCard.cardHolderName" name="payment.creditCard.cardHolderName" type="text" aria-labelledby="label_payment.creditCard.cardHolderName" value="" data-pagarmecheckout-element="holder_name"><label class="input-label" id="label_payment.creditCard.cardHolderName" for="payment.creditCard.cardHolderName">Nome impresso no cartão</label></div></div><div class="form-group col-7 col-sm-3 col-md-4"><div class="has-float-label"><input class="form-control inspectletIgnore" autocomplete="cc-exp" autocapitalize="on" placeholder=" " id="payment.creditCard.cardExpiration" name="payment.creditCard.cardExpiration" type="tel" aria-labelledby="label_payment.creditCard.cardExpiration" value=""><label class="input-label" id="label_payment.creditCard.cardExpiration" for="payment.creditCard.cardExpiration">Vencimento (MM/AA)</label></div></div><div class="form-group col-5 col-sm-3 col-md-3"><div class="has-float-label has-input-icon"><input class="form-control inspectletIgnore" autocomplete="cc-csc" autocapitalize="on" placeholder=" " id="payment.creditCard.cardCvv" name="payment.creditCard.cardCvv" type="tel" aria-labelledby="label_payment.creditCard.cardCvv" value="" data-pagarmecheckout-element="cvv"><label class="input-label" id="label_payment.creditCard.cardCvv" for="payment.creditCard.cardCvv">CVV</label><div class="icon-inside-input"><div class="tooltip"><div class="tooltip-message on-left position-left "><div class="cvv-tooltip"><div>CVV (Código de Segurança) é o número de 3 ou 4 dígitos na parte de trás do seu cartão.</div><div><img alt="CVV (Código de Segurança) é o número de 3 ou 4 dígitos na parte de trás do seu cartão." src="/img/card_cvv_code.svg" width="100px"></div></div></div><svg class="tooltip-icon" width="16px" height="16px" viewBox="0 0 1024 1024"><path d="M513,98.2C283.9,98.2,98.2,283.9,98.2,513c0,229.1,185.7,414.8,414.8,414.8c229.1,0,414.8-185.7,414.8-414.8 C927.8,283.9,742.1,98.2,513,98.2z M6,513C6,233,233,6,513,6c280,0,507,227,507,507c0,280-227,507-507,507C233,1020,6,793,6,513z M524.9,329.8c-21.5-3.7-43.5,0.4-62.3,11.4c-18.8,11-33,28.3-40.3,48.9c-8.4,24-34.8,36.6-58.8,28.2c-24-8.4-36.6-34.8-28.2-58.8	c14.4-41.1,43-75.7,80.5-97.8c37.5-22.1,81.7-30.1,124.6-22.8c42.9,7.4,81.8,29.7,109.9,63c28,33.3,43.4,75.4,43.3,119 c0,49.3-26,87-52.8,112.7c-26.8,25.7-58.6,43.5-81.1,54.3c-1.8,0.9-3.1,2.1-3.8,3.1c-0.3,0.5-0.5,0.9-0.5,1.1 c-0.1,0.2-0.1,0.2-0.1,0.2v12.9c0,25.5-20.6,46.1-46.1,46.1c-25.5,0-46.1-20.6-46.1-46.1v-12.9c0-40.1,25.3-72.5,56.8-87.6 c18.3-8.8,40.3-21.6,57.1-37.7c16.8-16.1,24.4-31.4,24.4-46.2v-0.1c0-21.8-7.6-42.8-21.7-59.5C565.8,344.6,546.4,333.4,524.9,329.8z M559.1,743.5c0,25.5-20.6,46.1-46.1,46.1c-25.5,0-46.1-20.6-46.1-46.1s20.6-46.1,46.1-46.1C538.5,697.4,559.1,718,559.1,743.5z"></path></svg></div></div></div></div></div><div class="row third-gutters"><div class="form-group col-12 col-sm-3 col-md-3"><div class="has-float-label select-container"><select id="payment.creditCard.cardHolderIdType" name="payment.creditCard.cardHolderIdType" class="form-control form-control-select inspectletIgnore"><option code="CPF" name="CPF/CNPJ" value="CPF">CPF/CNPJ</option></select><label class="select-label" for="payment.creditCard.cardHolderIdType">Documento</label><div class="select-icon"><svg class="svg" width="14px" height="14px" viewBox="0 0 1024 1024"><path d="M455.9,816.9L25.1,386.2c-29.8-29.8-29.8-77.9,0-107.4l71.6-71.6c29.8-29.8,77.9-29.8,107.4,0l305.3,305.3l305.3-305.3 c29.8-29.8,77.9-29.8,107.4,0l72.2,71.3c29.8,29.8,29.8,77.9,0,107.4L563.5,816.6C533.8,846.7,485.6,846.7,455.9,816.9z"></path></svg></div></div></div><div class="form-group col-12 col-sm-9 col-md-9"><div class="has-float-label"><input class="form-control inspectletIgnore" autocomplete="card_holder_id_number" autocapitalize="on" placeholder=" " id="payment.creditCard.cardHolderIdNumber" name="payment.creditCard.cardHolderIdNumber" type="tel" aria-labelledby="label_payment.creditCard.cardHolderIdNumber" value="13975392754"><label class="input-label" id="label_payment.creditCard.cardHolderIdNumber" for="payment.creditCard.cardHolderIdNumber">CPF/CNPJ do portador do cartão</label></div></div></div><p class="m-bottom-half m-top-half"><span>Cartões aceitos por <strong>Pagar.me</strong>:</span></p><div class="payment-brands-polish payment-brands-credit-spacing" id="payment-brands-container"><img alt="visa" src="/img/brands/visa.svg"><img alt="mastercard" src="/img/brands/mastercard.svg"><img alt="elo" src="/img/brands/elo.svg"><img alt="hipercard" src="/img/brands/hipercard.svg"><img alt="diners" src="/img/brands/diners.svg"><img alt="discover" src="/img/brands/discover.svg"><img alt="amex" src="/img/brands/amex.svg"></div></div>'
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
