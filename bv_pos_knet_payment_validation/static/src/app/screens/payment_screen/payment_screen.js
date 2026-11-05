/** @odoo-module **/

import { _t } from "@web/core/l10n/translation";
import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";
import { patch } from "@web/core/utils/patch";
import { AlertDialog } from "@web/core/confirmation_dialog/confirmation_dialog";

patch(PaymentScreen.prototype, {
    /**
     * Check if a payment method is a Bank journal payment method (e.g. K-NET).
     */
    _isBankPaymentMethod(paymentMethod) {
        if (!paymentMethod) {
            return false;
        }
        return (
            paymentMethod.type === "bank" ||
            (paymentMethod.journal_id && paymentMethod.journal_id.type === "bank")
        );
    },

    /**
     * Check if a payment method is Cash.
     */
    _isCashPaymentMethod(paymentMethod) {
        if (!paymentMethod) {
            return false;
        }
        return (
            paymentMethod.type === "cash" ||
            (paymentMethod.journal_id && paymentMethod.journal_id.type === "cash")
        );
    },

    /**
     * Calculate the maximum allowed amount for a specific Bank payment line.
     * Takes into account invoice total, other non-cash payments, and cash change.
     * Cash overpayments (which generate cash change) do NOT restrict Bank payments.
     */
    _getMaxAllowedAmountForLine(line) {
        const order = this.currentOrder;
        if (!order) {
            return 0;
        }

        const orderTotal = Math.abs(order.get_total_with_tax() || 0);
        const payments = order.payment_ids || [];

        // Sum of all other non-cash payments (other bank lines, customer account)
        let otherNonCash = 0;
        for (const p of payments) {
            if (p !== line && !p.is_change) {
                if (!this._isCashPaymentMethod(p.payment_method_id)) {
                    otherNonCash += Math.abs(p.get_amount() || 0);
                }
            }
        }

        // Available invoice balance after non-cash payments
        const availableTotal = Math.max(0, orderTotal - otherNonCash);

        // Sum of cash payments
        let cashPaid = 0;
        for (const p of payments) {
            if (!p.is_change && this._isCashPaymentMethod(p.payment_method_id)) {
                cashPaid += Math.abs(p.get_amount() || 0);
            }
        }

        const change = Math.abs(order.get_change() || 0);
        const decimals = this.pos.currency.decimal_places || 3;
        const epsilon = Math.pow(10, -decimals) / 2;

        // If cash was paid without change (partial exact cash payment)
        if (cashPaid > 0 && change < epsilon && cashPaid < availableTotal) {
            return Math.max(0, availableTotal - cashPaid);
        }

        // If cash has change or covers the remainder, cash does not limit K-NET
        return availableTotal;
    },

    /**
     * Show validation error dialog safely avoiding multiple stacked popups.
     */
    _showKnetValidationError(maxAllowed) {
        if (this._knetValidationDialogOpen) {
            return;
        }
        this._knetValidationDialogOpen = true;
        const formattedMax = this.env.utils.formatCurrency(maxAllowed);
        this.dialog.add(
            AlertDialog,
            {
                title: _t("Payment Validation Error"),
                body: _t(
                    "Entered KNET amount cannot exceed the invoice outstanding amount.\nPlease enter an amount equal to or less than %s.",
                    formattedMax
                ),
            },
            {
                onClose: () => {
                    this._knetValidationDialogOpen = false;
                },
            }
        );
    },

    /**
     * Intercept amount input from numpad on the PaymentScreen.
     * If entering an amount on a Bank (K-NET) payment method exceeds the
     * invoice outstanding amount:
     * - Cap the line amount to maxAllowed.
     * - Reset the numberBuffer so the cashier can immediately type another value.
     * - Show the validation alert dialog.
     */
    updateSelectedPaymentline(amount = false) {
        const line = this.selectedPaymentLine;
        if (line && this._isBankPaymentMethod(line.payment_method_id)) {
            let inputAmount = amount;
            if (inputAmount === false) {
                if (this.numberBuffer.get() === null) {
                    inputAmount = null;
                } else if (this.numberBuffer.get() === "") {
                    inputAmount = 0;
                } else {
                    inputAmount = this.numberBuffer.getFloat();
                }
            }

            if (inputAmount !== null) {
                const maxAllowed = this._getMaxAllowedAmountForLine(line);
                const decimals = this.pos.currency.decimal_places || 3;
                const epsilon = Math.pow(10, -decimals) / 2;
                const absInputAmount = Math.abs(inputAmount);

                if (absInputAmount - maxAllowed > epsilon) {
                    const orderSign =
                        this.currentOrder.taxTotals && this.currentOrder.taxTotals.order_sign
                            ? this.currentOrder.taxTotals.order_sign
                            : 1;
                    const cappedAmount = orderSign >= 0 ? maxAllowed : -maxAllowed;

                    // Set line amount to maximum allowed
                    line.set_amount(cappedAmount);

                    // Reset buffer so the cashier can immediately type a new number
                    // without old digits sticking in the buffer
                    this.numberBuffer.reset();

                    // Show error popup
                    this._showKnetValidationError(maxAllowed);
                    return;
                }
            }
        }

        return super.updateSelectedPaymentline(...arguments);
    },

    /**
     * Validate K-NET amounts before validating the order.
     * Runs before bv_loyalty_extension's reference prompt to ensure
     * cashiers are not prompted for reference numbers on overpaid lines.
     */
    async validateOrder(isForceValidate) {
        const order = this.currentOrder;
        if (order && order.payment_ids) {
            const bankLines = order.payment_ids.filter((p) =>
                this._isBankPaymentMethod(p.payment_method_id)
            );

            for (const line of bankLines) {
                const maxAllowed = this._getMaxAllowedAmountForLine(line);
                const decimals = this.pos.currency.decimal_places || 3;
                const epsilon = Math.pow(10, -decimals) / 2;
                const lineAmount = Math.abs(line.amount || 0);

                if (lineAmount - maxAllowed > epsilon) {
                    this._showKnetValidationError(maxAllowed);
                    return false;
                }
            }
        }

        return await super.validateOrder(...arguments);
    },

    /**
     * Additional safety check during _isOrderValid.
     */
    async _isOrderValid(isForceValidate) {
        const order = this.currentOrder;
        if (order && order.payment_ids) {
            const bankLines = order.payment_ids.filter((p) =>
                this._isBankPaymentMethod(p.payment_method_id)
            );

            for (const line of bankLines) {
                const maxAllowed = this._getMaxAllowedAmountForLine(line);
                const decimals = this.pos.currency.decimal_places || 3;
                const epsilon = Math.pow(10, -decimals) / 2;
                const lineAmount = Math.abs(line.amount || 0);

                if (lineAmount - maxAllowed > epsilon) {
                    this._showKnetValidationError(maxAllowed);
                    return false;
                }
            }
        }

        return await super._isOrderValid(...arguments);
    },
});
