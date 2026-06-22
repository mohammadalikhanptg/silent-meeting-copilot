from __future__ import annotations

from PySide6.QtGui import QFont
from PySide6.QtWidgets import QLabel, QTextEdit, QVBoxLayout, QWidget


class GuidancePanel(QWidget):
    def __init__(self):
        super().__init__()
        layout = QVBoxLayout(self)
        self.title = QLabel("Guidance")
        tf = QFont()
        tf.setPointSize(14)
        tf.setBold(True)
        self.title.setFont(tf)
        self.body = QTextEdit()
        self.body.setReadOnly(True)
        bf = QFont()
        bf.setPointSize(13)
        self.body.setFont(bf)
        layout.addWidget(self.title)
        layout.addWidget(self.body)

    def show_guidance(self, title, lines, note=""):
        self.title.setText(title)
        html = "".join(
            f"<p style='margin:8px 0'>{self._esc(line)}</p>" for line in lines
        )
        if note:
            html += f"<p style='color:#888;margin-top:14px'>{self._esc(note)}</p>"
        self.body.setHtml(html or "<p>(no prepared lines)</p>")

    def clear_guidance(self):
        self.title.setText("Guidance")
        self.body.setHtml("")

    @staticmethod
    def _esc(s):
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
