# -*- coding: utf-8 -*-
from odoo import models, api, _
from odoo.exceptions import ValidationError
from odoo.tools import float_compare, float_is_zero, formatLang


class PosPayment(models.Model):
    _inherit = "pos.payment"

    @api.constrains("amount", "payment_method_id")
    def _check_knet_payment_amount(self):
        for payment in self:
            if payment.is_change:
                continue

            payment_method = payment.payment_method_id
            is_bank = payment_method.type == "bank" or (
                payment_method.journal_id and payment_method.journal_id.type == "bank"
            )
            if not is_bank:
                continue

            order = payment.pos_order_id
            if not order:
                continue

            order_total = abs(order.amount_total)
            prec = order.currency_id.decimal_places or 3

            # Calculate other non-cash payments (other bank lines, customer account)
            other_non_cash = sum(
                abs(p.amount)
                for p in order.payment_ids
                if p != payment
                and not p.is_change
                and (
                    p.payment_method_id.type != "cash"
                    and (
                        not p.payment_method_id.journal_id
                        or p.payment_method_id.journal_id.type != "cash"
                    )
                )
            )

            available_total = max(0.0, order_total - other_non_cash)

            # Calculate cash payments
            cash_paid = sum(
                abs(p.amount)
                for p in order.payment_ids
                if not p.is_change
                and (
                    p.payment_method_id.type == "cash"
                    or (
                        p.payment_method_id.journal_id
                        and p.payment_method_id.journal_id.type == "cash"
                    )
                )
            )

            # Cash change
            change = sum(
                abs(p.amount)
                for p in order.payment_ids
                if p.is_change
            )

            # If cash was paid without change (exact partial cash)
            if cash_paid > 0 and float_is_zero(change, precision_digits=prec) and cash_paid < available_total:
                max_allowed = max(0.0, available_total - cash_paid)
            else:
                max_allowed = available_total

            payment_amount = abs(payment.amount)
            if float_compare(payment_amount, max_allowed, precision_digits=prec) > 0:
                formatted_max = formatLang(
                    self.env,
                    max_allowed if order.amount_total >= 0 else -max_allowed,
                    currency_obj=order.currency_id,
                )
                raise ValidationError(
                    _(
                        "Entered KNET amount cannot exceed the invoice outstanding amount.\n"
                        "Please enter an amount equal to or less than %s."
                    )
                    % formatted_max
                )
