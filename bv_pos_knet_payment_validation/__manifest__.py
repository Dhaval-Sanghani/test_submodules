# -*- coding: utf-8 -*-
{
    "name": "BV POS K-NET Payment Validation",
    "summary": "Validate K-NET / Bank payment amount against invoice outstanding amount in Point of Sale",
    "description": """
        Functional Specification Document (FSD) – Knet Payments
        - Validates K-NET (Bank journal) payment amount before transaction processing.
        - Prevents users from entering an amount exceeding the invoice outstanding balance.
        - Automatically resets entered amount back to maximum allowed amount on overpayment attempt.
        - Displays validation popup error to cashier.
        - Allows partial and exact invoice payments.
        - Enforces backend validation on Point of Sale payments.
    """,
    "version": "18.0.1.0.0",
    "category": "Point of Sale",
    "author": "Brainvire Infotech Inc",
    "company": "Brainvire Infotech Inc",
    "maintainer": "Brainvire Infotech Inc",
    "website": "https://www.brainvire.com",
    "depends": [
        "point_of_sale",
        "bv_pos_extended",
        "bv_loyalty_extension",
    ],
    "data": [],
    "assets": {
        "point_of_sale._assets_pos": [
            "bv_pos_knet_payment_validation/static/src/app/screens/payment_screen/payment_screen.js",
        ],
    },
    "license": "LGPL-3",
    "installable": True,
    "application": False,
}

