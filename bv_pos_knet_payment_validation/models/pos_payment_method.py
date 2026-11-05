# -*- coding: utf-8 -*-
from odoo import models, api


class PosPaymentMethod(models.Model):
    _inherit = "pos.payment.method"

    @api.model
    def _load_pos_data_fields(self, config_id):
        fields = super()._load_pos_data_fields(config_id)
        for field_name in ["type", "journal_id"]:
            if field_name not in fields:
                fields.append(field_name)
        return fields

