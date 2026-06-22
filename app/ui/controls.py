from __future__ import annotations

from PySide6.QtCore import Signal
from PySide6.QtWidgets import QGridLayout, QPushButton, QWidget

BUTTONS = [
    ("Stay on agenda", "stay_on_agenda"),
    ("Ask for written proposal", "ask_for_written_proposal"),
    ("House / property issue", "house_property_issue"),
    ("Business ownership claim", "business_ownership_claim"),
    ("Financial claim", "financial_claim"),
    ("Allegation response", "allegation_response"),
    ("Shouting / boundary", "shouting_boundary"),
    ("Staff vs partner contradiction", "staff_partner_contradiction"),
    ("Legal / solicitor route", "legal_solicitor_route"),
]


class Controls(QWidget):
    guidance_requested = Signal(str, str)  # key, label
    reset_requested = Signal()

    def __init__(self):
        super().__init__()
        grid = QGridLayout(self)
        cols = 3
        for i, (label, key) in enumerate(BUTTONS):
            btn = QPushButton(label)
            btn.setMinimumHeight(46)
            btn.clicked.connect(
                lambda _=False, k=key, l=label: self.guidance_requested.emit(k, l)
            )
            grid.addWidget(btn, i // cols, i % cols)
        reset = QPushButton("Reset guidance")
        reset.setMinimumHeight(46)
        reset.clicked.connect(lambda: self.reset_requested.emit())
        grid.addWidget(reset, (len(BUTTONS) // cols) + 1, 0, 1, cols)
