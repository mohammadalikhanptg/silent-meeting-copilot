from __future__ import annotations

from PySide6.QtWidgets import QStatusBar, QLabel


class StatusBar(QStatusBar):
    def __init__(self):
        super().__init__()
        self._label = QLabel()
        self.addWidget(self._label)

    def set_status(self, pack, mic, trans, api, log):
        self._label.setText(
            f"Pack: {pack}    |    Mic: {mic}    |    Transcription: {trans}"
            f"    |    API: {api}    |    Logging: {log}"
        )
