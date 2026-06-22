from __future__ import annotations

from datetime import datetime

from PySide6.QtCore import Signal
from PySide6.QtWidgets import (
    QComboBox, QHBoxLayout, QLabel, QLineEdit, QPushButton, QTextEdit,
    QVBoxLayout, QWidget,
)

COLORS = {"ME": "#2563eb", "OTHERS": "#b45309", "NOTE": "#6b7280"}


class TranscriptPanel(QWidget):
    line_added = Signal(str, str)  # source, text

    def __init__(self):
        super().__init__()
        layout = QVBoxLayout(self)
        layout.addWidget(QLabel("Transcript"))
        self.view = QTextEdit()
        self.view.setReadOnly(True)
        layout.addWidget(self.view)

        row = QHBoxLayout()
        self.source = QComboBox()
        self.source.addItems(["ME", "OTHERS", "NOTE"])
        self.input = QLineEdit()
        self.input.setPlaceholderText("Type what was said, or a note, then press Enter")
        self.add_btn = QPushButton("Add")
        row.addWidget(self.source)
        row.addWidget(self.input, 1)
        row.addWidget(self.add_btn)
        layout.addLayout(row)

        self.add_btn.clicked.connect(self._add)
        self.input.returnPressed.connect(self._add)

    def _add(self):
        text = self.input.text().strip()
        if not text:
            return
        src = self.source.currentText()
        self.append_line(src, text)
        self.input.clear()
        self.line_added.emit(src, text)

    def append_line(self, source, text):
        ts = datetime.now().strftime("%H:%M:%S")
        color = COLORS.get(source, "#111111")
        self.view.append(
            f"<span style='color:#9ca3af'>[{ts}]</span> "
            f"<b style='color:{color}'>{source}</b>: {self._esc(text)}"
        )

    @staticmethod
    def _esc(s):
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
