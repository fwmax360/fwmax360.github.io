"""Deprecated wrapper — regenerates from assets/miku-run-src.png."""

from pathlib import Path
import runpy

runpy.run_path(str(Path(__file__).with_name("convert-miku-run.py")), run_name="__main__")
