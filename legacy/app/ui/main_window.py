from __future__ import annotations

from PySide6.QtCore import Qt
from PySide6.QtWidgets import QMainWindow, QSplitter, QVBoxLayout, QWidget

from app.config import settings
from app.context.loader import load_pack
from app.ui.controls import Controls
from app.ui.guidance_panel import GuidancePanel
from app.ui.status_bar import StatusBar
from app.ui.transcript_panel import TranscriptPanel


class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Silent Meeting Copilot")
        self.resize(1100, 720)

        self.pack = load_pack(settings.PACKS_DIR, settings.DEFAULT_PACK)

        central = QWidget()
        self.setCentralWidget(central)
        outer = QVBoxLayout(central)

        split = QSplitter(Qt.Horizontal)
        self.transcript = TranscriptPanel()
        self.guidance = GuidancePanel()
        split.addWidget(self.transcript)
        split.addWidget(self.guidance)
        split.setSizes([550, 550])
        outer.addWidget(split, 1)

        self.controls = Controls()
        outer.addWidget(self.controls)

        self.status = StatusBar()
        self.setStatusBar(self.status)

        self.controls.guidance_requested.connect(self.on_guidance)
        self.controls.reset_requested.connect(self.guidance.clear_guidance)

        self._refresh_status()

        if self.pack.missing:
            self.guidance.show_guidance(
                "Heads up",
                [f"Context pack '{self.pack.name}' is missing: "
                 f"{', '.join(self.pack.missing)}"],
                "The app still works; missing files just reduce available content.",
            )

    def on_guidance(self, key, label):
        lines = self.pack.responses.get(key, [])
        if not lines:
            self.guidance.show_guidance(
                label,
                ["(no prepared lines for this button in the current pack)"],
                f"Add a '## {key}' section to response_bank.md in pack "
                f"'{self.pack.name}'.",
            )
        else:
            self.guidance.show_guidance(label, lines, "Prepared response. No AI used.")

    def _refresh_status(self):
        api = settings.LLM_PROVIDER if settings.llm_configured() else "not used"
        self.status.set_status(
            self.pack.name, "idle (manual)", "off (manual)", api, "off"
        )
